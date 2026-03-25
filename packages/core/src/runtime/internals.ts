import type { Pool } from "pg";
import type { RelayConfig } from "../types/config.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { ConcurrencyQueue } from "./queue.js";
import type { RawNormalizedEvent } from "../types/event.js";

export type RelayOSSignal =
  | { type: "execution_started"; executionId: string; eventId: string }
  | { type: "step_started"; executionId: string; stepName: string }
  | { type: "step_completed"; executionId: string; stepName: string }
  | { type: "execution_failed"; executionId: string; errorMessage: string }
  | { type: "retry_scheduled"; executionId: string; nextAttemptAt: Date }
  | { type: "execution_completed"; executionId: string };

export type RelayOSSignalListener = (signal: RelayOSSignal) => void;

export const relayosInternals = Symbol.for("relayos/core/runtime-internals");

export type RelayOSInternals = {
  pool: Pool;
  config: RelayConfig;
  schema: string;
  registry: PluginRegistry;
  queue: ConcurrencyQueue;
  executeTask: (executionId: string) => Promise<void>;
  stopRetryPoller: () => void;
  startRetryPoller: () => Promise<void>;
  emitSignal: (signal: RelayOSSignal) => void;
  subscribe: (listener: RelayOSSignalListener) => () => void;
  started: boolean;
  setStarted: (started: boolean) => void;
  recoverRunningExecutions: () => Promise<void>;
  ingestNormalizedEvent: (event: RawNormalizedEvent) => Promise<{ eventId: string; deduplicated: boolean }>;
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
