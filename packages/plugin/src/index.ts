import type { RelayPlugin } from '@restaq/core';

export { hmacSha256Hex, safeEqualHex } from './hmac';
export type { NormalizedEvent, RelayPlugin } from '@restaq/core';

/**
 * Resolves a plugin's webhook secret: an explicit option always wins,
 * otherwise falls back to the given environment variable. Throws if
 * neither is set, so a misconfigured plugin fails at construction time
 * rather than on the first incoming webhook.
 */
export function resolveWebhookSecret(explicit: string | undefined, envVar: string): string {
  const secret = explicit ?? process.env[envVar];
  if (!secret) {
    throw new Error(`Webhook secret not found - pass { webhookSecret } or set ${envVar}.`);
  }
  return secret;
}

/**
 * Identity helper for authoring plugins (like defineConfig): gives full
 * inference/checking of the plugin shape and pins the plugin's typed event
 * map so it survives through restaq's plugins array.
 */
export function definePlugin<TEventMap extends Record<string, unknown> = {}>(
  plugin: RelayPlugin<TEventMap>,
): RelayPlugin<TEventMap> {
  return plugin;
}
