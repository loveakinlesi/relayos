import { Command } from "commander";
import { RelayConfigSchema, migrate, createPool } from "relayos/core";
import {
  printError,
  printHeader,
  printMuted,
  printSuccess,
} from "../utils/output.js";

async function loadConfig(): Promise<any> {
  const { loadConfig } = await import("../utils/config-loader.js");
  return loadConfig();
}

export const migrateCommand = new Command()
  .name("migrate")
  .description("Run database migrations")
  .action(async () => {
    try {
      printHeader("🔄 Running database migrations...\n");

      const config = await loadConfig();
      const validated = RelayConfigSchema.parse(config);

      // Create pool connection
      if (!validated.database.pool && !validated.database.connectionString) {
        throw new Error(
          "Database connection not configured. Set database.pool or database.connectionString in config."
        );
      }

      const pool =
        validated.database.pool ||
        (await createPool(validated.database.connectionString ?? ""));
      if (!pool) {
        throw new Error("Failed to create database connection pool.");
      }
      printMuted(
        `Connected to database successfully\n ${validated.database.connectionString ? "(using connection string)" : "(using provided pool)"}\n`,
      );
      // Run migrations
      const result = await migrate(pool, validated.database.schema);

      printSuccess("✅ Migrations completed successfully\n");
      printMuted(`Schema: ${result.schema}`);
      printMuted(`Tables created/updated: ${result.tables.join(", ")}\n`);

      if (pool && !validated.database.pool) {
        await pool.end();
      }
    } catch (error) {
      printError("❌ Migration failed:");
      printError(`   ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  });
