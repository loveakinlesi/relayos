import { Command } from "commander";
import chalk from "chalk";
import { table } from "table";
import { RelayConfigSchema, createPool } from "relayos/core";

async function loadConfig(): Promise<any> {
  const { loadConfig } = await import("../utils/config-loader.js");
  return loadConfig();
}

export const eventsListCommand = new Command()
  .name("events list")
  .description("List webhook events")
  .option("--provider <provider>", "Filter by provider")
  .option("--status <status>", "Filter by status")
  .option("--limit <limit>", "Limit number of results", "20")
  .option("--json", "Output as JSON")
  .action(async (options: {
    provider?: string;
    status?: string;
    limit: string;
    json?: boolean;
  }) => {
    try {
      console.log(chalk.blue("📋 Webhook Events\n"));

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

      // Query events from database
      const limit = parseInt(options.limit, 10) || 20;
      let query = `
        SELECT 
          id, 
          provider, 
          event_type, 
          status, 
          created_at 
        FROM ${validated.database.schema}.webhook_events
        WHERE 1=1
      `;
      const params: any[] = [];

      if (options.provider) {
        query += ` AND provider = $${params.length + 1}`;
        params.push(options.provider);
      }

      if (options.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(options.status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await (pool as any).query(query, params);
      const events = result.rows;

      if (options.json) {
        console.log(JSON.stringify(events, null, 2));
      } else {
        if (events.length === 0) {
          console.log(chalk.gray("No events found\n"));
          return;
        }

        const tableData = [
          [
            chalk.cyan("Event ID"),
            chalk.cyan("Provider"),
            chalk.cyan("Type"),
            chalk.cyan("Status"),
            chalk.cyan("Created At"),
          ],
          ...events.map((event: any) => [
            event.id,
            event.provider,
            event.event_type,
            event.status,
            new Date(event.created_at).toISOString(),
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

export const eventsInspectCommand = new Command()
  .name("events inspect <event-id>")
  .description("Inspect event details")
  .option("--json", "Output as JSON")
  .action(async (eventId: string, options: { json?: boolean }) => {
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

      // Query event details
      const eventResult = await (pool as any).query(
        `
        SELECT * FROM ${validated.database.schema}.webhook_events 
        WHERE id = $1
        `,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        console.error(chalk.red(`❌ Event not found: ${eventId}`));
        process.exit(1);
      }

      const event = eventResult.rows[0];

      if (options.json) {
        console.log(JSON.stringify(event, null, 2));
      } else {
        console.log(chalk.blue(`📦 Event: ${eventId}\n`));
        console.log(chalk.cyan("Metadata:"));
        console.log(`  Provider: ${event.provider}`);
        console.log(`  Type: ${event.event_type}`);
        console.log(`  Status: ${event.status}`);
        console.log(`  Created: ${new Date(event.created_at).toISOString()}`);
        console.log("\n" + chalk.cyan("Payload:"));
        console.log(JSON.stringify(event.payload, null, 2));
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
