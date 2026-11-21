// Water and meal reminders with the Notification API. Browsers can't schedule
// notifications for a closed web app, so these fire while Elvora is open or
// running in the background.
import * as S from './store.js';

let timer = 0;
const FIRED = 'elvora.reminders.fired';

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

async function notify(title, body, tag) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch {}
  try { new Notification(title, opts); return true; } catch { return false; }
}

function fired() { try { return JSON.parse(sessionStorage.getItem(FIRED) || localStorage.getItem(FIRED) || '{}'); } catch { return {}; } }
function markFired(id) { const f = fired(); f[id] = Date.now(); localStorage.setItem(FIRED, JSON.stringify(f)); }

export function due(now = new Date()) {
  const r = S.get().settings.reminders;
  const out = [];
  const f = fired();
  const key = S.dayKey(now);
  const hhmm = now.getHours() * 60 + now.getMinutes();
  if (r.water && hhmm >= 8 * 60 && hhmm <= 22 * 60) {
    const last = f.water || 0;
    if (Date.now() - last >= r.waterEveryMin * 60000) out.push({ id: 'water', title: 'Water break', body: `You’re at ${(S.day(key).waterMl / 1000).toFixed(1)} L today. Time for a glass.` });
  }
  if (r.meals) {
    for (const t of r.mealTimes) {
      const [hh, mm] = t.split(':').map(Number);
      const at = hh * 60 + mm;
      const id = `meal-${key}-${t}`;
      if (hhmm >= at && hhmm - at < 30 && !f[id]) out.push({ id, title: 'Meal check', body: 'Log what you ate so Elvora can keep your targets on track.' });
    }
  }
  return out;
}

export async function tick() {
  for (const d of due()) if (await notify(d.title, d.body, d.id.split('-')[0])) markFired(d.id);
}

export function start() {
  clearInterval(timer);
  const r = S.get().settings.reminders;
  if (!(r.water || r.meals) || permission() !== 'granted') return;
  timer = setInterval(tick, 60000);
}

export function armWater() { markFired('water'); }

export function test() { return notify('Elvora reminders are on', 'This is how a water or meal reminder will look.', 'test'); }
