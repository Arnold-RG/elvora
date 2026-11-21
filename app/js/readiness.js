// Readiness score, ported from lib/core/intelligence/readiness_engine.dart.
// The web app has no watch, so HRV is missing; the remaining components keep
// their repo weights and are re-normalised. Resting HR only counts once there
// are 3+ earlier readings to form a baseline.
import * as S from './store.js';

const W = { hrv: 0.30, rhr: 0.20, sleep: 0.28, load: 0.14, stress: 0.08 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const scoreRestingHr = (rhr, base) => clamp(65 - clamp(((rhr - base) / base) / 0.15, -1, 1) * 45, 0, 100);
function scoreSleep(hours, q) {
  const dur = clamp((hours / 8) * 100, 0, 100);
  const pen = hours < 6 ? (6 - hours) * 8 : 0;
  return clamp(dur * 0.6 + q * 0.4 - pen, 0, 100);
}
function scoreLoad(acute, chronic) {
  if (chronic <= 0) return 70;
  const r = acute / chronic;
  if (r >= 0.8 && r <= 1.3) return 90;
  if (r < 0.8) return clamp(90 - clamp(0.8 - r, 0, 0.8) * 50, 35, 90);
  return clamp(90 - clamp(r - 1.3, 0, 1.2) * 55, 10, 90);
}
const scoreStress = (s) => clamp(100 - s, 0, 100);

const BANDS = [[85, 'Peak'], [70, 'Ready'], [55, 'Moderate'], [40, 'Compromised'], [0, 'Rest']];
const REC = { Peak: 'Push hard', Ready: 'Train as planned', Moderate: 'Keep it moderate', Compromised: 'Active recovery', Rest: 'Full recovery day' };

export function loadMinutes(key) {
  const sum = (keys) => keys.reduce((a, k) => a + S.totals(k).activeMin, 0);
  const acute = sum(S.lastDays(7, key));
  const chronic = sum(S.lastDays(28, key)) / 4;
  return { acute, chronic };
}

/** null until a sleep check-in exists for that day */
export function readiness(key = S.dayKey()) {
  const d = S.day(key);
  if (d.sleepH == null) return null;
  const comps = {};
  comps.sleep = scoreSleep(d.sleepH, d.sleepQ ?? 70);
  if (d.restingHr) {
    const prev = S.lastDays(15, S.addDays(key, -1)).map((k) => S.day(k).restingHr).filter(Boolean);
    if (prev.length >= 3) comps.rhr = scoreRestingHr(d.restingHr, prev.reduce((a, b) => a + b, 0) / prev.length);
  }
  const { acute, chronic } = loadMinutes(key);
  comps.load = scoreLoad(acute, chronic);
  if (d.stress != null) comps.stress = scoreStress(d.stress * 10);
  let wsum = 0; let raw = 0;
  for (const [k, v] of Object.entries(comps)) { raw += v * W[k]; wsum += W[k]; }
  const score = clamp(Math.round(raw / wsum), 1, 100);
  const band = BANDS.find(([min]) => score >= min)[1];
  let rec = REC[band];
  if (comps.load < 45) rec = band === 'Peak' || band === 'Ready' ? REC.Moderate : REC.Compromised;
  return { score, band, rec, comps: Object.fromEntries(Object.entries(comps).map(([k, v]) => [k, Math.round(v)])), acute, chronic: Math.round(chronic), usedSleepQ: d.sleepQ != null };
}
