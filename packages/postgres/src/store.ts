import { and, eq } from 'drizzle-orm';
import type {
  Execution,
  ExecutionLog,
  ExecutionStatus,
  ExecutionStep,
  ExecutionStore,
  LogLevel,
  StepStatus,
} from 'relayos';
import type { Db } from './client';
import { executions, executionSteps, executionLogs } from './schema';

function toExecution(row: typeof executions.$inferSelect): Execution {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    eventData: row.eventData as Record<string, unknown>,
    status: row.status as ExecutionStatus,
    attempt: row.attempt,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    error: row.error ?? undefined,
  };
}

function toStep(row: typeof executionSteps.$inferSelect): ExecutionStep {
  return {
    id: row.id,
    executionId: row.executionId,
    name: row.name,
    status: row.status as StepStatus,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLog(row: typeof executionLogs.$inferSelect): ExecutionLog {
  return {
    id: row.id,
    executionId: row.executionId,
    level: row.level as LogLevel,
    message: row.message,
    data: row.data ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPostgresExecutionStore(db: Db): ExecutionStore {
  return {
    async create(execution) {
      // A single INSERT ... ON CONFLICT DO NOTHING is atomic at the database
      // level, so this is safe even across concurrent requests hitting
      // different server processes/replicas - not just within one process.
      // .returning() tells the caller whether *this* call actually won the
      // insert, so ingest() knows whether it's responsible for running
      // handlers or lost the race to a concurrent duplicate.
      const rows = await db
        .insert(executions)
        .values({
          id: execution.id,
          eventId: execution.eventId,
          eventType: execution.eventType,
          eventData: execution.eventData,
          status: execution.status,
          attempt: execution.attempt,
          createdAt: new Date(execution.createdAt),
          completedAt: execution.completedAt ? new Date(execution.completedAt) : null,
          error: execution.error ?? null,
        })
        .onConflictDoNothing({ target: executions.eventId })
        .returning({ id: executions.id });
      return rows.length > 0;
    },
    async update(id, patch) {
      await db
        .update(executions)
        .set({
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.attempt !== undefined ? { attempt: patch.attempt } : {}),
          ...('completedAt' in patch
            ? { completedAt: patch.completedAt ? new Date(patch.completedAt) : null }
            : {}),
          ...('error' in patch ? { error: patch.error ?? null } : {}),
        })
        .where(eq(executions.id, id));
    },
    async list() {
      const rows = await db.select().from(executions).orderBy(executions.createdAt);
      return rows.map(toExecution).reverse();
    },
    async get(id) {
      const [row] = await db.select().from(executions).where(eq(executions.id, id));
      return row ? toExecution(row) : undefined;
    },
    async findByEventId(eventId) {
      const [row] = await db.select().from(executions).where(eq(executions.eventId, eventId));
      return row ? toExecution(row) : undefined;
    },
    async getStep(executionId, name) {
      const [row] = await db
        .select()
        .from(executionSteps)
        .where(and(eq(executionSteps.executionId, executionId), eq(executionSteps.name, name)));
      return row ? toStep(row) : undefined;
    },
    async saveStep(step) {
      await db
        .insert(executionSteps)
        .values({
          id: step.id,
          executionId: step.executionId,
          name: step.name,
          status: step.status,
          output: step.output ?? null,
          error: step.error ?? null,
          createdAt: new Date(step.createdAt),
        })
        .onConflictDoUpdate({
          target: [executionSteps.executionId, executionSteps.name],
          set: {
            status: step.status,
            output: step.output ?? null,
            error: step.error ?? null,
            createdAt: new Date(step.createdAt),
          },
        });
    },
    async listSteps(executionId) {
      const rows = await db
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.executionId, executionId))
        .orderBy(executionSteps.createdAt);
      return rows.map(toStep);
    },
    async saveLog(log) {
      await db.insert(executionLogs).values({
        id: log.id,
        executionId: log.executionId,
        level: log.level,
        message: log.message,
        data: log.data ?? null,
        createdAt: new Date(log.createdAt),
      });
    },
    async listLogs(executionId) {
      const rows = await db
        .select()
        .from(executionLogs)
        .where(eq(executionLogs.executionId, executionId))
        .orderBy(executionLogs.createdAt);
      return rows.map(toLog);
    },
  };
}
