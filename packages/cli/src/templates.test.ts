import { describe, it, expect } from 'vitest';
import { buildRelayConfigTemplate, databasePackages, pluginPackages } from './templates';

describe('buildRelayConfigTemplate', () => {
  it('wires a sqlite database expression with no plugins', () => {
    const output = buildRelayConfigTemplate({ database: 'sqlite', plugins: [] });
    expect(output).toContain("import Database from 'better-sqlite3';");
    expect(output).toContain("database: new Database('relay.db')");
    expect(output).not.toContain('stripe');
  });

  it('wires a postgres database expression and a stripe plugin', () => {
    const output = buildRelayConfigTemplate({ database: 'postgres', plugins: ['stripe'] });
    expect(output).toContain("import { Pool } from 'pg';");
    expect(output).toContain("import { stripe } from '@relayos/stripe';");
    expect(output).toContain('stripe({ webhookSecret: process.env.STRIPE_WEBHOOK_SECRET! })');
  });

  it('wires a mysql database expression and both plugins', () => {
    const output = buildRelayConfigTemplate({ database: 'mysql', plugins: ['stripe', 'github'] });
    expect(output).toContain("import { createPool } from 'mysql2';");
    expect(output).toContain("import { github } from '@relayos/github';");
    expect(output).toContain("github({ webhookSecret: process.env.GITHUB_WEBHOOK_SECRET! })");
  });

  it('exposes the package name for each database and plugin choice', () => {
    expect(databasePackages.sqlite).toBe('better-sqlite3');
    expect(databasePackages.postgres).toBe('pg');
    expect(databasePackages.mysql).toBe('mysql2');
    expect(pluginPackages.stripe).toBe('@relayos/stripe');
    expect(pluginPackages.github).toBe('@relayos/github');
  });
});
