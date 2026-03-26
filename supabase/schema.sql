-- Foundit: run in Supabase SQL editor (or migrate) before using the app.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  location text not null,
  date_found date not null,
  photo_path text not null,
  status text not null default 'active' check (status in ('active', 'returned', 'surplus')),
  returned_at timestamptz,
  surplus_sent_at timestamptz,
  claim_description text,
  pin_hash text,
  pin_salt text,
  created_at timestamptz not null default now()
);

create extension if not exists pg_trgm;

-- If the table already existed (created earlier), ensure newer columns exist too.
alter table public.items add column if not exists pin_hash text;
alter table public.items add column if not exists pin_salt text;
alter table public.items add column if not exists claim_description text;
alter table public.items add column if not exists returned_at timestamptz;
alter table public.items add column if not exists status text not null default 'active';
alter table public.items add column if not exists surplus_sent_at timestamptz;
alter table public.items add column if not exists created_at timestamptz not null default now();
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check check (status in ('active', 'returned', 'surplus'));

-- Remove legacy email column (if it exists from older schema versions).
alter table public.items drop column if exists claim_email;

create index if not exists items_returned_at_idx on public.items (returned_at);
create index if not exists items_created_at_idx on public.items (created_at desc);
create index if not exists items_status_idx on public.items (status);
create index if not exists items_surplus_sent_at_idx on public.items (surplus_sent_at);
create index if not exists items_name_trgm_idx on public.items using gin (name gin_trgm_ops);
create index if not exists items_location_trgm_idx on public.items using gin (location gin_trgm_ops);
create index if not exists items_description_trgm_idx on public.items using gin (description gin_trgm_ops);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  student_name text not null,
  student_email text not null,
  student_id_number text not null,
  claim_description text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists claims_item_id_idx on public.claims (item_id);
create index if not exists claims_status_idx on public.claims (status);
create index if not exists claims_created_at_idx on public.claims (created_at desc);

alter table public.items enable row level security;

-- No anon SELECT on items (avoids exposing pin_hash). Public catalog is loaded in Next.js via the service role.

-- Mutations go through the Next.js API using the service role key (bypasses RLS).

insert into storage.buckets (id, name, public)
values ('items', 'items', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read item photos" on storage.objects;
-- No public read policy for originals. Images are served via Next.js APIs:
-- - public: blurred proxy
-- - staff: authenticated proxy
