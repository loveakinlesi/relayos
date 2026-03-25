import type { RelayPlugin, HandlerFn } from "../types/plugin.js";

/**
 * Resolves the handler for a given event name from a plugin.
 *
 * Falls back to null when:
 * - No semantic handler matches
 * - The plugin's resolveHandler() returns null
 *
 * The engine treats null as a no-op: execution completes successfully
 * without running any business logic.
 */
export function resolveHandler(
  plugin: RelayPlugin,
  eventName: string,
): HandlerFn | null {
  return plugin.resolveHandler(eventName) ?? plugin.onEvent ?? null;
}
