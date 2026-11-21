// Small SVG charts (bars and a line) for the weekly progress view.
import { svg, h } from './dom.js';

const shortDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
};

/** values: [{key, v}], goal optional */
export function barChart({ values, goal, color = 'var(--cyan)', unit = '', fmtV = (v) => Math.round(v).toLocaleString(), label }) {
  const W = 320, H = 150, P = { l: 6, r: 6, t: 16, b: 22 };
  const max = Math.max(goal || 0, ...values.map((x) => x.v || 0), 1) * 1.1;
  const bw = (W - P.l - P.r) / values.length;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${label}: ${values.map((x) => `${shortDay(x.key)} ${x.v == null ? 'none' : fmtV(x.v) + unit}`).join(', ')}${goal ? `; goal ${fmtV(goal)}${unit}` : ''}` });
  values.forEach((x, i) => {
    const v = x.v || 0;
    const bx = P.l + i * bw + bw * 0.2;
    g.append(svg('rect', { x: bx, y: y(v), width: bw * 0.6, height: Math.max(0, H - P.b - y(v)), rx: 5, fill: color, opacity: x.v == null ? 0.15 : 0.9, class: 'bar' }));
    if (x.v) g.append(svg('text', { x: bx + bw * 0.3, y: y(v) - 4, 'text-anchor': 'middle', class: 'chart-val' }, document.createTextNode(fmtV(v))));
    g.append(svg('text', { x: bx + bw * 0.3, y: H - 6, 'text-anchor': 'middle', class: 'chart-lbl' }, document.createTextNode(shortDay(x.key))));
  });
  if (goal) g.append(svg('line', { x1: P.l, x2: W - P.r, y1: y(goal), y2: y(goal), class: 'chart-goal' }));
  return g;
}

export function lineChart({ values, color = 'var(--violet)', unit = '', label }) {
  const pts = values.filter((x) => x.v != null);
  if (pts.length === 0) return h('p', { class: 'muted small', text: 'No weigh-ins this week yet.' });
  const W = 320, H = 150, P = { l: 10, r: 10, t: 20, b: 22 };
  const vs = pts.map((x) => x.v);
  const lo = Math.min(...vs) - 1, hi = Math.max(...vs) + 1;
  const bw = (W - P.l - P.r) / values.length;
  const xOf = (i) => P.l + i * bw + bw / 2;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${label}: ${pts.map((x) => `${shortDay(x.key)} ${x.v}${unit}`).join(', ')}` });
  const path = values.map((x, i) => (x.v == null ? null : [xOf(i), y(x.v)])).filter(Boolean);
  if (path.length > 1) g.append(svg('polyline', { points: path.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  values.forEach((x, i) => {
    if (x.v != null) {
      g.append(svg('circle', { cx: xOf(i), cy: y(x.v), r: 4.5, fill: color, class: 'pt' }));
      g.append(svg('text', { x: xOf(i), y: y(x.v) - 9, 'text-anchor': 'middle', class: 'chart-val' }, document.createTextNode(String(x.v))));
    }
    g.append(svg('text', { x: xOf(i), y: H - 6, 'text-anchor': 'middle', class: 'chart-lbl' }, document.createTextNode(shortDay(x.key))));
  });
  return g;
}
