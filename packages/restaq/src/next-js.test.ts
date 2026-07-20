import { describe, it, expect } from 'vitest';
import type { Relay } from './index';
import { toNextJsHandler } from './next-js';

describe('toNextJsHandler', () => {
  it('awaits Next.js route params and forwards them to relay.handler', async () => {
    const calls: { url: string; all: string[] }[] = [];
    const relay = {
      handler: async (req: Request, ctx: { params: { all: string[] } }) => {
        calls.push({ url: req.url, all: ctx.params.all });
        return Response.json({ ok: true });
      },
    } as unknown as Relay;

    const { POST } = toNextJsHandler(relay);
    const req = new Request('http://x/api/webhook/stripe', { method: 'POST', body: '{}' });
    const res = await POST(req, { params: Promise.resolve({ all: ['stripe'] }) });

    expect(res.status).toBe(200);
    expect(calls).toEqual([{ url: 'http://x/api/webhook/stripe', all: ['stripe'] }]);
  });
});
