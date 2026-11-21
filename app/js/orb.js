// Elvora voice orb — a glass sphere with a cyan-blue rim and flowing violet/teal
// ribbons, drawn in WebGL. Falls back to Canvas 2D, then to a CSS-only orb.
// States: idle · listening (mic level) · thinking · speaking (reply output level).

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uLevel, uListen, uSpeak, uThink;

float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

uniform float uBias;
vec3 ribbons(vec3 n, float t, float energy){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 q = rotZ(0.7 * fi + t * 0.06) * rotY(t * (0.16 + 0.06 * fi) + fi * 2.1) * rotX(0.5 + fi * 0.9 + t * 0.05) * n;
    float warp = noise(q * 1.5 + vec3(0.0, t * 0.22, fi * 3.0));
    float w = q.y + 0.38 * sin(q.x * 2.6 + t * (0.55 + 0.2 * fi) + fi * 1.7) + 0.5 * (warp - 0.5);
    float thick = 0.012 + 0.022 * energy;
    float line = pow(thick / (abs(w) + thick), 2.4);
    float sheet = (w < 0.0 ? exp(w * 5.0) : 0.0) * (0.30 + 0.25 * energy);
    float mask = smoothstep(0.3, 0.72, noise(q * 1.15 + vec3(fi * 7.0, t * 0.1, 0.0)));
    vec3 c = mix(vec3(0.60, 0.45, 1.0), vec3(0.30, 0.90, 0.96), smoothstep(-0.6, 0.6, q.x + 0.35 * sin(t * 0.3 + fi) + uBias));
    acc += (c * (line * 1.25 + sheet) + vec3(0.85, 0.92, 1.0) * pow(line, 3.0) * 0.45) * mask;
  }
  return acc;
}

void main(){
  float m = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * m);
  float t = uTime;
  float lvl = uLevel;
  float R = 0.74 * (1.0 + 0.04 * lvl + 0.01 * sin(t * 1.2));
  float d = length(p);
  float px = 2.0 / m;
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 rimCol = mix(vec3(0.42, 0.80, 1.0), vec3(0.62, 0.96, 1.0), uListen);
  rimCol = mix(rimCol, vec3(0.76, 0.64, 1.0), uSpeak * 0.75);
  float energy = 0.2 + 0.8 * lvl + 0.25 * uThink;

  if (d < R) {
    vec2 s = p / R;
    float z = sqrt(max(0.0, 1.0 - dot(s, s)));
    vec3 n = vec3(s, z);
    vec3 nb = vec3(s, -z);
    float fres = pow(1.0 - z, 2.4);
    vec3 base = vec3(0.010, 0.016, 0.040) + vec3(0.05, 0.17, 0.42) * fres + vec3(0.06, 0.28, 0.75) * pow(1.0 - z, 6.0) * 0.8;
    float speed = 0.5 + 0.45 * uSpeak + 0.25 * uListen + 0.35 * uThink + 0.6 * lvl;
    float tt = t * speed;
    vec3 rb = ribbons(n, tt, energy) + ribbons(nb, tt * 0.85 + 11.0, energy) * 0.4;
    rb *= 0.85 + 1.0 * lvl;
    vec2 g = s * 16.0; vec2 gi = floor(g); vec2 gf = fract(g) - 0.5;
    float h = hash(vec3(gi, 3.0));
    vec2 off = (vec2(hash(vec3(gi, 1.0)), hash(vec3(gi, 2.0))) - 0.5) * 0.6;
    float tw = 0.5 + 0.5 * sin(t * (1.5 + 3.0 * h) + h * 40.0);
    float spark = step(0.88 - 0.07 * (uSpeak + uListen), h) * smoothstep(0.11, 0.0, length(gf + off)) * tw;
    float spec = smoothstep(0.55, 0.0, length(s - vec2(-0.42, 0.5))) * 0.07;
    col = base + rb + vec3(0.55, 0.75, 1.0) * spark * 0.8 + vec3(spec);
    a = 0.96;
  }
  float ed = abs(d - R);
  float rim = smoothstep(px * 1.4 + 0.005, 0.0, ed);
  float halo = exp(-ed * 24.0) * (0.5 + 0.55 * uListen + 0.45 * lvl);
  float outer = exp(-max(d - R, 0.0) * 6.5) * step(R, d) * (0.16 + 0.4 * lvl + 0.14 * uListen + 0.1 * uSpeak);
  col += rimCol * (rim * 1.5 + halo * 0.7) + vec3(0.18, 0.42, 1.0) * outer;
  a = max(a, clamp(rim, 0.0, 1.0)); // glow stays additive (premultiplied, low alpha)
  float edge = smoothstep(1.0, 0.84, d);   // fade glow out before the canvas edge
  col *= edge; a *= edge;
  gl_FragColor = vec4(min(col, vec3(1.0)), a);
}`;

const STATE_TARGETS = {
  idle: { listen: 0, speak: 0, think: 0 },
  listening: { listen: 1, speak: 0, think: 0 },
  thinking: { listen: 0, speak: 0, think: 1 },
  speaking: { listen: 0, speak: 1, think: 0 },
};

const orbs = new Set();
let rafId = 0;
let reduceMotion = false;
const t0 = performance.now();

export function setReducedMotion(v) {
  reduceMotion = !!v;
  orbs.forEach((o) => o.invalidate());
  kick();
}

function loop(now) {
  rafId = 0;
  let any = false;
  for (const o of orbs) any = o.frame(now) || any;
  if (any) rafId = requestAnimationFrame(loop);
}
function kick() { if (!rafId) rafId = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl', { failIfMajorPerformanceCaveat: false }) || c.getContext('experimental-webgl'));
  } catch { return false; }
}
const HAS_GL = webglSupported();

export class Orb {
  /**
   * @param {HTMLElement} slot  element to fill
   * @param {{maxDpr?: number, fps?: number}} opts
   */
  constructor(slot, opts = {}) {
    this.slot = slot;
    this.maxDpr = opts.maxDpr ?? 3;
    this.minFrameMs = 1000 / (opts.fps ?? 60);
    this.state = 'idle';
    this.mix = { listen: 0, speak: 0, think: 0 };
    this.level = 0;          // smoothed level used for drawing
    this.levelSource = null; // () => 0..1
    this.visible = true;
    this.quality = 1;        // dynamic resolution factor
    this.slow = 0;
    this.last = 0;
    this.dirty = true;
    this.mode = 'css';

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    this.canvas = canvas;
    if (HAS_GL && this.initGL()) this.mode = 'webgl';
    else if (canvas.getContext('2d')) { this.ctx = canvas.getContext('2d'); this.mode = '2d'; }
    if (this.mode === 'css') {
      const d = document.createElement('span');
      d.className = 'orb-css';
      slot.appendChild(d);
    } else {
      slot.appendChild(canvas);
    }
    slot.dataset.orbMode = this.mode;

    this.ro = new ResizeObserver(() => { this.resize(); this.invalidate(); });
    this.ro.observe(slot);
    this.io = new IntersectionObserver((e) => {
      this.visible = e.some((x) => x.isIntersecting);
      if (this.visible) { this.invalidate(); kick(); }
    });
    this.io.observe(slot);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.glLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.glLost = false; this.initGL(); this.resize(); this.invalidate(); kick(); });

    this.resize();
    orbs.add(this);
    kick();
  }

  initGL() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.gl = gl;
    this.u = {};
    for (const n of ['uRes', 'uTime', 'uLevel', 'uListen', 'uSpeak', 'uThink', 'uBias']) this.u[n] = gl.getUniformLocation(prog, n);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  resize() {
    const r = this.slot.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.quality;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  setState(s) {
    if (!STATE_TARGETS[s] || s === this.state) return;
    this.state = s;
    this.slot.dataset.orbState = s;
    this.invalidate();
    kick();
  }

  invalidate() { this.dirty = true; }

  destroy() { orbs.delete(this); this.ro.disconnect(); this.io.disconnect(); }

  /** returns true if it wants more frames */
  frame(now) {
    if (this.mode === 'css') return false;
    if (!this.visible || document.hidden || this.glLost) return false;
    if (now - this.last < this.minFrameMs - 1) return true;
    const dt = this.last ? Math.min(now - this.last, 100) : 16;
    this.last = now;

    // ease state mix
    const tgt = STATE_TARGETS[this.state];
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt / 220);
    for (const key in this.mix) this.mix[key] += (tgt[key] - this.mix[key]) * k;

    // level: fast attack, slow release
    let raw = 0;
    if (this.levelSource && this.state !== 'idle') raw = Math.max(0, Math.min(1, this.levelSource() || 0));
    if (this.state === 'thinking') raw = Math.max(raw, 0.18 + 0.1 * Math.sin(now / 160));
    const atk = raw > this.level ? 1 - Math.exp(-dt / 50) : 1 - Math.exp(-dt / 260);
    this.level += (raw - this.level) * atk;

    const active = this.state !== 'idle' || this.level > 0.01;
    if (reduceMotion && !active && !this.dirty) return false;

    const time = reduceMotion ? 6.0 : (now - t0) / 1000;
    const start = performance.now();
    if (this.mode === 'webgl') this.drawGL(time);
    else this.draw2D(time);
    this.dirty = false;

    // dynamic resolution: drop quality if frames are slow, restore when fast
    const cost = performance.now() - start;
    if (cost > 12 && this.quality > 0.55) { if (++this.slow > 20) { this.quality *= 0.85; this.slow = 0; this.resize(); } }
    else this.slow = Math.max(0, this.slow - 1);

    return !reduceMotion || active;
  }

  drawGL(time) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uLevel, this.level);
    gl.uniform1f(u.uListen, this.mix.listen);
    gl.uniform1f(u.uSpeak, this.mix.speak);
    gl.uniform1f(u.uThink, this.mix.think);
    gl.uniform1f(u.uBias, 0.45 * this.mix.listen - 0.55 * this.mix.speak);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  draw2D(time) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.4 * (1 + 0.04 * this.level);
    c.clearRect(0, 0, W, H);
    c.save();
    const glow = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
    glow.addColorStop(0, `rgba(63,140,255,${0.35 + 0.4 * this.level})`);
    glow.addColorStop(1, 'rgba(63,140,255,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
    const body = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    body.addColorStop(0, '#03060f'); body.addColorStop(0.8, '#06102a'); body.addColorStop(1, '#0e3a7a');
    c.fillStyle = body; c.fill();
    c.clip();
    c.globalCompositeOperation = 'lighter';
    const sp = 0.4 + 0.5 * this.mix.speak + 0.3 * this.mix.listen;
    for (let i = 0; i < 3; i++) {
      const a = time * sp * (0.5 + 0.2 * i) + i * 2.1;
      c.save(); c.translate(cx, cy); c.rotate(a); c.scale(1, 0.45 + 0.2 * Math.sin(time * 0.7 + i));
      c.beginPath(); c.arc(0, 0, R * (0.55 + 0.12 * i), -0.9, 1.4);
      c.strokeStyle = i % 2 ? 'rgba(80,230,240,.75)' : 'rgba(160,120,255,.8)';
      c.lineWidth = Math.max(1.5, R * (0.012 + 0.03 * this.level));
      c.shadowColor = c.strokeStyle; c.shadowBlur = R * 0.08;
      c.stroke(); c.restore();
    }
    c.restore();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
    c.strokeStyle = this.mix.speak > 0.5 ? 'rgba(190,170,255,.95)' : 'rgba(150,235,255,.95)';
    c.lineWidth = Math.max(1.5, R * 0.018);
    c.shadowColor = 'rgba(63,140,255,1)'; c.shadowBlur = R * 0.12;
    c.stroke();
    c.shadowBlur = 0;
  }
}
