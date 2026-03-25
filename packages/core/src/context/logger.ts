import type { Pool } from "pg";
import type { LogLevel } from "../types/context.js";
import { insertExecutionLog } from "../persistence/execution-logs.repo.js";

export async function logExecution(
  pool: Pool,
  schema: string,
  executionId: string,
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await insertExecutionLog(pool, schema, { executionId, level, message, metadata });
}
