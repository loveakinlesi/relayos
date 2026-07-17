import { spawnSync } from 'node:child_process';
import { PACKAGE_DIRS } from './packages.mjs';

for (const dir of PACKAGE_DIRS) {
  console.log(`\npublishing from ${dir}`);
  const result = spawnSync('npm', ['publish'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
