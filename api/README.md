# Elvora coach API (`api/`)

A small FastAPI service for the web app's AI coach. It has one endpoint,
`POST /api/coach`. The endpoint takes the user's message plus the few numbers
the app already computes (targets, today's totals and the readiness score) and
returns a short reply from Google Gemini.

- Model: `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite` if the first is out of quota. Set them with `GEMINI_MODELS`.
- The key comes only from the `GEMINI_API_KEY` env var. It's sent in a request header, never logged and never returned.
- CORS plus a server-side Origin check, using `ALLOWED_ORIGINS`.
- Rate limits stay under the free tier: 6 a minute per IP, 12 a minute overall and 450 a day overall (reset at Pacific midnight, like Gemini's quota).
- 4 KB body limit, validated fields and a 12 s upstream timeout.
- When it's rate-limited, out of quota, times out or hits an error, it returns `{"ok": false, "fallback": true}` and the app answers with its built-in coach.
- The system prompt lives in `prompt.py`. It keeps Elvora to fitness and nutrition, rules out diagnosis and refuses prompt injection.

The user's text is never logged.

```sh
pip install -r api/requirements.txt
GEMINI_API_KEY=... uvicorn api.main:app --port 8000   # run from the repo root
```

Why not `backend/`? `backend/` is the planned modular monolith, and its auth,
billing and other endpoints are still stubs. Deploying it publicly would expose
those stubs, so the coach runs as its own small service.
