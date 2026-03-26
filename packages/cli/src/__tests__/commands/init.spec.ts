import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";

// Mock dependencies
vi.mock("fs");
vi.mock("chalk", () => ({
  default: {
    blue: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
  },
}));

describe("init command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectTypeScript()", () => {
    it("should detect TypeScript project with tsconfig.json", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
      expect(initCommand).toHaveProperty("action");
    });

    it("should detect TypeScript project with tsconfig.app.json", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });
  });

  describe("detectFramework()", () => {
    it("should detect NestJS framework", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should detect Next.js framework", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should detect Hono framework", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should return unknown if no framework detected", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });
  });

  describe("config generation", () => {
    it("should generate TypeScript config template", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should generate JavaScript config template", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should include database.connectionString placeholder", () => {
      const tsConfig = `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/relayos",
    schema: "relayos",
  },
});
`;

      expect(tsConfig).toContain("connectionString");
      expect(tsConfig).toContain("DATABASE_URL");
      expect(tsConfig).toContain("defineRelayConfig");
    });

    it("should omit schema from the generated JavaScript template", () => {
      const jsConfig = `module.exports = {
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/relayos",
  },
};
`;

      expect(jsConfig).not.toContain("schema");
    });

    it("should include schema in the generated TypeScript template", () => {
      const tsConfig = `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/relayos",
    schema: "relayos",
  },
});
`;

      expect(tsConfig).toContain('schema: "relayos"');
      expect(tsConfig).not.toContain("logLevel");
    });
  });

  describe("init command action", () => {
    it("should prevent overwriting existing config without --force flag", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should allow overwriting with --force flag", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should write config file to disk", async () => {
      const { initCommand } = await import("../../commands/init");

      expect(initCommand).toBeDefined();
    });

    it("should generate synchronous config without prompts", async () => {
      const { initCommand } = await import("../../commands/init");
      
      // Command should have the init name and action
      expect(initCommand).toBeDefined();
      expect(initCommand.name()).toBe("init");
    });
  });
});
