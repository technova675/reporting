-- The console's whole store as one JSON document (see lib/db.ts).
-- `version` is bumped on every write and used as an optimistic lock.
create table if not exists public.adbibe_store (
  id         text primary key,
  data       jsonb not null,
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Server-side only. With RLS on and no policies, the anon/publishable key can
-- neither read nor write this table; the service-role key bypasses RLS.
alter table public.adbibe_store enable row level security;
revoke all on public.adbibe_store from anon, authenticated;
