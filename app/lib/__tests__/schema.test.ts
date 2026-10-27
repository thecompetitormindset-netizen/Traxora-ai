import { describe, expect, it } from "vitest";
import { MIGRATIONS, isDestructive, safeMigrations } from "../schema";

// These statements are applied automatically on a schedule, so the protection
// cannot rest on anyone remembering what is in the file.

describe("isDestructive", () => {
  it("catches the statements that can lose data", () => {
    expect(isDestructive("drop table daily_picks;")).toBe(true);
    expect(isDestructive("DROP INDEX daily_picks_run_date_idx;")).toBe(true);
    expect(isDestructive("truncate daily_bars;")).toBe(true);
    expect(isDestructive("delete from daily_picks where 1=1;")).toBe(true);
    expect(isDestructive("alter table daily_picks drop column why;")).toBe(true);
  });

  it("allows additive statements", () => {
    expect(isDestructive("create table if not exists x (a int);")).toBe(false);
    expect(isDestructive("create index if not exists i on x (a);")).toBe(false);
    expect(isDestructive("alter table x add column if not exists b int;")).toBe(false);
  });

  it("is not fooled by the word appearing in an identifier", () => {
    // "dropped_at" is a column name, not a drop.
    expect(isDestructive("create table if not exists x (dropped_at timestamptz);")).toBe(false);
  });
});

describe("the shipped migrations", () => {
  it("contains nothing destructive", () => {
    expect(() => safeMigrations()).not.toThrow();
  });

  it("is idempotent by construction", () => {
    // Every create must be guarded, or a second run errors and the schedule
    // turns into a daily failure.
    for (const m of MIGRATIONS) {
      const creates = m.sql.match(/create\s+(table|index)/gi) ?? [];
      const guarded = m.sql.match(/create\s+(table|index)\s+if\s+not\s+exists/gi) ?? [];
      expect(guarded.length).toBe(creates.length);
    }
  });

  it("creates the tables the app reads", () => {
    const all = MIGRATIONS.map(m => m.sql).join(" ");
    expect(all).toMatch(/create table if not exists daily_picks/);
    expect(all).toMatch(/create table if not exists daily_bars/);
  });
});
