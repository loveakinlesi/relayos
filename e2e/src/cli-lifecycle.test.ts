import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixtureApp, STRIPE_WEBHOOK_SECRET } from './fixtures/create-fixture-app';
import { run, spawnServer } from './fixtures/spawn';

const here = dirname(fileURLToPath(import.meta.url));
const cliBin = join(here, '..', '..', 'packages', 'cli', 'dist', 'index.js');
const restaqBin = join(here, '..', '..', 'packages', 'restaq', 'dist', 'bin.js');
const serverPath = join(here, 'fixtures', 'server.mjs');

// relay trigger prints "[relay trigger] ..." log lines before its JSON blob -
// naively searching for the first '{' or '[' picks up the tag's own
// brackets (e.g. the '[' in "[relay trigger]"). JSON.stringify(x, null, 2)
// always starts with '{\n'/'[\n' (or '{}'/'[]' for empty), which a bare log
// tag never does, so match on that instead of a lone bracket character.
function extractJson(stdout: string): any {
  const objMatch = stdout.match(/\{\s*\n|\{\}/);
  const arrMatch = stdout.match(/\[\s*\n|\[\]/);
  const objStart = objMatch ? objMatch.index! : -1;
  const arrStart = arrMatch ? arrMatch.index! : -1;
  let start: number;
  let closeChar: string;
  if (objStart === -1 || (arrStart !== -1 && arrStart < objStart)) {
    start = arrStart;
    closeChar = ']';
  } else {
    start = objStart;
    closeChar = '}';
  }
  return JSON.parse(stdout.slice(start, stdout.lastIndexOf(closeChar) + 1));
}

describe('CLI + app lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureApp>>;
  let server: Awaited<ReturnType<typeof spawnServer>>;
  let eventId: string;

  beforeAll(async () => {
    fixture = await createFixtureApp();
    server = await spawnServer(serverPath, fixture.dir, { STRIPE_WEBHOOK_SECRET });
  }, 30_000);

  afterAll(async () => {
    server?.kill();
    await fixture?.cleanup();
  });

  it('migrate applies the schema', async () => {
    const result = await run('node', [cliBin, 'migrate', '--dir', fixture.dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Migrations applied.');
  });

  it("restaq's own bin forwards to the same CLI - zero-install onboarding relies on this", async () => {
    const result = await run('node', [restaqBin, 'migrate', '--dir', fixture.dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Migrations applied.');
  });

  it('trigger delivers a signed webhook the app processes into a completed execution', async () => {
    const result = await run(
      'node',
      [
        cliBin,
        'trigger',
        'stripe',
        'charge.succeeded',
        '--data',
        '{"id":"ch_e2e_1","amount":1000,"currency":"usd"}',
        '--forward',
        `http://127.0.0.1:${server.port}`,
      ],
      { env: { STRIPE_WEBHOOK_SECRET } },
    );
    expect(result.code).toBe(0);

    const json = extractJson(result.stdout) as {
      execution: { status: string; eventType: string; eventId: string };
    };
    expect(json.execution.status).toBe('completed');
    expect(json.execution.eventType).toBe('stripe.charge.succeeded');
    eventId = json.execution.eventId;
  });

  it('inspect shows the triggered execution and its step', async () => {
    const result = await run('node', [cliBin, 'inspect', eventId, '--json', '--dir', fixture.dir]);
    expect(result.code).toBe(0);

    const json = extractJson(result.stdout) as {
      execution: { status: string };
      steps: { name: string }[];
    };
    expect(json.execution.status).toBe('completed');
    expect(json.steps.some((step) => step.name === 'record-charge')).toBe(true);
  });

  it('events list shows the triggered execution', async () => {
    const result = await run('node', [cliBin, 'events', 'list', '--json', '--dir', fixture.dir]);
    expect(result.code).toBe(0);

    const json = extractJson(result.stdout) as { eventId: string }[];
    expect(json.some((execution) => execution.eventId === eventId)).toBe(true);
  });
});
