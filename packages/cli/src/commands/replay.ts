import { Command } from "commander";
import chalk from "chalk";
import { RelayConfigSchema, createPool, replayEvent } from "relayos/core";

async function loadConfig(): Promise<any> {
  const { loadConfig } = await import("../utils/config-loader.js");
  return loadConfig();
}

export const replayCommand = new Command()
  .name("replay <event-id>")
  .description("Replay a webhook event")
  .option("--forward <url>", "Forward event to local URL instead of replaying through engine")
  .option("--print", "Print raw payload to stdout")
  .option("--retries <count>", "Number of retry attempts for forward mode", "1")
  .option("--json", "Output as JSON")
  .action(async (
    eventId: string,
    options: {
      forward?: string;
      print?: boolean;
      retries: string;
      json?: boolean;
    }
  ) => {
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

      // Get event from database
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

      // Print mode: just output the payload
      if (options.print) {
        console.log(JSON.stringify(event.payload));
        if (pool && !validated.database.pool) {
          await (pool as any).end();
        }
        return;
      }

      // Forward mode: send to local server
      if (options.forward) {
        console.log(
          chalk.blue(`🚀 Forwarding event to ${options.forward}\n`)
        );

        const retries = parseInt(options.retries, 10) || 1;
        let lastError: Error | null = null;
        let statusCode: number | null = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            const response = await fetch(options.forward, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-relayos-replay": "true",
                "x-relayos-event-id": eventId,
              },
              body: JSON.stringify(event.payload),
            });

            statusCode = response.status;

            if (response.ok) {
              console.log(chalk.green(`✅ Event forwarded successfully`));
              console.log(`   Status: ${statusCode}`);
              break;
            } else {
              lastError = new Error(`HTTP ${statusCode}`);
              if (attempt < retries) {
                console.log(
                  chalk.yellow(
                    `⚠️  Attempt ${attempt}/${retries} failed: ${statusCode}`
                  )
                );
                // Wait before retry
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < retries) {
              console.log(
                chalk.yellow(`⚠️  Attempt ${attempt}/${retries} failed: ${lastError.message}`)
              );
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }

        if (lastError && statusCode !== 200 && statusCode !== 202) {
          console.error(chalk.red(`❌ Forward failed: ${lastError.message}`));
          process.exit(1);
        }

        if (pool && !validated.database.pool) {
          await (pool as any).end();
        }
        return;
      }

      // Engine replay mode: replay through RelayOS runtime
      console.log(chalk.blue(`🔁 Replaying event through engine\n`));

      const startTime = Date.now();
      await replayEvent(pool, eventId);
      const duration = Date.now() - startTime;

      console.log(chalk.green(`✅ Event replayed successfully`));
      console.log(`   Duration: ${duration}ms`);

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
