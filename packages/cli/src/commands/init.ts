import { Command } from "commander";
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { cwd } from "process";
import {
  printAccent,
  printHeader,
  printMuted,
  printSuccess,
  printWarning,
} from "../utils/output.js";

type Framework = "nestjs" | "nextjs" | "hono" | "unknown";

function detectTypeScript(): boolean {
  return (
    existsSync(resolve(cwd(), "tsconfig.json")) ||
    existsSync(resolve(cwd(), "tsconfig.app.json"))
  );
}

function detectFramework(): Framework {
  const packageJsonPath = resolve(cwd(), "package.json");
  if (!existsSync(packageJsonPath)) return "unknown";

  try {
    const packageJson = require(packageJsonPath);
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (deps["@nestjs/core"]) return "nestjs";
    if (deps["next"]) return "nextjs";
    if (deps["hono"]) return "hono";
  } catch {
    // continue regardless of error
  }

  return "unknown";
}

function generateConfigTS(): string {
  return `import { defineRelayConfig } from "relayos";

export default defineRelayConfig({
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/relayos",
    schema: "relayos",
  },
});
`;
}

function generateConfigJS(): string {
  return `module.exports = {
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/relayos",
  },
};
`;
}

export const initCommand = new Command()
  .name("init")
  .description("Initialize RelayOS configuration")
  .option("--force", "Overwrite existing config")
  .action((options: { force?: boolean }) => {
    const isTS = detectTypeScript();
    const framework = detectFramework();
    const configExt = isTS ? "ts" : "js";
    const configFileName = `relayos.config.${configExt}`;
    const configPath = resolve(cwd(), configFileName);

    printHeader("✨ RelayOS Configuration Setup\n");

    if (!options.force && existsSync(configPath)) {
      printWarning(`⚠️  Configuration file already exists: ${configFileName}`);
      printMuted("   Use --force flag to overwrite existing configuration.\n");
      process.exit(1);
    }

    printMuted("Detected environment:");
    printMuted(`  Language: ${isTS ? "TypeScript" : "JavaScript"}`);
    printMuted(`  Framework: ${framework === "unknown" ? "None detected" : framework}\n`);

    const configContent = isTS ? generateConfigTS() : generateConfigJS();
    writeFileSync(configPath, configContent);

    printSuccess(`✅ Configuration file created: ${configFileName}\n`);
    printAccent("Next steps:\n");
    printMuted("  1. Edit the configuration file:");
    printMuted(`     $ ${isTS ? "code" : "code"} ${configFileName}\n`);
    printMuted("  2. Set your database connection string\n");
    printMuted("  3. Run migrations:");
    printMuted("     $ relayos migrate\n");
    printMuted("  4. Register plugins in your application");
    printMuted("  5. Create a webhook endpoint for your provider\n");
  });
