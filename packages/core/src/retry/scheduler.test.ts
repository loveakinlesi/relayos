import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../persistence/executions.repo.js", () => ({
  updateExecutionStatus: vi.fn(),
}));

vi.mock("../persistence/retry-schedules.repo.js", () => ({
  createRetrySchedule: vi.fn(),
}));

import { ExecutionStatus } from "../types/event.js";
import { updateExecutionStatus } from "../persistence/executions.repo.js";
import { createRetrySchedule } from "../persistence/retry-schedules.repo.js";
import { scheduleRetry } from "./scheduler.js";

describe("scheduleRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a retry schedule and marks execution retrying when eligible", async () => {
    const emitSignal = vi.fn();

    await scheduleRetry(
      {} as never,
      "relayos",
      {
        id: "exe_1",
        event_id: "evt_1",
        status: ExecutionStatus.Failed,
        attempt: 0,
      } as never,
      {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      emitSignal,
    );

    expect(createRetrySchedule).toHaveBeenCalled();
    expect(updateExecutionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "relayos",
      "exe_1",
      ExecutionStatus.Retrying,
    );
    expect(emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({ type: "retry_scheduled", executionId: "exe_1" }),
    );
  });

  it("does nothing when the execution is no longer retry eligible", async () => {
    await scheduleRetry(
      {} as never,
      "relayos",
      {
        id: "exe_terminal",
        event_id: "evt_1",
        status: ExecutionStatus.Failed,
        attempt: 3,
      } as never,
      {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
    );

    expect(createRetrySchedule).not.toHaveBeenCalled();
    expect(updateExecutionStatus).not.toHaveBeenCalled();
  });
});
