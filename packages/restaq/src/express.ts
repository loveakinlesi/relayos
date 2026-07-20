import type { Relay } from './index';
import type { NodeNextFunction, NodeRequestLike, NodeResponseLike } from './node-http';
import { toNodeHttpHandler } from './node-http';

export type ExpressRelayRequest = NodeRequestLike;
export type ExpressRelayResponse = NodeResponseLike;
export type ExpressRelayNext = NodeNextFunction;

export type ExpressRelayOptions = {
  /** Route param containing the provider segment. Defaults to "provider". */
  paramName?: string;
};

/**
 * Adapts a relay to an Express route handler.
 *
 * Mount it before JSON body parsing, or use express.raw(), so provider
 * signature verification sees the exact raw request body.
 */
export function toExpressHandler<TEventMap extends Record<string, unknown>>(
  relay: Relay<TEventMap>,
  options: ExpressRelayOptions = {},
) {
  return (req: NodeRequestLike, res: NodeResponseLike, next: NodeNextFunction): Promise<void> =>
    toNodeHttpHandler(relay, options)(req, res, next);
}
