import { describe, it, expect, afterEach } from 'vitest';
import { github } from './index';

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://x/api/relay/github', { method: 'POST', headers, body });
}

describe('github plugin', () => {
  afterEach(() => {
    delete process.env['GITHUB_WEBHOOK_SECRET'];
  });

  it('infers webhookSecret from GITHUB_WEBHOOK_SECRET when not provided', async () => {
    process.env['GITHUB_WEBHOOK_SECRET'] = 'ghsec_env';
    const plugin = github();
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'ghsec_env'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('an explicit webhookSecret overrides GITHUB_WEBHOOK_SECRET', async () => {
    process.env['GITHUB_WEBHOOK_SECRET'] = 'ghsec_env';
    const plugin = github({ webhookSecret: 'ghsec_explicit' });
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'ghsec_explicit'));
    expect(await plugin.verify(req)).toBe(true);

    const signedWithEnvSecret = makeRequest(rawBody, plugin.sign(rawBody, 'ghsec_env'));
    expect(await plugin.verify(signedWithEnvSecret)).toBe(false);
  });

  it('rejects when neither webhookSecret nor GITHUB_WEBHOOK_SECRET is set, only on an actual verify', async () => {
    const plugin = github();
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, { 'X-Hub-Signature-256': `sha256=${'0'.repeat(64)}` });
    await expect(plugin.verify(req)).rejects.toThrow('GITHUB_WEBHOOK_SECRET');
  });

  it('sign() produces a signature verify() accepts', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'ghsec_test'));
    expect(await plugin.verify(req)).toBe(true);
  });

  it('rejects a request with no X-Hub-Signature-256 header', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    expect(await plugin.verify(makeRequest('{}', {}))).toBe(false);
  });

  it('rejects a header not using the sha256= prefix', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const req = makeRequest('{}', { 'X-Hub-Signature-256': 'sha1=deadbeef' });
    expect(await plugin.verify(req)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, { 'X-Hub-Signature-256': `sha256=${'0'.repeat(64)}` });
    expect(await plugin.verify(req)).toBe(false);
  });

  it('rejects a signature produced with a different secret', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const rawBody = JSON.stringify({ ref: 'refs/heads/main' });
    const req = makeRequest(rawBody, plugin.sign(rawBody, 'ghsec_wrong'));
    expect(await plugin.verify(req)).toBe(false);
  });

  it('normalize() reads the event name from the header', () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const headers = new Headers({ 'x-github-event': 'push', 'x-github-delivery': 'del-1' });
    const event = plugin.normalize({}, headers);
    expect(event.type).toBe('github.push');
    expect(event.id).toBe('del-1');
  });

  it('normalize() folds the action into the type for sub-events', () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const headers = new Headers({ 'x-github-event': 'pull_request' });
    const event = plugin.normalize({ action: 'opened' }, headers);
    expect(event.type).toBe('github.pull_request.opened');
  });

  it('buildTestPayload for a plain event has no action field and the right header', () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const { body, headers } = plugin.buildTestPayload('push', { ref: 'refs/heads/main' });
    expect(headers?.['X-GitHub-Event']).toBe('push');
    expect(body).toEqual({ ref: 'refs/heads/main' });
  });

  it('buildTestPayload for a sub-event folds the action into the body', () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const { body, headers } = plugin.buildTestPayload('pull_request.opened', { number: 1 });
    expect(headers?.['X-GitHub-Event']).toBe('pull_request');
    expect(body).toEqual({ number: 1, action: 'opened' });
  });

  it('buildTestPayload -> sign -> verify -> normalize round-trips correctly', async () => {
    const plugin = github({ webhookSecret: 'ghsec_test' });
    const { body, headers: envelopeHeaders } = plugin.buildTestPayload('pull_request.opened', {
      number: 42,
    });
    const rawBody = JSON.stringify(body);
    const allHeaders = { ...envelopeHeaders, ...plugin.sign(rawBody, 'ghsec_test') };
    const req = makeRequest(rawBody, allHeaders);

    expect(await plugin.verify(req.clone())).toBe(true);
    const normalized = plugin.normalize(JSON.parse(rawBody), new Headers(allHeaders));
    expect(normalized.type).toBe('github.pull_request.opened');
  });
});
