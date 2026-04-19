import { getAll, setSettings, setState, getTodayStats, DEFAULTS } from "./storage.js";

const $ = (id) => document.getElementById(id);
const GAUGE_LEN = 251.3; // path length of the half-circle
let timer = null;

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
  // needle: -90deg (left) at 0%, +90deg (right) at 100%
  const angle = -90 + (180 * pct) / 100;
  $("needle").setAttribute("transform", `rotate(${angle} 100 110)`);

  // status line
  let status = "Idle — not in working hours or no time-waster open";
  if (state.onBreak) status = "☕ On break — every second still counts";
  else if (state.activeDomain) status = `Tracking ${state.activeDomain} 💸`;
  $("status-line").textContent = status;

  const breakBtn = $("break-btn");
  breakBtn.textContent = state.onBreak ? "▶ Continue work" : "☕ Take a break";
  breakBtn.classList.toggle("on", !!state.onBreak);

  // settings inputs
  $("s-rate").value = settings.hourlyRate;
  $("s-start").value = settings.workStart;
  $("s-end").value = settings.workEnd;
  $("s-goal").value = settings.dailyGoal;
  $("s-domains").value = settings.wasteDomains.join(", ");
}

function showSettings(show) {
  $("dashboard").classList.toggle("hidden", show);
  $("settings").classList.toggle("hidden", !show);
}

async function init() {
  await render();
  // ask background for an immediate tick so the popup feels live
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
    await setState({ onBreak: !state.onBreak });
    render();
  });

  $("save-btn").addEventListener("click", async () => {
    const domains = $("s-domains").value
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean);
    await setSettings({
      hourlyRate: Number($("s-rate").value) || 0,
      workStart: $("s-start").value || DEFAULTS.settings.workStart,
      workEnd: $("s-end").value || DEFAULTS.settings.workEnd,
      dailyGoal: Number($("s-goal").value) || 0,
      wasteDomains: domains.length ? domains : DEFAULTS.settings.wasteDomains,
    });
    showSettings(false);
    render();
  });

  $("reset-btn").addEventListener("click", () => {
    if (!confirm("Reset all tracked stats?")) return;
    chrome.runtime.sendMessage({ type: "wb-reset" }, () => render());
  });

  chrome.storage.onChanged.addListener(render);
}

window.addEventListener("unload", () => { if (timer) clearInterval(timer); });
init();
