#!/usr/bin/env node

import { program } from "commander";
import { deadlettersCommand } from "./commands/deadletters.js";
import { eventsInspectCommand, eventsListCommand } from "./commands/events.js";
import { initCommand } from "./commands/init.js";
import { migrateCommand } from "./commands/migrate.js";
import { replayCommand } from "./commands/replay.js";
import { statusCommand } from "./commands/status.js";

const version = "1.0.0";

program
  .name("relayos")
  .description("RelayOS CLI — Database setup, local development, and webhook debugging")
  .version(version);

async function main() {
  program.addCommand(migrateCommand);
  program.addCommand(initCommand);
  program.addCommand(eventsListCommand);
  program.addCommand(eventsInspectCommand);
  program.addCommand(replayCommand);
  program.addCommand(deadlettersCommand);
  program.addCommand(statusCommand);

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch((err) => {
  console.error("CLI initialization failed:", err);
  process.exit(1);
});
