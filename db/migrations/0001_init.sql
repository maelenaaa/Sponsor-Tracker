-- Sponsor Management and Publishing Tracker: initial schema.
-- Safe to run more than once (every statement is idempotent).
-- Works on any PostgreSQL 13+ (Supabase, Neon, Vercel Postgres, local).

------------------------------------------------------------------------------
-- Package templates: what each sponsorship package promises.
------------------------------------------------------------------------------
create table if not exists packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  is_active   boolean not null default true,
  -- Bumped every time the package's items change. Sponsors remember the
  -- version they were last synced to, so the app can tell when a review is due.
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists packages_name_unique on packages (lower(trim(name)));

create table if not exists package_items (
  id                uuid primary key default gen_random_uuid(),
  package_id        uuid not null references packages(id) on delete cascade,
  label             text not null check (length(trim(label)) > 0),
  platform          text not null check (platform in ('website', 'linkedin', 'other')),
  recurrence        text not null check (recurrence in ('one_time', 'recurring')),
  -- one_time: how many deliverables to create (all at once).
  quantity          integer not null default 1 check (quantity between 1 and 100),
  -- recurring: repeat every N months. one_time with quantity > 1: spacing between them.
  interval_months   integer check (interval_months is null or interval_months between 1 and 24),
  -- First one is due this many days after the sponsor's start date.
  start_offset_days integer not null default 0 check (start_offset_days between 0 and 3650),
  -- recurring only: stop after this many. Null = until the sponsorship ends.
  max_occurrences   integer check (max_occurrences is null or max_occurrences between 1 and 200),
  notes             text,
  sort_order        integer not null default 0,
  -- Items are archived, never deleted, so history keeps pointing at them.
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint recurring_needs_interval check (recurrence <> 'recurring' or interval_months is not null)
);
create index if not exists package_items_package_idx on package_items (package_id);

------------------------------------------------------------------------------
-- Sponsors
------------------------------------------------------------------------------
create table if not exists sponsors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  contact_name   text,
  email          text,
  website_url    text,
  linkedin_url   text,
  package_id     uuid references packages(id) on delete restrict,
  status         text not null default 'active' check (status in ('active', 'completed', 'paused', 'inactive')),
  start_date     date,
  end_date       date,
  date_added     date not null default current_date,
  notes          text,
  -- "Skip for now" in the planner hides the sponsor from recommendations until this date.
  snoozed_until  date,
  -- Fingerprint of (package, package version, start, end) the last time deliverables
  -- were generated or reviewed. A mismatch means "review package changes".
  sync_signature text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sponsor_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index if not exists sponsors_name_unique on sponsors (lower(trim(name)));
create index if not exists sponsors_status_idx on sponsors (status);
create index if not exists sponsors_package_idx on sponsors (package_id);

------------------------------------------------------------------------------
-- Deliverables: one row per thing a sponsor is owed.
------------------------------------------------------------------------------
create table if not exists deliverables (
  id              uuid primary key default gen_random_uuid(),
  sponsor_id      uuid not null references sponsors(id) on delete cascade,
  package_item_id uuid references package_items(id) on delete set null,
  -- 1, 2, 3... within a package item. Together with sponsor + item it is the
  -- natural key that stops duplicates.
  sequence_no     integer not null default 1 check (sequence_no >= 1),
  source          text not null default 'generated' check (source in ('generated', 'manual')),
  package_version integer,
  label           text not null check (length(trim(label)) > 0),
  platform        text not null check (platform in ('website', 'linkedin', 'other')),
  status          text not null default 'not_scheduled'
                    check (status in ('not_scheduled', 'scheduled', 'in_progress', 'published', 'not_required')),
  due_date        date,   -- when the package says it is owed
  planned_date    date,   -- when you plan to publish it (you can change this freely)
  actual_date     date,   -- when it really went out (only set when published)
  published_url   text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint published_has_actual_date check ((status = 'published') = (actual_date is not null)),
  constraint scheduled_has_planned_date check (status <> 'scheduled' or planned_date is not null)
);
-- The duplicate guard: one generated deliverable per sponsor + package item + sequence.
create unique index if not exists deliverables_generated_unique
  on deliverables (sponsor_id, package_item_id, sequence_no)
  where package_item_id is not null;
create index if not exists deliverables_sponsor_idx on deliverables (sponsor_id);
create index if not exists deliverables_status_planned_idx on deliverables (status, planned_date);
create index if not exists deliverables_platform_idx on deliverables (platform, status);

------------------------------------------------------------------------------
-- Append-only history. Rows are only ever inserted.
------------------------------------------------------------------------------
create table if not exists deliverable_events (
  id             bigint generated always as identity primary key,
  deliverable_id uuid,
  sponsor_id     uuid not null references sponsors(id) on delete cascade,
  event_type     text not null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists deliverable_events_deliverable_idx on deliverable_events (deliverable_id, created_at);
create index if not exists deliverable_events_sponsor_idx on deliverable_events (sponsor_id, created_at);

------------------------------------------------------------------------------
-- Security: the app connects with a server-side connection string. Turning on
-- row level security (with no policies) blocks the public Supabase REST API
-- (anon key) from reading or writing any of these tables.
------------------------------------------------------------------------------
alter table packages            enable row level security;
alter table package_items       enable row level security;
alter table sponsors            enable row level security;
alter table deliverables        enable row level security;
alter table deliverable_events  enable row level security;
