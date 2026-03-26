import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/persistence/executions.repo.js", () => ({
  createExecution: vi.fn(),
}));

vi.mock("../../src/runtime/internals.js", () => ({
  getRelayOSInternals: vi.fn(),
}));

import { createExecution } from "../../src/persistence/executions.repo.js";
import { getRelayOSInternals } from "../../src/runtime/internals.js";
import { createReplay, replayEvent } from "../../src/replay/replay.js";

describe("replayEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new execution attempt for an existing event", async () => {
    const executeTask = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn(async (task: () => Promise<void>) => task());
    vi.mocked(getRelayOSInternals).mockReturnValue({
      pool: {} as never,
      schema: "relayos",
      queue: { enqueue } as never,
      executeTask,
    } as never);
    vi.mocked(createExecution).mockResolvedValue({ id: "exe_replay" } as never);

    await replayEvent({} as never, "evt_1");

    expect(createExecution).toHaveBeenCalledWith(expect.anything(), "relayos", "evt_1", 0);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(executeTask).toHaveBeenCalledWith("exe_replay");
  });

  it("creates a replay directly from pool and schema", async () => {
    vi.mocked(createExecution).mockResolvedValue({ id: "exe_replay" } as never);

    await expect(createReplay({} as never, "relayos", "evt_1")).resolves.toEqual({
      id: "exe_replay",
    });
  });
});
