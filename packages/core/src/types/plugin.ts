import type { ExecutionContext } from "./context.js";
import type { RawNormalizedEvent } from "./event.js";

export type HandlerFn = (ctx: ExecutionContext) => Promise<void>;

/**
 * Contract every provider plugin must satisfy.
 *
 * The core runtime only interacts with plugins through this interface —
 * it never contains provider-specific logic.
 */
export type RelayPlugin = {
  /** Unique provider identifier, e.g. "stripe", "github". */
  readonly provider: string;

  /**
   * Validates the authenticity of an incoming webhook request.
   * Must throw a VerificationError on failure.
   */
  verify(rawBody: Buffer, headers: Record<string, string>): Promise<void>;

  /**
   * Converts the raw HTTP payload into a normalised RelayOS event shape.
   * Must be deterministic and side-effect free.
   */
  normalize(rawBody: Buffer, headers: Record<string, string>): Promise<RawNormalizedEvent>;

  /**
   * Returns the handler for a specific event name.
   * Returns null if no handler is registered for this event (no-op execution).
   */
  resolveHandler(eventName: string): HandlerFn | null;

  /**
   * Optional generic fallback when no semantic handler is registered.
   */
  onEvent?: HandlerFn;
};
