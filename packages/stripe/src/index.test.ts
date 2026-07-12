import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripe } from './index';

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://x/api/relay/stripe', { method: 'POST', headers, body });
}

describe('stripe plugin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sign() produces a signature verify() accepts', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'charge.succeeded', data: { object: {} } });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_test'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('rejects a request with no Stripe-Signature header', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    expect(await plugin.verify(makeRequest('{}', {}))).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const headers = plugin.sign(rawBody, 'whsec_test');
    const tampered = {
      ...headers,
      'Stripe-Signature': headers['Stripe-Signature']!.replace(/v1=.+/, `v1=${'0'.repeat(64)}`),
    };
    expect(await plugin.verify(makeRequest(rawBody, tampered))).toBe(false);
  });

  it('rejects a signature produced with a different secret', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const headers = plugin.sign(rawBody, 'whsec_wrong');
    expect(await plugin.verify(makeRequest(rawBody, headers))).toBe(false);
  });

  it('rejects a timestamp outside the tolerance window', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test', toleranceSeconds: 10 });
    const rawBody = '{}';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const headers = plugin.sign(rawBody, 'whsec_test');
    vi.setSystemTime(new Date('2024-01-01T00:01:00Z')); // 60s later, tolerance is 10s
    expect(await plugin.verify(makeRequest(rawBody, headers))).toBe(false);
  });

  it('normalize() prefixes the event type with "stripe."', () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    const event = plugin.normalize(
      { id: 'evt_1', type: 'charge.succeeded', data: { object: { amount: 100 } } },
      new Headers(),
    );
    expect(event.type).toBe('stripe.charge.succeeded');
    expect(event.id).toBe('evt_1');
    expect(event.data).toEqual({ object: { amount: 100 } });
  });

  it('buildTestPayload -> sign -> verify -> normalize round-trips correctly', async () => {
    const plugin = stripe({ webhookSecret: 'whsec_test' });
    const { body } = plugin.buildTestPayload('payment_intent.succeeded', { amount: 5000 });
    const rawBody = JSON.stringify(body);
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'whsec_test'));

    expect(await plugin.verify(req.clone())).toBe(true);
    const normalized = plugin.normalize(JSON.parse(rawBody), new Headers());
    expect(normalized.type).toBe('stripe.payment_intent.succeeded');
    expect(normalized.data).toEqual({ object: { amount: 5000 } });
  });
});
