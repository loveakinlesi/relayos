import { resolve } from 'node:path';
import type { ExecutionStep } from '@relayos/core';

export function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function resolveBaseUrl(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return getFlag(args, '--forward') ?? env['RELAYOS_BASE_URL'] ?? 'http://localhost:3000';
}

export function resolveDir(args: string[]): string {
  const dir = getFlag(args, '--dir');
  return dir ? resolve(dir) : process.cwd();
}

export function statusIcon(status: string): string {
  if (status === 'completed') return '✔';
  if (status === 'failed') return '✖';
  return '…';
}

export function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return '(in progress)';
  return `${new Date(endIso).getTime() - new Date(startIso).getTime()}ms`;
}

export function latestStepsByName(steps: ExecutionStep[]): ExecutionStep[] {
  // steps are already ordered ascending by createdAt, so the last write for
  // a given name in this loop is that step's most recent attempt.
  const latest = new Map<string, ExecutionStep>();
  for (const step of steps) {
    latest.set(step.name, step);
  }
  return Array.from(latest.values());
}
