import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRelay,
  createMemoryExecutionStore,
  type NormalizedEvent,
  type RelayPlugin,
} from './index';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'test.event',
    data: {},
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFakePlugin(overrides: Partial<RelayPlugin> = {}): RelayPlugin {
  return {
    id: 'fake',
    async verify() {
      return true;
    },
    normalize(rawBody) {
      const body = rawBody as { type?: string; data?: Record<string, unknown> };
      return {
        id: crypto.randomUUID(),
        type: body.type ?? 'fake.event',
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
    ...overrides,
  };
}

// A no-retry policy so a failing handler doesn't schedule a real setTimeout
// that would outlive the test - only tests specifically about retry timing
// override this with fake timers.
const noAutoRetry = { maxAttempts: 1, backoff: () => 0 };

describe('createMemoryExecutionStore', () => {
  it('create() returns true on first insert, false on a duplicate eventId', async () => {
    const store = createMemoryExecutionStore();
    const base = {
      eventId: 'evt-1',
      eventType: 't',
      eventData: {},
      status: 'pending' as const,
      attempt: 1,
      createdAt: new Date().toISOString(),
    };
    expect(await store.create({ ...base, id: '1' })).toBe(true);
    expect(await store.create({ ...base, id: '2' })).toBe(false);
  });

  it('findByEventId and get resolve the same execution', async () => {
    const store = createMemoryExecutionStore();
    const execution = {
      id: 'exec-1',
      eventId: 'evt-1',
      eventType: 't',
      eventData: {},
      status: 'pending' as const,
      attempt: 1,
      createdAt: new Date().toISOString(),
    };
    await store.create(execution);
    expect((await store.findByEventId('evt-1'))?.id).toBe('exec-1');
    expect((await store.get('exec-1'))?.eventId).toBe('evt-1');
    expect(await store.get('missing')).toBeUndefined();
  });

  it('getStep returns the most recently saved attempt for a step name', async () => {
    const store = createMemoryExecutionStore();
    await store.saveStep({
      id: 's1',
      executionId: 'e1',
      name: 'step',
      status: 'failed',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await store.saveStep({
      id: 's2',
      executionId: 'e1',
      name: 'step',
      status: 'completed',
      createdAt: '2020-01-01T00:00:01.000Z',
    });
    expect((await store.getStep('e1', 'step'))?.id).toBe('s2');
  });

  it('saveStep never overwrites - listSteps returns the full history', async () => {
    const store = createMemoryExecutionStore();
    await store.saveStep({
      id: 's1',
      executionId: 'e1',
      name: 'step',
      status: 'failed',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await store.saveStep({
      id: 's2',
      executionId: 'e1',
      name: 'step',
      status: 'completed',
      createdAt: '2020-01-01T00:00:01.000Z',
    });
    const all = await store.listSteps('e1');
    expect(all.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('createRelay - ingest', () => {
  it('runs the handler registered for the matching event type', async () => {
    const relay = createRelay();
    const handled: NormalizedEvent[] = [];
    relay.on('test.ping', async (event) => {
      handled.push(event);
    });
    const execution = await relay.ingest(makeEvent({ type: 'test.ping' }));
    expect(execution.status).toBe('completed');
    expect(handled).toHaveLength(1);
  });

  it('does not run handlers for a type with no registration', async () => {
    const relay = createRelay();
    const execution = await relay.ingest(makeEvent({ type: 'no.handler' }));
    expect(execution.status).toBe('completed');
  });

  it('a duplicate eventId returns the same execution without re-running the handler', async () => {
    const relay = createRelay();
    let calls = 0;
    relay.on('test.ping', async () => {
      calls++;
    });
    const event = makeEvent({ type: 'test.ping', id: 'evt-dup' });
    const first = await relay.ingest(event);
    const second = await relay.ingest(event);
    expect(second.id).toBe(first.id);
    expect(calls).toBe(1);
  });

  it('concurrent ingests of the same eventId collapse to one execution and one handler run', async () => {
    const relay = createRelay();
    let calls = 0;
    relay.on('test.ping', async () => {
      calls++;
    });
    const event = makeEvent({ type: 'test.ping', id: 'evt-concurrent' });
    const results = await Promise.all(Array.from({ length: 10 }, () => relay.ingest(event)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(calls).toBe(1);
  });

  it('a failed handler marks the execution failed with the error message', async () => {
    const relay = createRelay({ retry: noAutoRetry });
    relay.on('test.fail', async () => {
      throw new Error('boom');
    });
    const execution = await relay.ingest(makeEvent({ type: 'test.fail' }));
    expect(execution.status).toBe('failed');
    expect(execution.error).toBe('boom');
  });
});

describe('ctx.step.run', () => {
  it('caches a completed step across a retry, but re-runs a failed one', async () => {
    const relay = createRelay({ retry: noAutoRetry });
    let step1Runs = 0;
    let step2ShouldFail = true;

    relay.on('test.steps', async (_event, ctx) => {
      await ctx.step.run('step1', async () => {
        step1Runs++;
        return 'ok';
      });
      await ctx.step.run('step2', async () => {
        if (step2ShouldFail) {
          step2ShouldFail = false;
          throw new Error('transient');
        }
        return 'ok';
      });
    });

    const event = makeEvent({ type: 'test.steps' });
    const first = await relay.ingest(event);
    expect(first.status).toBe('failed');
    expect(step1Runs).toBe(1);

    const retried = await relay.retryExecution(first.id);
    expect(retried.status).toBe('completed');
    expect(step1Runs).toBe(1); // step1 was never re-run
  });

  it('threads a step output into a later step', async () => {
    const relay = createRelay();
    let seen: number | undefined;
    relay.on('test.chain', async (_event, ctx) => {
      const amount = await ctx.step.run('produce', async () => 42);
      await ctx.step.run('consume', async () => {
        seen = amount;
      });
    });
    await relay.ingest(makeEvent({ type: 'test.chain' }));
    expect(seen).toBe(42);
  });
});

describe('restartExecution', () => {
  it('forces every step to re-run, unlike retryExecution', async () => {
    const relay = createRelay();
    let runs = 0;
    relay.on('test.restart', async (_event, ctx) => {
      await ctx.step.run('only-step', async () => {
        runs++;
      });
    });
    const first = await relay.ingest(makeEvent({ type: 'test.restart' }));
    expect(first.status).toBe('completed');
    expect(runs).toBe(1);

    await relay.retryExecution(first.id);
    expect(runs).toBe(1); // retry skips the already-completed step

    await relay.restartExecution(first.id);
    expect(runs).toBe(2); // restart re-runs it anyway
  });
});

describe('replayExecution', () => {
  it('creates an independent new execution, leaving the source untouched', async () => {
    const relay = createRelay();
    let calls = 0;
    relay.on('test.replay', async () => {
      calls++;
    });
    const source = await relay.ingest(makeEvent({ type: 'test.replay' }));
    expect(calls).toBe(1);

    const replayed = await relay.replayExecution(source.id);
    expect(replayed.id).not.toBe(source.id);
    expect(replayed.eventId).not.toBe(source.eventId);
    expect(replayed.replayedFrom).toBe(source.id);
    expect(calls).toBe(2);

    const sourceAfter = (await relay.listExecutions()).find((e) => e.id === source.id);
    expect(sourceAfter?.attempt).toBe(1);
    expect((await relay.listSteps(replayed.id)).length).toBe(0);
  });
});

describe('automatic retry scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries with backoff up to maxAttempts, then stops', async () => {
    const relay = createRelay({ retry: { maxAttempts: 3, backoff: () => 100 } });
    let calls = 0;
    relay.on('test.fail', async () => {
      calls++;
      throw new Error('always fails');
    });

    await relay.ingest(makeEvent({ type: 'test.fail', id: 'evt-retry' }));
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(3);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(3); // exhausted, no further attempts
  });
});

describe('concurrency safety', () => {
  it('collapses concurrent retryExecution calls for the same execution into one run', async () => {
    const relay = createRelay({ retry: noAutoRetry });
    let calls = 0;
    relay.on('test.fail', async () => {
      calls++;
      throw new Error('fail');
    });
    const first = await relay.ingest(makeEvent({ type: 'test.fail', id: 'evt-concurrent-retry' }));
    expect(calls).toBe(1);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => relay.retryExecution(first.id)),
    );
    expect(new Set(results.map((r) => r.attempt)).size).toBe(1);
    expect(calls).toBe(2);
  });
});

describe('logging', () => {
  it('tags runtime lifecycle entries as "system" and handler logs as "handler"', async () => {
    const relay = createRelay();
    relay.on('test.log', async (_event, ctx) => {
      ctx.log.info('hello from handler');
    });
    const execution = await relay.ingest(makeEvent({ type: 'test.log' }));
    const logs = await relay.listLogs(execution.id);
    expect(logs.some((l) => l.source === 'system' && l.message === 'event ingested')).toBe(true);
    expect(logs.some((l) => l.source === 'handler' && l.message === 'hello from handler')).toBe(
      true,
    );
  });
});

describe('relay.handler (HTTP dispatch)', () => {
  it('returns 404 for an unregistered provider', async () => {
    const relay = createRelay({ plugins: [makeFakePlugin()] });
    const req = new Request('http://x/api/relay/unknown', { method: 'POST', body: '{}' });
    const res = await relay.handler(req, { params: { all: ['unknown'] } });
    expect(res.status).toBe(404);
  });

  it('returns 401 when the plugin rejects verification', async () => {
    const relay = createRelay({
      plugins: [makeFakePlugin({ async verify() { return false; } })],
    });
    const req = new Request('http://x/api/relay/fake', { method: 'POST', body: '{}' });
    const res = await relay.handler(req, { params: { all: ['fake'] } });
    expect(res.status).toBe(401);
  });

  it('ingests and returns 200 on a verified request', async () => {
    const relay = createRelay({ plugins: [makeFakePlugin()] });
    relay.on('fake.event', async () => {});
    const req = new Request('http://x/api/relay/fake', {
      method: 'POST',
      body: JSON.stringify({ type: 'fake.event' }),
    });
    const res = await relay.handler(req, { params: { all: ['fake'] } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { execution: { status: string } };
    expect(json.execution.status).toBe('completed');
  });
});
