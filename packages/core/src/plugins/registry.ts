import type { RelayPlugin } from "../types/plugin.js";

/**
 * Holds registered plugins keyed by provider identifier.
 * Registration is expected once at startup inside createRelayOS().
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, RelayPlugin>();

  register(plugin: RelayPlugin): void {
    if (this.plugins.has(plugin.provider)) {
      throw new Error(
        `A plugin for provider "${plugin.provider}" is already registered. ` +
          "Each provider may only be registered once.",
      );
    }
    this.plugins.set(plugin.provider, plugin);
  }

  get(provider: string): RelayPlugin | undefined {
    return this.plugins.get(provider);
  }

  has(provider: string): boolean {
    return this.plugins.has(provider);
  }

  providers(): string[] {
    return [...this.plugins.keys()];
  }
}
