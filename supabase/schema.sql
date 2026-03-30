-- Foundit: run in Supabase SQL editor (or migrate) before using the app.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  location text not null,
  date_found date not null,
  photo_path text not null,
  returned_at timestamptz,
  claim_description text,
  pin_hash text,
  pin_salt text,
  created_at timestamptz not null default now()
);

-- If the table already existed (created earlier), ensure newer columns exist too.
alter table public.items add column if not exists pin_hash text;
alter table public.items add column if not exists pin_salt text;
alter table public.items add column if not exists claim_description text;
alter table public.items add column if not exists returned_at timestamptz;
alter table public.items add column if not exists sent_to_surplus_at timestamptz;
alter table public.items add column if not exists returned_student_name text;
alter table public.items add column if not exists returned_student_id_number text;
alter table public.items add column if not exists status text not null default 'active';
alter table public.items add column if not exists sent_to_surplus_at timestamptz;
alter table public.items add column if not exists created_at timestamptz not null default now();
alter table public.items add column if not exists value_tier text not null default 'low_value';

-- Keep status values constrained and safe for existing rows.
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check check (status in ('active', 'returned', 'surplus'));

-- Remove legacy email column (if it exists from older schema versions).
alter table public.items drop column if exists claim_email;

-- Claims: used for multiple claim submissions per item.
-- Add phone number support for non-students.
alter table public.claims add column if not exists phone_number text;

create index if not exists items_returned_at_idx on public.items (returned_at);
create index if not exists items_created_at_idx on public.items (created_at desc);
create index if not exists items_returned_surplus_idx on public.items (returned_at, sent_to_surplus_at);
create index if not exists claims_status_created_at_idx on public.claims (status, created_at desc);
create index if not exists claims_status_updated_at_idx on public.claims (status, updated_at desc);
create index if not exists claims_item_id_idx on public.claims (item_id);

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

-- SMS alerts: students text the Twilio number; staff logging new items can trigger match notifications.
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  description text not null,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists alerts_notified_created_idx on public.alerts (notified, created_at desc);

alter table public.alerts enable row level security;
