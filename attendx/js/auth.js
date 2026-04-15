// js/auth.js

import { supabase, getUserProfile, waitForSession } from './supabase-client.js';
import { setLoading, showAlert }                    from './utils.js';

export async function handleRegister(e) {
  e.preventDefault();

  const form    = e.target;
  const btn     = form.querySelector('[type="submit"]');
  const alertEl = form.querySelector('.alert');

  const fullName   = form.full_name.value.trim();
  const email      = form.email.value.trim().toLowerCase();
  const password   = form.password.value;
  const confirmPw  = form.confirm_password.value;
  const department = form.department?.value || 'General';
  const phone      = form.phone?.value.trim() || '';

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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    setLoading(btn, false);
    return showAlert(alertEl, error.message);
  }

  if (data.user) {
    await supabase
      .from('profiles')
      .update({ phone, department })
      .eq('id', data.user.id);
  }

  setLoading(btn, false);
  window.location.href = '/verify.html?email=' + encodeURIComponent(email);
}

export async function handleLogin(e) {
  e.preventDefault();

  const form    = e.target;
  const btn     = form.querySelector('[type="submit"]');
  const alertEl = form.querySelector('.alert');

  const email    = form.email.value.trim().toLowerCase();
  const password = form.password.value;

  if (!email || !password) {
    return showAlert(alertEl, 'Please enter your email and password.');
  }

  setLoading(btn, true, 'Signing in...');

  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  });

  if (error) {
    setLoading(btn, false);
    if (error.message.includes('Email not confirmed')) {
      return showAlert(alertEl,
        'Please verify your email first. Check your inbox.',
        'warning'
      );
    }
    if (error.message.includes('Invalid login credentials')) {
      return showAlert(alertEl, 'Incorrect email or password.');
    }
    return showAlert(alertEl, error.message);
  }

  const profile = await getUserProfile(data.user.id);

  if (!profile) {
    setLoading(btn, false);
    return showAlert(alertEl, 'Account setup incomplete. Contact admin.');
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    setLoading(btn, false);
    return showAlert(alertEl, 'Your account has been deactivated. Contact admin.');
  }

  setLoading(btn, true, 'Loading dashboard...');

  // ── FIX 2: Wait for session to be confirmed before redirecting ──
  // Instead of an arbitrary 800ms delay, we verify the session is
  // actually persisted to localStorage before navigating away.
  // This is safe on both desktop and mobile browsers.
  await waitForSession();

  if (profile.role === 'admin') {
    window.location.href = '/dashboard/admin.html';
  } else {
    window.location.href = '/dashboard/employee.html';
  }
}

export async function handleLogout() {
  await supabase.auth.signOut();
  sessionStorage.clear();
  window.location.href = '/login.html';
}
