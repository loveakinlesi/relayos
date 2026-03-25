import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStep } from "./step.js";
import { StepStatus } from "../types/event.js";
import { StepError } from "../errors/index.js";
import type { Pool } from "pg";

// Minimal mock for findStepByName and upsertStep
vi.mock("../persistence/steps.repo.js", () => ({
  findStepByName: vi.fn(),
  upsertStep: vi.fn().mockResolvedValue({}),
}));

import { findStepByName, upsertStep } from "../persistence/steps.repo.js";

const mockPool = {} as Pool;
const schema = "relayos";
const executionId = "exec-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStep", () => {
  it("executes fn and checkpoints result when step is new", async () => {
    vi.mocked(findStepByName).mockResolvedValue(null);

    const result = await runStep(mockPool, schema, executionId, "send-email", async () => 42);

    expect(result).toBe(42);
    expect(upsertStep).toHaveBeenCalledWith(
      mockPool,
      schema,
      executionId,
      "send-email",
      expect.objectContaining({ status: StepStatus.Running }),
    );
    expect(upsertStep).toHaveBeenCalledWith(
      mockPool,
      schema,
      executionId,
      "send-email",
      expect.objectContaining({ status: StepStatus.Completed, output: 42 }),
    );
  });

  it("returns cached output without re-executing when step is completed", async () => {
    vi.mocked(findStepByName).mockResolvedValue({
      id: "step-1",
      execution_id: executionId,
      step_name: "send-email",
      status: StepStatus.Completed,
      output: "cached-value",
      error_message: null,
      started_at: new Date(),
      finished_at: new Date(),
      created_at: new Date(),
    });

    const fn = vi.fn().mockResolvedValue("new-value");
    const result = await runStep(mockPool, schema, executionId, "send-email", fn);

    expect(result).toBe("cached-value");
    expect(fn).not.toHaveBeenCalled();
  });

  it("marks step as failed and throws StepError when fn throws", async () => {
    vi.mocked(findStepByName).mockResolvedValue(null);

    const fn = vi.fn().mockRejectedValue(new Error("downstream failure"));

    await expect(
      runStep(mockPool, schema, executionId, "charge-card", fn),
    ).rejects.toThrow(StepError);

    expect(upsertStep).toHaveBeenCalledWith(
      mockPool,
      schema,
      executionId,
      "charge-card",
      expect.objectContaining({ status: StepStatus.Failed, errorMessage: "downstream failure" }),
    );
  });

  it("re-executes a step that was previously in running state (not completed)", async () => {
    vi.mocked(findStepByName).mockResolvedValue({
      id: "step-1",
      execution_id: executionId,
      step_name: "send-email",
      status: StepStatus.Running,
      output: null,
      error_message: null,
      started_at: new Date(),
      finished_at: null,
      created_at: new Date(),
    });

    const fn = vi.fn().mockResolvedValue("fresh-result");
    const result = await runStep(mockPool, schema, executionId, "send-email", fn);

    expect(fn).toHaveBeenCalled();
    expect(result).toBe("fresh-result");
  });
});
