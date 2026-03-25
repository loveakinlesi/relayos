import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../persistence/retry-schedules.repo.js", () => ({
  findDueRetrySchedules: vi.fn(),
  deleteRetrySchedule: vi.fn(),
}));

vi.mock("../persistence/executions.repo.js", () => ({
  createExecution: vi.fn(),
}));

import { createExecution } from "../persistence/executions.repo.js";
import { deleteRetrySchedule, findDueRetrySchedules } from "../persistence/retry-schedules.repo.js";
import { createRetryPoller } from "./retry-poller.js";

describe("createRetryPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and enqueues due retry executions", async () => {
    const runExecution = vi.fn().mockResolvedValue(undefined);
    const enqueue = vi.fn(async (task: () => Promise<void>) => task());

    vi.mocked(findDueRetrySchedules).mockResolvedValue([
      { id: "retry_1", event_id: "evt_1", retry_count: 1 },
      { id: "retry_2", event_id: "evt_2", retry_count: 3 },
    ] as never);
    vi.mocked(createExecution)
      .mockResolvedValueOnce({ id: "exe_2" } as never)
      .mockResolvedValueOnce({ id: "exe_4" } as never);

    const poller = createRetryPoller(
      {} as never,
      "relayos",
      { enqueue } as never,
      runExecution,
      1000,
    );

    await poller.start();

    expect(deleteRetrySchedule).toHaveBeenNthCalledWith(1, expect.anything(), "relayos", "retry_1");
    expect(deleteRetrySchedule).toHaveBeenNthCalledWith(2, expect.anything(), "relayos", "retry_2");
    expect(createExecution).toHaveBeenNthCalledWith(1, expect.anything(), "relayos", "evt_1", 2);
    expect(createExecution).toHaveBeenNthCalledWith(2, expect.anything(), "relayos", "evt_2", 4);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(runExecution).toHaveBeenNthCalledWith(1, "exe_2");
    expect(runExecution).toHaveBeenNthCalledWith(2, "exe_4");
  });

  it("logs interval poller errors without crashing the timer loop", async () => {
    const error = new Error("poll failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(findDueRetrySchedules)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(error);

    const poller = createRetryPoller(
      {} as never,
      "relayos",
      { enqueue: vi.fn() } as never,
      vi.fn().mockResolvedValue(undefined),
      1000,
    );

    await poller.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(consoleError).toHaveBeenCalledWith("[RelayOS] Retry poller error:", error);

    consoleError.mockRestore();
  });

  it("stops the interval safely", async () => {
    vi.mocked(findDueRetrySchedules).mockResolvedValue([]);

    const poller = createRetryPoller(
      {} as never,
      "relayos",
      { enqueue: vi.fn() } as never,
      vi.fn().mockResolvedValue(undefined),
      1000,
    );

    await poller.start();
    poller.stop();
    poller.stop();

    await vi.advanceTimersByTimeAsync(1000);

    expect(findDueRetrySchedules).toHaveBeenCalledTimes(1);
  });
});
