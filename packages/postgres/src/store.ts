import { and, eq } from 'drizzle-orm';
import type { Execution, ExecutionStatus, ExecutionStep, ExecutionStore, StepStatus } from 'relayos';
import type { Db } from './client';
import { executions, executionSteps } from './schema';

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

export function createPostgresExecutionStore(db: Db): ExecutionStore {
  return {
    async create(execution) {
      // onConflictDoNothing is defense-in-depth against the race window in
      // ingest()'s findByEventId check: if a duplicate does slip through
      // concurrently, this fails silently instead of throwing a unique
      // violation back to the webhook caller as a 500.
      await db
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
        .onConflictDoNothing({ target: executions.eventId });
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
  };
}
