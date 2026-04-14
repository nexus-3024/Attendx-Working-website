// js/leave.js — Leave request logic (employee + admin)

import { supabase } from './supabase-client.js';

// ── Employee: get own leave requests ───────────────────────────
export async function getMyLeaves({ status } = {}) {
  let query = supabase
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data;
}

// ── Employee: submit a leave request ───────────────────────────
export async function submitLeave({
  userId, leaveType, startDate, endDate, totalDays, reason
}) {
  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      user_id:    userId,
      leave_type: leaveType,
      start_date: startDate,
      end_date:   endDate,
      total_days: totalDays,
      reason,
      status:     'pending'
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

// ── Employee: cancel a pending leave request ────────────────────
export async function cancelLeave(leaveId, userId) {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', leaveId)
    .eq('user_id', userId)   // RLS also enforces this
    .eq('status', 'pending'); // can only cancel if still pending

  if (error) return { error: error.message };
  return { success: true };
}

// ── Admin: get ALL leave requests (with employee profile joined) ─
export async function getAllLeaves({ status, userId } = {}) {
  let query = supabase
    .from('leave_requests_with_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);
  if (userId)                     query = query.eq('user_id', userId);

  const { data, error } = await query;
  if (error) { console.error('getAllLeaves error:', error); return []; }
  return data;
}

// ── Admin: approve a leave request ─────────────────────────────
export async function approveLeave(leaveId, adminId, adminComment = '') {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      status:        'approved',
      admin_comment: adminComment,
      reviewed_by:   adminId,
      reviewed_at:   new Date().toISOString()
    })
    .eq('id', leaveId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

// ── Admin: reject a leave request ──────────────────────────────
export async function rejectLeave(leaveId, adminId, adminComment = '') {
  if (!adminComment.trim()) {
    return { error: 'Please provide a reason for rejection.' };
  }

  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      status:        'rejected',
      admin_comment: adminComment,
      reviewed_by:   adminId,
      reviewed_at:   new Date().toISOString()
    })
    .eq('id', leaveId)
    .select()
    .single();

  if (error) return { error: error.message };
  return { data };
}

// ── Admin: get leave stats summary ─────────────────────────────
export async function getLeaveStats() {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('status');

  if (error) return null;

  return {
    total:     data.length,
    pending:   data.filter(r => r.status === 'pending').length,
    approved:  data.filter(r => r.status === 'approved').length,
    rejected:  data.filter(r => r.status === 'rejected').length,
    cancelled: data.filter(r => r.status === 'cancelled').length
  };
}
