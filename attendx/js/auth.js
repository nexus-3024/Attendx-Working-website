// js/auth.js — Authentication logic (register, login, logout)

import { supabase, getUserProfile } from './supabase-client.js';
import { setLoading, showAlert }    from './utils.js';

// ── REGISTER ───────────────────────────────────────────────────
// Called when the registration form is submitted.
// Signs up with Supabase Auth, which:
//   1. Creates a row in auth.users
//   2. Sends a verification email
//   3. Our trigger creates a row in public.profiles automatically
export async function handleRegister(e) {
  e.preventDefault();

  const form       = e.target;
  const btn        = form.querySelector('[type="submit"]');
  const alertEl    = form.querySelector('.alert');

  const fullName   = form.full_name.value.trim();
  const email      = form.email.value.trim().toLowerCase();
  const password   = form.password.value;
  const confirmPw  = form.confirm_password.value;
  const department = form.department?.value || 'General';
  const phone      = form.phone?.value.trim() || '';

  // Client-side validation
  if (!fullName || !email || !password) {
    return showAlert(alertEl, 'Please fill in all required fields.');
  }
  if (password.length < 6) {
    return showAlert(alertEl, 'Password must be at least 6 characters.');
  }
  if (password !== confirmPw) {
    return showAlert(alertEl, 'Passwords do not match.');
  }

  setLoading(btn, true, 'Creating account...');

  // Sign up via Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // This metadata is available in the trigger via raw_user_meta_data
      data: { full_name: fullName }
    }
  });

  if (error) {
    setLoading(btn, false);
    return showAlert(alertEl, error.message);
  }

  // After sign-up, update the profile with phone and department
  // The trigger already created the row with full_name and email
  if (data.user) {
    await supabase
      .from('profiles')
      .update({ phone, department })
      .eq('id', data.user.id);
  }

  setLoading(btn, false);

  // Redirect to verify page to tell user to check their email
  window.location.href = '/verify.html?email=' + encodeURIComponent(email);
}

// ── LOGIN ──────────────────────────────────────────────────────
export async function handleLogin(e) {
  e.preventDefault();

  const form   = e.target;
  const btn    = form.querySelector('[type="submit"]');
  const alertEl = form.querySelector('.alert');

  const email    = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  if (!email || !password) {
    return showAlert(alertEl, 'Please enter your email and password.');
  }

  setLoading(btn, true, 'Signing in...');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setLoading(btn, false);
    // Give friendly messages instead of raw Supabase errors
    if (error.message.includes('Email not confirmed')) {
      return showAlert(alertEl,
        'Please verify your email first. Check your inbox for the confirmation link.',
        'warning'
      );
    }
    if (error.message.includes('Invalid login credentials')) {
      return showAlert(alertEl, 'Incorrect email or password. Please try again.');
    }
    return showAlert(alertEl, error.message);
  }

  // Get user profile to determine role
  const profile = await getUserProfile(data.user.id);

  if (!profile) {
    setLoading(btn, false);
    return showAlert(alertEl, 'Account setup incomplete. Please contact admin.');
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    setLoading(btn, false);
    return showAlert(alertEl, 'Your account has been deactivated. Contact admin.');
  }

  // Redirect based on role
  if (profile.role === 'admin') {
    window.location.href = '/dashboard/admin.html';
  } else {
    window.location.href = '/dashboard/employee.html';
  }
}

// ── LOGOUT ─────────────────────────────────────────────────────
export async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}
