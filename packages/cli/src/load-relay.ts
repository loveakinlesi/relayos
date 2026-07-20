import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createJiti } from 'jiti';
import type { Relay } from '@restaq/core';

export async function loadRelay(dir: string): Promise<Relay> {
  const configPath = join(dir, 'relay.ts');
  try {
    await access(configPath);
  } catch {
    throw new Error(`Could not find relay.ts in ${dir}. Run "relay init" first, or pass --dir.`);
  }

  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(configPath)) as { restaq?: Relay };
  if (!mod.restaq) {
    throw new Error(
      `${configPath} does not export a "restaq" - expected "export const restaq = createRestaq({ ... })".`,
    );
  }
  return mod.restaq;
}
