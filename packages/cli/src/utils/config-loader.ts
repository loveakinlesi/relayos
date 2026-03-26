import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { cwd } from "process";
import { pathToFileURL } from "url";
import { tmpdir } from "os";
import { config as loadDotenv } from "dotenv";
import { RelayConfigSchema } from "relayos/core";
import type { RelayConfig } from "relayos/core";
import { printError, printInfo } from "./output.js";

function rewriteTypeScriptConfig(source: string): string {
  const withoutTypeImports = source.replaceAll(
    /import\s+type\s+\{[^}]*\}\s+from\s+["']relayos["'];?\s*/g,
    "",
  );

  const withStubbedDefineRelayConfig = withoutTypeImports.replaceAll(
    /import\s+\{\s*defineRelayConfig\s*\}\s+from\s+["']relayos["'];?\s*/g,
    'const defineRelayConfig = (config) => config;\n',
  );

  return withStubbedDefineRelayConfig;
}

async function importConfigModule(configPath: string) {
  if (configPath.endsWith(".ts")) {
    const tempDir = mkdtempSync(join(tmpdir(), "relayos-config-"));
    const tempPath = join(tempDir, "relayos.config.mjs");
    writeFileSync(tempPath, rewriteTypeScriptConfig(readFileSync(configPath, "utf8")));

    try {
      return await import(pathToFileURL(tempPath).href);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return import(pathToFileURL(configPath).href);
}

function hasDatabaseConnection(config: unknown): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }

  const database = (config as { database?: { connectionString?: unknown; pool?: unknown } }).database;
  return Boolean(database?.connectionString || database?.pool);
}

function loadEnvironmentFiles(): void {
  const appRoot = cwd();
  const envFiles = [".env.local", ".env"];

  for (const envFile of envFiles) {
    const envPath = resolve(appRoot, envFile);
    if (!existsSync(envPath)) {
      continue;
    }

    loadDotenv({
      path: envPath,
      override: false,
    });
  }
}

export async function loadConfig(): Promise<RelayConfig> {
  loadEnvironmentFiles();

  const configNames = [
    "relayos.config.ts",
    "relayos.config.mjs",
    "relayos.config.js",
  ];

  for (const configName of configNames) {
    const configPath = resolve(cwd(), configName);
    if (existsSync(configPath)) {
      try {
        printInfo(`ℹ Loading relayos config from ${configName}`);
        const config = await importConfigModule(configPath);
        const rawConfig = config.default || config;

        if (!hasDatabaseConnection(rawConfig)) {
          throw new Error(
            'database.connectionString resolved to undefined. If you are using process.env.DATABASE_URL, ensure DATABASE_URL is set in the shell running "relayos".',
          );
        }
        
        // Validate and apply defaults using RelayConfigSchema
        const validated = RelayConfigSchema.safeParse(rawConfig);
        if (!validated.success) {
          throw new Error(`Invalid relayos config: ${JSON.stringify(validated.error.issues)}`);
        }
        printInfo(
          `ℹ Loaded relayos config${validated.data.database.schema ? ` (schema: ${validated.data.database.schema})` : ""}`,
        );
        return validated.data;
      } catch (error) {
        printError(
          `❌ Failed to load config from ${configName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    }
  }

  // No config file found - this is required
  printError("❌ No relayos configuration file found. Please create one of the following:");
  printInfo("  • relayos.config.ts (TypeScript)");
  printInfo("  • relayos.config.js (JavaScript)");
  printInfo("  • relayos.config.mjs (ES Module)\n");
  printInfo("Run 'relayos init' to create a configuration file interactively.");
  process.exit(1);
}
