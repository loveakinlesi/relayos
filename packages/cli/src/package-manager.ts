import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const lockfiles: [string, PackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

export async function detectPackageManager(dir: string): Promise<PackageManager> {
  for (const [file, pm] of lockfiles) {
    try {
      await access(join(dir, file));
      return pm;
    } catch {
      // keep looking
    }
  }
  return 'npm';
}

const addArgs: Record<PackageManager, string[]> = {
  pnpm: ['add'],
  yarn: ['add'],
  bun: ['add'],
  npm: ['install'],
};

export function installPackages(pm: PackageManager, dir: string, packages: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pm, [...addArgs[pm], ...packages], {
      cwd: dir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${pm} ${addArgs[pm].join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
