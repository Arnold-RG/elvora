import { Orb, setReducedMotion } from './orb.js';
import { Voice } from './voice.js';
import { answer, SUGGESTIONS } from './coach.js';
import * as S from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABS = ['today', 'diary', 'voice', 'coach', 'you'];
const STATE_TEXT = { idle: 'Tap the orb to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Elvora is speaking' };

let current = null;
let diaryDay = S.dayKey();

/* ---------------- motion ---------------- */
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
function applyMotion() {
  const pref = S.get().settings.reduceMotion;
  const reduce = pref == null ? mq.matches : pref;
  document.documentElement.classList.toggle('reduce-motion', reduce);
  setReducedMotion(reduce);
  $('#setMotion').checked = reduce;
}
mq.addEventListener?.('change', applyMotion);

/* ---------------- orbs ---------------- */
const orbs = {};
function mountOrbs() {
  for (const slot of $$('.orb-slot')) {
    const kind = slot.dataset.orb;
    orbs[kind] = new Orb(slot, { fps: kind === 'main' ? 60 : 30, maxDpr: kind === 'main' ? 2.5 : 3 });
  }
}
function setOrbState(state) {
  Object.values(orbs).forEach((o) => o.setState(state));
  $('#view-voice').dataset.state = state;
  $('#voiceState').textContent = STATE_TEXT[state];
  $('#orbButton').setAttribute('aria-label', state === 'listening' ? 'Stop listening' : state === 'speaking' ? 'Stop Elvora speaking' : 'Start talking to Elvora');
}

/* ---------------- voice ---------------- */
const voice = new Voice({
  onState: setOrbState,
  onTranscript: (text, final) => { $('#transcript').textContent = text ? `“${text}”` : ''; },
  onNotice: (msg) => showNotice(msg),
});
Object.values(orbs).forEach((o) => { o.levelSource = () => voice.level(); });

function showNotice(msg) {
  const n = $('#voiceNotice');
  n.textContent = msg; n.hidden = !msg;
}

async function respond(question) {
  if (!question) return;
  showNotice('');
  $('#transcript').textContent = `“${question}”`;
  voice.set('thinking');
  const reply = answer(question);
  S.pushChat('user', question);
  S.pushChat('bot', reply);
  renderChat();
  await new Promise((r) => setTimeout(r, 450));
  const box = $('#voiceReply');
  box.replaceChildren();
  const words = reply.split(/(\s+)/);
  const spans = [];
  for (const w of words) {
    if (/^\s+$/.test(w)) box.append(w);
    else if (w) { const s = document.createElement('span'); s.className = 'w'; s.textContent = w; box.append(s); spans.push(s); }
  }
  await voice.speak(reply, {
    enabled: S.get().settings.speak,
    onWord: (i) => { for (let k = 0; k < Math.min(i, spans.length); k++) spans[k].classList.add('on'); },
  });
}

async function orbTap() {
  if (voice.state === 'listening') { voice.stopListening(); return; }
  if (voice.state === 'speaking' || voice.state === 'thinking') { voice.stopAll(); return; }
  showNotice('');
  $('#voiceReply').replaceChildren();
  $('#transcript').textContent = '';
  const text = await voice.listen();
  if (text) respond(text);
}

/* ---------------- router ---------------- */
function go(tab, { focus = false } = {}) {
  if (!TABS.includes(tab)) tab = 'today';
  if (tab === current) return;
  if (current === 'voice' && tab !== 'voice') voice.stopAll();
  current = tab;
  for (const v of $$('.view')) v.hidden = v.dataset.view !== tab;
  for (const a of $$('.tab')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  moveIndicator();
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  window.scrollTo(0, 0);
  if (focus) $('#main').focus({ preventScroll: true });
  if (tab === 'coach') renderChat();
}
function moveIndicator() {
  const ind = $('#tabIndicator');
  const a = $(`.tab[data-tab="${current}"]`);
  if (!a || current === 'voice') { ind.classList.add('off'); return; }
  ind.classList.remove('off');
  const bar = $('.tabbar-glass').getBoundingClientRect();
  const r = a.getBoundingClientRect();
  const w = Math.min(r.width - 6, 72);
  ind.style.setProperty('width', `${w}px`);
  ind.style.setProperty('--ix', `${r.left - bar.left + (r.width - w) / 2}px`);
}
window.addEventListener('resize', moveIndicator);
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* ---------------- render: today ---------------- */
function ring(cls, label, val, goal, unit, fmt = (v) => Math.round(v).toLocaleString()) {
  const C = 2 * Math.PI * 40;
  const pct = goal ? Math.min(1, val / goal) : 0;
  const wrap = document.createElement('div');
  wrap.className = `ring ${cls}`;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  for (const k of ['track', 'val']) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '40');
    c.setAttribute('class', k);
    if (k === 'val') { c.setAttribute('stroke-dasharray', String(C)); c.setAttribute('stroke-dashoffset', String(C * (1 - pct))); }
    svg.append(c);
  }
  const rw = document.createElement('div'); rw.className = 'ring-wrap'; rw.append(svg);
  const center = document.createElement('div'); center.className = 'ring-center';
  const num = document.createElement('b'); num.className = 'ring-num'; num.textContent = fmt(val);
  const unitEl = document.createElement('small'); unitEl.textContent = unit;
  center.append(num, unitEl); rw.append(center);
  const lbl = document.createElement('div'); lbl.className = 'ring-lbl';
  lbl.textContent = goal ? `${label} · goal ${fmt(goal)}` : label;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', goal ? `${label}: ${fmt(val)} of ${fmt(goal)} ${unit}` : `${label}: ${fmt(val)} ${unit}, no target set`);
  wrap.append(rw, lbl);
  return wrap;
}

function mealItem(m, key, removable) {
  const li = document.createElement('li');
  const name = document.createElement('span'); name.className = 'meal-name'; name.textContent = m.name;
  const meta = document.createElement('span'); meta.className = 'meal-meta';
  meta.textContent = `${Math.round(m.kcal)} kcal${m.protein ? ` · ${m.protein} g P` : ''}`;
  li.append(name, meta);
  if (removable) {
    const b = document.createElement('button');
    b.className = 'icon-btn ghost'; b.type = 'button'; b.setAttribute('aria-label', `Delete ${m.name}`);
    b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>';
    b.addEventListener('click', () => S.removeMeal(key, m.id));
    li.append(b);
  }
  return li;
}
function emptyItem(text) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; return li; }

function renderToday() {
  const now = new Date();
  $('#todayDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const h = now.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.get().profile?.name?.trim();
  $('#greeting').textContent = name ? `${part}, ${name}` : part;

  const t = S.targets();
  const d = S.totals();
  $('#rings').replaceChildren(
    ring('kcal', 'Calories', d.kcal, t?.kcal, 'kcal'),
    ring('protein', 'Protein', d.proteinG, t?.proteinG, 'g'),
    ring('water', 'Water', d.waterMl / 1000, t ? t.waterMl / 1000 : null, 'L', (v) => v.toFixed(1)),
  );
  $('#targetsHint').hidden = !!t?.kcal;
  $('#sleepStat').textContent = d.sleepH == null ? '—' : `${d.sleepH} h`;
  $('#sleepNote').textContent = d.sleepH == null ? 'Log last night in Diary' : d.sleepH < 6.5 ? 'Short night — keep today moderate' : 'Logged for today';
  $('#stepNote').textContent = t ? `Goal ${t.steps.toLocaleString()} · counting needs the phone app` : 'Step counting needs the phone app';
  const list = $('#todayMeals');
  const meals = S.day().meals;
  list.replaceChildren(...(meals.length ? meals.map((m) => mealItem(m, S.dayKey(), false)) : [emptyItem('Nothing logged yet today.')]));
}

/* ---------------- render: diary ---------------- */
function renderDiary() {
  const strip = $('#dayStrip');
  strip.replaceChildren();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = S.dayKey(d);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'day'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(key === diaryDay));
    b.setAttribute('aria-label', d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
    const dd = S.day(key);
    if (dd.meals.length || dd.waterMl || dd.sleepH != null) b.classList.add('has');
    b.innerHTML = '<small></small><b></b><span class="dot"></span>';
    b.querySelector('small').textContent = i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);
    b.querySelector('b').textContent = d.getDate();
    b.addEventListener('click', () => { diaryDay = key; renderDiary(); });
    strip.append(b);
  }
  const dd = S.day(diaryDay);
  const tot = S.totals(diaryDay);
  $('#diaryMeals').replaceChildren(...(dd.meals.length ? dd.meals.map((m) => mealItem(m, diaryDay, true)) : [emptyItem('No meals logged for this day.')]));
  $('#diaryTotal').textContent = dd.meals.length ? `Total ${tot.kcal.toLocaleString()} kcal · ${Math.round(tot.proteinG)} g protein` : '';
  const t = S.targets();
  $('#waterStat').textContent = `${tot.waterMl.toLocaleString()} ml`;
  $('#waterGoalNote').textContent = t ? `Goal ${t.waterMl.toLocaleString()} ml` : 'Add weight in You for a goal';
  $('#waterBar').style.setProperty('width', `${t ? Math.min(100, (tot.waterMl / t.waterMl) * 100) : 0}%`);
  $('#sleepInput').value = dd.sleepH ?? '';
}

/* ---------------- render: coach ---------------- */
function renderChat() {
  const chat = $('#chat');
  const msgs = S.get().chat.slice(-40);
  if (!msgs.length) {
    const p = document.createElement('p'); p.className = 'chat-empty';
    p.textContent = 'Ask Elvora about your food, water, sleep or whether to train. Answers use what you’ve logged on this device.';
    chat.replaceChildren(p);
  } else {
    chat.replaceChildren(...msgs.map((m) => { const d = document.createElement('div'); d.className = `msg ${m.role}`; d.textContent = m.text; return d; }));
  }
  if (current === 'coach') requestAnimationFrame(() => chat.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
}
function renderSuggest() {
  $('#suggest').replaceChildren(...SUGGESTIONS.map((q) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = q;
    b.addEventListener('click', () => sendChat(q));
    return b;
  }));
}
function sendChat(q) {
  q = q.trim(); if (!q) return;
  S.pushChat('user', q);
  S.pushChat('bot', answer(q));
  renderChat();
}

/* ---------------- render: you ---------------- */
function renderYou() {
  const p = S.get().profile || {};
  const f = $('#profileForm');
  for (const k of ['name', 'sex', 'age', 'heightCm', 'weightKg', 'activity', 'goal']) if (p[k] != null && f.elements[k]) f.elements[k].value = p[k];
  const t = S.targets();
  const dl = $('#targets');
  const rows = t ? [
    ['Calories', t.kcal ? `${t.kcal.toLocaleString()} kcal` : '—'],
    ['Protein', t.proteinG ? `${t.proteinG} g` : '—'],
    ['Carbs', t.carbsG ? `${t.carbsG} g` : '—'],
    ['Fat', t.fatG ? `${t.fatG} g` : '—'],
    ['Water', `${(t.waterMl / 1000).toFixed(1)} L`],
    ['Steps', t.steps.toLocaleString()],
  ] : [];
  dl.replaceChildren(...rows.map(([k, v]) => { const d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>'; d.firstChild.textContent = k; d.lastChild.textContent = v; return d; }));
  $('#targetsCard').hidden = !t;
  $('#setSpeak').checked = S.get().settings.speak;
}

function renderAll() { renderToday(); renderDiary(); renderChat(); renderYou(); }

/* ---------------- events ---------------- */
function bind() {
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) {
      e.preventDefault();
      go(g.dataset.goto, { focus: true });
      if (g.dataset.anchor) requestAnimationFrame(() => document.getElementById(g.dataset.anchor)?.scrollIntoView({ block: 'start' }));
    }
    if (e.target.closest('[data-action="add-meal"]')) openMeal();
    const w = e.target.closest('[data-water]');
    if (w) { S.addWater(diaryDay, +w.dataset.water); navigator.vibrate?.(8); }
  });
  for (const a of $$('.tab')) a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.tab, { focus: true }); navigator.vibrate?.(6); });

  $('#orbButton').addEventListener('click', orbTap);
  $('#voiceForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#voiceText'); const q = i.value.trim(); i.value = ''; i.blur(); voice.stopAll(); respond(q); });
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#chatText'); sendChat(i.value); i.value = ''; });

  $('#sleepForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#sleepInput').value;
    S.setSleep(diaryDay, v === '' ? null : Math.max(0, Math.min(16, Math.round(+v * 4) / 4)));
  });

  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const num = (x, lo, hi) => { const v = parseFloat(x.value); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
    S.setProfile({
      name: f.name.value.trim().slice(0, 40),
      sex: f.sex.value || null,
      age: num(f.age, 14, 100),
      heightCm: num(f.heightCm, 120, 230),
      weightKg: num(f.weightKg, 35, 250),
      activity: f.activity.value,
      goal: f.goal.value,
    });
    const t = S.targets();
    $('#savedNote').textContent = t?.kcal ? 'Saved. Your targets are updated.' : t ? 'Saved. Add age, height and sex for calorie and protein targets.' : 'Saved. Add your weight to get targets.';
  });

  $('#setSpeak').addEventListener('change', (e) => S.setSetting('speak', e.target.checked));
  $('#setMotion').addEventListener('change', (e) => { S.setSetting('reduceMotion', e.target.checked); applyMotion(); });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `elvora-data-${S.dayKey()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (confirm('Delete everything Elvora has stored on this device? This can’t be undone.')) { S.wipe(); $('#profileForm').reset(); renderAll(); applyMotion(); }
  });

  // meal sheet
  const sheet = $('#mealSheet');
  $('#mealClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  $('#mealForm').addEventListener('submit', (e) => {
    const f = e.currentTarget.elements;
    if (e.submitter?.value !== 'save') return;
    const kcal = Math.round(+f.kcal.value);
    if (!f.name.value.trim() || !(kcal >= 0)) { e.preventDefault(); return; }
    S.addMeal(current === 'diary' ? diaryDay : S.dayKey(), { name: f.name.value.trim().slice(0, 60), kcal, protein: f.protein.value ? Math.round(+f.protein.value * 2) / 2 : 0 });
    e.currentTarget.reset();
  });

  // install prompt
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });

  S.onChange(() => { renderToday(); renderDiary(); renderYou(); });
}
function openMeal() {
  const s = $('#mealSheet');
  if (typeof s.showModal === 'function') s.showModal(); else s.setAttribute('open', '');
  setTimeout(() => s.querySelector('input[name="name"]').focus(), 50);
}

/* ---------------- boot ---------------- */
mountOrbs();
Object.values(orbs).forEach((o) => { o.levelSource = () => voice.level(); });
bind();
applyMotion();
renderSuggest();
renderAll();
setOrbState('idle');
go(location.hash.slice(1) || 'today');
requestAnimationFrame(moveIndicator);
document.fonts?.ready.then(moveIndicator);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
