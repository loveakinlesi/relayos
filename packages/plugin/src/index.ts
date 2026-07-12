import type { RelayPlugin } from '@relayos/core';

export { hmacSha256Hex, safeEqualHex } from './hmac';
export type { NormalizedEvent, RelayPlugin } from '@relayos/core';

/**
 * Identity helper for authoring plugins (like defineConfig): gives full
 * inference/checking of the plugin shape and pins the plugin's typed event
 * map so it survives through createRelay's plugins array.
 */
export function definePlugin<TEventMap extends Record<string, unknown> = {}>(
  plugin: RelayPlugin<TEventMap>,
): RelayPlugin<TEventMap> {
  return plugin;
}
