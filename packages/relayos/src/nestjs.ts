import type { Relay } from './index';
import type { NodeRequestLike, NodeResponseLike } from './node-http';
import { toNodeHttpHandler } from './node-http';

export type NestJsRelayRequest = NodeRequestLike;
export type NestJsRelayResponse = NodeResponseLike;

export type NestJsRelayOptions = {
  /** Route param containing the provider segment. Defaults to "provider". */
  paramName?: string;
};

/**
 * Adapts a relay to a NestJS controller method using @Req() and @Res().
 *
 * The route must receive the raw request body; in Express-backed Nest apps,
 * configure raw body access or mount this route before JSON body parsing.
 */
export function toNestJsHandler<TEventMap extends Record<string, unknown>>(
  relay: Relay<TEventMap>,
  options: NestJsRelayOptions = {},
) {
  return (req: NodeRequestLike, res: NodeResponseLike): Promise<void> =>
    toNodeHttpHandler(relay, options)(req, res);
}
