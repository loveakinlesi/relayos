import type { Pool } from "pg";
import { RelayConfigSchema } from "./types/config.js";
import { createPool } from "./persistence/client.js";
import { ConcurrencyQueue } from "./runtime/queue.js";
import { PluginRegistry } from "./plugins/registry.js";
import { createEngine } from "./runtime/engine.js";
import { createRetryPoller } from "./runtime/retry-poller.js";
import { runExecution } from "./runtime/execute.js";
import { relayosInternals } from "./runtime/internals.js";
import type { RelayPlugin } from "./types/plugin.js";
import type { IncomingWebhook } from "./runtime/engine.js";

export type RelayOS = {
  /**
   * Entry point for incoming webhook deliveries.
   * Runs plugin verification, normalises the event, persists it, and enqueues execution.
   */
  processEvent(webhook: IncomingWebhook): Promise<void>;

  /** Stops the retry poller and closes the database connection pool. */
  shutdown(): Promise<void>;
};

/**
 * Initialises the RelayOS runtime.
 *
 * - Validates config with zod (fails fast on misconfiguration).
 * - Creates the Postgres connection pool.
 * - Registers provider plugins.
 * - Starts the in-memory execution queue.
 * - Starts the background retry poller.
 *
 * @param rawConfig - Raw config object (validated internally via zod).
 * @param plugins   - Array of provider plugins to register.
 */
export function createRelayOS(rawConfig: unknown, plugins: RelayPlugin[]): RelayOS {
  const config = RelayConfigSchema.parse(rawConfig);
  const schema = config.database.schema;

  const pool: Pool = createPool(config.database.connectionString);
  const registry = new PluginRegistry();

  for (const plugin of plugins) {
    registry.register(plugin);
  }

  const queue = new ConcurrencyQueue(config.concurrency.maxConcurrent);

  const executeTask = (executionId: string) =>
    runExecution(pool, schema, config, registry, executionId);

  const { processEvent } = createEngine(pool, config, registry, queue, executeTask);

  const poller = createRetryPoller(
    pool,
    schema,
    queue,
    executeTask,
    config.retryPollIntervalMs,
  );
  poller.start();

  const runtime: RelayOS = {
    processEvent,

    async shutdown(): Promise<void> {
      poller.stop();
      await pool.end();
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
