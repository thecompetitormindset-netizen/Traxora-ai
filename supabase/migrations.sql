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

-- ── Row-level security (optional but recommended) ─────────────────────────────
-- These tables are accessed exclusively via supabaseAdmin (service-role key),
-- so RLS isn't strictly required. Enable it if you want belt-and-suspenders.
--
-- alter table watchlists     enable row level security;
-- alter table paper_trades   enable row level security;
-- alter table journal_entries enable row level security;
-- alter table real_positions  enable row level security;
