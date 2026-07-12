import { createRelayEngine } from '@relayos/core';
import type { EventMapOf, Relay, RelayConfig, RelayPlugin } from '@relayos/core';

/**
 * Creates a RelayOS runtime. The developer-facing entry point: registers
 * handlers via relay.on(), receives provider webhooks via relay.handler, and
 * persists executions to config.database (an in-memory store by default).
 *
 * The relay's event types are inferred from the plugins you register - a
 * typed plugin (e.g. @relayos/stripe) makes relay.on() autocomplete its
 * event names and type event.data per event.
 */
export function createRelay<const TPlugins extends readonly RelayPlugin<any>[] = []>(
  config: RelayConfig<TPlugins> = {},
): Relay<EventMapOf<TPlugins>> {
  return createRelayEngine<TPlugins>(config);
}

export { createMemoryExecutionStore } from '@relayos/core';
export type {
  NormalizedEvent,
  StepStatus,
  ExecutionStep,
  LogLevel,
  LogSource,
  ExecutionLog,
  RuntimeContext,
  EventHandler,
  ExecutionStatus,
  Execution,
  ExecutionStore,
  RelayPlugin,
  EventMapOf,
  RelayHandlerContext,
  Relay,
  RetryPolicy,
  RelayConfig,
} from '@relayos/core';
