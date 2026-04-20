# 💸 Wastebuck

**"Get paid for the time you'd waste anyway."**

Wastebuck is a powerful, yet playful Chrome Extension designed for the modern employee. It tracks your earnings in real-time while you're navigating non-work related websites, attending unproductive meetings, or enjoying your well-deserved break.

Think of it as a **virtual side hustle meter**—the longer you slack off, the higher your "earnings" climb. Perfect for those moments when you're clocking in but not exactly clocking in *productively*.

---

## ✨ Key Features

- **💰 Real-Time Earnings Tracker:** Watch your bank balance grow second-by-second based on your specific salary.
- **🕒 Smart Work Configuration:** Easily set your hourly rate, daily working hours, and currency.
- **⏸️ Break Mode & Override:** Manually trigger tracking when you're away from your desk or stuck in a "this could have been an email" meeting.
- **🌐 Domain Detection:** Automatically starts the "waste timer" when you visit pre-defined domains (YouTube, Reddit, etc.).
- **🚀 Goal Speedometer:** Set a daily "slacking goal" (e.g., earn $20 while slacking) and watch the speedometer hit the red zone.
- **🕵️ Stealth Mode:** Minimalist UI that looks like a generic system utility to keep your side-hustle private.
- **📊 Last 7 Days Progress Visualization:** View a 7-day history with dynamic visual squares filled with green liquid, showing your daily goal completion percentage at a glance.
- **📈 Percentage Completion Display:** See exact goal completion percentages (e.g., "73%") for each day to track precise performance.
- **🔥 Daily Streak Tracker:** Track consecutive days of 100% goal completion with a prominent streak counter to encourage consistency and habit-building.
- **⬅️ Improved Settings Navigation:** Navigate back to the main screen with an intuitive back button instead of re-clicking the settings icon.
- **⚡ Productivity Escape Shortcut:** Customize a keyboard shortcut to instantly switch from time-wasting sites to productive alternatives (Gmail, custom URLs, etc.).
- **🏆 Time-Wasted Leaderboard:** Identify your biggest distractions with a ranked leaderboard showing which websites/apps consume the most of your unproductive time.

---

## 🛠️ Tech Stack

- **Manifest V3:** The latest Chrome Extension standard for better security and performance.
- **Vanilla JavaScript:** Fast, lightweight, and dependency-free.
- **Chrome Storage API:** Saves your settings and accumulated earnings locally on your machine.
- **Tailwind CSS:** For a sleek, modern, and responsive interface.

---

## 🚀 Setup & Installation

Follow these steps to get **Wastebuck** running in your browser:

1. **Download the Project:**
   - Clone the "extension" folder from this repo as a ZIP file and extract it locally.
2. **Open Chrome Extensions:**
   - Navigate to `chrome://extensions/` in your Google Chrome browser.
3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top right corner.
4. **Load the Extension:**
   - Click the **Load unpacked** button.
   - Select the folder containing the `manifest.json` file.
5. **Pin Wastebuck:**
   - Click the puzzle icon in your toolbar and pin **Wastebuck** for quick access.

---

## 📖 How to Use

1. **Initial Setup:** Open the extension popup and enter your **Hourly Salary** and **Currency**.
2. **Define Your Goals:** Set a daily goal for how much you'd like to "earn" during idle time.
3. **Configure Domains:** Add websites that should trigger the timer automatically (e.g., `reddit.com`).
4. **Tracking Logic:**
   - The app calculates earnings per second: `(Hourly Rate / 3600)`. 
   - **Auto-mode:** Activates when a blacklisted domain is the active tab.
   - **Manual-mode:** Use the "Start Slacking" button for meetings or coffee breaks.

---

## 📂 Folder Structure

```text
wastebuck/
├── manifest.json         # Extension metadata and permissions
├── popup.html            # Main UI of the extension
├── popup.js              # Tracking logic and storage handling
├── style.css             # Custom styling and Tailwind build
├── icons/                # Extension icons (16, 48, 128)
└── assets/               # Screenshots and branding
```