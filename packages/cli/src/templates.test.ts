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
    expect(output).toContain('stripe()');
  });

  it('wires a mysql database expression and multiple plugins', () => {
    const output = buildRelayConfigTemplate({
      database: 'mysql',
      plugins: ['stripe', 'github', 'clerk', 'shopify', 'resend'],
    });
    expect(output).toContain("import { createPool } from 'mysql2';");
    expect(output).toContain("import { github } from '@relayos/github';");
    expect(output).toContain("import { clerk } from '@relayos/clerk';");
    expect(output).toContain("import { shopify } from '@relayos/shopify';");
    expect(output).toContain("import { resend } from '@relayos/resend';");
    expect(output).toContain('github()');
    expect(output).toContain('clerk()');
    expect(output).toContain('shopify()');
    expect(output).toContain('resend()');
  });

  it('exposes the package name for each database and plugin choice', () => {
    expect(databasePackages.sqlite).toBe('better-sqlite3');
    expect(databasePackages.postgres).toBe('pg');
    expect(databasePackages.mysql).toBe('mysql2');
    expect(pluginPackages.stripe).toBe('@relayos/stripe');
    expect(pluginPackages.github).toBe('@relayos/github');
    expect(pluginPackages.clerk).toBe('@relayos/clerk');
    expect(pluginPackages.shopify).toBe('@relayos/shopify');
    expect(pluginPackages.resend).toBe('@relayos/resend');
  });
});
