import { mkdir, mkdtemp, writeFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelayConfigTemplate, RELAY_HANDLERS_TEMPLATE } from '@restaq/cli/lib';

const here = dirname(fileURLToPath(import.meta.url));
// Deliberately created *inside* e2e/, not os.tmpdir() - Node's module
// resolution for the fixture's `import 'restaq'` (etc.) walks up from
// wherever relay.ts lives looking for node_modules. A directory under
// e2e/.tmp/ walks up into e2e/node_modules and finds the real
// workspace-linked packages; the OS temp directory never would.
const tmpRoot = join(here, '..', '..', '.tmp');
const serverSourcePath = join(here, 'server.mjs');

export const STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test';

const HANDLERS = RELAY_HANDLERS_TEMPLATE.replace(
  'export function registerHandlers(relay: AppRelay): void {',
  `export function registerHandlers(relay: AppRelay): void {
  relay.on('stripe.charge.succeeded', async (event, ctx) => {
    await ctx.step.run('record-charge', async () => {
      return { chargeId: event.data.object.id };
    });
  });`,
);

function makeSqliteRelayConfig(): string {
  const base = buildRelayConfigTemplate({ database: 'sqlite', plugins: ['stripe'] });
  return base
    .replace(
      "import Database from 'better-sqlite3';",
      "import Database from 'better-sqlite3';\nimport { fileURLToPath } from 'node:url';",
    )
    .replace(
      "new Database('relay.db')",
      "new Database(fileURLToPath(new URL('./relay.db', import.meta.url)))",
    );
}

export async function createFixtureApp(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  await mkdir(tmpRoot, { recursive: true });
  const dir = await mkdtemp(join(tmpRoot, 'app-'));

  await writeFile(join(dir, 'relay.ts'), makeSqliteRelayConfig(), 'utf8');
  await writeFile(join(dir, 'relay.handlers.ts'), HANDLERS, 'utf8');
  await cp(serverSourcePath, join(dir, 'server.mjs'));

  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
