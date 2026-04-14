// js/supabase-client.js
// ─────────────────────────────────────────────────────────────
// Single source of truth for the Supabase client.
// Every other JS file imports { supabase } from this file.
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ── Credentials ────────────────────────────────────────────
// Replace these two values with your own from:
// Supabase Dashboard → Project Settings → API
const SUPABASE_URL  = 'https://oejmahqzkcgsjyswrbbq.supabase.co';   // ← your URL
const SUPABASE_ANON = 'sb_publishable_Lr8LrHsVmoQ008AVzF1z5w_aT-ikwhZ'; // ← your anon key

// ── Create client ──────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    // Persist session across page refreshes using localStorage
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true   // handles email verification redirect
  }
});

// ── Helper: get the currently logged-in user ───────────────
// Returns null if not logged in.
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Helper: get the user's profile row from public.profiles ─
// This includes their role ('employee' or 'admin').
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error.message);
    return null;
  }
  return data;
}

// ── Helper: require login — redirect to login if not authed ─
// Call this at the top of any protected page.
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

// ── Helper: require admin role ──────────────────────────────
// Call this at the top of any admin-only page.
export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    // Not an admin — redirect to employee dashboard
    window.location.href = '/dashboard/employee.html';
    return null;
  }
  return { user, profile };
}
