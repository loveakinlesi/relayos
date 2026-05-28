import type { ExecutionStore } from './storage/index';
import type { HandlerRegistry } from './handlers/index';

/**
 * Configuration contract for the RelayOS runtime.
 * All fields are optional during bootstrapping; required fields added as the runtime matures.
 */
export interface RelayCoreOptions {
  storage?: ExecutionStore;
  handlers?: HandlerRegistry;
}

export function createRelayCore(_options?: RelayCoreOptions) {
  //
}
