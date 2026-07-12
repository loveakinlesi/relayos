import { describe, it, expect } from 'vitest';
import {
  createRelay,
  createMemoryExecutionStore,
  type Execution,
  type ExecutionLog,
  type ExecutionStep,
  type ExecutionStore,
  type EventHandler,
  type NormalizedEvent,
  type Relay,
  type RelayConfig,
  type RelayPlugin,
  type RetryPolicy,
  type RuntimeContext,
} from './index';

// The SDK is a thin surface over @relayos/core - the engine's behavior is
// covered exhaustively in @relayos/core's own tests. This suite just proves
// the public surface: createRelay works end-to-end and every user-facing
// type is importable from 'relayos'.

// Referencing each re-exported type so tsc fails the lint gate if one
// disappears from the public surface.
type PublicSurface = [
  Execution,
  ExecutionLog,
  ExecutionStep,
  ExecutionStore,
  EventHandler,
  NormalizedEvent,
  Relay,
  RelayConfig,
  RelayPlugin,
  RetryPolicy,
  RuntimeContext,
];

describe('relayos SDK', () => {
  it('processes an event end-to-end on the default memory store', async () => {
    const relay = createRelay();
    const seen: string[] = [];

    relay.on('test.ping', async (event, ctx) => {
      await ctx.step.run('record', async () => {
        seen.push(event.type);
      });
      ctx.log.info('handled');
    });

    const execution = await relay.ingest({
      id: 'evt-sdk-1',
      type: 'test.ping',
      data: {},
      receivedAt: new Date().toISOString(),
    });

    expect(execution.status).toBe('completed');
    expect(seen).toEqual(['test.ping']);
    expect((await relay.listSteps(execution.id)).map((s) => s.name)).toEqual(['record']);
  });

  it('accepts an explicit ExecutionStore as database', async () => {
    const store = createMemoryExecutionStore();
    const relay = createRelay({ database: store });

    const execution = await relay.ingest({
      id: 'evt-sdk-2',
      type: 'test.ping',
      data: {},
      receivedAt: new Date().toISOString(),
    });

    expect((await store.get(execution.id))?.status).toBe('completed');

    const surface: PublicSurface | undefined = undefined;
    expect(surface).toBeUndefined();
  });
});
