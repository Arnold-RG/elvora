// Local-only data store (localStorage). Nothing leaves the device except the
// small context block sent to the AI coach when it's switched on.
const KEY = 'elvora.v1';
export const SCHEMA = 2;

const blankSettings = () => ({
  speak: true, reduceMotion: null, aiCoach: true,
  reminders: { water: false, waterEveryMin: 120, meals: false, mealTimes: ['08:00', '13:00', '19:00'] },
});
const blank = () => ({ version: SCHEMA, profile: null, days: {}, workouts: [], chat: [], settings: blankSettings() });
const blankDay = () => ({ meals: [], waterMl: 0, sleepH: null, sleepQ: null, restingHr: null, stress: null, steps: null, activities: [], weightKg: null });

let data = load();
const listeners = new Set();

function normalize(d) {
  const b = blank();
  const out = { ...b, ...d, version: SCHEMA };
  out.settings = { ...b.settings, ...(d.settings || {}) };
  out.settings.reminders = { ...b.settings.reminders, ...((d.settings || {}).reminders || {}) };
  out.days = {};
  for (const [k, v] of Object.entries(d.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out.days[k] = { ...blankDay(), ...v };
  out.workouts = Array.isArray(d.workouts) ? d.workouts : [];
  out.chat = Array.isArray(d.chat) ? d.chat : [];
  return out;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : blank();
  } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(data));
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const onChange = (fn) => listeners.add(fn);
export const get = () => data;

export function dayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export function lastDays(n, end = dayKey()) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}
export function day(key = dayKey()) { return { ...blankDay(), ...(data.days[key] || {}) }; }
function editDay(key, fn) {
  const d = structuredClone(day(key));
  fn(d);
  data.days[key] = d;
  save();
}

// meals
export function addMeal(key, meal) { editDay(key, (d) => d.meals.push({ id: uid(), ts: Date.now(), protein: 0, carbs: 0, fat: 0, ...meal })); }
export function updateMeal(key, id, patch) { editDay(key, (d) => { d.meals = d.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)); }); }
export function removeMeal(key, id) { editDay(key, (d) => { d.meals = d.meals.filter((m) => m.id !== id); }); }
export function recentFoods(limit = 8) {
  const seen = new Map();
  for (const k of Object.keys(data.days).sort().reverse()) {
    for (const m of [...data.days[k].meals].reverse()) if (!seen.has(m.name.toLowerCase())) seen.set(m.name.toLowerCase(), m);
    if (seen.size >= limit) break;
  }
  return [...seen.values()].slice(0, limit);
}

// water / sleep / check-in / steps / weight
export function addWater(key, ml) { editDay(key, (d) => { d.waterMl = Math.max(0, (d.waterMl || 0) + ml); }); }
export function setSleep(key, h) { editDay(key, (d) => { d.sleepH = h; }); }
export function setCheckin(key, c) { editDay(key, (d) => Object.assign(d, c)); }
export function setSteps(key, steps) { editDay(key, (d) => { d.steps = steps; }); }
export function setWeight(key, kg) { editDay(key, (d) => { d.weightKg = kg; }); }

// activities
export function addActivity(key, a) { editDay(key, (d) => d.activities.push({ id: uid(), ts: Date.now(), ...a })); }
export function updateActivity(key, id, patch) { editDay(key, (d) => { d.activities = d.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)); }); }
export function removeActivity(key, id) { editDay(key, (d) => { d.activities = d.activities.filter((a) => a.id !== id); }); }

// workouts
export function saveWorkout(w) {
  const i = data.workouts.findIndex((x) => x.id === w.id);
  if (i >= 0) data.workouts[i] = w; else data.workouts.push({ ...w, id: w.id || uid() });
  data.workouts.sort((a, b) => (a.date + a.ts < b.date + b.ts ? 1 : -1));
  save();
}
export function removeWorkout(id) { data.workouts = data.workouts.filter((w) => w.id !== id); save(); }
export const workoutsOn = (key) => data.workouts.filter((w) => w.date === key);
export const newId = uid;

// profile / settings / chat
export function setProfile(p) { data.profile = p; save(); }
export function setSetting(k, v) { data.settings[k] = v; save(); }
export function setReminder(k, v) { data.settings.reminders[k] = v; save(); }
export function pushChat(role, text, src) {
  data.chat.push({ role, text, ts: Date.now(), ...(src ? { src } : {}) });
  if (data.chat.length > 200) data.chat = data.chat.slice(-200);
  save();
}

// export / import / wipe
export function exportJSON() { return JSON.stringify({ app: 'elvora', exportedAt: new Date().toISOString(), ...data }, null, 2); }
/** Validate an export file; throws a readable error. Returns the data to apply. */
export function parseImport(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('This file is not an Elvora export.'); }
  if (!d || typeof d !== 'object' || Array.isArray(d) || (d.app && d.app !== 'elvora') || !d.days || typeof d.days !== 'object' || Array.isArray(d.days)) throw new Error('This file is not an Elvora export.');
  const { app, exportedAt, ...rest } = d;
  return normalize(rest);
}
export function applyImport(parsed) { data = parsed; save(); }
export function importJSON(text) { applyImport(parseImport(text)); }
export function wipe() { data = blank(); try { localStorage.removeItem(KEY); } catch {} save(); }

// ---- targets (formulas ported from lib/core/utils/fitness_calculator.dart) ----
const MULT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 };
const STEP_GOAL = { sedentary: 6000, light: 8000, moderate: 10000, active: 12000, athlete: 14000 };
const SPLIT = {
  muscle: { protein: 0.30, carbs: 0.45, fat: 0.25 },
  cut: { protein: 0.35, carbs: 0.35, fat: 0.30 },
  endurance: { protein: 0.20, carbs: 0.55, fat: 0.25 },
  maintain: { protein: 0.25, carbs: 0.50, fat: 0.25 },
};
export function latestWeight() {
  for (const k of Object.keys(data.days).sort().reverse()) if (data.days[k].weightKg) return data.days[k].weightKg;
  return data.profile?.weightKg || null;
}
export function targets(p = data.profile) {
  if (!p) return null;
  const w = latestWeight() || p.weightKg;
  if (!w) return null;
  const out = { waterMl: Math.round(w * 35), steps: STEP_GOAL[p.activity] || 10000 };
  if (p.heightCm && p.age && p.sex) {
    const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
    const kcal = Math.round(bmr * (MULT[p.activity] || 1.55));
    const s = SPLIT[p.goal] || SPLIT.maintain;
    Object.assign(out, { kcal, proteinG: Math.round((kcal * s.protein) / 4), carbsG: Math.round((kcal * s.carbs) / 4), fatG: Math.round((kcal * s.fat) / 9) });
  }
  return out;
}

export function totals(key = dayKey()) {
  const d = day(key);
  const sum = (f) => d.meals.reduce((a, m) => a + (+m[f] || 0), 0);
  const wk = workoutsOn(key);
  return {
    kcal: Math.round(sum('kcal')), proteinG: Math.round(sum('protein') * 10) / 10, carbsG: Math.round(sum('carbs')), fatG: Math.round(sum('fat')),
    waterMl: d.waterMl || 0, sleepH: d.sleepH, meals: d.meals.length, steps: d.steps, weightKg: d.weightKg,
    activeMin: d.activities.reduce((a, x) => a + (+x.minutes || 0), 0) + wk.reduce((a, w) => a + (+w.minutes || 0), 0),
    workouts: wk.length,
  };
}

// ---- streaks: a day counts when anything was logged ----
export function isLogged(key) {
  const d = data.days[key];
  return !!((d && (d.meals?.length || d.waterMl > 0 || d.sleepH != null || d.steps || d.activities?.length || d.weightKg)) || workoutsOn(key).length);
}
export function streaks(today = dayKey()) {
  let current = 0;
  let k = isLogged(today) ? today : addDays(today, -1); // today not logged yet doesn't break the streak
  while (isLogged(k)) { current++; k = addDays(k, -1); }
  const keys = new Set([...Object.keys(data.days), ...data.workouts.map((w) => w.date)]);
  let best = 0;
  for (const s of keys) {
    if (!isLogged(s) || isLogged(addDays(s, -1))) continue;
    let n = 0; let c = s;
    while (isLogged(c)) { n++; c = addDays(c, 1); }
    best = Math.max(best, n);
  }
  return { current, best: Math.max(best, current), loggedToday: isLogged(today) };
}
