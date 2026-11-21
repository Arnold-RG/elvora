"""Service-worker cache safety tests.

Cache Storage is shared by the whole origin (every project on arnold-rg.github.io), so:
  1. app/sw.js may delete only older 'elvora-*' caches, never anyone else's;
  2. app/flutter_service_worker.js (kill-switch for the old Flutter build) may delete only Flutter caches,
     must reload this app's open tab exactly once, and must not touch tabs of other projects.

Serves a throwaway copy of app/ at /elvora/app/ next to a foreign page at /other/, like GitHub Pages.
Usage: python app-e2e/sw_caches.py   (set CHROME_PATH to use a specific Chromium build)
"""
import asyncio, functools, http.server, json, os, pathlib, re, shutil, sys, tempfile, threading
from playwright.async_api import async_playwright

APP = pathlib.Path(__file__).resolve().parent.parent / 'app'
VERSION = re.search(r"const VERSION = '([^']+)'", (APP / 'sw.js').read_text()).group(1)
FOREIGN = ['twodaymovie-v1', 'arnova-x', 'website-assets']
FLUTTER = ['flutter-app-cache', 'flutter-temp-cache', 'flutter-app-manifest', 'flutter-assets-extra']
OLD_INDEX = "<!doctype html><title>old flutter</title><script>navigator.serviceWorker.register('flutter_service_worker.js?v=1')</script>"
OLD_SW = """self.addEventListener('install', e => e.waitUntil(Promise.all(%s.map(n => caches.open(n)))
  .then(() => caches.open('flutter-app-cache')).then(c => c.addAll(['./', './index.html'])).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));""" % json.dumps(FLUTTER)


def serve(root):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=root))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def put_new_app(root):
    d = pathlib.Path(root) / 'elvora' / 'app'
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(APP, d, copy_function=shutil.copyfile)


async def keys(pg):
    return await pg.evaluate('caches.keys()')


async def t_sw_keeps_foreign(ctx, base):
    pg = await ctx.new_page()
    await pg.goto(base + 'elvora/app/')
    await pg.evaluate("(names) => Promise.all(names.map(n => caches.open(n)))", FOREIGN + ['elvora-v0.9-old'])
    await pg.evaluate("navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready)")
    await pg.wait_for_timeout(1500)
    k = await keys(pg)
    assert all(n in k for n in FOREIGN), ('foreign cache deleted by sw.js', k)
    assert 'elvora-v0.9-old' not in k, ('old elvora cache kept', k)
    assert VERSION in k, ('current cache missing', k)
    return k


async def t_killswitch(ctx, base, root):
    d = pathlib.Path(root) / 'elvora' / 'app'
    shutil.rmtree(d, ignore_errors=True); d.mkdir(parents=True)
    (d / 'index.html').write_text(OLD_INDEX); (d / 'flutter_service_worker.js').write_text(OLD_SW)
    app, other = await ctx.new_page(), await ctx.new_page()
    navs = {'app': 0, 'other': 0}
    await app.goto(base + 'elvora/app/')
    await app.wait_for_function('navigator.serviceWorker.controller !== null', timeout=10000)
    await other.goto(base + 'other/')
    await app.evaluate("(names) => Promise.all(names.map(n => caches.open(n)))", FOREIGN + [VERSION])
    k0 = await keys(app)
    assert all(n in k0 for n in FLUTTER), ('setup: flutter caches missing', k0)
    # count full page loads (hash changes inside the app are not reloads)
    app.on('load', lambda _: navs.__setitem__('app', navs['app'] + 1))
    other.on('load', lambda _: navs.__setitem__('other', navs['other'] + 1))
    put_new_app(root)  # deploy: the old SW URL now serves the kill-switch
    assert await app.title() == 'old flutter'
    await app.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())")
    await app.wait_for_timeout(4000)
    first = dict(navs)
    await app.wait_for_timeout(4000)  # make sure it does not loop
    k = await keys(other)
    regs = await other.evaluate("navigator.serviceWorker.getRegistrations().then(rs => rs.map(r => r.scope))")
    assert navs == first == {'app': 1, 'other': 0}, ('reloads', first, navs)
    assert (await app.title()).startswith('Elvora'), await app.title()
    assert not any(n in k for n in FLUTTER), ('flutter cache kept', k)
    assert all(n in k for n in FOREIGN + [VERSION]), ('non-Flutter cache deleted by kill-switch', k)
    assert not regs, ('registration left', regs)
    return {'caches': k, 'reloads': navs}


async def main():
    root = tempfile.mkdtemp(prefix='elvora-sw-')
    os.makedirs(f'{root}/other'); pathlib.Path(f'{root}/other/index.html').write_text('<!doctype html><title>other project</title>')
    put_new_app(root)
    srv = serve(root); base = f'http://127.0.0.1:{srv.server_address[1]}/'
    ok = True
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None)
        for name, fn in [('sw.js deletes only older elvora-* caches', lambda c: t_sw_keeps_foreign(c, base)),
                         ('kill-switch deletes only Flutter caches, reloads this app once', lambda c: t_killswitch(c, base, root))]:
            ctx = await b.new_context()
            try:
                print('PASS', name, await fn(ctx))
            except Exception as e:
                ok = False; print('FAIL', name, repr(e))
            await ctx.close()
        await b.close()
    srv.shutdown(); shutil.rmtree(root, ignore_errors=True)
    sys.exit(0 if ok else 1)

asyncio.run(main())
