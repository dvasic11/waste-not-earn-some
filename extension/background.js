// MV3 service worker — minimal, alarm-driven ticker.
import { getAll, setState, todayKey, DEFAULTS } from "./storage.js";
import {
  hostFromUrl,
  matchesWasteDomain,
  isWithinWorkingHours,
  earningsPerSecond,
} from "./tracker.js";

const ALARM = "wb-tick";
const TICK_SECONDS = 5;

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["settings", "state"]);
  if (!data.settings) await chrome.storage.local.set({ settings: DEFAULTS.settings });
  if (!data.state) await chrome.storage.local.set({ state: DEFAULTS.state });
  chrome.alarms.create(ALARM, { periodInMinutes: TICK_SECONDS / 60 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: TICK_SECONDS / 60 });
});

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

async function tick() {
  const { settings, state } = await getAll();
  const now = new Date();
  const inWork = isWithinWorkingHours(now, settings.workStart, settings.workEnd);
  if (!inWork) {
    await setState({ activeDomain: null, lastTickMs: now.getTime() });
    return;
  }

  // If on break, count regardless of which tab is open.
  let countSeconds = 0;
  let activeDomain = null;
  if (state.onBreak) {
    countSeconds = TICK_SECONDS;
    activeDomain = "break";
  } else {
    const domain = await getActiveWasteDomain(settings);
    if (domain) {
      countSeconds = TICK_SECONDS;
      activeDomain = domain;
    }
  }

  if (countSeconds > 0) {
    const earned = countSeconds * earningsPerSecond(settings.hourlyRate);
    const k = todayKey(now);
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
      lastTickMs: now.getTime(),
    });
  } else {
    await setState({ activeDomain: null, lastTickMs: now.getTime() });
  }
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) tick().catch(console.error);
});

// Allow popup to request an immediate tick & settings refresh.
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
