// js/attendance.js — Clock In / Clock Out logic

import { supabase }                          from './supabase-client.js';
import { todayISO, formatTime, showAlert }   from './utils.js';

// ── Clock In ───────────────────────────────────────────────────
// Creates a new attendance_logs row for today.
// Blocked at DB level if a row already exists for (user_id, date).
export async function clockIn(userId, notes = '') {
  const today    = todayISO();
  const now      = new Date().toISOString();

  // Determine status: late if after 9:15 AM (local time)
  const hours    = new Date().getHours();
  const minutes  = new Date().getMinutes();
  const isLate   = hours > 9 || (hours === 9 && minutes > 15);
  const status   = isLate ? 'late' : 'present';

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert({
      user_id:  userId,
      date:     today,
      clock_in: now,
      status,
      notes
    })
    .select()
    .single();

  if (error) {
    // Unique constraint violation = already clocked in today
    if (error.code === '23505') {
      return { error: 'You have already clocked in today.' };
    }
    return { error: error.message };
  }

  return { data };
}

// ── Clock Out ──────────────────────────────────────────────────
// Finds today's open record and updates it with clock_out time.
export async function clockOut(userId, notes = '') {
  const today   = todayISO();
  const now     = new Date().toISOString();

  // First: find today's record
  const { data: existing, error: fetchError } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (fetchError || !existing) {
    return { error: 'No clock-in found for today. Please clock in first.' };
  }

  if (existing.clock_out) {
    return { error: 'You have already clocked out today.' };
  }

  // Calculate total hours
  const clockInTime  = new Date(existing.clock_in);
  const clockOutTime = new Date(now);
  const totalHours   = Math.round(
    ((clockOutTime - clockInTime) / (1000 * 60 * 60)) * 100
  ) / 100;

  // Recalculate status now that we have total hours
  const status = totalHours < 4 ? 'half_day' : existing.status;

  const { data, error } = await supabase
    .from('attendance_logs')
    .update({
      clock_out:   now,
      total_hours: totalHours,
      status,
      notes:       notes || existing.notes
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

// ── Get Today's Attendance Record ──────────────────────────────
export async function getTodayRecord(userId) {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', todayISO())
    .maybeSingle();   // returns null instead of error if no row found

  if (error) return null;
  return data;
}

// ── Get Attendance History ─────────────────────────────────────
// Returns records for a given user, optionally filtered by month/year.
export async function getAttendanceHistory(userId, { month, year, limit = 30 } = {}) {
  let query = supabase
    .from('attendance_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (month && year) {
    // Filter to a specific month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate   = new Date(year, month, 0).toISOString().split('T')[0]; // last day
    query = query.gte('date', startDate).lte('date', endDate);
  }

  const { data, error } = await query;
  if (error) return [];
  return data;
}

// ── Get Monthly Summary ────────────────────────────────────────
// Calls our PostgreSQL function to get stats for a month.
export async function getMonthlySummary(userId, month, year) {
  const { data, error } = await supabase
    .rpc('get_monthly_summary', {
      p_user_id: userId,
      p_year:    year,
      p_month:   month
    });

  if (error) return null;
  return data?.[0] || null;
}

// ── Render Clock Widget ────────────────────────────────────────
// Updates the clock-in/out UI based on today's record.
export function renderClockWidget(record, { onClockIn, onClockOut }) {
  const statusEl    = document.getElementById('clockStatus');
  const clockInBtn  = document.getElementById('clockInBtn');
  const clockOutBtn = document.getElementById('clockOutBtn');
  const clockInTime = document.getElementById('clockInTime');
  const clockOutTime= document.getElementById('clockOutTime');

  if (!record) {
    // No record yet — show clock-in button
    statusEl.className  = 'clock-status-dot not-started';
    statusEl.textContent= 'Not clocked in';
    clockInBtn.classList.remove('hidden');
    clockOutBtn.classList.add('hidden');
    if (clockInTime)  clockInTime.textContent  = '--:--';
    if (clockOutTime) clockOutTime.textContent = '--:--';

  } else if (record.clock_in && !record.clock_out) {
    // Clocked in but not out yet
    statusEl.className  = 'clock-status-dot clocked-in';
    statusEl.textContent= 'Clocked In ✓';
    clockInBtn.classList.add('hidden');
    clockOutBtn.classList.remove('hidden');
    if (clockInTime)  clockInTime.textContent  = formatTime(record.clock_in);
    if (clockOutTime) clockOutTime.textContent = '--:--';

  } else if (record.clock_out) {
    // Full day done
    statusEl.className  = 'clock-status-dot completed';
    statusEl.textContent= `Day complete — ${record.total_hours}h logged`;
    clockInBtn.classList.add('hidden');
    clockOutBtn.classList.add('hidden');
    if (clockInTime)  clockInTime.textContent  = formatTime(record.clock_in);
    if (clockOutTime) clockOutTime.textContent = formatTime(record.clock_out);
  }
}
