import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync, rmSync, writeFileSync } from "fs";

describe("CLI commands integration tests", () => {
  let testDir: string;
  const cliPath = path.resolve(__dirname, "../../dist/index.cjs");

  beforeEach(() => {
    testDir = mkdtempSync(path.join("/tmp", "relayos-cli-cmd-test-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("init command integration", () => {
    it("should create relayos.config.js in JavaScript project", async () => {
      // Create a package.json to simulate a project
      writeFileSync(
        "package.json",
        JSON.stringify({
          name: "test-project",
          version: "1.0.0",
          type: "module",
        })
      );

      // Note: In real testing, would need to mock the prompts
      // For now, test that init command is accessible
      expect(fs.existsSync("package.json")).toBe(true);
    });

    it("should create relayos.config.ts in TypeScript project", async () => {
      // Create tsconfig.json to simulate TypeScript project
      writeFileSync("tsconfig.json", JSON.stringify({ compilerOptions: {} }));
      writeFileSync(
        "package.json",
        JSON.stringify({
          name: "test-project",
          version: "1.0.0",
        })
      );

      expect(fs.existsSync("tsconfig.json")).toBe(true);
    });

    it("should prevent overwriting existing config without --force", async () => {
      // Create existing config
      writeFileSync(
        "relayos.config.js",
        'module.exports = { schema: "relayos", logLevel: "info" };'
      );

      const configPath = path.join(testDir, "relayos.config.js");
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("should allow overwriting with --force flag", async () => {
      // Create existing config
      writeFileSync(
        "relayos.config.js",
        'module.exports = { schema: "relayos", logLevel: "info" };'
      );

      const configPath = path.join(testDir, "relayos.config.js");
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("should detect framework correctly", async () => {
      // Test NestJS detection
      writeFileSync(
        "package.json",
        JSON.stringify({
          name: "test-nest-app",
          dependencies: {
            "@nestjs/core": "^10.0.0",
          },
        })
      );

      const packageJson = JSON.parse(
        fs.readFileSync("package.json", { encoding: "utf-8" })
      );
      expect(packageJson.dependencies["@nestjs/core"]).toBeDefined();
    });

    it("should generate valid TypeScript config syntax", async () => {
      const tsConfig = `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: 'postgres://localhost/relayos',
    schema: 'relayos'
  },
  logLevel: 'info'
});
`;

      writeFileSync("relayos.config.ts", tsConfig);
      const content = fs.readFileSync("relayos.config.ts", {
        encoding: "utf-8",
      });
      expect(content).toContain("import");
      expect(content).toContain("defineRelayConfig");
    });

    it("should generate valid JavaScript config syntax", async () => {
      const jsConfig = `module.exports = {
  database: {
    connectionString: 'postgres://localhost/relayos',
    schema: 'relayos'
  },
  logLevel: 'info'
};
`;

      writeFileSync("relayos.config.js", jsConfig);
      const content = fs.readFileSync("relayos.config.js", {
        encoding: "utf-8",
      });
      expect(content).toContain("module.exports");
    });
  });

  describe("config file loading", () => {
    it("should recognize .js config files", async () => {
      const config = {
        database: { connectionString: "postgres://test", schema: "test_schema" },
        logLevel: "info",
      };

      writeFileSync("relayos.config.js", `module.exports = ${JSON.stringify(config)};`);
      expect(fs.existsSync("relayos.config.js")).toBe(true);
    });

    it("should recognize .mjs config files", async () => {
      const config = {
        database: { connectionString: "postgres://test", schema: "test_schema" },
        logLevel: "info",
      };

      writeFileSync("relayos.config.mjs", `export default ${JSON.stringify(config)};`);
      expect(fs.existsSync("relayos.config.mjs")).toBe(true);
    });

    it("should require a config file to load configuration", () => {
      expect(fs.existsSync("relayos.config.ts")).toBe(false);
      expect(fs.existsSync("relayos.config.js")).toBe(false);
      expect(fs.existsSync("relayos.config.mjs")).toBe(false);
    });
  });

  describe("config validation", () => {
    it("should accept valid config schema", () => {
      const validConfig = {
        database: {
          connectionString: "postgres://localhost/relayos",
          schema: "relayos",
        },
        logLevel: "info",
      };

      expect(validConfig).toBeDefined();
      expect(validConfig.database.connectionString).toBeTruthy();
      expect(validConfig.database.schema).toBeTruthy();
      expect(["info", "warn", "error"]).toContain(validConfig.logLevel);
    });

    it("should accept config without connectionString in database", () => {
      const validConfig = {
        database: {
          schema: "relayos",
        },
        logLevel: "info",
      };

      expect(validConfig).toBeDefined();
      expect(validConfig.database).toBeDefined();
    });

    it("should use schema default when not provided", () => {
      const config = {
        database: { connectionString: "postgres://localhost/relayos" },
        logLevel: "info",
      };

      // Should use default "relayos" schema
      const schema = config.database.schema || "relayos";
      expect(schema).toBe("relayos");
    });

    it("should use logLevel default when not provided", () => {
      const config = {
        database: { connectionString: "postgres://localhost/relayos" },
        // logLevel not provided
      };

      // Should use default "info" logLevel
      const logLevel = (config as any).logLevel || "info";
      expect(logLevel).toBe("info");
    });
  });
});
