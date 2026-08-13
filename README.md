# Delivery Tracker

A phone-first timer for tracking delivery stops, pace, and whether you are on track to finish on time.

## How to use

1. Enter your total **Stops** and optional **Finish by** time.
2. If you already started working, tap **+ TIME** to add those minutes first.
3. Use **+ / −** if the next tap should count as more than one stop.
4. Tap **START**, then tap **DELIVERED** after each stop.

## Controls

- **START / DELIVERED** — start the session and log each stop
- **Hold DELIVERED** — hold to mark a stuck stop (duration is in Settings). The stop still counts toward your remaining total, but its time is left out of Recent, Avg, Best, Rate, and Est. Finish. You get a long buzz, a red SKIPPED flash, and a harsh sound.
- **PAUSE** — freeze the timer (in the header while running)
- **UNDO** — remove the last logged stop
- **RESET** — clear the whole session
- **+ TIME** — add minutes you already worked before starting
- **+ / −** — split the next DELIVERED tap across multiple stops

## Pace and stats

- **Rate** — overall stops per hour (skipped stops are excluded)
- **Avg** — average time per counted stop
- **Best** — fastest counted stop this session
- **Recent** — pace from your last N counted stops (7 by default; change this in Settings)
- **Est. Finish** — when you will finish at your recent pace
- **Need** — the rate required to hit Finish by

Tap any rate (Rate, Recent, or Need) to switch between stops/hour and minutes per stop.

AHEAD / ON TRACK / BEHIND appears when both Stops and Finish by are set.

## Settings

- **Recent deliveries** — show or hide the recent-stop list
- **Recent rate** — how many of your latest counted stops Recent, Est. Finish, and on-track status use
- **Hold to skip** — turn long-press skip on or off
- **Hold duration** — how long you must hold DELIVERED to skip (0.85s by default)
- **Keep screen on** — keep the phone awake while the app is open (on by default; Chrome supports this, iPhone Safari may still sleep)
- **Default finish by** — the Finish by time used when the field is empty and after Reset (3:30 PM by default)
- **Simple layout** — hide extra stats; you can also tap the title
- **Haptics** — vibration on DELIVERED, skip, undo, and other taps

## Other tips

- Tap the **Delivery Tracker** title to switch into a simpler layout.
- Sound and light/dark theme toggles are in the header.
- The timer keeps running if you close the tab or lock your phone (up to 24 hours).

## Run it

Open `index.html` in a browser, or add it to your phone's home screen as a web app.

The browser address bar only hides after you **install** it. Opening a tab in Chrome or Firefox will always show the top bar. Serve the folder over `http` (not `file://`), then:

- **Android Chrome:** menu → **Add to Home screen** / **Install app**. Open it from the home screen.
- **iPhone Safari:** Share → **Add to Home Screen**. Open it from the home screen.

It then launches in standalone mode, like a normal phone app.
