-- Run this in your Supabase SQL Editor to create the cloud-sync tables.
-- These enable watchlist, paper trades, and journal entries to persist
-- across devices for each user.

-- ── User watchlist ────────────────────────────────────────────────────────────
-- Stores each user's custom watchlist as a JSONB array of { symbol, name }.
-- Upserted on change; morning email reads all rows to personalise briefings.

create table if not exists watchlists (
  user_email  text        primary key,
  items       jsonb,
  updated_at  timestamptz default now()
);

-- ── Paper trades ──────────────────────────────────────────────────────────────
-- Stores each user's paper trading history as a JSONB array of PaperTrade objects.
-- Synced from the browser on every trade add/close/remove.

create table if not exists paper_trades (
  user_email  text        primary key,
  trades      jsonb,
  updated_at  timestamptz default now()
);

-- ── Journal entries ───────────────────────────────────────────────────────────
-- Stores each user's AI-written trade journal as a JSONB array of JournalEntry objects.
-- Synced from the browser whenever entries are written.

create table if not exists journal_entries (
  user_email  text        primary key,
  entries     jsonb,
  updated_at  timestamptz default now()
);

-- ── Real positions ────────────────────────────────────────────────────────────
-- Stores each user's real brokerage positions as a JSONB array of Position objects.
-- Synced from the browser whenever positions are added or removed.

create table if not exists real_positions (
  user_email  text        primary key,
  positions   jsonb,
  updated_at  timestamptz default now()
);

-- ── Sports watchlist ──────────────────────────────────────────────────────────
-- Stores each user's favorited teams as a JSONB array of { league, team }.
-- Same shape/pattern as `watchlists` above, separate table since the item
-- shape differs (team+league, not symbol+name).

create table if not exists sports_watchlist (
  user_email  text        primary key,
  items       jsonb,
  updated_at  timestamptz default now()
);

-- ── Sports predictions log ───────────────────────────────────────────────────
-- A shared (not per-user) log of every prediction made, snapshotted by the
-- sports-track-record cron BEFORE each game starts, then backfilled with the
-- actual result once the game finishes. Powers the /sports/track-record page
-- — this is what lets us honestly show "how often has this actually been
-- right," rather than just asserting confidence numbers with no accountability.

create table if not exists sports_predictions_log (
  id                text        primary key,   -- ESPN event id
  league            text        not null,
  league_group      text        not null,
  home_team         text        not null,
  away_team         text        not null,
  predicted_winner  text,
  confidence        numeric,
  commence_time     timestamptz not null,
  logged_at         timestamptz default now(),
  actual_winner     text,
  resolved_at       timestamptz
);

create index if not exists sports_predictions_log_unresolved
  on sports_predictions_log (commence_time)
  where resolved_at is null;

-- ── Row-level security (optional but recommended) ─────────────────────────────
-- These tables are accessed exclusively via supabaseAdmin (service-role key),
-- so RLS isn't strictly required. Enable it if you want belt-and-suspenders.
--
-- alter table watchlists              enable row level security;
-- alter table paper_trades            enable row level security;
-- alter table journal_entries         enable row level security;
-- alter table real_positions          enable row level security;
-- alter table sports_watchlist        enable row level security;
-- alter table sports_predictions_log  enable row level security;
