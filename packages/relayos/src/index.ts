import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import type {
  ExecutionContext,
  IncomingWebhook,
  RelayConfig,
  RelayOS,
  RelayPlugin,
} from "relayos/core";

export type RelayOSOptions = {
  database: {
    connectionString?: string;
    pool?: RelayConfig["database"]["pool"];
    schema?: string;
  };
  retry?: Partial<RelayConfig["retry"]>;
  concurrency?: Partial<RelayConfig["concurrency"]>;
  logLevel?: RelayConfig["logLevel"];
  retryPollIntervalMs?: number;
  plugins?: RelayPlugin[];
};

export function defineRelayConfig(config: RelayOSOptions): RelayOSOptions {
  return config;
}

async function loadCore() {
  return import("relayos/core");
}

export const ExecutionStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Retrying: "retrying",
  Cancelled: "cancelled",
} as const;

export const StepStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
} as const;

function isRelayOSRuntime(value: unknown): value is RelayOS {
  return (
    !!value &&
    typeof value === "object" &&
    "start" in value &&
    "processEvent" in value &&
    "shutdown" in value
  );
}

async function loadRelayOSConfig(): Promise<RelayOSOptions | RelayOS> {
  const configNames = [
    "relayos.config.ts",
    "relayos.config.mjs",
    "relayos.config.js",
  ];

  for (const configName of configNames) {
    const configPath = resolve(cwd(), configName);
    if (!existsSync(configPath)) {
      continue;
    }

    const configModule = await import(pathToFileURL(configPath).href);
    return configModule.default ?? configModule;
  }

  throw new Error(
    "No RelayOS config found. Create relayos.config.ts, relayos.config.js, or relayos.config.mjs.",
  );
}

export function relayos(): Promise<RelayOS>;
export function relayos(options: RelayOSOptions): RelayOS;
export function relayos(options?: RelayOSOptions): RelayOS | Promise<RelayOS> {
  if (!options) {
    return loadRelayOSConfig().then(async (loaded) => {
      if (isRelayOSRuntime(loaded)) {
        return loaded;
      }

      const { createRelayOS } = await loadCore();
      const runtime = createRelayOS(loaded);
      void runtime.start();
      return runtime;
    });
  }

  const runtimePromise = (async () => {
    const { createRelayOS } = await loadCore();
    const runtime = createRelayOS(options);
    void runtime.start();
    return runtime;
  })();

  return {
    start: async () => (await runtimePromise).start(),
    processEvent: async (input) => (await runtimePromise).processEvent(input),
    ingestEvent: async (event) => (await runtimePromise).ingestEvent(event),
    replay: async (eventId) => (await runtimePromise).replay(eventId),
    resume: async (executionId) => (await runtimePromise).resume(executionId),
    progress: async (executionId) => (await runtimePromise).progress(executionId),
    getPlugin: (provider) => {
      void provider;
      throw new Error('Call "await relayos()" before using getPlugin().');
    },
    subscribe: () => {
      throw new Error('Call "await relayos()" before using subscribe().');
    },
    shutdown: async () => (await runtimePromise).shutdown(),
  } as RelayOS;
}

export type {
  ExecutionContext,
  IncomingWebhook,
  RelayConfig,
  RelayOS,
  RelayPlugin,
};
