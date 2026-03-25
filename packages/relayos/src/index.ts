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
  const runtime = createRelayOS(options);
  void runtime.start();
  return runtime;
}

export type {
  ExecutionContext,
  IncomingWebhook,
  RelayConfig,
  RelayOS,
  RelayPlugin,
};
export { ExecutionStatus, StepStatus };
