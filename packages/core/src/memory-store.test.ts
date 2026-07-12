import { describe, it, expect } from 'vitest';
import { createMemoryExecutionStore } from './index';

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
