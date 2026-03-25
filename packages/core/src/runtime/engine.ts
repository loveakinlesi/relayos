import type { Pool } from "pg";
import type { RelayConfig } from "../types/config.js";
import type { PluginRegistry } from "../plugins/registry.js";
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

  async function processEvent(webhook: IncomingWebhook): Promise<void> {
    const { provider, rawBody, headers } = webhook;

    // Stage 2 — plugin verification (fail fast, no persistence)
    const plugin = registry.get(provider);
    if (!plugin) {
      throw new PluginNotFoundError(provider);
    }

    await plugin.verify(rawBody, headers);

    // Stage 3 — event normalization
    const rawEvent = await plugin.normalize(rawBody, headers);

    // Stage 4 — event persistence (idempotency enforced by DB constraint)
    const dbEvent = await insertEvent(pool, schema, {
      provider: rawEvent.provider,
      eventName: rawEvent.eventName,
      externalEventId: rawEvent.externalEventId,
      payload: rawEvent.payload,
      rawPayload: rawEvent.rawPayload,
      headers,
    });

    // Stage 5 — execution creation
    const execution = await createExecution(pool, schema, dbEvent.id);

    // Stage 6 — queue scheduling
    queue.enqueue(() => runExecution(execution.id));
  }

  return { processEvent };
}
