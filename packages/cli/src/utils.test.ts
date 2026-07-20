import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { ExecutionStep } from '@restaq/core';
import {
  getFlag,
  hasFlag,
  resolveBaseUrl,
  resolveDir,
  statusIcon,
  formatDuration,
  latestStepsByName,
} from './utils';

describe('getFlag', () => {
  it('returns the value following the flag', () => {
    expect(getFlag(['--data', '{"a":1}'], '--data')).toBe('{"a":1}');
  });

  it('returns undefined when the flag is absent', () => {
    expect(getFlag(['trigger', 'stripe'], '--data')).toBeUndefined();
  });

  it('returns undefined when the flag is the last argument with no value', () => {
    expect(getFlag(['trigger', '--data'], '--data')).toBeUndefined();
  });
});

describe('hasFlag', () => {
  it('detects a present boolean flag', () => {
    expect(hasFlag(['inspect', 'evt_1', '--json'], '--json')).toBe(true);
  });

  it('returns false when absent', () => {
    expect(hasFlag(['inspect', 'evt_1'], '--json')).toBe(false);
  });
});

describe('resolveBaseUrl', () => {
  it('prefers --forward over everything else', () => {
    const url = resolveBaseUrl(['--forward', 'http://example.com'], {
      RESTAQ_BASE_URL: 'http://env.example.com',
    });
    expect(url).toBe('http://example.com');
  });

  it('falls back to RESTAQ_BASE_URL when --forward is absent', () => {
    const url = resolveBaseUrl([], { RESTAQ_BASE_URL: 'http://env.example.com' });
    expect(url).toBe('http://env.example.com');
  });

  it('defaults to localhost:3000 when neither is set', () => {
    expect(resolveBaseUrl([], {})).toBe('http://localhost:3000');
  });
});

describe('resolveDir', () => {
  it('resolves --dir relative to cwd', () => {
    expect(resolveDir(['--dir', 'my-app'])).toBe(resolve('my-app'));
  });

  it('defaults to process.cwd() when --dir is absent', () => {
    expect(resolveDir([])).toBe(process.cwd());
  });
});

describe('statusIcon', () => {
  it('maps known statuses to icons', () => {
    expect(statusIcon('completed')).toBe('✔');
    expect(statusIcon('failed')).toBe('✖');
    expect(statusIcon('pending')).toBe('…');
  });
});

describe('formatDuration', () => {
  it('computes elapsed ms between two ISO timestamps', () => {
    expect(formatDuration('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:01.500Z')).toBe('1500ms');
  });

  it('reports in-progress when there is no end time', () => {
    expect(formatDuration('2024-01-01T00:00:00.000Z')).toBe('(in progress)');
  });
});

describe('latestStepsByName', () => {
  function step(overrides: Partial<ExecutionStep>): ExecutionStep {
    return {
      id: 'id',
      executionId: 'exec',
      name: 'step',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('keeps only the most recent attempt per step name', () => {
    const steps = [
      step({ id: 's1', name: 'a', status: 'failed', createdAt: '2024-01-01T00:00:00.000Z' }),
      step({ id: 's2', name: 'a', status: 'completed', createdAt: '2024-01-01T00:00:01.000Z' }),
      step({ id: 's3', name: 'b', status: 'completed', createdAt: '2024-01-01T00:00:02.000Z' }),
    ];
    const result = latestStepsByName(steps);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.name === 'a')?.id).toBe('s2');
    expect(result.find((s) => s.name === 'b')?.id).toBe('s3');
  });

  it('returns an empty array for no steps', () => {
    expect(latestStepsByName([])).toEqual([]);
  });
});
