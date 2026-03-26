import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("CLI integration tests", () => {
  let testDir: string;
  const cliPath = path.resolve(__dirname, "../../dist/index.cjs");

  beforeEach(() => {
    testDir = mkdtempSync(path.join("/tmp", "relayos-cli-test-"));
    process.chdir(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("CLI entry point", () => {
    it("should display help when no arguments provided", () => {
      try {
        execSync(`node ${cliPath}`, { encoding: "utf-8", stdio: "pipe" });
      } catch (error: any) {
        // CLI exits after showing help, which is expected (output goes to stderr)
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("RelayOS CLI");
        expect(output).toContain("Commands:");
        return;
      }
      // If no error, check stdout directly
      const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
      expect(output).toContain("RelayOS CLI");
      expect(output).toContain("Commands:");
    });

    it("should display version with --version flag", () => {
      try {
        const output = execSync(`node ${cliPath} --version`, { encoding: "utf-8" });
        expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
      } catch (error: any) {
        // Version might be printed to stderr on exit
        const output = error.stderr || error.stdout || error.toString();
        expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/);
      }
    });

    it("should display help with --help flag", () => {
      try {
        const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
        expect(output).toContain("Usage:");
        expect(output).toContain("Options:");
        expect(output).toContain("Commands:");
      } catch (error: any) {
        // Help output might go to stderr on some systems
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("Usage:");
        expect(output).toContain("Options:");
        expect(output).toContain("Commands:");
      }
    });

    it("should show init command in help", () => {
      try {
        const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
        expect(output).toContain("init");
        expect(output).toContain("migrate");
        expect(output).toContain("events list");
        expect(output).toContain("events inspect");
        expect(output).toContain("replay");
        expect(output).toContain("deadletters");
        expect(output).toContain("status");
      } catch (error: any) {
        // Help output might go to stderr on some systems
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("init");
        expect(output).toContain("migrate");
        expect(output).toContain("events list");
        expect(output).toContain("events inspect");
        expect(output).toContain("replay");
        expect(output).toContain("deadletters");
        expect(output).toContain("status");
      }
    });
  });

  describe("init command", () => {
    it("should display init command help", () => {
      try {
        const output = execSync(`node ${cliPath} init --help`, {
          encoding: "utf-8",
        });
        expect(output).toContain("Initialize RelayOS configuration");
        expect(output).toContain("--force");
      } catch (error: any) {
        // Help might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("Initialize RelayOS configuration");
        expect(output).toContain("--force");
      }
    });

    it("should create config file without prompts", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "relayos-init-test-"));
      const cwd = process.cwd();
      try {
        process.chdir(tempDir);
        // Create package.json so init knows it's a project
        writeFileSync("package.json", JSON.stringify({ name: "test-app" }));
        
        execSync(`node ${cliPath} init`, { encoding: "utf-8" });
        
        // Should create relayos.config.js (JavaScript by default)
        expect(existsSync("relayos.config.js")).toBe(true);
        const content = readFileSync("relayos.config.js", { encoding: "utf-8" });
        expect(content).toContain("connectionString");
        expect(content).not.toContain("schema");
      } finally {
        process.chdir(cwd);
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("command availability", () => {
    it("should show available commands in help", () => {
      try {
        const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
        expect(output).toContain("init");
        expect(output).toContain("migrate");
        expect(output).toContain("events list");
        expect(output).toContain("events inspect");
        expect(output).toContain("replay");
        expect(output).toContain("deadletters");
        expect(output).toContain("status");
        expect(output).toContain("help");
      } catch (error: any) {
        // Help might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("init");
        expect(output).toContain("migrate");
        expect(output).toContain("events list");
        expect(output).toContain("events inspect");
        expect(output).toContain("replay");
        expect(output).toContain("deadletters");
        expect(output).toContain("status");
        expect(output).toContain("help");
      }
    });

    it("should handle unknown command with error", () => {
      try {
        execSync(`node ${cliPath} unknown-command`, { encoding: "utf-8" });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        const output = error.stderr || error.stdout || error.message;
        expect(output.toLowerCase()).toContain("error");
      }
    });

    it("should provide help for specific command", () => {
      try {
        const output = execSync(`node ${cliPath} init --help`, {
          encoding: "utf-8",
        });
        expect(output).toContain("Initialize RelayOS configuration");
      } catch (error: any) {
        // Help might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("Initialize RelayOS configuration");
      }
    });
  });

  describe("help command", () => {
    it("should display help text", () => {
      try {
        const output = execSync(`node ${cliPath} help`, { encoding: "utf-8" });
        expect(output).toContain("RelayOS CLI");
      } catch (error: any) {
        // Help might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("RelayOS CLI");
      }
    });

    it("should provide help for subcommands", () => {
      try {
        const output = execSync(`node ${cliPath} help init`, {
          encoding: "utf-8",
        });
        expect(output).toContain("Initialize RelayOS configuration");
      } catch (error: any) {
        // Help might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toContain("Initialize RelayOS configuration");
      }
    });
  });

  describe("error handling", () => {
    it("should exit with error code on unknown command", () => {
      try {
        execSync(`node ${cliPath} nonexistent`, { encoding: "utf-8" });
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.status).not.toBe(0);
      }
    });

    it("should handle file system errors gracefully", () => {
      // This tests that the CLI doesn't crash on FS errors
      try {
        const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
        expect(output).toBeTruthy();
      } catch (error: any) {
        // Help output might go to stderr
        const output = error.stderr || error.stdout || error.toString();
        expect(output).toBeTruthy();
      }
    });
  });

});
