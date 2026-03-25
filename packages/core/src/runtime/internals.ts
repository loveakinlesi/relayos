import type { Pool } from "pg";
import type { RelayConfig } from "../types/config.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { ConcurrencyQueue } from "./queue.js";

export const relayosInternals = Symbol.for("relayos/core/runtime-internals");

export type RelayOSInternals = {
  pool: Pool;
  config: RelayConfig;
  schema: string;
  registry: PluginRegistry;
  queue: ConcurrencyQueue;
  executeTask: (executionId: string) => Promise<void>;
  stopRetryPoller: () => void;
};

export function getRelayOSInternals(runtime: object): RelayOSInternals {
  const candidate = runtime as { [relayosInternals]?: RelayOSInternals };
  const internals = candidate[relayosInternals];

  if (!internals) {
    throw new Error(
      "Invalid RelayOS runtime instance. Expected an object created by createRelayOS().",
    );
  }

  return internals;
}
