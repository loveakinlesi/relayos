import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageName } from './wizard';

describe('detectPackageName', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reads the name from package.json', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pkgname-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'my-webhook-app' }), 'utf8');
    expect(await detectPackageName(dir)).toBe('my-webhook-app');
  });

  it('returns undefined when package.json has no name', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pkgname-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({}), 'utf8');
    expect(await detectPackageName(dir)).toBeUndefined();
  });

  it('returns undefined when package.json does not exist', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-pkgname-'));
    expect(await detectPackageName(dir)).toBeUndefined();
  });
});
