// js/utils.js — Shared utility functions used across all pages

// ── Loading state helper ──────────────────────────────────────
// Disables a button and shows a spinner while an async operation runs.
// Usage: setLoading(btn, true, 'Saving...') / setLoading(btn, false)
export function setLoading(btn, isLoading, loadingText = 'Loading...') {
  if (isLoading) {
    btn.disabled         = true;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML        = `<span class="spinner"></span> ${loadingText}`;
  } else {
    btn.disabled  = false;
    btn.innerHTML = btn.dataset.original || 'Submit';
  }
}

// ── Alert helper ───────────────────────────────────────────────
// Shows an alert box with a message.
// type: 'error' | 'success' | 'info' | 'warning'
export function showAlert(selector, message, type = 'error') {
  const el = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (!el) return;

  const icons = {
    error:   '⚠️',
    success: '✅',
    info:    'ℹ️',
    warning: '⚡'
  };

  el.className  = `alert alert-${type} show`;
  el.innerHTML  = `<span>${icons[type] || ''}</span> ${message}`;

  // Auto-hide after 6 seconds
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 6000);
}

export function hideAlert(selector) {
  const el = typeof selector === 'string'
    ? document.querySelector(selector)
    : selector;
  if (el) el.classList.remove('show');
}

// ── Date / Time formatters ─────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour:  '2-digit', minute: '2-digit'
  });
}

export function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });
}

export function todayISO() {
  // Returns today's date as YYYY-MM-DD in local time
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getCurrentMonthYear() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

// ── Status badge HTML ──────────────────────────────────────────
export function statusBadge(status) {
  const map = {
    present:   ['badge-success', 'Present'],
    late:      ['badge-warning', 'Late'],
    half_day:  ['badge-warning', 'Half Day'],
    absent:    ['badge-danger',  'Absent'],
    approved:  ['badge-success', 'Approved'],
    rejected:  ['badge-danger',  'Rejected'],
    pending:   ['badge-warning', 'Pending'],
    cancelled: ['badge-muted',   'Cancelled'],
    active:    ['badge-success', 'Active'],
    inactive:  ['badge-danger',  'Inactive'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── User initials avatar ───────────────────────────────────────
export function getInitials(fullName) {
  if (!fullName) return '?';
  return fullName.trim().split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Capitalize first letter ────────────────────────────────────
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Number of days between two dates ──────────────────────────
export function daysBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

// ── Debounce ───────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Export data as CSV ─────────────────────────────────────────
export function exportCSV(filename, rows, headers) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
