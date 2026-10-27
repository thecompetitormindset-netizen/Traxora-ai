// The tables this system owns, as statements the app can apply itself.
//
// They live here rather than only in supabase/migrations.sql because a .sql
// file is not bundled into a serverless function — it would not exist at
// runtime to read. Keeping them as a module means the deployment always
// carries its own schema and can apply it without anyone opening a database
// console.
//
// Every statement is idempotent: `if not exists` throughout, and additive
// columns guarded by their own existence check. Applying them twice is a
// no-op, which is what makes it safe to run on a schedule rather than
// remembering to run it once.
//
// Nothing here drops or alters existing data. A migration that can destroy is
// a migration nobody can safely automate, so this file is restricted to
// creating what is missing. Anything destructive stays a deliberate, manual
// act.

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    name: "daily_picks",
    sql: `
      create table if not exists daily_picks (
        run_date       date        not null,
        symbol         text        not null,
        rank           int         not null,
        direction      text        not null,
        conviction     numeric     not null,
        entry_price    numeric     not null,
        as_of          timestamptz not null,
        horizon_days   int         not null,
        why            jsonb       not null default '[]'::jsonb,
        backtest       jsonb,
        outcome_date   date,
        outcome_price  numeric,
        return_pct     numeric,
        correct        boolean,
        resolved_at    timestamptz,
        created_at     timestamptz default now(),
        primary key (run_date, symbol)
      );
    `,
  },
  {
    name: "daily_picks_indexes",
    sql: `
      create index if not exists daily_picks_run_date_idx
        on daily_picks (run_date desc);
      create index if not exists daily_picks_unresolved_idx
        on daily_picks (resolved_at) where resolved_at is null;
    `,
  },
  {
    name: "daily_bars",
    sql: `
      create table if not exists daily_bars (
        date    date    not null,
        symbol  text    not null,
        open    numeric not null,
        high    numeric not null,
        low     numeric not null,
        close   numeric not null,
        volume  bigint  not null default 0,
        primary key (date, symbol)
      );
    `,
  },
  {
    name: "daily_bars_indexes",
    sql: `
      create index if not exists daily_bars_symbol_date_idx
        on daily_bars (symbol, date);
      create index if not exists daily_bars_date_idx
        on daily_bars (date);
    `,
  },
];

/**
 * Guard against a statement that could lose data.
 *
 * This file is applied automatically, so the protection cannot rest on
 * remembering what is in it. Anything that drops, truncates or deletes is
 * refused before it reaches the database — a check that costs nothing and
 * removes the one way an automated migration becomes dangerous.
 */
const DESTRUCTIVE = /\b(drop\s+(table|column|index|schema|database)|truncate|delete\s+from|alter\s+table\s+\w+\s+drop)\b/i;

export function isDestructive(sql: string): boolean {
  return DESTRUCTIVE.test(sql);
}

/** Every migration, checked. Throws rather than applying something destructive. */
export function safeMigrations(): Migration[] {
  for (const m of MIGRATIONS) {
    if (isDestructive(m.sql)) {
      throw new Error(`Migration "${m.name}" contains a destructive statement and will not be applied automatically`);
    }
  }
  return MIGRATIONS;
}
