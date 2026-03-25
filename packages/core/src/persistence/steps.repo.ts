import type { Pool } from "pg";
import type { DbStep } from "../types/execution.js";
import { StepStatus } from "../types/event.js";

export type UpsertStepData = {
  status?: StepStatus;
  output?: unknown;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

/**
 * Creates or updates a step row for (executionId, stepName).
 * The unique constraint on (execution_id, step_name) ensures idempotency.
 */
export async function upsertStep(
  pool: Pool,
  schema: string,
  executionId: string,
  stepName: string,
  data: UpsertStepData,
): Promise<DbStep> {
  const result = await pool.query<DbStep>(
    `INSERT INTO ${schema}.steps
       (execution_id, step_name, status, output, error_message, started_at, finished_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (execution_id, step_name)
     DO UPDATE SET
       status        = COALESCE(EXCLUDED.status, ${schema}.steps.status),
       output        = COALESCE(EXCLUDED.output, ${schema}.steps.output),
       error_message = COALESCE(EXCLUDED.error_message, ${schema}.steps.error_message),
       started_at    = COALESCE(EXCLUDED.started_at, ${schema}.steps.started_at),
       finished_at   = COALESCE(EXCLUDED.finished_at, ${schema}.steps.finished_at)
     RETURNING *`,
    [
      executionId,
      stepName,
      data.status ?? StepStatus.Pending,
      data.output !== undefined ? JSON.stringify(data.output) : null,
      data.errorMessage ?? null,
      data.startedAt ?? null,
      data.finishedAt ?? null,
    ],
  );

  const step = result.rows[0];
  if (!step) {
    throw new Error(`Failed to upsert step "${stepName}"`);
  }

  return step;
}

export async function findStepByName(
  pool: Pool,
  schema: string,
  executionId: string,
  stepName: string,
): Promise<DbStep | null> {
  const result = await pool.query<DbStep>(
    `SELECT * FROM ${schema}.steps
     WHERE execution_id = $1 AND step_name = $2`,
    [executionId, stepName],
  );
  return result.rows[0] ?? null;
}

export async function findStepsByExecution(
  pool: Pool,
  schema: string,
  executionId: string,
): Promise<DbStep[]> {
  const result = await pool.query<DbStep>(
    `SELECT * FROM ${schema}.steps
     WHERE execution_id = $1 ORDER BY created_at ASC`,
    [executionId],
  );
  return result.rows;
}
