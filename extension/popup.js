import { getAll, setSettings, setState, getTodayStats, DEFAULTS } from "./storage.js";

const $ = (id) => document.getElementById(id);
const GAUGE_LEN = 251.3;
let timer = null;
let saveDebounce = null;

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

  // Paint errors
  showError("err-rate", errors.rate);
  showError("err-start", errors.start);
  showError("err-end", errors.end);
  showError("err-goal", errors.goal);
  showError("err-domains", errors.domains);

  return { ok: Object.keys(errors).length === 0, rate, start, end, goal, domains };
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

  const pct = settings.dailyGoal > 0
    ? Math.min(100, (today.earnings / settings.dailyGoal) * 100)
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

  // Only refresh inputs when settings panel is hidden — avoids fighting user typing.
  if ($("settings").classList.contains("hidden")) {
    $("s-rate").value = settings.hourlyRate;
    $("s-start").value = settings.workStart;
    $("s-end").value = settings.workEnd;
    $("s-goal").value = settings.dailyGoal;
    $("s-domains").value = settings.wasteDomains.join(", ");
  }
}

function showSettings(show) {
  $("dashboard").classList.toggle("hidden", show);
  $("settings").classList.toggle("hidden", !show);
  if (show) {
    $("save-status").textContent = "";
    validate();
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

  $("break-btn").addEventListener("click", async () => {
    const { state } = await getAll();
    await setState({ onBreak: !state.onBreak, lastTickMs: Date.now() });
    render();
  });

  // Live validation + debounced auto-save on every input change.
  ["s-rate", "s-start", "s-end", "s-goal", "s-domains"].forEach((id) => {
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

  chrome.storage.onChanged.addListener(render);
}

window.addEventListener("unload", () => {
  if (timer) clearInterval(timer);
  if (saveDebounce) clearTimeout(saveDebounce);
});
init();
