// On-device coach. Ported from lib/core/intelligence/coach_knowledge.dart and
// adapted to what the web app actually knows: logged meals, water, sleep and
// the profile targets. Nothing is invented: when data is missing it says so.
import { get, targets, totals, streaks, latestWeight } from './store.js';
import { readiness } from './readiness.js';
import { API_BASE, API_TIMEOUT_MS } from './config.js';

const has = (q, words) => words.some((w) => q.includes(w));
const n0 = (v) => Math.round(v).toLocaleString();

export function answer(message) {
  const q = ` ${message.toLowerCase()} `;
  const p = get().profile;
  const t = targets(p);
  const d = totals();
  const name = p?.name?.trim() || 'there';
  const kcalLeft = t?.kcal ? t.kcal - d.kcal : null;
  const noTargets = 'Add your age, height, weight and sex in the You tab and I will work out your calorie and protein targets.';

  if (has(q, ['pain', 'hurt', 'injur', 'sick', ' ill ', 'dizzy', 'chest'])) {
    return 'I can’t assess pain, injury or illness. Please stop training and check with a clinician or a pharmacist. If it feels serious, call your local emergency number.';
  }

  if (has(q, ['readiness', 'recovered', 'recovery', 'should i train', 'train today', 'rest day'])) {
    const r = readiness();
    if (!r) return 'Do today’s recovery check-in (sleep, sleep quality, stress) under Today → Recovery and I’ll score your readiness.';
    return `Your readiness is ${r.score} out of 100, in the ${r.band.toLowerCase()} band. My call for today: ${r.rec.toLowerCase()}.`;
  }

  if (has(q, ['calorie', 'kcal', 'how much can i eat', 'eat more', 'deficit', 'what to eat', 'what should i eat', 'dinner', 'lunch', 'breakfast', 'meal idea', 'eat next'])) {
    if (kcalLeft == null) return `You’ve logged ${n0(d.kcal)} kcal today. ${noTargets}`;
    if (kcalLeft > 400) return `You have ${n0(kcalLeft)} kcal left of your ${n0(t.kcal)} target, and you’re at ${n0(d.proteinG)} g protein.\n\nSpend most of that on protein and vegetables — a palm-sized portion of chicken, fish or tofu with a big salad gets you close without much else.`;
    if (kcalLeft > 0) return `Only ${n0(kcalLeft)} kcal left today, so keep it light. Greek yoghurt or a protein shake fits and still adds to your ${n0(d.proteinG)} g protein.`;
    return `You’re ${n0(-kcalLeft)} kcal over your target. Not a problem on its own — one day rarely moves the needle. Close the day with water and a walk, and reset tomorrow.`;
  }

  if (has(q, ['protein'])) {
    if (!t?.proteinG) return `You’ve logged ${n0(d.proteinG)} g protein today. ${noTargets}`;
    return `You’re at ${n0(d.proteinG)} g of ${n0(t.proteinG)} g protein today.\n\nAnchor every meal with eggs, yoghurt, chicken, fish, tofu or lentils first — then build the plate.`;
  }

  if (has(q, ['vitamin', 'supplement', 'micronutrient'])) {
    return 'Food first: colourful vegetables and fruit cover most micronutrients.\n\nEvidence-backed extras: creatine for training, vitamin D if you get little sun, protein powder for convenience. Check with a clinician before starting anything new.';
  }

  if (has(q, ['water', 'hydrat', 'drink', 'thirst'])) {
    const L = (d.waterMl / 1000).toFixed(1);
    if (!t) return `You’re at ${L} L today. Aim for roughly 35 ml per kilogram of body weight — add your weight in You and I’ll set the exact goal.`;
    const left = t.waterMl - d.waterMl;
    return left > 0
      ? `You’re at ${L} L of your ${(t.waterMl / 1000).toFixed(1)} L goal — ${n0(left)} ml to go. Add about 500 ml for each hour of hard training.`
      : `You’ve hit your ${(t.waterMl / 1000).toFixed(1)} L water goal with ${L} L. Nice work.`;
  }

  if (has(q, ['sleep', 'tired', 'exhausted', 'insomnia'])) {
    if (d.sleepH == null) return 'You haven’t logged sleep for today. Do the recovery check-in under Today → Recovery and I’ll tell you how to pace the day.';
    return d.sleepH < 6.5
      ? `You logged ${d.sleepH} hours, which is short. Treat today as moderate, and move bedtime earlier tonight.`
      : `At ${d.sleepH} hours you’re in decent shape. Consistency beats one long night.`;
  }

  if (has(q, ['step', 'walk', 'cardio'])) {
    if (d.steps == null) return `You haven’t logged steps today. Add them under Today → Activity${t ? ` — your goal is ${n0(t.steps)}` : ''}. A 20-minute walk usually covers about 2,000 steps.`;
    if (t && d.steps < t.steps) return `You’re on ${n0(d.steps)} steps, ${n0(t.steps - d.steps)} short of your ${n0(t.steps)} goal. A 20-minute walk usually covers about 2,000 of those.`;
    return `You’ve logged ${n0(d.steps)} steps today${t ? `, past your ${n0(t.steps)} goal` : ''}. Anything more is a bonus for recovery.`;
  }

  if (has(q, ['workout', 'exercise', 'routine', 'session', 'gym', 'how long', 'plan', 'trained'])) {
    const r = readiness();
    const done = d.workouts ? `You’ve logged ${d.workouts} workout${d.workouts > 1 ? 's' : ''} today (${n0(d.activeMin)} active minutes). ` : '';
    return `${done}${r ? `Readiness is ${r.score}, so ${r.rec.toLowerCase()}. ` : ''}Start a template under Today → Workouts — it logs your sets, reps and weight.`;
  }

  if (has(q, ['weight', 'lose', 'fat loss', 'gain', 'plateau', 'progress', 'goal'])) {
    const w = latestWeight();
    return `${w ? `Your latest weight is ${w} kg. ` : 'Log your weight under Today → Progress to see the trend. '}Weight moves on weekly averages — weigh at the same time each morning. If the trend is flat for two weeks, change one lever: food, steps or training volume.`;
  }

  if (has(q, ['streak'])) {
    const st = streaks();
    return st.current ? `You’re on a ${st.current}-day logging streak (best ${st.best}). Log anything today to keep it going.` : 'No streak yet — log a meal, water or a workout today to start one.';
  }

  if (has(q, ['heart', 'bpm', 'hrv', 'pulse', 'watch', 'pair', 'connect'])) {
    return 'Watch pairing isn’t available in the web app yet, so I can’t read heart rate or HRV here.';
  }

  if (has(q, [' hello', ' hi ', ' hey', 'morning', 'good evening', 'good afternoon'])) {
    return `Hey ${name}. You’re on ${n0(d.kcal)} kcal and ${(d.waterMl / 1000).toFixed(1)} L of water so far today.\n\nAsk me about food, water, sleep or whether to train — I’ll use your logged numbers.`;
  }

  if (has(q, ['thank', 'cheers', 'appreciate'])) {
    return `Any time, ${name}. Keep logging and I’ll keep the guidance specific to you.`;
  }

  const k = t?.kcal ? `${n0(d.kcal)} of ${n0(t.kcal)} kcal` : `${n0(d.kcal)} kcal logged`;
  return `I can help with food, protein, water, sleep and whether to train. Right now you’re at ${k} and ${(d.waterMl / 1000).toFixed(1)} L of water.\n\nAsk me something concrete — for example “what should I eat next?”.`;
}

/** Minimal context for the AI coach: totals and targets only, no names or meal text. */
export function coachContext() {
  const p = get().profile || {};
  const t = targets();
  const d = totals();
  const r = readiness();
  return {
    goal: p.goal || null,
    activity: p.activity || null,
    targets: t ? { kcal: t.kcal ?? null, proteinG: t.proteinG ?? null, carbsG: t.carbsG ?? null, fatG: t.fatG ?? null, waterMl: t.waterMl, steps: t.steps } : null,
    today: { kcal: Math.round(d.kcal), proteinG: Math.round(d.proteinG * 10) / 10, waterMl: Math.round(d.waterMl), sleepH: d.sleepH, meals: d.meals, steps: d.steps == null ? null : Math.round(d.steps), activeMin: Math.min(1440, Math.round(d.activeMin)), workouts: Math.min(20, d.workouts), weightKg: latestWeight() },
    hour: new Date().getHours(),
    readiness: r ? r.score : null,
    streakDays: streaks().current,
  };
}

/** Ask the AI coach; falls back to the built-in coach on any problem. */
export async function askCoach(message) {
  if (get().settings.aiCoach !== false && API_BASE) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/api/coach`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal, credentials: 'omit',
        body: JSON.stringify({ message: message.slice(0, 500), context: coachContext() }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok && j.reply) return { text: j.reply, src: 'ai' };
    } catch { /* offline, timeout or blocked */ } finally { clearTimeout(timer); }
    return { text: answer(message), src: 'offline' };
  }
  return { text: answer(message), src: 'builtin' };
}

/** Wake the free-tier API early so the first question isn't slow. */
export function warmCoach() {
  if (get().settings.aiCoach === false || !API_BASE) return;
  fetch(`${API_BASE}/health`, { credentials: 'omit', mode: 'no-cors' }).catch(() => {});
}

export const SUGGESTIONS = ['What should I eat next?', 'Protein check', 'How’s my water?', 'Should I train today?', 'How did I sleep?'];
