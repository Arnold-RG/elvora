// On-device coach. Ported from lib/core/intelligence/coach_knowledge.dart and
// adapted to what the web app actually knows: logged meals, water, sleep and
// the profile targets. Nothing is invented: when data is missing it says so.
import { get, targets, totals } from './store.js';

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

  if (has(q, ['readiness', 'recovered', 'should i train', 'train today', 'rest day'])) {
    const sleep = d.sleepH;
    const base = 'I score readiness from overnight watch data, and watch pairing isn’t in the web app yet.';
    if (sleep == null) return `${base} Log last night’s sleep in Diary and I can at least factor that in.`;
    if (sleep < 6.5) return `${base} You logged ${sleep} hours of sleep, which is short — keep today moderate and move bedtime earlier tonight.`;
    return `${base} You logged ${sleep} hours of sleep, so nothing from sleep says hold back. Listen to how your body feels during the warm-up.`;
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
    if (d.sleepH == null) return 'You haven’t logged sleep for today. Add last night’s hours in Diary and I’ll tell you how to pace the day.';
    return d.sleepH < 6.5
      ? `You logged ${d.sleepH} hours, which is short. Treat today as moderate, and move bedtime earlier tonight.`
      : `At ${d.sleepH} hours you’re in decent shape. Consistency beats one long night.`;
  }

  if (has(q, ['step', 'walk', 'cardio'])) {
    return `Step counting needs the phone’s motion sensor, which the web app can’t read yet.${t ? ` Your step goal for your activity level is ${n0(t.steps)}.` : ''} A 20-minute walk usually covers about 2,000 steps — walking after your largest meal is the best use of the time.`;
  }

  if (has(q, ['workout', 'exercise', 'routine', 'session', 'gym', 'how long', 'plan'])) {
    return 'Training plans live in the full Elvora app and aren’t in the web version yet. What I can do here: check your fuel and sleep before you train. Ask me “should I train today?” or “what should I eat next?”.';
  }

  if (has(q, ['weight', 'lose', 'fat loss', 'gain', 'plateau', 'progress', 'goal'])) {
    return 'Weight moves on weekly averages — weigh at the same time each morning. If the trend is flat for two weeks, change one lever: food, steps or training volume.';
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

export const SUGGESTIONS = ['What should I eat next?', 'Protein check', 'How’s my water?', 'Should I train today?', 'How did I sleep?'];
