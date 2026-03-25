import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type InjectionToken,
  type ModuleMetadata,
  type OnModuleDestroy,
  type Provider,
} from "@nestjs/common";
import {
  createRelayOS,
  ExecutionStatus,
  type RelayConfig,
  type RelayOS,
  type RelayPlugin,
} from "relayos/core";
import { findExecutionById, updateExecutionStatus } from "relayos/core/persistence/executions.repo";
import { findStepsByExecution } from "relayos/core/persistence/steps.repo";
import { replayEvent } from "relayos/core/replay/replay";
import { resumeFailedExecution } from "relayos/core/replay/resume";
import { getRelayOSInternals } from "relayos/core/runtime/internals";

type HeaderValue = string | string[] | number | boolean | undefined | null;

export type RelayOSModuleOptions = RelayConfig & {
  plugins: RelayPlugin[];
};

export type RelayOSModuleAsyncOptions = Pick<ModuleMetadata, "imports"> & {
  inject?: Array<InjectionToken>;
  useFactory: (...args: unknown[]) => RelayOSModuleOptions | Promise<RelayOSModuleOptions>;
};

export type NestWebhookRequest = {
  headers?: Record<string, HeaderValue>;
  rawBody?: Buffer | string;
  body?: Buffer | string;
};

export type NestWebhookResponse = {
  status(code: number): NestWebhookResponse;
  json(body: unknown): unknown;
};

export type NestWebhookResult = {
  statusCode: 202 | 400 | 401 | 404 | 500;
  body: {
    ok: boolean;
    message: string;
    code?: string;
  };
};

export type RelayExecutionProgress = {
  execution: Awaited<ReturnType<typeof findExecutionById>>;
  steps: Awaited<ReturnType<typeof findStepsByExecution>>;
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    pendingSteps: number;
  };
};

export const RELAYOS_MODULE_OPTIONS = Symbol.for("relayos/nestjs/module-options");
export const RELAYOS_RUNTIME = Symbol.for("relayos/nestjs/runtime");

export function normalizeHeaders(
  headers: Record<string, HeaderValue> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (!headers) {
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    const normalizedKey = key.toLowerCase();

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      normalized[normalizedKey] = String(value[0]);
      continue;
    }

    normalized[normalizedKey] = String(value);
  }

  return normalized;
}

function toBuffer(rawBody: Buffer | string | undefined, body: Buffer | string | undefined): Buffer | null {
  const value = rawBody ?? body;

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    return Buffer.from(value);
  }

  return null;
}

function asRuntimeErrorLike(value: unknown): { code?: unknown; message?: unknown } {
  if (value && typeof value === "object") {
    return value as { code?: unknown; message?: unknown };
  }

  return {};
}

export async function handleNestWebhook(
  runtime: Pick<RelayOS, "processEvent">,
  provider: string,
  request: NestWebhookRequest,
): Promise<NestWebhookResult> {
  const normalizedProvider = provider.trim();

  if (!normalizedProvider) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        message: "Route param 'provider' is required.",
        code: "PROVIDER_REQUIRED",
      },
    };
  }

  const rawBody = toBuffer(request.rawBody, request.body);
  if (!rawBody) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        message: "rawBody is required. Configure Nest to preserve raw request bytes.",
        code: "RAW_BODY_REQUIRED",
      },
    };
  }

  try {
    await runtime.processEvent({
      provider: normalizedProvider,
      rawBody,
      headers: normalizeHeaders(request.headers),
    });

    return {
      statusCode: 202,
      body: {
        ok: true,
        message: "Webhook accepted.",
      },
    };
  } catch (error) {
    const runtimeError = asRuntimeErrorLike(error);
    const errorCode = typeof runtimeError.code === "string" ? runtimeError.code : undefined;
    const errorMessage =
      typeof runtimeError.message === "string" && runtimeError.message.length > 0
        ? runtimeError.message
        : undefined;

    if (errorCode === "VERIFICATION_FAILED") {
      return {
        statusCode: 401,
        body: {
          ok: false,
          message: errorMessage ?? "Webhook verification failed.",
          code: errorCode,
        },
      };
    }

    if (errorCode === "PLUGIN_NOT_FOUND") {
      return {
        statusCode: 404,
        body: {
          ok: false,
          message: errorMessage ?? "No plugin registered for provider.",
          code: errorCode,
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        ok: false,
        message: "Unexpected webhook processing failure.",
        code: "INTERNAL_ERROR",
      },
    };
  }
}

@Injectable()
export class RelayOSService implements OnModuleDestroy {
  constructor(@Inject(RELAYOS_RUNTIME) private readonly runtime: RelayOS) {}

  get instance(): RelayOS {
    return this.runtime;
  }

  async handle(
    provider: string,
    request: NestWebhookRequest,
    response: NestWebhookResponse,
  ): Promise<unknown> {
    const result = await handleNestWebhook(this.runtime, provider, request);

    return response.status(result.statusCode).json(result.body);
  }

  replay(eventId: string): Promise<void> {
    return replayEvent(this.runtime, eventId);
  }

  resume(executionId: string): Promise<void> {
    return resumeFailedExecution(this.runtime, executionId);
  }

  async stop(executionId: string) {
    const { pool, schema } = getRelayOSInternals(this.runtime);

    return updateExecutionStatus(pool, schema, executionId, ExecutionStatus.Cancelled, {
      finishedAt: new Date(),
    });
  }

  async progress(executionId: string): Promise<RelayExecutionProgress> {
    const { pool, schema } = getRelayOSInternals(this.runtime);
    const execution = await findExecutionById(pool, schema, executionId);

    if (!execution) {
      throw new Error(`Execution "${executionId}" not found`);
    }

    const steps = await findStepsByExecution(pool, schema, executionId);
    const { completedSteps, failedSteps } = steps.reduce(
      (acc: { completedSteps: number; failedSteps: number }, step: { status: string }) => {
        if (step.status === "completed") {
          acc.completedSteps += 1;
        } else if (step.status === "failed") {
          acc.failedSteps += 1;
        }
        return acc;
      },
      { completedSteps: 0, failedSteps: 0 },
    );

    return {
      execution,
      steps,
      summary: {
        totalSteps: steps.length,
        completedSteps,
        failedSteps,
        pendingSteps: steps.length - completedSteps - failedSteps,
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime.shutdown();
  }
}

@Module({})
export class RelayOSModule {
  static forRoot(options: RelayOSModuleOptions): DynamicModule {
    return createRelayOSModule({
      module: RelayOSModule,
      providers: [
        {
          provide: RELAYOS_MODULE_OPTIONS,
          useValue: options,
        },
        createRuntimeProvider(RELAYOS_MODULE_OPTIONS),
        RelayOSService,
      ],
    });
  }

  static forRootAsync(options: RelayOSModuleAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: RELAYOS_MODULE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    return createRelayOSModule({
      module: RelayOSModule,
      imports: options.imports,
      providers: [optionsProvider, createRuntimeProvider(RELAYOS_MODULE_OPTIONS), RelayOSService],
    });
  }
}

function createRuntimeProvider(optionsToken: typeof RELAYOS_MODULE_OPTIONS): Provider {
  return {
    provide: RELAYOS_RUNTIME,
    useFactory: async (options: RelayOSModuleOptions): Promise<RelayOS> => {
      const runtime = createRelayOS(options);
      await runtime.start();
      return runtime;
    },
    inject: [optionsToken],
  };
}

function createRelayOSModule(moduleDefinition: DynamicModule): DynamicModule {
  return {
    global: false,
    exports: [RelayOSService, RELAYOS_RUNTIME],
    ...moduleDefinition,
  };
}
