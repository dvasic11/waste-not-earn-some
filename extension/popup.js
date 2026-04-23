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

// ---------- Multi-layer particle system ----------
// Layer A: ambient orbs (ALL tiers, tier 0+) — soft pulsating dots across the whole app.
// Layer B: floating coins (tier 1+) — emoji coins drifting upward.
// Layer C: falling cash bills (tier 2+) — 💵 bills falling from the top with sway.
// Layer D: cash splash bursts — triggered by earnings ticks and tier changes.
let orbsTimer = null;
let coinsTimer = null;
let billsTimer = null;

function getCurrentTier() {
  return Number($("app").dataset.tier) || 0;
}

function spawnOrb() {
  const root = $("particles");
  if (!root) return;
  const tier = getCurrentTier();
  const orb = document.createElement("div");
  orb.className = "orb";
  const size = 4 + Math.random() * (tier >= 4 ? 22 : tier >= 3 ? 16 : tier >= 2 ? 12 : tier >= 1 ? 9 : 7);
  orb.style.width = `${size}px`;
  orb.style.height = `${size}px`;
  orb.style.left = `${Math.random() * 100}%`;
  orb.style.top = `${Math.random() * 100}%`;
  const dur = (tier >= 4 ? 2.5 : tier >= 3 ? 3 : tier >= 2 ? 3.5 : tier >= 1 ? 4 : 5) + Math.random() * 2;
  orb.style.animationDuration = `${dur}s`;
  orb.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
  orb.style.setProperty("--dy", `${-10 - Math.random() * 30}px`);
  // Color tint per tier
  const tint = tier >= 4 ? "rgba(251,191,36,0.95)"
              : tier >= 3 ? "rgba(251,191,36,0.85)"
              : tier >= 2 ? "rgba(134,239,172,0.8)"
              : tier >= 1 ? "rgba(165,180,252,0.75)"
                          : "rgba(203,213,225,0.6)";
  orb.style.background = `radial-gradient(circle at 30% 30%, ${tint}, transparent 70%)`;
  const op = tier >= 4 ? 1 : tier >= 3 ? 0.85 : tier >= 2 ? 0.7 : tier >= 1 ? 0.55 : 0.4;
  orb.style.setProperty("--orb-opacity", String(op));
  root.appendChild(orb);
  setTimeout(() => orb.remove(), dur * 1000 + 200);
}

function spawnGem() {
  const root = $("particles");
  if (!root) return;
  const tier = getCurrentTier();
  if (tier < 4) return;
  const gem = document.createElement("div");
  gem.className = "gem";
  gem.textContent = ["💎", "💍", "👑", "💎", "💎"][Math.floor(Math.random() * 5)];
  gem.style.left = `${Math.random() * 95}%`;
  gem.style.fontSize = `${18 + Math.random() * 14}px`;
  const dur = 3 + Math.random() * 2;
  gem.style.animationDuration = `${dur}s`;
  gem.style.setProperty("--sway", `${(Math.random() - 0.5) * 100}px`);
  root.appendChild(gem);
  setTimeout(() => gem.remove(), dur * 1000 + 200);
}

function spawnSparkle() {
  const root = $("particles");
  if (!root) return;
  const tier = getCurrentTier();
  if (tier < 3) return;
  const sp = document.createElement("div");
  sp.className = "sparkle";
  sp.textContent = ["✨", "⭐", "💫", "✦"][Math.floor(Math.random() * 4)];
  sp.style.left = `${Math.random() * 100}%`;
  sp.style.top = `${Math.random() * 100}%`;
  sp.style.fontSize = `${10 + Math.random() * 14}px`;
  const dur = 0.8 + Math.random() * 0.8;
  sp.style.animationDuration = `${dur}s`;
  root.appendChild(sp);
  setTimeout(() => sp.remove(), dur * 1000 + 100);
}

function spawnCoin() {
  const root = $("particles");
  if (!root) return;
  const tier = getCurrentTier();
  if (tier < 1) return;
  const coin = document.createElement("div");
  coin.className = "coin";
  const symbols = tier >= 4 ? ["💰", "💎", "💸", "🪙", "💵", "👑", "💍", "✨"]
                : tier >= 3 ? ["💰", "💸", "🪙", "💵", "✨", "💎"]
                : tier >= 2 ? ["💸", "💰", "🪙", "✨"]
                            : ["✨", "🪙", "💸"];
  coin.textContent = symbols[Math.floor(Math.random() * symbols.length)];
  coin.style.left = `${Math.random() * 90 + 5}%`;
  const baseDur = tier >= 4 ? 2.5 : tier >= 3 ? 3 : tier >= 2 ? 4 : 5;
  const dur = baseDur + Math.random() * 2;
  coin.style.animationDuration = `${dur}s`;
  coin.style.fontSize = `${(tier >= 4 ? 16 : tier >= 3 ? 14 : 11) + Math.random() * (tier >= 4 ? 14 : 10)}px`;
  coin.style.opacity = tier >= 3 ? "1" : tier >= 2 ? "0.9" : "0.7";
  root.appendChild(coin);
  setTimeout(() => coin.remove(), dur * 1000 + 200);
}

function spawnBill() {
  const root = $("particles");
  if (!root) return;
  const tier = getCurrentTier();
  if (tier < 2) return;
  const bill = document.createElement("div");
  bill.className = "bill";
  bill.textContent = ["💵", "💴", "💶", "💷"][Math.floor(Math.random() * 4)];
  bill.style.left = `${Math.random() * 95}%`;
  bill.style.fontSize = `${14 + Math.random() * (tier >= 4 ? 14 : 8)}px`;
  const dur = (tier >= 4 ? 3 : tier >= 3 ? 4 : 5) + Math.random() * 2;
  bill.style.animationDuration = `${dur}s`;
  bill.style.setProperty("--sway", `${(Math.random() - 0.5) * 80}px`);
  root.appendChild(bill);
  setTimeout(() => bill.remove(), dur * 1000 + 200);
}

// Cash splash burst — quick radial spray from the counter.
// Lightweight: 6-12 pieces depending on tier.
function cashSplash(intensity = 1) {
  const tier = getCurrentTier();
  const amountEl = $("today-amount");
  if (!amountEl) return;
  const rect = amountEl.getBoundingClientRect();
  const appRect = $("app").getBoundingClientRect();
  const cx = rect.left - appRect.left + rect.width / 2;
  const cy = rect.top - appRect.top + rect.height / 2;
  const burst = document.createElement("div");
  burst.className = "splash";
  burst.style.left = `${cx}px`;
  burst.style.top = `${cy}px`;
  const count = Math.min(22, 6 + tier * 3 + intensity * 2);
  const symbols = tier >= 4 ? ["💎", "💰", "💵", "🪙", "👑", "✨", "💍"]
                : tier >= 3 ? ["💵", "💰", "🪙", "✨", "💎"]
                : tier >= 1 ? ["🪙", "✨", "💸"]
                            : ["✨"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "splash-piece";
    piece.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 50 + Math.random() * (50 + tier * 20);
    piece.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    piece.style.setProperty("--sy", `${Math.sin(angle) * dist}px`);
    piece.style.setProperty("--sr", `${(Math.random() - 0.5) * 540}deg`);
    piece.style.fontSize = `${(tier >= 4 ? 14 : 12) + Math.random() * (tier >= 4 ? 12 : 8)}px`;
    burst.appendChild(piece);
  }
  $("app").appendChild(burst);
  setTimeout(() => burst.remove(), 700);
}

function startParticles() {
  // Ambient orbs always on. Other layers self-gate by tier inside spawn fn.
  if (orbsTimer) return;
  const orbInterval = () => {
    const tier = getCurrentTier();
    // Tier 2 intentionally slow + sparse — calm "engagement" feel.
    return tier >= 4 ? 90 : tier >= 3 ? 150 : tier >= 2 ? 900 : tier >= 1 ? 350 : 550;
  };
  const coinInterval = () => {
    const tier = getCurrentTier();
    if (tier < 1) return 99999;
    return tier >= 4 ? 160 : tier >= 3 ? 280 : tier >= 2 ? 1800 : 950;
  };
  const billInterval = () => {
    const tier = getCurrentTier();
    if (tier < 2) return 99999;
    return tier >= 4 ? 220 : tier >= 3 ? 380 : 2200;
  };
  const gemInterval = () => {
    const tier = getCurrentTier();
    if (tier < 4) return 99999;
    return 350 + Math.random() * 200;
  };
  const sparkleInterval = () => {
    const tier = getCurrentTier();
    if (tier < 3) return 99999;
    return tier >= 4 ? 180 : 320;
  };
  const loop = (fn, getDelay) => {
    const tick = () => {
      fn();
      setTimeout(tick, getDelay() + Math.random() * 200);
    };
    tick();
  };
  loop(spawnOrb, orbInterval);
  loop(spawnCoin, coinInterval);
  loop(spawnBill, billInterval);
  loop(spawnGem, gemInterval);
  loop(spawnSparkle, sparkleInterval);
  orbsTimer = coinsTimer = billsTimer = true;
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
      // Big cash splash on tier-up — instant feedback.
      cashSplash(tier);
      if (tier === 4) fireCelebration();
    }
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

  const amountText = fmtMoney(today.earnings, settings.currency);
  const amountEl = $("today-amount");
  if (amountText !== prevAmountText) {
    amountEl.textContent = amountText;
    if (prevAmountText !== "") {
      amountEl.classList.remove("bounce");
      void amountEl.offsetWidth;
      amountEl.classList.add("bounce");
      // Tiny splash on every earnings change — main "reward hit".
      // Tier 0 stays subtle (just bounce); tier 1+ adds particles.
      if (getCurrentTier() >= 1) cashSplash(0);
    }
    prevAmountText = amountText;
  }
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

  applyTier(pct);

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
    const playful = d.pct >= 100
      ? "🏆 Goal smashed!"
      : d.pct >= 75
        ? "You almost made it 😬"
        : d.pct >= 40
          ? "Decent waste 💸"
          : d.pct > 0
            ? "Rookie numbers 😴"
            : "Nothing tracked";
    el.title = `${d.key} — ${fmtMoney(d.earnings, settings.currency)} (${Math.round(d.pct)}% of goal)\n${playful}`;
    el.classList.toggle("today", d.key === todayKey);
    el.classList.toggle("completed", d.pct >= 100);
    el.classList.toggle("near", d.pct >= 75 && d.pct < 100);
    // Star/checkmark overlay on completed days
    let star = el.querySelector(".day-star");
    if (d.pct >= 100) {
      if (!star) {
        star = document.createElement("div");
        star.className = "day-star";
        star.textContent = "⭐";
        el.appendChild(star);
      }
    } else if (star) {
      star.remove();
    }
  });
}

function renderLeaderboard(state, settings) {
  const root = $("leaderboard");
  const entries = Object.entries(state.domains || {})
    .map(([domain, v]) => ({ domain, ...v }))
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 5);
  if (entries.length === 0) {
    root.innerHTML = `<div class="lb-empty">No enemies yet 🎯 — visit a tracked site during work hours.</div>`;
    return;
  }
  const max = entries[0].earnings || 1;
  const medals = ["🥇", "🥈", "🥉"];
  const taglines = ["#1 Time Thief", "Runner-up distraction", "Bronze procrastinator"];
  root.innerHTML = entries
    .map((e, i) => {
      const pct = Math.min(100, (e.earnings / max) * 100);
      const rank = i < 3 ? medals[i] : `#${i + 1}`;
      const rankClass = i < 3 ? `rank-${i + 1}` : "";
      const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(e.domain)}&sz=32`;
      const tagline = i < 3 ? `<span class="lb-tagline">${taglines[i]}</span>` : "";
      return `
        <div class="lb-row ${rankClass}">
          <div class="lb-bar" style="width:0%" data-target="${pct}"></div>
          <div class="lb-content">
            <span class="lb-left">
              <span class="lb-rank">${rank}</span>
              <img class="lb-favicon" src="${favicon}" alt="" onerror="this.style.display='none'" />
              <span class="lb-domain">${e.domain}</span>
              ${tagline}
            </span>
            <span class="lb-meta">${fmtMoney(e.earnings, settings.currency)} · ${fmtTime(e.seconds)}</span>
          </div>
        </div>`;
    })
    .join("");
  // Animate bars growing from 0 -> target
  requestAnimationFrame(() => {
    root.querySelectorAll(".lb-bar").forEach((bar) => {
      bar.style.width = `${bar.dataset.target}%`;
    });
  });
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
  // Kick off ambient particle system immediately — alive even at tier 0.
  startParticles();
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
    const { settings, state } = await getAll();
    const inWork = isWithinWorkingHours(new Date(), settings.workStart, settings.workEnd);
    // If already on break, always allow turning it off.
    if (!state.onBreak && !inWork) {
      const btn = $("break-btn");
      btn.classList.remove("shake");
      void btn.offsetWidth;
      btn.classList.add("shake");
      showToast("🚫 You can't take a break outside working hours");
      return;
    }
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
