import type { NormalizedEvent } from "./event.js";

export type LogLevel = "info" | "warn" | "error";

/**
 * Execution context passed to every handler invocation.
 * Created fresh by the runtime per execution — never shared across executions.
 */
export type ExecutionContext = {
  /** The normalised webhook event being processed. */
  readonly event: NormalizedEvent;
  /** ID of the current execution attempt. */
  readonly executionId: string;
  /** Zero-indexed retry attempt counter. 0 = first attempt. */
  readonly attempt: number;

  /**
   * Defines a durable step.
   * - If this step has already completed, its cached output is returned immediately.
   * - Otherwise the function is executed, its result persisted, and the result returned.
   */
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;

  /** Appends a structured log entry to the execution log. */
  log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
};
