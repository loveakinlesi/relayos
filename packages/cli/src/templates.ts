export type DatabaseChoice = 'sqlite' | 'postgres' | 'mysql';
export type PluginChoice = 'stripe' | 'github' | 'clerk' | 'shopify' | 'resend';

export const databasePackages: Record<DatabaseChoice, string> = {
  sqlite: 'better-sqlite3',
  postgres: 'pg',
  mysql: 'mysql2',
};

export const pluginPackages: Record<PluginChoice, string> = {
  stripe: '@relayos/stripe',
  github: '@relayos/github',
  clerk: '@relayos/clerk',
  shopify: '@relayos/shopify',
  resend: '@relayos/resend',
};

const databaseImportLine: Record<DatabaseChoice, string> = {
  sqlite: "import Database from 'better-sqlite3';",
  postgres: "import { Pool } from 'pg';",
  mysql: "import { createPool } from 'mysql2';",
};

const databaseExpression: Record<DatabaseChoice, string> = {
  sqlite: "new Database('relay.db')",
  postgres: 'new Pool({ connectionString: process.env.DATABASE_URL! })',
  mysql: "createPool({ uri: process.env.DATABASE_URL!, timezone: 'Z' })",
};

const pluginImportLine: Record<PluginChoice, string> = {
  stripe: "import { stripe } from '@relayos/stripe';",
  github: "import { github } from '@relayos/github';",
  clerk: "import { clerk } from '@relayos/clerk';",
  shopify: "import { shopify } from '@relayos/shopify';",
  resend: "import { resend } from '@relayos/resend';",
};

const pluginExpression: Record<PluginChoice, string> = {
  // webhookSecret is optional - provider plugins infer it from
  // <PROVIDER>_WEBHOOK_SECRET automatically if not passed explicitly.
  stripe: 'stripe()',
  github: 'github()',
  clerk: 'clerk()',
  shopify: 'shopify()',
  resend: 'resend()',
};

export function buildRelayConfigTemplate(options: {
  database: DatabaseChoice;
  plugins: PluginChoice[];
}): string {
  const imports = [
    "import { relayos } from 'relayos';",
    databaseImportLine[options.database],
    ...options.plugins.map((plugin) => pluginImportLine[plugin]),
    "import { registerHandlers } from './relay.handlers';",
  ].join('\n');

  const pluginLines = options.plugins
    .map((plugin) => `    ${pluginExpression[plugin]},`)
    .join('\n');

  return `${imports}

export const relay = relayos({
  database: ${databaseExpression[options.database]},
  plugins: [
${pluginLines}
  ],
});

// The concrete relay type, including the typed event catalog inferred from
// the plugins above - exported so relay.handlers.ts (or any other module)
// can register handlers with full event.data typing, without needing to
// duplicate the plugins list.
export type AppRelay = typeof relay;

registerHandlers(relay);
`;
}

export const RELAY_HANDLERS_TEMPLATE = `import type { AppRelay } from './relay';

// Handlers live here, not in relay.ts - that file stays wiring-only
// (storage, plugins, retry policy), while the business logic that runs
// when an event arrives lives in its own module. For a larger app, split
// this across multiple files (e.g. one per feature) and call each from
// registerHandlers.
export function registerHandlers(relay: AppRelay): void {
  // Events from @relayos provider plugins are fully typed - relay.on()
  // autocompletes their event names and types event.data per event:
  //
  // relay.on('stripe.charge.succeeded', async (event, ctx) => {
  //   const charge = event.data.object; // a typed Stripe.Charge
  //
  //   const payment = await ctx.step.run('record-payment', async () => {
  //     return { chargeId: charge.id, amount: charge.amount };
  //   });
  //
  //   ctx.log.info('payment recorded', payment);
  // });
}
`;
