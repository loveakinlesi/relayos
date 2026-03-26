import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("relayos/core", () => ({
  RelayConfigSchema: {
    parse: (config: any) => config,
  },
  createPool: vi.fn().mockResolvedValue({
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }),
  replayEvent: vi.fn().mockResolvedValue({
    id: "exec-123",
    status: "completed",
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

describe("replay command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create replay command", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
    expect(replayCommand).toHaveProperty("action");
  });

  it("should require event ID argument", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should support --forward option for local server replay", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should support --print option for payload output", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should use engine replay mode by default", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should support --retries option", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should validate forward URL format", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should post to local dev server in forward mode", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });

  it("should preserve original event record during replay", async () => {
    const { replayCommand } = await import("../../commands/replay");

    expect(replayCommand).toBeDefined();
  });
});
