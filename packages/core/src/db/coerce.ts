import type { SqlDialectName } from './detect';

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function fromJson(raw: unknown): unknown {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

export function toTimestamp(iso: string, dialect: SqlDialectName): string | Date {
  return dialect === 'mysql' ? new Date(iso) : iso;
}

export function fromTimestamp(raw: unknown): string {
  return raw instanceof Date ? raw.toISOString() : String(raw);
}
