import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');

// Every package in the changesets "fixed" group, kept in lockstep on one
// version number. packages/postgres is legacy (no package.json) and
// intentionally excluded.
export const PACKAGE_DIRS = [
  'relayos',
  'core',
  'plugin',
  'stripe',
  'github',
  'cli',
  'clerk',
  'resend',
  'shopify',
].map((name) => path.join(repoRoot, 'packages', name));
