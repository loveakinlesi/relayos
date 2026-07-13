import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripe } from '@relayos/stripe';
import { createFixtureApp, STRIPE_WEBHOOK_SECRET } from './fixtures/create-fixture-app';
import { spawnServer } from './fixtures/spawn';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, 'fixtures', 'server.mjs');

describe('HTTP API', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureApp>>;
  let server: Awaited<ReturnType<typeof spawnServer>>;
  let baseUrl: string;
  const plugin = stripe({ webhookSecret: STRIPE_WEBHOOK_SECRET });

  beforeAll(async () => {
    fixture = await createFixtureApp();
    server = await spawnServer(serverPath, fixture.dir, { STRIPE_WEBHOOK_SECRET });
    baseUrl = `http://127.0.0.1:${server.port}`;
  }, 30_000);

  afterAll(async () => {
    server?.kill();
    await fixture?.cleanup();
  });

  it('processes a validly signed webhook into a completed execution', async () => {
    const { body } = plugin.buildTestPayload('charge.succeeded', { id: 'ch_api_1', amount: 500 });
    const rawBody = JSON.stringify(body);
    const headers = plugin.sign(rawBody, STRIPE_WEBHOOK_SECRET);

    const response = await fetch(`${baseUrl}/api/relay/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: rawBody,
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as { execution: { status: string } };
    expect(json.execution.status).toBe('completed');
  });
});
