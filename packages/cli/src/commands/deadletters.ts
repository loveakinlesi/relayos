import { Command } from "commander";
import chalk from "chalk";
import { table } from "table";
import { RelayConfigSchema, createPool, resumeFailedExecution } from "relayos/core";

async function loadConfig(): Promise<any> {
  const { loadConfig } = await import("../utils/config-loader.js");
  return loadConfig();
}

const deadlettersGroup = new Command()
  .name("deadletters")
  .description("Manage dead letter queue");

const deadlettersListCommand = new Command()
  .name("list")
  .description("List dead lettered executions")
  .option("--limit <limit>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .action(async (options: { limit: string; json?: boolean }) => {
    try {
      console.log(chalk.blue("💀 Dead Letter Queue\n"));

      const config = await loadConfig();
      const validated = RelayConfigSchema.parse(config);

      if (!validated.database.pool && !validated.database.connectionString) {
        throw new Error("Database connection not configured.");
      }

      const pool = validated.database.pool || (await createPool({
        connectionString: validated.database.connectionString,
      }));

      const limit = parseInt(options.limit, 10) || 20;
      const result = await (pool as any).query(
        `
        SELECT id, event_id, status, attempt_count, last_error, created_at
        FROM ${validated.database.schema}.webhook_dead_letters
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [limit]
      );

      const deadLetters = result.rows;

      if (options.json) {
        console.log(JSON.stringify(deadLetters, null, 2));
      } else {
        if (deadLetters.length === 0) {
          console.log(chalk.green("✅ No dead lettered executions\n"));
          return;
        }

        const tableData = [
          [
            chalk.cyan("ID"),
            chalk.cyan("Event ID"),
            chalk.cyan("Attempts"),
            chalk.cyan("Last Error"),
            chalk.cyan("Created At"),
          ],
          ...deadLetters.map((dlq: any) => [
            dlq.id,
            dlq.event_id,
            String(dlq.attempt_count),
            dlq.last_error?.substring(0, 40) || "N/A",
            new Date(dlq.created_at).toISOString(),
          ]),
        ];

        console.log(table(tableData));
      }

      if (pool && !validated.database.pool) {
        await (pool as any).end();
      }
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  });

const deadlettersReplayCommand = new Command()
  .name("replay <execution-id>")
  .description("Retry a dead lettered execution")
  .action(async (executionId: string) => {
    try {
      console.log(chalk.blue(`🔄 Retrying execution${executionId}\n`));

      const config = await loadConfig();
      const validated = RelayConfigSchema.parse(config);

      if (!validated.database.pool && !validated.database.connectionString) {
        throw new Error("Database connection not configured.");
      }

      const pool = validated.database.pool || (await createPool({
        connectionString: validated.database.connectionString,
      }));

      await resumeFailedExecution(pool, executionId);

      console.log(chalk.green(`✅ Execution retry initiated\n`));

      if (pool && !validated.database.pool) {
        await (pool as any).end();
      }
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  });

deadlettersGroup.addCommand(deadlettersListCommand);
deadlettersGroup.addCommand(deadlettersReplayCommand);

export const deadlettersCommand = deadlettersGroup;
