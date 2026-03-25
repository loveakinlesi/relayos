import { beforeEach, describe, expect, it, vi } from "vitest";
import { relayosInternals } from "./runtime/internals.js";
import { ExecutionStatus } from "./types/event.js";

const mocks = vi.hoisted(() => ({
  createPool: vi.fn(),
  createRetryPoller: vi.fn(),
  createEngine: vi.fn(),
  runExecution: vi.fn(),
  findExecutionById: vi.fn(),
  findStepsByExecution: vi.fn(),
  findExecutionsByStatus: vi.fn(),
  replayEvent: vi.fn(),
  resumeFailedExecution: vi.fn(),
  updateExecutionStatus: vi.fn(),
}));

vi.mock("./persistence/client.js", () => ({
  createPool: mocks.createPool,
}));

vi.mock("./runtime/retry-poller.js", () => ({
  createRetryPoller: mocks.createRetryPoller,
}));

vi.mock("./runtime/engine.js", () => ({
  createEngine: mocks.createEngine,
}));

vi.mock("./runtime/execute.js", () => ({
  runExecution: mocks.runExecution,
}));

vi.mock("./persistence/executions.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./persistence/executions.repo.js")>(
    "./persistence/executions.repo.js",
  );

  return {
    ...actual,
    findExecutionById: mocks.findExecutionById,
    findExecutionsByStatus: mocks.findExecutionsByStatus,
    updateExecutionStatus: mocks.updateExecutionStatus,
  };
});

vi.mock("./persistence/steps.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./persistence/steps.repo.js")>(
    "./persistence/steps.repo.js",
  );

  return {
    ...actual,
    findStepsByExecution: mocks.findStepsByExecution,
  };
});

vi.mock("./replay/replay.js", async () => {
  const actual = await vi.importActual<typeof import("./replay/replay.js")>("./replay/replay.js");

  return {
    ...actual,
    replayEvent: mocks.replayEvent,
  };
});

vi.mock("./replay/resume.js", async () => {
  const actual = await vi.importActual<typeof import("./replay/resume.js")>("./replay/resume.js");

  return {
    ...actual,
    resumeFailedExecution: mocks.resumeFailedExecution,
  };
});

import { createRelayOS } from "./index.js";

describe("createRelayOS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPool.mockReturnValue({ end: vi.fn() });
    mocks.runExecution.mockResolvedValue(undefined);
    mocks.createEngine.mockReturnValue({
      processEvent: vi.fn().mockResolvedValue("evt_1"),
      ingestNormalizedEvent: vi.fn().mockResolvedValue({
        eventId: "evt_1",
        deduplicated: false,
      }),
    });
    mocks.createRetryPoller.mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    });
    mocks.findExecutionsByStatus.mockResolvedValue([]);
  });

  it("does not start background workers until start() is called", async () => {
    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    const poller = mocks.createRetryPoller.mock.results[0]?.value;
    expect(poller.start).not.toHaveBeenCalled();

    await runtime.start();

    expect(poller.start).toHaveBeenCalledTimes(1);
  });

  it("starts only once and recovers running executions", async () => {
    mocks.findExecutionsByStatus.mockResolvedValue([
      { id: "exe_running", status: ExecutionStatus.Running },
      { id: "exe_retrying", status: ExecutionStatus.Retrying },
    ]);
    mocks.updateExecutionStatus.mockResolvedValue({ id: "exe_running" });

    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    await runtime.start();
    await Promise.resolve();
    await runtime.start();

    expect(mocks.createRetryPoller.mock.results[0]?.value.start).toHaveBeenCalledTimes(1);
    expect(mocks.updateExecutionStatus).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "relayos",
      "exe_running",
      ExecutionStatus.Pending,
    );
    expect(mocks.updateExecutionStatus).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "relayos",
      "exe_retrying",
      ExecutionStatus.Pending,
    );
    expect(mocks.runExecution).toHaveBeenCalledWith(
      expect.anything(),
      "relayos",
      expect.anything(),
      expect.anything(),
      "exe_running",
      expect.any(Function),
    );
    expect(mocks.runExecution).toHaveBeenCalledWith(
      expect.anything(),
      "relayos",
      expect.anything(),
      expect.anything(),
      "exe_retrying",
      expect.any(Function),
    );
  });

  it("exposes plugin lookup and progress inspection", async () => {
    mocks.findExecutionById.mockResolvedValue({
      id: "exe_1",
      attempt: 2,
      started_at: new Date("2024-01-01T00:00:00.000Z"),
      finished_at: null,
    });
    mocks.findStepsByExecution.mockResolvedValue([
      { step_name: "a", status: "completed" },
      { step_name: "b", status: "pending" },
    ]);

    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [
        {
          provider: "github",
          async verify() {},
          async normalize() {
            return {
              provider: "github",
              eventName: "push",
              externalEventId: "evt_1",
              payload: {},
              rawPayload: {},
              headers: {},
            };
          },
          resolveHandler() {
            return null;
          },
        },
      ],
    });

    expect(runtime.getPlugin("github")?.provider).toBe("github");
    await expect(runtime.progress("exe_1")).resolves.toEqual(
      expect.objectContaining({
        completedSteps: ["a"],
        pendingSteps: ["b"],
        attemptCount: 2,
      }),
    );
  });

  it("delegates ingest, replay, and resume and supports signal subscriptions", async () => {
    const processEvent = vi.fn().mockResolvedValue("evt_raw");
    const ingestNormalizedEvent = vi.fn().mockResolvedValue({
      eventId: "evt_normalized",
      deduplicated: true,
    });
    mocks.createEngine.mockReturnValue({
      processEvent,
      ingestNormalizedEvent,
    });

    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    const internals = (runtime as Record<PropertyKey, unknown>)[relayosInternals] as {
      emitSignal: (signal: { type: "execution_completed"; executionId: string }) => void;
    };

    internals.emitSignal({ type: "execution_completed", executionId: "exe_1" });
    unsubscribe();
    internals.emitSignal({ type: "execution_completed", executionId: "exe_2" });

    await expect(
      runtime.ingestEvent({
        provider: "github",
        eventName: "push",
        externalEventId: "evt_ext",
        payload: {},
        rawPayload: {},
        headers: {},
      }),
    ).resolves.toEqual({ eventId: "evt_normalized", deduplicated: true });

    await expect(
      runtime.processEvent({
        provider: "github",
        rawBody: Buffer.from("{}"),
        headers: {},
      }),
    ).resolves.toBe("evt_raw");

    await runtime.replay("evt_1");
    await runtime.resume("exe_1");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(mocks.replayEvent).toHaveBeenCalledWith(runtime, "evt_1");
    expect(mocks.resumeFailedExecution).toHaveBeenCalledWith(runtime, "exe_1");
  });

  it("exposes callable runtime internals for advanced integrations", async () => {
    const poller = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };
    const ingestNormalizedEvent = vi.fn().mockResolvedValue({
      eventId: "evt_2",
      deduplicated: false,
    });
    mocks.createRetryPoller.mockReturnValue(poller);
    mocks.createEngine.mockReturnValue({
      processEvent: vi.fn().mockResolvedValue("evt_2"),
      ingestNormalizedEvent,
    });

    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    const internals = (runtime as Record<PropertyKey, unknown>)[relayosInternals] as {
      stopRetryPoller: () => void;
      startRetryPoller: () => Promise<void>;
      subscribe: (listener: (signal: { type: "execution_started"; executionId: string; eventId: string }) => void) => () => void;
      emitSignal: (signal: { type: "execution_started"; executionId: string; eventId: string }) => void;
      setStarted: (value: boolean) => void;
      ingestNormalizedEvent: (event: {
        provider: string;
        eventName: string;
        externalEventId: string;
        payload: object;
        rawPayload: object;
        headers: Record<string, string>;
      }) => Promise<{ eventId: string; deduplicated: boolean }>;
    };
    const listener = vi.fn();

    const unsubscribe = internals.subscribe(listener);
    internals.emitSignal({ type: "execution_started", executionId: "exe_1", eventId: "evt_1" });
    unsubscribe();
    internals.setStarted(true);
    await internals.startRetryPoller();
    internals.stopRetryPoller();
    await expect(
      internals.ingestNormalizedEvent({
        provider: "github",
        eventName: "push",
        externalEventId: "evt_ext",
        payload: {},
        rawPayload: {},
        headers: {},
      }),
    ).resolves.toEqual({ eventId: "evt_2", deduplicated: false });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(poller.start).toHaveBeenCalledTimes(1);
    expect(poller.stop).toHaveBeenCalledTimes(1);
  });

  it("accepts the legacy plugin argument signature", () => {
    createRelayOS(
      {
        database: {
          connectionString: "postgres://localhost:5432/relayos",
          schema: "relayos",
        },
        retry: {
          maxAttempts: 3,
          backoffBaseMs: 1000,
          backoffMultiplier: 2,
          backoffMaxMs: 60_000,
        },
        concurrency: {
          maxConcurrent: 10,
        },
        retryPollIntervalMs: 5000,
      },
      [
        {
          provider: "github",
          async verify() {},
          async normalize() {
            return {
              provider: "github",
              eventName: "push",
              externalEventId: "evt_legacy",
              payload: {},
              rawPayload: {},
              headers: {},
            };
          },
          resolveHandler() {
            return null;
          },
        },
      ],
    );

    expect(mocks.createEngine).toHaveBeenCalled();
  });

  it("defaults to an empty plugin list when none is provided", () => {
    createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
    });

    expect(mocks.createEngine).toHaveBeenCalled();
  });

  it("fails fast on invalid non-object configuration input", () => {
    expect(() => createRelayOS("invalid" as never)).toThrow();
    expect(mocks.createPool).not.toHaveBeenCalled();
  });

  it("throws when progress is requested for an unknown execution", async () => {
    mocks.findExecutionById.mockResolvedValue(null);

    const runtime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    await expect(runtime.progress("missing")).rejects.toThrow('Execution "missing" not found');
  });

  it("shuts down the owned pool and skips closing an injected pool", async () => {
    const ownedPool = { end: vi.fn() };
    mocks.createPool.mockReturnValue(ownedPool);

    const ownedRuntime = createRelayOS({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    await ownedRuntime.shutdown();

    expect(mocks.createRetryPoller.mock.results[0]?.value.stop).toHaveBeenCalledTimes(1);
    expect(ownedPool.end).toHaveBeenCalledTimes(1);

    const injectedPool = { end: vi.fn() };
    const injectedRuntime = createRelayOS({
      database: {
        pool: injectedPool as never,
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5000,
      plugins: [],
    });

    await injectedRuntime.shutdown();

    expect(injectedPool.end).not.toHaveBeenCalled();
  });
});
