// js/supabase-client.js

const SUPABASE_URL  = 'https://oejmahqzkcgsjyswrbbq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Lr8LrHsVmoQ008AVzF1z5w_aT-ikwhZ';

// The Supabase CDN <script> tag puts the raw library on window.supabase.
// We call createClient() and reassign window.supabase to the actual client.
const _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    flowType:           'pkce',
    storage:            window.localStorage
  }
});

// ES module export — fixes auth.js, admin.js, attendance.js, leave.js, analytics.js
// Previously this file only used window.* so every import { supabase } returned undefined
export const supabase = _client;
window.supabase = _client;


export async function waitForSession() {
  // getSession() automatically exchanges the PKCE ?code= in the email link
  const { data: { session } } = await _client.auth.getSession();
  if (session) return session;

  return new Promise((resolve) => {
    const { data: { subscription } } = _client.auth.onAuthStateChange(
      (_event, session) => {
        subscription.unsubscribe();
        resolve(session);
      }
    );
    setTimeout(() => { subscription.unsubscribe(); resolve(null); }, 5000);
  });
}
window.waitForSession = waitForSession;


export async function getUserProfile(userId) {
  const { data, error } = await _client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('Profile fetch error:', error.message); return null; }
  return data;
}
window.getUserProfile = getUserProfile;


export async function requireAuth() {
  const session = await waitForSession();
  if (!session) {
    const path = window.location.pathname;
    const isAuthPage = path.includes('login') || path.includes('register') ||
                       path.includes('verify') || path === '/' ||
                       path.endsWith('index.html');
    if (!isAuthPage) window.location.href = '/login.html';
    return null;
  }
  return session.user;
}
window.requireAuth = requireAuth;


export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    window.location.href = '/dashboard/employee.html';
    return null;
  }
  return { user, profile };
}
window.requireAdmin = requireAdmin;
