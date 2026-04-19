// Pure logic helpers (testable, no chrome.* calls).

export function hostFromUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function matchesWasteDomain(host, list) {
  if (!host) return null;
  for (const d of list) {
    if (host === d || host.endsWith("." + d)) return d;
  }
  return null;
}

// "HH:MM" -> minutes since midnight
function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function isWithinWorkingHours(now, startStr, endStr) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = toMin(startStr);
  const end = toMin(endStr);
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  // overnight shift
  return mins >= start || mins < end;
}

export function earningsPerSecond(hourlyRate) {
  return hourlyRate / 3600;
}
