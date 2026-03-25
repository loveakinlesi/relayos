import type { Pool } from "pg";
import type { RelayConfig } from "../types/config.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { RawNormalizedEvent } from "../types/event.js";
import type { ConcurrencyQueue } from "./queue.js";
import { insertEvent } from "../persistence/events.repo.js";
import { createExecution } from "../persistence/executions.repo.js";
import { PluginNotFoundError } from "../errors/index.js";

export type IncomingWebhook = {
  /** Identifies which plugin should handle this request. */
  provider: string;
  rawBody: Buffer;
  headers: Record<string, string>;
};

function isIncomingWebhook(input: IncomingWebhook | RawNormalizedEvent): input is IncomingWebhook {
  return "rawBody" in input;
}

/**
 * Creates the processEvent function that drives the full engine pipeline
 * (stages 1-6). Stages 7-11 are handled by runExecution() inside the queue.
 */
export function createEngine(
  pool: Pool,
  config: RelayConfig,
  registry: PluginRegistry,
  queue: ConcurrencyQueue,
  runExecution: (executionId: string) => Promise<void>,
) {
  const schema = config.database.schema;

  async function ingestNormalizedEvent(rawEvent: RawNormalizedEvent): Promise<{
    eventId: string;
    deduplicated: boolean;
  }> {
    const persisted = await insertEvent(pool, schema, {
      provider: rawEvent.provider,
      eventName: rawEvent.eventName,
      externalEventId: rawEvent.externalEventId,
      payload: rawEvent.payload,
      rawPayload: rawEvent.rawPayload,
      headers: rawEvent.headers,
    });

    if (!persisted.inserted) {
      return {
        eventId: persisted.event.id,
        deduplicated: true,
      };
    }

    const execution = await createExecution(pool, schema, persisted.event.id);
    queue.enqueue(() => runExecution(execution.id));

    return {
      eventId: persisted.event.id,
      deduplicated: false,
    };
  }

  async function processEvent(
    input: IncomingWebhook | RawNormalizedEvent,
  ): Promise<string> {
    if (!isIncomingWebhook(input)) {
      const result = await ingestNormalizedEvent(input);
      return result.eventId;
    }

    const { provider, rawBody, headers } = input;

    // Stage 2 — plugin verification (fail fast, no persistence)
    const plugin = registry.get(provider);
    if (!plugin) {
      throw new PluginNotFoundError(provider);
    }

    await plugin.verify(rawBody, headers);

    // Stage 3 — event normalization
    const rawEvent = await plugin.normalize(rawBody, headers);
    const result = await ingestNormalizedEvent({
      ...rawEvent,
      headers,
    });
    return result.eventId;
  }

  return { processEvent, ingestNormalizedEvent };
}
