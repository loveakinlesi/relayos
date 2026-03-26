import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/persistence/executions.repo.js", () => ({
  findExecutionById: vi.fn(),
  updateExecutionStatus: vi.fn(),
}));

vi.mock("../../src/runtime/internals.js", () => ({
  getRelayOSInternals: vi.fn(),
}));

import { ExecutionStatus } from "../../src/types/event.js";
import { findExecutionById, updateExecutionStatus } from "../../src/persistence/executions.repo.js";
import { getRelayOSInternals } from "../../src/runtime/internals.js";
import { resumeExecution, resumeFailedExecution } from "../../src/replay/resume.js";

describe("resumeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-queues an existing failed execution", async () => {
    const enqueue = vi.fn(async (task: () => Promise<void>) => task());
    const runExecution = vi.fn().mockResolvedValue(undefined);
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      status: ExecutionStatus.Failed,
    } as never);

    await resumeExecution(
      {} as never,
      "relayos",
      "exe_1",
      { enqueue } as never,
      runExecution,
    );

    expect(updateExecutionStatus).toHaveBeenCalledWith(
      expect.anything(),
      "relayos",
      "exe_1",
      ExecutionStatus.Pending,
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(runExecution).toHaveBeenCalledWith("exe_1");
  });

  it("rejects resume when the execution does not exist", async () => {
    vi.mocked(findExecutionById).mockResolvedValue(null);

    await expect(
      resumeExecution({} as never, "relayos", "missing", { enqueue: vi.fn() } as never, vi.fn()),
    ).rejects.toThrow('Execution "missing" not found');
  });

  it("rejects resume when the execution is not failed", async () => {
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      status: ExecutionStatus.Completed,
    } as never);

    await expect(
      resumeExecution({} as never, "relayos", "exe_1", { enqueue: vi.fn() } as never, vi.fn()),
    ).rejects.toThrow(
      'Cannot resume execution "exe_1": expected status "failed", got "completed"',
    );
  });

  it("resumes through runtime internals", async () => {
    const executeTask = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn(async (task: () => Promise<void>) => task());
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      status: ExecutionStatus.Failed,
    } as never);
    vi.mocked(getRelayOSInternals).mockReturnValue({
      pool: {} as never,
      schema: "relayos",
      queue: { enqueue } as never,
      executeTask,
    } as never);

    await resumeFailedExecution({} as never, "exe_1");

    expect(getRelayOSInternals).toHaveBeenCalled();
    expect(executeTask).toHaveBeenCalledWith("exe_1");
  });
});
