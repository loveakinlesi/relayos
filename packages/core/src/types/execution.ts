import type { ExecutionStatus, StepStatus } from "./event.js";

/** Row shape returned from the events table. */
export type DbEvent = {
  id: string;
  provider: string;
  event_name: string;
  external_event_id: string | null;
  payload: unknown;
  raw_payload: unknown;
  headers: Record<string, string>;
  received_at: Date;
  created_at: Date;
};

/** Row shape returned from the executions table. */
export type DbExecution = {
  id: string;
  event_id: string;
  status: ExecutionStatus;
  attempt: number;
  started_at: Date | null;
  finished_at: Date | null;
  error_message: string | null;
  created_at: Date;
};

/** Row shape returned from the steps table. */
export type DbStep = {
  id: string;
  execution_id: string;
  step_name: string;
  status: StepStatus;
  output: unknown | null;
  error_message: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

/** Row shape returned from the retry_schedules table. */
export type DbRetrySchedule = {
  id: string;
  event_id: string;
  execution_id: string;
  next_attempt_at: Date;
  retry_count: number;
  policy_snapshot: unknown;
  created_at: Date;
};

/** Row shape returned from the execution_logs table. */
export type DbExecutionLog = {
  id: string;
  execution_id: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata: unknown | null;
  created_at: Date;
};
