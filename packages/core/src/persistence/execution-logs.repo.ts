import type { Pool } from "pg";
import type { LogLevel } from "../types/context.js";

export type InsertExecutionLogInput = {
  executionId: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function insertExecutionLog(
  pool: Pool,
  schema: string,
  input: InsertExecutionLogInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO ${schema}.execution_logs (execution_id, level, message, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      input.executionId,
      input.level,
      input.message,
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
    ],
  );
}
