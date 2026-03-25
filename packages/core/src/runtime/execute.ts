import type { Pool } from "pg";
import type { RelayConfig } from "../types/config.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { NormalizedEvent } from "../types/event.js";
import type { RelayOSSignal } from "./internals.js";
import { ExecutionStatus } from "../types/event.js";
import {
  findExecutionById,
  updateExecutionStatus,
} from "../persistence/executions.repo.js";
import { findEventById } from "../persistence/events.repo.js";
import { createContext } from "../context/create-context.js";
import { resolveHandler } from "../plugins/resolve-handler.js";
import { scheduleRetry } from "../retry/scheduler.js";

/**
 * Core execution runner — stages 7-11 of the engine pipeline.
 *
 * Extracted from engine.ts so it can be shared with retry-poller.ts
 * without creating circular imports.
 */
export async function runExecution(
  pool: Pool,
  schema: string,
  config: RelayConfig,
  registry: PluginRegistry,
  executionId: string,
  emitSignal: (signal: RelayOSSignal) => void,
): Promise<void> {
  const execution = await findExecutionById(pool, schema, executionId);
  if (!execution) return;

  const dbEvent = await findEventById(pool, schema, execution.event_id);
  if (!dbEvent) return;

  // Stage 7 — mark running
  const runningExecution = await updateExecutionStatus(
    pool,
    schema,
    executionId,
    ExecutionStatus.Running,
    { startedAt: new Date() },
  );
  emitSignal({ type: "execution_started", executionId, eventId: dbEvent.id });

  // Resolve handler via plugin
  const plugin = registry.get(dbEvent.provider);
  if (!plugin) {
    await updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Failed, {
      finishedAt: new Date(),
      errorMessage: `No plugin registered for provider "${dbEvent.provider}"`,
    });
    return;
  }

  const handler = resolveHandler(plugin, dbEvent.event_name);

  // No handler registered → complete as no-op (not a failure)
  if (!handler) {
    await updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Completed, {
      finishedAt: new Date(),
    });
    return;
  }

  // Build the normalised event shape from the DB row
  const normalizedEvent: NormalizedEvent = {
    id: dbEvent.id,
    provider: dbEvent.provider,
    eventName: dbEvent.event_name,
    externalEventId: dbEvent.external_event_id,
    payload: dbEvent.payload,
    rawPayload: dbEvent.raw_payload,
    headers: dbEvent.headers as Record<string, string>,
    receivedAt: dbEvent.received_at,
    createdAt: dbEvent.created_at,
  };

  const ctx = createContext(pool, schema, runningExecution, normalizedEvent, emitSignal);

  // Stage 8 — invoke handler; steps are checkpointed inside ctx.step()
  try {
    await handler(ctx);

    // Stage 9 — success
    await updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Completed, {
      finishedAt: new Date(),
    });
    emitSignal({ type: "execution_completed", executionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Stage 10 — failure
    await updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Failed, {
      finishedAt: new Date(),
      errorMessage: message,
    });
    emitSignal({ type: "execution_failed", executionId, errorMessage: message });

    // Stage 11 — retry scheduling
    await scheduleRetry(pool, schema, runningExecution, config.retry, emitSignal);
  }
}
