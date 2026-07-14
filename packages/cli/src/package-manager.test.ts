import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager } from './package-manager';

describe('detectPackageManager', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    await writeFile(join(dir, 'pnpm-lock.yaml'), '', 'utf8');
    expect(await detectPackageManager(dir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    await writeFile(join(dir, 'yarn.lock'), '', 'utf8');
    expect(await detectPackageManager(dir)).toBe('yarn');
  });

  it('falls back to npm when no lockfile is present', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pm-'));
    expect(await detectPackageManager(dir)).toBe('npm');
  });
});
