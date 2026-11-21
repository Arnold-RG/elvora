// Local-only data store (localStorage). Nothing leaves the device.
const KEY = 'elvora.v1';

const blank = () => ({ version: 1, profile: null, days: {}, chat: [], settings: { speak: true, reduceMotion: null } });

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    return { ...blank(), ...d, settings: { ...blank().settings, ...(d.settings || {}) } };
  } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(data));
}

export const onChange = (fn) => listeners.add(fn);
export const get = () => data;

export function dayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function day(key = dayKey()) {
  return data.days[key] || { meals: [], waterMl: 0, sleepH: null };
}
function editDay(key, fn) {
  const d = structuredClone(day(key));
  fn(d);
  data.days[key] = d;
  save();
}

export function addMeal(key, meal) {
  editDay(key, (d) => d.meals.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), ts: Date.now(), ...meal }));
}
export function removeMeal(key, id) { editDay(key, (d) => { d.meals = d.meals.filter((m) => m.id !== id); }); }
export function addWater(key, ml) { editDay(key, (d) => { d.waterMl = Math.max(0, (d.waterMl || 0) + ml); }); }
export function setSleep(key, h) { editDay(key, (d) => { d.sleepH = h; }); }

export function setProfile(p) { data.profile = p; save(); }
export function setSetting(k, v) { data.settings[k] = v; save(); }

export function pushChat(role, text) {
  data.chat.push({ role, text, ts: Date.now() });
  if (data.chat.length > 200) data.chat = data.chat.slice(-200);
  save();
}

export function exportJSON() { return JSON.stringify(data, null, 2); }
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

export function targets(p = data.profile) {
  if (!p || !p.weightKg) return null;
  const out = { waterMl: Math.round(p.weightKg * 35), steps: STEP_GOAL[p.activity] || 10000 };
  if (p.heightCm && p.age && p.sex) {
    const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
    const kcal = Math.round(bmr * (MULT[p.activity] || 1.55));
    const s = SPLIT[p.goal] || SPLIT.maintain;
    Object.assign(out, {
      kcal,
      proteinG: Math.round((kcal * s.protein) / 4),
      carbsG: Math.round((kcal * s.carbs) / 4),
      fatG: Math.round((kcal * s.fat) / 9),
    });
  }
  return out;
}

export function totals(key = dayKey()) {
  const d = day(key);
  return {
    kcal: d.meals.reduce((a, m) => a + (+m.kcal || 0), 0),
    proteinG: d.meals.reduce((a, m) => a + (+m.protein || 0), 0),
    waterMl: d.waterMl || 0,
    sleepH: d.sleepH,
    meals: d.meals.length,
  };
}
