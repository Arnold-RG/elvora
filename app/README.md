# Elvora web app (`app/`)

A from-scratch, mobile-first rebuild of the Elvora member app as an installable
Progressive Web App. It lives beside the Flutter project (`lib/`) and doesn't
replace or change it.

## What it does

- **Today:** calorie, protein and water rings against your targets, sleep, and today’s meals.
- **Diary:** a 7-day strip; log meals (name, kcal, protein), water and sleep.
- **Elvora (centre button):** the live voice orb. Tap to talk, and Elvora answers out loud.
- **Coach:** a text chat with the same on-device coach.
- **You:** profile and targets, settings, privacy, data export and delete.

Targets use the same formulas as `lib/core/utils/fitness_calculator.dart`:
Mifflin–St Jeor × activity level, the macro split by goal, 35 ml of water per kg,
and the step goal by activity level. Coach replies are ported from
`lib/core/intelligence/coach_knowledge.dart` and use only what you logged.
Readiness, step counting, watch pairing and training plans aren’t in the web
app yet. Those screens show honest empty states.

## Voice orb

`js/orb.js` draws the orb in WebGL (a fragment shader), falls back to Canvas 2D,
and then to a CSS-only orb. It has these states:

| State | Driven by |
| --- | --- |
| idle | a slow drift |
| listening | the live mic level (Web Audio `AnalyserNode`) |
| thinking | a short pulse while the reply is composed |
| speaking | word-boundary events from `speechSynthesis`, or a timed word reveal when speech is off or unavailable |

The orb renders at the device pixel ratio, up to 3×, and lowers its resolution
on slow devices. It pauses when it's off-screen or the tab is hidden, and
honours `prefers-reduced-motion` along with an in-app toggle.

## Privacy and security

- No accounts, no analytics, no third-party requests. Data is kept in `localStorage` on the device.
- The microphone opens only after a tap and is released when listening ends. Audio is never recorded.
- Speech-to-text comes from the browser (Chrome uses Google’s service, and Safari may use Apple’s). This is disclosed in the app and in `privacy.html`.
- A strict CSP via meta tag: `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, no inline script or style.
- No secrets in the repo. The web app needs none.

## Run locally

```sh
cd app
python3 -m http.server 8080   # then open http://localhost:8080
```

There's no build step. The service worker registers only over HTTPS.

## Deploy (static)

Publish the `app/` directory as-is (for example a Render static site with
publish path `app` and an empty build command).
