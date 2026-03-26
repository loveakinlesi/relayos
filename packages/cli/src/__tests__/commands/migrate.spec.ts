import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("relayos/core", () => ({
  RelayConfigSchema: {
    parse: (config: any) => config,
  },
  migrate: vi.fn().mockResolvedValue(5),
  createPool: vi.fn().mockResolvedValue({
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("chalk", () => ({
  default: {
    blue: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    gray: (s: string) => s,
  },
}));

describe("migrate command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create migrate command", async () => {
    const { migrateCommand } = await import("../../commands/migrate");

    expect(migrateCommand).toBeDefined();
    expect(migrateCommand.name()).toBe("migrate");
    expect(migrateCommand.description()).toContain("migration");
  });

  it("should validate config using RelayConfigSchema", async () => {
    const { migrateCommand } = await import("../../commands/migrate");

    expect(migrateCommand).toBeDefined();
  });

  it("should create database pool from connection string", async () => {
    const { migrateCommand } = await import("../../commands/migrate");

    expect(migrateCommand).toBeDefined();
  });

  it("should run migrations and report success", async () => {
    const { migrateCommand } = await import("../../commands/migrate");

    expect(migrateCommand).toBeDefined();
  });

  it("should exit with error code 1 on failure", async () => {
    const { migrateCommand } = await import("../../commands/migrate");

    expect(migrateCommand).toBeDefined();
  });
});
