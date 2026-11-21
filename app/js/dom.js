// Tiny DOM helpers (no innerHTML with data; CSP-safe).
const NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c) el.append(c);
  return el;
}
export function icon(id, cls = 'ic') {
  const s = svg('svg', { class: cls, 'aria-hidden': 'true' });
  s.append(svg('use', { href: `#${id}` }));
  return s;
}

let toastTimer = 0;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Generic bottom sheet. build(close) returns the body nodes. */
export function sheet(title, build) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': title });
  const close = () => { dlg.close(); };
  const body = h('div', { class: 'sheet-body' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'card-head' }, h('h2', { text: title }),
      h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'Close', onclick: close }, icon('i-close'))),
    ...[].concat(build(close)));
  dlg.append(body);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export const num = (v, lo, hi) => { const n = parseFloat(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
export const fmt = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }));
export const field = (label, input) => h('label', {}, label, input);
