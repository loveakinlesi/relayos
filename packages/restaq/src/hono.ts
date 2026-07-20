import type { Relay } from './index';

export type HonoRelayContext = {
  req: {
    raw: Request;
    param: (name: string) => string | undefined;
  };
};

export type HonoRelayOptions = {
  /** Route param containing the provider segment. Defaults to "provider". */
  paramName?: string;
};

/**
 * Adapts a relay to a Hono handler. Hono already uses the web-standard
 * Request/Response model, so this only maps route params into Restaq.
 */
export function toHonoHandler<TEventMap extends Record<string, unknown>>(
  relay: Relay<TEventMap>,
  options: HonoRelayOptions = {},
) {
  const paramName = options.paramName ?? 'provider';
  return async (ctx: HonoRelayContext): Promise<Response> => {
    const provider = ctx.req.param(paramName) ?? ctx.req.param('*') ?? '';
    const all = provider.split('/').filter(Boolean);
    return relay.handler(ctx.req.raw, { params: { all } });
  };
}
