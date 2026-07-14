import { describe, it, expect, vi, afterEach } from 'vitest';
import { resend } from './index';

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://x/api/webhook/resend', { method: 'POST', headers, body });
}

describe('resend plugin', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env['RESEND_WEBHOOK_SECRET'];
  });

  it('infers webhookSecret from RESEND_WEBHOOK_SECRET when not provided', async () => {
    process.env['RESEND_WEBHOOK_SECRET'] = 'whsec_env';
    const plugin = resend();
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_1' } });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_env'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('an explicit webhookSecret overrides RESEND_WEBHOOK_SECRET', async () => {
    process.env['RESEND_WEBHOOK_SECRET'] = 'whsec_env';
    const plugin = resend({ webhookSecret: 'whsec_explicit' });
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_1' } });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_explicit'));
    expect(await plugin.verify(req)).toBe(true);

    const signedWithEnvSecret = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_env'));
    expect(await plugin.verify(signedWithEnvSecret)).toBe(false);
  });

  it('rejects when neither webhookSecret nor RESEND_WEBHOOK_SECRET is set, only on an actual verify', async () => {
    const plugin = resend();
    const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'email_1' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const req = makeRequest(rawBody, {
      'svix-id': 'msg_1',
      'svix-timestamp': timestamp,
      'svix-signature': 'v1,deadbeef',
    });
    await expect(plugin.verify(req)).rejects.toThrow('RESEND_WEBHOOK_SECRET');
  });

  it('rejects a request with missing Svix headers', async () => {
    const plugin = resend({ webhookSecret: 'whsec_test' });
    expect(await plugin.verify(makeRequest('{}', {}))).toBe(false);
  });

  it('rejects a timestamp outside the tolerance window', async () => {
    const plugin = resend({ webhookSecret: 'whsec_test', toleranceSeconds: 10 });
    const rawBody = '{}';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const headers = plugin.sign(rawBody, 'whsec_test');
    vi.setSystemTime(new Date('2024-01-01T00:01:00Z'));
    expect(await plugin.verify(makeRequest(rawBody, headers))).toBe(false);
  });

  it('normalize() prefixes the event type with "resend."', () => {
    const plugin = resend({ webhookSecret: 'whsec_test' });
    const event = plugin.normalize(
      { type: 'email.delivered', data: { email_id: 'email_1' } },
      new Headers({ 'svix-id': 'msg_1' }),
    );
    expect(event.type).toBe('resend.email.delivered');
    expect(event.id).toBe('msg_1');
    expect(event.data).toEqual({ email_id: 'email_1' });
  });

  it('buildTestPayload -> sign -> verify -> normalize round-trips correctly', async () => {
    const plugin = resend({ webhookSecret: 'whsec_test' });
    const { body } = plugin.buildTestPayload('email.delivered', { email_id: 'email_1' });
    const rawBody = JSON.stringify(body);
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_test'));

    expect(await plugin.verify(req.clone())).toBe(true);
    const normalized = plugin.normalize(JSON.parse(rawBody), req.headers);
    expect(normalized.type).toBe('resend.email.delivered');
    expect(normalized.data).toEqual({ email_id: 'email_1' });
  });
});
