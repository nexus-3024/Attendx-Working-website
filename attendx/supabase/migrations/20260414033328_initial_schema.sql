-- ============================================================
-- AttendX — Complete Database Schema
-- Phase 3: Initial Schema Migration
-- ============================================================


-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================

-- Enable UUID generation (used for all primary keys)
create extension if not exists "pgcrypto";


-- ============================================================
-- SECTION 2: PROFILES TABLE
-- ============================================================
-- One row per user. Created automatically when someone signs up.
-- Links to Supabase's internal auth.users table via the id column.

create table public.profiles (
  -- Primary key matches auth.users.id exactly (uuid, not auto-increment)
  id            uuid        primary key references auth.users(id) on delete cascade,

  -- Basic info
  full_name     text        not null default '',
  email         text        not null default '',
  phone         text        not null default '',
  department    text        not null default 'General',

  -- Role: every user is either 'employee' or 'admin'
  -- Default is 'employee' — you manually promote to 'admin'
  role          text        not null default 'employee'
                            check (role in ('employee', 'admin')),

  -- Soft delete: deactivated users cannot log in (enforced by RLS)
  is_active     boolean     not null default true,

  -- Timestamps
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index: we frequently look up profiles by email
create index idx_profiles_email on public.profiles(email);

-- Index: we frequently filter by role (admin vs employee)
create index idx_profiles_role on public.profiles(role);

-- Index: filter active users
create index idx_profiles_is_active on public.profiles(is_active);

-- Comment describing the table
comment on table public.profiles is
  'Extended user profile data. One row per auth.users entry.';


-- ============================================================
-- SECTION 3: ATTENDANCE LOGS TABLE
-- ============================================================
-- One row = one work day for one employee.
-- Clock-in creates the row. Clock-out updates it.

create table public.attendance_logs (
  id            uuid        primary key default gen_random_uuid(),

  -- Which employee this record belongs to
  user_id       uuid        not null references public.profiles(id) on delete cascade,

  -- The calendar date of attendance (YYYY-MM-DD)
  -- Stored separately from clock_in for easy daily queries
  date          date        not null default current_date,

  -- Timestamps for clock in and clock out
  clock_in      timestamptz not null default now(),
  clock_out     timestamptz null,           -- null until employee clocks out

  -- Calculated automatically when clock_out is recorded (in hours, 2 decimal places)
  total_hours   numeric(5,2) null,

  -- Attendance status
  -- 'present'  = clocked in on time (before 9:15 AM)
  -- 'late'     = clocked in after 9:15 AM
  -- 'half_day' = total_hours < 4
  -- 'absent'   = no record for the day (computed, not stored)
  status        text        not null default 'present'
                            check (status in ('present', 'late', 'half_day')),

  -- Optional note from the employee (e.g. "Working from home")
  notes         text        not null default '',

  -- IP address for audit trail (optional, captured on clock-in)
  ip_address    text        null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Critical constraint: only ONE attendance record per user per day
-- This prevents double clock-ins
create unique index idx_attendance_user_date
  on public.attendance_logs(user_id, date);

-- Index: look up all records for a user (attendance history)
create index idx_attendance_user_id
  on public.attendance_logs(user_id);

-- Index: look up records by date (admin daily view)
create index idx_attendance_date
  on public.attendance_logs(date);

-- Index: filter by status
create index idx_attendance_status
  on public.attendance_logs(status);

comment on table public.attendance_logs is
  'Daily attendance records. One row per user per day. Clock-out updates the row.';


-- ============================================================
-- SECTION 4: LEAVE REQUESTS TABLE
-- ============================================================
-- Employees submit leave requests. Admins approve or reject them.

create table public.leave_requests (
  id            uuid        primary key default gen_random_uuid(),

  -- Which employee made the request
  user_id       uuid        not null references public.profiles(id) on delete cascade,

  -- Leave type
  leave_type    text        not null
                            check (leave_type in (
                              'sick',
                              'casual',
                              'annual',
                              'emergency',
                              'unpaid',
                              'other'
                            )),

  -- Date range of the leave
  start_date    date        not null,
  end_date      date        not null,

  -- Calculated number of calendar days
  total_days    integer     not null default 1,

  -- Employee's explanation
  reason        text        not null default '',

  -- Workflow status
  -- 'pending'  = just submitted, waiting for admin
  -- 'approved' = admin approved
  -- 'rejected' = admin rejected
  -- 'cancelled'= employee cancelled before decision
  status        text        not null default 'pending'
                            check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- Admin review fields (null until reviewed)
  admin_comment text        null,
  reviewed_by   uuid        null references public.profiles(id) on delete set null,
  reviewed_at   timestamptz null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Constraint: end date must be on or after start date
  constraint leave_dates_valid check (end_date >= start_date)
);

-- Index: get all leave requests for a specific employee
create index idx_leave_user_id
  on public.leave_requests(user_id);

-- Index: filter by status (admin sees all 'pending' requests)
create index idx_leave_status
  on public.leave_requests(status);

-- Index: filter by date range
create index idx_leave_start_date
  on public.leave_requests(start_date);

-- Index: who reviewed it
create index idx_leave_reviewed_by
  on public.leave_requests(reviewed_by);

comment on table public.leave_requests is
  'Employee leave applications. Reviewed and actioned by admins.';


-- ============================================================
-- SECTION 5: UPDATED_AT TRIGGER
-- ============================================================
-- Automatically updates the updated_at column whenever a row changes.
-- We reuse this trigger function on all 3 tables.

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach the trigger to profiles
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Attach the trigger to attendance_logs
create trigger trg_attendance_updated_at
  before update on public.attendance_logs
  for each row execute function public.handle_updated_at();

-- Attach the trigger to leave_requests
create trigger trg_leave_updated_at
  before update on public.leave_requests
  for each row execute function public.handle_updated_at();


-- ============================================================
-- SECTION 6: AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- ============================================================
-- When a new user signs up via Supabase Auth, this trigger
-- automatically inserts a row into public.profiles.
-- This means we never have to manually create the profile row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs with elevated privileges to write to profiles
set search_path = public  -- prevents search path injection attacks
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    -- Try to grab full_name from metadata if provided at signup
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

-- Fire this trigger AFTER a new row is inserted into auth.users
create trigger trg_on_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- SECTION 7: HELPER VIEWS
-- ============================================================
-- Views make it easier to query joined data without writing
-- complex JOINs every time in JavaScript.

-- View: attendance with employee name and email joined in
create or replace view public.attendance_with_profiles as
select
  al.id,
  al.user_id,
  al.date,
  al.clock_in,
  al.clock_out,
  al.total_hours,
  al.status,
  al.notes,
  al.created_at,
  p.full_name,
  p.email,
  p.department,
  p.role
from public.attendance_logs al
join public.profiles p on p.id = al.user_id;

comment on view public.attendance_with_profiles is
  'Convenience view: attendance records with employee name, email, department joined.';


-- View: leave requests with employee name joined in
create or replace view public.leave_requests_with_profiles as
select
  lr.id,
  lr.user_id,
  lr.leave_type,
  lr.start_date,
  lr.end_date,
  lr.total_days,
  lr.reason,
  lr.status,
  lr.admin_comment,
  lr.reviewed_by,
  lr.reviewed_at,
  lr.created_at,
  p.full_name,
  p.email,
  p.department,
  -- Admin who reviewed it (may be null)
  reviewer.full_name as reviewed_by_name
from public.leave_requests lr
join public.profiles p on p.id = lr.user_id
left join public.profiles reviewer on reviewer.id = lr.reviewed_by;

comment on view public.leave_requests_with_profiles is
  'Convenience view: leave requests with employee and reviewer names joined.';


-- ============================================================
-- SECTION 8: USEFUL DATABASE FUNCTIONS
-- ============================================================

-- Function: calculate total hours between two timestamps
-- Returns a numeric value rounded to 2 decimal places
create or replace function public.calc_hours(
  p_clock_in  timestamptz,
  p_clock_out timestamptz
)
returns numeric
language sql
immutable
as $$
  select round(
    extract(epoch from (p_clock_out - p_clock_in)) / 3600.0,
    2
  );
$$;

-- Function: determine attendance status based on clock-in time
-- 'present' if before 9:15 AM, 'late' if after
create or replace function public.calc_attendance_status(
  p_clock_in timestamptz,
  p_total_hours numeric default null
)
returns text
language plpgsql
immutable
as $$
declare
  v_hour   integer := extract(hour from p_clock_in at time zone 'UTC');
  v_minute integer := extract(minute from p_clock_in at time zone 'UTC');
begin
  -- Half day takes priority if hours are provided
  if p_total_hours is not null and p_total_hours < 4 then
    return 'half_day';
  end if;

  -- Late if after 9:15 AM
  if v_hour > 9 or (v_hour = 9 and v_minute > 15) then
    return 'late';
  end if;

  return 'present';
end;
$$;

-- Function: get monthly attendance summary for a user
-- Returns one row with counts of present, late, half_day days
create or replace function public.get_monthly_summary(
  p_user_id uuid,
  p_year    integer,
  p_month   integer
)
returns table (
  present_days  bigint,
  late_days     bigint,
  half_days     bigint,
  total_hours   numeric,
  total_days    bigint
)
language sql
stable
as $$
  select
    count(*) filter (where status = 'present')  as present_days,
    count(*) filter (where status = 'late')     as late_days,
    count(*) filter (where status = 'half_day') as half_days,
    coalesce(sum(al.total_hours), 0)            as total_hours,
    count(*)                                    as total_days
  from public.attendance_logs al
  where
    al.user_id = p_user_id
    and extract(year  from al.date) = p_year
    and extract(month from al.date) = p_month;
$$;
