// ¡SE FUE! · Béisbol arcade caraqueño · Platanus Hack 26: Caracas
// Pitcher vs batter duel; balls in play are simulated with 9 fielders, runners,
// force outs, double plays, steals, errors and a full inning-by-inning scoreboard.

const W = 800, H = 600, TAU = Math.PI * 2, DT = 1 / 60;

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

// ---------- input ----------
const nk = k => (k.length === 1 ? k.toLowerCase() : k);
const K2A = {};
for (const [c, ks] of Object.entries(CABINET_KEYS)) for (const k of ks) K2A[nk(k)] = c;
const held = {}, hit = {};
let clock = 0, lastInput = 0;
window.addEventListener('keydown', e => {
  const c = K2A[nk(e.key)];
  if (!c) return;
  if (!held[c]) hit[c] = 1;
  held[c] = 1;
  lastInput = clock;
  unlock();
});
window.addEventListener('keyup', e => { const c = K2A[nk(e.key)]; if (c) held[c] = 0; });
const pfx = tm => (tm ? 'P2_' : 'P1_');
const hd = (tm, b) => held[pfx(tm) + b];
const pr = (tm, b) => hit[pfx(tm) + b];
const axis = tm => [(hd(tm, 'R') ? 1 : 0) - (hd(tm, 'L') ? 1 : 0), (hd(tm, 'U') ? 1 : 0) - (hd(tm, 'D') ? 1 : 0)];
const any = (...k) => k.some(c => hit[c]);
const DBG = !!window.SEFUE_DEBUG, log = (...a) => DBG && console.log(...a);

// ---------- math ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eo = t => 1 - (1 - t) ** 3;
const eio = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rnd = (a, b) => a + Math.random() * (b - a);
const hyp = Math.hypot;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- game constants ----------
const US = ['#e1ff00', '#ff6ec7'], CH = '#f6ffd6', DIM = '#c7cf9a';
// teams: a nod to the classic Caracas vs Magallanes rivalry (no real marks)
const TEAM = [['FIERAS', 'FIE', 'LAS', 0xf5b800, '#ffc21a'], ['PIRATAS', 'PIR', 'LOS', 0x3f7bff, '#6aa0ff']];
let TC, TS, TN, TA, TL;
function setTeams(p) { const o = [TEAM[p], TEAM[1 - p]]; [TN, TA, TL, TC, TS] = [0, 1, 2, 3, 4].map(i => o.map(t => t[i])); }
setTeams(0);
const PN = ['RECTA', 'CURVA', 'CAMBIO'];
const MPH = [[92, 97], [76, 82], [80, 85]];
const PT = [.66, .82, .96];                       // pitch flight time (s)
const STR = [.9, 1.5, .7];                        // in-flight steering (zone units / s)
const BRK = [[0, .12], [-.55, -.45], [.15, -.38]]; // natural break at the plate
const WIND = .75, SWT = .12, WIN = [.12, .09], RAD = [.5, .33], CUR = 2.7;
const RT = 90 / 26;                               // seconds per base for a runner
const BP = [{ x: 0, y: 0 }, { x: 63.6, y: 63.6 }, { x: 0, y: 127.3 }, { x: -63.6, y: 63.6 }];
const BN = ['EL PLATO', 'PRIMERA', 'SEGUNDA', 'TERCERA', 'EL PLATO'];
const CUT = { x: 0, y: 62 };
// fielders: x, y (feet, home at 0,0, center field +y), speed ft/s
const DEF = [[0, 58, 17], [0, -6, 17], [64, 92, 19], [32, 138, 19], [-32, 138, 19], [-64, 92, 19], [-150, 255, 24], [0, 300, 24], [150, 255, 24]];
const NUMS = [[7, 13, 22, 5, 26, 9, 14, 3, 44], [1, 18, 23, 8, 33, 11, 2, 27, 15]];
const pick = a => a[Math.random() * a.length | 0];

// field projection (camera behind and above home plate)
const D0 = 80, CP = 34080, FP = 483, HZ = 159;
const pj = (x, y, z = 0) => { const d = Math.max(20, y + D0); return [400 + x * FP / d, HZ + (CP - z * FP) / d]; };
const fsc = y => .6 + 1.5 * D0 / (Math.max(-20, y) + D0);
const fenceR = ph => 400 - 70 * Math.min(1, Math.abs(ph) / (Math.PI / 4)) ** 1.5;
// pitch view: strike zone -> screen
const zs = (x, y) => [410 + x * 48, 435 - y * 55];

// ---------- state ----------
let S, bgI, gw, gh, gx, g;
let G = { st: 'title', mode: 0, it: 0, demo: 0 }, P = null, Y = null, FW = [], MSG = null, BAN = null;
let REC = { w: 0, l: 0 }, LB = [], FB = null;

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { create, update },
};
new Phaser.Game(config);

function create() {
  S = this;
  mkTex('pit', pitchBG);
  mkTex('fld', fieldBG);
  bgI = this.add.image(0, 0, 'fld').setOrigin(0).setDepth(0);
  gw = this.add.graphics().setDepth(1);
  gh = this.add.graphics().setDepth(2);
  gx = this.add.graphics().setDepth(6);
  loadRec(); loadLB();
}

function update(_, delta) {
  const dt = Math.min(delta, 50) / 1000;
  clock += dt;
  ti = 0; gw.clear(); gh.clear(); gx.clear();
  if (G.st === 'title') title(dt);
  else if (G.st === 'pick') pickScreen(dt);
  else if (G.st === 'over') overScreen(dt);
  else inGame(dt);
  stepFW(dt);
  for (let i = ti; i < tp.length; i++) tp[i].setVisible(false);
  for (const k in hit) delete hit[k];
}

// ---------- pixel text ----------
const FONT = 'px "Arial Black","Arial Bold",Arial,Helvetica,sans-serif';
const tp = [], TW = {};
let ti = 0, mctx;
function tk(str, col, fs = 12) {
  const key = 't' + fs + col + str, f = '900 ' + fs + FONT, h = Math.ceil(fs * 1.42);
  if (TW[key]) return key;
  mctx = mctx || document.createElement('canvas').getContext('2d');
  mctx.font = f;
  const w = Math.max(1, Math.ceil(mctx.measureText(str).width) + 4), c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.font = f; x.fillStyle = col; x.fillText(str, 2, Math.round(fs * 1.08));
  const d = x.getImageData(0, 0, w, h), a = d.data;
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 96 ? 255 : 0;
  x.putImageData(d, 0, 0);
  S.textures.addCanvas(key, c).setFilter(Phaser.Textures.FilterMode.NEAREST);
  TW[key] = w;
  return key;
}
const tw = (str, s) => TW[tk(String(str), CH)] * s;
function T(str, x, y, s = 2, col = CH, ox = .5, sh, al = 1, dp = 3, fs) {
  str = String(str);
  const o = s * (fs || 12) / 12;
  if (sh) T(str, x + o, y + o, s, sh, ox, 0, al, dp, fs);
  const key = tk(str, col, fs);
  let im = tp[ti++];
  if (!im) tp.push(im = S.add.image(0, 0, key));
  im.setTexture(key).setPosition(x, y).setScale(s).setOrigin(ox, .5).setAlpha(al).setDepth(dp).setVisible(true);
}

// ---------- graphics helpers ----------
const fc = (c, a) => g.fillStyle(c, a);
function el(x, y, rx, ry, c, a) { fc(c, a); g.fillEllipse(x, y, rx * 2, ry * 2); }
function rc(x, y, w, h, c, a) { fc(c, a); g.fillRect(x, y, w, h); }
function rr(x, y, w, h, r, c, a) { fc(c, a); g.fillRoundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)); }
function pl(c, a, ...p) { const v = []; for (let i = 0; i < p.length; i += 2) v.push({ x: p[i], y: p[i + 1] }); fc(c, a); g.fillPoints(v, true); }
function ln(x1, y1, x2, y2, w, c, a = 1) { g.lineStyle(w, c, a); g.lineBetween(x1, y1, x2, y2); }
function thick(x1, y1, x2, y2, w, c) { ln(x1, y1, x2, y2, w, c); el(x1, y1, w / 2, w / 2, c); el(x2, y2, w / 2, w / 2, c); }
function box(x, y, w, h, col = 0xe1ff00) { rr(x, y, w, h, 8, 0x04050c, .86); g.lineStyle(2, col, .5); g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 8); }

// ---------- static backgrounds (canvas 2D, drawn once) ----------
function mkTex(k, fn) { const c = document.createElement('canvas'); c.width = W; c.height = H; fn(c.getContext('2d')); S.textures.addCanvas(k, c); }
function e2(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function path2(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
function p2(c, pts, col) { path2(c, pts); c.fillStyle = col; c.fill(); }
function lg(c, y0, y1, a, b) { const q = c.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
function glow(c, x, y, r, a) { const q = c.createRadialGradient(x, y, 2, x, y, r); q.addColorStop(0, 'rgba(255,253,225,' + a + ')'); q.addColorStop(1, 'rgba(255,253,225,0)'); c.fillStyle = q; c.fillRect(x - r, y - r, r * 2, r * 2); }
function vig(c, s) { const q = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .9); q.addColorStop(0, 'rgba(0,0,0,0)'); q.addColorStop(1, 'rgba(0,0,0,' + s + ')'); c.fillStyle = q; c.fillRect(0, 0, W, H); }
function crowd(c, R, y0, y1, dens) {
  const cols = ['#e1ff00', '#ff6ec7', '#ffffff', '#5ad1ff', '#ff8a3d', '#8b8fb5'];
  for (let y = y0; y < y1; y += 5) for (let x = (y / 5 % 2) * 2; x < W; x += 5) if (R() < dens) { c.globalAlpha = .25 + R() * .45; c.fillStyle = cols[R() * 6 | 0]; c.fillRect(x, y, 3, 3); }
  c.globalAlpha = 1;
}
function circ(cx, cy, r, n = 40) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; o.push(pj(cx + r * Math.cos(a), cy + r * Math.sin(a))); } return o; }

function pitchBG(a) {
  const R = rng(26);
  a.fillStyle = lg(a, 0, 200, '#04061a', '#1d2350'); a.fillRect(0, 0, W, 210);
  for (const lx of [118, 682]) {
    glow(a, lx, 46, 130, .6);
    a.fillStyle = '#2b2e44'; a.fillRect(lx - 2, 58, 4, 64);
    a.fillStyle = '#fffbe0'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) a.fillRect(lx - 22 + i * 11, 32 + j * 9, 9, 7);
  }
  a.fillStyle = '#14162a'; a.fillRect(0, 118, W, 76);
  crowd(a, R, 122, 190, .72);
  a.fillStyle = '#0c4a2b'; a.fillRect(0, 192, W, 16);
  a.fillStyle = '#e1ff00'; a.fillRect(0, 192, W, 2); a.fillRect(24, 110, 4, 98); a.fillRect(772, 110, 4, 98);
  a.fillStyle = lg(a, 208, H, '#1b6633', '#2f9d4b'); a.fillRect(0, 208, W, H - 208);
  for (let k = 0; k < 16; k += 2) { const y0 = 208 + (k / 16) ** 1.8 * 392, y1 = 208 + ((k + 1) / 16) ** 1.8 * 392; a.fillStyle = 'rgba(255,255,255,.05)'; a.fillRect(0, y0, W, y1 - y0); }
  e2(a, 400, 332, 350, 94, '#b06f3a'); e2(a, 400, 324, 236, 54, '#23803d');
  e2(a, 400, 289, 52, 14, '#c2844b'); a.fillStyle = '#f4f4f4'; a.fillRect(389, 285, 22, 3);
  e2(a, 400, 572, 250, 74, '#b06f3a');
  a.strokeStyle = 'rgba(255,255,255,.7)'; a.lineWidth = 3; a.strokeRect(226, 522, 122, 96); a.strokeRect(452, 522, 122, 96);
  p2(a, [[364, 540], [436, 540], [442, 556], [400, 574], [358, 556]], '#f4f4f4');
  vig(a, .5);
}

function fieldBG(b) {
  const R = rng(58);
  b.fillStyle = lg(b, 0, 220, '#02040e', '#1a2552'); b.fillRect(0, 0, W, H);
  b.save(); b.translate(0, -46);
  for (let i = 0; i < 110; i++) { b.fillStyle = 'rgba(255,255,255,' + (.15 + R() * .6) + ')'; const s = R() < .15 ? 2 : 1.2; b.fillRect(R() * W, R() * 140, s, s); }
  // El Ávila, with the Hotel Humboldt tower and the cable car
  const far = x => 140 - 60 * Math.exp(-(((x - 575) / 120) ** 2)) - 34 * Math.exp(-(((x - 300) / 95) ** 2)) + 10 * Math.sin(x / 41) + 6 * Math.sin(x / 13);
  const near = x => 176 - 44 * Math.exp(-(((x - 300) / 85) ** 2)) - 20 * Math.exp(-(((x - 620) / 150) ** 2)) + 8 * Math.sin(x / 27 + 1) + 3 * Math.sin(x / 9);
  for (const [f, col] of [[far, '#1c2b55'], [near, '#0f1d38']]) { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 4) pts.push([x, f(x)]); pts.push([W, 300]); p2(b, pts, col); }
  const hy = near(300) + 4;
  b.fillStyle = '#0a1428'; b.fillRect(293, hy - 40, 14, 40); b.fillRect(290, hy - 44, 20, 5);
  b.fillStyle = 'rgba(255,226,140,.85)'; for (let r = 0; r < 8; r++) for (let k = 0; k < 3; k++) if (R() < .6) b.fillRect(295 + k * 4, hy - 37 + r * 4.4, 2, 2);
  b.strokeStyle = 'rgba(220,230,255,.28)'; b.lineWidth = 1; b.beginPath(); b.moveTo(20, 240); b.quadraticCurveTo(160, 222, 296, hy - 6); b.stroke();
  for (const q of [.3, .62]) { const x = (1 - q) ** 2 * 20 + 2 * (1 - q) * q * 160 + q * q * 296, y = (1 - q) ** 2 * 240 + 2 * (1 - q) * q * 222 + q * q * (hy - 6); b.fillStyle = '#ff5a4f'; b.fillRect(x - 3, y + 1, 6, 5); }
  // Caracas skyline + Parque Central towers
  for (let x = -10; x < W;) { const w = 12 + R() * 30, h = 10 + R() * 36; b.fillStyle = '#0a0f22'; b.fillRect(x, 246 - h, w, h + 60); b.fillStyle = 'rgba(255,220,130,.7)'; for (let i = 0; i < w * h / 60; i++) if (R() < .5) b.fillRect(x + 2 + R() * (w - 4) | 0, 246 - h + 2 + R() * (h - 2) | 0, 2, 2); x += w + 1; }
  for (const tx of [616, 646]) { b.fillStyle = '#0b1126'; b.fillRect(tx, 156, 20, 140); b.fillStyle = 'rgba(255,226,150,.75)'; for (let r = 0; r < 20; r++) for (let k = 0; k < 3; k++) if (R() < .45) b.fillRect(tx + 3 + k * 6, 160 + r * 4.3, 2, 2); }
  b.restore();
  // stands + fence
  const fp = [], wt = [];
  for (let i = 0; i <= 64; i++) {
    const ph = -1.3 + 2.6 * i / 64, r = Math.abs(ph) > Math.PI / 4 ? 330 : fenceR(ph);
    fp.push(pj(r * Math.sin(ph), r * Math.cos(ph)));
    wt.push(pj((r - 13) * Math.sin(ph), (r - 13) * Math.cos(ph)));
  }
  const st = [...fp.map(([x, y]) => [x, y - 50]), ...fp.slice().reverse()];
  p2(b, st, '#121425');
  b.save(); path2(b, st); b.clip(); crowd(b, R, 200, 420, .62); b.restore();
  glow(b, 100, 200, 110, .5); glow(b, 700, 200, 110, .5);
  b.fillStyle = '#fffbe0'; b.fillRect(84, 194, 32, 10); b.fillRect(684, 194, 32, 10);
  b.save(); path2(b, [...fp, [W + 600, H + 80], [-600, H + 80]]); b.clip();
  b.fillStyle = lg(b, 270, H, '#1a6431', '#2f9d4b'); b.fillRect(0, 0, W, H);
  for (let r = 30; r < 420; r += 48) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const ph = -1.3 + 2.6 * i / 40; pts.push(pj(r * Math.sin(ph), r * Math.cos(ph))); }
    for (let i = 40; i >= 0; i--) { const ph = -1.3 + 2.6 * i / 40; pts.push(pj((r + 24) * Math.sin(ph), (r + 24) * Math.cos(ph))); }
    p2(b, pts, 'rgba(255,255,255,.045)');
  }
  p2(b, [...fp, ...wt.slice().reverse()], '#9c6a3c');
  b.save(); path2(b, [pj(0, -4), pj(-330, 330), pj(330, 330)]); b.clip(); p2(b, circ(0, 60.5, 95, 64), '#b06f3a'); b.restore();
  p2(b, [pj(0, 12.7), pj(50.9, 63.6), pj(0, 114.5), pj(-50.9, 63.6)], '#23803d');
  p2(b, circ(0, 0, 13), '#b06f3a');
  p2(b, circ(0, 60.5, 9), '#c2844b');
  b.strokeStyle = 'rgba(255,255,255,.9)'; b.lineWidth = 2.2;
  for (const s of [-1, 1]) { const [x0, y0] = pj(0, 0), [x1, y1] = pj(s * 233.3, 233.3); b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y1); b.stroke(); }
  b.lineWidth = 1.5; b.strokeStyle = 'rgba(255,255,255,.7)';
  for (const s of [-1, 1]) { path2(b, [pj(s * 2.5, -3), pj(s * 6.5, -3), pj(s * 6.5, 3), pj(s * 2.5, 3)]); b.stroke(); }
  for (let i = 1; i < 4; i++) { const { x, y } = BP[i]; p2(b, [pj(x, y - 2.4), pj(x + 2.4, y), pj(x, y + 2.4), pj(x - 2.4, y)], '#ffffff'); }
  p2(b, [pj(-.7, .6), pj(.7, .6), pj(.7, 0), pj(0, -.7), pj(-.7, 0)], '#ffffff');
  b.restore();
  b.strokeStyle = '#e1ff00'; b.lineWidth = 2;
  b.beginPath(); fp.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y))); b.stroke();
  b.lineWidth = 3;
  for (const s of [-1, 1]) { const [x0, y0] = pj(s * 233.3, 233.3), [, y1] = pj(s * 233.3, 233.3, 45); b.beginPath(); b.moveTo(x0, y0); b.lineTo(x0, y1); b.stroke(); }
  vig(b, .45);
}

// ---------- sound (Web Audio through Phaser's context) ----------
let AC, NB;
function unlock() { try { AC = AC || (S && S.sound && S.sound.context); if (AC && AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; } }
function tone(f, d, ty = 'square', v = .06, sl = 0, dl = 0) {
  if (!AC) return;
  const t = AC.currentTime + dl, o = AC.createOscillator(), n = AC.createGain();
  o.type = ty; o.frequency.setValueAtTime(f, t);
  if (sl) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + sl), t + d);
  n.gain.setValueAtTime(v, t); n.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(n).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, v, ff, ty = 'bandpass', dl = 0, att = .005) {
  if (!AC) return;
  nbuf();
  const t = AC.currentTime + dl, s = AC.createBufferSource(), f = AC.createBiquadFilter(), n = AC.createGain();
  s.buffer = NB; f.type = ty; f.frequency.value = ff;
  n.gain.setValueAtTime(.0001, t); n.gain.linearRampToValueAtTime(v, t + att); n.gain.exponentialRampToValueAtTime(.001, t + d);
  s.connect(f).connect(n).connect(AC.destination); s.start(t); s.stop(t + d + .05);
}
function nbuf() { if (!NB) { NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const a = NB.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; } }
// crowd murmur loop while a game is on
let AMB;
function amb(on) {
  try {
    if (on && AC && !AMB) { nbuf(); const s = AC.createBufferSource(), f = AC.createBiquadFilter(), n = AC.createGain(); s.buffer = NB; s.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = .7; n.gain.value = .035; s.connect(f).connect(n).connect(AC.destination); s.start(); AMB = s; }
    if (!on && AMB) { AMB.stop(); AMB = null; }
  } catch (e) { AMB = null; }
}
// crowd signs in the stands (pitch view and field view)
let GR = null;
const grada = (t, col = CH, d = 2) => { GR = { t, col, k: clock, d }; };
function gradaHud(y) {
  if (!GR || clock - GR.k > GR.d) return;
  const e = clock - GR.k, a = Math.min(1, (GR.d - e) * 3), sc = 1.2 + (e % .6 < .3 ? .12 * (1 - e % .6 / .3) : 0);
  if (GR.t.length > 12) return T(GR.t, 400, y, sc, GR.col, .5, '#000', a, 3, 24);
  T(GR.t, 230, y, sc, GR.col, .5, '#000', a, 3, 24); T(GR.t, 570, y, sc, GR.col, .5, '#000', a, 3, 24);
}
// crowd voice: detuned saws through two vowel formants ('o' = 500/900 Hz, 'e' = 450/1900 Hz)
function voice(dl, f1, f2, pitch, amp, dur = .24) {
  const t = AC.currentTime + dl, out = AC.createGain();
  out.gain.setValueAtTime(.0001, t); out.gain.linearRampToValueAtTime(amp, t + .03); out.gain.exponentialRampToValueAtTime(.001, t + dur);
  out.connect(AC.destination);
  for (const f of [f1, f2]) {
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; bp.connect(out);
    for (let i = 0; i < 7; i++) { const o = AC.createOscillator(), st = t + Math.random() * .05; o.type = 'sawtooth'; o.frequency.setValueAtTime(pitch * rnd(.85, 1.2), st); o.frequency.linearRampToValueAtTime(pitch * .9, st + dur); o.connect(bp); o.start(st); o.stop(st + dur + .05); }
  }
}
function chant() {
  if (!AC) return;
  for (const d of [0, .9]) {
    noise(.04, .25, 300, 'lowpass', d);
    voice(d, 500, 900, 230, .35);
    noise(.08, .3, 3200, 'highpass', d + .26);
    voice(d + .3, 450, 1900, 190, .3, .3);
  }
}
const sfx = {
  crack() { noise(.14, .8, 2600, 'highpass'); tone(1500, .06, 'square', .07, -700); },
  mitt() { noise(.09, .55, 450, 'lowpass'); },
  strike() { tone(700, .1, 'sawtooth', .05, -250); },
  ball() { tone(330, .08, 'triangle', .06); },
  out() { tone(330, .12, 'square', .05); tone(220, .22, 'square', .05, 0, .12); },
  safe() { tone(523, .08, 'square', .05); tone(784, .14, 'square', .05, 0, .08); },
  cheer(d = 1.8) { noise(d, .22, 900, 'bandpass', 0, .25); noise(d * .8, .12, 2400, 'bandpass', .1, .3); },
  charge() { [392, 523, 659, 784, 659, 784].forEach((f, i) => tone(f, i === 5 ? .5 : .15, 'triangle', .09, 0, i * .16)); },
  sel() { tone(880, .07, 'square', .05); },
  mv() { tone(520, .04, 'square', .03); },
  ooh() { if (AC) voice(0, 330, 800, 200, .22, .8); },
};

// ---------- storage ----------
const SKEY = 'se-fue-record-v1';
function store() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(k) { try { const r = localStorage.getItem(k); return r === null ? { found: false, value: null } : { found: true, value: JSON.parse(r) }; } catch (e) { return { found: false, value: null }; } },
    async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
}
const okN = n => Number.isInteger(n) && n >= 0 && n < 1e6;
function loadRec() {
  Promise.resolve().then(() => store().get(SKEY)).then(r => { const v = r && r.value; if (v && okN(v.w) && okN(v.l)) REC = { w: v.w, l: v.l }; }).catch(() => { });
}
function saveRec() { Promise.resolve().then(() => store().set(SKEY, REC)).catch(() => { }); }
const LKEY = 'se-fue-derby-v1';
const okE = e => e && typeof e.n === 'string' && /^[A-Z]{3}$/.test(e.n) && okN(e.h) && e.h < 100 && okN(e.d) && e.d < 1000;
const lbSort = a => a.sort((x, y) => y.h - x.h || y.d - x.d).slice(0, 5);
function loadLB() {
  Promise.resolve().then(() => store().get(LKEY)).then(r => { const v = r && r.value; if (Array.isArray(v)) LB = lbSort(v.filter(okE).map(e => ({ n: e.n, h: e.h, d: e.d }))); }).catch(() => { });
}
function saveLB() { Promise.resolve().then(() => store().set(LKEY, LB)).catch(() => { }); }

// ---------- game flow ----------
const tname = tm => (G.demo ? 'CPU ' + (tm + 1) : tm === 0 ? 'P1' : G.hum[1] ? 'P2' : 'CPU');
function say(a, b = '', col = CH, d = 1.6) { MSG = { a, b, col, t: d }; }

function newGame(players, mode, demo) {
  G = { st: 'pitch', mode, demo, N: mode ? 9 : 3, inn: 1, half: 0, outs: 0, b: 0, s: 0, bases: [0, 0, 0, 0], score: [0, 0], line: [[], []], hits: [0, 0], errs: [0, 0], hum: demo ? [0, 0] : [1, players === 2 ? 1 : 0], inR: 0, ln: [0, 0], pause: 0, it: 0 };
  lastInput = clock; amb(1);
  startHalf();
}
function newDerby(pl) {
  G = { st: 'pitch', derby: 1, mode: 2, demo: 0, N: 1, inn: 1, half: pl, outs: 0, b: 0, s: 0, bases: [0, 0, 0, 0], score: [0, 0], line: [[], []], hits: [0, 0], errs: [0, 0], hum: pl ? [0, 1] : [1, 0], inR: 0, ln: [0, 0], pause: 0, it: 0, dl: 60, hrN: 0, best: 0 };
  lastInput = clock; amb(1);
  BAN = { a: 'DERBY DE JONRONES', b: '60 SEGUNDOS · ¡SÁCALA DEL ESTADIO!', col: TS[pl], t: 2.2 };
  newPitch(2.2);
}
function newBatter() {
  G.b = G.s = 0; G.ln[G.half]++;
  if (!G.derby && G.outs < 3) { if (G.bases[2] || G.bases[3]) sfx.charge(); grada('¡VAMOS ' + TN[G.half] + '!', TS[G.half], 2); }
}
function startHalf() {
  G.outs = 0; G.bases = [0, 0, 0, 0]; G.b = G.s = 0; G.inR = 0; G.st = 'pitch';
  const bt = G.half;
  BAN = { a: (bt ? 'BAJA' : 'ALTA') + ' DEL ' + G.inn + (G.inn > G.N ? ' · EXTRA' : ''), b: 'BATEAN ' + TL[bt] + ' ' + TN[bt] + ' · ' + tname(bt), col: TS[bt], t: 2.2 };
  newPitch(2.2);
}
function newPitch(delay = 0) {
  P = { ph: 'ready', t: -delay, type: 0, bx: 0, by: 0, cx: 0, cy: 0, sw: null, swc: 0, steal: 0, aiD: rnd(.8, 1.5), sx: 0, sy: 0, aiT: null, aiGo: 0, Tf: 1, mph: 0, hold: 0 };
}
function endHalf() {
  const bt = G.half;
  G.line[bt][G.inn - 1] = G.inR;
  log('END HALF', G.inn, bt, 'runs', G.inR, 'score', G.score.join('-'));
  if (bt === 0) { if (G.inn >= G.N && G.score[1] > G.score[0]) return gameOver(); G.half = 1; }
  else { if (G.inn >= G.N && G.score[0] !== G.score[1]) return gameOver(); G.inn++; G.half = 0; }
  startHalf();
}
function gameOver() {
  G.st = 'over'; G.ot = 0;
  const w = G.score[0] > G.score[1] ? 0 : 1;
  G.win = w;
  log('GAME OVER', G.score.join('-'), 'H', G.hits.join('-'), 'E', G.errs.join('-'), 'line', JSON.stringify(G.line));
  if (!G.demo && G.hum[0] && !G.hum[1]) { if (w === 0) REC.w++; else REC.l++; saveRec(); }
  for (let i = 0; i < 6; i++) burst(rnd(150, 650), rnd(80, 220), TC[w], i * .25);
  sfx.charge(); sfx.cheer(2.5);
}
function toTitle() { G = { st: 'title', mode: G.mode || 0, it: 0, demo: 0 }; MSG = BAN = FB = GR = null; Y = null; amb(0); }
function runScores(n = 1) {
  G.score[G.half] += n; G.inR += n;
}
const walkOff = () => G.half === 1 && G.inn >= G.N && G.score[1] > G.score[0];
const stealBase = () => (G.bases[1] && !G.bases[2] ? 1 : G.bases[2] && !G.bases[3] && !G.bases[1] ? 2 : 0);

function inGame(dt) {
  if (G.demo) {
    if (any('START1', 'START2', 'P1_1', 'P2_1')) { toTitle(); return; }
  } else {
    if (any('START1', 'START2')) { G.pause = !G.pause; sfx.sel(); }
    if (G.pause && any('P1_1', 'P2_1')) { toTitle(); return; }
    if (clock - lastInput > 120) { toTitle(); return; }
  }
  if (!G.pause) {
    if (BAN) BAN.t -= dt;
    if (MSG) MSG.t -= dt;
    if (G.st === 'pitch') stepPitch(dt);
    else if (G.st === 'rep') stepReplay(dt);
    else if (G.st === 'play' || G.st === 'post') {
      const fast = G.st === 'play' && (hd(0, '3') || hd(1, '3')) ? 3 : G.st === 'play' && Y.bm !== 'path' && !Y.hr && !G.hum[1 - G.half] ? 2 : 1;
      for (let i = 0; i < fast && (G.st === 'play' || G.st === 'post'); i++) { const k = G.slow > 0 ? .4 : 1; G.slow -= dt * k; stepPlay(dt * k); }
    }
  }
  if (G.st === 'dend') return derbyEnd(dt);
  if (G.st === 'pitch') drawPitch(); else if (G.st === 'play' || G.st === 'post') drawField(); else if (G.st === 'rep') drawReplay();
  if (G.st === 'over' || G.st === 'title') return;
  hudMsgs();
  if (G.demo && clock % 1.2 < .8) { g = gh; rr(14, 560, 232, 28, 8, 0x000000, .75); T('DEMO · PRESIONA START', 130, 574, 1.4, US[0]); }
  if (G.pause) {
    g = gx; rc(0, 0, W, H, 0x000000, .6);
    T('PAUSA', 400, 250, 2.5, US[0], .5, US[1], 1, 7, 24);
    T('START: SEGUIR   ·   BOTÓN 1: SALIR', 400, 330, 1.8, CH, .5, 0, 1, 7);
  }
}

// ---------- the pitch ----------
function aiPitch() {
  if (G.derby) { P.sx = P.sy = 0; return throwPitch(Math.random() < .65 ? 0 : 2, rnd(-.55, .55), rnd(-.55, .55)); }
  const r = Math.random(), three = G.b === 3;
  const type = three ? (r < .75 ? 0 : 2) : r < .46 ? 0 : r < .76 ? 1 : 2;
  let x = rnd(-.85, .85), y = rnd(-.85, .85);
  if (!three && Math.random() < (G.s === 2 ? .45 : .24)) { if (Math.random() < .5) x = Math.sign(x || 1) * rnd(1.2, 1.6); else y = Math.sign(y || 1) * rnd(1.2, 1.6); }
  P.sx = rnd(-.5, .5); P.sy = rnd(-.5, .5);
  throwPitch(type, x, y);
}
function throwPitch(type, x, y) {
  Object.assign(P, { type, bx: x, by: y, ph: 'wind', t: 0, Tf: PT[type], mph: Math.round(rnd(...MPH[type])) });
}
function aiBat() {
  const fx = P.bx + BRK[P.type][0] + P.sx * .4, fy = P.by + BRK[P.type][1] + P.sy * .4;
  const inZ = Math.abs(fx) <= 1.05 && Math.abs(fy) <= 1.05;
  P.aiX = fx + rnd(-.27, .27); P.aiY = fy + rnd(-.27, .27); P.aiGo = 1;
  if (Math.random() > (inZ ? (G.s === 2 ? .92 : .78) : (G.s === 2 ? .36 : .17))) return;
  let err = rnd(-.1, .1);
  if (P.type === 2 && Math.random() < .55) err -= .1;
  P.aiT = P.Tf - SWT + err;
  P.aiPw = G.b > G.s && Math.random() < .55 ? 1 : 0;
}
function stepPitch(dt) {
  P.t += dt;
  const bt = G.half, ft = 1 - bt, hb = G.hum[bt], hf = G.hum[ft];
  if (P.ph === 'ready' || P.ph === 'wind' || P.ph === 'fly') {
    let [mx, my] = hb ? axis(bt) : [0, 0];
    if (!hb && P.aiGo) { mx = clamp((P.aiX - P.cx) * 8, -1, 1); my = clamp((P.aiY - P.cy) * 8, -1, 1); }
    P.cx = clamp(P.cx + mx * CUR * dt, -1.6, 1.6); P.cy = clamp(P.cy + my * CUR * dt, -1.6, 1.6);
    if (hb && !hf && P.ph === 'fly') { const k = Math.min(1, dt * 1.6); P.cx += (P.bx + BRK[P.type][0] - P.cx) * k; P.cy += (P.by + BRK[P.type][1] - P.cy) * k; }
  }
  if (G.derby && P.t > 0 && P.ph !== 'hit') { G.dl -= dt; if (G.dl <= 0 && P.ph === 'ready') return toDerbyEnd(); }
  if (P.ph === 'ready') {
    if (P.t < 0) return;
    if (G.s === 2 && !P.ch) { P.ch = clock; chant(); grada('¡PON-CHE!', CH, 1.9); }
    if (stealBase() && G.outs < 2) {
      if (hb && pr(bt, '3')) { P.steal = !P.steal; sfx.sel(); }
      if (!hb && !P.sd) { P.sd = 1; P.steal = Math.random() < .08; }
    }
    if (hf && P.t > .35) {
      for (let i = 0; i < 3; i++) if (pr(ft, String(i + 1))) {
        const [ax, ay] = axis(ft);
        throwPitch(i, ax ? ax * .78 + rnd(-.12, .12) : rnd(-.35, .35), ay ? ay * .78 + rnd(-.12, .12) : rnd(-.35, .35));
        sfx.sel(); return;
      }
      if (P.t > 10) aiPitch();
    } else if (!hf && P.t > P.aiD) aiPitch();
  } else if (P.ph === 'wind') {
    if (P.t >= WIND) { P.ph = 'fly'; P.t = 0; if (!hb) aiBat(); }
  } else if (P.ph === 'fly') {
    const p = P.t / P.Tf;
    if (p < .8) {
      const [sx, sy] = hf ? axis(ft) : [P.sx, P.sy];
      P.bx = clamp(P.bx + sx * STR[P.type] * dt, -1.9, 1.9); P.by = clamp(P.by + sy * STR[P.type] * dt, -1.9, 1.9);
    }
    if (!P.sw) {
      if (hb) { if (pr(bt, '1')) P.sw = { t: P.t, pw: 0 }; else if (pr(bt, '2')) P.sw = { t: P.t, pw: 1 }; }
      else if (P.aiT !== null && P.t >= P.aiT) P.sw = { t: P.t, pw: P.aiPw };
      if (P.sw) P.swc = clock;
    }
    if (P.t >= P.Tf) {
      const sw = P.sw, tc = sw ? sw.t + SWT : 0;
      if (!sw || tc < P.Tf - WIN[sw.pw] || tc > P.Tf + WIN[sw.pw] || P.t >= tc) resolvePitch();
    }
  } else if (P.ph === 'hit') {
    if (P.t > P.hs + .22) { G.st = 'play'; S.cameras.main.flash(160, 255, 255, 255); }
  } else if (P.ph === 'res') {
    if (P.t > P.hold) {
      if (walkOff()) { G.line[1][G.inn - 1] = G.inR; return gameOver(); }
      if (G.outs >= 3) return endHalf();
      if (P.done) newBatter();
      newPitch();
    }
  }
}
function resolvePitch() {
  const fx = P.bx + BRK[P.type][0], fy = P.by + BRK[P.type][1];
  P.fx = fx; P.fy = fy;
  if (P.sw) {
    const pw = P.sw.pw, dtm = P.sw.t + SWT - P.Tf, r = RAD[pw], dx = fx - P.cx, dy = fy - P.cy, d = hyp(dx, dy), ok = Math.abs(dtm) <= WIN[pw];
    if (ok && d <= r) return contact(pw, dtm / WIN[pw], 1 - d / r, dy / r);
    fb(!ok ? (dtm < 0 ? 'MUY TEMPRANO' : 'MUY TARDE') : 'LEJOS DE LA BOLA', '#ff8a3d');
    return call('swing');
  }
  call(Math.abs(fx) <= 1.08 && Math.abs(fy) <= 1.08 ? 'strike' : 'ball');
}
function fb(t, c) { if (G.hum[G.half]) FB = { t, c, k: clock }; }
function call(kind) {
  const bt = G.half;
  let a = '', b = '', col = CH, walked = 0;
  P.ph = 'res'; P.t = 0; P.hold = .85;
  if (G.derby) { if (kind === 'foul') { sfx.crack(); P.foul = 1; } else sfx.mitt(); P.hold = .5; return say(kind === 'ball' ? 'BOLA' : kind === 'foul' ? 'FOUL' : 'STRIKE', '', CH, .5); }
  if (kind === 'ball') {
    sfx.mitt(); sfx.ball();
    if (++G.b >= 4) {
      walked = P.done = 1; a = 'BASE POR BOLAS'; col = TS[bt];
      const B = G.bases;
      if (B[1]) { if (B[2]) { if (B[3]) { runScores(); b = '¡ANOTA CON LAS BASES LLENAS!'; } B[3] = 1; } B[2] = 1; }
      B[1] = 1;
    } else a = 'BOLA';
  } else if (kind === 'foul') {
    sfx.crack(); a = 'FOUL'; P.foul = 1;
    if (G.s < 2) G.s++;
  } else {
    sfx.mitt(); sfx.strike();
    if (++G.s >= 3) { P.done = 1; G.outs++; a = kind === 'swing' ? pick(['¡PONCHADO!', '¡ABANICÓ!']) : '¡PONCHADO MIRANDO!'; col = '#ff5a4f'; P.hold = 1.3; sfx.ooh(); grada('¡PON-CHA-DO!', '#ff5a4f'); }
    else a = kind === 'swing' ? 'STRIKE · ABANICÓ' : 'STRIKE';
  }
  const sb = stealBase();
  if (P.steal && sb && kind !== 'foul' && !walked) {
    G.bases[sb] = 0;
    if (Math.random() < clamp(.62 + [-.1, .1, .12][P.type] - (sb === 2 ? .15 : 0), .15, .9)) { G.bases[sb + 1] = 1; b = '¡SE ROBA LA ' + BN[sb + 1] + '!'; sfx.safe(); }
    else { G.outs++; b = 'OUT ROBANDO ' + BN[sb + 1]; sfx.out(); }
    P.hold = 1.4;
  }
  say(a, b, col, P.hold);
  log('PITCH', PN[P.type], kind, 'count', G.b + '-' + G.s, 'outs', G.outs);
}
function contact(pw, tq, q, dy) {
  sfx.crack();
  const sp = (tq * 50 + rnd(-5, 5)) * Math.PI / 180;
  const la = clamp((pw ? 24 : 14) + dy * 48 + rnd(-5, 5), -30, 75) * Math.PI / 180;
  const ev = (pw ? 185 : 145) * (.45 + .55 * q) * (1 - .15 * Math.abs(tq));
  if (Math.abs(sp) > Math.PI / 4 || q < .08) { fb(tq < 0 ? 'TEMPRANO' : 'TARDE', '#ffd23f'); return call('foul'); }
  const perf = q > .82 && Math.abs(tq) < .25;
  fb(perf ? '¡PERFECTO!' : Math.abs(tq) < .3 ? '¡JUSTO!' : tq < 0 ? 'TEMPRANO' : 'TARDE', perf || Math.abs(tq) < .3 ? '#7dff6b' : '#ffd23f');
  P.ph = 'hit'; P.t = 0; P.hsp = sp; P.hla = la; P.hs = perf ? .15 : .06 + q * .04;
  S.cameras.main.shake(140 + q * 180, .004 + q * .011);
  G.slow = perf ? 1.2 : 0;
  startPlay(ev, la, sp);
  log('CONTACT', 'ev', ev.toFixed(0), 'la', (la * 57.3).toFixed(0), 'sp', (sp * 57.3).toFixed(0), 'q', q.toFixed(2));
}

// ---------- ball in play ----------
function simBall(vx, vy, vz) {
  let x = 0, y = 1.5, z = 3, ld = 0, hr = 0, land = 1e9, hrI = 1e9, zmax = 3, maxd = 0, hrd = 0;
  const path = [];
  for (let i = 0; i < 640; i++) {
    path.push([x, y, z, ld]);
    if (z > 0 || vz > 0) { const s = hyp(vx, vy, vz) * .002; vx -= s * vx * DT; vy -= s * vy * DT; vz -= (28 + s * vz) * DT; }
    x += vx * DT; y += vy * DT; z += vz * DT;
    zmax = Math.max(zmax, z);
    if (z <= 0) {
      z = 0;
      if (!ld) { ld = 1; land = i + 1; }
      if (hr) break;
      if (vz < -7) { vz = -vz * .42; vx *= .82; vy *= .82; }
      else { vz = 0; const s = hyp(vx, vy), ns = Math.max(0, s - 16 * DT); if (s > 0) { vx *= ns / s; vy *= ns / s; } }
    }
    const r = hyp(x, y), ph = Math.atan2(x, y);
    if (!hr && Math.abs(ph) < .8 && r > fenceR(ph)) {
      if (z > 10 && !ld) { hr = 1; hrI = i; }
      else {
        const ux = x / r, uy = y / r, vr = vx * ux + vy * uy, fr = fenceR(ph) - .5;
        if (vr > 0) { vx -= 1.4 * vr * ux; vy -= 1.4 * vr * uy; }
        x = ux * fr; y = uy * fr;
      }
    }
    if (hr) hrd = r; else maxd = Math.max(maxd, r);
  }
  return { path, land, hr, hrI, zmax, maxd, hrd: Math.round(hrd) };
}
function startPlay(ev, la, sp) {
  const cl = Math.cos(la), sim = simBall(ev * cl * Math.sin(sp), ev * cl * Math.cos(sp), ev * Math.sin(la));
  Y = Object.assign(sim, {
    t: 0, F: DEF.map(([x, y, s]) => ({ x, y, s, tx: x, ty: y, run: 0 })), bm: 'path', fk: -1, hk: -1, ft: 1e9, air: 0, err: 0, hold: 0, th: null,
    outs: 0, runs: 0, fc: 0, end: 0, caught: 0, landed: 0, la: la * 57.3, sp, long: sim.maxd > 300 || sim.hr, cancel: 0, R: [], post: 0
  });
  const B = G.bases, fo = [0, 1, B[1], B[1] && B[2]], air = Y.la > 14 && !Y.hr, two = G.outs === 2, sb = P.steal ? stealBase() : 0;
  Y.R.push({ s: 0, tgt: 1, b0: 0, bat: 1, wait: .5, fo: 1, agg: rnd(-.15, .15) });
  for (const b of [1, 2, 3]) if (B[b]) {
    const r = { s: b, tgt: b, b0: b, fo: fo[b], agg: rnd(-.15, .15), wait: 0 };
    if (Y.hr || two) r.tgt = b + 1;
    else if (air) r.tgt = b === 3 ? 3 : b + .4;
    else if (r.fo || (b === 2 && sp > 0)) r.tgt = b + 1;
    if (b === sb && r.tgt >= b + 1) r.s = b + .25;
    Y.R.push(r);
  }
  if (Y.hr) {
    Y.R.forEach(r => (r.tgt = 4));
    const [x, y, z] = Y.path[Y.hrI], ph = Math.atan2(x, y), fr = fenceR(ph) - 2;
    let k = 6, md = 1e9; for (const j of [6, 7, 8]) { const d = hyp(Y.F[j].x - x, Y.F[j].y - y); if (d < md) { md = d; k = j; } }
    Object.assign(Y.F[k], { tx: fr * Math.sin(ph), ty: fr * Math.cos(ph), s: 30 });
    Y.fk = k; Y.rob = z < 16; Y.cpuRob = !G.hum[1 - G.half] && Math.random() < .3;
  } else plan();
}
// fielder jump (button 1 of the fielding player): diving catch or home run robbery
function jumpCatch(i) {
  const ft = 1 - G.half, [x, y, z] = Y.path[i];
  if (G.hum[ft] && !Y.jump && pr(ft, '1')) { Y.jump = Y.t; let md = 1e9; Y.F.forEach((f, k) => { const d = hyp(f.x - x, f.y - y); if (d < md) { md = d; Y.jk = k; } }); }
  if (Y.hr && Y.cpuRob && Y.rob && !Y.jump && i >= Y.hrI - 10 && hyp(Y.F[Y.fk].x - x, Y.F[Y.fk].y - y) < 14) { Y.jump = Y.t - .1; Y.jk = Y.fk; }
  const jh = Y.jump ? 10 * Math.sin(Math.PI * seg(Y.t - Y.jump, 0, .5)) : 0, f = Y.F[Y.jk];
  if (jh <= 0 || hyp(x - f.x, y - f.y) > (Y.hr ? 10 : 8) || z > 7 + jh) return;
  const rob = Y.hr;
  Y.hr = 0; Y.caught = 1; Y.hk = Y.fk = Y.jk; Y.fp = { x: f.x, y: f.y }; Y.ft = Y.t;
  out(Y.R[0]);
  for (const r of Y.R) if (live(r)) r.tgt = r.b0;
  hold(.6);
  sfx.mitt(); sfx.cheer(1.6); S.cameras.main.shake(300, .008);
  say(rob ? '¡TE LO ROBÓ!' : '¡QUÉ ATRAPADA!', '', TS[ft], 1.6); grada(rob ? '¡SE LA ROBÓ!' : '¡QUÉ MANO!', TS[ft], 2.5);
}
function derbyStep(dt) {
  if (Y.hd || (!Y.hr && (Y.landed || Y.caught))) Y.dend = (Y.dend || 0) + dt;
  if (Y.dend > (Y.hr ? 1.8 : .7)) {
    if (Y.hr) { G.hrN++; G.best = Math.max(G.best, Y.hrd); } else say(Y.caught ? 'OUT' : 'NO SALIÓ', '', CH, .7);
    G.outs = 0; G.st = 'pitch'; newPitch(.2);
  }
}
function stepReplay(dt) {
  Y.rt += dt * .5;
  if (Y.rt > (Y.hrI + 30) * DT || any('P1_1', 'P2_1', 'P1_2', 'P2_2', 'START1', 'START2')) { G.st = 'post'; Y.post = 1.5; say(...Y.fm); }
}
function plan() {
  let best = null;
  Y.F.forEach((f, k) => {
    const jmp = f.s * rnd(.85, 1.1);
    for (let i = 4; i < Y.path.length; i += 2) {
      const [x, y, z, ld] = Y.path[i], t = i * DT;
      if (z > (ld ? 3 : 7.5) || (!ld && z < 1)) continue;
      if (Math.max(0, t - (ld ? .45 : .35)) * jmp + (ld ? 1.5 : 3) >= hyp(x - f.x, y - f.y)) { if (!best || t < best.t) best = { k, i, t, air: !ld }; break; }
    }
  });
  if (!best) { const i = Y.path.length - 1, [x, y] = Y.path[i]; let k = 0, md = 1e9; Y.F.forEach((f, j) => { const d = hyp(x - f.x, y - f.y); if (d < md) { md = d; k = j; } }); best = { k, i, t: Math.max(i * DT, .25 + md / Y.F[k].s), air: 0 }; }
  Object.assign(Y, { fk: best.k, fi: best.i, ft: best.t, air: best.air, fp: { x: Y.path[best.i][0], y: Y.path[best.i][1] } });
  Y.err = Math.random() < (best.air ? .02 : .035) ? 1 : 0;
  const f = Y.F[best.k];
  f.tx = Y.fp.x; f.ty = Y.fp.y;
  const cover = [1, best.k === 2 ? 0 : 2, Y.sp >= 0 ? (best.k === 4 ? 3 : 4) : (best.k === 3 ? 4 : 3), best.k === 5 ? 4 : 5];
  cover.forEach((k, b) => { if (k !== best.k) { Y.F[k].tx = BP[b].x; Y.F[k].ty = BP[b].y + (b ? 0 : -3); } });
  for (const k of [6, 7, 8]) if (k !== best.k) { const fk = Y.F[k]; fk.tx = lerp(fk.x, Y.fp.x, .45); fk.ty = lerp(fk.y, Y.fp.y, .45); }
}
const tT = (a, b) => { const d = hyp(a.x - b.x, a.y - b.y); return .45 + d / 95 + Math.max(0, d - 160) / 110; };
function ballETA(bp) {
  if (Y.bm === 'path') return Math.max(0, Y.ft - Y.t) + tT(Y.fp, bp) + (Y.err ? 1 : 0);
  if (Y.bm === 'fum') return Math.max(0, Y.ft - Y.t) + tT(Y.fp, bp);
  if (Y.bm === 'held') return Math.max(0, Y.hold) + tT(Y.F[Y.hk], bp);
  if (Y.bm === 'throw') return Math.max(0, Y.th.t0 + Y.th.du - Y.t) + tT({ x: Y.th.x1, y: Y.th.y1 }, bp);
  return 0;
}
const live = r => !r.out && !r.sc;
const claim = r => (r.tgt % 1 ? Math.floor(r.tgt) : r.tgt);
function decide(r) {
  const b = r.tgt;
  if (b >= 4 || Y.hr || Y.bm === 'dead') return;
  if (Y.bm === 'path' && !Y.landed && G.outs < 2) return;
  const pushed = Y.R.some(o => o !== r && live(o) && o.tgt === b && o.s < b);
  if (!pushed && Y.R.some(o => o !== r && live(o) && claim(o) === b + 1)) return;
  if (pushed || RT + (G.outs === 2 ? .1 : .45) + r.agg < ballETA(BP[(b + 1) % 4])) r.tgt = b + 1;
}
function out(r) {
  r.out = 1; G.outs++; Y.outs++;
  if (!r.bat) Y.fc = 1;
  sfx.out();
  if (G.outs === 3 && (r.bat && (Y.caught || r.tgt === 1) || r.fo && r.tgt === r.b0 + 1) && Y.runs) {
    G.score[G.half] -= Y.runs; G.inR -= Y.runs; Y.runs = 0; Y.cancel = 1;
  }
}
function throwDecide(f, delay) {
  let best = null;
  for (const r of Y.R) {
    if (!live(r) || r.s >= r.tgt || r.tgt % 1) continue;
    const bp = BP[r.tgt % 4], ta = delay + tT(f, bp), tr = (r.tgt - r.s) * RT + Math.max(0, r.wait);
    if (ta + .06 < tr && (!best || r.tgt > best.r.tgt)) best = { r, bp, ta };
  }
  const to = best ? best.bp : CUT;
  Y.th = { x0: f.x, y0: f.y, x1: to.x, y1: to.y, t0: Y.t + delay, du: (best ? best.ta : delay + tT(f, CUT)) - delay, r: best && best.r, b: best && best.r.tgt, cut: !best };
  Y.bm = 'throw';
}
// human fielding: joystick picks the base (right 1B, up 2B, left 3B, down home) + button 1
const dirBase = (ax, ay) => (!ax && !ay ? -1 : Math.abs(ax) >= Math.abs(ay) ? (ax > 0 ? 1 : 3) : ay > 0 ? 2 : 0);
function hold(t) { Y.bm = 'held'; Y.hold = t; Y.hw = G.hum[1 - G.half]; Y.hwT = Y.t; Y.atB = 0; }
function humanThrow() {
  const ft = 1 - G.half, f = Y.F[Y.hk], b = Y.buf ? Y.buf - 2 : dirBase(...axis(ft));
  if (Y.buf || pr(ft, '1')) {
    Y.buf = 0;
    if (b < 0) return throwDecide(f, 0);
    const tg = b || 4, bp = BP[b];
    sfx.sel();
    Y.th = { x0: f.x, y0: f.y, x1: bp.x, y1: bp.y, t0: Y.t + .05, du: tT(f, bp) - (Y.atB ? .3 : 0), r: Y.R.find(r => live(r) && r.tgt === tg && r.s < tg), b: tg };
    Y.bm = 'throw';
  } else if (Y.t - Y.hwT > 3 && Y.R.some(r => live(r) && r.s !== r.tgt)) throwDecide(f, 0);
}
function fielded() {
  Y.hk = Y.fk;
  if (Y.err === 1) {
    Y.err = 2; Y.bm = 'fum'; Y.ft = Y.t + 1; G.errs[1 - G.half]++;
    say('¡ERROR!', '', '#ff5a4f', 1.2);
    if (Y.air) { Y.air = 0; onLand(); }
    return;
  }
  if (Y.air) {
    Y.caught = 1; sfx.mitt();
    out(Y.R[0]);
    for (const r of Y.R) if (live(r) && r.tgt % 1) r.tgt = Math.floor(r.tgt);
    if (Y.long) say('¡ATRAPADA!', '', TS[1 - G.half], 1.2);
  } else sfx.mitt();
  hold(Y.air ? .45 : G.hum[1 - G.half] ? .15 : .25);
}
function onLand() {
  for (const r of Y.R) if (live(r) && r.tgt % 1) r.tgt = Math.ceil(r.tgt);
}
function arrive() {
  const th = Y.th, at = { x: th.x1, y: th.y1 };
  sfx.mitt();
  if (th.cut) { Y.bm = 'dead'; return; }
  if (th.r && live(th.r) && th.r.s < th.b) out(th.r);
  else sfx.safe();
  if (G.outs >= 3) { Y.bm = 'dead'; return; }
  if (G.hum[1 - G.half]) {
    let k = 0, md = 1e9; Y.F.forEach((f, j) => { const d = hyp(f.x - at.x, f.y - at.y); if (d < md) { md = d; k = j; } });
    Object.assign(Y.F[k], { x: at.x, y: at.y, tx: at.x, ty: at.y }); Y.hk = k; hold(.1); Y.atB = 1; return;
  }
  throwDecide(at, .05);
}
function homer() {
  say(pick(['¡Y SE FUE!', '¡SE LA LLEVÓ!', '¡QUÉ PALO!']), Y.hrd + ' PIES', TS[G.half], 3.2);
  grada('¡OTRA! ¡OTRA!', TS[G.half], 4);
  S.cameras.main.shake(450, .012);
  sfx.crack(); sfx.cheer(3); sfx.charge();
  for (let i = 0; i < 7; i++) burst(rnd(120, 680), rnd(60, 200), i % 2 ? TC[G.half] : 0xffffff, i * .22);
}
function stepPlay(dt) {
  if (G.st === 'post') { Y.post -= dt; if (Y.post <= 0) afterPlay(); moveFielders(dt); return; }
  Y.t += dt;
  const i = Math.min(Y.path.length - 1, Math.floor(Y.t / DT));
  if (Y.bm === 'path' && !Y.landed && !Y.hd) jumpCatch(i);
  if (Y.bm === 'path') {
    if (!Y.landed && i >= Y.land) { Y.landed = 1; if (!Y.hr) onLand(); }
    if (Y.hr) { if (i >= Y.hrI && !Y.hd) { Y.hd = 1; homer(); } if (i >= Y.path.length - 1) Y.bm = 'gone'; }
    else if (Y.t >= Y.ft) fielded();
  } else if (Y.bm === 'fum') { if (Y.t >= Y.ft) hold(.2); }
  if ((Y.hw && (Y.bm === 'throw' || (Y.bm === 'held' && Y.hold > 0)) || (G.hum[1 - G.half] && Y.bm === 'path' && Y.landed && !Y.hr)) && pr(1 - G.half, '1')) Y.buf = dirBase(...axis(1 - G.half)) + 2;
  if (Y.bm === 'held') { if (Y.hold > 0) Y.hold -= dt; else if (G.outs < 3) { if (Y.hw) humanThrow(); else if (!Y.thrown) { Y.thrown = 1; throwDecide(Y.F[Y.hk], 0); } } }
  else if (Y.bm === 'throw') { if (Y.t >= Y.th.t0 + Y.th.du) arrive(); }
  moveFielders(dt);
  if (G.derby) return derbyStep(dt);
  let moving = 0;
  if (G.outs < 3) for (const r of Y.R) {
    if (!live(r)) continue;
    if (r.wait > 0) { r.wait -= dt; moving = 1; continue; }
    const v = dt / RT * (Y.hr ? 3.2 : 1);
    if (r.s < r.tgt) r.s = Math.min(r.tgt, r.s + v); else if (r.s > r.tgt) r.s = Math.max(r.tgt, r.s - v);
    if (r.s === r.tgt) {
      if (r.tgt === 4) { r.sc = 1; Y.runs++; runScores(); if (!Y.hr) sfx.safe(); }
      else if (r.tgt % 1 === 0) decide(r);
    }
    if (live(r) && r.s !== r.tgt) moving = 1;
  }
  const quiet = G.outs >= 3 || (!moving && (Y.bm === 'dead' || Y.bm === 'gone' || (Y.bm === 'held' && Y.hw && Y.t - Y.hwT > 1.2)));
  Y.end = quiet ? Y.end + dt : 0;
  if (Y.end > (Y.hr ? 1.4 : G.outs >= 3 ? .9 : .45)) finishPlay();
}
function moveFielders(dt) {
  if (Y.t < .25) return;
  Y.F.forEach(f => {
    const dx = f.tx - f.x, dy = f.ty - f.y, d = hyp(dx, dy);
    if (d > .4) { const m = Math.min(d, f.s * dt); f.x += dx / d * m; f.y += dy / d * m; f.run = 1; } else f.run = 0;
  });
}
function finishPlay() {
  const bt = G.half, bR = Y.R[0], reached = bR.sc ? 4 : live(bR) ? Math.round(bR.s) : 0;
  let a, col = TS[bt];
  if (Y.hr) a = '¡JONRÓN!';
  else if (Y.outs >= 2) { a = pick(['¡DOBLE PLAY!', '¡DOBLE MATANZA!']); col = TS[1 - bt]; grada('¡DOBLE MATANZA!', TS[1 - bt]); }
  else if (bR.out) {
    col = TS[1 - bt];
    a = Y.caught ? (Y.runs ? 'ELEVADO DE SACRIFICIO' : Y.zmax < 20 ? 'OUT · LÍNEA' : 'OUT · ELEVADO') : 'OUT EN ' + BN[bR.tgt];
  } else if (Y.err) a = 'SAFE POR ERROR';
  else if (Y.fc) { a = 'OUT FORZADO'; col = TS[1 - bt]; }
  else a = ['', Math.abs(Y.sp) < .1 ? '¡POR TODO EL MEDIO!' : pick(['¡HIT!', '¡PARA EL HIT!']), pick(['¡DOBLETE!', '¡TUBEY!']), '¡TRIPLE!', '¡JONRÓN DENTRO DEL PARQUE!'][reached];
  if (bR.out) sfx.ooh(); else if (!Y.hr) sfx.cheer(1.2);
  if (Y.hr || (live(bR) || bR.sc) && !Y.err && !Y.fc) G.hits[bt]++;
  const b = Y.runs ? (Y.runs === 1 ? '1 CARRERA' : Y.runs + ' CARRERAS') : Y.cancel ? 'LA CARRERA NO CUENTA' : '';
  G.bases = [0, 0, 0, 0];
  if (G.outs < 3) for (const r of Y.R) if (live(r) && r.s >= 1 && r.s <= 3) G.bases[Math.round(r.s)] = 1;
  Y.fm = [Y.hr ? '¡JONRÓN!' : a, b, col, 1.5];
  if (Y.hr) { G.st = 'rep'; Y.rt = 0; MSG = null; } else { say(...Y.fm); G.st = 'post'; Y.post = 1.5; }
  log('PLAY', a, b, 'outs', G.outs, 'bases', G.bases.slice(1).join(''), 'score', G.score.join('-'));
}
function afterPlay() {
  newBatter();
  if (walkOff()) { G.line[1][G.inn - 1] = G.inR; return gameOver(); }
  if (G.outs >= 3) return endHalf();
  G.st = 'pitch'; newPitch(.3);
}

// ---------- fireworks ----------
function burst(x, y, c, dl = 0) { for (let i = 0; i < 44; i++) { const a = i / 44 * TAU, v = rnd(70, 170); FW.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, l: 1.4, dl }); } }
function stepFW(dt) {
  g = gh;
  FW = FW.filter(p => {
    if (p.dl > 0) { p.dl -= dt; return true; }
    p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= .985;
    rc(p.x - 2, p.y - 2, 4, 4, p.c, clamp(p.l / 1.4, 0, 1));
    return p.l > 0;
  });
}

// ---------- drawing: pitch view ----------
function ballG(x, y, r) {
  el(x, y, r + 1.2, r + 1.2, 0x1a1a1a, .55);
  el(x, y, r, r, 0xfbfbf5);
  if (r > 5) { g.lineStyle(Math.max(1, r * .13), 0xe0322d); g.beginPath(); g.arc(x - r * .95, y, r * .75, -.9, .9); g.strokePath(); g.beginPath(); g.arc(x + r * .95, y, r * .75, Math.PI - .9, Math.PI + .9); g.strokePath(); }
}
function fig(x, y, col, s, ph, a = 1) {
  el(x, y, 6 * s, 2.2 * s, 0, .35 * a);
  const l = ph ? Math.sin(ph) * 2.4 * s : 0;
  rc(x - 3 * s + l, y - 7 * s, 2.4 * s, 7 * s, 0xe9ebf3, a); rc(x + .6 * s - l, y - 7 * s, 2.4 * s, 7 * s, 0xe9ebf3, a);
  rr(x - 4 * s, y - 15 * s, 8 * s, 9 * s, 2 * s, col, a);
  el(x, y - 18 * s, 3 * s, 3 * s, 0xc98d5f, a);
  rc(x - 3.4 * s, y - 21.4 * s, 6.8 * s, 2.4 * s, col, a);
}
function pitcher(at, col) {
  const x = 400, y = 289, s = 2.3, lift = Math.sin(Math.PI * seg(at, .35, 1.18));
  el(x, y, 9 * s, 2.4 * s, 0, .35);
  rc(x + .4 * s, y - 8 * s, 2.8 * s, 8 * s, 0xeceef6);
  rc(x - 3.2 * s, y - 8 * s - lift * 4.5 * s, 2.8 * s, 8 * s - lift * 3 * s, 0xeceef6);
  rr(x - 4.6 * s, y - 17.5 * s, 9.2 * s, 10 * s, 2 * s, 0xf4f4fa);
  rc(x - 4.6 * s, y - 12 * s, 9.2 * s, 1.4 * s, col);
  el(x + 5.4 * s, y - 12 * s, 2.2 * s, 2.2 * s, 0x7a4a24);
  let an, len = 8.5 * s;
  if (at < .55) an = 1.85;
  else if (at < 1.1) an = lerp(1.85, -1.75, eio(seg(at, .55, 1.1)));
  else if (at < 1.32) { const k = eo(seg(at, 1.1, 1.32)); an = lerp(-1.75, 1.3, k); len *= 1 - .45 * Math.sin(Math.PI * k); }
  else an = lerp(1.3, 1.85, seg(at, 1.32, 2));
  const sx = x - 4.2 * s, sy = y - 16 * s, hx = sx + Math.cos(an) * len, hy = sy + Math.sin(an) * len;
  thick(sx, sy, hx, hy, 2.4 * s, 0xf4f4fa); el(hx, hy, 1.3 * s, 1.3 * s, 0xc98d5f);
  if (at < 1.22) el(hx, hy, 1.1 * s, 1.1 * s, 0xffffff);
  el(x, y - 20.5 * s, 3.3 * s, 3.3 * s, 0xc98d5f);
  rc(x - 3.6 * s, y - 24.3 * s, 7.2 * s, 2.6 * s, col); el(x, y - 21.8 * s, 3.8 * s, s, col);
}
function batS(sw) {
  let hx = 338, hy = 388, an = -2.05 + Math.sin(clock * 3) * .05, len = 150;
  if (sw >= 0 && sw < SWT) { const e = eio(sw / SWT); an = lerp(-2.05, .08, e); len = 150 * (1 - .42 * Math.sin(Math.PI * e)); hx = lerp(338, 372, e); hy = lerp(388, 428, e); }
  else if (sw >= SWT) { const e = eo(seg(sw, SWT, SWT + .35)); an = lerp(.08, -1.35, e); len = 150 * lerp(1, .55, e); hx = lerp(372, 352, e); hy = lerp(428, 398, e); }
  return { hx, hy, an, len };
}
function bat(x, y, an, L, a) {
  const c = Math.cos(an), s = Math.sin(an), q = (u, v) => ({ x: x + u * c - v * s, y: y + u * s + v * c });
  fc(0xcf9152, a); g.fillPoints([q(-10, -3.6), q(L * .42, -4.2), q(L * .9, -8.6), q(L, -7), q(L, 7), q(L * .9, 8.6), q(L * .42, 4.2), q(-10, 3.6)], true);
  fc(0x1d1d1d, a); g.fillPoints([q(-12, -4.2), q(14, -4.2), q(14, 4.2), q(-12, 4.2)], true);
}
function batter(sw, col, num) {
  pl(0xdcdee8, 1, 272, 470, 304, 470, 292, 598, 254, 598);
  pl(0xdcdee8, 1, 304, 470, 334, 468, 358, 598, 320, 598);
  rr(244, 590, 54, 12, 5, 0x111111); rr(316, 590, 50, 12, 5, 0x111111);
  pl(col, 1, 262, 394, 344, 388, 340, 466, 272, 466);
  rr(268, 458, 72, 10, 3, 0x1b1d36);
  T(num, 304, 428, 3, '#15160b', .5, 0, 1, 1.5);
  const b = batS(sw);
  if (sw > 0 && sw < SWT + .22) for (let i = 3; i >= 1; i--) { const o = batS(sw - i * .022); bat(o.hx, o.hy, o.an, o.len, .16); }
  thick(278, 404, b.hx - 4, b.hy + 6, 15, col);
  bat(b.hx, b.hy, b.an, b.len, 1);
  thick(336, 400, b.hx + 2, b.hy - 2, 15, col);
  el(b.hx, b.hy, 9, 9, 0x26262c);
  rr(290, 380, 22, 14, 4, 0xb77a4e);
  el(300, 360, 31, 29, 0x151a3c); el(289, 350, 11, 7, 0xffffff, .18); rr(314, 364, 36, 9, 4, 0x151a3c); el(286, 378, 13, 14, 0x151a3c);
}
const kz = p => (1 / (60 * (1 - p) + 9) - 1 / 69) / (1 / 9 - 1 / 69);
function pitchBall(p) {
  const k = kz(p), c = p * p * p, [tx, ty] = zs(P.bx + BRK[P.type][0] * c, P.by + BRK[P.type][1] * c);
  return [lerp(398, tx, k), lerp(258, ty, k) - 18 * Math.sin(Math.PI * k), 2.2 + 11.5 * k];
}
function chip(x, y, w, t, ci, on) {
  if (on) rr(x, y, w, 26, 5, TC[ci]); else { rr(x, y, w, 26, 5, 0x08090a, .84); g.lineStyle(1.5, TC[ci], .55); g.strokeRoundedRect(x + .75, y + .75, w - 1.5, 24.5, 5); }
  T(t, x + w / 2, y + 13, 1.4, on ? '#0d0e07' : TS[ci]);
}
function chipRow(x, y, label, items, ci, on) {
  const lw = tw(label, 1.4), ws = items.map(t => tw(t, 1.4) + 12);
  let cx = x - (lw + 10 + ws.reduce((a, b) => a + b + 6, -6)) / 2;
  T(label, cx, y + 13, 1.4, TS[ci], 0, '#000'); cx += lw + 10;
  items.forEach((t, i) => { chip(cx, y, ws[i], t, ci, i === on); cx += ws[i] + 6; });
}
function chipCol(x, y, label, items, ci, on) {
  T(label, x, y, 1.6, TS[ci], 1, '#000');
  items.forEach((t, i) => { const w = tw(t, 1.4) + 14; chip(x - w, y + 16 + i * 30, w, t, ci, i === on); });
}
function drawPitch() {
  bgI.setTexture('pit');
  g = gw;
  const bt = G.half, ft = 1 - bt;
  const at = P.ph === 'ready' ? 0 : P.ph === 'wind' ? .35 + P.t / WIND * .87 : 1.22 + (P.ph === 'fly' ? P.t : 1);
  pitcher(at, TC[ft]);
  if (P.ph === 'wind' || P.ph === 'fly' || P.ph === 'ready') {
    const al = P.ph === 'ready' ? .5 : 1;
    g.lineStyle(2, 0xffffff, .5 * al); g.strokeRect(362, 380, 96, 110);
    for (let i = 1; i < 3; i++) { ln(362 + i * 32, 380, 362 + i * 32, 490, 1, 0xffffff, .18 * al); ln(362, 380 + i * 36.67, 458, 380 + i * 36.67, 1, 0xffffff, .18 * al); }
  }
  if (P.ph === 'fly') {
    const p = Math.min(1, P.t / P.Tf), [x, y, r] = pitchBall(p);
    el(x, lerp(292, 556, p ** 1.5), r * 1.1, r * .35, 0, .28);
    ballG(x, y, r);
  }
  const sw = P.sw ? clock - P.swc : -1, caught = P.ph === 'res' && P.fx !== undefined && !P.foul;
  batter(sw, TC[bt], NUMS[bt][G.ln[bt] % 9]);
  const [mx, my] = caught ? zs(P.fx, P.fy) : P.ph === 'fly' ? zs(lerp(0, P.bx, Math.min(1, P.t / P.Tf * 1.4)), lerp(-.6, P.by, Math.min(1, P.t / P.Tf * 1.4))) : [440, 480];
  el(420, 614, 72, 44, 0x2a2f3d); ln(372, 584, 462, 604, 4, 0x15181f, .7); ln(468, 584, 378, 604, 4, 0x15181f, .7);
  el(420, 560, 25, 22, 0x1b2030); rr(398, 546, 44, 6, 3, 0x0f1218);
  el(mx, my + 4, 17, 15, 0x6b3f1d); el(mx, my + 5, 10, 8, 0x8a5a2b);
  if (caught) ballG(mx, my, 12);
  if (P.ph === 'hit') {
    const k = eo(clamp((P.t - P.hs) / .22, 0, 1));
    ballG(lerp(446, 400 + Math.sin(P.hsp) * 700, k), lerp(434, P.hla > .15 ? -40 : 300, k), lerp(13, 5, k));
    const r = 10 + 90 * k; g.lineStyle(6 * (1 - k) + 1, 0xffffff, 1 - k); g.strokeCircle(446, 434, r);
  }
  if (P.ph === 'ready' || P.ph === 'wind' || P.ph === 'fly') {
    const [x, y] = zs(P.cx, P.cy);
    g.lineStyle(2, TC[bt], .55); g.strokeCircle(x, y, RAD[0] * 48);
    g.lineStyle(3, TC[bt], .95); g.strokeCircle(x, y, RAD[1] * 48);
    for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ln(x + a * 8, y + b * 8, x + a * 30, y + b * 30, 2, TC[bt], .8);
  }
  g = gh;
  fbHud();
  gradaHud(154);
  board(); basesHud(G.bases);
  if (P.ph !== 'ready' && P.ph !== 'wind') T(PN[P.type] + ' · ' + P.mph + ' MPH', 400, 96, 2, TS[ft], .5, '#000');
  if (G.hum[ft]) chipRow(470, 22, 'LANZA ' + tname(ft), ['1 RECTA', '2 CURVA', '3 CAMBIO'], ft, P.ph === 'ready' ? -1 : P.type);
  else T('LANZA ' + tname(ft), 400, 36, 1.8, TS[ft], .5, '#000');
  if (G.hum[bt]) {
    const it = ['1 CONTACTO', '2 PODER'];
    if (stealBase() && G.outs < 2) it.push(P.steal ? '3 ¡ROBO!' : '3 ROBAR');
    chipCol(786, 462, 'BATEA ' + tname(bt), it, bt, P.sw ? P.sw.pw : P.steal ? 2 : -1);
  } else T('BATEA ' + tname(bt), 786, 571, 1.8, TS[bt], 1, '#000');
  if (P.steal && !G.hum[bt] && P.ph !== 'res') T('¡CORREDOR EN MOVIMIENTO!', 400, 128, 1.6, TS[bt], .5, '#000');
}
function fbHud() { if (FB && clock - FB.k < 1.4) T(FB.t, 786, 102, 1.8, FB.c, 1, '#000'); }
function board() {
  if (G.derby) {
    box(14, 14, 230, 92, TC[G.half]);
    const s = Math.max(0, Math.ceil(G.dl));
    T('DERBY · ' + tname(G.half), 26, 32, 1.6, TS[G.half], 0); T('0:' + String(s).padStart(2, '0'), 232, 32, 2, s <= 10 && clock % .5 < .25 ? '#ff5a4f' : CH, 1);
    T('JONRONES', 26, 60, 1.6, DIM, 0); T(G.hrN, 232, 60, 2.2, CH, 1);
    T('MÁS LARGO', 26, 88, 1.4, DIM, 0); T(G.best ? G.best + ' PIES' : '-', 232, 88, 1.6, CH, 1);
    return;
  }
  box(14, 14, 230, 92);
  for (let tm = 0; tm < 2; tm++) {
    const y = 34 + tm * 26;
    if (G.half === tm) pl(TC[tm], 1, 22, y - 5, 29, y, 22, y + 5);
    T(TA[tm], 34, y, 2, TS[tm], 0); T(G.score[tm], 146, y, 2.2, CH, 1);
  }
  rc(158, 24, 2, 54, 0xffffff, .15);
  T(G.inn, 184, 34, 2.2, CH);
  if (G.half) pl(0xffffff, 1, 200, 30, 212, 30, 206, 40); else pl(0xffffff, 1, 200, 40, 212, 40, 206, 30);
  for (let i = 0; i < 2; i++) el(182 + i * 18, 62, 5.5, 5.5, i < G.outs ? 0xff5a4f : 0xffffff, i < G.outs ? 1 : .18);
  T('B ' + G.b + '   S ' + G.s + '   OUT ' + G.outs, 22, 89, 1.5, DIM, 0);
}
function basesHud(B) {
  box(712, 14, 74, 66);
  for (const [b, x, y] of [[2, 749, 34], [1, 768, 54], [3, 730, 54]]) {
    const c = Math.cos(Math.PI / 4) * 9.9;
    pl(B[b] ? TC[G.half] : 0xffffff, B[b] ? 1 : .15, x, y - c, x + c, y, x, y + c, x - c, y);
  }
}
function hudMsgs() {
  g = gh;
  if (BAN && BAN.t > 0) {
    const a = Math.min(1, BAN.t * 3);
    rr(130, 214, 540, 112, 12, 0x04050c, .88 * a);
    T(BAN.a, 400, 252, 2, BAN.col, .5, '#000', a, 3, 24);
    T(BAN.b, 400, 300, 1.8, CH, .5, 0, a);
  } else if (MSG && MSG.t > 0) {
    const a = Math.min(1, MSG.t * 4), y = G.st === 'pitch' ? 250 : 292;
    T(MSG.a, 400, y, MSG.a.length > 14 ? 1.7 : 2.5, MSG.col, .5, '#000', a, 3, 24);
    if (MSG.b) T(MSG.b, 400, y + 46, 2.2, CH, .5, '#000', a);
  }
}

// ---------- drawing: field view ----------
const bpos = s => { const i = Math.min(3, Math.floor(s)), f = s - i, a = BP[i % 4], b = BP[(i + 1) % 4]; return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }; };
function ballXYZ() {
  if (Y.bm === 'path' || Y.bm === 'gone') { const p = Y.path[Math.min(Y.path.length - 1, Math.floor(Y.t / DT))]; return { x: p[0], y: p[1], z: p[2] }; }
  if (Y.bm === 'fum') { const f = Y.F[Y.hk]; return { x: f.x + 2, y: f.y - 1, z: Math.abs(Math.sin(Y.t * 9)) * 2 }; }
  if (Y.bm === 'throw' && Y.t >= Y.th.t0) { const th = Y.th, k = seg(Y.t, th.t0, th.t0 + th.du), d = hyp(th.x1 - th.x0, th.y1 - th.y0); return { x: lerp(th.x0, th.x1, k), y: lerp(th.y0, th.y1, k), z: 5 + d * .06 * 4 * k * (1 - k) }; }
  if (Y.bm === 'throw') return { x: Y.th.x0, y: Y.th.y0, z: 5 };
  if (Y.bm === 'dead') return { x: CUT.x, y: CUT.y, z: 5 };
  const f = Y.F[Math.max(0, Y.hk)]; return { x: f.x, y: f.y, z: 5 };
}
function drawField() {
  bgI.setTexture('fld');
  g = gw;
  const bt = G.half, ft = 1 - bt, list = [];
  Y.F.forEach(f => list.push([f.x, f.y, TC[ft], f.run ? clock * 16 : 0, f]));
  for (const r of Y.R) if (live(r)) { const p = bpos(r.s); list.push([p.x + (r.bat && r.s < .05 ? -4 : 0), p.y, TC[bt], r.s !== r.tgt ? clock * 15 : 0]); }
  list.sort((a, b) => b[1] - a[1]);
  const jh = Y.jump ? 10 * Math.sin(Math.PI * seg(Y.t - Y.jump, 0, .5)) : 0, jf = Y.F[Y.jk];
  for (const [x, y, c, ph, f] of list) { const z = f === jf ? jh : 0, [sx, sy] = pj(x, y, z); fig(sx, sy, c, fsc(y), ph); if (z > 0) el(sx + 4, sy - 24 * fsc(y), 3, 3, 0x6b3f1d); }
  if (Y.bm !== 'gone' || Y.t < Y.path.length * DT) {
    const b = ballXYZ(), [sx, sy] = pj(b.x, b.y, b.z), [gx2, gy2] = pj(b.x, b.y), r = Math.max(2.4, 1.4 * FP / (b.y + D0));
    if (Y.bm === 'path' && !Y.landed) for (let k = 8; k >= 1; k--) { const q = Y.path[Math.max(0, Math.floor(Y.t / DT) - k * 2)], [tx, ty] = pj(q[0], q[1], q[2]); el(tx, ty, r * .8, r * .8, 0xffffff, .3 * (1 - k / 9)); }
    if (b.z > .5) el(gx2, gy2, r * 1.2, r * .45, 0, .3);
    ballG(sx, sy, r);
  }
  g = gh;
  board(); const B = [0, 0, 0, 0]; for (const r of Y.R) if (live(r) && r.s === r.tgt && r.s >= 1 && r.s <= 3) B[r.s] = 1; basesHud(B);
  if ((Y.bm === 'path' || Y.bm === 'gone') && Y.la > 14 && (!Y.landed || Y.hr) && Y.t > .3) {
    const b = ballXYZ(), d = Math.round(hyp(b.x, b.y));
    box(560, 528, 226, 60); T('DISTANCIA', 673, 545, 1.4, DIM); T(d + ' PIES', 673, 569, 2.6, CH);
  }
  if (Y.long && Y.bm === 'path' && !Y.hd && !Y.landed && G.st === 'play' && Y.t > .5) {
    const full = '¡SE VA, SE VA, SE VA...', n = Math.max(1, Math.floor(full.length * seg(Y.t, .5, 2.6)));
    box(100, 112, 600, 52, TC[bt]); T(full.slice(0, n), 400 - tw(full, 2.6) / 2, 138, 2.6, CH, 0);
  }
  gradaHud(206);
  if (G.st === 'play' && G.hum.some(h => h) && Y.t > 1) T('MANTÉN 3: ACELERAR', 16, 584, 1.3, DIM, 0);
  if (G.st === 'play' && G.hum[ft] && Y.bm === 'path' && !Y.landed && Y.la > 10 && !Y.jump && clock % .6 < .4) T('1: ¡SALTA!', 16, 556, 1.8, TS[ft], 0, '#000');
  if (G.st === 'play' && G.hum[ft] && G.outs < 3 && (Y.bm === 'held' || (Y.bm === 'path' && Y.landed && !Y.hr))) {
    const b = dirBase(...axis(ft));
    box(14, 452, 210, 116, TC[ft]);
    T('LANZA A', 28, 472, 1.5, TS[ft], 0);
    for (const [k, x, y] of [[1, 186, 512], [2, 154, 482], [3, 122, 512], [0, 154, 542]]) pl(k === b ? TC[ft] : 0xffffff, k === b ? 1 : .25, x, y - 11, x + 11, y, x, y + 11, x - 11, y);
    T(b < 0 ? 'JOYSTICK' : b ? BN[b] : 'HOME', 28, 506, 1.2, CH, 0); T(b < 0 ? '+ BOTÓN 1' : '1: ¡TIRA!', 28, 534, 1.2, b < 0 ? DIM : TS[ft], 0);
  }
  fbHud();
}
function drawReplay() {
  bgI.setTexture('fld');
  g = gw;
  const i = Math.min(Y.path.length - 1, Math.floor(Y.rt / DT)), list = DEF.map(([x, y]) => [x, y]);
  list.sort((a, b) => b[1] - a[1]);
  for (const [x, y] of list) { const [sx, sy] = pj(x, y); fig(sx, sy, TC[1 - G.half], fsc(y), 0); }
  const [x, y, z] = Y.path[i], [sx, sy] = pj(x, y, z), [gx2, gy2] = pj(x, y), r = Math.max(2.6, 1.6 * FP / (y + D0));
  for (let k = 10; k >= 1; k--) { const q = Y.path[Math.max(0, i - k * 2)], [tx, ty] = pj(q[0], q[1], q[2]); el(tx, ty, r * .8, r * .8, 0xffffff, .35 * (1 - k / 11)); }
  el(gx2, gy2, r * 1.2, r * .45, 0, .3); g.lineStyle(2, TC[G.half], .8); g.strokeCircle(sx, sy, r * 2.4); ballG(sx, sy, r * 1.4);
  g = gh;
  rc(0, 0, W, 48, 0x000000); rc(0, H - 48, W, 48, 0x000000);
  if (clock % 1 < .6) el(30, 24, 7, 7, 0xff3b30);
  T('REPETICIÓN', 46, 24, 1.8, CH, 0); T(Math.round(hyp(x, y)) + ' PIES', 784, 24, 2, TS[G.half], 1);
  T('1: SALTAR', 784, H - 24, 1.4, DIM, 1);
  if (i >= Y.hrI) T('¡Y SE FUE!', 400, 230, 2.2, TS[G.half], .5, '#000', 1, 3, 24);
}

// ---------- title / attract ----------
function title(dt) {
  bgI.setTexture('fld');
  g = gw; rc(0, 0, W, H, 0x000000, .5);
  G.it += dt;
  const t = clock;
  T('¡SE FUE!', 400, 120 + Math.sin(t * 2) * 4, 3, US[0], .5, US[1], 1, 3, 36);
  T('BÉISBOL ARCADE · CARACAS', 400, 190, 2, CH, .5, '#000');
  if (any('P1_U', 'P2_U')) { G.mode = (G.mode + 2) % 3; G.it = 0; sfx.mv(); }
  if (any('P1_D', 'P2_D')) { G.mode = (G.mode + 1) % 3; G.it = 0; sfx.mv(); }
  g = gh;
  ['CORTO · 3 INNINGS', 'LARGO · 9 INNINGS', 'DERBY · 60 SEGUNDOS'].forEach((s, i) => {
    const on = G.mode === i, y = 244 + i * 42;
    if (on) rr(240, y - 18, 320, 36, 8, 0xe1ff00, .95);
    else { g.lineStyle(2, 0xffffff, .3); g.strokeRoundedRect(240, y - 18, 320, 36, 8); }
    T(s, 400, y, 2.2, on ? '#0d0e07' : CH);
  });
  const dby = G.mode === 2;
  if (t % 1 < .7) {
    T(dby ? 'START 1 · JUEGA P1' : 'START 1 · UN JUGADOR VS CPU', 400, 378, 2, US[0], .5, '#000');
    T(dby ? 'START 2 · JUEGA P2' : 'START 2 · DOS JUGADORES', 400, 408, 2, US[1], .5, '#000');
  }
  box(40, 440, 720, 112, 0xffffff);
  if (dby) {
    T('RÉCORDS DEL DERBY', 400, 458, 1.6, US[0]);
    if (!LB.length) T('NADIE HA JUGADO TODAVÍA · ¡SÉ EL PRIMERO!', 400, 500, 1.4, CH);
    LB.forEach((e, i) => { const x = 70 + (i % 3) * 230, y = 486 + (i / 3 | 0) * 30; T((i + 1) + '. ' + e.n + '  ' + e.h + ' HR · ' + e.d, x, y, 1.4, i ? CH : US[0], 0); });
  } else {
  T('BATEAR', 60, 466, 1.6, US[0], 0); T('JOYSTICK APUNTA · 1 CONTACTO · 2 PODER · 3 ROBAR', 170, 466, 1.2, CH, 0);
  T('LANZAR', 60, 496, 1.6, US[1], 0); T('JOYSTICK GUÍA LA BOLA · 1 RECTA · 2 CURVA · 3 CAMBIO', 170, 496, 1.2, CH, 0);
  T('REGLAS', 60, 526, 1.6, DIM, 0); T('4 BOLAS: BASE · 3 STRIKES: PONCHE · 3 OUTS: CAMBIO', 170, 526, 1.2, CH, 0);
  }
  if (REC.w + REC.l) T('RÉCORD VS CPU  ' + REC.w + 'G · ' + REC.l + 'P', 400, 578, 1.5, DIM);
  if (any('START1', 'P1_1')) { sfx.sel(); G = { st: 'pick', mode: G.mode, np: 1, sel: 0, it: 0 }; }
  else if (any('START2', 'P2_1')) { sfx.sel(); G = { st: 'pick', mode: G.mode, np: 2, sel: 0, it: 0 }; }
  else if (G.it > 20 && clock - lastInput > 20) { setTeams(Math.random() < .5 ? 0 : 1); newGame(0, 0, 1); }
}
function overScreen(dt) {
  G.ot += dt;
  bgI.setTexture('fld');
  g = gw; rc(0, 0, W, H, 0x000000, .55);
  const w = G.win, human = !G.demo && G.hum[w];
  T((human ? '¡' : '') + 'GANAN ' + TL[w] + ' ' + TN[w] + (human ? '!' : ''), 400, 104, 1.5, TS[w], .5, '#000', 1, 3, 28);
  T(TA[0] + ' ' + G.score[0] + ' - ' + G.score[1] + ' ' + TA[1], 400, 176, 1.8, CH, .5, '#000', 1, 3, 24);
  g = gh;
  const n = Math.max(G.N, G.inn), cw = Math.min(40, 420 / n), x0 = 400 - (96 + n * cw + 3 * 44) / 2;
  box(x0 - 14, 226, 96 + n * cw + 132 + 28, 116, 0xffffff);
  for (let i = 0; i < n; i++) T(i + 1, x0 + 96 + i * cw + cw / 2, 250, 1.6, DIM);
  ['C', 'H', 'E'].forEach((s, i) => T(s, x0 + 96 + n * cw + 22 + i * 44, 250, 1.8, US[0]));
  for (let tm = 0; tm < 2; tm++) {
    const y = 286 + tm * 36;
    T(TA[tm], x0, y, 1.8, TS[tm], 0);
    for (let i = 0; i < n; i++) { const v = G.line[tm][i]; T(v === undefined ? (tm && i === n - 1 ? 'X' : '-') : v, x0 + 96 + i * cw + cw / 2, y, 1.8, CH); }
    [G.score[tm], G.hits[tm], G.errs[tm]].forEach((v, i) => T(v, x0 + 96 + n * cw + 22 + i * 44, y, 2, CH));
  }
  if (!G.demo && G.hum[0] && !G.hum[1]) T('RÉCORD VS CPU  ' + REC.w + 'G · ' + REC.l + 'P', 400, 380, 1.8, DIM);
  if (G.ot > 2 && clock % 1 < .7) T('PRESIONA START', 400, 470, 2.4, CH, .5, '#000');
  if ((G.ot > 2 && any('START1', 'START2', 'P1_1', 'P2_1')) || (G.demo && G.ot > 7) || G.ot > 60) toTitle();
}

// ---------- derby end + initials ----------
function toDerbyEnd() {
  G.st = 'dend'; G.ot = 0; MSG = BAN = null; amb(0);
  G.q = G.hrN > 0 && (LB.length < 5 || G.hrN > LB[4].h || (G.hrN === LB[4].h && G.best > LB[4].d));
  G.ini = [0, 0, 0]; G.ip = 0; G.saved = 0;
  sfx.charge(); if (G.hrN) sfx.cheer(2);
  for (let i = 0; i < Math.min(8, G.hrN + 2); i++) burst(rnd(150, 650), rnd(80, 200), TC[G.half], i * .25);
}
function derbyEnd(dt) {
  G.ot += dt;
  const pl = G.half;
  bgI.setTexture('fld');
  g = gw; rc(0, 0, W, H, 0x000000, .6);
  T('FIN DEL DERBY', 400, 86, 2, TS[pl], .5, '#000', 1, 3, 24);
  T(G.hrN + (G.hrN === 1 ? ' JONRÓN' : ' JONRONES'), 400, 150, 1.8, CH, .5, '#000', 1, 3, 24);
  T('MÁS LARGO: ' + (G.best ? G.best + ' PIES' : '-'), 400, 196, 2, DIM, .5, '#000');
  g = gh;
  if (G.q && !G.saved) {
    T('¡NUEVO RÉCORD! ESCRIBE TUS INICIALES', 400, 260, 1.8, TS[pl], .5, '#000');
    if (pr(pl, 'U') || pr(pl, 'D')) { G.ini[G.ip] = (G.ini[G.ip] + (pr(pl, 'U') ? 25 : 1)) % 26; sfx.mv(); }
    if (pr(pl, 'L') || pr(pl, 'R')) { G.ip = clamp(G.ip + (pr(pl, 'R') ? 1 : -1), 0, 2); sfx.mv(); }
    for (let i = 0; i < 3; i++) {
      const x = 340 + i * 60, on = i === G.ip;
      rr(x - 24, 290, 48, 60, 8, on ? TC[pl] : 0x04050c, on ? 1 : .86);
      T(String.fromCharCode(65 + G.ini[i]), x, 320, 2.2, on ? '#0d0e07' : CH, .5, 0, 1, 3, 24);
    }
    T('JOYSTICK: LETRA · 1: SIGUIENTE', 400, 378, 1.4, DIM);
    if (pr(pl, '1') || pr(pl, '2')) {
      sfx.sel();
      if (G.ip < 2) G.ip++;
      else { const e = { n: G.ini.map(c => String.fromCharCode(65 + c)).join(''), h: G.hrN, d: G.best }; LB = lbSort([...LB, e]); G.me = e; G.saved = 1; G.ot = 0; saveLB(); }
    }
    return;
  }
  box(220, 250, 360, 190, 0xffffff);
  T('RÉCORDS DEL DERBY', 400, 272, 1.6, US[0]);
  LB.forEach((e, i) => T((i + 1) + '.  ' + e.n + '   ' + e.h + ' HR   ' + e.d + ' PIES', 250, 304 + i * 28, 1.5, e === G.me ? TS[pl] : CH, 0));
  if (!LB.length) T('SIN JONRONES · ¡OTRA VEZ!', 400, 340, 1.6, CH);
  if (G.ot > 1.5 && clock % 1 < .7) T('PRESIONA START', 400, 490, 2.2, CH, .5, '#000');
  if ((G.ot > 1.5 && any('START1', 'START2', 'P1_1', 'P2_1')) || G.ot > 30) toTitle();
}

// ---------- team pick ----------
function emblem(i, x, y) {
  if (i === 0) {
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, b = a + .22; pl(0xb77900, 1, x + Math.cos(a) * 52, y + Math.sin(a) * 52, x + Math.cos(a + .11) * 78, y + Math.sin(a + .11) * 78, x + Math.cos(b) * 52, y + Math.sin(b) * 52); }
    el(x, y, 56, 56, 0xb77900); el(x, y + 4, 42, 44, 0xf5b800);
    el(x - 16, y - 8, 6, 7, 0x15160b); el(x + 16, y - 8, 6, 7, 0x15160b);
    pl(0x5a3a10, 1, x - 10, y + 10, x + 10, y + 10, x, y + 22); el(x, y + 34, 16, 7, 0xffe28a);
    pl(0xb77900, 1, x - 40, y - 34, x - 26, y - 56, x - 16, y - 36); pl(0xb77900, 1, x + 40, y - 34, x + 26, y - 56, x + 16, y - 36);
  } else {
    el(x, y + 56, 96, 12, 0x1d3f8f);
    for (let k = -2; k <= 2; k++) { g.lineStyle(3, 0x9cc4ff, .8); g.beginPath(); g.arc(x + k * 34, y + 58, 14, Math.PI, TAU); g.strokePath(); }
    pl(0x6b3f1d, 1, x - 86, y + 10, x + 86, y + 10, x + 58, y + 48, x - 62, y + 48);
    rc(x - 82, y + 16, 164, 6, 0xf5b800); for (let k = -2; k <= 2; k++) el(x + k * 28, y + 32, 4, 4, 0x1d1d1d);
    ln(x, y - 74, x, y + 10, 4, 0x3b2a1a); pl(0xf4f1e6, 1, x + 4, y - 60, x + 58, y - 30, x + 4, y);
    pl(0xf4f1e6, 1, x - 4, y - 50, x - 48, y - 20, x - 4, y + 2);
    rc(x - 30, y - 92, 30, 20, 0x111111); el(x - 15, y - 84, 5, 5, 0xffffff); rc(x - 18, y - 80, 6, 4, 0xffffff);
  }
}
function pickScreen(dt) {
  bgI.setTexture('fld');
  g = gw; rc(0, 0, W, H, 0x000000, .62);
  G.it += dt;
  T('ELIGE TU EQUIPO', 400, 70, 1.6, US[0], .5, '#000', 1, 3, 24);
  if (any('P1_L', 'P1_R', 'P2_L', 'P2_R')) { G.sel = 1 - G.sel; sfx.mv(); }
  g = gh;
  for (let i = 0; i < 2; i++) {
    const x = 220 + i * 360, on = G.sel === i, t = TEAM[i];
    box(x - 160, 120, 320, 330, on ? t[3] : 0x444444);
    if (on) { g.lineStyle(4, t[3], 1); g.strokeRoundedRect(x - 164, 116, 328, 338, 10); }
    emblem(i, x, 250);
    T(t[0], x, 370, 1.8, t[4], .5, '#000', on ? 1 : .55, 3, 24);
  }
  T(G.np === 2 ? 'P1 ELIGE · P2 JUEGA CON ' + TEAM[1 - G.sel][2] + ' ' + TEAM[1 - G.sel][0] : 'JOYSTICK: ELIGE  ·  1: ¡A JUGAR!', 400, 500, 1.6, CH, .5, '#000');
  if (any('P1_1', 'P2_1', 'START1', 'START2')) {
    sfx.sel();
    const pl2 = G.np === 2 ? 1 : 0;
    if (G.mode === 2) { setTeams(pl2 ? 1 - G.sel : G.sel); newDerby(pl2); }
    else { setTeams(G.sel); newGame(G.np, G.mode, 0); }
  } else if (G.it > 30) toTitle();
}
