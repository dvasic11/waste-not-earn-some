// Centralized storage helpers — single source of truth for settings + state.

export const DEFAULTS = {
  settings: {
    hourlyRate: 25, // USD per hour
    workStart: "09:00",
    workEnd: "17:00",
    dailyGoal: 10, // USD wasted per day to "win"
    currency: "$",
    wasteDomains: [
      "youtube.com",
      "instagram.com",
      "tiktok.com",
      "x.com",
      "twitter.com",
      "reddit.com",
      "facebook.com",
    ],
    // Working days of the week — 0=Sunday … 6=Saturday. Default Mon–Fri.
    workDays: [1, 2, 3, 4, 5],
    // Productivity shortcut redirect target (Chrome command set in manifest).
    redirectUrl: "https://mail.google.com",
  },
  state: {
    // running totals
    cumulativeSeconds: 0, // all-time wasted seconds
    cumulativeEarnings: 0, // all-time wasted $
    // per-day map: { "YYYY-MM-DD": { seconds, earnings } }
    daily: {},
    // per-domain all-time totals: { "youtube.com": { seconds, earnings } }
    domains: {},
    // streak of consecutive days reaching 100% goal
    streak: 0,
    // last day counted for streak (YYYY-MM-DD), to avoid double counting
    streakLastDay: null,
    // milestones notified for the current day: { "YYYY-MM-DD": [25,50,75,100] }
    milestones: {},
    // override
    onBreak: false,
    // last tick we accounted for, ms since epoch
    lastTickMs: 0,
    // currently being tracked
    activeDomain: null,
  },
};

export async function getAll() {
  const data = await chrome.storage.local.get(["settings", "state"]);
  return {
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    state: { ...DEFAULTS.state, ...(data.state || {}) },
  };
}

export async function setSettings(patch) {
  const { settings } = await getAll();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function setState(patch) {
  const { state } = await getAll();
  const next = { ...state, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayStats(state) {
  const k = todayKey();
  return state.daily[k] || { seconds: 0, earnings: 0 };
}

// Returns last N days' stats (oldest -> newest) with goal completion %.
export function getLastNDays(state, settings, n = 7) {
  const out = [];
  const goal = Math.max(0, Number(settings.dailyGoal) || 0);
  const workDays = Array.isArray(settings.workDays) && settings.workDays.length
    ? settings.workDays
    : [1, 2, 3, 4, 5];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    const day = state.daily[k] || { seconds: 0, earnings: 0 };
    const pct = goal > 0 ? Math.min(200, (day.earnings / goal) * 100) : 0;
    const isWorkDay = workDays.includes(d.getDay());
    out.push({
      key: k,
      date: d,
      label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      earnings: day.earnings,
      seconds: day.seconds,
      pct,
      isWorkDay,
    });
  }
  return out;
}
