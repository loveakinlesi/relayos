import { eq } from 'drizzle-orm';
import type { Execution, ExecutionStatus, ExecutionStore } from 'relayos';
import type { Db } from './client';
import { executions } from './schema';

function toExecution(row: typeof executions.$inferSelect): Execution {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status as ExecutionStatus,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    error: row.error ?? undefined,
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
          status: execution.status,
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
          ...(patch.completedAt !== undefined
            ? { completedAt: patch.completedAt ? new Date(patch.completedAt) : null }
            : {}),
          ...(patch.error !== undefined ? { error: patch.error ?? null } : {}),
        })
        .where(eq(executions.id, id));
    },
    async list() {
      const rows = await db.select().from(executions).orderBy(executions.createdAt);
      return rows.map(toExecution).reverse();
    },
    async findByEventId(eventId) {
      const [row] = await db.select().from(executions).where(eq(executions.eventId, eventId));
      return row ? toExecution(row) : undefined;
    },
  };
}
