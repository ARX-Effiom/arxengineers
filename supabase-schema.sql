-- ARX Engineers - Supabase Schema
-- Run this in the Supabase SQL Editor

-- Projects table (core)
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  ref text unique not null,           -- e.g. ARX26007
  client_name text not null,
  address_line1 text,
  address_line2 text,
  town text,
  postcode text,
  care_of text,                        -- C/O name if applicable
  project_type text,                   -- loft, extension, internal_alteration, combined, newbuild
  description text,                    -- short project description
  status text default 'enquiry',       -- enquiry, quoted, instructed, in_progress, complete, on_hold
  fee numeric(10,2),
  deposit_amount numeric(10,2),
  balance_amount numeric(10,2),
  deposit_paid boolean default false,
  balance_paid boolean default false,
  site_visits integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Quotes table
create table if not exists quotes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  ref text,                            -- links to projects.ref
  scope_items jsonb,                   -- array of scope strings
  site_visit_line text,
  fee numeric(10,2),
  assumptions jsonb,                   -- array of assumption strings
  additional_notes jsonb,              -- flags/risks
  issued_at timestamptz,
  expires_at timestamptz,
  docx_filename text,
  created_at timestamptz default now()
);

-- Invoices table
create table if not exists invoices (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  ref text,                            -- e.g. ARX26007
  type text not null,                  -- deposit | balance | variation
  amount numeric(10,2) not null,
  paid boolean default false,
  paid_at timestamptz,
  issued_at timestamptz,
  due_at timestamptz,
  docx_filename text,
  created_at timestamptz default now()
);

-- Activity log (for future use)
create table if not exists activity_log (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  action text,                         -- created, quoted, invoiced, paid, etc.
  detail text,
  created_at timestamptz default now()
);

-- Auto-update updated_at on projects
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

-- Enable Row Level Security (open for now - add auth later)
alter table projects enable row level security;
alter table quotes enable row level security;
alter table invoices enable row level security;
alter table activity_log enable row level security;

-- Policies: allow all for anon (single-user app, no auth needed yet)
create policy "Allow all" on projects for all using (true) with check (true);
create policy "Allow all" on quotes for all using (true) with check (true);
create policy "Allow all" on invoices for all using (true) with check (true);
create policy "Allow all" on activity_log for all using (true) with check (true);
