import { Command } from "commander";
import { RelayConfigSchema, createPool } from "relayos/core";
import {
  printAccent,
  printError,
  printHeader,
  printMuted,
} from "../utils/output.js";

async function loadConfig(): Promise<any> {
  const { loadConfig } = await import("../utils/config-loader.js");
  return loadConfig();
}

export const statusCommand = new Command()
  .name("status")
  .description("Check runtime health and status")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    try {
      const config = await loadConfig();
      const validated = RelayConfigSchema.parse(config);

      if (!validated.database.pool && !validated.database.connectionString) {
        throw new Error(
          "Database connection not configured."
        );
      }

      const pool = validated.database.pool || (await createPool({
        connectionString: validated.database.connectionString,
      }));

      // Check database connection
      let dbConnected = false;
      try {
        await (pool as any).query("SELECT NOW()");
        dbConnected = true;
      } catch {
        dbConnected = false;
      }

      // Count pending retries
      let pendingRetries = 0;
      let deadLetterCount = 0;
      let queueBacklog = 0;

      if (dbConnected) {
        try {
          const retryResult = await (pool as any).query(
            `SELECT COUNT(*) as count FROM ${validated.database.schema}.webhook_events WHERE status = 'retrying'`
          );
          pendingRetries = parseInt(retryResult.rows[0]?.count || "0", 10);

          const dlqResult = await (pool as any).query(
            `SELECT COUNT(*) as count FROM ${validated.database.schema}.webhook_dead_letters`
          );
          deadLetterCount = parseInt(dlqResult.rows[0]?.count || "0", 10);

          const backlogResult = await (pool as any).query(
            `SELECT COUNT(*) as count FROM ${validated.database.schema}.webhook_events WHERE status = 'pending'`
          );
          queueBacklog = parseInt(backlogResult.rows[0]?.count || "0", 10);
        } catch {
          // continue with zeros if queries fail
        }
      }

      const status = {
        database: {
          connected: dbConnected,
          schema: validated.database.schema,
        },
        queue: {
          pending: queueBacklog,
          retrying: pendingRetries,
          deadLetters: deadLetterCount,
        },
        logLevel: validated.logLevel,
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        printHeader("🔍 RelayOS Status\n");

        printAccent("Database:");
        printMuted(`  Connection: ${dbConnected ? "✅ Connected" : "❌ Disconnected"}`);
        printMuted(`  Schema: ${validated.database.schema}`);

        printAccent("\nQueue:");
        printMuted(`  Pending: ${queueBacklog}`);
        printMuted(`  Retrying: ${pendingRetries}`);
        printMuted(`  Dead Letters: ${deadLetterCount}`);

        printAccent("\nConfiguration:");
        printMuted(`  Log Level: ${validated.logLevel}\n`);
      }

      const isHealthy = dbConnected;
      if (!isHealthy) {
        process.exit(1);
      }

      if (pool && !validated.database.pool) {
        await (pool as any).end();
      }
    } catch (error) {
      printError(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
