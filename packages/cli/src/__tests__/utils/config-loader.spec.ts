import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

vi.mock("relayos/core", () => ({
  RelayConfigSchema: {
    safeParse: (config: any) => {
      // Simple validation - require connectionString or pool
      if (!config.database?.connectionString && !config.database?.pool) {
        return {
          success: false,
          error: {
            issues: [
              {
                code: "custom",
                message: "database.connectionString or database.pool is required",
                path: ["database"],
              },
            ],
          },
        };
      }
      return {
        success: true,
        data: {
          database: {
            connectionString: config.database?.connectionString,
            pool: config.database?.pool,
            schema: config.database?.schema || "relayos",
          },
          logLevel: config.logLevel || "info",
          retry: config.retry || {},
          concurrency: config.concurrency || {},
          retryPollIntervalMs: config.retryPollIntervalMs || 5000,
        },
      };
    },
  },
}));

vi.mock("chalk", () => ({
  default: {
    red: (s: string) => s,
    gray: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

import { loadConfig } from "../../utils/config-loader";

describe("config-loader", () => {
  const originalCwd = process.cwd();
  let testDir: string;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    testDir = mkdtempSync(join(originalCwd, ".relayos-config-loader-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.restoreAllMocks();
  });

  describe("loadConfig()", () => {
    it("should load config from relayos.config.ts file", async () => {
      writeFileSync(
        join(testDir, "relayos.config.ts"),
        `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: "postgres://localhost/relayos",
    schema: "relayos"
  },
  logLevel: "info"
});
`,
      );

      const config = await loadConfig();

      expect(config).toEqual({
        database: {
          connectionString: "postgres://localhost/relayos",
          schema: "relayos",
          pool: undefined,
        },
        logLevel: "info",
        retry: expect.any(Object),
        concurrency: expect.any(Object),
        retryPollIntervalMs: expect.any(Number),
      });
    });

    it("should load config from relayos.config.js file", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    connectionString: "postgres://localhost/relayos",
    schema: "relayos"
  },
  logLevel: "info"
};
`,
      );

      const config = await loadConfig();

      expect(config.database.connectionString).toBe("postgres://localhost/relayos");
      expect(config.database.schema).toBe("relayos");
      expect(config.logLevel).toBe("info");
    });

    it("should apply default schema when not provided in config", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    connectionString: "postgres://localhost/relayos"
  },
  logLevel: "info"
};
`,
      );

      const config = await loadConfig();

      expect(config.database.schema).toBe("relayos");
    });

    it("should apply default logLevel when not provided in config", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    connectionString: "postgres://localhost/relayos",
    schema: "custom_schema"
  }
};
`,
      );

      const config = await loadConfig();

      expect(config.logLevel).toBe("info");
    });

    it("should preserve custom schema from config", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    connectionString: "postgres://localhost/relayos",
    schema: "custom_schema"
  },
  logLevel: "warn"
};
`,
      );

      const config = await loadConfig();

      expect(config.database.schema).toBe("custom_schema");
    });

    it("should preserve custom logLevel from config", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    connectionString: "postgres://localhost/relayos"
  },
  logLevel: "error"
};
`,
      );

      const config = await loadConfig();

      expect(config.logLevel).toBe("error");
    });

    it("should accept pool as alternative to connectionString", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    pool: { /* mock pool */ },
    schema: "relayos"
  }
};
`,
      );

      const config = await loadConfig();

      expect(config.database.pool).toBeDefined();
      expect(config.database.schema).toBe("relayos");
    });

    it("should exit with error when no config file exists", async () => {
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });

      await expect(loadConfig()).rejects.toThrow("process.exit(1)");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should explain when DATABASE_URL resolves to undefined in relayos.config.ts", async () => {
      delete process.env.DATABASE_URL;

      writeFileSync(
        join(testDir, "relayos.config.ts"),
        `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: process.env.DATABASE_URL,
  },
});
`,
      );

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });

      await expect(loadConfig()).rejects.toThrow("process.exit(1)");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should load DATABASE_URL from .env for relayos.config.ts", async () => {
      delete process.env.DATABASE_URL;

      writeFileSync(
        join(testDir, ".env"),
        "DATABASE_URL=postgres://localhost/from-dotenv\n",
      );

      writeFileSync(
        join(testDir, "relayos.config.ts"),
        `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: process.env.DATABASE_URL,
  },
});
`,
      );

      const config = await loadConfig();

      expect(config.database.connectionString).toBe(
        "postgres://localhost/from-dotenv",
      );
      expect(config.database.schema).toBe("relayos");
    });

    it("should require connectionString or pool in database config", async () => {
      writeFileSync(
        join(testDir, "relayos.config.js"),
        `module.exports = {
  database: {
    schema: "relayos"
  }
};
`,
      );

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });

      await expect(loadConfig()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
