// ¡SE FUE! · Béisbol arcade caraqueño · Platanus Hack 26: Caracas
// Pitcher vs batter duel; balls in play are simulated with 9 fielders, runners,
// force outs, double plays and a full inning-by-inning scoreboard.

(() => {
const { sin, cos, abs, min, max, floor, round, ceil, sign, exp, atan2, random, PI } = Math;
const W = 800, H = 600, TAU = PI * 2, DT = 1 / 60, PX = 2;

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
const axis = tm => [(hd(tm, 'R') | 0) - (hd(tm, 'L') | 0), (hd(tm, 'U') | 0) - (hd(tm, 'D') | 0)];
const any = (...k) => k.some(c => hit[c]), go1 = p => pr(p, '1') || hit['START' + (p + 1)];

// ---------- math ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eo = t => 1 - (1 - t) ** 3;
const rnd = (a, b) => a + random() * (b - a);
const hyp = Math.hypot;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s ^= s << 13, s ^= s >>> 17, s ^= s << 5, (s >>> 0) / 4294967296); }

// ---------- game constants ----------
const US = ['#e1ff00', '#ff6ec7'], UC = [0xe1ff00, 0xff6ec7], CH = '#f6ffd6', DIM = '#c7cf9a';
// teams: a nod to the classic Caracas vs Magallanes rivalry (no real marks)
const TEAM = [['FIERAS', 'FIE', 'LAS', 0xf2b81c, '#fc5', 0xf2b81c, 0x111111], ['PIRATAS', 'PIR', 'LOS', 0x2b59c3, '#68f', 0xd62828, 0x1f3a93], ['SARDINAS', 'SAR', 'LAS', 0xd1202f, '#f66', 0xd1202f, 0x0b2a5b], ['PÁJAROS', 'PÁJ', 'LOS', 0xc2102e, '#f88', 0xf6ffd6, 0xb0102a]];
let TC, TS, TN, TA, TL, TI;
const cd = (p, q) => abs((p >> 16) - (q >> 16)) + abs((p >> 8 & 255) - (q >> 8 & 255)) + abs((p & 255) - (q & 255));
function setTeams(a, b) { const o = [TEAM[a], TEAM[b]]; TI = [a, b]; [TN, TA, TL, TC, TS] = [0, 1, 2, 3, 4].map(i => o.map(t => t[i])); if (cd(TC[0], TC[1]) < 170) TC[1] = 0xf4f4fa; }
const other = a => { let b; do b = random() * 4 | 0; while (b === a); return b; };
setTeams(0, 1);
const JS = 'JOYSTICK: ', PN = ['RECTA', 'CURVA', 'CAMBIO'], CPN = ['PLANA', 'CAÍDA', 'LOCA'];
// chapita kids: name, shirt, pants, skin, tank top, legs (1 shorts, 2 ripped pants), feet (1 cholas, 2 sneakers), cap / hair color, power, aim, shoe color
const CHR = [['EL FLACO', 0xf4f4fa, 0x364fc7, 0x8d5524, 1, 0, 1, 0xe03131, 2, 4, 0x2f9e44], ['LA CHAMA', 0xf783ac, 0x4dabf7, 0xc98d5f, 0, 1, 2, 0x3a2418, 3, 3, 0xf4f4f4],
  ['EL CATIRE', 0xff922b, 0x3b5a99, 0xf1c27d, 0, 2, 2, 0xffd43b, 4, 2, 0x111111], ['EL PANA', 0xffd43b, 0x212529, 0x5a3410, 1, 1, 1, 0xe03131, 3, 3, 0x1c7ed6]];
const lkOf = c => ({ sh: c[1], pa: c[2], sk: c[3], Ce: c[4], Cf: c[5], ft: c[6], hc: c[7], fc: c[10], br: 1 });
const look = bt => G.I ? G.lk : { sh: TC[bt], pa: 0xdcdee8, sk: 0xb77a4e, hc: 0x3a4466, fc: 0x181425 };
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
const pick = a => a[random() * a.length | 0];

// field projection (camera behind and above home plate)
const D0 = 80, CP = 34080, FP = 483, HZ = 159;
const pj = (x, y, z = 0) => { const d = max(20, y + D0); return [400 + x * FP / d, HZ + (CP - z * FP) / d]; };
const fenceR = ph => 400 - 70 * min(1, abs(ph) / (PI / 4)) ** 1.5;
// pitch view: strike zone -> screen
const zs = (x, y) => [410 + x * 48, 435 - y * 55];

// ---------- state ----------
let S, CAM, bgI, gw, gw2, gh, gx, g;
let G = { st: 'T', Ad: 0, it: 0 }, P = null, Y = null, FW = [], MSG = null, BAN = null;
let LBS = [[], []], FB = null, CU = { n: 'P1' };

const config = {
  type: Phaser.AUTO,
  width: W / PX,
  height: H / PX,
  pixelArt: true,
  parent: 'game-root',
  backgroundColor: '#000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { create, update },
};
new Phaser.Game(config);

function create() {
  S = this;
  mkTex('pit', pitchBG);
  mkTex('fld', fieldBG);
  mkTex('chp', chapBG);
  // everything is drawn in 800x600 coordinates through a 1/PX camera: the game renders at 400x300 and the canvas is
  // scaled up with nearest filtering, so the whole game (world, HUD, text) shares one pixel grid
  CAM = this.cameras.main.setZoom(1 / PX).centerOn(W / 2, H / 2);
  (SIM = new Image()).src = 'data:image/png;base64,' + SPI.split('-').join('/');
  bgI = this.add.image(0, 0, 'fld').setOrigin(0).setScale(PX);
  gw = this.add.graphics().setDepth(1);
  gw2 = this.add.graphics().setDepth(1.4);
  gh = this.add.graphics().setDepth(2);
  gx = this.add.graphics().setDepth(6);
  loadLB();
}

function update(_, delta) {
  const dt = min(delta, 50) / 1000;
  clock += dt;
  ti = 0; gw.clear(); gw2.clear(); gh.clear(); gx.clear();
  ({ T: title, k: pickScreen, u: custScreen, q: cpick, v: overScreen }[G.st] || inGame)(dt);
  stepFW(dt);
  for (let i = ti; i < tp.length; i++) tp[i].setVisible(false);
  for (const k in hit) delete hit[k];
}

// ---------- pixel text ----------
const tp = [], TW = {};
let ti = 0;
// 5x7 pixel font: each glyph is 7 rows of 5 columns stored as base-32 digits (left column = high bit); widths come from
// the pixels; accents and the tilde are drawn above the base letter. k = size in game pixels per font pixel.
const FCH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!¡?¿.,:\'-·+_/"', FD = 'ehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhs88888s7222iichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhha4444v1248gvehjlphe8o8888seh1248vu11e11u26aiv22vgu11heegguhhev124888ehhehheehhf11eggggg0gg0gggggeh124044048ghe000000g000008g0g000g0gg00000000s000000g000044v440000000u122488gkk00000', hexn = c => parseInt(c.length < 5 ? c.replace(/\w/g, '$&$&').slice(1) : c.slice(1), 16);
function tk(str, col, k) {
  const key = 't' + k + col + str;
  if (TW[key]) return key;
  const gl = [...str.toUpperCase()].map(ch => {
    const a = 'ÁÉÍÓÚÑ'.indexOf(ch), i = FCH.indexOf(a < 0 ? ch : 'AEIOUN'[a]), r = [...FD.substr(i * 7, 7)].map(c => parseInt(c, 32));
    return i < 0 ? [[], -1, 3] : [r, a, 5 - min(...r.filter(v => v).map(v => 31 - Math.clz32(v & -v)))];
  }), cv = snap(hexn(col)), B = +((cv >> 16) + (cv >> 8 & 255) + (cv & 255) > 200), w = gl.reduce((n, q) => n + q[2] + 1 + B, 3) * k, c = document.createElement('canvas'), x = c.getContext('2d'), pts = [];
  // light text: bold strokes (each pixel doubled to the right) and a dark 1-pixel outline (not on big titles), so it reads
  // on any background; dark text on bright chips keeps thin strokes
  let X = 1;
  for (const [r, a, gw] of gl) {
    const P = (u, v) => pts.push([X + u, v + 1], [X + u + B, v + 1]), m = gw >> 1;
    r.forEach((v, y) => { for (let j = 0; j < 5; j++) if (v >> 4 - j & 1) P(j, y + 2); });
    if (a >= 0) a < 5 ? (P(m + 1, 0), P(m, 1)) : [[1, 0], [2, 0], [4, 0], [0, 1], [2, 1], [3, 1]].forEach(q => P(...q));
    X += gw + 1 + B;
  }
  c.width = w; c.height = 12 * k;
  for (const o of B && k < 4 ? [1, 0] : [0]) { x.fillStyle = o ? '#181425' : '#' + cv.toString(16).padStart(6, 0); pts.forEach(([u, v]) => x.fillRect((u - o) * k, (v - o) * k, (1 + 2 * o) * k, (1 + 2 * o) * k)); }
  S.textures.addCanvas(key, c);
  TW[key] = w;
  return key;
}
// RP snaps a position to the game pixel grid (half-pixel positions make some GPUs drop a row or column of a texture)
const RP = v => round(v / PX) * PX, tz = (s, fs = 12) => max(1, round(fs * s / 20)), tw = (str, s) => TW[tk(String(str), CH, tz(s))] * PX;
const TB = (t, x, y, s, c, a = 1) => T(t, x, y, s, c, .5, a, 3, 24), TD = (t, x, y, s, c) => T(t, x, y, s, c);
function T(str, x, y, s = 2, col = CH, ox = .5, al = 1, dp = 3, fs) {
  str = String(str);
  const k = tz(s, fs);
  const key = tk(str, col, k);
  let im = tp[ti++];
  if (!im) tp.push(im = S.add.image(0, 0, key));
  im.setTexture(key).setPosition(RP(x - ox * TW[key] * PX), RP(y - 6 * k * PX)).setScale(PX).setOrigin(0).setAlpha(al).setDepth(dp).setVisible(true);
}

// ---------- graphics helpers ----------
// ENDESGA 32 palette plus the Platanus accents: every colour the game draws snaps to it; backgrounds are dithered to it
const PALX = 'be4a2fd77643ead4aae4a672b86f50733e393e2731a22633e43b44f77622feae34fee76163c74d3e8948265c42193c3e124e890099db2ce8f5ffffffc0cbdc8b9bb45a69883a4466262b44181425ff004468386cb55088f6757ae8b796c28569e1ff00ff6ec7'.match(/.{6}/g).map(h => parseInt(h, 16)),
  SNP = {}, snap = c => SNP[c] ?? (SNP[c] = PALX.reduce((b, q) => cd(q, c) < cd(b, c) ? q : b)), LS = (w, c, a) => g.lineStyle(w, snap(c), a);
// ramps: for each palette colour, its lighter and darker neighbour (hue-shifted like hand-made pixel art)
const fc = (c, a) => g.fillStyle(snap(c), a), RMP = '1530C32435465I86M7:0;9C:;=<>=?>IAHB@CACDCEDFEGFHGIHIM7L6MKNL2ON4C:ML', rp = (c, k) => PALX[RMP.charCodeAt(PALX.indexOf(snap(c)) * 2 + k) - 48], lt = c => rp(c, 0), dk = c => rp(c, 1);
function el(x, y, rx, ry, c, a) { fc(c, a); g.fillEllipse(x, y, rx * 2, ry * 2); }
function rc(x, y, w, h, c, a) { fc(c, a); g.fillRect(x, y, w, h); }
function rr(x, y, w, h, r, c, a) { fc(c, a); r = min(r, w / 2, h / 2); g.fillRoundedRect(x, y, w, h, r); }
function pl(c, a, ...p) { const v = []; for (let i = 0; i < p.length; i += 2) v.push({ x: p[i], y: p[i + 1] }); fc(c, a); g.fillPoints(v, true); }
function ln(x1, y1, x2, y2, w, c, a = 1) { LS(w, c, a); g.lineBetween(x1, y1, x2, y2); }
// menu screens: background k dimmed by a, plus the screen timer
function scr(k, a, dt) { bgI.setTexture(k); g = gw; rc(0, 0, W, H, 0, a); G.it += dt; }
function box(x, y, w, h, col = 0xe1ff00) { rr(x, y, w, h, 8, 0x04050c, .86); LS(2, col, .5); g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 8); }

// ---------- static backgrounds (canvas 2D, drawn once) ----------
function mkTex(k, fn) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), w = c.width = W / PX, h = c.height = H / PX;
  x.scale(1 / PX, 1 / PX); fn(x);
  // 2x2 ordered dither to the palette
  const d = x.getImageData(0, 0, w, h), p = d.data, q = v => max(0, min(255, v));
  for (let i = 0; i < p.length; i += 4) { const j = i >> 2, t = ([0, 2, 3, 1][(j % w & 1) + ((j / w | 0) & 1) * 2] - 1.5) * 9, v = snap(q(p[i] + t) << 16 | q(p[i + 1] + t) << 8 | q(p[i + 2] + t)); p[i] = v >> 16; p[i + 1] = v >> 8 & 255; p[i + 2] = v & 255; }
  x.putImageData(d, 0, 0); S.textures.addCanvas(k, c);
}
function FR(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function e2(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function path2(c, pts) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
function p2(c, pts, col) { path2(c, pts); c.fillStyle = col; c.fill(); }
function lg(c, y0, y1, a, b) { const q = c.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
function glow(c, x, y, r, a) { const q = c.createRadialGradient(x, y, 2, x, y, r); q.addColorStop(0, 'rgba(255,253,225,' + a + ')'); q.addColorStop(1, '#fff0'); c.fillStyle = q; c.fillRect(x - r, y - r, r * 2, r * 2); }
function vig(c, s) { const q = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .9); q.addColorStop(0, '#0000'); q.addColorStop(1, 'rgba(0,0,0,' + s + ')'); c.fillStyle = q; c.fillRect(0, 0, W, H); }
function crowd(c, R, y0, y1, dens) {
  const cols = ['#df0', '#f6c', '#fff', '#5cf', '#f84', '#88b'];
  for (let y = y0; y < y1; y += 5) for (let x = (y / 5 % 2) * 2; x < W; x += 5) if (R() < dens) { c.globalAlpha = .25 + R() * .45; c.fillStyle = cols[R() * 6 | 0]; c.fillRect(x, y, 3, 3); }
  c.globalAlpha = 1;
}
function circ(cx, cy, r, n = 40) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; o.push(pj(cx + r * cos(a), cy + r * sin(a))); } return o; }

function pitchBG(a) {
  const R = rng(26);
  FR(a, 0, 0, W, 210, lg(a, 0, 200, '#002', '#225'));
  for (const lx of [118, 682]) {
    glow(a, lx, 46, 130, .6);
    FR(a, lx - 2, 58, 4, 64, '#334');
    a.fillStyle = '#ffd'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) a.fillRect(lx - 22 + i * 11, 32 + j * 9, 9, 7);
  }
  FR(a, 0, 118, W, 76, '#112');
  crowd(a, R, 122, 190, .72);
  FR(a, 0, 192, W, 16, '#143');
  FR(a, 0, 192, W, 2, '#df0'); a.fillRect(24, 110, 4, 98); a.fillRect(772, 110, 4, 98);
  FR(a, 0, 208, W, H - 208, lg(a, 208, H, '#263', '#394'));
  for (let k = 0; k < 16; k += 2) { const y0 = 208 + (k / 16) ** 1.8 * 392, y1 = 208 + ((k + 1) / 16) ** 1.8 * 392; FR(a, 0, y0, W, y1 - y0, '#fff1'); }
  e2(a, 400, 332, 350, 94, '#a73'); e2(a, 400, 324, 236, 54, '#284');
  e2(a, 400, 289, 52, 14, '#b84'); FR(a, 389, 285, 22, 3, '#eee');
  e2(a, 400, 572, 250, 74, '#a73');
  a.strokeStyle = '#fffb'; a.lineWidth = 3; a.strokeRect(226, 522, 122, 96); a.strokeRect(452, 522, 122, 96);
  p2(a, [[364, 540], [436, 540], [442, 556], [400, 574], [358, 556]], '#eee');
  vig(a, .5);
}

function fieldBG(b) {
  const R = rng(58);
  FR(b, 0, 0, W, H, lg(b, 0, 220, '#001', '#225'));
  b.save(); b.translate(0, -46);
  for (let i = 0; i < 110; i++) { b.fillStyle = 'rgba(255,255,255,' + (.15 + R() * .6) + ')'; const s = R() < .15 ? 2 : 1.2; b.fillRect(R() * W, R() * 140, s, s); }
  // El Ávila, with the Hotel Humboldt tower and the cable car
  const far = x => 140 - 60 * exp(-(((x - 575) / 120) ** 2)) - 34 * exp(-(((x - 300) / 95) ** 2)) + 10 * sin(x / 41) + 6 * sin(x / 13);
  const near = x => 176 - 44 * exp(-(((x - 300) / 85) ** 2)) - 20 * exp(-(((x - 620) / 150) ** 2)) + 8 * sin(x / 27 + 1) + 3 * sin(x / 9);
  for (const [f, col] of [[far, '#235'], [near, '#123']]) { const pts = [[0, 300]]; for (let x = 0; x <= W; x += 4) pts.push([x, f(x)]); pts.push([W, 300]); p2(b, pts, col); }
  const hy = near(300) + 4;
  FR(b, 293, hy - 40, 14, 40, '#112'); b.fillRect(290, hy - 44, 20, 5);
  // Hotel Humboldt lit up, and the cable car climbing the slope with lit cabins
  glow(b, 300, hy - 22, 50, .3);
  for (let i = 0; i < 27; i++) if (R() < .7) FR(b, 294 + i % 3 * 4, hy - 38 + (i / 3 | 0) * 4, 2, 2, '#fd8');
  b.strokeStyle = '#8ab9'; b.lineWidth = 1;
  for (const o of [0, 4]) { b.beginPath(); b.moveTo(140, 204 + o); b.quadraticCurveTo(225, 182 + o, 289, 128 + o); b.stroke(); }
  for (let t = .12; t < 1; t += .2) { const u = 1 - t, x = u * u * 140 + 2 * u * t * 225 + t * t * 289, y = u * u * 204 + 2 * u * t * 182 + t * t * 128; FR(b, x, y, 1, 4, '#8ab'); FR(b, x - 3, y + 4, 7, 5, '#ffd'); FR(b, x - 1, y - 3, 2, 2, '#f44'); }
  // Caracas skyline + Parque Central towers
  for (let x = -10; x < W;) { const w = 12 + R() * 30, h = 10 + R() * 36; FR(b, x, 246 - h, w, h + 60, '#112'); b.fillStyle = '#fd8b'; for (let i = 0; i < w * h / 60; i++) if (R() < .5) b.fillRect(x + 2 + R() * (w - 4) | 0, 246 - h + 2 + R() * (h - 2) | 0, 2, 2); x += w + 1; }
  FR(b, 616, 156, 20, 140, '#112'); b.fillRect(646, 156, 20, 140);
  b.restore();
  // stands + fence
  const fp = [], wt = [];
  for (let i = 0; i <= 64; i++) {
    const ph = -1.3 + 2.6 * i / 64, r = abs(ph) > PI / 4 ? 330 : fenceR(ph);
    fp.push(pj(r * sin(ph), r * cos(ph)));
    wt.push(pj((r - 13) * sin(ph), (r - 13) * cos(ph)));
  }
  const st = [...fp.map(([x, y]) => [x, y - 50]), ...fp.slice().reverse()];
  p2(b, st, '#112');
  b.save(); path2(b, st); b.clip(); crowd(b, R, 200, 420, .62); b.restore();
  glow(b, 100, 200, 110, .5); glow(b, 700, 200, 110, .5);
  FR(b, 84, 194, 32, 10, '#ffd'); b.fillRect(684, 194, 32, 10);
  b.save(); path2(b, [...fp, [W + 600, H + 80], [-600, H + 80]]); b.clip();
  FR(b, 0, 0, W, H, lg(b, 270, H, '#263', '#394'));
  for (let r = 30; r < 420; r += 48) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const ph = -1.3 + 2.6 * i / 40; pts.push(pj(r * sin(ph), r * cos(ph))); }
    for (let i = 40; i >= 0; i--) { const ph = -1.3 + 2.6 * i / 40; pts.push(pj((r + 24) * sin(ph), (r + 24) * cos(ph))); }
    p2(b, pts, '#ffffff0b');
  }
  p2(b, [...fp, ...wt.slice().reverse()], '#964');
  b.save(); path2(b, [pj(0, -4), pj(-330, 330), pj(330, 330)]); b.clip(); p2(b, circ(0, 60.5, 95, 64), '#a73'); b.restore();
  p2(b, [pj(0, 12.7), pj(50.9, 63.6), pj(0, 114.5), pj(-50.9, 63.6)], '#284');
  p2(b, circ(0, 0, 13), '#a73');
  p2(b, circ(0, 60.5, 9), '#b84');
  b.strokeStyle = '#fffe'; b.lineWidth = 2.2;
  for (const s of [-1, 1]) { const [x0, y0] = pj(0, 0), [x1, y1] = pj(s * 233.3, 233.3); b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y1); b.stroke(); }
  for (let i = 1; i < 4; i++) { const { x, y } = BP[i]; p2(b, [pj(x, y - 2.4), pj(x + 2.4, y), pj(x, y + 2.4), pj(x - 2.4, y)], '#fff'); }
  b.restore();
  b.strokeStyle = '#df0'; b.lineWidth = 2;
  b.beginPath(); fp.forEach(([x, y], i) => (i ? b.lineTo(x, y) : b.moveTo(x, y))); b.stroke();
  b.lineWidth = 3;
  for (const s of [-1, 1]) { const [x0, y0] = pj(s * 233.3, 233.3), [, y1] = pj(s * 233.3, 233.3, 45); b.beginPath(); b.moveTo(x0, y0); b.lineTo(x0, y1); b.stroke(); }
  vig(b, .45);
}

// ---------- sound (Web Audio through Phaser's context) ----------
let AC, NB;
// audio param helpers
const XR = (q, v, t) => q.exponentialRampToValueAtTime(v, t), LR = (q, v, t) => q.linearRampToValueAtTime(v, t), SV = (q, v, t) => q.setValueAtTime(v, t), BPF = 'bandpass';
function unlock() { try { AC = AC || (S && S.sound && S.sound.context); if (AC && AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; } }
function tone(f, d, ty = 'square', v = .06, sl = 0, dl = 0) {
  if (!AC) return;
  const t = AC.currentTime + dl, o = AC.createOscillator(), n = AC.createGain();
  o.type = ty; SV(o.frequency, f, t);
  if (sl) XR(o.frequency, max(30, f + sl), t + d);
  SV(n.gain, v, t); XR(n.gain, .001, t + d);
  o.connect(n).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, v, ff, ty = BPF, dl = 0, att = .005) {
  if (!AC) return;
  nbuf();
  const t = AC.currentTime + dl, s = AC.createBufferSource(), f = AC.createBiquadFilter(), n = AC.createGain();
  s.buffer = NB; f.type = ty; f.frequency.value = ff;
  SV(n.gain, .0001, t); LR(n.gain, v, t + att); XR(n.gain, .001, t + d);
  s.connect(f).connect(n).connect(AC.destination); s.start(t); s.stop(t + d + .05);
}
function nbuf() { if (!NB) { NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const a = NB.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = random() * 2 - 1; } }
// crowd murmur loop while a game is on
let AMB;
function amb(on) {
  try {
    if (on && AC && !AMB) { nbuf(); const s = AC.createBufferSource(), f = AC.createBiquadFilter(), n = AC.createGain(); s.buffer = NB; s.loop = true; f.type = BPF; f.frequency.value = 520; f.Q.value = .7; n.gain.value = .035; s.connect(f).connect(n).connect(AC.destination); s.start(); AMB = s; }
    if (!on && AMB) { AMB.stop(); AMB = null; }
  } catch (e) { AMB = null; }
}
// crowd signs in the stands (pitch view and field view)
let GR = null;
const grada = (t, col = CH, d = 2) => { GR = { t, Al: col, k: clock, d }; };
function gradaHud(y) {
  if (!GR || clock - GR.k > GR.d) return;
  const e = clock - GR.k, a = min(1, (GR.d - e) * 3), sc = 1.2 + (e % .6 < .3 ? .12 * (1 - e % .6 / .3) : 0);
  if (GR.t.length > 12) return TB(GR.t, 400, y, sc, GR.Al, a);
  TB(GR.t, 230, y, sc, GR.Al, a); TB(GR.t, 570, y, sc, GR.Al, a);
}
// stadium organ note: sine drawbars (1x, 2x, 3x, sub-octave) with a held envelope
function onote(f, d, dl) {
  if (!AC) return;
  const t = AC.currentTime + dl, n = AC.createGain();
  SV(n.gain, .0001, t); LR(n.gain, .07, t + .012); SV(n.gain, .07, t + d * .75); LR(n.gain, .0001, t + d);
  n.connect(AC.destination);
  for (const m of [1, 2, 3, .5]) { const o = AC.createOscillator(); o.frequency.value = f * m; o.connect(n); o.start(t); o.stop(t + d + .02); }
}
const RIFF = [[523, 659, 784, 1047, 0, 784, 1047], [392, 494, 587, 784, 0, 587, 784], [440, 554, 659, 880, 0, 880, 659, 880], [587, 587, 698, 880, 0, 1175]];
function organ(dl = 0) { pick(RIFF).forEach((f, i) => f && onote(f, .15, dl + i * .14)); }
// applause: many short filtered claps, denser at the start
function applause(d, k = 1) {
  if (!AC) return;
  nbuf();
  for (let i = 0, n = d * 45 * k | 0; i < n; i++) {
    const dl = random() ** 1.6 * d, t = AC.currentTime + dl, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g2 = AC.createGain();
    s.buffer = NB; f.type = BPF; f.frequency.value = rnd(900, 2600); f.Q.value = rnd(.8, 1.6);
    SV(g2.gain, rnd(.35, .8) * k * (1 - dl / d * .7), t); XR(g2.gain, .001, t + rnd(.015, .035));
    s.connect(f).connect(g2).connect(AC.destination); s.start(t, random() * 1.5, .05);
  }
}
const sfx = {
  // wood At: sharp click + band noise + damped wood modes; better contact = brighter and louder, power adds a low boom
  crack(q = .7) {
    noise(.006, .5, 3000, 'highpass', 0, .001); noise(.05, .2 + q * .2, 1700, BPF, 0, .001);
    tone(560 + q * 140, .08, 'sine', .22 * (.5 + q)); tone(1150 + q * 250, .05, 'sine', .13 * (.5 + q)); tone(2300, .025, 'sine', .08);
    if (q > .7) tone(180, .14, 'sine', .2, -60);
  },
  // catcher's mitt: leather slap + low pop
  mitt() { noise(.004, .7, 2500, BPF, 0, .001); noise(.06, .6, 600, 'lowpass', 0, .002); tone(140, .07, 'sine', .3, -50); },
  strike() { onote(784, .09, 0); onote(1047, .16, .08); noise(.4, .08, 800, BPF, .05, .1); },
  ball() { tone(330, .08, 'triangle', .06); },
  out() { onote(523, .12, 0); onote(415, .12, .13); onote(330, .34, .26); },
  safe() { tone(523, .08, 'square', .05); tone(784, .14, 'square', .05, 0, .08); },
  cheer(d = 1.8) { noise(d, .22, 900, BPF, 0, .25); noise(d * .8, .12, 2400, BPF, .1, .3); },
  charge() { [392, 523, 659, 784, 659, 784].forEach((f, i) => onote(f, i === 5 ? .5 : .14, i * .16)); },
  sel() { tone(880, .07, 'square', .05); },
  mv() { tone(520, .04, 'square', .03); },
};

// ---------- storage ----------
// storage: the arcade API, or localStorage when testing locally (errors end in the callers' catch)
const store = () => window.platanusArcadeStorage || { get: async k => ({ value: JSON.parse(localStorage.getItem(k)) }), set: async (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const okN = n => Number.isInteger(n) && n >= 0 && n < 1e6;
const LKEY = ['se-fue-derby-v1', 'se-fue-chapita-v1'];
const okE = e => e && typeof e.n === 'string' && /^[A-Z0-9 ]{1,6}$/.test(e.n) && okN(e.h) && e.h < 100 && okN(e.d) && e.d < 1000;
const lbSort = a => a.sort((x, y) => y.h - x.h || y.d - x.d).slice(0, 5);
function loadLB() {
  LKEY.forEach((k, i) => Promise.resolve().then(() => store().get(k)).then(r => { const v = r && r.value; if (Array.isArray(v)) LBS[i] = lbSort(v.filter(okE).map(e => ({ n: e.n, h: e.h, d: e.d }))); }).catch(() => { }));
}
function saveLB(i) { Promise.resolve().then(() => store().set(LKEY[i], LBS[i])).catch(() => { }); }

// ---------- game flow ----------
const tname = tm => (tm === 0 ? 'P1' : G.J[1] ? 'P2' : 'CPU');
function say(a, b = '', col = CH, d = 1.6) { MSG = { a, b, Al: col, t: d }; }

// new game state for any mode (o: mode-specific fields)
function mkG(o) {
  G = { st: 'p', N: 1, X: 1, B: 0, b: 0, s: 0, D: [0, 0, 0, 0], E: [0, 0], g: [[], []], Aa: [0, 0], o: 0, W: 0, it: 0, dl: 60, e: 0, S: 0, ...o };
  lastInput = clock; amb(1);
}
function newGame(players) {
  mkG({ Ad: 0, N: 4, A: 0, J: [1, players === 2 ? 1 : 0] });
  startHalf();
}
function newDerby(pl) {
  mkG({ O: 1, Ad: 1, A: pl, J: pl ? [0, 1] : [1, 0] });
  BAN = { a: 'DERBY DE JONRONES', b: '60 SEGUNDOS · ¡SÁCALA DEL ESTADIO!', Al: TS[pl], t: 2.2 };
  newPitch(2.2);
}
function newBatter() {
  G.b = G.s = 0;
  if (!G.O && G.B < 3) { if (G.D[2] || G.D[3]) sfx.charge(); else organ(.2); grada('¡VAMOS ' + TN[G.A] + '!', TS[G.A], 2); }
}
function startHalf() {
  G.B = 0; G.D = [0, 0, 0, 0]; G.b = G.s = 0; G.o = 0; G.st = 'p';
  const bt = G.A;
  BAN = { a: (bt ? 'BAJA' : 'ALTA') + ' DEL ' + G.X + (G.X > G.N ? ' · EXTRA' : ''), b: 'BATEAN ' + TL[bt] + ' ' + TN[bt] + ' · ' + tname(bt), Al: TS[bt], t: 2.2 };
  newPitch(2.2);
  organ(1.2);
}
function newPitch(delay = 0) {
  P = { ph: 'r', t: -delay, cx: 0, cy: 0, Cu: rnd(.8, 1.5), sx: 0, sy: 0 };
}
function endHalf() {
  const bt = G.A;
  G.g[bt][G.X - 1] = G.o;
  if (bt === 0) { if (G.X >= G.N && G.E[1] > G.E[0]) return gameOver(); G.A = 1; }
  else { if (G.X >= G.N && G.E[0] !== G.E[1]) return gameOver(); G.X++; G.A = 0; }
  startHalf();
}
function gameOver() {
  G.st = 'v'; G.it = 0;
  const w = G.E[0] > G.E[1] ? 0 : 1;
  G.Cd = w;
  party(6, TC[w]); sfx.cheer(2.5); applause(4, 1.3);
}
function toTitle() { G = { st: 'T', Ad: G.Ad || 0, it: 0 }; MSG = BAN = FB = GR = null; Y = null; amb(0); }
function runScores(n = 1) {
  G.E[G.A] += n; G.o += n;
}
const walkOff = () => G.A === 1 && G.X >= G.N && G.E[1] > G.E[0];

function inGame(dt) {
  if (any('START1', 'START2')) { G.W = !G.W; sfx.sel(); }
  if (G.W && any('P1_1', 'P2_1') || clock - lastInput > 120) { toTitle(); return; }
  if (!G.W) {
    if (BAN) BAN.t -= dt;
    if (MSG) MSG.t -= dt;
    if (G.st === 'p') stepPitch(dt);
    else if ('yo'.includes(G.st)) {
      const fast = G.st === 'y' && (hd(0, '3') || hd(1, '3')) ? 3 : G.st === 'y' && Y.K !== 'a' && !Y.hr && !G.J[1 - G.A] ? 2 : 1;
      for (let i = 0; i < fast && ('yo'.includes(G.st)); i++) { const k = G.Au > 0 ? .4 : 1; G.Au -= dt * k; stepPlay(dt * k); }
    }
  }
  if (G.st === 'd') return derbyEnd(dt);
  if (G.st === 'p') drawPitch(); else if ('yo'.includes(G.st)) drawField();
  if (G.st === 'v' || G.st === 'T') return;
  hudMsgs();
  if (G.W) {
    g = gx; rc(0, 0, W, H, 0x000000, .6);
    T('PAUSA', 400, 250, 2.5, US[0], .5, 1, 7, 24);
    T('START: SEGUIR · 1: SALIR', 400, 330, 1.8, CH, .5, 1, 7);
  }
}

// ---------- the pitch ----------
function aiPitch() {
  if (G.O) { P.sx = P.sy = 0; return throwPitch(G.I ? random() * 3 | 0 : random() < .65 ? 0 : 2, rnd(-.55, .55), rnd(-.55, .55)); }
  const r = random(), three = G.b === 3;
  const type = three ? (r < .75 ? 0 : 2) : r < .46 ? 0 : r < .76 ? 1 : 2;
  let x = rnd(-.85, .85), y = rnd(-.85, .85);
  if (!three && random() < (G.s === 2 ? .45 : .24)) { if (random() < .5) x = sign(x || 1) * rnd(1.2, 1.6); else y = sign(y || 1) * rnd(1.2, 1.6); }
  P.sx = rnd(-.5, .5); P.sy = rnd(-.5, .5);
  throwPitch(type, x, y);
}
function throwPitch(type, x, y) {
  Object.assign(P, { type, bx: x, by: y, ph: 'w', t: 0, w0: rnd(0, 6), Tf: PT[type], Bp: round(rnd(...MPH[type])) });
}
function aiBat() {
  const fx = P.bx + BRK[P.type][0] + P.sx * .4, fy = P.by + BRK[P.type][1] + P.sy * .4;
  const inZ = abs(fx) <= 1.05 && abs(fy) <= 1.05;
  P.Ct = fx + rnd(-.27, .27); P.Cs = fy + rnd(-.27, .27); P.Bd = 1;
  if (random() > (inZ ? (G.s === 2 ? .92 : .78) : (G.s === 2 ? .36 : .17))) return;
  let err = rnd(-.1, .1);
  if (P.type === 2 && random() < .55) err -= .1;
  P.Bi = P.Tf - SWT + err;
  P.Bv = G.b > G.s && random() < .55 ? 1 : 0;
}
function stepPitch(dt) {
  P.t += dt;
  const bt = G.A, ft = 1 - bt, hb = G.J[bt], hf = G.J[ft];
  if ('rwf'.includes(P.ph)) {
    let [mx, my] = hb ? axis(bt) : [0, 0];
    if (!hb && P.Bd) { mx = clamp((P.Ct - P.cx) * 8, -1, 1); my = clamp((P.Cs - P.cy) * 8, -1, 1); }
    P.cx = clamp(P.cx + mx * CUR * dt, -1.6, 1.6); P.cy = clamp(P.cy + my * CUR * dt, -1.6, 1.6);
    if (hb && !hf && P.ph === 'f') { const k = min(1, dt * 1.6); const [ox, oy] = bk(1); P.cx += (P.bx + ox - P.cx) * k; P.cy += (P.by + oy - P.cy) * k; }
  }
  if (G.O && P.t > 0 && P.ph !== 'i' && P.ph !== 'c') { G.dl -= dt; if (G.dl <= 0 && P.ph === 'r') return toDerbyEnd(); }
  if (P.ph === 'r') {
    if (P.t < 0) return;
    if (G.s === 2 && !P.ch) { P.ch = clock; grada('¡PON-CHE!', CH, 4); }
    if (hf && P.t > .35) {
      for (let i = 0; i < 3; i++) if (pr(ft, String(i + 1))) {
        const [ax, ay] = axis(ft);
        throwPitch(i, ax ? ax * .78 + rnd(-.12, .12) : rnd(-.35, .35), ay ? ay * .78 + rnd(-.12, .12) : rnd(-.35, .35));
        sfx.sel(); return;
      }
      if (P.t > 10) aiPitch();
    } else if (!hf && P.t > P.Cu) aiPitch();
  } else if (P.ph === 'w') {
    if (P.t >= WIND) { P.ph = 'f'; P.t = 0; if (!hb) aiBat(); }
  } else if (P.ph === 'f') {
    const p = P.t / P.Tf;
    if (p < .8) {
      const [sx, sy] = hf ? axis(ft) : [P.sx, P.sy];
      P.bx = clamp(P.bx + sx * STR[P.type] * dt, -1.9, 1.9); P.by = clamp(P.by + sy * STR[P.type] * dt, -1.9, 1.9);
    }
    if (!P.sw) {
      if (hb) { if (pr(bt, '1') || pr(bt, '2')) P.sw = { t: P.t, pw: pr(bt, '1') ? 0 : 1 }; }
      else if (P.t >= P.Bi) P.sw = { t: P.t, pw: P.Bv };
      if (P.sw) P.Bn = clock;
    }
    if (P.t >= P.Tf) {
      const sw = P.sw, tc = sw ? sw.t + SWT : 0;
      if (!sw || tc < P.Tf - WIN[sw.pw] || tc > P.Tf + WIN[sw.pw] || P.t >= tc) resolvePitch();
    }
  } else if (P.ph === 'c') stepChap(dt);
  else if (P.ph === 'i') {
    if (P.t > P.hs + .22) { G.st = 'y'; CAM.flash(160, 255, 255, 255); }
  } else if (P.ph === 's') {
    if (P.t > P.L) {
      if (walkOff()) { G.g[1][G.X - 1] = G.o; return gameOver(); }
      if (G.B >= 3) return endHalf();
      if (P.Az) newBatter();
      newPitch();
    }
  }
}
function resolvePitch() {
  const [ox, oy] = bk(1), fx = P.bx + ox, fy = P.by + oy;
  P.fx = fx; P.fy = fy;
  if (P.sw) {
    const pw = P.sw.pw, dtm = P.sw.t + SWT - P.Tf, r = RAD[pw] * (G.I ? .82 + G.ck[9] * .06 : 1), dx = fx - P.cx, dy = fy - P.cy, d = hyp(dx, dy), ok = abs(dtm) <= WIN[pw];
    if (ok && d <= r) return contact(pw, dtm / WIN[pw], 1 - d / r, dy / r);
    fb(!ok ? (dtm < 0 ? 'MUY TEMPRANO' : 'MUY TARDE') : 'LEJOS DE LA BOLA', '#f84');
    return call('swing');
  }
  call(abs(fx) <= 1.08 && abs(fy) <= 1.08 ? 'strike' : 'ball');
}
function fb(t, c) { if (G.J[G.A]) FB = { t, c, k: clock }; }
function call(kind) {
  const bt = G.A;
  let a = '', b = '', col = CH, walked = 0;
  P.ph = 's'; P.t = 0; P.L = .85;
  if (G.O) { if (kind === 'foul') P.Ay = 1; else sfx.mitt(); P.L = .5; return say(kind === 'ball' ? 'BOLA' : kind === 'foul' ? 'FOUL' : 'STRIKE', '', CH, .5); }
  if (kind === 'ball') {
    sfx.mitt(); sfx.ball();
    if (++G.b >= 4) {
      walked = P.Az = 1; a = 'BASE POR BOLAS'; col = TS[bt]; applause(1, .5);
      const B = G.D;
      if (B[1]) { if (B[2]) { if (B[3]) { runScores(); b = '¡ANOTA CON LAS BASES LLENAS!'; } B[3] = 1; } B[2] = 1; }
      B[1] = 1;
    } else a = 'BOLA';
  } else if (kind === 'foul') {
    a = 'FOUL'; P.Ay = 1;
    if (G.s < 2) G.s++;
  } else {
    sfx.mitt();
    if (++G.s >= 3) { P.Az = 1; G.B++; a = kind === 'swing' ? pick(['¡PONCHADO!', '¡ABANICÓ!']) : '¡PONCHADO MIRANDO!'; col = '#f55'; P.L = 1.3; sfx.out(); grada('¡PON-CHA-DO!', '#f55'); }
    else { sfx.strike(); a = kind === 'swing' ? 'STRIKE · ABANICÓ' : 'STRIKE'; }
  }
  say(a, b, col, P.L);
}
function contact(pw, tq, q, dy) {
  sfx.crack(abs(tq * 50) > 45 || q < .08 ? .15 : q * (pw ? 1.1 : .9));
  const sp = (tq * 50 + rnd(-5, 5)) * PI / 180;
  const la = clamp((pw ? 24 : 14) + dy * 48 + rnd(-5, 5), -30, 75) * PI / 180;
  const ev = (pw ? 185 : 145) * (.45 + .55 * q) * (1 - .15 * abs(tq));
  if (abs(sp) > PI / 4 || q < .08) { fb(tq < 0 ? 'TEMPRANO' : 'TARDE', '#fc4'); return call('foul'); }
  const perf = q > .82 && abs(tq) < .25;
  fb(perf ? '¡PERFECTO!' : abs(tq) < .3 ? '¡JUSTO!' : tq < 0 ? 'TEMPRANO' : 'TARDE', perf || abs(tq) < .3 ? '#7f6' : '#fc4');
  P.ph = 'i'; P.t = 0; P.Cm = sp; P.Cn = la; P.hs = perf ? .15 : .06 + q * .04;
  CAM.shake(140 + q * 180, .004 + q * .011);
  G.Au = perf ? 1.2 : 0;
  if (G.I) return chapHit(ev, la, sp);
  startPlay(ev, la, sp);
}

// ---------- ball in play ----------
function simBall(vx, vy, vz) {
  let x = 0, y = 1.5, z = 3, ld = 0, hr = 0, land = 1e9, hrI = 1e9, zmax = 3, maxd = 0, hrd = 0;
  const path = [];
  for (let i = 0; i < 640; i++) {
    path.push([x, y, z, ld]);
    if (z > 0 || vz > 0) { const s = hyp(vx, vy, vz) * .002; vx -= s * vx * DT; vy -= s * vy * DT; vz -= (28 + s * vz) * DT; }
    x += vx * DT; y += vy * DT; z += vz * DT;
    zmax = max(zmax, z);
    if (z <= 0) {
      z = 0;
      if (!ld) { ld = 1; land = i + 1; }
      if (hr) break;
      if (vz < -7) { vz = -vz * .42; vx *= .82; vy *= .82; }
      else { vz = 0; const s = hyp(vx, vy), ns = max(0, s - 16 * DT); if (s > 0) { vx *= ns / s; vy *= ns / s; } }
    }
    const r = hyp(x, y), ph = atan2(x, y);
    if (!hr && abs(ph) < .8 && r > fenceR(ph)) {
      if (z > 10 && !ld) { hr = 1; hrI = i; }
      else {
        const ux = x / r, uy = y / r, vr = vx * ux + vy * uy, fr = fenceR(ph) - .5;
        if (vr > 0) { vx -= 1.4 * vr * ux; vy -= 1.4 * vr * uy; }
        x = ux * fr; y = uy * fr;
      }
    }
    if (hr) hrd = r; else maxd = max(maxd, r);
  }
  return { H: path, Br: land, hr: hr, Aj: hrI, Bl: zmax, Bq: maxd, Bt: round(hrd) };
}
function startPlay(ev, la, sp) {
  const cl = cos(la), sim = simBall(ev * cl * sin(sp), ev * cl * cos(sp), ev * sin(la));
  Y = Object.assign(sim, {
    t: 0, F: DEF.map(([x, y, s]) => ({ x, y, s, tx: x, ty: y, Be: 0 })), K: 'a', fk: -1, hk: -1, ft: 1e9,
    B: 0, V: 0, Bh: 0, la: la * 57.3, sp, Aw: sim.Bq > 300 || sim.hr, R: []
  });
  const B = G.D, fo = [0, 1, B[1], B[1] && B[2]], air = Y.la > 14 && !Y.hr, two = G.B === 2;
  Y.R.push({ s: 0, C: 1, b0: 0, At: 1, v: .5, fo: 1, Bw: rnd(-.15, .15) });
  for (const b of [1, 2, 3]) if (B[b]) {
    const r = { s: b, C: b, b0: b, fo: fo[b], Bw: rnd(-.15, .15), v: 0 };
    if (Y.hr || two) r.C = b + 1;
    else if (air) r.C = b === 3 ? 3 : b + .4;
    else if (r.fo || (b === 2 && sp > 0)) r.C = b + 1;
    Y.R.push(r);
  }
  if (Y.hr) {
    Y.R.forEach(r => (r.C = 4));
    const [x, y] = Y.H[Y.Aj], ph = atan2(x, y), fr = fenceR(ph) - 2;
    let k = 6, md = 1e9; for (const j of [6, 7, 8]) { const d = hyp(Y.F[j].x - x, Y.F[j].y - y); if (d < md) { md = d; k = j; } }
    Object.assign(Y.F[k], { tx: fr * sin(ph), ty: fr * cos(ph), s: 30 });
    Y.fk = k;
  } else plan();
}
function derbyStep(dt) {
  if (Y.hd || (!Y.hr && (Y.G || Y.U))) Y.Ba = (Y.Ba || 0) + dt;
  if (Y.Ba > (Y.hr ? 1.8 : .7)) {
    if (Y.hr) { G.e++; G.S = max(G.S, Y.Bt); } else say(Y.U ? 'OUT' : 'NO SALIÓ', '', CH, .7);
    G.B = 0; G.st = 'p'; newPitch(.2);
  }
}
function plan() {
  let best = null;
  Y.F.forEach((f, k) => {
    const jmp = f.s * rnd(.85, 1.1);
    for (let i = 4; i < Y.H.length; i += 2) {
      const [x, y, z, ld] = Y.H[i], t = i * DT;
      if (z > (ld ? 3 : 7.5) || (!ld && z < 1)) continue;
      if (max(0, t - (ld ? .45 : .35)) * jmp + (ld ? 1.5 : 3) >= hyp(x - f.x, y - f.y)) { if (!best || t < best.t) best = { k, i, t, j: !ld }; break; }
    }
  });
  if (!best) { const i = Y.H.length - 1, [x, y] = Y.H[i]; let k = 0, md = 1e9; Y.F.forEach((f, j) => { const d = hyp(x - f.x, y - f.y); if (d < md) { md = d; k = j; } }); best = { k, i, t: max(i * DT, .25 + md / Y.F[k].s), j: 0 }; }
  Object.assign(Y, { fk: best.k, fi: best.i, ft: best.t, j: best.j, fp: { x: Y.H[best.i][0], y: Y.H[best.i][1] } });
  const f = Y.F[best.k];
  f.tx = Y.fp.x; f.ty = Y.fp.y;
  const cover = [1, best.k === 2 ? 0 : 2, Y.sp >= 0 ? (best.k === 4 ? 3 : 4) : (best.k === 3 ? 4 : 3), best.k === 5 ? 4 : 5];
  cover.forEach((k, b) => { if (k !== best.k) { Y.F[k].tx = BP[b].x; Y.F[k].ty = BP[b].y + (b ? 0 : -3); } });
  for (const k of [6, 7, 8]) if (k !== best.k) { const fk = Y.F[k]; fk.tx = lerp(fk.x, Y.fp.x, .45); fk.ty = lerp(fk.y, Y.fp.y, .45); }
}
const tT = (a, b) => { const d = hyp(a.x - b.x, a.y - b.y); return .45 + d / 95 + max(0, d - 160) / 110; };
function ballETA(bp) {
  if (Y.K === 'a') return max(0, Y.ft - Y.t) + tT(Y.fp, bp);
  if (Y.K === 'h') return max(0, Y.L) + tT(Y.F[Y.hk], bp);
  if (Y.K === 't') return max(0, Y.th.t0 + Y.th.du - Y.t) + tT({ x: Y.th.x1, y: Y.th.y1 }, bp);
  return 0;
}
const live = r => !r.Ae && !r.sc;
const claim = r => (r.C % 1 ? floor(r.C) : r.C);
function decide(r) {
  const b = r.C;
  if (b >= 4 || Y.hr || Y.K === 'dead') return;
  if (Y.K === 'a' && !Y.G && G.B < 2) return;
  const pushed = Y.R.some(o => o !== r && live(o) && o.C === b && o.s < b);
  if (!pushed && Y.R.some(o => o !== r && live(o) && claim(o) === b + 1)) return;
  if (pushed || RT + (G.B === 2 ? .1 : .45) + r.Bw < ballETA(BP[(b + 1) % 4])) r.C = b + 1;
}
function out(r) {
  r.Ae = 1; G.B++; Y.B++;
  if (!r.At) Y.fc = 1;
  sfx.out();
  if (G.B === 3 && (r.At && (Y.U || r.C === 1) || r.fo && r.C === r.b0 + 1) && Y.V) {
    G.E[G.A] -= Y.V; G.o -= Y.V; Y.V = 0; Y.Ac = 1;
  }
}
function throwDecide(f, delay) {
  let best = null;
  for (const r of Y.R) {
    if (!live(r) || r.s >= r.C || r.C % 1) continue;
    const bp = BP[r.C % 4], ta = delay + tT(f, bp), tr = (r.C - r.s) * RT + max(0, r.v);
    if (ta + .06 < tr && (!best || r.C > best.r.C)) best = { r, bp, ta };
  }
  const to = best ? best.bp : CUT;
  Y.th = { x0: f.x, y0: f.y, x1: to.x, y1: to.y, t0: Y.t + delay, du: (best ? best.ta : delay + tT(f, CUT)) - delay, r: best && best.r, b: best && best.r.C, Cp: !best };
  Y.K = 't';
}
// human fielding: joystick picks the base (right 1B, up 2B, left 3B, down home) + button 1
const dirBase = (ax, ay) => (!ax && !ay ? -1 : abs(ax) >= abs(ay) ? (ax > 0 ? 1 : 3) : ay > 0 ? 2 : 0);
function hold(t) { Y.K = 'h'; Y.L = t; Y.hw = G.J[1 - G.A]; Y.Bs = Y.t; Y.Bu = 0; }
function humanThrow() {
  const ft = 1 - G.A, f = Y.F[Y.hk], b = Y.As ? Y.As - 2 : dirBase(...axis(ft));
  if (Y.As || pr(ft, '1')) {
    Y.As = 0;
    if (b < 0) return throwDecide(f, 0);
    const tg = b || 4, bp = BP[b];
    sfx.sel();
    Y.th = { x0: f.x, y0: f.y, x1: bp.x, y1: bp.y, t0: Y.t + .05, du: tT(f, bp) - (Y.Bu ? .3 : 0), r: Y.R.find(r => live(r) && r.C === tg && r.s < tg), b: tg };
    Y.K = 't';
  } else if (Y.t - Y.Bs > 3 && Y.R.some(r => live(r) && r.s !== r.C)) throwDecide(f, 0);
}
function fielded() {
  Y.hk = Y.fk;
  if (Y.j) {
    Y.U = 1; sfx.mitt();
    out(Y.R[0]);
    for (const r of Y.R) if (live(r) && r.C % 1) r.C = floor(r.C);
    if (Y.Aw) say('¡ATRAPADA!', '', TS[1 - G.A], 1.2);
  } else sfx.mitt();
  hold(Y.j ? .45 : G.J[1 - G.A] ? .15 : .25);
}
function onLand() {
  for (const r of Y.R) if (live(r) && r.C % 1) r.C = ceil(r.C);
}
function arrive() {
  const th = Y.th, at = { x: th.x1, y: th.y1 };
  sfx.mitt();
  if (th.Cp) { Y.K = 'dead'; return; }
  if (th.r && live(th.r) && th.r.s < th.b) out(th.r);
  else sfx.safe();
  if (G.B >= 3) { Y.K = 'dead'; return; }
  if (G.J[1 - G.A]) {
    let k = 0, md = 1e9; Y.F.forEach((f, j) => { const d = hyp(f.x - at.x, f.y - at.y); if (d < md) { md = d; k = j; } });
    Object.assign(Y.F[k], { x: at.x, y: at.y, tx: at.x, ty: at.y }); Y.hk = k; hold(.1); Y.Bu = 1; return;
  }
  throwDecide(at, .05);
}
function homer() {
  say(pick(['¡Y SE FUE!', '¡SE LA LLEVÓ!', '¡QUÉ PALO!']), Y.Bt + ' PIES', TS[G.A], 3.2);
  grada('¡OTRA! ¡OTRA!', TS[G.A], 4);
  CAM.shake(450, .012);
  sfx.cheer(3); party(7, TC[G.A], 0xffffff); applause(5, 1.3);
}
function stepPlay(dt) {
  if (G.st === 'o') { Y.w -= dt; if (Y.w <= 0) afterPlay(); moveFielders(dt); return; }
  Y.t += dt;
  const i = min(Y.H.length - 1, floor(Y.t / DT));
  if (Y.K === 'a') {
    if (!Y.G && i >= Y.Br) { Y.G = 1; if (!Y.hr) onLand(); }
    if (Y.hr) { if (i >= Y.Aj && !Y.hd) { Y.hd = 1; homer(); } if (i >= Y.H.length - 1) Y.K = 'g'; }
    else if (Y.t >= Y.ft) fielded();
  }
  if ((Y.hw && (Y.K === 't' || (Y.K === 'h' && Y.L > 0)) || (G.J[1 - G.A] && Y.K === 'a' && Y.G && !Y.hr)) && pr(1 - G.A, '1')) Y.As = dirBase(...axis(1 - G.A)) + 2;
  if (Y.K === 'h') { if (Y.L > 0) Y.L -= dt; else if (G.B < 3) { if (Y.hw) humanThrow(); else if (!Y.An) { Y.An = 1; throwDecide(Y.F[Y.hk], 0); } } }
  else if (Y.K === 't') { if (Y.t >= Y.th.t0 + Y.th.du) arrive(); }
  moveFielders(dt);
  if (G.O) return derbyStep(dt);
  let moving = 0;
  if (G.B < 3) for (const r of Y.R) {
    if (!live(r)) continue;
    if (r.v > 0) { r.v -= dt; moving = 1; continue; }
    const v = dt / RT * (Y.hr ? 3.2 : 1);
    if (r.s < r.C) r.s = min(r.C, r.s + v); else if (r.s > r.C) r.s = max(r.C, r.s - v);
    if (r.s === r.C) {
      if (r.C === 4) { r.sc = 1; Y.V++; runScores(); if (!Y.hr) sfx.safe(); }
      else if (r.C % 1 === 0) decide(r);
    }
    if (live(r) && r.s !== r.C) moving = 1;
  }
  const quiet = G.B >= 3 || (!moving && (Y.K === 'dead' || Y.K === 'g' || (Y.K === 'h' && Y.hw && Y.t - Y.Bs > 1.2)));
  Y.Bh = quiet ? Y.Bh + dt : 0;
  if (Y.Bh > (Y.hr ? 1.4 : G.B >= 3 ? .9 : .45)) finishPlay();
}
function moveFielders(dt) {
  if (Y.t < .25) return;
  Y.F.forEach(f => {
    const dx = f.tx - f.x, dy = f.ty - f.y, d = hyp(dx, dy);
    if (d > .4) { const m = min(d, f.s * dt); f.x += dx / d * m; f.y += dy / d * m; f.Be = 1; } else f.Be = 0;
  });
}
function finishPlay() {
  const bt = G.A, bR = Y.R[0], reached = bR.sc ? 4 : live(bR) ? round(bR.s) : 0;
  let a, col = TS[bt];
  if (Y.hr) a = '¡JONRÓN!';
  else if (Y.B >= 2) { a = pick(['¡DOBLE PLAY!', '¡DOBLE MATANZA!']); col = TS[1 - bt]; grada('¡DOBLE MATANZA!', TS[1 - bt]); }
  else if (bR.Ae) {
    col = TS[1 - bt];
    a = Y.U ? (Y.V ? 'ELEVADO DE SACRIFICIO' : Y.Bl < 20 ? 'OUT · LÍNEA' : 'OUT · ELEVADO') : 'OUT EN ' + BN[bR.C];
  }
  else if (Y.fc) { a = 'OUT FORZADO'; col = TS[1 - bt]; }
  else a = ['', abs(Y.sp) < .1 ? '¡POR TODO EL MEDIO!' : pick(['¡HIT!', '¡PARA EL HIT!']), pick(['¡DOBLETE!', '¡TUBEY!']), '¡TRIPLE!', '¡JONRÓN DENTRO DEL PARQUE!'][reached];
  if (!bR.Ae && !Y.hr) { sfx.cheer(1.2); applause(1.8, .9); }
  if (Y.V && !Y.hr) applause(2.5, 1.1);
  if (Y.hr || (live(bR) || bR.sc) && !Y.fc) G.Aa[bt]++;
  const b = Y.V ? (Y.V === 1 ? '1 CARRERA' : Y.V + ' CARRERAS') : Y.Ac ? 'LA CARRERA NO CUENTA' : '';
  G.D = [0, 0, 0, 0];
  if (G.B < 3) for (const r of Y.R) if (live(r) && r.s >= 1 && r.s <= 3) G.D[round(r.s)] = 1;
  Y.fm = [Y.hr ? '¡JONRÓN!' : a, b, col, 1.5];
  say(...Y.fm); G.st = 'o'; Y.w = 1.5;
}
function afterPlay() {
  newBatter();
  if (walkOff()) { G.g[1][G.X - 1] = G.o; return gameOver(); }
  if (G.B >= 3) return endHalf();
  G.st = 'p'; newPitch(.3);
}

// ---------- fireworks ----------
// celebration: n bursts in colour c (every other one d) and the charge fanfare
function party(n, c, d = c) { for (let i = 0; i < n; i++) burst(rnd(130, 670), rnd(60, 220), i % 2 ? c : d, i * .24); sfx.charge(); }
function burst(x, y, c, dl = 0) { for (let i = 0; i < 44; i++) { const a = i / 44 * TAU, v = rnd(70, 170); FW.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, c, l: 1.4, dl: dl }); } }
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
  if (r > 5) { LS(max(1, r * .13), 0xe0322d); g.beginPath(); g.arc(x - r * .95, y, r * .75, -.9, .9); g.strokePath(); g.beginPath(); g.arc(x + r * .95, y, r * .75, PI - .9, PI + .9); g.strokePath(); }
}
// characters: pixel-art sheets rendered from the CC0 Quaternius mannequin (posed in 3D, reduced to the palette).
// One sheet, base64 PNG ('-' stands for '/'): batter on top, pitcher and fielder below. SHS per character: frames
// [x in sheet, width, x offset from the feet], y in sheet, height, top offset from the feet.
// Recolour slots in alpha (255 - slot): 1-3 shirt, 4-5 pants, 6-7 helmet / cap / hair, 8-9 and 12 skin, 10 shoes,
// 11 white, 13-14 bat. KM: knee and shoe lines of each batter frame, to dress the chapita kids: Ce tank top (shirt
// above row 46, shoulders and arms, becomes skin), Cf 1 shorts / 2 ripped pants (holes at the knee), ft 1 cholas.
const SPI = 'iVBORw0KGgoAAAANSUhEUgAAAPAAAACqBAMAAABhbt8wAAAAKlBMVEUAAAAXEx-ZoGaocDwqOmr09PgVGjzc3ui3ek56SiryuBy2ixWmp686OkRB5Up+AAAADnRSTlMA--Lx+fT4+-f2-fz69T78ufkAAApDSURBVHja7dstbOPO1gZwDyfzbLJ1GiegfTmIykGkVfmC1Ysr-RVuZBJSFlp2C0MdZBqjoJKScpVzTu6ZcZ9bO8dfazld6d49WjnumZnzmw8nK22zgQ7Y4I+Eub35U-Ct-TPw3d1f+Gti8ufg1Zebf+G-sMFlYdvU9O3WfvXnBz-Fb-6nYDZ9PTz5b4VXX-4Oxx+C8QOogwHUHgLbeoYBbH3DDwmrl2V8uh6GtKGnO-3xY10rT2tg5teE1Zw4q-Zg+XXDgqWFsC7OlkGwdGVfPSPCVufrYcMxrWEDwzKE1YwkQLiaX2uYxTqWbH4G3y3LcJIGAePqn48mwqo4j3gE2PCvuWbYbDiCsG7rgH9BYJb3fc3kjrAU6YTVG-zqs60tvv-6VYUhH723N+fw+q4JngyHrStPGHcSesUP1fJXzG-sUNgkv36aDftCXIkbtrKlAV4LzDNQk7p-6A+vCxeWrdNNUeVeYFsp7kd8B6Dhj2qbdjgIkxgf5dcTx65QerdufNP9RmaE0myvihFyTj-vqjDw0XbfA3bl6VZWNpXhPiD1YUt5lyzg6hkYl5dW+dMDnt673vAuSq5xm7+5khKufhKX8g6WvIIDuHeI1OuGTZLAPQ-ryjbzTTPb4fHKw2EFBnDlYf1JLfAabr42aI8wfooFnnCby-ADgN3j5uH-JxV4s97tdjIhDyNQH1yznZtvF4zrp-jKwzivgXmapgA24UR2ugQDmEl68-3nZBWfw-9AXJlYFzzbPQOYytQfqqdiomNaBMI4jGczywZIbi-pzXfE57s0B1L-Bx2w2e2eJqt0D2BeXfH8QDjdJ8lM1sA9ytPcp-E9PIfdHnFQ14J3kxW7Q8FsiCHHWhgmF5gTmoTNMNpcdxh3n71ZhQAjnaeYfSw5yiVSP6swRvUoDYeoamqjBV4V3aTWIasUkZDyrLUvlkw4d-DM56pjem22DMTcLThvgVlqVoKPB9e058kzogqc2xb40Xfx3V1BW4Vd-sBie49wQj45AOZOz1OWroWZL5ZsS7AsuQPO22C-YIGPBa9hNhzdku35Eez5rHNMFc4a4dKC22BGBU7l0gYf2mBZMDe0Ac41zBHuyvcYI+oJz1NW93Wkp4KPrgGI3OUzzy3KSjAbj3Sb4WDOtYhbhfm+YdoAtUcAq2BGE8x+INAKq-yxgPNhcAAgGAAz74a3wFaDupDuaRpgo7sPgzUwHA6iQbDVRfrn9ZKzobBRCyas8rqYPv+Wvrqhd161Zc-PT31hqxr8Z8FBAVHxdqqH-ZA8vO6AWZ8L6AnX5wlLWxg-P9s+sNB2ZBjBcLgArIaPTXBEOEE8Jsz8UQ1QcNITPtTAGmA+74Dz4TCB4XBiu+TIr6sBxqHuaT+k80M9vJ8T1kvW8LwWhotJpGHM033WAEeZh9EQ1c7ImmGJ+jwnVD-m2219lBHTCrTkvxw2vwv-391-ohZmkiEJUwv0gW-wGZPfg82rz+q3BXyEsdWuiVFEfKMENdkwYedzWOJFvy2MZGPUf0KYxIe0kqgL1kkY1SUsCOu8y9bCYfLRtj31gF-6wzqv4KJp+2q74EU3HPeGFy9baZSm156wq6VhF21wrHdPYDdo2w0bV3vbCrNB5TUsDYRP3UdMWPpqgHvaOSE2MU7dOy2uDw3rpekJqSaG7YKTQTDzg2Ae8WsLrJdmGmC2AOgHy4JPwO-CzGvYfryeOp+tLfue6h9RAh35gEU6YT5br60wP677w1K1F7yVLgNglafXF2bfevgkh68ea+ZrYcuhGtaPQwv88Vluz2HTDvNudFjn2cC7Lph9FcyUdKmHVZ7FesOWd03wiwZ8XsPUTBe86IbdnurHmvnBMLkW2NTBtmlCHDsK-FoLMz8Yti1w7QMfbpnXsFUranm22LUnbJJEfmyZkF6HCja3w+6Q41J9PszmHE74YzGmDU62JViqVxtZd-HiKaYJc0LnMMfEbXAia9IwV-YJ+25MsyMnVCo2ADavUqXaxsZFUoW3Jw37hiLPMS1wyBoOemmEWZJpDgpZnA3sxbaWBW9tExyyEEuq+YwF812pVlaFY3kgLfMcwSO4JIyY9TVse8JhB8wjLsPfbrDgTrfArNYTTipTroUxWRm1uZzoGLAJQxmp4SibWFJVmJ26YZNUqAUlHxOAbQKD3Uyel2HJs4GzYLVWuNJoKv82gm9gG5BMSnDG+7CyQwh59j4A9IWDb+UvSkfZKg6YB8pwqTbKgxFUit2iEQZQnWRkP+F8AuZxe6NhX-tzAMBd4c9YBZ3fBaeVl+GMQpQjKsEl6xvzvj-v2bFtxRrWP8ht5b5s5Vb1V1vDqEDoA5smuFw74n0-2Db9zHEKrliVPsNhMwhWY1VPhqrdE1ZjzHDY-jaMDPWwYobDtgbGHerhqD+sJ2miKqwfBoMJYOth2xfWLUAZzurg5RskxoczfDZeQ8MoYNsTZk-VYjXMFOuzhmW2HkZ5g9i6fH9-06yBgss1l+8lOcqWKNL8xQLz7pb5cyBzsFoyZNfOYfNpwcP8KZISxT2YZR6W88R5tcmKoyqGwJlKToCgfJhc0Ps7J19ZF7gmuVEr1knC71Yn3wgDJRgO1udllky7gVa3qqSEg2vm6GB28KOrQxVt+TJamOKr-NP2L4ZP13wZF5ZrEwx24stYMRWyBAPn87IXheW60aV98-pSMPAgFeXqKs+mLA155dlfBDb+iyt4foZzdx7yxroEQ4Iv48LGweb6X+BX4qducdxqk+7nqXUvUW7HciFh3dfNEczk60L3hIunzewxd2J6OO6DubyMBUsxiX2xJAjP-0dW-McL31yIxxSpg7ORYXf1f7HKCqtwvjf+K5uydn5rdzx4vp87Ps-T63m6d-C6+A9684OIBshzXOPRvWAsOE-z434uRyxglKd7WRUExvQHchRwgKc8e0Ywe-QvY8GRg+FXatxh+t00KeBuEPl5IMKTJIEMwVgwnoA9nvZyDcTzxygr9TfADsBMyFP8JJ2BhR0LxvUznmFkvX4TZYEZskcPZ9jZWfiaSN64q--n4tFgA+SwAuXX9gM2eJSlH+RmZ5E4kv-uKvBpLNg9PhDfX+XVwc9W0g5GIHC8cvCLh5PteDAAB0c4g-dRdv3k--XEXgYOfU1zkr0k-ORu9o-5V8Ahfzng1u9v0hlk5SZG6GH+PnR82Jfk0ooZeDjwMBYePmE02Ljv7NgynFjOQJ5z8RwJu3BZczIYF5arh81rCU5gCS9t5OHMvI0Iv74KfMInzJvYBpEVzcHwWVwANpmCEXzCy5Fh-gpuQfgEwn4GEFh8EyydCAR2PBgow1b+FOnQwUsPSxAeK0gJjDK8kBuBzbuD-Ux4GR9++-BeCEvaJ6G50WA526WHT4FJ4kBAuXFL9+sMLgqbKmw9fMFwz1TkbL+4SC5h9pVwXiCQl0gyS4GDxRfA7o+EeS-D0RfDLiMHfnEYfoNRgiF39vLwm4NNBf4AcVF46WAQW1ZgXHTFjrLEjLvQgyQvHqg--svFvwGx5Apicp9-MwAAAABJRU5ErkJggg==', SHS = [[[[0, 46, -18], [46, 48, -20], [94, 85, -29], [179, 61, -33]], 0, 129, -131], [[[0, 12, -6], [12, 12, -6], [24, 20, -10], [44, 17, -8]], 129, 41, -39], [[[61, 12, -6], [73, 14, -7], [87, 14, -7]], 129, 31, -28]], KM = [[97, 125], [96, 122], [98, 124], [97, 125]];
let SIM;
function sTex(L) {
  const k = 'S' + [L.sh, L.pa, L.hc, L.sk, L.fc, L.Ce, L.Cf, L.ft, L.br], im = SIM;
  if (!S.textures.exists(k) && im.width) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), w = c.width = im.width, C = [0, lt(L.sh), L.sh, dk(L.sh), L.pa, dk(L.pa), L.hc, dk(L.hc), L.sk, dk(L.sk), L.fc, 0xf4f4f8, lt(L.sk), L.br ? 0xead4aa : 0xd9a066, L.br ? 0xc28569 : 0xa8703c];
    c.height = im.height; x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, w, c.height), p = d.data;
    for (let j = 3; j < p.length; j += 4) {
      let s = 255 - p[j];
      if (s && s < 15) {
        const X = (j >> 2) % w, Y = (j >> 2) / w | 0, [kn, sy] = KM[SHS[0][0].findIndex(q => X < q[0] + q[1])];
        if (L.Cf && s > 3 && s < 6 && (L.Cf > 1 ? abs(Y - kn) < 3 && X % 5 < 3 : Y > kn)) s += 4;
        if (L.Ce && s < 4 && Y < 46) s = s < 3 ? 8 : 9;
        if (L.ft === 1 && s > 9 && s < 12 && Y >= sy) s = Y < sy + 2 ? 8 : 10;
        const v = C[s]; p[j - 3] = v >> 16; p[j - 2] = v >> 8 & 255; p[j - 1] = v & 255; p[j] = 255;
      }
      if (p[j]) { const v = snap(p[j - 3] << 16 | p[j - 2] << 8 | p[j - 1]); p[j - 3] = v >> 16; p[j - 2] = v >> 8 & 255; p[j - 1] = v & 255; }
    }
    x.putImageData(d, 0, 0);
    const t = S.textures.addCanvas(k, c); SHS.forEach(([F, sy, h], i) => F.forEach(([sx, fw], n) => t.add(i * 4 + n, 0, sx, sy, fw, h)));
  }
  return k;
}
// frame f of sheet i with the feet at x, y
function spr(i, f, L, x, y, d = 1.2) {
  const k = sTex(L), q = SHS[i];
  if (!S.textures.exists(k)) return;
  let im = tp[ti++];
  if (!im) tp.push(im = S.add.image(0, 0, k));
  im.setTexture(k, i * 4 + f).setPosition(RP(x + q[0][f][2] * PX), RP(y + q[3] * PX)).setScale(PX).setOrigin(0).setAlpha(1).setDepth(d).setVisible(true);
}
const kit = (c, pa = 0xeceef6) => ({ sh: c, pa, hc: dk(c), sk: 0xb77a4e, fc: 0x181425 });
// batter: stance, load, contact, follow-through; light arcs smear the bat through the swing
function batter(sw, L, x = 300, y = 602, d = 1.2) {
  spr(0, sw < 0 ? 0 : sw < .04 ? 1 : sw < SWT + .06 ? 2 : 3, L, x, y, d);
  if (sw > .02 && sw < SWT + .1) { g = gw2; for (let r = 96; r < 150; r += 18) { LS(4, 0xffffff, (150 - r) / 160); g.beginPath(); g.arc(x + 26, y - 168, r, -1.3, min(.25, -1.3 + sw * 14)); g.strokePath(); } }
  g = gw2;
}
// break of the pitch at progress p (chapita caps also zig-zag)
const bk = p => { const B = (G.I ? [[0, .05], [0, -.7], [.25, -.2]] : BRK)[P.type], c = p * p * p; return [B[0] * c + (G.I ? [.1, .06, .45][P.type] * sin(p * 13 + P.w0) * p : 0), B[1] * c]; };
const kz = p => (1 / (60 * (1 - p) + 9) - 1 / 69) / (1 / 9 - 1 / 69);
function pitchBall(p) {
  const k = kz(p), [ox, oy] = bk(p), [tx, ty] = zs(P.bx + ox, P.by + oy);
  return [lerp(398, tx, k), lerp(258, ty, k) - 18 * sin(PI * k), 2.2 + 11.5 * k];
}
function chip(x, y, w, t, ci, on) {
  if (on) rr(x, y, w, 26, 5, TC[ci]); else { rr(x, y, w, 26, 5, 0x08090a); LS(1.5, TC[ci], .55); g.strokeRoundedRect(x + .75, y + .75, w - 1.5, 24.5, 5); }
  T(t, x + w / 2, y + 13, 1.4, on ? '#110' : TS[ci]);
}
function chipCol(x, y, label, items, ci, on) {
  const L = x < 99;
  T(label, x, y, 1.6, TS[ci], +!L);
  items.forEach((t, i) => { const w = tw(t, 1.4) + 14; chip(L ? x : x - w, y + 16 + i * 30, w, t, ci, i === on); });
}
function drawPitch() {
  bgI.setTexture(G.I ? 'chp' : 'pit');
  g = gw;
  const bt = G.A, ft = 1 - bt, ch = G.I;
  const at = P.ph === 'r' ? 0 : P.ph === 'w' ? .35 + P.t / WIND * .87 : 1.22 + (P.ph === 'f' ? P.t : 1);
  spr(1, at < .35 ? 0 : at < .9 ? 1 : at < 1.3 ? 2 : 3, ch ? kit(0xff922b, 0x4dabf7) : kit(TC[ft]), 400, 292, 1.1);
  if ('rwf'.includes(P.ph)) {
    const al = P.ph === 'r' ? .5 : 1;
    LS(2, 0xffd43b, .9 * al); g.strokeRect(362, 380, 96, 110);
    for (let i = 1; i < 3; i++) { ln(362 + i * 32, 380, 362 + i * 32, 490, 2, 0xffd43b, .35 * al); ln(362, 380 + i * 36.67, 458, 380 + i * 36.67, 2, 0xffd43b, .35 * al); }
  }
  if (P.ph === 'f') {
    const p = min(1, P.t / P.Tf), [x, y, r] = pitchBall(p);
    el(x, lerp(292, 556, p ** 1.5), r * 1.1, r * .35, 0, .28);
    g = gw2;
    for (let k = 1; k < 7; k++) { const [tx, ty, tr] = pitchBall(max(0, p - k * .035)); el(tx, ty, tr * .7, tr * .7, 0xffffff, .3 - k * .04); }
    ch ? capG(x, y, r) : ballG(x, y, r);
    g = gw;
  }
  const sw = P.sw ? clock - P.Bn : -1, caught = P.ph === 's' && P.fx !== undefined && !P.Ay;
  batter(sw, look(bt));
  if (P.ph === 'c') {
    const f = P.cf, q = 568 / (f.d + 3), x = 400 + f.x * q, r = max(2.5, q * .04);
    el(x, 296 + 1.5 * q, r, r * .35, 0, .3); capG(x, 296 + (1.5 - f.h) * q, r);
    g = gh; dist(round(f.d) + ' M'); g = gw;
  }
  if (!ch) {
  const [mx, my] = caught ? zs(P.fx, P.fy) : P.ph === 'f' ? zs(lerp(0, P.bx, min(1, P.t / P.Tf * 1.4)), lerp(-.6, P.by, min(1, P.t / P.Tf * 1.4))) : [440, 480];
  el(420, 614, 72, 44, 0x2a2f3d); ln(372, 584, 462, 604, 4, 0x15181f, .7); ln(468, 584, 378, 604, 4, 0x15181f, .7);
  el(420, 560, 25, 22, 0x1b2030); rr(398, 546, 44, 6, 3, 0x0f1218);
  el(mx, my + 4, 17, 15, 0x6b3f1d); el(mx, my + 5, 10, 8, 0x8a5a2b);
  if (caught) ballG(mx, my, 12);
  }
  if (P.ph === 'i') {
    const k = eo(clamp((P.t - P.hs) / .22, 0, 1));
    ballG(lerp(446, 400 + sin(P.Cm) * 700, k), lerp(434, P.Cn > .15 ? -40 : 300, k), lerp(13, 5, k));
    const r = 10 + 90 * k; LS(6 * (1 - k) + 1, 0xffffff, 1 - k); g.strokeCircle(446, 434, r);
  }
  if ('rwf'.includes(P.ph)) {
    const [x, y] = zs(P.cx, P.cy);
    LS(2, TC[bt], .55); g.strokeCircle(x, y, RAD[0] * 48);
    LS(3, TC[bt], .95); g.strokeCircle(x, y, RAD[1] * 48);
    for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ln(x + a * 8, y + b * 8, x + a * 30, y + b * 30, 2, TC[bt], .8);
  }
  g = gh;
  fbHud();
  gradaHud(154);
  board(); basesHud(G.D);
  if (P.ph !== 'r' && P.ph !== 'w') TD(ch ? 'CHAPA ' + CPN[P.type] : PN[P.type] + ' · ' + P.Bp + ' MPH', 400, 96, 2, TS[ft]);
  if (G.J[ft]) chipCol(14, 462, 'LANZA ' + tname(ft), PN.map((n, i) => i + 1 + ' ' + n), ft, P.ph === 'r' ? -1 : P.type);
  else TD('LANZA ' + tname(ft), 400, 36, 1.8, TS[ft]);
  if (G.J[bt]) {
    const it = ch ? ['1 PALO', '2 PALAZO'] : ['1 CONTACTO', '2 PODER'];
    chipCol(ch ? 14 : 786, 462, 'BATEA ' + tname(bt), it, bt, P.sw ? P.sw.pw : -1);
  } else T('BATEA ' + tname(bt), 786, 571, 1.8, TS[bt], 1);
}
function dist(t) { box(560, 528, 226, 60); T('DISTANCIA', 673, 545, 1.4, DIM); T(t, 673, 569, 2.6, CH); }
function fbHud() { if (FB && clock - FB.k < 1.4) T(FB.t, 786, 102, 1.8, FB.c, 1); }
function board() {
  if (G.O) {
    box(14, 14, 300, 92, TC[G.A]);
    const s = max(0, ceil(G.dl));
    T(G.I ? G.ck[0] : CU.n, 26, 32, 1.4, TS[G.A], 0); T('0:' + String(s).padStart(2, '0'), 302, 32, 2, s <= 10 && clock % .5 < .25 ? '#f55' : CH, 1);
    T(G.I ? "PA'L TECHO" : 'JONRONES', 26, 60, 1.6, DIM, 0); T(G.e, 302, 60, 2.2, CH, 1);
    T('MÁS ' + (G.I ? 'LEJOS' : 'LARGO'), 26, 88, 1.4, DIM, 0); T(G.S ? G.S + (G.I ? ' M' : ' PIES') : '-', 302, 88, 1.6, CH, 1);
    return;
  }
  box(14, 14, 230, 92);
  for (let tm = 0; tm < 2; tm++) {
    const y = 34 + tm * 26;
    if (G.A === tm) pl(TC[tm], 1, 22, y - 5, 29, y, 22, y + 5);
    emblem(TI[tm], 48, y, .38); T(TA[tm], 66, y, 1.5, TS[tm], 0); T(G.E[tm], 146, y, 2.2, CH, 1);
  }
  rc(158, 24, 2, 54, 0xffffff, .15);
  T(G.X, 184, 34, 2.2, CH);
  if (G.A) pl(0xffffff, 1, 200, 30, 212, 30, 206, 40); else pl(0xffffff, 1, 200, 40, 212, 40, 206, 30);
  for (let i = 0; i < 2; i++) el(182 + i * 18, 62, 5.5, 5.5, i < G.B ? 0xff5a4f : 0xffffff, i < G.B ? 1 : .18);
  T('B ' + G.b + '   S ' + G.s + '   OUT ' + G.B, 22, 89, 1.5, DIM, 0);
}
function basesHud(B) {
  box(712, 14, 74, 66);
  for (const [b, x, y] of [[2, 749, 34], [1, 768, 54], [3, 730, 54]]) {
    const c = cos(PI / 4) * 9.9;
    pl(B[b] ? TC[G.A] : 0xffffff, B[b] ? 1 : .15, x, y - c, x + c, y, x, y + c, x - c, y);
  }
}
function hudMsgs() {
  g = gh;
  if (BAN && BAN.t > 0) {
    const a = min(1, BAN.t * 3);
    rr(130, 214, 540, 112, 12, 0x04050c, .88 * a);
    TB(BAN.a, 400, 252, 2, BAN.Al, a);
    T(BAN.b, 400, 300, 1.8, CH, .5, a);
  } else if (MSG && MSG.t > 0) {
    const a = min(1, MSG.t * 4), y = G.st === 'p' ? 250 : 292;
    TB(MSG.a, 400, y, MSG.a.length > 14 ? 1.7 : 2.5, MSG.Al, a);
    if (MSG.b) T(MSG.b, 400, y + 46, 2.2, CH, .5, a);
  }
}

// ---------- drawing: field view ----------
const bpos = s => { const i = min(3, floor(s)), f = s - i, a = BP[i % 4], b = BP[(i + 1) % 4]; return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }; };
function ballXYZ() {
  if ('ag'.includes(Y.K)) { const p = Y.H[min(Y.H.length - 1, floor(Y.t / DT))]; return { x: p[0], y: p[1], z: p[2] }; }
  if (Y.K === 't' && Y.t >= Y.th.t0) { const th = Y.th, k = seg(Y.t, th.t0, th.t0 + th.du), d = hyp(th.x1 - th.x0, th.y1 - th.y0); return { x: lerp(th.x0, th.x1, k), y: lerp(th.y0, th.y1, k), z: 5 + d * .06 * 4 * k * (1 - k) }; }
  if (Y.K === 't') return { x: Y.th.x0, y: Y.th.y0, z: 5 };
  if (Y.K === 'dead') return { x: CUT.x, y: CUT.y, z: 5 };
  const f = Y.F[max(0, Y.hk)]; return { x: f.x, y: f.y, z: 5 };
}
function drawField() {
  bgI.setTexture('fld');
  g = gw;
  const bt = G.A, ft = 1 - bt, list = [];
  Y.F.forEach(f => list.push([f.x, f.y, TC[ft], f.Be ? clock * 16 : 0]));
  for (const r of Y.R) if (live(r)) { const p = bpos(r.s); list.push([p.x + (r.At && r.s < .05 ? -4 : 0), p.y, TC[bt], r.s !== r.C ? clock * 15 : 0]); }
  list.sort((a, b) => b[1] - a[1]);
  for (const [x, y, c, ph] of list) { const [sx, sy] = pj(x, y); el(sx, sy, 12, 4, 0, .35); spr(2, ph ? (sin(ph) > 0 ? 1 : 2) : 0, kit(c), sx, sy, 1.2 - y * 1e-5); }
  g = gw2;
  if (Y.K !== 'g' || Y.t < Y.H.length * DT) {
    const b = ballXYZ(), [sx, sy] = pj(b.x, b.y, b.z), [gx2, gy2] = pj(b.x, b.y), r = max(2.4, 1.4 * FP / (b.y + D0));
    if (Y.K === 'a' && !Y.G) for (let k = 8; k >= 1; k--) { const q = Y.H[max(0, floor(Y.t / DT) - k * 2)], [tx, ty] = pj(q[0], q[1], q[2]); el(tx, ty, r * .8, r * .8, 0xffffff, .3 * (1 - k / 9)); }
    if (b.z > .5) el(gx2, gy2, r * 1.2, r * .45, 0, .3);
    ballG(sx, sy, r);
  }
  g = gh;
  board(); const B = [0, 0, 0, 0]; for (const r of Y.R) if (live(r) && r.s === r.C && r.s >= 1 && r.s <= 3) B[r.s] = 1; basesHud(B);
  if (('ag'.includes(Y.K)) && Y.la > 14 && (!Y.G || Y.hr) && Y.t > .3) {
    const b = ballXYZ(), d = round(hyp(b.x, b.y));
    dist(d + ' PIES');
  }
  if (Y.Aw && Y.K === 'a' && !Y.hd && !Y.G && G.st === 'y' && Y.t > .5) {
    const full = '¡SE VA, SE VA, SE VA...', n = max(1, floor(full.length * seg(Y.t, .5, 2.6)));
    box(100, 112, 600, 52, TC[bt]); T(full.slice(0, n), 400 - tw(full, 2.6) / 2, 138, 2.6, CH, 0);
  }
  gradaHud(206);
  if (G.st === 'y' && G.J.some(h => h) && Y.t > 1) T('MANTÉN 3: ACELERAR', 16, 584, 1.3, DIM, 0);
  if (G.st === 'y' && G.J[ft] && G.B < 3 && (Y.K === 'h' || (Y.K === 'a' && Y.G && !Y.hr))) {
    const b = dirBase(...axis(ft));
    box(14, 452, 210, 116, TC[ft]);
    T('LANZA A', 28, 472, 1.5, TS[ft], 0);
    for (const [k, x, y] of [[1, 186, 512], [2, 154, 482], [3, 122, 512], [0, 154, 542]]) pl(k === b ? TC[ft] : 0xffffff, k === b ? 1 : .25, x, y - 11, x + 11, y, x, y + 11, x - 11, y);
    T(b < 0 ? 'JOYSTICK' : b ? BN[b] : 'HOME', 28, 506, 1.2, CH, 0); T(b < 0 ? '+ BOTÓN 1' : '1: ¡TIRA!', 28, 534, 1.2, b < 0 ? DIM : TS[ft], 0);
  }
  fbHud();
}
// ---------- title / attract ----------
function title(dt) {
  scr('fld', .5, dt);
  const t = clock;
  for (const [o, c] of [[10, US[1]], [0, US[0]]]) T('¡SE FUE!', 400 + o, 120 + o + sin(t * 2) * 4, 3, c, .5, 1, 3 - o / 99, 36);
  TD('BÉISBOL ARCADE · CARACAS', 400, 190, 2, CH);
  const m = any('P1_D', 'P2_D') - any('P1_U', 'P2_U');
  if (m) { G.Ad = (G.Ad + m + 3) % 3; sfx.mv(); }
  g = gh;
  ['PARTIDO · 4 INNINGS', 'DERBY · 60 SEGUNDOS', 'CHAPITA · 60 SEGUNDOS'].forEach((s, i) => {
    const on = G.Ad === i, y = 230 + i * 38;
    if (on) rr(230, y - 16, 340, 32, 8, 0xe1ff00, .95);
    else { LS(2, 0xffffff, .3); g.strokeRoundedRect(230, y - 16, 340, 32, 8); }
    T(s, 400, y, 2, on ? '#110' : CH);
  });
  const dby = G.Ad > 0, LB = LBS[G.Ad - 1];
  if (t % 1 < .7) {
    TD(dby ? 'START 1 · JUEGA P1' : 'START 1 · UN JUGADOR VS CPU', 400, 390, 2, US[0]);
    TD(dby ? 'START 2 · JUEGA P2' : 'START 2 · DOS JUGADORES', 400, 416, 2, US[1]);
  }
  if (dby) {
    box(40, 440, 720, 112, 0xffffff);
    T('RÉCORDS DEL ' + (G.Ad > 1 ? 'BARRIO' : 'DERBY'), 400, 458, 1.6, US[0]);
    if (!LB.length) T('¡SÉ EL PRIMERO EN JUGAR!', 400, 500, 1.4, CH);
    LB.forEach((e, i) => { const x = 70 + (i % 3) * 230, y = 486 + (i / 3 | 0) * 30; T((i + 1) + '. ' + e.n + '  ' + e.h + (G.Ad > 1 ? ' TECHO · ' : ' HR · ') + e.d, x, y, 1.4, i ? CH : US[0], 0); });
  }
  const go = p => { sfx.sel(); const m = G.Ad; G = m > 1 ? { st: 'q', Ad: m, pl: p, c: 0, it: 0 } : m ? { st: 'u', Ad: m, pl: p, ci: 0, nm: (CU.n + '      ').slice(0, 6).split(''), it: 0 } : { st: 'k', Ad: m, np: p + 1, c: [0, 1], ok: [0, 0], it: 0 }; };
  if (go1(0)) go(0);
  else if (go1(1)) go(1);
}
function overScreen(dt) {
  scr('fld', .55, dt);
  const w = G.Cd, human = G.J[w];
  T((human ? '¡' : '') + 'GANAN ' + TL[w] + ' ' + TN[w] + (human ? '!' : ''), 400, 104, 1.5, TS[w], .5, 1, 3, 28);
  TB(G.E[0] + ' - ' + G.E[1], 400, 176, 1.8, CH); g = gh; emblem(TI[0], 280, 176, .9); emblem(TI[1], 520, 176, .9);
  g = gh;
  const n = max(G.N, G.X), cw = min(40, 420 / n), x0 = 400 - (96 + n * cw + 3 * 44) / 2;
  box(x0 - 14, 226, 96 + n * cw + 132 + 28, 116, 0xffffff);
  for (let i = 0; i < n; i++) T(i + 1, x0 + 96 + i * cw + cw / 2, 250, 1.6, DIM);
  ['C', 'H', 'E'].forEach((s, i) => T(s, x0 + 96 + n * cw + 22 + i * 44, 250, 1.8, US[0]));
  for (let tm = 0; tm < 2; tm++) {
    const y = 286 + tm * 36;
    emblem(TI[tm], x0 + 14, y, .45); T(TA[tm], x0 + 34, y, 1.6, TS[tm], 0);
    for (let i = 0; i < n; i++) { const v = G.g[tm][i]; T(v === undefined ? (tm && i === n - 1 ? 'X' : '-') : v, x0 + 96 + i * cw + cw / 2, y, 1.8, CH); }
    [G.E[tm], G.Aa[tm], 0].forEach((v, i) => T(v, x0 + 96 + n * cw + 22 + i * 44, y, 2, CH));
  }
  if (G.it > 2 && clock % 1 < .7) TD('PRESIONA START', 400, 470, 2.4, CH);
  if ((G.it > 2 && (go1(0) || go1(1))) || G.it > 60) toTitle();
}

// ---------- derby end + initials ----------
function lbAdd(n) { const k = G.I ? 1 : 0, e = { n, h: G.e, d: G.S }; LBS[k] = lbSort([...LBS[k], e]); G.me = e; G.Ah = 1; G.it = 0; saveLB(k); }
function toDerbyEnd() {
  const L = LBS[G.I ? 1 : 0];
  G.st = 'd'; G.it = 0; MSG = BAN = null; amb(0);
  G.q = G.e > 0 && (L.length < 5 || G.e > L[4].h || (G.e === L[4].h && G.S > L[4].d));
  G.Ao = [0, 0, 0]; G.ip = 0; G.Ah = 0;
  if (G.q && !G.I) lbAdd(CU.n);
  party(min(8, G.e + 2), TC[G.A]); if (G.e) sfx.cheer(2);
}
function derbyEnd(dt) {
  const pl = G.A, ch = G.I, L = LBS[ch ? 1 : 0];
  scr(ch ? 'chp' : 'fld', .6, dt);
  TB(ch ? 'FIN DE LA CHAPITA' : 'FIN DEL DERBY', 400, 86, 2, TS[pl]);
  TB(G.e + (ch ? " ¡PA'L TECHO!" : G.e === 1 ? ' JONRÓN' : ' JONRONES'), 400, 150, 1.8, CH);
  T('MÁS ' + (ch ? 'LEJOS: ' : 'LARGO: ') + (G.S ? G.S + (ch ? ' M' : ' PIES') : '-'), 400, 196, 2, DIM);
  g = gh;
  if (G.q && !G.Ah) {
    TD('¡NUEVO RÉCORD! TUS INICIALES', 400, 260, 1.8, TS[pl]);
    if (pr(pl, 'U') || pr(pl, 'D')) { G.Ao[G.ip] = (G.Ao[G.ip] + (pr(pl, 'U') ? 25 : 1)) % 26; sfx.mv(); }
    if (pr(pl, 'L') || pr(pl, 'R')) { G.ip = clamp(G.ip + (pr(pl, 'R') ? 1 : -1), 0, 2); sfx.mv(); }
    for (let i = 0; i < 3; i++) {
      const x = 340 + i * 60, on = i === G.ip;
      rr(x - 24, 290, 48, 60, 8, on ? TC[pl] : 0x04050c, on ? 1 : .86);
      T(String.fromCharCode(65 + G.Ao[i]), x, 320, 2.2, on ? '#110' : CH, .5, 1, 3, 24);
    }
    T(JS + 'LETRA · 1: SIGUIENTE', 400, 378, 1.4, DIM);
    if (pr(pl, '1') || pr(pl, '2')) { sfx.sel(); if (G.ip < 2) G.ip++; else lbAdd(G.Ao.map(c => String.fromCharCode(65 + c)).join('')); }
    return;
  }
  box(200, 250, 400, 190, 0xffffff);
  T('RÉCORDS DEL ' + (ch ? 'BARRIO' : 'DERBY'), 400, 272, 1.6, US[0]);
  L.forEach((e, i) => T((i + 1) + '.  ' + e.n + '   ' + e.h + (ch ? ' TECHO   ' + e.d + ' M' : ' HR   ' + e.d + ' PIES'), 226, 304 + i * 28, 1.5, e === G.me ? TS[pl] : CH, 0));
  if (!L.length) T('SIN RÉCORDS · ¡OTRA VEZ!', 400, 340, 1.6, CH);
  if (G.it > 1.5 && clock % 1 < .7) TD('PRESIONA START', 400, 490, 2.2, CH);
  if ((G.it > 1.5 && (go1(0) || go1(1))) || G.it > 30) toTitle();
}

// ---------- team pick ----------
function emblem(i, x, y, s) {
  const t = TEAM[i];
  g.save(); g.translateCanvas(x, y); g.scaleCanvas(s, s);
  el(0, 0, 31, 31, 0x111111); el(0, 0, 28, 28, t[5]); el(0, 0, 25, 25, t[6]);
  if (i === 0) {
    const m = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU, r = k % 2 ? 17 : 24; m.push(cos(a) * r, 1 + sin(a) * r); }
    pl(0xb37a00, 1, ...m); el(0, 1, 13, 13, 0xf2b81c); rc(-7, -4, 4, 4, 0x111111); rc(3, -4, 4, 4, 0x111111); pl(0x5a3410, 1, -3, 3, 3, 3, 0, 7); rc(-5, 9, 10, 3, 0xfff3bf);
  } else if (i === 1) {
    for (const [a, b] of [[0, 23], [23, 0], [16, 16], [16, -16]]) ln(-a, -b, a, b, 3, 0xc9a227);
    LS(4, 0xc9a227); g.strokeCircle(0, 0, 17); el(0, -1, 10, 10, 0xf6ffd6); rc(-5, 6, 10, 5, 0xf6ffd6); rc(-10, -10, 20, 5, 0xd62828); rc(-5, -3, 4, 4, 0x111111); rc(1, -3, 4, 4, 0x111111);
  } else if (i === 2) {
    rc(-24, 12, 48, 10, 0x1c7ed6); pl(0xced4da, 1, -18, 8, -6, -10, 12, -16, 18, -12, 8, -2, -10, 10); pl(0x4dabf7, 1, -6, -10, 12, -16, 18, -12, -2, -6); pl(0xd1202f, 1, -18, 8, -24, 14, -26, 4); rc(10, -14, 3, 3, 0x111111);
  } else {
    pl(0xe03131, 1, -12, 20, -14, 0, -8, -12, -2, -22, 2, -14, 8, -18, 8, -10, 14, -4, 12, 8, 4, 20); pl(0x111111, 1, 2, -6, 14, -4, 12, 4, 0, 2); pl(0xffa94d, 1, 12, -4, 24, 0, 12, 4); rc(5, -4, 3, 3, 0xf6ffd6);
  }
  g.restore();
}
function pickScreen(dt) {
  scr('fld', .65, dt);
  TB('ELIGE TU EQUIPO', 400, 40, 1.5, US[0]);
  const who = G.np === 2 ? [0, 1] : [0];
  for (const p of who) if (!G.ok[p]) {
    const ax = (pr(p, 'R') | 0) - (pr(p, 'L') | 0);
    if (ax) { G.c[p] = (G.c[p] + ax + 4) % 4; sfx.mv(); }
    if (go1(p) && !(G.ok[1 - p] && G.c[1 - p] === G.c[p])) { G.ok[p] = 1; sfx.sel(); }
  }
  g = gh;
  TEAM.forEach((t, i) => {
    const x = 110 + i * 193, y = 290, on = who.some(p => G.c[p] === i);
    box(x - 88, y - 96, 176, 184, on ? t[3] : 0x444444);
    emblem(i, x, y - 18, 1.6);
    T(t[0], x, y + 66, 1.5, t[4], .5, on ? 1 : .6);
    who.forEach(p => { if (G.c[p] === i) { LS(4, UC[p], 1); g.strokeRoundedRect(x - 92 + p * 4, y - 100 + p * 4, 184 - p * 8, 192 - p * 8, 10); T('P' + (p + 1) + (G.ok[p] ? ' OK' : ''), x + (p ? 80 : -80), y - 82, 1.4, US[p], p); } });
  });
  TD(JS + 'ELIGE  ·  1: CONFIRMA', 400, 576, 1.5, CH);
  if (who.every(p => G.ok[p])) {
    const a = G.c[who[0]];
    setTeams(a, G.np === 2 ? G.c[1] : other(a)); newGame(G.np);
  } else if (G.it > 40) toTitle();
}

// ---------- O: customize your batter ----------
const ABC = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function custScreen(dt) {
  const p = G.pl, nm = G.nm, d = (pr(p, 'U') | 0) - (pr(p, 'D') | 0);
  scr('pit', .5, dt);
  if (d) { sfx.mv(); nm[G.ci] = ABC[(ABC.indexOf(nm[G.ci]) + d + 27) % 27]; }
  if (pr(p, 'R') || pr(p, 'L')) { G.ci = (G.ci + (pr(p, 'R') ? 1 : 5)) % 6; sfx.mv(); }
  CU.n = nm.join('').trim() || 'P' + (p + 1);
  batter(-1, look(p));
  g = gh;
  TB('¿QUIÉN BATEA?', 400, 36, 1.3, US[p]);
  box(420, 230, 300, 90, UC[p]); T('TU NOMBRE', 436, 250, 1.2, US[p], 0);
  nm.forEach((c, j) => { const h = j === G.ci; rr(436 + j * 46, 266, 40, 40, 4, h ? UC[p] : 0x1b1d2e); T(c === ' ' ? '_' : c, 456 + j * 46, 286, 1.8, h ? '#110' : CH); });
  TD(JS + 'LETRA · 1: ¡A JUGAR!', 400, 580, 1.1, CH);
  if (go1(p)) { sfx.sel(); newDerby(p); }
  else if (G.it > 60) toTitle();
}

// ---------- chapita: pick your kid ----------
function cpick(dt) {
  const p = G.pl;
  scr('chp', .45, dt);
  if (pr(p, 'L') || pr(p, 'R')) { G.c = (G.c + (pr(p, 'R') ? 1 : 3)) % 4; sfx.mv(); }
  TB('¿QUIÉN BATEA?', 400, 30, 1.8, '#fd1');
  CHR.forEach((c, i) => {
    const x = 100 + i * 200, on = i === G.c;
    g = gh; box(x - 92, 62, 184, 476, on ? UC[p] : 0x444444);
    batter(-1, lkOf(c), x, 446, 2.5); g = gh;
    T(c[0], x, 464, 1.6, on ? US[p] : CH);
    ['PODER', 'PUNTERÍA'].forEach((s, j) => { T(s, x - 86, 492 + j * 22, 1, DIM, 0); for (let k = 0; k < 4; k++) rc(x + 36 + k * 13, 487 + j * 22, 10, 10, k < c[8 + j] ? UC[p] : 0x3a3d2a); });
  });
  TD(JS + 'ELIGE · 1: ¡A BATEAR!', 400, 572, 1.5, CH);
  if (go1(p)) { sfx.sel(); newChap(p, CHR[G.c]); }
  else if (G.it > 40) toTitle();
}
function newChap(p, c) {
  mkG({ O: 1, I: 1, ck: c, lk: lkOf(c), Ad: 2, A: p, J: p ? [0, 1] : [1, 0] });
  setTeams(0, 1); TC[p] = 0xffd60a; TS[p] = '#fd1'; TC[1 - p] = 0xff922b;
  BAN = { a: 'CHAPITA', b: "60 SEGUNDOS · ¡MÁNDALA PA'L TECHO!", Al: '#fd1', t: 2.2 };
  newPitch(2.2);
}
function capG(x, y, r) { const f = .3 + .7 * abs(sin(clock * 22)); el(x, y, r + 1, r * f + 1, 0x5a0f0f, .6); el(x, y, r, r * f, 0xe03131); el(x, y, r * .6, r * .6 * f, 0xff8787); }
function chapHit(ev, la, sp) {
  const v = ev * .17 * (.82 + G.ck[8] * .06), c = cos(la);
  Object.assign(P, { ph: 'c', t: -.06, cf: { d: 0, x: 0, h: 1, vd: v * c * cos(sp), vx: v * c * sin(sp), vh: v * sin(la), r: 0 } });
}
function stepChap(dt) {
  const f = P.cf;
  if (P.t < 0) return;
  if (f.r) { if (P.t > 1.1) newPitch(.15); return; }
  const k = 1 - .3 * dt;
  f.vh -= 9.8 * dt; f.vd *= k; f.vx = f.vx * k + sin(P.t * 9) * 5 * dt;
  f.d += f.vd * dt; f.x += f.vx * dt; f.h += f.vh * dt;
  if (abs(f.x) > 7) { if (f.h > 7) f.r = 1; else { f.r = 3; f.x = sign(f.x) * 7; } }
  else if (f.d > 58 && f.h > 3) f.r = 2;
  else if (f.h <= 0) { f.h = 0; f.r = 4; }
  if (!f.r) return;
  P.t = 0;
  const m = round(f.d);
  G.S = max(G.S, m);
  tone(2400, .06, 'triangle', .12);
  if (f.r < 3) { G.e++; say(f.r < 2 ? "¡PA'L TECHO!" : "¡PA'L CERRO!", m + ' METROS', '#fd1', 1.3); grada('¡DALE, CHAMO!', '#fd1', 2); sfx.cheer(1.5); applause(2, 1); }
  else say(f.r < 4 ? 'PEGÓ EN LA PARED' : m + ' METROS', '', CH, 1);
}
// barrio at golden hour: hazy hill of ranchos, facades lit from the left (right side in shade), window bars,
// rolling shutters, water tanks and rebar, concrete poles with tangled cables, bunting, beer crates, film grain
function chapBG(b) {
  const R = rng(9), F = (...q) => FR(b, ...q), Q = (c, ...t) => p2(b, t, c),
    L = (c, w, ...t) => { b.strokeStyle = c; b.lineWidth = w; b.beginPath(); t.forEach((p, i) => b[i % 2 ? 'lineTo' : 'moveTo'](...p)); b.stroke(); },
    HC = ['#e87', '#7bd', '#eb5', '#8c7', '#b54', '#eec', '#e85', '#c9c'], pk = () => HC[R() * 8 | 0],
    top = x => 226 - 92 * sin(x / W * PI) + 5 * sin(x / 23), hp = [[0, 340]];
  F(0, 0, W, H, lg(b, 0, 320, '#48d', '#fda'));
  b.filter = 'blur(6px)';
  for (const [x, y, s] of [[110, 56, 1], [540, 84, 1.4], [690, 34, .8]]) for (let k = 0; k < 4; k++) e2(b, x + k * 24 * s, y - k % 2 * 10 * s, 30 * s, 12 * s, '#fffc');
  b.filter = 'none';
  for (let x = 0; x <= W; x += 8) hp.push([x, top(x)]);
  hp.push([W, 340]); p2(b, hp, '#795');
  for (let y = 128; y < 330; y += 9) for (let x = R() * 9; x < W; x += 11 + R() * 9) if (y > top(x) + 4) {
    const w = 10 + R() * 8, h = 8 + R() * 5;
    if (R() < .1) { e2(b, x, y + 4, 8, 6, '#573'); continue; }
    F(x, y, w, h, R() < .55 ? ['#a53', '#b64', '#942'][R() * 3 | 0] : pk()); F(x - 1, y - 2, w + 2, 2, '#aaa'); F(x + w * .3, y + h * .35, 3, 3, '#322');
  }
  F(0, 90, W, 250, lg(b, 90, 340, '#fda9', '#fda3'));
  Q(lg(b, 296, 600, '#999', '#554'), [0, 600], [376, 296], [424, 296], [800, 600]);
  Q('#1234', [800, 600], [424, 296], [412, 296], [610, 600]);
  e2(b, 470, 440, 24, 6, '#443'); e2(b, 470, 440, 17, 4, '#555');
  for (const s of [1, -1]) Q(lg(b, 296, 600, '#ccb', '#988'), [400 - 400 * s, 600], [400 - 24 * s, 296], [400 - 32 * s, 296], [400 - 400 * s, 560]);
  L('#766', 3, [0, 600], [376, 296], [800, 600], [424, 296]);
  for (const sd of [0, 1]) for (let k = 0, u = 0; k < 4; k++) {
    const v = min(.92, u + .2 + R() * .1), o = R() * 60, c = R() < .3 ? HC[4] : pk(), z = 1 - (u + v) * .35, X = w => sd ? W - 370 * w : 370 * w, P = (a, h) => { const w = lerp(u, v, a); return [X(w), lerp(lerp(20, 252, w) + o * (1 - w), lerp(600, 300, w), h)]; }, A = (a, c2, d, e, col) => Q(col, P(a, d), P(c2, d), P(c2, e), P(a, e));
    A(0, 1, 0, 1, c);
    b.save(); path2(b, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)]); b.clip();
    if (c == HC[4]) for (let y = 0; y < H; y += 7) F(0, y, W, 1.5, '#4216');
    F(0, 0, W, H, lg(b, 0, H, '#0000', '#3215'));
    if (sd) F(0, 0, W, H, '#2253');
    b.restore();
    for (const [a, d] of [[.12, .14], [.58, .14], [.12, .54]]) {
      A(a - .03, a + .3, d - .03, d + .21, '#edc'); A(a, a + .27, d, d + .18, '#334');
      for (let i = 1; i < 5; i++) L('#111', 1.5, P(a + i * .054, d), P(a + i * .054, d + .18));
    }
    A(0, 1, .44, .47, '#ccb');
    if (R() < .5) { A(.5, .94, .56, 1, '#899'); for (let h = .6; h < 1; h += .05) L('#677', 1.5, P(.5, h), P(.94, h)); }
    else A(.6, .84, .56, 1, '#532');
    L('#dcc', 6, P(0, 0), P(1, 0));
    const [tx, ty] = P(.4, 0);
    F(tx - 11 * z, ty - 20 * z, 22 * z, 20 * z, '#333'); e2(b, tx, ty - 20 * z, 11 * z, 3.5 * z, '#556');
    for (let i = 0; i < 3; i++) F(tx + (18 + i * 5) * z, ty - 9 * z, 1.5, 9 * z, '#754');
    u = v;
  }
  for (const x of [164, 630]) { F(x, 110, 7, 410, '#888'); F(x + 4, 110, 3, 410, '#666'); F(x - 14, 122, 35, 4, '#555'); }
  F(636, 138, 14, 24, '#555');
  b.strokeStyle = '#222'; b.lineWidth = 2;
  for (let k = 0; k < 10; k++) {
    const s = k % 2, x = s ? 634 : 168; b.beginPath();
    if (k < 4) { b.moveTo(168, 136 + k * 12); b.quadraticCurveTo(400, 224 + k * 18, 632, 136 + k * 12); }
    else { b.moveTo(x, 124 + k * 3); b.quadraticCurveTo(s ? 720 : 80, 150 + k * 12, s ? W : 0, k * 24 - 40); }
    b.stroke();
  }
  for (let k = 0; k < 19; k++) { const t = (k + .5) / 19, x = 168 + 464 * t, y = 136 + 176 * t * (1 - t); Q(['#e44', '#eb3', '#4a5', '#37d', '#e59', '#e82'][k % 6], [x - 10, y], [x + 10, y], [x, y + 18]); }
  e2(b, 652, 572, 120, 16, '#0005');
  for (const [x, y, w, bl] of [[584, 496, 88, 1], [596, 460, 88, 0], [580, 532, 96, 0], [684, 524, 80, 1]]) {
    const c = bl ? ['#26c', '#48e', '#138'] : ['#eb1', '#fd5', '#a70'];
    for (let k = 0; k < w / 14 - 1; k++) { F(x + 8 + k * 14, y - 12, 7, 14, bl ? '#421' : '#363'); F(x + 8 + k * 14, y - 14, 7, 3, '#ccc'); }
    F(x, y, w, 36, c[0]); F(x, y, w, 5, c[1]); F(x, y + 31, w, 5, c[2]); F(x + 14, y + 15, 18, 9, c[2]); F(x + w - 32, y + 15, 18, 9, c[2]); F(x + 3, y + 7, 3, 22, '#fff4');
  }
  e2(b, 400, 566, 60, 10, '#0004');
  Q('#975', [356, 544], [444, 544], [456, 580], [344, 580]);
  e2(b, 300, 572, 6, 2.4, '#d33'); e2(b, 472, 592, 6, 2.4, '#d33'); e2(b, 524, 566, 6, 2.4, '#fc3');
  vig(b, .35);
}
})();
