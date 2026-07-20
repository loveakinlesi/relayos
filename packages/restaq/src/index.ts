import { createRelayEngine } from '@restaq/core';
import type { EventMapOf, Relay, RelayConfig, RelayPlugin } from '@restaq/core';

/**
 * Creates a Restaq runtime. The developer-facing entry point: registers
 * handlers via relay.on(), receives provider webhooks via relay.handler, and
 * persists executions to config.database - a Postgres/SQLite/MySQL client
 * (auto-detected), a { dialect } Kysely escape hatch, or a custom
 * ExecutionStore.
 *
 * The relay's event types are inferred from the plugins you register - a
 * typed plugin (e.g. @restaq/stripe) makes relay.on() autocomplete its
 * event names and type event.data per event.
 */
export function restaq<const TPlugins extends readonly RelayPlugin<any>[] = []>(
  config: RelayConfig<TPlugins>,
): Relay<EventMapOf<TPlugins>> {
  return createRelayEngine<TPlugins>(config);
}

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
} from '@restaq/core';
