import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { Relay } from './index';
import { toExpressHandler } from './express';

function makeRelay(calls: { url: string; all: string[]; body: unknown }[]): Relay {
  return {
    handler: async (req: Request, ctx: { params: { all: string[] } }) => {
      calls.push({ url: req.url, all: ctx.params.all, body: await req.json() });
      return Response.json({ ok: true }, { status: 202, headers: { 'x-relay': 'yes' } });
    },
  } as unknown as Relay;
}

function makeReq(body: unknown, params: Record<string, string> = { provider: 'stripe' }) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as ReturnType<
    typeof Readable.from
  > & {
    method: string;
    url: string;
    originalUrl: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  };
  req.method = 'POST';
  req.url = '/api/webhook/stripe';
  req.originalUrl = '/api/webhook/stripe';
  req.headers = { host: 'example.com', 'content-type': 'application/json' };
  req.params = params;
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, number | string | readonly string[]>,
    body: undefined as Buffer | string | undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: number | string | readonly string[]) {
      this.headers[name] = value;
      return this;
    },
    send(body: Buffer | string) {
      this.body = body;
    },
  };
}

describe('toExpressHandler', () => {
  it('forwards route params and raw request bodies to relay.handler', async () => {
    const calls: { url: string; all: string[]; body: unknown }[] = [];
    const handler = toExpressHandler(makeRelay(calls));
    const res = makeRes();

    await handler(makeReq({ id: 'evt_1' }), res, undefined as never);

    expect(res.statusCode).toBe(202);
    expect(res.headers['x-relay']).toBe('yes');
    expect(JSON.parse(String(res.body))).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        url: 'http://example.com/api/webhook/stripe',
        all: ['stripe'],
        body: { id: 'evt_1' },
      },
    ]);
  });

  it('passes errors to next', async () => {
    const relay = {
      handler: async () => {
        throw new Error('boom');
      },
    } as unknown as Relay;
    const next = vi.fn();

    await toExpressHandler(relay)(makeReq({}), makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});
