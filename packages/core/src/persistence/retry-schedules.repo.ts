import type { Pool } from "pg";
import type { DbRetrySchedule } from "../types/execution.js";
import type { RetryPolicy } from "../types/config.js";

export type CreateRetryScheduleInput = {
  eventId: string;
  executionId: string;
  nextAttemptAt: Date;
  retryCount: number;
  policySnapshot: RetryPolicy;
};

export async function createRetrySchedule(
  pool: Pool,
  schema: string,
  input: CreateRetryScheduleInput,
): Promise<DbRetrySchedule> {
  const result = await pool.query<DbRetrySchedule>(
    `INSERT INTO ${schema}.retry_schedules
       (event_id, execution_id, next_attempt_at, retry_count, policy_snapshot)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [
      input.eventId,
      input.executionId,
      input.nextAttemptAt,
      input.retryCount,
      JSON.stringify(input.policySnapshot),
    ],
  );

  const retrySchedule = result.rows[0];
  if (!retrySchedule) {
    throw new Error("Failed to create retry schedule");
  }

  return retrySchedule;
}

export async function findDueRetrySchedules(
  pool: Pool,
  schema: string,
  now: Date,
): Promise<DbRetrySchedule[]> {
  const result = await pool.query<DbRetrySchedule>(
    `SELECT * FROM ${schema}.retry_schedules
     WHERE next_attempt_at <= $1
     ORDER BY next_attempt_at ASC`,
    [now],
  );
  return result.rows;
}

export async function deleteRetrySchedule(
  pool: Pool,
  schema: string,
  id: string,
): Promise<void> {
  await pool.query(`DELETE FROM ${schema}.retry_schedules WHERE id = $1`, [id]);
}
