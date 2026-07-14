import { sql, type Kysely } from 'kysely';
import type { SqlDialectName } from '../detect';

export const name = '001_initial';

export async function up(db: Kysely<any>, dialect: SqlDialectName): Promise<void> {
  if (dialect === 'postgres') {
    await sql`
      create table if not exists relayos_executions (
        id text primary key,
        event_id text not null unique,
        event_type text not null,
        event_data jsonb not null,
        status text not null,
        attempt integer not null default 1,
        replayed_from text,
        created_at timestamptz not null,
        completed_at timestamptz,
        error text
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_steps (
        id text primary key,
        execution_id text not null references relayos_executions(id),
        name text not null,
        status text not null,
        output jsonb,
        error text,
        created_at timestamptz not null
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_logs (
        id text primary key,
        execution_id text not null references relayos_executions(id),
        level text not null,
        source text not null,
        message text not null,
        data jsonb,
        created_at timestamptz not null
      )
    `.execute(db);
    return;
  }

  if (dialect === 'mysql') {
    await sql`
      create table if not exists relayos_executions (
        id varchar(36) primary key,
        event_id varchar(255) not null unique,
        event_type varchar(255) not null,
        event_data json not null,
        status varchar(32) not null,
        attempt integer not null default 1,
        replayed_from varchar(36),
        created_at datetime(3) not null,
        completed_at datetime(3),
        error text
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_steps (
        id varchar(36) primary key,
        execution_id varchar(36) not null,
        name varchar(255) not null,
        status varchar(32) not null,
        output json,
        error text,
        created_at datetime(3) not null,
        foreign key (execution_id) references relayos_executions(id)
      )
    `.execute(db);
    await sql`
      create table if not exists relayos_execution_logs (
        id varchar(36) primary key,
        execution_id varchar(36) not null,
        level varchar(32) not null,
        source varchar(32) not null,
        message text not null,
        data json,
        created_at datetime(3) not null,
        foreign key (execution_id) references relayos_executions(id)
      )
    `.execute(db);
    return;
  }

  // sqlite
  await sql`
    create table if not exists relayos_executions (
      id text primary key,
      event_id text not null unique,
      event_type text not null,
      event_data text not null,
      status text not null,
      attempt integer not null default 1,
      replayed_from text,
      created_at text not null,
      completed_at text,
      error text
    )
  `.execute(db);
  await sql`
    create table if not exists relayos_execution_steps (
      id text primary key,
      execution_id text not null references relayos_executions(id),
      name text not null,
      status text not null,
      output text,
      error text,
      created_at text not null
    )
  `.execute(db);
  await sql`
    create table if not exists relayos_execution_logs (
      id text primary key,
      execution_id text not null references relayos_executions(id),
      level text not null,
      source text not null,
      message text not null,
      data text,
      created_at text not null
    )
  `.execute(db);
}
