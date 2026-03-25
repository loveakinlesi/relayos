import "reflect-metadata";

import { Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCore = vi.hoisted(() => ({
  createRelayOS: vi.fn(),
  replayEvent: vi.fn(),
  resumeFailedExecution: vi.fn(),
  getRelayOSInternals: vi.fn(),
  findExecutionById: vi.fn(),
  findStepsByExecution: vi.fn(),
  updateExecutionStatus: vi.fn(),
}));

vi.mock("relayos/core", () => ({
  createRelayOS: mockedCore.createRelayOS,
  ExecutionStatus: {
    Pending: "pending",
    Running: "running",
    Completed: "completed",
    Failed: "failed",
    Retrying: "retrying",
    Cancelled: "cancelled",
  },
}));

vi.mock("relayos/core/replay/replay", () => ({
  replayEvent: mockedCore.replayEvent,
}));

vi.mock("relayos/core/replay/resume", () => ({
  resumeFailedExecution: mockedCore.resumeFailedExecution,
}));

vi.mock("relayos/core/runtime/internals", () => ({
  getRelayOSInternals: mockedCore.getRelayOSInternals,
}));

vi.mock("relayos/core/persistence/executions.repo", () => ({
  findExecutionById: mockedCore.findExecutionById,
  updateExecutionStatus: mockedCore.updateExecutionStatus,
}));

vi.mock("relayos/core/persistence/steps.repo", () => ({
  findStepsByExecution: mockedCore.findStepsByExecution,
}));

import {
  RELAYOS_RUNTIME,
  RelayOSModule,
  RelayOSService,
  handleNestWebhook,
  normalizeHeaders,
} from "./index.js";

describe("RelayOSModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers runtime with forRoot and allows RelayOSService injection", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "github" } as never],
        }),
      ],
    }).compile();

    expect(moduleRef.get(RelayOSService)).toBeInstanceOf(RelayOSService);
    expect(moduleRef.get(RELAYOS_RUNTIME)).toBe(runtime);
    expect(mockedCore.createRelayOS).toHaveBeenCalledWith({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      retry: {
        maxAttempts: 3,
        backoffBaseMs: 1_000,
        backoffMultiplier: 2,
        backoffMaxMs: 60_000,
      },
      concurrency: {
        maxConcurrent: 10,
      },
      retryPollIntervalMs: 5_000,
      plugins: [{ provider: "github" }],
    });
  });

  it("registers runtime with forRootAsync", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);

    @Module({})
    class ConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async () => ({
            database: {
              connectionString: "postgres://localhost:5432/relayos",
              schema: "relayos_async",
            },
            retry: {
              maxAttempts: 5,
              backoffBaseMs: 500,
              backoffMultiplier: 2,
              backoffMaxMs: 30_000,
            },
            concurrency: {
              maxConcurrent: 20,
            },
            retryPollIntervalMs: 2_000,
            plugins: [{ provider: "stripe" } as never],
          }),
        }),
      ],
    }).compile();

    expect(moduleRef.get(RelayOSService)).toBeInstanceOf(RelayOSService);
    expect(mockedCore.createRelayOS).toHaveBeenCalledWith({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos_async",
      },
      retry: {
        maxAttempts: 5,
        backoffBaseMs: 500,
        backoffMultiplier: 2,
        backoffMaxMs: 30_000,
      },
      concurrency: {
        maxConcurrent: 20,
      },
      retryPollIntervalMs: 2_000,
      plugins: [{ provider: "stripe" }],
    });
  });
});

describe("RelayOSService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates handle(provider, req, res) to runtime.processEvent", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "github" } as never],
        }),
      ],
    }).compile();

    const service = moduleRef.get(RelayOSService);
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await service.handle(
      "github",
      {
        rawBody: Buffer.from("{}"),
        headers: {
          "X-GitHub-Event": "push",
        },
      },
      response,
    );

    expect(runtime.processEvent).toHaveBeenCalledWith({
      provider: "github",
      rawBody: Buffer.from("{}"),
      headers: {
        "x-github-event": "push",
      },
    });
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it("returns 404 for unknown provider handling", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn().mockRejectedValue({
        code: "PLUGIN_NOT_FOUND",
        message: "No plugin registered for provider: \"github\"",
      }),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "stripe" } as never],
        }),
      ],
    }).compile();

    const service = moduleRef.get(RelayOSService);
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await service.handle(
      "github",
      { rawBody: Buffer.from("{}"), headers: {} },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      ok: false,
      message: "No plugin registered for provider: \"github\"",
      code: "PLUGIN_NOT_FOUND",
    });
  });

  it("supports replay, resume, stop, and progress", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);
    mockedCore.getRelayOSInternals.mockReturnValue({
      pool: { query: vi.fn() },
      schema: "relayos",
    });
    mockedCore.updateExecutionStatus.mockResolvedValue({ id: "exe_1", status: "cancelled" });
    mockedCore.findExecutionById.mockResolvedValue({ id: "exe_1", status: "running" });
    mockedCore.findStepsByExecution.mockResolvedValue([
      { id: "step_1", status: "completed" },
      { id: "step_2", status: "failed" },
      { id: "step_3", status: "pending" },
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "github" } as never],
        }),
      ],
    }).compile();

    const service = moduleRef.get(RelayOSService);

    await service.replay("evt_1");
    await service.resume("exe_1");
    await service.stop("exe_1");
    const progress = await service.progress("exe_1");

    expect(mockedCore.replayEvent).toHaveBeenCalledWith(runtime, "evt_1");
    expect(mockedCore.resumeFailedExecution).toHaveBeenCalledWith(runtime, "exe_1");
    expect(mockedCore.updateExecutionStatus).toHaveBeenCalled();
    expect(progress.summary).toEqual({
      totalSteps: 3,
      completedSteps: 1,
      failedSteps: 1,
      pendingSteps: 1,
    });
  });

  it("exposes the runtime instance and shuts it down on module destroy", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "github" } as never],
        }),
      ],
    }).compile();

    const service = moduleRef.get(RelayOSService);

    expect(service.instance).toBe(runtime);

    await service.onModuleDestroy();

    expect(runtime.shutdown).toHaveBeenCalledTimes(1);
  });

  it("throws when progress is requested for an unknown execution", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    mockedCore.createRelayOS.mockReturnValue(runtime);
    mockedCore.getRelayOSInternals.mockReturnValue({
      pool: { query: vi.fn() },
      schema: "relayos",
    });
    mockedCore.findExecutionById.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      imports: [
        RelayOSModule.forRoot({
          database: {
            connectionString: "postgres://localhost:5432/relayos",
            schema: "relayos",
          },
          retry: {
            maxAttempts: 3,
            backoffBaseMs: 1_000,
            backoffMultiplier: 2,
            backoffMaxMs: 60_000,
          },
          concurrency: {
            maxConcurrent: 10,
          },
          retryPollIntervalMs: 5_000,
          plugins: [{ provider: "github" } as never],
        }),
      ],
    }).compile();

    await expect(moduleRef.get(RelayOSService).progress("missing")).rejects.toThrow(
      'Execution "missing" not found',
    );
  });
});

describe("pure helpers", () => {
  it("normalizes headers", () => {
    expect(
      normalizeHeaders({
        "X-Signature": "abc",
        "X-Multi": ["a", "b"],
      }),
    ).toEqual({
      "x-signature": "abc",
      "x-multi": "a",
    });
  });

  it("normalizes mixed header value shapes", () => {
    expect(
      normalizeHeaders({
        "X-Flag": true,
        "X-Count": 3,
        "X-Empty": [],
        "X-Null": null,
      }),
    ).toEqual({
      "x-flag": "true",
      "x-count": "3",
    });
    expect(normalizeHeaders(undefined)).toEqual({});
  });

  it("rejects blank providers in handleNestWebhook", async () => {
    const result = await handleNestWebhook(
      { processEvent: vi.fn() },
      "   ",
      { rawBody: Buffer.from("{}"), headers: {} },
    );

    expect(result).toEqual({
      statusCode: 400,
      body: {
        ok: false,
        message: "Route param 'provider' is required.",
        code: "PROVIDER_REQUIRED",
      },
    });
  });

  it("rejects requests without raw body data", async () => {
    const result = await handleNestWebhook(
      { processEvent: vi.fn() },
      "github",
      { headers: {} },
    );

    expect(result).toEqual({
      statusCode: 400,
      body: {
        ok: false,
        message: "rawBody is required. Configure Nest to preserve raw request bytes.",
        code: "RAW_BODY_REQUIRED",
      },
    });
  });

  it("accepts string request bodies when rawBody is unavailable", async () => {
    const processEvent = vi.fn().mockResolvedValue(undefined);

    const result = await handleNestWebhook(
      { processEvent },
      " github ",
      {
        body: "{}",
        headers: { "X-Test": "1" },
      },
    );

    expect(result).toEqual({
      statusCode: 202,
      body: {
        ok: true,
        message: "Webhook accepted.",
      },
    });
    expect(processEvent).toHaveBeenCalledWith({
      provider: "github",
      rawBody: Buffer.from("{}"),
      headers: { "x-test": "1" },
    });
  });

  it("maps verification errors in handleNestWebhook", async () => {
    const result = await handleNestWebhook(
      {
        processEvent: vi.fn().mockRejectedValue({
          code: "VERIFICATION_FAILED",
          message: "invalid signature",
        }),
      },
      "stripe",
      {
        rawBody: Buffer.from("{}"),
        headers: {},
      },
    );

    expect(result).toEqual({
      statusCode: 401,
      body: {
        ok: false,
        message: "invalid signature",
        code: "VERIFICATION_FAILED",
      },
    });
  });

  it("uses default verification and provider messages when runtime errors omit them", async () => {
    const verification = await handleNestWebhook(
      {
        processEvent: vi.fn().mockRejectedValue({
          code: "VERIFICATION_FAILED",
        }),
      },
      "stripe",
      {
        rawBody: Buffer.from("{}"),
        headers: {},
      },
    );
    const provider = await handleNestWebhook(
      {
        processEvent: vi.fn().mockRejectedValue({
          code: "PLUGIN_NOT_FOUND",
        }),
      },
      "stripe",
      {
        rawBody: Buffer.from("{}"),
        headers: {},
      },
    );

    expect(verification).toEqual({
      statusCode: 401,
      body: {
        ok: false,
        message: "Webhook verification failed.",
        code: "VERIFICATION_FAILED",
      },
    });
    expect(provider).toEqual({
      statusCode: 404,
      body: {
        ok: false,
        message: "No plugin registered for provider.",
        code: "PLUGIN_NOT_FOUND",
      },
    });
  });

  it("maps unknown runtime failures to a safe 500 response", async () => {
    const result = await handleNestWebhook(
      {
        processEvent: vi.fn().mockRejectedValue(new Error("db exploded")),
      },
      "stripe",
      {
        rawBody: Buffer.from("{}"),
        headers: {},
      },
    );

    expect(result).toEqual({
      statusCode: 500,
      body: {
        ok: false,
        message: "Unexpected webhook processing failure.",
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("maps non-object runtime failures to a safe 500 response", async () => {
    const result = await handleNestWebhook(
      {
        processEvent: vi.fn().mockRejectedValue("panic"),
      },
      "stripe",
      {
        rawBody: Buffer.from("{}"),
        headers: {},
      },
    );

    expect(result.statusCode).toBe(500);
    expect(result.body.code).toBe("INTERNAL_ERROR");
  });
});
