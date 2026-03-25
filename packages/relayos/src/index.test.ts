import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRelayOS } = vi.hoisted(() => ({
  createRelayOS: vi.fn(),
}));

vi.mock("relayos/core", () => ({
  createRelayOS,
  ExecutionStatus: {
    Pending: "pending",
    Running: "running",
    Completed: "completed",
    Failed: "failed",
    Retrying: "retrying",
  },
  StepStatus: {
    Pending: "pending",
    Running: "running",
    Completed: "completed",
    Failed: "failed",
  },
}));

import { relayos } from "./index.js";

describe("relayos", () => {
  beforeEach(() => {
    createRelayOS.mockReset();
  });

  it("forwards config and plugins to core createRelayOS", () => {
    const runtime = {
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    createRelayOS.mockReturnValue(runtime);

    const plugin = { provider: "github" };

    const result = relayos({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 5,
        backoffBaseMs: 1_000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 20,
      },
      retryPollIntervalMs: 5_000,
      plugins: [plugin as never],
    });

    expect(createRelayOS).toHaveBeenCalledTimes(1);
    expect(createRelayOS).toHaveBeenCalledWith(
      {
        database: {
          connectionString: "postgres://localhost:5432/relayos",
          schema: "relayos",
        },
        retry: {
          maxAttempts: 5,
          backoffBaseMs: 1_000,
          backoffMultiplier: 2,
          backoffMaxMs: 60_000,
        },
        concurrency: {
          maxConcurrent: 20,
        },
        retryPollIntervalMs: 5_000,
      },
      [plugin],
    );
    expect(result).toBe(runtime);
  });
});
