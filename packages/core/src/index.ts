import type { Pool } from "pg";
import { RelayConfigSchema } from "./types/config.js";
import { createPool } from "./persistence/client.js";
import { ConcurrencyQueue } from "./runtime/queue.js";
import { PluginRegistry } from "./plugins/registry.js";
import { createEngine } from "./runtime/engine.js";
import { createRetryPoller } from "./runtime/retry-poller.js";
import { runExecution } from "./runtime/execute.js";
import {
  getRelayOSInternals,
  relayosInternals,
  type RelayOSSignal,
  type RelayOSSignalListener,
} from "./runtime/internals.js";
import type { RelayPlugin } from "./types/plugin.js";
import type { RawNormalizedEvent } from "./types/event.js";
import type { IncomingWebhook } from "./runtime/engine.js";
import { replayEvent } from "./replay/replay.js";
import { resumeFailedExecution } from "./replay/resume.js";
import {
  findExecutionById,
  findExecutionsByStatus,
  updateExecutionStatus,
} from "./persistence/executions.repo.js";
import { findStepsByExecution } from "./persistence/steps.repo.js";
import { ExecutionStatus } from "./types/event.js";

export type RelayEventIngestResult = {
  eventId: string;
  deduplicated: boolean;
};

export type RelayProgress = {
  execution: NonNullable<Awaited<ReturnType<typeof findExecutionById>>>;
  completedSteps: string[];
  pendingSteps: string[];
  attemptCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type RelayOS = {
  start(): Promise<void>;
  processEvent(input: IncomingWebhook | RawNormalizedEvent): Promise<string>;
  ingestEvent(event: RawNormalizedEvent): Promise<RelayEventIngestResult>;
  replay(eventId: string): Promise<void>;
  resume(executionId: string): Promise<void>;
  progress(executionId: string): Promise<RelayProgress>;
  getPlugin(provider: string): RelayPlugin | undefined;
  subscribe(listener: RelayOSSignalListener): () => void;
  shutdown(): Promise<void>;
};

/**
 * Initialises the RelayOS runtime.
 *
 * - Validates config with zod (fails fast on misconfiguration).
 * - Creates the Postgres connection pool.
 * - Registers provider plugins.
 * - Starts the in-memory execution queue.
 * - Leaves background retry polling stopped until start() is called.
 */
export function createRelayOS(
  rawConfig: unknown,
  legacyPlugins?: RelayPlugin[],
): RelayOS {
  const normalizedInput =
    rawConfig && typeof rawConfig === "object" && "plugins" in (rawConfig as Record<string, unknown>)
      ? rawConfig
      : { ...(rawConfig as Record<string, unknown>), plugins: legacyPlugins ?? [] };

  const configInput = normalizedInput as Record<string, unknown> & {
    plugins?: RelayPlugin[];
    database?: { pool?: Pool; connectionString?: string; schema?: string };
  };

  const config = RelayConfigSchema.parse({
    ...configInput,
    database: {
      ...configInput.database,
      connectionString: configInput.database?.connectionString,
    },
  });
  const schema = config.database.schema;
  const plugins = configInput.plugins ?? legacyPlugins ?? [];

  const pool: Pool = configInput.database?.pool ?? createPool(config.database.connectionString!);
  const registry = new PluginRegistry();
  const listeners = new Set<RelayOSSignalListener>();

  for (const plugin of plugins) {
    registry.register(plugin);
  }

  const queue = new ConcurrencyQueue(config.concurrency.maxConcurrent);
  const emitSignal = (signal: RelayOSSignal): void => {
    for (const listener of listeners) {
      listener(signal);
    }
  };

  const executeTask = (executionId: string) =>
    runExecution(pool, schema, config, registry, executionId, emitSignal);

  const { processEvent, ingestNormalizedEvent } = createEngine(
    pool,
    config,
    registry,
    queue,
    executeTask,
  );

  const poller = createRetryPoller(
    pool,
    schema,
    queue,
    executeTask,
    config.retryPollIntervalMs,
  );
  let started = false;

  const recoverRunningExecutions = async (): Promise<void> => {
    const recoverable = await findExecutionsByStatus(pool, schema, [
      ExecutionStatus.Running,
      ExecutionStatus.Retrying,
    ]);

    for (const execution of recoverable) {
      await updateExecutionStatus(pool, schema, execution.id, ExecutionStatus.Pending);
      queue.enqueue(() => executeTask(execution.id));
    }
  };

  const runtime: RelayOS = {
    async start(): Promise<void> {
      if (started) {
        return;
      }

      await recoverRunningExecutions();
      await poller.start();
      started = true;
    },

    processEvent,

    async ingestEvent(event): Promise<RelayEventIngestResult> {
      return ingestNormalizedEvent(event);
    },

    replay(eventId: string): Promise<void> {
      return replayEvent(runtime, eventId);
    },

    resume(executionId: string): Promise<void> {
      return resumeFailedExecution(runtime, executionId);
    },

    async progress(executionId: string): Promise<RelayProgress> {
      const execution = await findExecutionById(pool, schema, executionId);
      if (!execution) {
        throw new Error(`Execution "${executionId}" not found`);
      }

      const steps = await findStepsByExecution(pool, schema, executionId);

      return {
        execution,
        completedSteps: steps
          .filter((step) => step.status === "completed")
          .map((step) => step.step_name),
        pendingSteps: steps
          .filter((step) => step.status !== "completed")
          .map((step) => step.step_name),
        attemptCount: execution.attempt,
        startedAt: execution.started_at,
        finishedAt: execution.finished_at,
      };
    },

    getPlugin(provider: string): RelayPlugin | undefined {
      return registry.get(provider);
    },

    subscribe(listener: RelayOSSignalListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async shutdown(): Promise<void> {
      poller.stop();
      started = false;

      if (!configInput.database?.pool) {
        await pool.end();
      }
    },
  };

  Object.defineProperty(runtime, relayosInternals, {
    value: {
      pool,
      config,
      schema,
      registry,
      queue,
      executeTask,
      stopRetryPoller: () => poller.stop(),
      startRetryPoller: () => poller.start(),
      emitSignal,
      subscribe: (listener: RelayOSSignalListener) => runtime.subscribe(listener),
      started,
      setStarted: (value: boolean) => {
        started = value;
      },
      recoverRunningExecutions,
      ingestNormalizedEvent,
    },
  });

  return runtime;
}

export type { RelayPlugin } from "./types/plugin.js";
export type { RelayConfig, RetryPolicy, ConcurrencyConfig } from "./types/config.js";
export type { ExecutionContext, LogLevel } from "./types/context.js";
export type { NormalizedEvent, RawNormalizedEvent } from "./types/event.js";
export type { IncomingWebhook } from "./runtime/engine.js";
export { ExecutionStatus, StepStatus } from "./types/event.js";
export type { RelayOSSignal, RelayOSSignalListener } from "./runtime/internals.js";
