// js/analytics.js — Analytics and chart rendering

import { supabase } from './supabase-client.js';

// ── Get daily attendance counts for a month ─────────────────────
// Returns array: [{ date, count, present, late, half_day }]
export async function getDailyBreakdown(month, year) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

  const { data, error } = await supabase
    .from('attendance_with_profiles')
    .select('date, status')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) { console.error(error); return []; }

  // Group by date
  const byDate = {};
  for (const row of data) {
    if (!byDate[row.date]) {
      byDate[row.date] = { date: row.date, count: 0, present: 0, late: 0, half_day: 0 };
    }
    byDate[row.date].count++;
    if (row.status === 'present')  byDate[row.date].present++;
    if (row.status === 'late')     byDate[row.date].late++;
    if (row.status === 'half_day') byDate[row.date].half_day++;
  }

  // Build full array for each day of the month
  const result = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayOfWeek = new Date(dateStr).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    result.push(byDate[dateStr] || {
      date: dateStr, count: 0, present: 0, late: 0, half_day: 0, isWeekend
    });
    result[result.length-1].isWeekend = isWeekend;
  }

  return result;
}

// ── Get 6-month trend data ──────────────────────────────────────
export async function getSixMonthTrend() {
  const now    = new Date();
  const result = [];

  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth() + 1;
    const year  = d.getFullYear();

    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

    const { count } = await supabase
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .gte('date', startDate)
      .lte('date', endDate);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];
    result.push({ label: monthNames[month-1], count: count || 0, month, year });
  }

  return result;
}

// ── Render a CSS bar chart ──────────────────────────────────────
// container: DOM element to render into
// data:      array of { label, value, color? }
// maxValue:  the 100% height value (defaults to max in data)
export function renderBarChart(container, data, {
  maxValue    = null,
  barColor    = 'var(--accent)',
  height      = 120,
  showValues  = true,
  labelRotate = false
} = {}) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);

  container.innerHTML = `
    <div style="
      display:     flex;
      align-items: flex-end;
      gap:         6px;
      height:      ${height}px;
      padding:     0 4px;
    ">
      ${data.map(d => {
        const pct   = Math.round((d.value / max) * 100);
        const color = d.color || barColor;
        return `
          <div style="
            flex:           1;
            display:        flex;
            flex-direction: column;
            align-items:    center;
            gap:            4px;
            height:         100%;
            justify-content: flex-end;
          ">
            ${showValues && d.value > 0
              ? `<span style="font-size:10px;color:var(--text-3)">${d.value}</span>`
              : ''
            }
            <div title="${d.label}: ${d.value}" style="
              width:         100%;
              height:        ${Math.max(pct, d.value > 0 ? 4 : 0)}%;
              background:    ${color};
              border-radius: 4px 4px 0 0;
              transition:    height 0.4s ease;
              cursor:        default;
              opacity:       ${d.value === 0 ? '0.2' : '1'};
            "></div>
            <span style="
              font-size:  10px;
              color:      var(--text-3);
              text-align: center;
              white-space: nowrap;
              ${labelRotate ? 'transform:rotate(-45deg);transform-origin:top center;' : ''}
            ">${d.label}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Render a donut-style stat ring (CSS only) ───────────────────
export function renderRing(container, percentage, color = 'var(--accent)') {
  const deg = Math.round((percentage / 100) * 360);
  container.innerHTML = `
    <div style="
      width:           100px;
      height:          100px;
      border-radius:   50%;
      background:      conic-gradient(${color} ${deg}deg, var(--surface2) ${deg}deg);
      display:         flex;
      align-items:     center;
      justify-content: center;
      position:        relative;
    ">
      <div style="
        width:           76px;
        height:          76px;
        border-radius:   50%;
        background:      var(--surface);
        display:         flex;
        align-items:     center;
        justify-content: center;
        font-family:     var(--font-display);
        font-weight:     700;
        font-size:       18px;
        color:           var(--text);
      ">${percentage}%</div>
    </div>
  `;
}
