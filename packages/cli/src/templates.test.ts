import { describe, it, expect } from 'vitest';
import { buildRelayConfigTemplate, databasePackages, pluginPackages } from './templates';

describe('buildRelayConfigTemplate', () => {
  it('wires a sqlite database expression with no plugins', () => {
    const output = buildRelayConfigTemplate({ database: 'sqlite', plugins: [] });
    expect(output).toContain("import Database from 'better-sqlite3';");
    expect(output).toContain("database: new Database('restaq.db')");
    expect(output).not.toContain('stripe');
  });

  it('wires a postgres database expression and a stripe plugin', () => {
    const output = buildRelayConfigTemplate({ database: 'postgres', plugins: ['stripe'] });
    expect(output).toContain("import { Pool } from 'pg';");
    expect(output).toContain("import { stripe } from '@restaq/stripe';");
    expect(output).toContain('stripe()');
  });

  it('wires a mysql database expression and multiple plugins', () => {
    const output = buildRelayConfigTemplate({
      database: 'mysql',
      plugins: ['stripe', 'github', 'clerk', 'shopify', 'resend'],
    });
    expect(output).toContain("import { createPool } from 'mysql2';");
    expect(output).toContain("import { github } from '@restaq/github';");
    expect(output).toContain("import { clerk } from '@restaq/clerk';");
    expect(output).toContain("import { shopify } from '@restaq/shopify';");
    expect(output).toContain("import { resend } from '@restaq/resend';");
    expect(output).toContain('github()');
    expect(output).toContain('clerk()');
    expect(output).toContain('shopify()');
    expect(output).toContain('resend()');
  });

  it('exposes the package name for each database and plugin choice', () => {
    expect(databasePackages.sqlite).toBe('better-sqlite3');
    expect(databasePackages.postgres).toBe('pg');
    expect(databasePackages.mysql).toBe('mysql2');
    expect(pluginPackages.stripe).toBe('@restaq/stripe');
    expect(pluginPackages.github).toBe('@restaq/github');
    expect(pluginPackages.clerk).toBe('@restaq/clerk');
    expect(pluginPackages.shopify).toBe('@restaq/shopify');
    expect(pluginPackages.resend).toBe('@restaq/resend');
  });
});
