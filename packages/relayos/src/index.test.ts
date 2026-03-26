import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const originalCwd = process.cwd();

  beforeEach(() => {
    createRelayOS.mockReset();
    process.chdir(originalCwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("forwards config and plugins to core createRelayOS", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
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
        backoffBaseMs: 1000,
        backoffMultiplier: 2,
        backoffMaxMs: 60000,
      },
      concurrency: {
        maxConcurrent: 20,
      },
      retryPollIntervalMs: 5000,
      plugins: [plugin as never],
      logLevel: "error",
    });

    await result.start();

    expect(createRelayOS).toHaveBeenCalledTimes(1);
    expect(createRelayOS).toHaveBeenCalledWith({
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
      logLevel: "error",
      plugins: [plugin],
    });
    expect(runtime.start).toHaveBeenCalledTimes(2);
  });

  it("auto-loads relayos.config.ts when called without arguments", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue(undefined),
      processEvent: vi.fn(),
      shutdown: vi.fn(),
    };
    createRelayOS.mockReturnValue(runtime);

    const dir = mkdtempSync(join(tmpdir(), "relayos-config-"));
    writeFileSync(
      join(dir, "relayos.config.ts"),
      `export default {
  database: {
    connectionString: "postgres://localhost:5432/relayos",
    schema: "relayos"
  },
  logLevel: "info",
  plugins: []
};
`,
    );

    process.chdir(dir);

    const result = await relayos();

    expect(createRelayOS).toHaveBeenCalledTimes(1);
    expect(createRelayOS).toHaveBeenCalledWith({
      database: {
        connectionString: "postgres://localhost:5432/relayos",
        schema: "relayos",
      },
      logLevel: "info",
      plugins: [],
    });
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(result).toBe(runtime);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when no relayos config file exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relayos-missing-config-"));
    process.chdir(dir);

    await expect(relayos()).rejects.toThrow(
      "No RelayOS config found. Create relayos.config.ts, relayos.config.js, or relayos.config.mjs.",
    );

    rmSync(dir, { recursive: true, force: true });
  });
});
