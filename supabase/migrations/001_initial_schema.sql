-- DocProtect Supabase schema
-- Stores encrypted bundle metadata and basic audit trail.

create extension if not exists "pgcrypto";

create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  owner_identity text not null,
  file_name text not null,
  mime_type text not null,
  encrypted_size bigint not null,
  manifest jsonb not null,
  storage_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  downloads integer not null default 0
);

create index if not exists bundles_owner_idx on bundles(owner_identity);
create index if not exists bundles_created_idx on bundles(created_at);

create table if not exists bundle_access_logs (
  id bigserial primary key,
  bundle_id uuid not null references bundles(id) on delete cascade,
  event text not null,
  ip_address text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists bundle_access_logs_bundle_idx on bundle_access_logs(bundle_id);

