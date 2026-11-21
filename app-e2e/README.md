# Elvora web app — end-to-end tests

Playwright (Python) tests for every feature flow in `app/`: navigation, profile targets, food search (USDA) and manual
entry with edit/delete, water, workout logger and templates, steps and activities, recovery check-in and readiness,
weekly charts, reminders, streaks, export/import/wipe, the coach (built-in, Gemini and offline fallback) and the voice orb.
Each test runs in a fresh browser context at 360×640 and 390×844 and checks the data survives a reload.

```bash
pip install playwright && playwright install chromium
python -m http.server 8080 -d app &          # or use the deployed preview URL
python app-e2e/e2e.py http://localhost:8080/
python app-e2e/e2e.py https://elvora-app-preview.onrender.com/ --ai   # adds a real Gemini round trip
```

`sr_stub.js` replaces the browser's speech recogniser with a fixed phrase so the voice flow can run headless.
Results go to `app-e2e/out/results.json` (ignored by git); set `CHROME_PATH` to use a specific Chromium build.
