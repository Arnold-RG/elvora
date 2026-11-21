import { Orb, setReducedMotion } from './orb.js';
import { Voice } from './voice.js';
import { askCoach, warmCoach, SUGGESTIONS } from './coach.js';
import * as S from './store.js';
import { readiness } from './readiness.js';
import { loadFoods, searchFoods, forGrams } from './foods.js';
import { barChart, lineChart } from './charts.js';
import * as R from './reminders.js';
import { h, icon, toast, sheet, num, fmt, field } from './dom.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABS = ['today', 'diary', 'voice', 'coach', 'you'];
const PAGES = { food: 'today', workout: 'today', activity: 'today', recovery: 'today', progress: 'today', reminders: 'today' };
const STATE_TEXT = { idle: 'Tap the orb to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Elvora is speaking' };
const SRC_NOTE = { offline: 'Offline coach — the AI coach was unavailable', builtin: 'Built-in coach' };

let current = null;
let diaryDay = S.dayKey();
let foodDay = S.dayKey();

/* ================= motion ================= */
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
function applyMotion() {
  const pref = S.get().settings.reduceMotion;
  const reduce = pref == null ? mq.matches : pref;
  document.documentElement.classList.toggle('reduce-motion', reduce);
  setReducedMotion(reduce);
  $('#setMotion').checked = reduce;
}
mq.addEventListener?.('change', applyMotion);

/* ================= orbs + voice ================= */
const orbs = {};
const voice = new Voice({
  onState: setOrbState,
  onTranscript: (text) => { $('#transcript').textContent = text ? `“${text}”` : ''; },
  onNotice: (msg) => showNotice(msg),
});
function mountOrbs() {
  for (const slot of $$('.orb-slot')) {
    const kind = slot.dataset.orb;
    orbs[kind] = new Orb(slot, { fps: kind === 'main' ? 60 : 30, maxDpr: kind === 'main' ? 2.5 : 3 });
    orbs[kind].levelSource = () => voice.level();
  }
}
function setOrbState(state) {
  Object.values(orbs).forEach((o) => o.setState(state));
  $('#view-voice').dataset.state = state;
  $('#voiceState').textContent = STATE_TEXT[state];
  $('#orbButton').setAttribute('aria-label', state === 'listening' ? 'Stop listening' : state === 'speaking' ? 'Stop Elvora speaking' : 'Start talking to Elvora');
}
function showNotice(msg) { const n = $('#voiceNotice'); n.textContent = msg; n.hidden = !msg; }

async function respond(question) {
  if (!question) return;
  showNotice('');
  $('#transcript').textContent = `“${question}”`;
  $('#voiceReply').replaceChildren();
  voice.set('thinking');
  const started = performance.now();
  const { text: reply, src } = await askCoach(question);
  S.pushChat('user', question);
  S.pushChat('bot', reply, src);
  renderChat();
  if (voice.state !== 'thinking') return; // user cancelled
  const wait = 400 - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const box = $('#voiceReply');
  const spans = [];
  for (const w of reply.split(/(\s+)/)) {
    if (/^\s+$/.test(w)) box.append(w);
    else if (w) { const s = h('span', { class: 'w', text: w }); box.append(s); spans.push(s); }
  }
  if (SRC_NOTE[src]) box.append(h('p', { class: 'reply-src', text: SRC_NOTE[src] }));
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

/* ================= router ================= */
function go(view, { focus = false } = {}) {
  if (!TABS.includes(view) && !PAGES[view]) view = 'today';
  if (view === current) return;
  if (current === 'voice' && view !== 'voice') voice.stopAll();
  current = view;
  const tab = PAGES[view] || view;
  for (const v of $$('.view')) v.hidden = v.dataset.view !== view;
  for (const a of $$('.tab')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  moveIndicator();
  if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
  window.scrollTo(0, 0);
  if (focus) $('#main').focus({ preventScroll: true });
  renderView(view);
}
function moveIndicator() {
  const ind = $('#tabIndicator');
  const tab = PAGES[current] || current;
  const a = $(`.tab[data-tab="${tab}"]`);
  if (!a || tab === 'voice') { ind.classList.add('off'); return; }
  ind.classList.remove('off');
  const bar = $('.tabbar-glass').getBoundingClientRect();
  const r = a.getBoundingClientRect();
  const w = Math.min(r.width - 6, 72);
  ind.style.setProperty('width', `${w}px`);
  ind.style.setProperty('--ix', `${r.left - bar.left + (r.width - w) / 2}px`);
}
window.addEventListener('resize', moveIndicator);
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

function renderView(v = current) {
  ({ today: renderToday, diary: renderDiary, coach: renderChat, you: renderYou, food: renderFood, workout: renderWorkouts,
    activity: renderActivity, recovery: renderRecovery, progress: renderProgress, reminders: renderReminders }[v] || (() => {}))();
}

/* ================= shared bits ================= */
const prettyDay = (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  const [y, m, d] = key.split('-').map(Number);
  return key === S.dayKey() ? 'Today' : new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};
const empty = (text) => h('li', { class: 'empty', text });
const macroText = (m) => [`${Math.round(m.kcal)} kcal`, m.protein ? `${m.protein} g P` : null, m.carbs ? `${m.carbs} g C` : null, m.fat ? `${m.fat} g F` : null].filter(Boolean).join(' · ');

function mealRow(m, key) {
  return h('li', {},
    h('button', { class: 'food-row', type: 'button', 'aria-label': `Edit ${m.name}`, onclick: () => editMeal(key, m) },
      h('span', { class: 'meal-name', text: m.name }), h('span', { class: 'meal-meta', text: `${macroText(m)}${m.grams ? ` · ${m.grams} g` : ''}` })),
    h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': `Delete ${m.name}`, onclick: () => { S.removeMeal(key, m.id); toast('Meal deleted'); } }, icon('i-trash')));
}

function editMeal(key, m) {
  sheet('Edit meal', (close) => {
    const f = h('form', { class: 'form-grid', id: 'editMealForm' },
      h('label', { class: 'span2' }, 'Name', h('input', { name: 'name', value: m.name, required: true, maxlength: 60 })),
      field('Calories', h('input', { name: 'kcal', type: 'number', inputmode: 'numeric', min: 0, max: 5000, required: true, value: m.kcal })),
      field('Protein (g)', h('input', { name: 'protein', type: 'number', inputmode: 'decimal', step: 0.1, min: 0, max: 400, value: m.protein || 0 })),
      field('Carbs (g)', h('input', { name: 'carbs', type: 'number', inputmode: 'decimal', step: 0.1, min: 0, max: 800, value: m.carbs || 0 })),
      field('Fat (g)', h('input', { name: 'fat', type: 'number', inputmode: 'decimal', step: 0.1, min: 0, max: 400, value: m.fat || 0 })),
      h('button', { class: 'btn wide span2', type: 'submit', text: 'Save changes' }),
      h('button', { class: 'chip danger span2', type: 'button', onclick: () => { S.removeMeal(key, m.id); close(); toast('Meal deleted'); } }, icon('i-trash'), 'Delete meal'));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const x = f.elements;
      S.updateMeal(key, m.id, { name: x.name.value.trim(), kcal: Math.round(+x.kcal.value), protein: +x.protein.value || 0, carbs: +x.carbs.value || 0, fat: +x.fat.value || 0 });
      close(); toast('Meal updated');
    });
    return f;
  });
}

/* ================= TODAY ================= */
function ring(cls, label, val, goal, unit, fmtF = (v) => Math.round(v).toLocaleString()) {
  const C = 2 * Math.PI * 40;
  const pct = goal ? Math.min(1, val / goal) : 0;
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('aria-hidden', 'true');
  for (const k of ['track', 'val']) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '40'); c.setAttribute('class', k);
    if (k === 'val') { c.setAttribute('stroke-dasharray', String(C)); c.setAttribute('stroke-dashoffset', String(C * (1 - pct))); }
    s.append(c);
  }
  return h('div', { class: `ring ${cls}`, role: 'img', 'aria-label': goal ? `${label}: ${fmtF(val)} of ${fmtF(goal)} ${unit}` : `${label}: ${fmtF(val)} ${unit}, no target set` },
    h('div', { class: 'ring-wrap' }, s, h('div', { class: 'ring-center' }, h('b', { class: 'ring-num', text: fmtF(val) }), h('small', { text: unit }))),
    h('div', { class: 'ring-lbl', text: goal ? `${label} · goal ${fmtF(goal)}` : label }));
}

function readinessCard(el, detail = false) {
  const r = readiness();
  if (!r) {
    el.replaceChildren(h('div', { class: 'score empty', text: '—' }),
      h('div', {}, h('h2', { text: 'Readiness' }), h('p', { class: 'muted small', text: 'Do today’s recovery check-in to get your readiness score.' }),
        detail ? null : h('button', { class: 'link', type: 'button', 'data-goto': 'recovery', text: 'Check in' })));
    return;
  }
  const names = { sleep: 'Sleep', rhr: 'Resting HR', load: 'Training load', stress: 'Stress' };
  el.replaceChildren(h('div', { class: 'score', text: String(r.score), 'aria-label': `Readiness ${r.score} out of 100` }),
    h('div', {}, h('h2', { text: `Readiness · ${r.band}` }), h('p', { class: 'small', text: r.rec }),
      detail ? h('div', { class: 'comps' }, ...Object.entries(r.comps).map(([k, v]) => h('span', {}, `${names[k]} `, h('b', { text: String(v) }))),
        h('span', {}, 'Load 7d ', h('b', { text: `${r.acute} min` })), h('span', {}, '4-wk avg ', h('b', { text: `${r.chronic} min/wk` }))) : null));
}

function renderToday() {
  const now = new Date();
  $('#todayDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const hr = now.getHours();
  const part = hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.get().profile?.name?.trim();
  $('#greeting').textContent = name ? `${part}, ${name}` : part;
  const st = S.streaks();
  $('#streak').replaceChildren(...(st.current
    ? [icon('i-flame'), h('span', {}, h('b', { text: `${st.current}-day streak` }), ` · best ${st.best}${st.loggedToday ? '' : ' · log today to keep it'}`)]
    : [icon('i-flame'), h('span', { text: 'Log anything today to start a streak' })]));
  const t = S.targets();
  const d = S.totals();
  $('#rings').replaceChildren(
    ring('kcal', 'Calories', d.kcal, t?.kcal, 'kcal'),
    ring('protein', 'Protein', d.proteinG, t?.proteinG, 'g'),
    ring('water', 'Water', d.waterMl / 1000, t ? t.waterMl / 1000 : null, 'L', (v) => v.toFixed(1)));
  $('#targetsHint').hidden = !!t?.kcal;
  readinessCard($('#readinessCard'));
  $('#sleepStat').textContent = d.sleepH == null ? '—' : `${d.sleepH} h`;
  $('#sleepNote').textContent = d.sleepH == null ? 'Do your recovery check-in' : d.sleepH < 6.5 ? 'Short night — keep today moderate' : 'Logged for today';
  $('#stepStat').textContent = d.steps == null ? '—' : d.steps.toLocaleString();
  $('#stepNote').textContent = t ? `Goal ${t.steps.toLocaleString()}` : 'Log steps in Activity';
  $('#hubFood').textContent = d.meals ? `${d.meals} logged today` : 'Search 7,793 foods';
  $('#hubWorkout').textContent = d.workouts ? `${d.workouts} today` : `${S.get().workouts.length} logged`;
  $('#hubActivity').textContent = d.activeMin ? `${d.activeMin} active min` : 'Steps and sessions';
  const r = readiness();
  $('#hubRecovery').textContent = r ? `Readiness ${r.score}` : 'Check-in & readiness';
  const rem = S.get().settings.reminders;
  $('#hubReminders').textContent = rem.water || rem.meals ? 'On' : 'Water & meals';
  const meals = S.day().meals;
  $('#todayMeals').replaceChildren(...(meals.length ? meals.map((m) => mealRow(m, S.dayKey())) : [empty('Nothing logged yet today.')]));
}

/* ================= DIARY ================= */
function renderDiary() {
  const strip = $('#dayStrip');
  strip.replaceChildren();
  for (const key of S.lastDays(7)) {
    const [y, m, dd] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, dd);
    const b = h('button', { type: 'button', class: `day${S.isLogged(key) ? ' has' : ''}`, role: 'tab', 'aria-selected': String(key === diaryDay),
      'aria-label': dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), onclick: () => { diaryDay = key; renderDiary(); } },
    h('small', { text: key === S.dayKey() ? 'Today' : dt.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3) }), h('b', { text: String(dd) }), h('span', { class: 'dot' }));
    strip.append(b);
  }
  const dd = S.day(diaryDay);
  const tot = S.totals(diaryDay);
  $('#diaryMeals').replaceChildren(...(dd.meals.length ? dd.meals.map((m) => mealRow(m, diaryDay)) : [empty('No meals logged for this day.')]));
  $('#diaryTotal').textContent = dd.meals.length ? `Total ${tot.kcal.toLocaleString()} kcal · ${tot.proteinG} g protein · ${tot.carbsG} g carbs · ${tot.fatG} g fat` : '';
  const t = S.targets();
  $('#waterStat').textContent = `${tot.waterMl.toLocaleString()} ml`;
  $('#waterGoalNote').textContent = t ? `Goal ${t.waterMl.toLocaleString()} ml` : 'Add weight in You for a goal';
  $('#waterBar').style.setProperty('width', `${t ? Math.min(100, (tot.waterMl / t.waterMl) * 100) : 0}%`);
  const train = [
    ...S.workoutsOn(diaryDay).map((w) => h('li', {}, h('button', { class: 'food-row', type: 'button', onclick: () => workoutEditor(w) },
      h('span', { class: 'meal-name', text: w.name }), h('span', { class: 'meal-meta', text: workoutMeta(w) })))),
    ...dd.activities.map((a) => h('li', {}, h('span', { class: 'meal-name', text: a.type }), h('span', { class: 'meal-meta', text: `${a.minutes} min${a.km ? ` · ${a.km} km` : ''}` }))),
  ];
  $('#diaryTraining').replaceChildren(...(train.length ? train : [empty('No workouts or activities for this day.')]));
  const rows = [['Sleep', dd.sleepH != null ? `${dd.sleepH} h` : '—'], ['Sleep quality', dd.sleepQ != null ? `${dd.sleepQ}%` : '—'],
    ['Stress', dd.stress != null ? `${dd.stress}/10` : '—'], ['Resting HR', dd.restingHr ? `${dd.restingHr} bpm` : '—'],
    ['Steps', dd.steps != null ? dd.steps.toLocaleString() : '—'], ['Weight', dd.weightKg ? `${dd.weightKg} kg` : '—']];
  $('#diaryBody').replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
}

/* ================= FOOD ================= */
let searchTimer = 0;
function renderFood() {
  $('#foodFor').textContent = `Adding to ${prettyDay(foodDay, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  const rec = S.recentFoods();
  $('#recentCard').hidden = !rec.length;
  $('#recentFoods').replaceChildren(...rec.map((m) => h('li', {},
    h('button', { class: 'food-row', type: 'button', onclick: () => { S.addMeal(foodDay, { name: m.name, kcal: m.kcal, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0, grams: m.grams, fdcId: m.fdcId }); toast(`Added ${m.name}`); } },
      h('span', { class: 'meal-name', text: m.name }), h('span', { class: 'meal-meta', text: `${macroText(m)} · tap to add again` })))));
  loadFoods().catch(() => {});
}
async function doSearch(q) {
  const list = $('#foodResults');
  if (q.trim().length < 2) { list.replaceChildren(); return; }
  try { await loadFoods(); } catch { list.replaceChildren(empty('Food data couldn’t load. Check your connection or use manual entry.')); return; }
  const res = searchFoods(q);
  list.replaceChildren(...(res.length ? res.map((f) => h('li', {},
    h('button', { class: 'food-row', type: 'button', onclick: () => portionSheet(f) },
      h('span', { class: 'meal-name', text: f.name }), h('span', { class: 'meal-meta', text: `${f.kcal} kcal · ${f.protein} g P · ${f.carbs} g C · ${f.fat} g F per 100 g` }))))
    : [empty(`No foods match “${q}”. Try fewer words, or use manual entry below.`)]));
}
function portionSheet(f) {
  sheet('Add food', (close) => {
    const grams = h('input', { name: 'grams', type: 'number', inputmode: 'decimal', min: 1, max: 3000, step: 1, value: f.portionG || 100, required: true, id: 'portionGrams' });
    const line = h('p', { class: 'macro-line', id: 'portionMacros' });
    const upd = () => { const g = num(grams.value, 1, 3000) || 0; const m = forGrams(f, g); line.replaceChildren(h('span', {}, h('b', { text: `${m.kcal}` }), ' kcal'), h('span', {}, h('b', { text: `${m.protein}` }), ' g protein'), h('span', {}, h('b', { text: `${m.carbs}` }), ' g carbs'), h('span', {}, h('b', { text: `${m.fat}` }), ' g fat')); };
    grams.addEventListener('input', upd); upd();
    const quick = h('div', { class: 'portion' }, h('button', { class: 'chip', type: 'button', text: '100 g', onclick: () => { grams.value = 100; upd(); } }),
      f.portionG ? h('button', { class: 'chip', type: 'button', text: `${f.portion} (${f.portionG} g)`, onclick: () => { grams.value = f.portionG; upd(); } }) : null);
    const form = h('form', { class: 'form-grid' }, h('p', { class: 'span2', text: f.name }), h('label', { class: 'span2' }, 'Amount (grams)', grams), h('div', { class: 'span2' }, quick), h('div', { class: 'span2' }, line),
      h('button', { class: 'btn wide span2', type: 'submit', text: 'Add to log' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const g = num(grams.value, 1, 3000); if (!g) return;
      const short = f.name.split(',').slice(0, 2).join(',').trim();
      S.addMeal(foodDay, { name: short, ...forGrams(f, g), grams: g, fdcId: f.fdcId });
      close(); toast(`Added ${short}`);
    });
    return form;
  });
}

/* ================= WORKOUTS ================= */
const EX = { 'Sprinter Lunge': [10, 'reps'], 'Jumping Jacks': [45, 'sec'], 'Push-ups': [15, 'reps'], 'Bodyweight Squats': [20, 'reps'], 'Plank Hold': [45, 'sec'], Lunges: [12, 'reps'],
  'Mountain Climbers': [30, 'sec'], Burpees: [10, 'reps'], 'Glute Bridges': [15, 'reps'], 'High Knees': [30, 'sec'], 'Tricep Dips (Chair)': [12, 'reps'], 'Bicycle Crunches': [20, 'reps'],
  'Wall Sit': [45, 'sec'], 'Superman Hold': [30, 'sec'], 'Side Plank': [30, 'sec'], 'Calf Raises': [20, 'reps'] };
const TEMPLATES = [
  ['Home Power Circuit', 'Full Body', ['Push-ups', 'Bodyweight Squats', 'Lunges', 'Burpees', 'Plank Hold']],
  ['Upper Body Blast', 'Upper Body', ['Push-ups', 'Tricep Dips (Chair)', 'Plank Hold', 'Superman Hold']],
  ['Leg Day at Home', 'Lower Body', ['Bodyweight Squats', 'Lunges', 'Glute Bridges', 'Wall Sit', 'Calf Raises']],
  ['Core Crusher', 'Core', ['Plank Hold', 'Bicycle Crunches', 'Mountain Climbers', 'Side Plank', 'Superman Hold']],
  ['Cardio Burn', 'Cardio', ['Jumping Jacks', 'High Knees', 'Burpees', 'Mountain Climbers', 'Sprinter Lunge']],
];
const volume = (w) => w.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (e.unit === 'reps' ? (+s.reps || 0) * (+s.kg || 0) : 0), 0), 0);
const workoutMeta = (w) => { const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0); const v = volume(w); return `${prettyDay(w.date)} · ${w.minutes} min · ${sets} sets${v ? ` · ${Math.round(v).toLocaleString()} kg volume` : ''}`; };

function renderWorkouts() {
  $('#templates').replaceChildren(...TEMPLATES.map(([name, focus, list]) => h('button', { class: 'tpl', type: 'button', onclick: () => workoutEditor({ name, template: focus, exercises: list.map((n) => ({ name: n, unit: EX[n][1], sets: [1, 2, 3].map(() => ({ reps: EX[n][0], kg: '' })) })) }) },
    h('b', { text: name }), h('small', { text: `${focus} · ${list.length} exercises` }))),
  h('button', { class: 'tpl', type: 'button', onclick: () => workoutEditor({ name: 'Workout', template: 'Custom', exercises: [] }) }, h('b', { text: 'Empty workout' }), h('small', { text: 'Add your own exercises' })));
  const ws = S.get().workouts;
  $('#workoutCount').textContent = ws.length ? `${ws.length} total` : '';
  $('#workoutHistory').replaceChildren(...(ws.length ? ws.slice(0, 30).map((w) => h('li', {},
    h('button', { class: 'food-row', type: 'button', 'aria-label': `Edit ${w.name}`, onclick: () => workoutEditor(w) }, h('span', { class: 'meal-name', text: w.name }), h('span', { class: 'meal-meta', text: workoutMeta(w) })),
    h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': `Delete ${w.name}`, onclick: () => { S.removeWorkout(w.id); toast('Workout deleted'); } }, icon('i-trash'))))
    : [empty('No workouts yet. Pick a template above to start.')]));
}

function workoutEditor(src) {
  const w = structuredClone(src);
  const isNew = !w.id;
  sheet(isNew ? `New: ${w.name}` : 'Edit workout', (close) => {
    const exWrap = h('div', { id: 'exList' });
    const dl = h('datalist', { id: 'exNames' }, ...Object.keys(EX).map((n) => h('option', { value: n })));
    const draw = () => {
      exWrap.replaceChildren(...w.exercises.map((e, ei) => h('div', { class: 'ex' },
        h('div', { class: 'ex-head' },
          h('input', { 'aria-label': 'Exercise name', value: e.name, list: 'exNames', maxlength: 40, oninput: (ev) => { e.name = ev.target.value; if (EX[e.name]) e.unit = EX[e.name][1]; } }),
          h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': `Remove ${e.name || 'exercise'}`, onclick: () => { w.exercises.splice(ei, 1); draw(); } }, icon('i-trash'))),
        ...e.sets.map((s, si) => h('div', { class: 'set-row' },
          h('span', { class: 'n', text: String(si + 1) }),
          h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 1000, value: s.reps, 'aria-label': `Set ${si + 1} ${e.unit}`, placeholder: e.unit, oninput: (ev) => { s.reps = ev.target.value; } }),
          h('input', { type: 'number', inputmode: 'decimal', min: 0, max: 500, step: 0.5, value: s.kg, 'aria-label': `Set ${si + 1} weight kg`, placeholder: 'kg', oninput: (ev) => { s.kg = ev.target.value; } }),
          h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': `Remove set ${si + 1}`, onclick: () => { e.sets.splice(si, 1); draw(); } }, icon('i-close')))),
        h('button', { class: 'chip mt', type: 'button', onclick: () => { const last = e.sets[e.sets.length - 1]; e.sets.push({ reps: last?.reps ?? '', kg: last?.kg ?? '' }); draw(); } }, icon('i-plus'), 'Add set'))));
    };
    draw();
    const name = h('input', { name: 'wname', value: w.name, required: true, maxlength: 40 });
    const date = h('input', { name: 'date', type: 'date', value: w.date || S.dayKey(), max: S.dayKey(), required: true });
    const minutes = h('input', { name: 'minutes', type: 'number', inputmode: 'numeric', min: 1, max: 600, value: w.minutes || '', required: true, placeholder: 'min' });
    const form = h('form', { class: 'form-grid', id: 'workoutForm' },
      h('label', { class: 'span2' }, 'Name', name), field('Date', date), field('Duration (min)', minutes),
      h('p', { class: 'muted small span2', text: isNew && w.exercises.length ? 'Template targets are filled in from Elvora’s workout library — change them to what you actually did. Weight is optional for bodyweight moves.' : 'Reps (or seconds for timed holds) and weight per set.' }),
      h('div', { class: 'span2' }, exWrap, dl),
      h('button', { class: 'chip span2', type: 'button', onclick: () => { w.exercises.push({ name: '', unit: 'reps', sets: [{ reps: '', kg: '' }] }); draw(); exWrap.querySelector('.ex:last-child input')?.focus(); } }, icon('i-plus'), 'Add exercise'),
      h('button', { class: 'btn wide span2', type: 'submit', text: isNew ? 'Save workout' : 'Save changes' }),
      isNew ? null : h('button', { class: 'chip danger span2', type: 'button', onclick: () => { S.removeWorkout(w.id); close(); toast('Workout deleted'); } }, icon('i-trash'), 'Delete workout'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const mins = num(minutes.value, 1, 600);
      if (!mins) { minutes.focus(); return; }
      w.exercises = w.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, name: e.name.trim(), sets: e.sets.filter((s) => s.reps !== '' && s.reps != null).map((s) => ({ reps: +s.reps, kg: s.kg === '' ? 0 : +s.kg })) })).filter((e) => e.sets.length);
      S.saveWorkout({ ...w, name: name.value.trim() || 'Workout', date: date.value || S.dayKey(), minutes: mins, ts: w.ts || Date.now() });
      close(); toast(isNew ? 'Workout saved' : 'Workout updated');
    });
    return form;
  });
}

/* ================= ACTIVITY ================= */
function renderActivity() {
  const d = S.totals();
  const t = S.targets();
  $('#stepsBig').textContent = d.steps == null ? '—' : d.steps.toLocaleString();
  $('#stepGoal').textContent = t ? `Goal ${t.steps.toLocaleString()}` : '';
  $('#stepsBar').style.setProperty('width', `${t && d.steps ? Math.min(100, (d.steps / t.steps) * 100) : 0}%`);
  $('#stepsInput').value = d.steps ?? '';
  const acts = S.day().activities;
  $('#activeMin').textContent = d.activeMin ? `${d.activeMin} active min incl. workouts` : '';
  $('#activityList').replaceChildren(...(acts.length ? acts.map((a) => h('li', {},
    h('button', { class: 'food-row', type: 'button', 'aria-label': `Edit ${a.type}`, onclick: () => editActivity(a) }, h('span', { class: 'meal-name', text: a.type }), h('span', { class: 'meal-meta', text: `${a.minutes} min${a.km ? ` · ${a.km} km` : ''}` })),
    h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': `Delete ${a.type}`, onclick: () => { S.removeActivity(S.dayKey(), a.id); toast('Activity deleted'); } }, icon('i-trash'))))
    : [empty('No activities logged today.')]));
}
function editActivity(a) {
  sheet('Edit activity', (close) => {
    const f = h('form', { class: 'form-grid' },
      field('Minutes', h('input', { name: 'minutes', type: 'number', min: 1, max: 600, required: true, value: a.minutes })),
      field('Distance (km)', h('input', { name: 'km', type: 'number', min: 0, max: 300, step: 0.01, value: a.km ?? '' })),
      h('button', { class: 'btn wide span2', type: 'submit', text: 'Save changes' }));
    f.addEventListener('submit', (e) => { e.preventDefault(); S.updateActivity(S.dayKey(), a.id, { minutes: +f.elements.minutes.value, km: f.elements.km.value ? +f.elements.km.value : null }); close(); toast('Activity updated'); });
    return f;
  });
}

/* ================= RECOVERY ================= */
function renderRecovery() {
  readinessCard($('#readinessDetail'), true);
  const d = S.day();
  const f = $('#checkinForm').elements;
  if (d.sleepH != null) f.sleepH.value = d.sleepH;
  if (d.restingHr) f.restingHr.value = d.restingHr;
  if (d.sleepQ != null) f.sleepQ.value = d.sleepQ;
  if (d.stress != null) f.stress.value = d.stress;
  $('#sleepQVal').textContent = `${f.sleepQ.value}%`;
  $('#stressVal').textContent = `${f.stress.value} / 10`;
}

/* ================= PROGRESS ================= */
function renderProgress() {
  const keys = S.lastDays(7);
  const tots = keys.map((k) => ({ key: k, t: S.totals(k) }));
  const t = S.targets();
  const avg = (arr) => { const v = arr.filter((x) => x); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const kc = tots.map((x) => ({ key: x.key, v: x.t.meals ? x.t.kcal : null }));
  const pr = tots.map((x) => ({ key: x.key, v: x.t.meals ? x.t.proteinG : null }));
  const wa = tots.map((x) => ({ key: x.key, v: x.t.waterMl ? x.t.waterMl / 1000 : null }));
  const wt = keys.map((k) => ({ key: k, v: S.day(k).weightKg || null }));
  $('#chartKcal').replaceChildren(barChart({ values: kc, goal: t?.kcal, label: 'Calories per day', unit: ' kcal' }));
  $('#chartProtein').replaceChildren(barChart({ values: pr, goal: t?.proteinG, color: 'var(--violet)', label: 'Protein per day', unit: ' g' }));
  $('#chartWater').replaceChildren(barChart({ values: wa, goal: t ? t.waterMl / 1000 : null, color: 'var(--teal)', label: 'Water per day', unit: ' L', fmtV: (v) => v.toFixed(1) }));
  $('#chartWeight').replaceChildren(lineChart({ values: wt, label: 'Weight', unit: ' kg' }));
  const a1 = avg(kc.map((x) => x.v)); const a2 = avg(pr.map((x) => x.v)); const a3 = avg(wa.map((x) => x.v));
  $('#kcalAvg').textContent = a1 ? `avg ${Math.round(a1).toLocaleString()} kcal` : 'no meals logged';
  $('#proteinAvg').textContent = a2 ? `avg ${Math.round(a2)} g` : 'no meals logged';
  $('#waterAvg').textContent = a3 ? `avg ${a3.toFixed(1)} L` : 'no water logged';
  const lw = S.latestWeight();
  $('#weightNow').textContent = lw ? `latest ${lw} kg` : '';
  $('#weightInput').value = S.day().weightKg ?? '';
}

/* ================= REMINDERS ================= */
function renderReminders() {
  const p = R.permission();
  const r = S.get().settings.reminders;
  $('#notifStatus').textContent = { granted: 'Notifications are allowed for Elvora.', denied: 'Notifications are blocked. Allow them for this site in your browser settings.', default: 'Elvora needs your permission to send reminders.', unsupported: 'This browser doesn’t support notifications. On iPhone, add Elvora to your Home Screen first.' }[p];
  $('#notifAllow').hidden = p !== 'default';
  $('#remWater').checked = r.water;
  $('#remMeals').checked = r.meals;
  $('#remWaterEvery').value = String(r.waterEveryMin);
  $$('#mealTimes input').forEach((i) => { i.value = r.mealTimes[+i.dataset.meal]; });
  $('#notifTest').disabled = p !== 'granted';
}
async function ensurePermission() {
  const p = await R.requestPermission();
  if (p !== 'granted') { toast(p === 'denied' ? 'Notifications are blocked in browser settings' : 'Notifications not allowed'); }
  renderReminders();
  return p === 'granted';
}

/* ================= COACH ================= */
function renderChat() {
  const chat = $('#chat');
  const msgs = S.get().chat.slice(-40);
  if (!msgs.length) {
    chat.replaceChildren(h('p', { class: 'chat-empty', text: 'Ask Elvora about your food, water, sleep, training or recovery. Answers use what you’ve logged.' }));
  } else {
    chat.replaceChildren(...msgs.flatMap((m) => [h('div', { class: `msg ${m.role}`, text: m.text }), m.role === 'bot' && SRC_NOTE[m.src] ? h('span', { class: 'msg-src', text: SRC_NOTE[m.src] }) : null]).filter(Boolean));
  }
  if (current === 'coach') requestAnimationFrame(() => chat.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
}
let chatBusy = false;
async function sendChat(q) {
  q = q.trim(); if (!q || chatBusy) return;
  chatBusy = true;
  const chat = $('#chat');
  chat.querySelector('.chat-empty')?.remove();
  chat.append(h('div', { class: 'msg user', text: q }));
  const typing = h('div', { class: 'msg bot typing', text: 'Elvora is thinking…' });
  chat.append(typing); typing.scrollIntoView({ block: 'end' });
  const { text, src } = await askCoach(q);
  S.pushChat('user', q);
  S.pushChat('bot', text, src);
  chatBusy = false;
  renderChat();
}

/* ================= YOU ================= */
function renderYou() {
  const p = S.get().profile || {};
  const f = $('#profileForm');
  for (const k of ['name', 'sex', 'age', 'heightCm', 'weightKg', 'activity', 'goal']) if (p[k] != null && f.elements[k]) f.elements[k].value = p[k];
  const t = S.targets();
  const rows = t ? [['Calories', t.kcal ? `${t.kcal.toLocaleString()} kcal` : '—'], ['Protein', t.proteinG ? `${t.proteinG} g` : '—'], ['Carbs', t.carbsG ? `${t.carbsG} g` : '—'],
    ['Fat', t.fatG ? `${t.fatG} g` : '—'], ['Water', `${(t.waterMl / 1000).toFixed(1)} L`], ['Steps', t.steps.toLocaleString()]] : [];
  $('#targets').replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
  $('#targetsCard').hidden = !t;
  $('#setSpeak').checked = S.get().settings.speak;
  $('#setAi').checked = S.get().settings.aiCoach !== false;
}

/* ================= events ================= */
function bind() {
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) {
      e.preventDefault();
      if (g.dataset.goto === 'food') foodDay = g.id === 'diaryAddFood' ? diaryDay : S.dayKey();
      go(g.dataset.goto, { focus: true });
      if (g.dataset.anchor) requestAnimationFrame(() => document.getElementById(g.dataset.anchor)?.scrollIntoView({ block: 'start' }));
    }
    if (e.target.closest('[data-back]')) go(PAGES[current] || 'today', { focus: true });
    const w = e.target.closest('[data-water]');
    if (w) { S.addWater(diaryDay, +w.dataset.water); navigator.vibrate?.(8); }
  });
  for (const a of $$('.tab')) a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.tab, { focus: true }); navigator.vibrate?.(6); });

  $('#orbButton').addEventListener('click', orbTap);
  $('#voiceForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#voiceText'); const q = i.value.trim(); i.value = ''; i.blur(); voice.stopAll(); respond(q); });
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#chatText'); const q = i.value; i.value = ''; sendChat(q); });

  // food
  $('#foodSearch').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value), 180); });
  $('#manualFood').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const kcal = num(f.kcal.value, 0, 5000);
    if (!f.name.value.trim() || kcal == null) return;
    S.addMeal(foodDay, { name: f.name.value.trim().slice(0, 60), kcal: Math.round(kcal), protein: num(f.protein.value, 0, 400) || 0, carbs: num(f.carbs.value, 0, 800) || 0, fat: num(f.fat.value, 0, 400) || 0 });
    toast(`Added ${f.name.value.trim()}`);
    e.currentTarget.reset();
  });

  // activity
  $('#stepsForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#stepsInput').value; S.setSteps(S.dayKey(), v === '' ? null : num(v, 0, 100000)); toast('Steps saved'); });
  $('#activityForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    const mins = num(f.minutes.value, 1, 600); if (!mins) return;
    S.addActivity(S.dayKey(), { type: f.type.value, minutes: Math.round(mins), km: f.km.value ? num(f.km.value, 0, 300) : null });
    toast(`${f.type.value} logged`); e.currentTarget.reset();
  });

  // recovery
  const cf = $('#checkinForm');
  cf.elements.sleepQ.addEventListener('input', (e) => { $('#sleepQVal').textContent = `${e.target.value}%`; });
  cf.elements.stress.addEventListener('input', (e) => { $('#stressVal').textContent = `${e.target.value} / 10`; });
  cf.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = cf.elements;
    const sleepH = num(f.sleepH.value, 0, 16); if (sleepH == null) { f.sleepH.focus(); return; }
    S.setCheckin(S.dayKey(), { sleepH: Math.round(sleepH * 4) / 4, sleepQ: +f.sleepQ.value, stress: +f.stress.value, restingHr: f.restingHr.value ? num(f.restingHr.value, 30, 130) : null });
    toast('Check-in saved');
  });

  // progress
  $('#weightForm').addEventListener('submit', (e) => { e.preventDefault(); const v = num($('#weightInput').value, 30, 300); if (v == null) return; S.setWeight(S.dayKey(), Math.round(v * 10) / 10); toast('Weight logged'); });

  // reminders
  $('#notifAllow').addEventListener('click', ensurePermission);
  // Read the requested state before asking for permission: ensurePermission re-renders the toggles from the store.
  const toggleReminder = (key) => async (e) => {
    const on = e.target.checked;
    if (on && !(await ensurePermission())) { S.setReminder(key, false); renderReminders(); return; }
    S.setReminder(key, on); if (on && key === 'water') R.armWater(); R.start(); renderReminders();
  };
  $('#remWater').addEventListener('change', toggleReminder('water'));
  $('#remMeals').addEventListener('change', toggleReminder('meals'));
  $('#remWaterEvery').addEventListener('change', (e) => S.setReminder('waterEveryMin', +e.target.value));
  $$('#mealTimes input').forEach((i) => i.addEventListener('change', () => { const t = [...S.get().settings.reminders.mealTimes]; t[+i.dataset.meal] = i.value || t[+i.dataset.meal]; S.setReminder('mealTimes', t); }));
  $('#notifTest').addEventListener('click', async () => { toast((await R.test()) ? 'Test reminder sent' : 'Couldn’t show a notification'); });

  // profile + settings
  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    S.setProfile({ name: f.name.value.trim().slice(0, 40), sex: f.sex.value || null, age: num(f.age.value, 14, 100), heightCm: num(f.heightCm.value, 120, 230),
      weightKg: num(f.weightKg.value, 35, 250), activity: f.activity.value, goal: f.goal.value });
    const t = S.targets();
    $('#savedNote').textContent = t?.kcal ? 'Saved. Your targets are updated.' : t ? 'Saved. Add age, height and sex for calorie and protein targets.' : 'Saved. Add your weight to get targets.';
  });
  $('#setSpeak').addEventListener('change', (e) => S.setSetting('speak', e.target.checked));
  $('#setAi').addEventListener('change', (e) => { S.setSetting('aiCoach', e.target.checked); if (e.target.checked) warmCoach(); toast(e.target.checked ? 'AI coach on' : 'AI coach off — built-in coach only'); });
  $('#setMotion').addEventListener('change', (e) => { S.setSetting('reduceMotion', e.target.checked); applyMotion(); });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `elvora-data-${S.dayKey()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) { toast('That file is too large to be an Elvora export'); return; }
    try {
      const parsed = S.parseImport(await file.text());
      if (!confirm('Replace the data on this device with this export?')) return;
      S.applyImport(parsed); $('#profileForm').reset(); renderYou(); applyMotion(); toast('Data imported');
    } catch (err) { toast(err.message || 'Couldn’t read that file'); }
  });
  $('#wipeBtn').addEventListener('click', () => {
    if (confirm('Delete everything Elvora has stored on this device? This can’t be undone.')) { S.wipe(); $('#profileForm').reset(); applyMotion(); renderView(); toast('All data deleted'); }
  });

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });

  S.onChange(() => renderView());
}

/* ================= boot ================= */
mountOrbs();
bind();
applyMotion();
$('#suggest').replaceChildren(...SUGGESTIONS.map((q) => h('button', { type: 'button', class: 'chip', text: q, onclick: () => sendChat(q) })));
setOrbState('idle');
go(location.hash.slice(1) || 'today');
requestAnimationFrame(moveIndicator);
document.fonts?.ready.then(moveIndicator);
warmCoach();
R.start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
