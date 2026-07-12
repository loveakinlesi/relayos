import { describe, it, expect, expectTypeOf } from 'vitest';
import { createRelayEngine, type NormalizedEvent, type RelayPlugin } from './index';
import { createMemoryExecutionStore } from './test/memory-store';

// These tests pin the type-level behavior of the plugin event-map inference.
// The expectTypeOf assertions are checked by tsc (the lint gate), not at
// runtime - a wrong inference breaks `pnpm lint`, not the test run.

type PaymentsEventMap = {
  'pay.charge.succeeded': { object: { id: string; amount: number } };
  'pay.charge.failed': { object: { id: string; reason: string } };
};

type ReposEventMap = {
  'repo.push': { ref: string; commits: { id: string }[] };
};

function fakePlugin<TEventMap extends Record<string, unknown> = {}>(
  id: string,
): RelayPlugin<TEventMap> {
  return {
    id,
    async verify() {
      return true;
    },
    normalize(rawBody) {
      const body = rawBody as { type?: string; data?: Record<string, unknown> };
      return {
        id: crypto.randomUUID(),
        type: body.type ?? `${id}.event`,
        data: body.data ?? {},
        receivedAt: new Date().toISOString(),
      };
    },
    sign() {
      return {};
    },
    buildTestPayload(eventType, data) {
      return { body: { type: eventType, data } };
    },
  };
}

describe('typed event inference', () => {
  it('narrows event.type and event.data for a registered plugin event', () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore(), plugins: [fakePlugin<PaymentsEventMap>('pay')] });

    relay.on('pay.charge.succeeded', (event) => {
      expectTypeOf(event.type).toEqualTypeOf<'pay.charge.succeeded'>();
      expectTypeOf(event.data).toEqualTypeOf<{ object: { id: string; amount: number } }>();
    });

    expect(relay).toBeDefined();
  });

  it('merges the event maps of multiple plugins', () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore(),
      plugins: [fakePlugin<PaymentsEventMap>('pay'), fakePlugin<ReposEventMap>('repo')],
    });

    relay.on('pay.charge.failed', (event) => {
      expectTypeOf(event.data).toEqualTypeOf<{ object: { id: string; reason: string } }>();
    });
    relay.on('repo.push', (event) => {
      expectTypeOf(event.data).toEqualTypeOf<{ ref: string; commits: { id: string }[] }>();
    });

    expect(relay).toBeDefined();
  });

  it('an untyped plugin alongside a typed one does not erase the typed catalog', () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore(),
      plugins: [fakePlugin('untyped'), fakePlugin<ReposEventMap>('repo')],
    });

    relay.on('repo.push', (event) => {
      expectTypeOf(event.data).toEqualTypeOf<{ ref: string; commits: { id: string }[] }>();
    });

    expect(relay).toBeDefined();
  });

  it('unknown event names stay legal and fall back to untyped data', () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore(), plugins: [fakePlugin<PaymentsEventMap>('pay')] });

    relay.on('custom.thing', (event) => {
      expectTypeOf(event).toEqualTypeOf<NormalizedEvent>();
      expectTypeOf(event.data).toEqualTypeOf<Record<string, unknown>>();
    });

    expect(relay).toBeDefined();
  });

  it('a relay with no plugins is fully untyped', () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore() });

    relay.on('anything.at.all', (event) => {
      expectTypeOf(event.data).toEqualTypeOf<Record<string, unknown>>();
    });

    expect(relay).toBeDefined();
  });

  it('typed registrations still dispatch at runtime', async () => {
    const relay = createRelayEngine({ database: createMemoryExecutionStore(), plugins: [fakePlugin<PaymentsEventMap>('pay')] });
    const amounts: number[] = [];

    relay.on('pay.charge.succeeded', async (event) => {
      amounts.push(event.data.object.amount);
    });

    const execution = await relay.ingest({
      id: 'evt-typed-1',
      type: 'pay.charge.succeeded',
      data: { object: { id: 'ch_1', amount: 1000 } },
      receivedAt: new Date().toISOString(),
    });

    expect(execution.status).toBe('completed');
    expect(amounts).toEqual([1000]);
  });
});
