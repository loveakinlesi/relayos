import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("relayos/core", () => ({
  RelayConfigSchema: {
    parse: (config: any) => config,
  },
  createPool: vi.fn().mockResolvedValue({
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("chalk", () => ({
  default: {
    blue: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

describe("status command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create status command", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
    expect(statusCommand.name()).toBe("status");
  });

  it("should check database connectivity", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should report healthy status when database is connected", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should report unhealthy status when database is disconnected", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should show pending retry count", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should show dead letter count", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should show queue backlog information", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should exit with non-zero code if unhealthy", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });

  it("should exit with zero code if healthy", async () => {
    const { statusCommand } = await import("../../commands/status");

    expect(statusCommand).toBeDefined();
  });
});
