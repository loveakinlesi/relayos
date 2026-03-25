export type NormalizedEvent = {
  id: string;
  provider: string;
  eventName: string;
  externalEventId: string | null;
  payload: unknown;
  rawPayload: unknown;
  headers: Record<string, string>;
  receivedAt: Date;
  createdAt: Date;
};

/**
 * The shape a plugin produces before the runtime assigns id/timestamps.
 */
export type RawNormalizedEvent = Omit<NormalizedEvent, "id" | "receivedAt" | "createdAt">;

export enum ExecutionStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Retrying = "retrying",
  Cancelled = "cancelled",
}

export enum StepStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}
