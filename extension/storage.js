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
  },
  state: {
    // running totals
    cumulativeSeconds: 0, // all-time wasted seconds
    cumulativeEarnings: 0, // all-time wasted $
    // per-day map: { "YYYY-MM-DD": { seconds, earnings } }
    daily: {},
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
