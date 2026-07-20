import { spawnSync } from 'node:child_process';
import { PACKAGE_DIRS } from './packages.mjs';

for (const dir of PACKAGE_DIRS) {
  console.log(`\npublishing from ${dir}`);
  // pnpm publish, not npm publish: several packages depend on each other via
  // the workspace: protocol (e.g. restaq -> @restaq/core), and only pnpm
  // rewrites those to real version numbers at pack time. Plain npm publish
  // would ship the literal string "workspace:^" into package.json.
  const result = spawnSync('pnpm', ['publish', '--no-git-checks'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
