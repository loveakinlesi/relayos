import type { Relay } from './index';

type NextRouteContext = {
  params: Promise<{ all: string[] }>;
};

export function toNextJsHandler(relay: Relay) {
  return {
    POST: async (req: Request, ctx: NextRouteContext) => {
      const { all } = await ctx.params;
      return relay.handler(req, { params: { all } });
    },
  };
}
