// MV3 service worker — drift-corrected, single-source-of-truth ticker.
import { getAll, setState, todayKey, DEFAULTS } from "./storage.js";
import {
  hostFromUrl,
  matchesWasteDomain,
  isWithinWorkingHours,
  earningsPerSecond,
} from "./tracker.js";

const ALARM = "wb-tick";
const TICK_SECONDS = 5;
// Cap a single delta to avoid huge jumps when the SW was suspended for hours.
const MAX_DELTA_SECONDS = 60;

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["settings", "state"]);
  // Backward compat: merge defaults so new fields appear without wiping old data.
  await chrome.storage.local.set({
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    state: { ...DEFAULTS.state, ...(data.state || {}) },
  });
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

function ensureAlarm() {
  // Recreating with the same name replaces it — guarantees only one timer.
  chrome.alarms.create(ALARM, { periodInMinutes: TICK_SECONDS / 60 });
}

async function getActiveWasteDomain(settings) {
  // user must be active (not idle 60s+) for site tracking
  const idle = await chrome.idle.queryState(60);
  if (idle !== "active") return null;
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) return null;
  const host = hostFromUrl(tab.url);
  return matchesWasteDomain(host, settings.wasteDomains);
}

// Single in-flight tick guard to prevent race conditions.
let tickInFlight = null;

async function tick() {
  if (tickInFlight) return tickInFlight;
  tickInFlight = (async () => {
    const { settings, state } = await getAll();
    const now = Date.now();

    // Compute elapsed seconds since last tick using wall clock — drift-corrected.
    let delta = state.lastTickMs ? (now - state.lastTickMs) / 1000 : TICK_SECONDS;
    if (delta < 0) delta = 0;
    if (delta > MAX_DELTA_SECONDS) delta = MAX_DELTA_SECONDS;

    const inWork = isWithinWorkingHours(new Date(now), settings.workStart, settings.workEnd);

    let countSeconds = 0;
    let activeDomain = null;

    // Break only counts during working hours — outside work hours, nothing counts.
    if (inWork) {
      if (state.onBreak) {
        countSeconds = delta;
        activeDomain = "break";
      } else {
        const domain = await getActiveWasteDomain(settings);
        if (domain) {
          countSeconds = delta;
          activeDomain = domain;
        }
      }
    }

    if (countSeconds > 0) {
      const earned = countSeconds * earningsPerSecond(settings.hourlyRate);
      const k = todayKey(new Date(now));
      const today = state.daily[k] || { seconds: 0, earnings: 0 };
      const daily = {
        ...state.daily,
        [k]: {
          seconds: today.seconds + countSeconds,
          earnings: today.earnings + earned,
        },
      };
      await setState({
        cumulativeSeconds: state.cumulativeSeconds + countSeconds,
        cumulativeEarnings: state.cumulativeEarnings + earned,
        daily,
        activeDomain,
        lastTickMs: now,
      });
    } else {
      await setState({ activeDomain: null, lastTickMs: now });
    }
  })().finally(() => {
    tickInFlight = null;
  });
  return tickInFlight;
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) tick().catch(console.error);
});

// React instantly when settings/state change (e.g. user edits in popup).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings || changes.state) {
    tick().catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "wb-tick-now") {
    tick().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "wb-reset") {
    chrome.storage.local.set({ state: DEFAULTS.state }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
