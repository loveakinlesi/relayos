import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { Relay } from './index';
import { toNestJsHandler } from './nestjs';

describe('toNestJsHandler', () => {
  it('adapts a NestJS @Req/@Res controller method to relay.handler', async () => {
    const calls: string[][] = [];
    const relay = {
      handler: async (_req: Request, ctx: { params: { all: string[] } }) => {
        calls.push(ctx.params.all);
        return Response.json({ ok: true }, { status: 201 });
      },
    } as unknown as Relay;
    const req = Readable.from([Buffer.from('{}')]) as ReturnType<typeof Readable.from> & {
      method: string;
      url: string;
      headers: Record<string, string>;
      params: Record<string, string>;
    };
    req.method = 'POST';
    req.url = '/relay/clerk';
    req.headers = { host: 'example.com' };
    req.params = { provider: 'clerk' };

    const res = {
      statusCode: 200,
      body: undefined as Buffer | string | undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      send(body: Buffer | string) {
        this.body = body;
      },
    };

    await toNestJsHandler(relay)(req, res);

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(String(res.body))).toEqual({ ok: true });
    expect(calls).toEqual([['clerk']]);
  });
});
