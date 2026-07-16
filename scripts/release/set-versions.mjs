import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_DIRS } from './packages.mjs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node set-versions.mjs <version>');
  process.exit(1);
}

for (const dir of PACKAGE_DIRS) {
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${pkg.name} -> ${version}`);
}
