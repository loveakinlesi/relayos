import { Readable } from 'node:stream';
import type { IncomingHttpHeaders } from 'node:http';
import type { Relay } from './index';

type RequestBody = string | Uint8Array | ReadableStream;

export type NodeRequestLike = Readable & {
  body?: unknown;
  headers: IncomingHttpHeaders;
  method?: string;
  originalUrl?: string;
  params?: Record<string, string | string[] | undefined>;
  protocol?: string;
  readable?: boolean;
  url?: string;
  get?: (name: string) => string | undefined;
};

export type NodeResponseLike = {
  statusCode?: number;
  status?: (code: number) => NodeResponseLike;
  setHeader: (name: string, value: number | string | readonly string[]) => NodeResponseLike;
  end?: (body?: Buffer | string) => unknown;
  send?: (body: Buffer | string) => unknown;
};

export type NodeNextFunction = (error?: unknown) => void;

function headerEntries(headers: IncomingHttpHeaders): [string, string][] {
  return Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined) return [];
    if (Array.isArray(value)) return [[name, value.join(', ')]];
    return [[name, value]];
  });
}

function requestUrl(req: NodeRequestLike): string {
  const host = req.headers.host ?? 'localhost';
  const protocol = req.protocol ?? req.get?.('x-forwarded-proto') ?? 'http';
  return new URL(req.originalUrl ?? req.url ?? '/', `${protocol}://${host}`).toString();
}

function bodyInit(req: NodeRequestLike): RequestBody | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (typeof req.body === 'string' || req.body instanceof Uint8Array) return req.body;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.readable) return Readable.toWeb(req);
  return undefined;
}

export function toWebRequest(req: NodeRequestLike): Request {
  return new Request(requestUrl(req), {
    method: req.method,
    headers: headerEntries(req.headers),
    body: bodyInit(req),
    duplex: 'half',
  } as RequestInit);
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function relayPathParts(req: NodeRequestLike, paramName = 'provider'): string[] {
  const params = req.params ?? {};
  const named = firstString(params[paramName]);
  if (named) return [named];

  const all = params['all'];
  if (Array.isArray(all)) return all;
  if (all) return all.split('/').filter(Boolean);

  const wildcard = firstString(params['0'] ?? params['*']);
  if (wildcard) return wildcard.split('/').filter(Boolean);

  const pathname = new URL(requestUrl(req)).pathname;
  return pathname.split('/').filter(Boolean).slice(-1);
}

export async function sendWebResponse(res: NodeResponseLike, response: Response): Promise<void> {
  const headers = Object.fromEntries(response.headers.entries());
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }

  if (typeof res.status === 'function') {
    res.status(response.status);
  } else {
    res.statusCode = response.status;
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (typeof res.send === 'function') {
    res.send(body);
    return;
  }

  if (typeof res.end === 'function') {
    res.end(body);
  }
}

export function toNodeHttpHandler<TEventMap extends Record<string, unknown>>(
  relay: Relay<TEventMap>,
  options: { paramName?: string } = {},
) {
  return async (req: NodeRequestLike, res: NodeResponseLike, next?: NodeNextFunction) => {
    try {
      const response = await relay.handler(toWebRequest(req), {
        params: { all: relayPathParts(req, options.paramName) },
      });
      await sendWebResponse(res, response);
    } catch (error) {
      if (next) {
        next(error);
        return;
      }
      throw error;
    }
  };
}
