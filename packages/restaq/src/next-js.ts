import type { Relay } from './index';

type NextRouteContext = {
  params: Promise<{ all: string[] }>;
};

/**
 * Adapts a relay to a Next.js App Router catch-all route. Usage, in
 * app/api/webhook/[...all]/route.ts:
 *
 *   export const { POST } = toNextJsHandler(relay);
 *
 * Uses only web-standard Request/Response plus Next's promise-shaped route
 * params - no import from 'next' is needed.
 */
export function toNextJsHandler<TEventMap extends Record<string, unknown>>(
  relay: Relay<TEventMap>,
) {
  return {
    POST: async (req: Request, ctx: NextRouteContext) => {
      const { all } = await ctx.params;
      return relay.handler(req, { params: { all } });
    },
  };
}
