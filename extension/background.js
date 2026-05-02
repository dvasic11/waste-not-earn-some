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

const MILESTONES = [25, 50, 75, 100];
const MILESTONE_MSG = {
  25: { title: "You've entered the game 💸", msg: "25% of your daily waste goal — nice start." },
  50: { title: "Level up 👀", msg: "50% there. This is getting expensive." },
  75: { title: "Combo mode activated 🔥", msg: "75% — you're on a roll. Keep going." },
  100: { title: "You win 🎉", msg: "You just got paid for nothing. Goal complete!" },
};

function fireMilestoneNotification(pct) {
  if (!chrome.notifications?.create) return;
  const m = MILESTONE_MSG[pct];
  if (!m) return;
  chrome.notifications.create(`wb-milestone-${pct}-${Date.now()}`, {
    type: "basic",
    iconUrl: "icon-128.png",
    title: m.title,
    message: m.msg,
    priority: 1,
  });
}

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
    const dow = new Date(now).getDay();
    const workDays = Array.isArray(settings.workDays) && settings.workDays.length
      ? settings.workDays
      : [1, 2, 3, 4, 5];
    const isWorkDay = workDays.includes(dow);

    let countSeconds = 0;
    let activeDomain = null;

    // Break only counts during working hours — outside work hours, nothing counts.
    if (inWork && isWorkDay) {
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
      // Per-domain aggregation (skip the synthetic "break" bucket).
      const domains = { ...(state.domains || {}) };
      if (activeDomain && activeDomain !== "break") {
        const cur = domains[activeDomain] || { seconds: 0, earnings: 0 };
        domains[activeDomain] = {
          seconds: cur.seconds + countSeconds,
          earnings: cur.earnings + earned,
        };
      }
      // Streak: when today crosses 100% of goal, bump streak once per day.
      let streak = state.streak || 0;
      let streakLastDay = state.streakLastDay || null;
      const goal = Number(settings.dailyGoal) || 0;
      const newToday = daily[k];
      // Milestones — fire once per day per threshold.
      const milestones = { ...(state.milestones || {}) };
      const hit = new Set(milestones[k] || []);
      if (goal > 0) {
        const pct = (newToday.earnings / goal) * 100;
        for (const m of MILESTONES) {
          if (pct >= m && !hit.has(m)) {
            hit.add(m);
            fireMilestoneNotification(m);
          }
        }
      }
      milestones[k] = [...hit];
      if (goal > 0 && newToday.earnings >= goal && streakLastDay !== k) {
        // Only continue the streak if yesterday also hit the goal (or no prior day yet).
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        const yk = todayKey(y);
        if (streakLastDay === yk || streakLastDay === null) {
          streak = streak + 1;
        } else {
          streak = 1; // missed a day — reset and count today
        }
        streakLastDay = k;
      }
      // If a previous working day was missed (goal not reached), reset streak to 0.
      // Walks back from today through prior working days; stops at streakLastDay.
      if (streak > 0 && streakLastDay) {
        let missed = false;
        for (let i = 1; i <= 14; i++) {
          const probe = new Date(now);
          probe.setDate(probe.getDate() - i);
          const pk = todayKey(probe);
          if (pk === streakLastDay) break;
          if (!workDays.includes(probe.getDay())) continue; // skip non-work days
          const pday = state.daily[pk];
          if (!pday || pday.earnings < goal) { missed = true; break; }
        }
        if (missed) { streak = 0; streakLastDay = null; }
      }
      await setState({
        cumulativeSeconds: state.cumulativeSeconds + countSeconds,
        cumulativeEarnings: state.cumulativeEarnings + earned,
        daily,
        domains,
        milestones,
        streak,
        streakLastDay,
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

// ---------- Keyboard shortcut: instant escape from time-wasters ----------
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "wb-escape") return;
  const { settings } = await getAll();
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) return;
  const host = hostFromUrl(tab.url);
  const matched = matchesWasteDomain(host, settings.wasteDomains);
  if (!matched) return;
  let target = settings.redirectUrl || "https://mail.google.com";
  // Normalize stored URL — accept "gmail.com" as well as full URLs.
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  chrome.tabs.update(tab.id, { url: target });
});
