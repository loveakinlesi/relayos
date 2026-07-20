import { describe, expect, it } from 'vitest';
import type { Relay } from './index';
import { toHonoHandler } from './hono';

describe('toHonoHandler', () => {
  it('passes the raw Hono Request and provider param to relay.handler', async () => {
    const calls: { url: string; all: string[] }[] = [];
    const relay = {
      handler: async (req: Request, ctx: { params: { all: string[] } }) => {
        calls.push({ url: req.url, all: ctx.params.all });
        return Response.json({ ok: true });
      },
    } as unknown as Relay;

    const response = await toHonoHandler(relay)({
      req: {
        raw: new Request('http://x/api/webhook/github', { method: 'POST', body: '{}' }),
        param: (name) => (name === 'provider' ? 'github' : undefined),
      },
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ url: 'http://x/api/webhook/github', all: ['github'] }]);
  });

  it('supports catch-all wildcard params', async () => {
    const calls: string[][] = [];
    const relay = {
      handler: async (_req: Request, ctx: { params: { all: string[] } }) => {
        calls.push(ctx.params.all);
        return new Response(null);
      },
    } as unknown as Relay;

    await toHonoHandler(relay)({
      req: {
        raw: new Request('http://x/api/webhook/shopify'),
        param: (name) => (name === '*' ? 'shopify/orders' : undefined),
      },
    });

    expect(calls).toEqual([['shopify', 'orders']]);
  });
});
