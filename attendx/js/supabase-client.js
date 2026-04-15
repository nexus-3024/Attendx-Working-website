
const SUPABASE_URL  = 'https://oejmahqzkcgsjyswrbbq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_Lr8LrHsVmoQ008AVzF1z5w_aT-ikwhZ';   

// 1. Initialize Supabase using the global object loaded from your HTML <script>
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    flowType:           'pkce',   // Excellent choice for mobile reliability
    storage:            window.localStorage
  }
});

// 2. Wait for auth to be READY (fixes mobile loops)
window.waitForSession = function() {
  return new Promise((resolve) => {
    window.supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolve(session);
        return;
      }

      // Wait for auth state to settle if hash token is still parsing
      const { data: { subscription } } = window.supabase.auth.onAuthStateChange(
        (event, session) => {
          subscription.unsubscribe();
          resolve(session);
        }
      );

      // Safety timeout: if nothing fires in 3s, resolve with null
      setTimeout(() => {
        subscription.unsubscribe();
        resolve(null);
      }, 3000);
    });
  });
};

// 3. Get user profile
window.getUserProfile = async function(userId) {
  const { data, error } = await window.supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Profile fetch error:', error.message);
    return null;
  }
  return data;
};

// 4. Safe Auth Check — redirects if not logged in
window.requireAuth = async function() {
  const session = await window.waitForSession();

  if (!session) {
    const path = window.location.pathname;
    const isAuthPage = path.includes('login') ||
                       path.includes('register') ||
                       path.includes('verify') ||
                       path === '/' ||
                       path.endsWith('index.html');

    if (!isAuthPage) {
      window.location.href = '/login.html';
    }
    return null;
  }
  return session.user;
};

// 5. Safe Admin Check
window.requireAdmin = async function() {
  const user = await window.requireAuth();
  if (!user) return null;

  const profile = await window.getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    window.location.href = '/dashboard/employee.html';
    return null;
  }
  return { user, profile };
};
