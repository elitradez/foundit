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
  status text not null default 'pending' check (status in ('pending', 'claimed', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If claims already existed, ensure newer columns exist too.
alter table public.claims add column if not exists student_name text;
alter table public.claims add column if not exists student_email text;
alter table public.claims add column if not exists student_id_number text;
alter table public.claims add column if not exists claim_description text;
alter table public.claims add column if not exists status text not null default 'pending';
alter table public.claims add column if not exists created_at timestamptz not null default now();
alter table public.claims add column if not exists updated_at timestamptz not null default now();
alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims add constraint claims_status_check check (status in ('pending', 'claimed', 'returned'));

create index if not exists claims_item_id_idx on public.claims (item_id);
create index if not exists claims_status_idx on public.claims (status);
create index if not exists claims_created_at_idx on public.claims (created_at desc);

create table if not exists public.claimed_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  item_name text not null,
  photo_path text not null,
  student_name text not null,
  student_id_number text not null,
  student_email text not null,
  date_claimed date not null,
  staff_notes text,
  created_at timestamptz not null default now()
);

create index if not exists claimed_items_claim_id_idx on public.claimed_items (claim_id);
create index if not exists claimed_items_item_id_idx on public.claimed_items (item_id);
create index if not exists claimed_items_date_claimed_idx on public.claimed_items (date_claimed desc);

create table if not exists public.student_info (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  student_name text not null,
  student_email text not null,
  student_id_number text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists student_info_claim_id_idx on public.student_info (claim_id);
create index if not exists student_info_item_id_idx on public.student_info (item_id);
create index if not exists student_info_created_at_idx on public.student_info (created_at desc);

create table if not exists public.surplus_and_salvage (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  item_name text not null,
  photo_path text not null,
  location_found text not null,
  date_found date not null,
  date_logged timestamptz not null,
  date_sent_to_surplus timestamptz not null default now()
);

create index if not exists surplus_and_salvage_item_id_idx on public.surplus_and_salvage (item_id);
create index if not exists surplus_and_salvage_date_sent_idx on public.surplus_and_salvage (date_sent_to_surplus desc);

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
