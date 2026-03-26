import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/persistence/executions.repo.js", () => ({
  findExecutionById: vi.fn(),
  updateExecutionStatus: vi.fn(),
}));

vi.mock("../../src/persistence/events.repo.js", () => ({
  findEventById: vi.fn(),
}));

vi.mock("../../src/context/create-context.js", () => ({
  createContext: vi.fn(),
}));

vi.mock("../../src/plugins/resolve-handler.js", () => ({
  resolveHandler: vi.fn(),
}));

vi.mock("../../src/retry/scheduler.js", () => ({
  scheduleRetry: vi.fn(),
}));

import { createContext } from "../../src/context/create-context.js";
import { findEventById } from "../../src/persistence/events.repo.js";
import { findExecutionById, updateExecutionStatus } from "../../src/persistence/executions.repo.js";
import { resolveHandler } from "../../src/plugins/resolve-handler.js";
import { scheduleRetry } from "../../src/retry/scheduler.js";
import { ExecutionStatus } from "../../src/types/event.js";
import { runExecution } from "../../src/runtime/execute.js";

describe("runExecution", () => {
  const emitSignal = vi.fn();
  const pool = {} as never;
  const config = {
    retry: {
      maxAttempts: 3,
      backoffBaseMs: 1000,
      backoffMultiplier: 2,
      backoffMaxMs: 60_000,
    },
  } as never;
  const registry = {
    get: vi.fn(),
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when the execution does not exist", async () => {
    vi.mocked(findExecutionById).mockResolvedValue(null);

    await runExecution(pool, "relayos", config, registry, "exe_missing", emitSignal);

    expect(findEventById).not.toHaveBeenCalled();
    expect(updateExecutionStatus).not.toHaveBeenCalled();
  });

  it("returns early when the backing event does not exist", async () => {
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      event_id: "evt_1",
    } as never);
    vi.mocked(findEventById).mockResolvedValue(null);

    await runExecution(pool, "relayos", config, registry, "exe_1", emitSignal);

    expect(updateExecutionStatus).not.toHaveBeenCalled();
  });

  it("marks the execution failed when no plugin is registered", async () => {
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      event_id: "evt_1",
      attempt: 0,
    } as never);
    vi.mocked(findEventById).mockResolvedValue({
      id: "evt_1",
      provider: "github",
      event_name: "push",
    } as never);
    vi.mocked(updateExecutionStatus)
      .mockResolvedValueOnce({
        id: "exe_1",
        event_id: "evt_1",
      } as never)
      .mockResolvedValueOnce({ id: "exe_1", status: ExecutionStatus.Failed } as never);
    registry.get.mockReturnValue(undefined);

    await runExecution(pool, "relayos", config, registry, "exe_1", emitSignal);

    expect(updateExecutionStatus).toHaveBeenNthCalledWith(
      2,
      pool,
      "relayos",
      "exe_1",
      ExecutionStatus.Failed,
      expect.objectContaining({
        errorMessage: 'No plugin registered for provider "github"',
      }),
    );
  });

  it("completes as a no-op when no handler resolves", async () => {
    const plugin = { provider: "github" };
    vi.mocked(findExecutionById).mockResolvedValue({
      id: "exe_1",
      event_id: "evt_1",
      attempt: 0,
    } as never);
    vi.mocked(findEventById).mockResolvedValue({
      id: "evt_1",
      provider: "github",
      event_name: "push",
    } as never);
    vi.mocked(updateExecutionStatus)
      .mockResolvedValueOnce({
        id: "exe_1",
        event_id: "evt_1",
      } as never)
      .mockResolvedValueOnce({ id: "exe_1", status: ExecutionStatus.Completed } as never);
    registry.get.mockReturnValue(plugin);
    vi.mocked(resolveHandler).mockReturnValue(null);

    await runExecution(pool, "relayos", config, registry, "exe_1", emitSignal);

    expect(resolveHandler).toHaveBeenCalledWith(plugin, "push");
    expect(updateExecutionStatus).toHaveBeenNthCalledWith(
      2,
      pool,
      "relayos",
      "exe_1",
      ExecutionStatus.Completed,
      expect.objectContaining({ finishedAt: expect.any(Date) }),
    );
  });

  it("runs the resolved handler and emits completion signals", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const plugin = { provider: "github" };
    const runningExecution = {
      id: "exe_1",
      event_id: "evt_1",
      attempt: 0,
    };
    const event = {
      id: "evt_1",
      provider: "github",
      event_name: "push",
      external_event_id: "ext_1",
      payload: { ok: true },
      raw_payload: { raw: true },
      headers: { "x-test": "1" },
      received_at: new Date("2024-01-01T00:00:00.000Z"),
      created_at: new Date("2024-01-01T00:00:01.000Z"),
    };
    const ctx = { step: vi.fn() };

    vi.mocked(findExecutionById).mockResolvedValue(runningExecution as never);
    vi.mocked(findEventById).mockResolvedValue(event as never);
    vi.mocked(updateExecutionStatus)
      .mockResolvedValueOnce(runningExecution as never)
      .mockResolvedValueOnce({ id: "exe_1", status: ExecutionStatus.Completed } as never);
    registry.get.mockReturnValue(plugin);
    vi.mocked(resolveHandler).mockReturnValue(handler);
    vi.mocked(createContext).mockReturnValue(ctx as never);

    await runExecution(pool, "relayos", config, registry, "exe_1", emitSignal);

    expect(createContext).toHaveBeenCalledWith(
      pool,
      "relayos",
      runningExecution,
      expect.objectContaining({
        provider: "github",
        eventName: "push",
        externalEventId: "ext_1",
      }),
      emitSignal,
    );
    expect(handler).toHaveBeenCalledWith(ctx);
    expect(emitSignal).toHaveBeenCalledWith({
      type: "execution_started",
      executionId: "exe_1",
      eventId: "evt_1",
    });
    expect(emitSignal).toHaveBeenCalledWith({
      type: "execution_completed",
      executionId: "exe_1",
    });
  });

  it("marks the execution failed and schedules a retry when the handler throws", async () => {
    const error = new Error("boom");
    const handler = vi.fn().mockRejectedValue(error);
    const plugin = { provider: "github" };
    const runningExecution = {
      id: "exe_1",
      event_id: "evt_1",
      attempt: 1,
    };

    vi.mocked(findExecutionById).mockResolvedValue(runningExecution as never);
    vi.mocked(findEventById).mockResolvedValue({
      id: "evt_1",
      provider: "github",
      event_name: "push",
      external_event_id: "ext_1",
      payload: {},
      raw_payload: {},
      headers: {},
      received_at: new Date(),
      created_at: new Date(),
    } as never);
    vi.mocked(updateExecutionStatus)
      .mockResolvedValueOnce(runningExecution as never)
      .mockResolvedValueOnce({ id: "exe_1", status: ExecutionStatus.Failed } as never);
    registry.get.mockReturnValue(plugin);
    vi.mocked(resolveHandler).mockReturnValue(handler);
    vi.mocked(createContext).mockReturnValue({} as never);

    await runExecution(pool, "relayos", config, registry, "exe_1", emitSignal);

    expect(updateExecutionStatus).toHaveBeenNthCalledWith(
      2,
      pool,
      "relayos",
      "exe_1",
      ExecutionStatus.Failed,
      expect.objectContaining({
        errorMessage: "boom",
        finishedAt: expect.any(Date),
      }),
    );
    expect(emitSignal).toHaveBeenCalledWith({
      type: "execution_failed",
      executionId: "exe_1",
      errorMessage: "boom",
    });
    expect(scheduleRetry).toHaveBeenCalledWith(
      pool,
      "relayos",
      runningExecution,
      config.retry,
      emitSignal,
    );
  });

  it("stringifies non-Error failures before persisting execution failure", async () => {
    const handler = vi.fn().mockRejectedValue("timeout");
    const plugin = { provider: "github" };
    const runningExecution = {
      id: "exe_2",
      event_id: "evt_2",
      attempt: 1,
    };

    vi.mocked(findExecutionById).mockResolvedValue(runningExecution as never);
    vi.mocked(findEventById).mockResolvedValue({
      id: "evt_2",
      provider: "github",
      event_name: "push",
      external_event_id: "ext_2",
      payload: {},
      raw_payload: {},
      headers: {},
      received_at: new Date(),
      created_at: new Date(),
    } as never);
    vi.mocked(updateExecutionStatus)
      .mockResolvedValueOnce(runningExecution as never)
      .mockResolvedValueOnce({ id: "exe_2", status: ExecutionStatus.Failed } as never);
    registry.get.mockReturnValue(plugin);
    vi.mocked(resolveHandler).mockReturnValue(handler);
    vi.mocked(createContext).mockReturnValue({} as never);

    await runExecution(pool, "relayos", config, registry, "exe_2", emitSignal);

    expect(updateExecutionStatus).toHaveBeenNthCalledWith(
      2,
      pool,
      "relayos",
      "exe_2",
      ExecutionStatus.Failed,
      expect.objectContaining({
        errorMessage: "timeout",
      }),
    );
  });
});
