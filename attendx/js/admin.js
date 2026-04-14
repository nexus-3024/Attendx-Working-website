// js/admin.js — Admin-specific data operations

import { supabase } from './supabase-client.js';

// ── Get all employee profiles ───────────────────────────────────
export async function getAllProfiles({ includeAdmins = true } = {}) {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });

  if (!includeAdmins) query = query.eq('role', 'employee');

  const { data, error } = await query;
  if (error) { console.error('getAllProfiles:', error); return []; }
  return data;
}

// ── Get a single profile by ID ──────────────────────────────────
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

// ── Activate or deactivate a user ──────────────────────────────
export async function setUserActive(userId, isActive) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);

  if (error) return { error: error.message };
  return { success: true };
}

// ── Promote or demote a user role ──────────────────────────────
export async function setUserRole(userId, role) {
  if (!['employee', 'admin'].includes(role)) {
    return { error: 'Invalid role.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) return { error: error.message };
  return { success: true };
}

// ── Get ALL attendance records (admin view, with profiles) ──────
export async function getAllAttendance({
  month, year, userId, status, limit = 100
} = {}) {
  let query = supabase
    .from('attendance_with_profiles')
    .select('*')
    .order('date', { ascending: false })
    .order('clock_in', { ascending: false })
    .limit(limit);

  if (userId) query = query.eq('user_id', userId);
  if (status) query = query.eq('status', status);

  if (month && year) {
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;
    query = query.gte('date', startDate).lte('date', endDate);
  }

  const { data, error } = await query;
  if (error) { console.error('getAllAttendance:', error); return []; }
  return data;
}

// ── Get overview stats for the admin dashboard ──────────────────
export async function getAdminOverview() {
  const today     = new Date().toISOString().split('T')[0];
  const now       = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear  = now.getFullYear();

  // Run all queries in parallel for speed
  const [
    profilesRes,
    todayRes,
    monthRes,
    leaveRes
  ] = await Promise.all([
    // Total active employees
    supabase
      .from('profiles')
      .select('id, is_active', { count: 'exact' })
      .eq('role', 'employee'),

    // Who clocked in today
    supabase
      .from('attendance_logs')
      .select('user_id', { count: 'exact' })
      .eq('date', today),

    // This month's attendance records
    supabase
      .from('attendance_logs')
      .select('status, total_hours')
      .gte('date', `${thisYear}-${String(thisMonth).padStart(2,'0')}-01`)
      .lte('date', `${thisYear}-${String(thisMonth).padStart(2,'0')}-31`),

    // Pending leave requests
    supabase
      .from('leave_requests')
      .select('id', { count: 'exact' })
      .eq('status', 'pending')
  ]);

  const employees    = profilesRes.data   || [];
  const todayLogs    = todayRes.data      || [];
  const monthLogs    = monthRes.data      || [];
  const pendingLeaves = leaveRes.count    ?? 0;

  const totalEmployees  = employees.filter(e => e.is_active).length;
  const presentToday    = todayLogs.length;
  const absentToday     = Math.max(0, totalEmployees - presentToday);
  const totalHoursMonth = monthLogs.reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0);
  const lateCount       = monthLogs.filter(r => r.status === 'late').length;

  return {
    totalEmployees,
    presentToday,
    absentToday,
    pendingLeaves,
    totalHoursMonth: Math.round(totalHoursMonth * 10) / 10,
    lateCount
  };
}

// ── Get per-employee monthly summary (for admin report table) ───
export async function getEmployeeMonthlySummaries(month, year) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

  const { data, error } = await supabase
    .from('attendance_with_profiles')
    .select('user_id, full_name, department, email, status, total_hours, date')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('full_name');

  if (error) { console.error(error); return []; }

  // Group by user
  const byUser = {};
  for (const row of data) {
    if (!byUser[row.user_id]) {
      byUser[row.user_id] = {
        user_id:     row.user_id,
        full_name:   row.full_name,
        department:  row.department,
        email:       row.email,
        present:     0,
        late:        0,
        half_day:    0,
        total_hours: 0,
        days:        0
      };
    }
    const u = byUser[row.user_id];
    u.days++;
    u.total_hours += Number(row.total_hours) || 0;
    if (row.status === 'present')  u.present++;
    if (row.status === 'late')     u.late++;
    if (row.status === 'half_day') u.half_day++;
  }

  return Object.values(byUser).map(u => ({
    ...u,
    total_hours: Math.round(u.total_hours * 10) / 10
  }));
}
