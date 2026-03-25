import {
  createRelayOS,
  type ExecutionContext,
  ExecutionStatus,
  type IncomingWebhook,
  type RelayConfig,
  type RelayOS,
  type RelayPlugin,
  StepStatus,
} from "relayos/core";

export type RelayOSOptions = RelayConfig & {
  plugins: RelayPlugin[];
};

export function relayos(options: RelayOSOptions): RelayOS {
  const { plugins, ...config } = options;
  return createRelayOS(config, plugins);
}

export type {
  ExecutionContext,
  IncomingWebhook,
  RelayConfig,
  RelayOS,
  RelayPlugin,
};
export { ExecutionStatus, StepStatus };
