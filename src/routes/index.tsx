import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WasteBucks — See how much money you earn while wasting time" },
      {
        name: "description",
        content:
          "A free Chrome extension that tracks how much you earn while procrastinating on YouTube, Instagram, TikTok, X, Reddit and Facebook during your work hours.",
      },
      { property: "og:title", content: "WasteBucks — Money earned while wasting time" },
      {
        property: "og:description",
        content:
          "Live counter, daily goal speedometer, and all-time stats — installed in 30 seconds.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [status, setStatus] = useState<string | null>(null);

  const download = () => {
    setStatus("Preparing download…");
    fetch("/wastebucks.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "wastebucks.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus("Downloaded! Follow the steps below to install.");
      })
      .catch((err) => setStatus(err.message));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💸</span>
            <span className="font-bold tracking-tight">WasteBucks</span>
          </div>
          <a
            href="https://github.com"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            v1.0
          </a>
        </header>

        <main className="mt-16 text-center">
          <span className="inline-block rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Chrome Extension · Manifest V3
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
            See exactly how much money you earn{" "}
            <span className="bg-gradient-to-r from-emerald-500 to-amber-500 bg-clip-text text-transparent">
              while wasting time
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
            Set your hourly rate and working hours. WasteBucks counts every dollar earned while
            you're scrolling YouTube, Instagram, TikTok, X, Reddit and Facebook — and shows your
            daily damage on a live speedometer.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              onClick={download}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:opacity-90"
            >
              ⬇ Download WasteBucks (.zip)
            </button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </div>
        </main>

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: "⏱",
              title: "Real-time tracking",
              body: "Tabs API + idle detection. Counts only during your defined working hours.",
            },
            {
              icon: "🎯",
              title: "Daily goal gauge",
              body: "SVG speedometer fills as your wasted earnings pile up against today's limit.",
            },
            {
              icon: "☕",
              title: "Break mode",
              body: "Toggle 'Taking a break' — every second still counts as wasted earnings.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-5 text-left"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="text-center text-xl font-bold">Install in 30 seconds</h2>
          <ol className="mx-auto mt-6 max-w-xl space-y-3 text-sm text-muted-foreground">
            {[
              "Click the download button above and unzip the file.",
              "Open chrome://extensions in Chrome (or any Chromium browser).",
              "Enable Developer mode (toggle in the top-right corner).",
              "Click Load unpacked and select the unzipped wastebucks folder.",
              "Pin the 💸 icon and open the popup to set your hourly rate.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-border bg-card p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          Permissions used: <code>storage</code>, <code>tabs</code>, <code>alarms</code>,{" "}
          <code>idle</code>. No tracking, no analytics, all data stays on your device.
        </footer>
      </div>
    </div>
  );
}
