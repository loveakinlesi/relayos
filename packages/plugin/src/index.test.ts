import { describe, it, expect, expectTypeOf, afterEach } from 'vitest';
import type { RelayPlugin } from '@restaq/core';
import { definePlugin, resolveWebhookSecret } from './index';

describe('resolveWebhookSecret', () => {
  const envVar = 'TEST_PLUGIN_WEBHOOK_SECRET';

  afterEach(() => {
    delete process.env[envVar];
  });

  it('returns the explicit secret when provided, ignoring the env var', () => {
    process.env[envVar] = 'from-env';
    expect(resolveWebhookSecret('from-options', envVar)).toBe('from-options');
  });

  it('falls back to the env var when no explicit secret is provided', () => {
    process.env[envVar] = 'from-env';
    expect(resolveWebhookSecret(undefined, envVar)).toBe('from-env');
  });

  it('throws when neither an explicit secret nor the env var is set', () => {
    expect(() => resolveWebhookSecret(undefined, envVar)).toThrow(envVar);
  });
});

describe('definePlugin', () => {
  it('returns exactly the object it was given (identity)', () => {
    const plugin = {
      id: 'test',
      async verify() {
        return true;
      },
      normalize() {
        return {
          id: 'e1',
          type: 'test.event',
          data: {},
          receivedAt: new Date().toISOString(),
        };
      },
      sign() {
        return {};
      },
      buildTestPayload() {
        return { body: {} };
      },
    };

    const result = definePlugin(plugin);
    expect(result).toBe(plugin);
  });

  it('accepts a minimal RelayPlugin shape and preserves its id', () => {
    const plugin = definePlugin({
      id: 'demo',
      async verify() {
        return true;
      },
      normalize() {
        return {
          id: 'e1',
          type: 'demo.event',
          data: {},
          receivedAt: new Date().toISOString(),
        };
      },
      sign() {
        return {};
      },
      buildTestPayload() {
        return { body: {} };
      },
    });

    expect(plugin.id).toBe('demo');
  });

  it('preserves typed event map through the helper', () => {
    type DemoMap = { 'demo.thing': { n: number } };

    const plugin = definePlugin<DemoMap>({
      id: 'demo',
      async verify() {
        return true;
      },
      normalize() {
        return {
          id: 'e1',
          type: 'demo.thing' as const,
          data: { n: 42 },
          receivedAt: new Date().toISOString(),
        };
      },
      sign() {
        return {};
      },
      buildTestPayload() {
        return { body: {} };
      },
    });

    expectTypeOf(plugin).toEqualTypeOf<RelayPlugin<DemoMap>>();
  });
});
