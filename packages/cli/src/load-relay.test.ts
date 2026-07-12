import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRelay } from './load-relay';

describe('loadRelay', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('imports relay.ts from the given directory and returns its `relay` export', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-load-'));
    await writeFile(
      join(dir, 'relay.ts'),
      `export const relay = {
        migrate: async () => 'migrated',
        listExecutions: async () => [{ id: '1' }],
      };
      `,
      'utf8',
    );

    const relay = (await loadRelay(dir)) as unknown as {
      migrate: () => Promise<string>;
      listExecutions: () => Promise<unknown[]>;
    };
    expect(await relay.migrate()).toBe('migrated');
    expect(await relay.listExecutions()).toEqual([{ id: '1' }]);
  });

  it('throws a clear error when relay.ts does not exist', async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-load-'));
    await expect(loadRelay(dir)).rejects.toThrow(/relay\.ts/);
  });
});
