import { describe, it, expect, vi, afterEach } from 'vitest';
import { clerk } from './index';

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://x/api/webhook/clerk', { method: 'POST', headers, body });
}

describe('clerk plugin', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env['CLERK_WEBHOOK_SECRET'];
  });

  it('infers webhookSecret from CLERK_WEBHOOK_SECRET when not provided', async () => {
    process.env['CLERK_WEBHOOK_SECRET'] = 'whsec_env';
    const plugin = clerk();
    const rawBody = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_env'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('an explicit webhookSecret overrides CLERK_WEBHOOK_SECRET', async () => {
    process.env['CLERK_WEBHOOK_SECRET'] = 'whsec_env';
    const plugin = clerk({ webhookSecret: 'whsec_explicit' });
    const rawBody = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_explicit'));
    expect(await plugin.verify(req)).toBe(true);

    const signedWithEnvSecret = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_env'));
    expect(await plugin.verify(signedWithEnvSecret)).toBe(false);
  });

  it('rejects when neither webhookSecret nor CLERK_WEBHOOK_SECRET is set, only on an actual verify', async () => {
    const plugin = clerk();
    const rawBody = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const req = makeRequest(rawBody, {
      'svix-id': 'msg_1',
      'svix-timestamp': timestamp,
      'svix-signature': 'v1,deadbeef',
    });
    await expect(plugin.verify(req)).rejects.toThrow('CLERK_WEBHOOK_SECRET');
  });

  it('rejects a request with missing Svix headers', async () => {
    const plugin = clerk({ webhookSecret: 'whsec_test' });
    expect(await plugin.verify(makeRequest('{}', {}))).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const plugin = clerk({ webhookSecret: 'whsec_test' });
    const rawBody = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } });
    const headers = plugin.sign(rawBody, 'whsec_test');
    const tampered = { ...headers, 'Svix-Signature': 'v1,not-valid' };
    expect(await plugin.verify(makeRequest(rawBody, tampered))).toBe(false);
  });

  it('rejects a timestamp outside the tolerance window', async () => {
    const plugin = clerk({ webhookSecret: 'whsec_test', toleranceSeconds: 10 });
    const rawBody = '{}';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const headers = plugin.sign(rawBody, 'whsec_test');
    vi.setSystemTime(new Date('2024-01-01T00:01:00Z'));
    expect(await plugin.verify(makeRequest(rawBody, headers))).toBe(false);
  });

  it('normalize() prefixes the event type with "clerk."', () => {
    const plugin = clerk({ webhookSecret: 'whsec_test' });
    const event = plugin.normalize(
      { type: 'user.created', data: { id: 'user_1', email_addresses: [] } },
      new Headers({ 'svix-id': 'msg_1' }),
    );
    expect(event.type).toBe('clerk.user.created');
    expect(event.id).toBe('msg_1');
    expect(event.data).toEqual({ id: 'user_1', email_addresses: [] });
  });

  it('buildTestPayload -> sign -> verify -> normalize round-trips correctly', async () => {
    const plugin = clerk({ webhookSecret: 'whsec_test' });
    const { body } = plugin.buildTestPayload('user.created', { id: 'user_1' });
    const rawBody = JSON.stringify(body);
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_test'));

    expect(await plugin.verify(req.clone())).toBe(true);
    const normalized = plugin.normalize(JSON.parse(rawBody), req.headers);
    expect(normalized.type).toBe('clerk.user.created');
    expect(normalized.data).toEqual({ id: 'user_1' });
  });
});
