import { describe, it, expect } from 'vitest';
import {
  restaq,
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

// A minimal in-memory ExecutionStore fake, local to this test file. Not part
// of the public surface (restaq has no zero-config default anymore - a
// database must always be supplied), just a working store for this suite to
// prove restaq() end-to-end without depending on a real Postgres/SQLite/
// MySQL client.
function createFakeStore(): ExecutionStore {
  const executions = new Map<string, Execution>();
  const steps: ExecutionStep[] = [];
  const logs: ExecutionLog[] = [];
  return {
    async create(execution) {
      if (Array.from(executions.values()).some((e) => e.eventId === execution.eventId))
        return false;
      executions.set(execution.id, execution);
      return true;
    },
    async update(id, patch) {
      const existing = executions.get(id);
      if (existing) executions.set(id, { ...existing, ...patch });
    },
    async list() {
      return Array.from(executions.values());
    },
    async get(id) {
      return executions.get(id);
    },
    async findByEventId(eventId) {
      return Array.from(executions.values()).find((e) => e.eventId === eventId);
    },
    async getStep(executionId, name) {
      const matches = steps.filter(
        (step) => step.executionId === executionId && step.name === name,
      );
      return matches[matches.length - 1];
    },
    async saveStep(step) {
      steps.push(step);
    },
    async listSteps(executionId) {
      return steps.filter((step) => step.executionId === executionId);
    },
    async saveLog(log) {
      logs.push(log);
    },
    async listLogs(executionId) {
      return logs.filter((log) => log.executionId === executionId);
    },
  };
}

// The SDK is a thin surface over @restaq/core - the engine's behavior is
// covered exhaustively in @restaq/core's own tests. This suite just proves
// the public surface: restaq() works end-to-end and every user-facing
// type is importable from 'restaq'.

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

describe('restaq SDK', () => {
  it('processes an event end-to-end against a custom ExecutionStore', async () => {
    const relay = restaq({ database: createFakeStore() });
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
    const store = createFakeStore();
    const relay = restaq({ database: store });

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
