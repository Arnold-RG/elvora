"""API security tests. Run from the repo root: python -m pytest api/tests -q
Gemini is never called: _call_gemini is replaced with a stub."""
import importlib
import os

import pytest
from fastapi.testclient import TestClient

APP = "https://elvora-app-preview.onrender.com"
INSTALL = "test-install-0123456789"


def load(dev=False, **env):
    os.environ.update({"GEMINI_API_KEY": "test-key", "ELVORA_SESSION_SECRET": "unit-test-secret", **env})
    os.environ.pop("ALLOWED_ORIGINS", None)
    if dev:
        os.environ["ELVORA_DEV"] = "1"
    else:
        os.environ.pop("ELVORA_DEV", None)
    import api.main as m
    m = importlib.reload(m)

    async def fake(model, turn):
        return "ok", "Drink a glass of water."
    m._call_gemini = fake
    return m


@pytest.fixture()
def api():
    m = load()
    with TestClient(m.app, base_url="https://testserver") as c:
        c.m = m
        yield c


def token(c, ip="81.2.69.7"):
    r = c.post("/api/session", json={"installId": INSTALL}, headers={"Origin": APP, "CF-Connecting-IP": ip})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def coach(c, tok, ip="81.2.69.7", **h):
    return c.post("/api/coach", json={"message": "water?"}, headers={"Origin": APP, "CF-Connecting-IP": ip, "x-elvora-session": tok, **h})


# Blocker A: origin and session
def test_missing_origin_rejected(api):
    assert api.post("/api/coach", json={"message": "hi"}).status_code == 403
    assert api.post("/api/session", json={"installId": INSTALL}).status_code == 403


def test_other_and_localhost_origins_rejected_in_production(api):
    for o in ("https://evil.example", "http://localhost:8080", "http://127.0.0.1:8080"):
        assert api.post("/api/session", json={"installId": INSTALL}, headers={"Origin": o}).status_code == 403


def test_localhost_only_with_dev_flag():
    m = load(dev=True)
    with TestClient(m.app) as c:
        assert c.post("/api/session", json={"installId": INSTALL}, headers={"Origin": "http://localhost:8080"}).status_code == 200


def test_allowed_origin_without_token_is_401(api):
    r = api.post("/api/coach", json={"message": "hi"}, headers={"Origin": APP})
    assert r.status_code == 401 and r.json()["fallback"] is True


def test_forged_tampered_and_expired_tokens_rejected(api):
    good = token(api)
    payload, sig = good.split(".")
    assert coach(api, payload + "." + sig[:-2] + "AA").status_code == 401
    assert coach(api, "e30." + sig).status_code == 401
    old, _ = api.m.make_token(INSTALL, now=0)
    assert coach(api, old).status_code == 401
    assert coach(api, good).status_code == 200


def test_token_signed_with_other_secret_rejected(api):
    tok = token(api)
    m2 = load(ELVORA_SESSION_SECRET="a-different-secret")
    with TestClient(m2.app) as c2:
        assert coach(c2, tok).status_code == 401


def test_session_endpoint_rate_limited(api):
    codes = [api.post("/api/session", json={"installId": INSTALL}, headers={"Origin": APP, "CF-Connecting-IP": "93.184.216.50"}).status_code for _ in range(8)]
    assert codes[:6] == [200] * 6 and codes[6:] == [429, 429]


def test_bad_install_id_rejected(api):
    assert api.post("/api/session", json={"installId": "x"}, headers={"Origin": APP}).status_code == 422


# Blocker B: client IP
def test_spoofed_xff_after_429_still_429(api):
    tok = token(api, ip="81.2.69.20")
    codes = [coach(api, tok, ip="81.2.69.20").status_code for _ in range(5)]
    assert codes == [200] * 5
    assert coach(api, tok, ip="81.2.69.20").status_code == 429
    # same caller, spoofed X-Forwarded-For first hop: the edge's CF-Connecting-IP still identifies it
    assert coach(api, tok, ip="81.2.69.20", **{"X-Forwarded-For": "93.184.216.99, 81.2.69.20"}).status_code == 429


def test_xff_without_cf_uses_rightmost_public_hop(api):
    m = api.m
    from starlette.requests import Request

    def req(xff):
        return Request({"type": "http", "headers": [(b"x-forwarded-for", xff.encode())], "client": ("10.0.0.5", 1)})
    assert m._client_ip(req("93.184.216.99, 81.2.69.20, 10.1.2.3")) == "81.2.69.20"
    assert m._client_ip(req("not-an-ip")) == "10.0.0.5"


def test_session_cap_applies_across_ips(api):
    tok = token(api)
    codes = [coach(api, tok, ip=f"81.2.69.{30 + i}").status_code for i in range(6)]
    assert codes == [200] * 5 + [429]


# Nits
def test_chunked_body_over_limit_is_413_before_gemini(api):
    called = []

    async def spy(model, turn):
        called.append(1)
        return "ok", "x"
    api.m._call_gemini = spy
    tok = token(api)

    def gen():
        for _ in range(10):
            yield b"x" * 1000
    r = api.post("/api/coach", content=gen(), headers={"Origin": APP, "x-elvora-session": tok, "Content-Type": "application/json"})
    assert r.status_code == 413 and not called


def test_security_headers(api):
    r = api.get("/health")
    assert r.json() == {"ok": True, "ai": True}
    assert r.headers["strict-transport-security"].startswith("max-age=31536000")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"


def test_cors_preflight_allows_session_header_for_app_only(api):
    ok = api.options("/api/coach", headers={"Origin": APP, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-elvora-session"})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == APP
    bad = api.options("/api/coach", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert bad.status_code == 403 and "access-control-allow-origin" not in bad.headers


def test_secret_never_returned(api):
    r = coach(api, token(api))
    assert "unit-test-secret" not in r.text and "test-key" not in r.text
