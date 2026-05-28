import type { RelayCoreOptions } from '@relayos/core';

/**
 * Top-level SDK configuration.
 * Composes core runtime options with SDK-level concerns (providers, adapters).
 * Fields will be populated as the SDK matures.
 */
export interface RelayOSOptions extends RelayCoreOptions {}

/**
 * A RelayOS SDK instance returned by {@link relayos}.
 * Methods will be populated as the SDK matures.
 */
export interface RelayInstance {}

/**
 * Creates a RelayOS SDK instance.
 * This is the primary developer-facing entrypoint for the RelayOS runtime.
 */
export function relayos(_options?: RelayOSOptions): RelayInstance {
  return {};
}
