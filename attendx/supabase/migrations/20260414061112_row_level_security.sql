-- ============================================================
-- AttendX — Row Level Security Policies
-- Phase 4: RLS Migration
-- ============================================================


-- ============================================================
-- SECTION 1: ENABLE RLS ON ALL TABLES
-- ============================================================
-- By default RLS is OFF. Turning it on means NO ONE can access
-- the table until we explicitly create policies that allow it.

alter table public.profiles        enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.leave_requests  enable row level security;

-- Also enable on the tables that back our views
-- (views inherit the RLS of their underlying tables)


-- ============================================================
-- SECTION 2: HELPER FUNCTION — IS CURRENT USER AN ADMIN?
-- ============================================================
-- We use this function inside our policies to check role.
-- Using a function is better than an inline subquery because:
--   1. It is cached per transaction (faster)
--   2. It is defined once and reused across all policies
--   3. It is easier to read and maintain

create or replace function public.is_admin()
returns boolean
language sql
stable                    -- result does not change within one transaction
security definer          -- runs as the function owner, not the caller
set search_path = public  -- security best practice
as $$
  select exists (
    select 1
    from public.profiles
    where id   = auth.uid()   -- auth.uid() = the currently logged-in user's UUID
      and role = 'admin'
      and is_active = true
  );
$$;

-- ============================================================
-- SECTION 3: PROFILES TABLE POLICIES
-- ============================================================

-- ── Policy 1: Users can read their own profile ─────────────
create policy "profiles: user can read own"
  on public.profiles
  for select
  to authenticated                    -- only logged-in users
  using ( id = auth.uid() );          -- only their own row

-- ── Policy 2: Admins can read ALL profiles ─────────────────
create policy "profiles: admin can read all"
  on public.profiles
  for select
  to authenticated
  using ( public.is_admin() );        -- only if they are an admin

-- ── Policy 3: Users can update their own profile ───────────
-- (name, phone, department — not role, not is_active)
create policy "profiles: user can update own"
  on public.profiles
  for update
  to authenticated
  using  ( id = auth.uid() )          -- can only target their own row
  with check (
    id = auth.uid()                   -- the row after update must still be theirs
    and role = (                      -- they cannot change their own role
      select role from public.profiles where id = auth.uid()
    )
    and is_active = true              -- they cannot deactivate themselves
  );

-- ── Policy 4: Admins can update ANY profile ────────────────
-- (including changing role and is_active status)
create policy "profiles: admin can update all"
  on public.profiles
  for update
  to authenticated
  using  ( public.is_admin() )
  with check ( public.is_admin() );

-- ── Policy 5: The trigger inserts the profile on signup ────
-- The handle_new_user trigger runs as SECURITY DEFINER so it
-- bypasses RLS. But we also add an insert policy in case
-- we ever insert manually.
create policy "profiles: allow insert for new users"
  on public.profiles
  for insert
  to authenticated
  with check ( id = auth.uid() );

-- ── Policy 6: Only admins can delete profiles ──────────────
create policy "profiles: admin can delete"
  on public.profiles
  for delete
  to authenticated
  using ( public.is_admin() );


-- ============================================================
-- SECTION 4: ATTENDANCE LOGS TABLE POLICIES
-- ============================================================

-- ── Policy 1: Employees can read their own attendance ──────
create policy "attendance: user can read own"
  on public.attendance_logs
  for select
  to authenticated
  using ( user_id = auth.uid() );

-- ── Policy 2: Admins can read ALL attendance records ───────
create policy "attendance: admin can read all"
  on public.attendance_logs
  for select
  to authenticated
  using ( public.is_admin() );

-- ── Policy 3: Employees can insert their own clock-in ──────
-- user_id must equal their own auth.uid() — they cannot
-- clock in on behalf of someone else
create policy "attendance: user can insert own"
  on public.attendance_logs
  for insert
  to authenticated
  with check ( user_id = auth.uid() );

-- ── Policy 4: Employees can update their own record ────────
-- This allows clock-out (updating clock_out, total_hours, status)
-- They can only update rows that belong to them
create policy "attendance: user can update own"
  on public.attendance_logs
  for update
  to authenticated
  using  ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- ── Policy 5: Admins can update any attendance record ──────
-- Needed for corrections (e.g., fixing a wrong clock-out time)
create policy "attendance: admin can update all"
  on public.attendance_logs
  for update
  to authenticated
  using  ( public.is_admin() )
  with check ( public.is_admin() );

-- ── Policy 6: Admins can delete attendance records ─────────
create policy "attendance: admin can delete"
  on public.attendance_logs
  for delete
  to authenticated
  using ( public.is_admin() );


-- ============================================================
-- SECTION 5: LEAVE REQUESTS TABLE POLICIES
-- ============================================================

-- ── Policy 1: Employees can read their own leave requests ──
create policy "leave: user can read own"
  on public.leave_requests
  for select
  to authenticated
  using ( user_id = auth.uid() );

-- ── Policy 2: Admins can read ALL leave requests ───────────
create policy "leave: admin can read all"
  on public.leave_requests
  for select
  to authenticated
  using ( public.is_admin() );

-- ── Policy 3: Employees can submit leave requests ──────────
-- user_id must be their own — cannot submit on behalf of others
-- status must be 'pending' — they cannot pre-approve themselves
create policy "leave: user can insert own"
  on public.leave_requests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ── Policy 4: Employees can cancel their OWN pending requests
-- They can only set status to 'cancelled', cannot approve/reject
create policy "leave: user can cancel own pending"
  on public.leave_requests
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and status = 'pending'            -- can only update if currently pending
  )
  with check (
    user_id = auth.uid()
    and status = 'cancelled'          -- can only change TO cancelled
  );

-- ── Policy 5: Admins can update ANY leave request ──────────
-- This is how admins approve or reject requests
-- They set status = 'approved'/'rejected' and add admin_comment
create policy "leave: admin can update all"
  on public.leave_requests
  for update
  to authenticated
  using  ( public.is_admin() )
  with check ( public.is_admin() );

-- ── Policy 6: Admins can delete leave requests ─────────────
create policy "leave: admin can delete"
  on public.leave_requests
  for delete
  to authenticated
  using ( public.is_admin() );


-- ============================================================
-- SECTION 6: SECURE THE VIEWS
-- ============================================================
-- Views in PostgreSQL run with the privileges of the view owner.
-- We need to add security_invoker so they respect the caller's RLS.
-- Since our views JOIN profiles + attendance/leave, and both tables
-- have RLS, the view will only show rows the caller can access.

alter view public.attendance_with_profiles
  set (security_invoker = true);

alter view public.leave_requests_with_profiles
  set (security_invoker = true);


-- ============================================================
-- SECTION 7: GRANT PERMISSIONS TO ROLES
-- ============================================================
-- 'authenticated' = logged-in Supabase users (have a valid JWT)
-- 'anon'          = not logged in (should see nothing)

-- Profiles: authenticated users can interact, anon cannot
grant select, insert, update, delete
  on public.profiles to authenticated;

grant select
  on public.profiles to anon;        -- anon gets nothing useful (RLS blocks it)

-- Attendance logs
grant select, insert, update, delete
  on public.attendance_logs to authenticated;

-- Leave requests
grant select, insert, update, delete
  on public.leave_requests to authenticated;

-- Views (read-only — no insert/update through views)
grant select on public.attendance_with_profiles       to authenticated;
grant select on public.leave_requests_with_profiles   to authenticated;

-- Functions (allow authenticated users to call them)
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.calc_hours                to authenticated;
grant execute on function public.calc_attendance_status    to authenticated;
grant execute on function public.get_monthly_summary       to authenticated;


-- ============================================================
-- SECTION 8: LOCK DOWN auth.users ACCESS
-- ============================================================
-- By default, Supabase exposes auth.users via the API.
-- We revoke direct access — all user data goes through profiles.

revoke all on auth.users from anon, authenticated;
