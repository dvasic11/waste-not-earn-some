import { getAll, setSettings, setState, getTodayStats, getLastNDays, DEFAULTS } from "./storage.js";
import { isWithinWorkingHours } from "./tracker.js";

const $ = (id) => document.getElementById(id);
const GAUGE_LEN = 251.3;
let timer = null;
let saveDebounce = null;
let prevStreak = 0;
let prevTier = -1;
let prevAmountText = "";
let particlesActive = false;
let celebrationActive = false;
let toastTimer = null;

// ---------- Tier progression ----------
function getTier(pct) {
  if (pct >= 100) return 4;
  if (pct >= 75) return 3;
  if (pct >= 50) return 2;
  if (pct >= 25) return 1;
  return 0;
}

function showToast(msg, ms = 2600) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("visible"), ms);
}

// Particles: lazy-spawn floating coins (tier 2+)
function startParticles() {
  if (particlesActive) return;
  particlesActive = true;
  const root = $("particles");
  if (!root) return;
  const spawn = () => {
    if (!particlesActive) return;
    const tier = Number($("app").dataset.tier) || 0;
    if (tier < 2) { particlesActive = false; root.innerHTML = ""; return; }
    const coin = document.createElement("div");
    coin.className = "coin";
    coin.textContent = ["💸", "💰", "🪙", "✨"][Math.floor(Math.random() * 4)];
    coin.style.left = `${Math.random() * 90 + 5}%`;
    const dur = 4 + Math.random() * 4;
    coin.style.animationDuration = `${dur}s`;
    coin.style.fontSize = `${12 + Math.random() * 10}px`;
    root.appendChild(coin);
    setTimeout(() => coin.remove(), dur * 1000 + 200);
    const nextIn = tier >= 3 ? 450 + Math.random() * 400 : 900 + Math.random() * 700;
    setTimeout(spawn, nextIn);
  };
  spawn();
}
function stopParticles() {
  particlesActive = false;
  const root = $("particles");
  if (root) root.innerHTML = "";
}

// Celebration: confetti burst when hitting 100%
function fireCelebration() {
  if (celebrationActive) return;
  celebrationActive = true;
  const c = window.confetti;
  if (typeof c === "function") {
    const shoot = (delay) => setTimeout(() => {
      c({
        particleCount: 60,
        spread: 70,
        startVelocity: 35,
        origin: { y: 0.3 },
        colors: ["#f59e0b", "#ef4444", "#22c55e", "#fde68a", "#f8fafc"],
        disableForReducedMotion: true,
      });
    }, delay);
    shoot(0); shoot(250); shoot(550);
  }
  showToast("🎉 GOAL COMPLETE", 3200);
  setTimeout(() => { celebrationActive = false; }, 3500);
}

function tierUpFlash(tier) {
  const app = $("app");
  if (!app) return;
  app.classList.remove("tier-up");
  void app.offsetWidth;
  app.classList.add("tier-up");
  setTimeout(() => app.classList.remove("tier-up"), 600);
  const msgs = {
    1: "You've entered the game 💸",
    2: "Level up. This is getting expensive 👀",
    3: "Combo mode activated 🔥",
    4: "You win. You just got paid for nothing 🎉",
  };
  if (msgs[tier]) showToast(msgs[tier]);
}

function applyTier(pct) {
  const tier = getTier(pct);
  const app = $("app");
  if (!app) return;
  if (tier !== prevTier) {
    app.dataset.tier = String(tier);
    if (prevTier !== -1 && tier > prevTier) {
      tierUpFlash(tier);
      if (tier === 4) fireCelebration();
    }
    if (tier >= 2) startParticles();
    else stopParticles();
    prevTier = tier;
  }
}

function fmtMoney(n, cur = "$") {
  return `${cur}${(n || 0).toFixed(2)}`;
}
function fmtTime(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function liquidColor(pct) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 40) return "#eab308";
  return "#ef4444";
}

// Normalize a user-typed URL: accept "gmail.com", "youtube.com/feed", etc.
// Prepends https:// when no protocol is given. Returns null if invalid.
function normalizeUrl(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ---------- Shortcut recorder ----------
function formatShortcut(parts) {
  return parts.join("+");
}
function eventToShortcut(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Command");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.key;
  if (!k || ["Control", "Shift", "Alt", "Meta"].includes(k)) return null;
  let key = k.length === 1 ? k.toUpperCase() : k;
  // Normalize common keys
  if (key === " ") key = "Space";
  parts.push(key);
  // Chrome requires at least one modifier (Ctrl/Cmd/Alt) + a key
  const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
  if (!hasModifier) return null;
  return formatShortcut(parts);
}

// ---------- Validation ----------
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate() {
  const errors = {};
  const rate = Number($("s-rate").value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
    errors.rate = "Enter a number between 0 and 10000";
  }
  const start = $("s-start").value;
  const end = $("s-end").value;
  if (!TIME_RE.test(start)) errors.start = "Use HH:MM";
  if (!TIME_RE.test(end)) errors.end = "Use HH:MM";
  if (!errors.start && !errors.end && start === end) {
    errors.end = "Start and end must differ";
  }
  const goal = Number($("s-goal").value);
  if (!Number.isFinite(goal) || goal < 0 || goal > 100000) {
    errors.goal = "Enter a number between 0 and 100000";
  }
  const domains = parseDomains($("s-domains").value);
  if (domains.length === 0) errors.domains = "Add at least one domain";
  const redirectRaw = ($("s-redirect").value || "").trim();
  let redirect = "";
  if (redirectRaw) {
    const norm = normalizeUrl(redirectRaw);
    if (!norm) errors.redirect = "Enter a valid domain (e.g. gmail.com)";
    else redirect = norm;
  }

  // Paint errors
  showError("err-rate", errors.rate);
  showError("err-start", errors.start);
  showError("err-end", errors.end);
  showError("err-goal", errors.goal);
  showError("err-domains", errors.domains);
  showError("err-redirect", errors.redirect);

  return { ok: Object.keys(errors).length === 0, rate, start, end, goal, domains, redirect };
}

function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("visible", !!msg);
}

function parseDomains(str) {
  return str
    .split(",")
    .map((d) =>
      d.trim().toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
    )
    .filter(Boolean);
}

// ---------- Persistence ----------
async function persistIfValid() {
  const v = validate();
  if (!v.ok) {
    $("save-status").textContent = "⚠ Fix errors above";
    $("save-status").className = "save-status err";
    return;
  }
  await setSettings({
    hourlyRate: v.rate,
    workStart: v.start,
    workEnd: v.end,
    dailyGoal: v.goal,
    wasteDomains: v.domains,
    redirectUrl: v.redirect || DEFAULTS.settings.redirectUrl,
  });
  $("save-status").textContent = "✓ Saved automatically";
  $("save-status").className = "save-status ok";
  // Background reacts to storage.onChanged automatically — no reload needed.
}

function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(persistIfValid, 350);
}

// ---------- Render ----------
async function render() {
  const { settings, state } = await getAll();
  const today = getTodayStats(state);

  $("today-amount").textContent = fmtMoney(today.earnings, settings.currency);
  $("today-time").textContent = fmtTime(today.seconds);
  $("cum-amount").textContent = fmtMoney(state.cumulativeEarnings, settings.currency);
  $("cum-time").textContent = fmtTime(state.cumulativeSeconds);
  $("goal-val").textContent = settings.dailyGoal;

  // Goal progress uses the SAME source value as the live counter.
  const pct = settings.dailyGoal > 0
    ? Math.max(0, Math.min(100, (today.earnings / settings.dailyGoal) * 100))
    : 0;
  $("goal-pct").textContent = `${pct.toFixed(0)}%`;
  $("gauge-fg").setAttribute("stroke-dashoffset", String(GAUGE_LEN * (1 - pct / 100)));
  const angle = -90 + (180 * pct) / 100;
  $("needle").setAttribute("transform", `rotate(${angle} 100 110)`);

  let status = "Idle — not in working hours or no time-waster open";
  if (state.onBreak) status = "☕ On break — every second still counts";
  else if (state.activeDomain) status = `Tracking ${state.activeDomain} 💸`;
  $("status-line").textContent = status;

  const breakBtn = $("break-btn");
  breakBtn.textContent = state.onBreak ? "▶ Continue work" : "☕ Take a break";
  breakBtn.classList.toggle("on", !!state.onBreak);

  // Streak
  const streak = state.streak || 0;
  $("streak-num").textContent = streak;
  if (streak > prevStreak) {
    const pill = $("streak-pill");
    pill.classList.remove("bump");
    void pill.offsetWidth; // restart animation
    pill.classList.add("bump");
  }
  prevStreak = streak;

  // 7-day history
  renderHistory(state, settings);

  // Leaderboard
  renderLeaderboard(state, settings);

  // Only refresh inputs when settings panel is hidden — avoids fighting user typing.
  if ($("settings").classList.contains("hidden")) {
    $("s-rate").value = settings.hourlyRate;
    $("s-start").value = settings.workStart;
    $("s-end").value = settings.workEnd;
    $("s-goal").value = settings.dailyGoal;
    $("s-domains").value = settings.wasteDomains.join(", ");
    $("s-redirect").value = settings.redirectUrl || "";
    refreshShortcutDisplay();
  }
}

async function refreshShortcutDisplay() {
  if (!chrome.commands?.getAll) return;
  try {
    const cmds = await chrome.commands.getAll();
    const esc = cmds.find((c) => c.name === "wb-escape");
    const display = $("s-shortcut-display");
    if (!display) return;
    if (esc && esc.shortcut) {
      display.textContent = esc.shortcut;
      $("s-shortcut").classList.remove("unset");
    } else {
      display.textContent = "Not set";
      $("s-shortcut").classList.add("unset");
    }
  } catch {}
}

function renderHistory(state, settings) {
  const days = getLastNDays(state, settings, 7);
  const root = $("history");
  // Build only once, then update fills (preserves animation transitions).
  if (root.children.length !== 7) {
    root.innerHTML = days
      .map(
        (_d, i) => `
        <div class="day" data-i="${i}" title="">
          <div class="liquid"></div>
          <div class="day-label"></div>
          <div class="day-pct"></div>
        </div>`,
      )
      .join("");
  }
  const todayKey = days[days.length - 1].key;
  [...root.children].forEach((el, i) => {
    const d = days[i];
    const fill = Math.min(100, d.pct);
    const liquid = el.querySelector(".liquid");
    const color = liquidColor(d.pct);
    liquid.style.setProperty("--liquid-color", color);
    liquid.style.background = color;
    // Defer height update one frame so initial render animates from 0.
    requestAnimationFrame(() => { liquid.style.height = `${fill}%`; });
    el.querySelector(".day-label").textContent = d.label;
    el.querySelector(".day-pct").textContent = `${Math.round(d.pct)}%`;
    el.title = `${d.key} — ${fmtMoney(d.earnings, settings.currency)} (${Math.round(d.pct)}% of goal)`;
    el.classList.toggle("today", d.key === todayKey);
  });
}

function renderLeaderboard(state, settings) {
  const root = $("leaderboard");
  const entries = Object.entries(state.domains || {})
    .map(([domain, v]) => ({ domain, ...v }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 5);
  if (entries.length === 0) {
    root.innerHTML = `<div class="lb-empty">No tracked time yet — visit a tracked site during work hours.</div>`;
    return;
  }
  const max = entries[0].earnings || 1;
  root.innerHTML = entries
    .map((e) => {
      const pct = Math.min(100, (e.earnings / max) * 100);
      return `
        <div class="lb-row">
          <div class="lb-bar" style="width:${pct}%"></div>
          <div class="lb-content">
            <span class="lb-domain">${e.domain}</span>
            <span class="lb-meta">${fmtMoney(e.earnings, settings.currency)} · ${fmtTime(e.seconds)}</span>
          </div>
        </div>`;
    })
    .join("");
}

function showSettings(show) {
  const dash = $("dashboard");
  const settings = $("settings");
  if (show) {
    // Dashboard slides out left, settings slides in from right.
    dash.classList.add("hidden");
    settings.classList.remove("hidden");
    settings.classList.remove("slide-in-left");
    settings.classList.add("slide-in-right");
    $("save-status").textContent = "";
    validate();
  } else {
    settings.classList.add("hidden");
    dash.classList.remove("hidden");
    dash.classList.remove("slide-in-right");
    dash.classList.add("slide-in-left");
    render();
  }
}

async function init() {
  await render();
  chrome.runtime.sendMessage({ type: "wb-tick-now" }, () => render());
  timer = setInterval(() => {
    chrome.runtime.sendMessage({ type: "wb-tick-now" }, () => render());
  }, 1000);

  $("settings-toggle").addEventListener("click", () => {
    const isSettings = !$("settings").classList.contains("hidden");
    showSettings(!isSettings);
  });

  $("settings-back").addEventListener("click", () => showSettings(false));

  $("break-btn").addEventListener("click", async () => {
    const { state } = await getAll();
    await setState({ onBreak: !state.onBreak, lastTickMs: Date.now() });
    render();
  });

  // Live validation + debounced auto-save on every input change.
  ["s-rate", "s-start", "s-end", "s-goal", "s-domains", "s-redirect"].forEach((id) => {
    $(id).addEventListener("input", () => {
      validate();
      scheduleSave();
    });
    $(id).addEventListener("change", () => {
      validate();
      scheduleSave();
    });
  });

  $("reset-btn").addEventListener("click", () => {
    if (!confirm("Reset all tracked stats?")) return;
    chrome.runtime.sendMessage({ type: "wb-reset" }, () => render());
  });

  $("restore-btn").addEventListener("click", async () => {
    if (!confirm("Restore default settings?")) return;
    await setSettings(DEFAULTS.settings);
    render();
    showSettings(true);
  });

  // Shortcut: Chrome MV3 doesn't allow programmatic rebinding for security.
  // The "Change in Chrome" button opens chrome://extensions/shortcuts.
  // The recorder button is a visual preview that also opens that page.
  const openShortcutPage = () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  };
  $("s-shortcut").addEventListener("click", openShortcutPage);
  $("s-shortcut-edit").addEventListener("click", openShortcutPage);

  chrome.storage.onChanged.addListener(render);
}

window.addEventListener("unload", () => {
  if (timer) clearInterval(timer);
  if (saveDebounce) clearTimeout(saveDebounce);
});
init();
