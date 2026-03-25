import type { Pool } from "pg";
import type { DbExecution } from "../types/execution.js";
import { ExecutionStatus } from "../types/event.js";

export async function createExecution(
  pool: Pool,
  schema: string,
  eventId: string,
  attempt = 0,
): Promise<DbExecution> {
  const result = await pool.query<DbExecution>(
    `INSERT INTO ${schema}.executions (event_id, status, attempt)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [eventId, ExecutionStatus.Pending, attempt],
  );

  const execution = result.rows[0];
  if (!execution) {
    throw new Error("Failed to create execution");
  }

  return execution;
}

export type UpdateExecutionStatusOptions = {
  startedAt?: Date;
  finishedAt?: Date;
  errorMessage?: string | null;
};

export async function updateExecutionStatus(
  pool: Pool,
  schema: string,
  id: string,
  status: ExecutionStatus,
  options: UpdateExecutionStatusOptions = {},
): Promise<DbExecution> {
  const result = await pool.query<DbExecution>(
    `UPDATE ${schema}.executions
     SET status        = $2,
         started_at    = COALESCE($3, started_at),
         finished_at   = COALESCE($4, finished_at),
         error_message = COALESCE($5, error_message)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      options.startedAt ?? null,
      options.finishedAt ?? null,
      options.errorMessage ?? null,
    ],
  );

  const execution = result.rows[0];
  if (!execution) {
    throw new Error(`Execution "${id}" not found after status update`);
  }

  return execution;
}

export async function findExecutionById(
  pool: Pool,
  schema: string,
  id: string,
): Promise<DbExecution | null> {
  const result = await pool.query<DbExecution>(
    `SELECT * FROM ${schema}.executions WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findExecutionsByEventId(
  pool: Pool,
  schema: string,
  eventId: string,
): Promise<DbExecution[]> {
  const result = await pool.query<DbExecution>(
    `SELECT * FROM ${schema}.executions WHERE event_id = $1 ORDER BY created_at ASC`,
    [eventId],
  );
  return result.rows;
}
