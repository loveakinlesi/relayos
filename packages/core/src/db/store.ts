import type { Kysely } from 'kysely';
import type {
  Execution,
  ExecutionLog,
  ExecutionStatus,
  ExecutionStep,
  ExecutionStore,
  LogLevel,
  LogSource,
  StepStatus,
} from '../types';
import type {
  Database,
  RelayosExecutionLogsTable,
  RelayosExecutionsTable,
  RelayosExecutionStepsTable,
} from './schema';
import type { SqlDialectName } from './detect';
import { fromJson, fromTimestamp, toJson, toTimestamp } from './coerce';

function toExecution(row: RelayosExecutionsTable & { id: string }): Execution {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    eventData: fromJson(row.eventData) as Record<string, unknown>,
    status: row.status as ExecutionStatus,
    attempt: row.attempt,
    replayedFrom: row.replayedFrom ?? undefined,
    createdAt: fromTimestamp(row.createdAt),
    completedAt: row.completedAt != null ? fromTimestamp(row.completedAt) : undefined,
    error: row.error ?? undefined,
  };
}

function toStep(row: RelayosExecutionStepsTable & { id: string }): ExecutionStep {
  return {
    id: row.id,
    executionId: row.executionId,
    name: row.name,
    status: row.status as StepStatus,
    output: row.output != null ? fromJson(row.output) : undefined,
    error: row.error ?? undefined,
    createdAt: fromTimestamp(row.createdAt),
  };
}

function toLog(row: RelayosExecutionLogsTable & { id: string }): ExecutionLog {
  return {
    id: row.id,
    executionId: row.executionId,
    level: row.level as LogLevel,
    source: row.source as LogSource,
    message: row.message,
    data: row.data != null ? fromJson(row.data) : undefined,
    createdAt: fromTimestamp(row.createdAt),
  };
}

export function createSqlExecutionStore(
  db: Kysely<Database>,
  dialect: SqlDialectName,
): ExecutionStore {
  return {
    async create(execution) {
      const values = {
        id: execution.id,
        eventId: execution.eventId,
        eventType: execution.eventType,
        eventData: toJson(execution.eventData),
        status: execution.status,
        attempt: execution.attempt,
        replayedFrom: execution.replayedFrom ?? null,
        createdAt: toTimestamp(execution.createdAt, dialect),
        completedAt: execution.completedAt ? toTimestamp(execution.completedAt, dialect) : null,
        error: execution.error ?? null,
      };

      if (dialect === 'mysql') {
        // MySQL has no RETURNING clause, so create()'s "did this call win
        // the insert race" contract is read off the affected-row count of
        // an `insert ignore` instead of a returned row.
        const result = await db
          .insertInto('relayosExecutions')
          .values(values)
          .ignore()
          .executeTakeFirst();
        return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
      }

      const row = await db
        .insertInto('relayosExecutions')
        .values(values)
        .onConflict((oc) => oc.column('eventId').doNothing())
        .returning('id')
        .executeTakeFirst();
      return row !== undefined;
    },

    async update(id, patch) {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values['status'] = patch.status;
      if (patch.attempt !== undefined) values['attempt'] = patch.attempt;
      if ('completedAt' in patch) {
        values['completedAt'] = patch.completedAt ? toTimestamp(patch.completedAt, dialect) : null;
      }
      if ('error' in patch) values['error'] = patch.error ?? null;
      if (Object.keys(values).length === 0) return;

      await db.updateTable('relayosExecutions').set(values).where('id', '=', id).execute();
    },

    async list() {
      const rows = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .orderBy('createdAt', 'desc')
        .execute();
      return rows.map(toExecution);
    },

    async get(id) {
      const row = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? toExecution(row) : undefined;
    },

    async findByEventId(eventId) {
      const row = await db
        .selectFrom('relayosExecutions')
        .selectAll()
        .where('eventId', '=', eventId)
        .executeTakeFirst();
      return row ? toExecution(row) : undefined;
    },

    async getStep(executionId, name) {
      const row = await db
        .selectFrom('relayosExecutionSteps')
        .selectAll()
        .where('executionId', '=', executionId)
        .where('name', '=', name)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst();
      return row ? toStep(row) : undefined;
    },

    async saveStep(step) {
      await db
        .insertInto('relayosExecutionSteps')
        .values({
          id: step.id,
          executionId: step.executionId,
          name: step.name,
          status: step.status,
          output: step.output !== undefined ? toJson(step.output) : null,
          error: step.error ?? null,
          createdAt: toTimestamp(step.createdAt, dialect),
        })
        .execute();
    },

    async listSteps(executionId) {
      const rows = await db
        .selectFrom('relayosExecutionSteps')
        .selectAll()
        .where('executionId', '=', executionId)
        .orderBy('createdAt', 'asc')
        .execute();
      return rows.map(toStep);
    },

    async saveLog(log) {
      await db
        .insertInto('relayosExecutionLogs')
        .values({
          id: log.id,
          executionId: log.executionId,
          level: log.level,
          source: log.source,
          message: log.message,
          data: log.data !== undefined ? toJson(log.data) : null,
          createdAt: toTimestamp(log.createdAt, dialect),
        })
        .execute();
    },

    async listLogs(executionId) {
      const rows = await db
        .selectFrom('relayosExecutionLogs')
        .selectAll()
        .where('executionId', '=', executionId)
        .orderBy('createdAt', 'asc')
        .execute();
      return rows.map(toLog);
    },
  };
}
