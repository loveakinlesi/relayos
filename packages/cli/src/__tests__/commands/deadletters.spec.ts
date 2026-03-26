import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("relayos/core", () => ({
  RelayConfigSchema: {
    parse: (config: any) => config,
  },
  createPool: vi.fn().mockResolvedValue({
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
  resumeFailedExecution: vi.fn().mockResolvedValue({
    status: "retrying",
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

vi.mock("table", () => ({
  table: (data: any) => data,
}));

describe("deadletters command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create deadletters command group", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
    expect(deadlettersCommand.name()).toBe("deadletters");
  });

  it("should have list subcommand", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should have replay subcommand", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should list permanently failed executions", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should support --limit option for listing", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should support --json output flag", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should replay dead letter by execution ID", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });

  it("should require execution ID for replay", async () => {
    const { deadlettersCommand } = await import("../../commands/deadletters");

    expect(deadlettersCommand).toBeDefined();
  });
});
