"""Elvora web app end-to-end tests. Usage: python e2e.py URL [--ai] [--only t_name,t_name]"""
import asyncio, json, sys, os, re, time, traceback
from playwright.async_api import async_playwright, expect
CH = os.environ.get('CHROME_PATH') or None  # optional: a specific Chromium build
URL = sys.argv[1].rstrip('/') + '/'
SIZES = [(360, 640), (390, 844)]
ONLY = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('E2E_OUT', os.path.join(HERE, 'out')); os.makedirs(OUT, exist_ok=True)
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
SR_STUB = open(os.path.join(HERE, 'sr_stub.js')).read()
expect.set_options(timeout=8000)

def store(pg): return pg.evaluate("JSON.parse(localStorage.getItem('elvora.v1')||'null')")
async def goto(pg, v): await pg.evaluate(f"location.hash='#{v}'"); await pg.wait_for_timeout(250)
async def reload(pg): await pg.reload(); await pg.wait_for_timeout(600)
async def sheet_open(pg): return pg.locator('dialog.sheet[open]')

async def set_profile(pg, ai=False):
    await goto(pg, 'you')
    f = pg.locator('#profileForm')
    await f.locator('[name=name]').fill('Test')
    await f.locator('[name=sex]').select_option('male')
    await f.locator('[name=age]').fill('30')
    await f.locator('[name=heightCm]').fill('180')
    await f.locator('[name=weightKg]').fill('80')
    await f.locator('[name=activity]').select_option('moderate')
    await f.locator('[name=goal]').select_option('muscle')
    await f.locator('button[type=submit]').click()
    if not ai:
        cb = pg.locator('#setAi')
        if await cb.is_checked(): await pg.locator('label:has(#setAi)').click()

# ------------------------------------------------------------------ tests
async def t_nav(pg):
    for tab in ['today', 'diary', 'voice', 'coach', 'you']:
        await pg.click(f'.tab[data-tab={tab}]')
        await expect(pg.locator(f'#view-{tab}')).to_be_visible()
        await expect(pg.locator(f'.tab[data-tab={tab}]')).to_have_attribute('aria-current', 'page')
    await pg.click('.tab[data-tab=today]')
    for page in ['food', 'workout', 'activity', 'recovery', 'progress', 'reminders']:
        await pg.click(f'.hub-tile[data-goto={page}]')
        await expect(pg.locator(f'#view-{page}')).to_be_visible()
        await expect(pg.locator('.tab[data-tab=today]')).to_have_attribute('aria-current', 'page')
        await pg.locator(f'#view-{page} [data-back]').click()
        await expect(pg.locator('#view-today')).to_be_visible()
    boxes = await pg.evaluate("[...document.querySelectorAll('.tab')].map(t=>{const r=t.getBoundingClientRect();return [r.width,r.height]})")
    assert all(w >= 48 and hgt >= 48 for w, hgt in boxes), boxes

async def t_profile(pg):
    await set_profile(pg)
    await expect(pg.locator('#targets')).to_contain_text('2,759 kcal')   # (10*80+6.25*180-5*30+5)*1.55
    await expect(pg.locator('#targets')).to_contain_text('207 g')          # 30% protein
    await expect(pg.locator('#targets')).to_contain_text('2.8 L')          # 80*35
    await reload(pg); await goto(pg, 'you')
    await expect(pg.locator('#profileForm [name=weightKg]')).to_have_value('80')
    await goto(pg, 'today')
    await expect(pg.locator('#rings')).to_contain_text('goal 2,759')

async def t_food_search(pg):
    await set_profile(pg)
    await goto(pg, 'today'); await pg.click('.hub-tile[data-goto=food]')
    await pg.fill('#foodSearch', 'banana raw')
    await expect(pg.locator('#foodResults li').first).to_contain_text('Bananas, raw', timeout=15000)
    await pg.locator('#foodResults li button').first.click()
    sh = await sheet_open(pg)
    await sh.locator('#portionGrams').fill('200')
    await expect(sh.locator('#portionMacros')).to_contain_text('178')       # 89 kcal/100 g
    await sh.locator('button[type=submit]').click()
    await expect(sh).to_have_count(0)
    d = await store(pg)
    meals = list(d['days'].values())[0]['meals']
    assert meals[0]['kcal'] == 178 and meals[0]['grams'] == 200 and meals[0]['fdcId'], meals
    await goto(pg, 'today')
    await expect(pg.locator('#todayMeals')).to_contain_text('Bananas')
    await expect(pg.locator('.ring.kcal .ring-num')).to_have_text('178')
    await reload(pg)
    await expect(pg.locator('#todayMeals')).to_contain_text('178 kcal')
    # recent quick add
    await goto(pg, 'food')
    await pg.locator('#recentFoods li button').first.click()
    await goto(pg, 'today')
    await expect(pg.locator('.ring.kcal .ring-num')).to_have_text('356')

async def t_food_manual_edit_delete(pg):
    await goto(pg, 'food')
    f = pg.locator('#manualFood')
    await f.locator('[name=name]').fill('Rice and beans')
    await f.locator('[name=kcal]').fill('520'); await f.locator('[name=protein]').fill('18')
    await f.locator('[name=carbs]').fill('90'); await f.locator('[name=fat]').fill('8')
    await f.locator('button[type=submit]').click()
    await goto(pg, 'diary')
    await expect(pg.locator('#diaryMeals')).to_contain_text('520 kcal · 18 g P · 90 g C · 8 g F')
    await pg.locator('#diaryMeals button.food-row').first.click()
    sh = await sheet_open(pg)
    await sh.locator('[name=kcal]').fill('480'); await sh.locator('[name=name]').fill('Rice & beans')
    await sh.locator('button[type=submit]').click()
    await expect(pg.locator('#diaryMeals')).to_contain_text('Rice & beans')
    await expect(pg.locator('#diaryTotal')).to_contain_text('480 kcal')
    await reload(pg); await goto(pg, 'diary')
    await expect(pg.locator('#diaryMeals')).to_contain_text('480 kcal')
    await pg.locator('#diaryMeals [aria-label="Delete Rice & beans"]').click()
    await expect(pg.locator('#diaryMeals')).to_contain_text('No meals logged')
    await reload(pg); await goto(pg, 'diary')
    await expect(pg.locator('#diaryMeals')).to_contain_text('No meals logged')

async def t_water(pg):
    await set_profile(pg)
    await goto(pg, 'diary')
    await pg.click('[data-water="250"]'); await pg.click('[data-water="500"]'); await pg.click('[data-water="250"]'); await pg.click('[data-water="-250"]')
    await expect(pg.locator('#waterStat')).to_have_text('750 ml')
    await reload(pg); await goto(pg, 'today')
    await expect(pg.locator('.ring.water .ring-num')).to_have_text('0.8')

async def t_workout(pg):
    await goto(pg, 'workout')
    await pg.locator('.tpl', has_text='Leg Day at Home').click()
    sh = await sheet_open(pg)
    await expect(sh.locator('.ex')).to_have_count(5)
    await sh.locator('[name=minutes]').fill('35')
    await sh.locator('.ex').first.locator('[aria-label="Set 1 weight kg"]').fill('20')
    await sh.locator('.ex').first.locator('button', has_text='Add set').click()
    await expect(sh.locator('.ex').first.locator('.set-row')).to_have_count(4)
    await sh.locator('.ex').nth(4).locator('[aria-label^="Remove"]').first.click()   # remove Calf Raises
    await sh.locator('button[type=submit]').click()
    await expect(pg.locator('#workoutHistory')).to_contain_text('Leg Day at Home')
    await expect(pg.locator('#workoutHistory')).to_contain_text('35 min · 13 sets · 400 kg volume')
    w = (await store(pg))['workouts'][0]
    assert len(w['exercises']) == 4 and w['exercises'][0]['sets'][0] == {'reps': 20, 'kg': 20}, w
    # edit
    await pg.locator('#workoutHistory button.food-row').first.click()
    sh = await sheet_open(pg)
    await sh.locator('[name=wname]').fill('Legs A'); await sh.locator('[name=minutes]').fill('40')
    await sh.locator('button[type=submit]').click()
    await expect(pg.locator('#workoutHistory')).to_contain_text('Legs A')
    await reload(pg); await goto(pg, 'workout')
    await expect(pg.locator('#workoutHistory')).to_contain_text('Legs A')
    await expect(pg.locator('#workoutHistory')).to_contain_text('40 min')
    # custom workout
    await pg.locator('.tpl', has_text='Empty workout').click()
    sh = await sheet_open(pg)
    await sh.locator('button', has_text='Add exercise').click()
    await sh.locator('[aria-label="Exercise name"]').fill('Deadlift')
    await sh.locator('[aria-label="Set 1 reps"]').fill('5'); await sh.locator('[aria-label="Set 1 weight kg"]').fill('100')
    await sh.locator('[name=minutes]').fill('20'); await sh.locator('button[type=submit]').click()
    await expect(pg.locator('#workoutHistory li')).to_have_count(2)
    await expect(pg.locator('#workoutHistory')).to_contain_text('500 kg volume')
    # delete
    await pg.locator('#workoutHistory [aria-label="Delete Workout"]').click()
    await expect(pg.locator('#workoutHistory li')).to_have_count(1)
    await reload(pg); await goto(pg, 'workout')
    await expect(pg.locator('#workoutHistory li')).to_have_count(1)

async def t_activity(pg):
    await set_profile(pg)
    await goto(pg, 'activity')
    await pg.fill('#stepsInput', '8421'); await pg.locator('#stepsForm button').click()
    await expect(pg.locator('#stepsBig')).to_have_text('8,421')
    f = pg.locator('#activityForm')
    await f.locator('[name=type]').select_option('Run'); await f.locator('[name=minutes]').fill('30'); await f.locator('[name=km]').fill('5.2')
    await f.locator('button[type=submit]').click()
    await expect(pg.locator('#activityList')).to_contain_text('30 min · 5.2 km')
    await pg.locator('#activityList button.food-row').first.click()
    sh = await sheet_open(pg)
    await sh.locator('[name=minutes]').fill('32'); await sh.locator('button[type=submit]').click()
    await expect(pg.locator('#activityList')).to_contain_text('32 min')
    await expect(pg.locator('#activeMin')).to_contain_text('32 active min')
    await reload(pg); await goto(pg, 'activity')
    await expect(pg.locator('#activityList')).to_contain_text('32 min')
    await expect(pg.locator('#stepsBig')).to_have_text('8,421')
    await goto(pg, 'today'); await expect(pg.locator('#stepStat')).to_have_text('8,421')
    await goto(pg, 'activity')
    await pg.locator('#activityList [aria-label="Delete Run"]').click()
    await expect(pg.locator('#activityList')).to_contain_text('No activities')

async def t_recovery(pg):
    await goto(pg, 'recovery')
    f = pg.locator('#checkinForm')
    await f.locator('[name=sleepH]').fill('7.5')
    await f.locator('[name=sleepQ]').fill('80')
    await f.locator('[name=stress]').fill('3')
    await f.locator('button[type=submit]').click()
    await expect(pg.locator('#readinessDetail .score')).to_have_text('80')      # repo formula, HRV/RHR excluded
    await expect(pg.locator('#readinessDetail')).to_contain_text('Ready')
    await expect(pg.locator('#readinessDetail')).to_contain_text('Train as planned')
    # a hard training day changes the load component
    await goto(pg, 'workout'); await pg.locator('.tpl', has_text='Empty workout').click()
    sh = await sheet_open(pg)
    await sh.locator('[name=minutes]').fill('40'); await sh.locator('button[type=submit]').click()
    await goto(pg, 'recovery')
    await expect(pg.locator('#readinessDetail .score')).to_have_text('67')
    await expect(pg.locator('#readinessDetail')).to_contain_text('Active recovery')
    await reload(pg); await goto(pg, 'today')
    await expect(pg.locator('#readinessCard .score')).to_have_text('67')
    await expect(pg.locator('#sleepStat')).to_have_text('7.5 h')

async def t_progress(pg):
    await set_profile(pg)
    await goto(pg, 'food')
    for name, kcal, p in [('Oats', 380, 13), ('Chicken & rice', 650, 45)]:
        f = pg.locator('#manualFood')
        await f.locator('[name=name]').fill(name); await f.locator('[name=kcal]').fill(str(kcal)); await f.locator('[name=protein]').fill(str(p))
        await f.locator('button[type=submit]').click()
    await goto(pg, 'diary'); await pg.click('[data-water="500"]')
    await goto(pg, 'progress')
    await pg.fill('#weightInput', '79.4'); await pg.locator('#weightForm button').click()
    await expect(pg.locator('#kcalAvg')).to_have_text('avg 1,030 kcal')
    await expect(pg.locator('#proteinAvg')).to_have_text('avg 58 g')
    await expect(pg.locator('#waterAvg')).to_have_text('avg 0.5 L')
    await expect(pg.locator('#weightNow')).to_have_text('latest 79.4 kg')
    lab = await pg.locator('#chartKcal svg').get_attribute('aria-label')
    assert '1,030 kcal' in lab and 'goal' in lab, lab
    await expect(pg.locator('#chartWeight circle')).to_have_count(1)
    # chart updates live
    await goto(pg, 'food')
    f = pg.locator('#manualFood')
    await f.locator('[name=name]').fill('Yoghurt'); await f.locator('[name=kcal]').fill('120'); await f.locator('[name=protein]').fill('10')
    await f.locator('button[type=submit]').click()
    await goto(pg, 'progress')
    await expect(pg.locator('#kcalAvg')).to_have_text('avg 1,150 kcal')
    await reload(pg); await goto(pg, 'progress')
    await expect(pg.locator('#kcalAvg')).to_have_text('avg 1,150 kcal')
    # weight feeds targets (water goal now 79.4*35)
    await goto(pg, 'you'); await expect(pg.locator('#targets')).to_contain_text('2.8 L')

async def t_reminders(pg):
    await goto(pg, 'reminders')
    await expect(pg.locator('#notifStatus')).to_contain_text('allowed')
    await pg.locator('label:has(#remWater)').click()
    await pg.locator('#remWaterEvery').select_option('90')
    await pg.locator('label:has(#remMeals)').click()
    await pg.locator('#mealTimes [data-meal="1"]').fill('12:30')
    await pg.locator('#mealTimes [data-meal="1"]').dispatch_event('change')
    await pg.click('#notifTest')
    await expect(pg.locator('#toast')).to_have_text('Test reminder sent')
    r = (await store(pg))['settings']['reminders']
    assert r['water'] and r['meals'] and r['waterEveryMin'] == 90 and r['mealTimes'][1] == '12:30', r
    await reload(pg); await goto(pg, 'reminders')
    await expect(pg.locator('#remWater')).to_be_checked()
    await expect(pg.locator('#mealTimes [data-meal="1"]')).to_have_value('12:30')
    due = await pg.evaluate("import('./js/reminders.js').then(m => { localStorage.removeItem('elvora.reminders.fired'); const d=new Date(); d.setHours(12,40,0,0); return m.due(d).map(x=>x.id.split('-')[0]); })")
    assert 'water' in due and 'meal' in due, due

async def t_streak_import_export(pg):
    await goto(pg, 'diary'); await pg.click('[data-water="250"]')
    await goto(pg, 'today'); await expect(pg.locator('#streak')).to_contain_text('1-day streak')
    await goto(pg, 'you')
    async with pg.expect_download() as dl:
        await pg.click('#exportBtn')
    path = await (await dl.value).path()
    exp = json.load(open(path))
    assert exp['app'] == 'elvora' and any(d['waterMl'] == 250 for d in exp['days'].values()), exp
    # add two earlier days to the export and import it back
    keys = await pg.evaluate("(()=>{const z=n=>String(n).padStart(2,'0');return [1,2].map(i=>{const d=new Date();d.setDate(d.getDate()-i);return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`})})()")
    for k in keys: exp['days'][k] = {'meals': [{'id': 'x' + k, 'name': 'Test meal', 'kcal': 400, 'protein': 20}], 'waterMl': 0}
    p2 = os.path.join(OUT, 'import.json'); json.dump(exp, open(p2, 'w'))
    pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.set_input_files('#importFile', p2)
    await expect(pg.locator('#toast')).to_have_text('Data imported')
    await goto(pg, 'today'); await expect(pg.locator('#streak')).to_contain_text('3-day streak')
    await reload(pg); await expect(pg.locator('#streak')).to_contain_text('3-day streak')
    # bad file is rejected without touching data
    bad = os.path.join(OUT, 'bad.json'); open(bad, 'w').write('{"hello":1}')
    await goto(pg, 'you'); await pg.set_input_files('#importFile', bad)
    await expect(pg.locator('#toast')).to_contain_text('not an Elvora export')
    # wipe
    pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.click('#wipeBtn')
    await goto(pg, 'today'); await expect(pg.locator('#streak')).to_contain_text('start a streak')

async def t_coach_builtin(pg):
    await set_profile(pg)   # AI coach off
    await goto(pg, 'diary'); await pg.click('[data-water="500"]'); await pg.click('[data-water="250"]')
    await goto(pg, 'coach')
    await pg.fill('#chatText', 'How much water have I had?'); await pg.press('#chatText', 'Enter')
    await expect(pg.locator('.msg.bot').last).to_contain_text('0.8 L of your 2.8 L goal')
    await expect(pg.locator('.msg-src').last).to_have_text('Built-in coach')
    await reload(pg); await goto(pg, 'coach')
    await expect(pg.locator('.msg.bot').last).to_contain_text('0.8 L')

async def t_coach_ai(pg):
    await set_profile(pg, ai=True)
    await goto(pg, 'diary'); await pg.click('[data-water="500"]'); await pg.click('[data-water="250"]')
    await goto(pg, 'coach')
    await pg.fill('#chatText', 'How much water have I had today and how much is left?'); await pg.press('#chatText', 'Enter')
    await expect(pg.locator('.msg.bot:not(.typing)').last).to_be_visible(timeout=60000)
    txt = await pg.locator('.msg.bot').last.inner_text()
    src = (await store(pg))['chat'][-1].get('src')
    assert src == 'ai', ('not AI', src, txt)
    assert re.search(r'750|0\.75|0\.8|2,?050|2\.05|2\.1', txt), txt
    return txt

async def t_coach_fallback(pg):
    await set_profile(pg, ai=True)
    await pg.route('**/api/coach', lambda r: r.abort())
    await goto(pg, 'coach')
    await pg.fill('#chatText', 'Protein check'); await pg.press('#chatText', 'Enter')
    await expect(pg.locator('.msg-src').last).to_have_text('Offline coach — the AI coach was unavailable', timeout=20000)
    await expect(pg.locator('.msg.bot').last).to_contain_text('of 207 g protein')
    await pg.unroute('**/api/coach')
    await pg.route('**/api/coach', lambda r: r.fulfill(status=429, content_type='application/json', body='{"ok":false,"fallback":true,"reason":"rate_limited"}'))
    await pg.fill('#chatText', 'How much water today?'); await pg.press('#chatText', 'Enter')
    await expect(pg.locator('.msg-src')).to_have_count(2, timeout=20000)

async def t_voice(pg):
    await set_profile(pg, ai='--ai' in sys.argv)
    await pg.click('.tab[data-tab=voice]')
    seen = []
    await pg.click('#orbButton')
    for _ in range(400):
        s = await pg.evaluate("document.querySelector('[data-orb=main]').dataset.orbState")
        if not seen or seen[-1] != s: seen.append(s)
        if s == 'idle' and 'speaking' in seen: break
        await pg.wait_for_timeout(100)
    assert seen[-4:] == ['listening', 'thinking', 'speaking', 'idle'], seen
    await expect(pg.locator('#voiceReply')).not_to_be_empty()

MIC_SPY = """(() => {
  window.__tracks = [];
  const md = navigator.mediaDevices; const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => { const s = await orig(c); window.__tracks.push(...s.getTracks()); return s; };
  // a recogniser that keeps listening until stopped, so the page can be hidden mid-listen
  class OpenSR { start() { setTimeout(() => { this.onspeechstart && this.onspeechstart(); this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'how much water' }], { isFinal: false })] }); }, 300); } stop() { this.onend && this.onend(); } abort() { this.stop(); } }
  window.SpeechRecognition = window.webkitSpeechRecognition = OpenSR;
})();"""
HIDE = """(hidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}"""
async def mic_tracks(pg): return await pg.evaluate("window.__tracks.map(t => t.readyState)")
async def start_listening(pg):
    before = len(await mic_tracks(pg))
    await pg.click('#orbButton')
    for _ in range(50):
        if len(await mic_tracks(pg)) > before and await pg.evaluate("document.querySelector('#view-voice').dataset.state") == 'listening': return
        await pg.wait_for_timeout(100)
    raise AssertionError('never started listening')

async def t_mic_released_on_hide(pg):
    await pg.click('.tab[data-tab=voice]')
    await start_listening(pg)
    assert (await mic_tracks(pg))[-1] == 'live', ('not live while listening', await mic_tracks(pg))
    await expect(pg.locator('#orbButton')).to_have_attribute('aria-pressed', 'true')
    await expect(pg.locator('#transcript')).to_contain_text('how much water')   # half a question heard
    await pg.evaluate("window.__states = []; new MutationObserver(() => window.__states.push(document.querySelector('#view-voice').dataset.state)).observe(document.querySelector('#view-voice'), { attributes: true, attributeFilter: ['data-state'] })")
    await pg.evaluate(HIDE, True)                       # app switched away / screen locked
    await pg.wait_for_timeout(200)
    st = await mic_tracks(pg)
    assert st and all(x == 'ended' for x in st), ('after visibilitychange', st)
    await expect(pg.locator('#view-voice')).to_have_attribute('data-state', 'idle')
    await pg.wait_for_timeout(800)   # a half-heard question must not start an answer after the page was hidden
    states = await pg.evaluate("window.__states")
    assert states[-1:] == ['idle'] and 'thinking' not in states[1:] and 'speaking' not in states, ('state after hide', states)
    await pg.evaluate(HIDE, False)
    await start_listening(pg)
    assert (await mic_tracks(pg))[-1] == 'live', ('not live while listening', await mic_tracks(pg))
    await pg.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))")   # page unloaded / bfcache
    await pg.wait_for_timeout(200)
    st = await mic_tracks(pg)
    assert all(x == 'ended' for x in st), ('after pagehide', st)
t_mic_released_on_hide.init = MIC_SPY

async def t_wipe(pg):
    await set_profile(pg)
    await goto(pg, 'diary'); await pg.click('[data-water="250"]')
    await pg.evaluate("caches.open('elvora-v-test').then(c => c.put('./probe', new Response('x')))")
    await pg.evaluate("localStorage.setItem('elvora.reminders.fired', '{}')")
    assert await pg.evaluate("localStorage.getItem('elvora.v1')") is not None
    await goto(pg, 'you')
    pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.click('#wipeBtn')
    await expect(pg.locator('#toast')).to_have_text('All data deleted')
    await pg.wait_for_timeout(500)
    left = await pg.evaluate("Promise.all([caches.keys(), Object.keys(localStorage).filter(k => k.startsWith('elvora'))])")
    assert left == [[], []], left
    await reload(pg)
    assert await pg.evaluate("localStorage.getItem('elvora.v1')") is None, 'key re-created on reload'
    await goto(pg, 'today'); await expect(pg.locator('.ring.water .ring-num')).to_have_text('0.0')

async def t_skip_link(pg):
    await pg.keyboard.press('Tab'); await pg.wait_for_timeout(400)
    assert await pg.evaluate("document.activeElement.id") == 'skipLink'
    box = await pg.locator('#skipLink').bounding_box()
    assert box['y'] >= 0 and box['height'] >= 44, box
    await pg.keyboard.press('Enter')
    assert await pg.evaluate("document.activeElement.id") == 'main'
    ring = await pg.evaluate("(()=>{const s=getComputedStyle(document.querySelector('#main'));return [s.outlineStyle, s.outlineWidth]})()")
    assert ring[0] == 'solid' and ring[1] != '0px', ('no focus ring on main', ring)
    for v, sel in [('voice', '.fine .link.inline'), ('you', 'a[href="privacy.html"]'), ('you', '.foot a'), ('food', '.cite a')]:
        await goto(pg, v)
        b = await pg.locator(sel).bounding_box()
        if sel == '.cite a': assert b, ('missing', sel)  # must exist on every screen size (the voice hint is hidden on short screens by design, so it is not required)
        if b: assert b['height'] >= 24 and b['width'] >= 24, (sel, b)

TESTS = [('Navigation & 5-tab bar', t_nav), ('Profile & targets', t_profile), ('Food search (USDA) + portion + recent', t_food_search),
         ('Manual food, edit, delete', t_food_manual_edit_delete), ('Water log', t_water), ('Workout logger & templates', t_workout),
         ('Steps & activity log', t_activity), ('Recovery check-in & readiness', t_recovery), ('Weekly progress charts & weight', t_progress),
         ('Reminders (Notification API)', t_reminders), ('Streaks + export/import/wipe', t_streak_import_export),
         ('Coach (built-in) uses logged data', t_coach_builtin), ('Coach fallback when API down / 429', t_coach_fallback),
         ('Voice orb states', t_voice),
         ('Mic released when app hidden / page hidden (pagehide)', t_mic_released_on_hide), ('Delete all data (key + caches)', t_wipe), ('Skip link and tap targets', t_skip_link)]
if '--ai' in sys.argv: TESTS.append(('Coach (Gemini) uses logged data', t_coach_ai))

async def main():
    results = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, args=ARGS)
        for w, hgt in SIZES:
            size = f'{w}x{hgt}'
            for name, fn in TESTS:
                if ONLY and fn.__name__ not in ONLY: continue
                ctx = await b.new_context(viewport={'width': w, 'height': hgt}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                          permissions=['microphone', 'notifications'], accept_downloads=True)
                await ctx.add_init_script(SR_STUB)
                if getattr(fn, 'init', None): await ctx.add_init_script(fn.init)
                pg = await ctx.new_page()
                errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(URL + '#today'); await pg.wait_for_timeout(500)
                t0 = time.time()
                try:
                    extra = await fn(pg)
                    if errs: raise AssertionError('page errors: ' + '; '.join(errs))
                    results[f'{size} | {name}'] = ('PASS', round(time.time() - t0, 1), extra)
                except Exception as e:
                    await pg.screenshot(path=f'{OUT}/FAIL-{size}-{fn.__name__}.png')
                    results[f'{size} | {name}'] = ('FAIL', round(time.time() - t0, 1), str(e).split('\n')[0][:300] + (' ' + '\n'.join(str(e).split('\n')[1:6]) if 'Locator' in str(e) else ''))
                print(f"{results[f'{size} | {name}'][0]:4} {size} {name} ({results[f'{size} | {name}'][1]}s)" + ('' if results[f'{size} | {name}'][0] == 'PASS' else f"\n     {results[f'{size} | {name}'][2]}"), flush=True)
                await ctx.close()
        await b.close()
    json.dump(results, open(f'{OUT}/results.json', 'w'), indent=1)
    print('passed', sum(1 for v in results.values() if v[0] == 'PASS'), 'of', len(results))
asyncio.run(main())
