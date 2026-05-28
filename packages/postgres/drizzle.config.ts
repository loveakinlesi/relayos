import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL environment variable is required. Set it before running drizzle-kit commands.',
  );
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
