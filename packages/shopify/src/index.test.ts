import { describe, it, expect, afterEach } from 'vitest';
import { shopify } from './index';

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://x/api/webhook/shopify', { method: 'POST', headers, body });
}

describe('shopify plugin', () => {
  afterEach(() => {
    delete process.env['SHOPIFY_WEBHOOK_SECRET'];
  });

  it('infers webhookSecret from SHOPIFY_WEBHOOK_SECRET when not provided', async () => {
    process.env['SHOPIFY_WEBHOOK_SECRET'] = 'shpss_env';
    const plugin = shopify();
    const rawBody = JSON.stringify({ id: 1 });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'shpss_env'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('an explicit webhookSecret overrides SHOPIFY_WEBHOOK_SECRET', async () => {
    process.env['SHOPIFY_WEBHOOK_SECRET'] = 'shpss_env';
    const plugin = shopify({ webhookSecret: 'shpss_explicit' });
    const rawBody = JSON.stringify({ id: 1 });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'shpss_explicit'));
    expect(await plugin.verify(req)).toBe(true);

    const signedWithEnvSecret = makeRequest(rawBody, plugin.sign(rawBody, 'shpss_env'));
    expect(await plugin.verify(signedWithEnvSecret)).toBe(false);
  });

  it('rejects when neither webhookSecret nor SHOPIFY_WEBHOOK_SECRET is set, only on an actual verify', async () => {
    const plugin = shopify();
    const rawBody = JSON.stringify({ id: 1 });
    const req = makeRequest(rawBody, { 'x-shopify-hmac-sha256': 'deadbeef' });
    await expect(plugin.verify(req)).rejects.toThrow('SHOPIFY_WEBHOOK_SECRET');
  });

  it('rejects a request with no X-Shopify-Hmac-Sha256 header', async () => {
    const plugin = shopify({ webhookSecret: 'shpss_test' });
    expect(await plugin.verify(makeRequest('{}', {}))).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const plugin = shopify({ webhookSecret: 'shpss_test' });
    const rawBody = JSON.stringify({ id: 1 });
    const req = makeRequest(rawBody, { 'X-Shopify-Hmac-Sha256': 'not-valid' });
    expect(await plugin.verify(req)).toBe(false);
  });

  it('normalize() reads the topic and webhook ID from headers', () => {
    const plugin = shopify({ webhookSecret: 'shpss_test' });
    const headers = new Headers({
      'x-shopify-topic': 'orders/create',
      'x-shopify-webhook-id': 'webhook_1',
    });
    const event = plugin.normalize({ id: 123 }, headers);
    expect(event.type).toBe('shopify.orders.create');
    expect(event.id).toBe('webhook_1');
    expect(event.data).toEqual({ id: 123 });
  });

  it('buildTestPayload -> sign -> verify -> normalize round-trips correctly', async () => {
    const plugin = shopify({ webhookSecret: 'shpss_test' });
    const { body, headers: envelopeHeaders } = plugin.buildTestPayload('orders.create', {
      id: 123,
    });
    const rawBody = JSON.stringify(body);
    const allHeaders = { ...envelopeHeaders, ...plugin.sign(rawBody, 'shpss_test') };
    const req = makeRequest(rawBody, allHeaders);

    expect(await plugin.verify(req.clone())).toBe(true);
    const normalized = plugin.normalize(JSON.parse(rawBody), new Headers(allHeaders));
    expect(normalized.type).toBe('shopify.orders.create');
  });
});
