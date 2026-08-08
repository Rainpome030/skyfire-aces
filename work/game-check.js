
'use strict';

// ---------- canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- utils ----------
const TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- input ----------
const input = {
  keys: {},
  mouse: { x: 0, y: 0, down: false, rdown: false, mid: false, movedAt: -99 },
  touch: { active: false, steerId: null, fireId: null, mslId: null, rollId: null, lastX: 0, lastY: 0 },
  fireHeld: false,
  mslHeld: false,
  isTouch: false
};

const DEFAULT_BINDS = {
  throttleUp: 'KeyW',
  throttleDown: 'KeyS',
  turnLeft: 'ArrowLeft',
  turnRight: 'ArrowRight',
  rollLeft: 'KeyA',
  rollRight: 'KeyD',
  dash: 'KeyE',
  afterburn: 'ShiftLeft',
  gun: 'mouse0',
  missile: 'mouse2',
  pause: 'KeyP',
  mute: 'KeyM',
  confirm: 'Enter',
  menu: 'Escape'
};

let keybinds = loadKeybinds();
let captureBind = null;

function loadKeybinds() {
  const base = Object.assign({}, DEFAULT_BINDS);
  try {
    const raw = localStorage.getItem('skyfire_keybinds');
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch (err) { /* storage unavailable */ }
  return base;
}

function saveKeybinds() {
  try { localStorage.setItem('skyfire_keybinds', JSON.stringify(keybinds)); } catch (err) { /* storage unavailable */ }
}

function bindFor(action) {
  return keybinds[action] || DEFAULT_BINDS[action];
}

function codeFromEvent(e) {
  return e.code || (e.key ? e.key.toUpperCase() : '');
}

function prettyKey(code) {
  if (code === 'mouse0') return '左键';
  if (code === 'mouse1') return '中键';
  if (code === 'mouse2') return '右键';
  if (!code) return '未设置';
  const map = {
    KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyP: 'P', KeyM: 'M',
    Enter: 'Enter', Escape: 'Esc', Space: '空格', ShiftLeft: 'Shift', ShiftRight: '右Shift',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
  };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

function isActionDown(action) {
  const code = bindFor(action);
  if (code === 'mouse0') return input.mouse.down;
  if (code === 'mouse1') return input.mouse.mid;
  if (code === 'mouse2') return input.mouse.rdown;
  return !!input.keys[code];
}

function isBound(code, action) {
  return bindFor(action) === code;
}

const FIRE_RECT = { x: 0, y: 0, w: 0, h: 0 };
const MSL_RECT = { x: 0, y: 0, w: 0, h: 0 };
const ROLL_RECT = { x: 0, y: 0, w: 0, h: 0 };

function updateTouchRects() {
  const s = Math.min(W, H);
  FIRE_RECT.w = Math.max(90, s * 0.24);
  FIRE_RECT.h = Math.max(70, s * 0.18);
  FIRE_RECT.x = 14;
  FIRE_RECT.y = H - FIRE_RECT.h - 14;
  MSL_RECT.w = Math.max(90, s * 0.24);
  MSL_RECT.h = Math.max(70, s * 0.18);
  MSL_RECT.x = W - MSL_RECT.w - 14;
  MSL_RECT.y = H - MSL_RECT.h - 14;
  ROLL_RECT.w = Math.max(80, s * 0.2);
  ROLL_RECT.h = Math.max(60, s * 0.15);
  ROLL_RECT.x = W / 2 - ROLL_RECT.w / 2;
  ROLL_RECT.y = H - ROLL_RECT.h - 14;
}
updateTouchRects();

function screenPosFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('mousemove', (e) => {
  const p = screenPosFromEvent(e);
  input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.movedAt = performance.now() / 1000;
  input.isTouch = false;
});
canvas.addEventListener('mousedown', (e) => {
  AudioSys.init(); AudioSys.resume();
  const p = screenPosFromEvent(e);
  input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.movedAt = performance.now() / 1000;
  if (captureBind && GAME.state === 'settings') {
    if (settingsRowAt(p.x, p.y)) {
      startBindCapture(settingsRowAt(p.x, p.y).action);
      return;
    }
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      completeBindCapture('mouse' + e.button);
      return;
    }
  }
  const consumed = handleCanvasPress(p.x, p.y);
  if (!consumed) {
    if (e.button === 0) input.mouse.down = true;
    if (e.button === 1) input.mouse.mid = true;
    if (e.button === 2) input.mouse.rdown = true;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouse.down = false;
  if (e.button === 1) input.mouse.mid = false;
  if (e.button === 2) input.mouse.rdown = false;
  input.fireHeld = false; input.mslHeld = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  AudioSys.init(); AudioSys.resume();
  input.isTouch = true;
  const rect = canvas.getBoundingClientRect();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const x = t.clientX - rect.left, y = t.clientY - rect.top;
    if (!input.touch.steerId && !inRect(x, y, FIRE_RECT) && !inRect(x, y, MSL_RECT) && !inRect(x, y, ROLL_RECT)) {
      input.touch.steerId = t.identifier;
      input.touch.lastX = x; input.touch.lastY = y;
      input.mouse.x = x; input.mouse.y = y; input.mouse.movedAt = performance.now() / 1000;
      handleCanvasPress(x, y);
    } else if (!input.touch.fireId && inRect(x, y, FIRE_RECT)) {
      input.touch.fireId = t.identifier;
      input.fireHeld = true;
    } else if (!input.touch.mslId && inRect(x, y, MSL_RECT)) {
      input.touch.mslId = t.identifier;
      input.mslHeld = true;
    } else if (!input.touch.rollId && inRect(x, y, ROLL_RECT)) {
      input.touch.rollId = t.identifier;
      tryBarrelRoll('right');
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === input.touch.steerId) {
      const x = t.clientX - rect.left, y = t.clientY - rect.top;
      input.touch.lastX = x; input.touch.lastY = y;
      input.mouse.x = x; input.mouse.y = y; input.mouse.movedAt = performance.now() / 1000;
    }
  }
}, { passive: false });

function endTouch(e) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const id = e.changedTouches[i].identifier;
    if (id === input.touch.steerId) { input.touch.steerId = null; }
    if (id === input.touch.fireId) { input.touch.fireId = null; input.fireHeld = false; }
    if (id === input.touch.mslId) { input.touch.mslId = null; input.mslHeld = false; }
    if (id === input.touch.rollId) { input.touch.rollId = null; }
  }
}
canvas.addEventListener('touchend', endTouch, { passive: false });
canvas.addEventListener('touchcancel', endTouch, { passive: false });

function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

window.addEventListener('keydown', (e) => {
  AudioSys.init(); AudioSys.resume();
  const code = codeFromEvent(e);
  if (captureBind && GAME.state === 'settings') {
    e.preventDefault();
    if (code === 'Escape') {
      captureBind = null;
      return;
    }
    completeBindCapture(code);
    return;
  }
  input.keys[code] = true;
  input.keys[e.key.toLowerCase()] = true;
  if (code === 'Space') e.preventDefault();
  if (isBound(code, 'mute') && !e.repeat) AudioSys.toggleMute();
  const pauseHit = isBound(code, 'pause') || isBound(code, 'menu');
  if (pauseHit && !e.repeat) {
    if (GAME.state === 'playing') setState('paused');
    else if (GAME.state === 'paused') setState('playing');
  }
  if (isBound(code, 'confirm') && !e.repeat) handleConfirmKey();
  if (!e.repeat && GAME.state === 'playing') {
    if (isBound(code, 'rollLeft')) tryBarrelRoll('left');
    if (isBound(code, 'rollRight')) tryBarrelRoll('right');
  }
});
window.addEventListener('keyup', (e) => {
  const code = codeFromEvent(e);
  input.keys[code] = false;
  input.keys[e.key.toLowerCase()] = false;
});
window.addEventListener('blur', () => { if (GAME.state === 'playing') setState('paused'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && GAME.state === 'playing') setState('paused');
});

// ---------- audio ----------
const AudioSys = {
  ctx: null, master: null, enabled: true, musicOn: true,
  engineOsc: null, engineGain: null, engineFilter: null,
  nextBeat: 0, beat: 0, musicTimer: null,
  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
    } catch (err) { /* audio unavailable */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggleMute() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.6 : 0;
    return this.enabled;
  },
  tone(freq, dur, type, vol, slide, when) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, q, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 1200;
    f.Q.value = q || 1;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  gun() { this.noise(0.07, 0.10, 2300, 0.8, 700); },
  missileLaunch() { this.noise(0.5, 0.18, 900, 0.7, 2600); this.tone(220, 0.35, 'sawtooth', 0.05, 420); },
  explosion(big) {
    this.noise(big ? 1.1 : 0.55, big ? 0.5 : 0.32, big ? 260 : 420, 0.6, 60);
    this.tone(big ? 70 : 110, big ? 0.8 : 0.4, 'sine', big ? 0.5 : 0.3, -45);
  },
  hit() { this.tone(900, 0.06, 'square', 0.08, -300); },
  lockBeep() { this.tone(1250, 0.07, 'square', 0.07); },
  warning() { this.tone(980, 0.16, 'sawtooth', 0.10, 120); this.tone(740, 0.16, 'sawtooth', 0.08, -80, 0.14); },
  pickup() { this.tone(660, 0.12, 'sine', 0.16, 0); this.tone(990, 0.18, 'sine', 0.14, 0, 0.08); },
  click() { this.tone(520, 0.06, 'square', 0.06, 60); },
  score() { this.tone(880, 0.08, 'sine', 0.10); this.tone(1320, 0.12, 'sine', 0.09, 0, 0.06); },
  warningLaunch() { this.warning(); },
  roll() {
    if (!this.ctx || !this.enabled) return;
    this.noise(0.55, 0.10, 420, 0.6, 2100);
    this.tone(240, 0.5, 'sine', 0.05, 260);
  },
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 70;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  },
  updateEngine(ratio) {
    if (!this.ctx || !this.engineOsc || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 90, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + ratio * 600, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.018 + ratio * 0.035, t, 0.1);
  },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.beat = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 250);
  },
  scheduleMusic() {
    if (!this.ctx || !this.enabled || !this.musicOn) return;
    const bass = [110, 87.31, 130.81, 98];
    const arp = [220, 261.63, 329.63, 440, 329.63, 261.63];
    while (this.nextBeat < this.ctx.currentTime + 0.6) {
      const bar = Math.floor(this.beat / 4) % 4;
      const step = this.beat % 4;
      const when = this.nextBeat - this.ctx.currentTime;
      if (step === 0) this.tone(bass[bar], 0.9, 'sine', 0.05, 0, when);
      const n = arp[(bar * 2 + step) % arp.length];
      if (step % 2 === 0) this.tone(n * (step === 0 ? 0.5 : 1), 0.34, 'triangle', 0.028, 0, when);
      if (step === 3) this.tone(n * 2, 0.3, 'sine', 0.022, 0, when);
      this.nextBeat += 0.34;
      this.beat++;
    }
  }
};

// ---------- game state ----------
const CFG = {
  turnRate: 2.7,
  minSpeed: 95,
  maxSpeed: 370,
  abSpeed: 110,
  accel: 190,
  gunDamage: 7,
  gunRate: 0.075,
  gunSpeed: 1550,
  gunSpread: 0.05,
  missileSpeed: 760,
  missileTurn: 3.1,
  missileLife: 3.4,
  missileBlast: 105,
  missileDamage: 65,
  lockRange: 1000,
  lockCone: 0.75,
  lockTime: 0.85
};

const GAME = {
  state: 'title',
  mode: 'campaign',
  missionIndex: 0,
  time: 0,
  score: 0,
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageTaken: 0,
  missionTime: 0,
  endStats: null,
  pendingState: null,
  pendingTimer: 0,
  freezeTimer: 0,
  hintTimer: 12,
  exp: 0,
  level: 1,
  combo: 0,
  comboTimer: 0,
  comboMax: 5,
  upgrades: {},
  weapons: [],
  dash: null,
  pickupsTaken: 0
};

const player = {
  kind: 'player',
  x: 0, y: 0, heading: 0, speed: 0, bank: 0,
  r: 16,
  hp: 100, maxHp: 100,
  missiles: 40, maxMissiles: 48,
  throttle: 0.68, target: null, lock: 0,
  fireCd: 0, missileCd: 0, invuln: 0, alive: true, dead: false,
  gunSide: 1, hitFlash: 0, afterburn: false,
  rollT: 0, rollDur: 0.85, rollDir: 0, rollActive: false, rollCd: 0,
  lastDirTap: { dir: null, t: -99 }
};

let bullets = [];
let missiles = [];
let particles = [];
let pickups = [];
let enemies = [];
let allies = [];
let cam = { x: 0, y: 0, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
let world = { W: 7200, H: 5600, clouds: [], islands: [], seed: 1, theme: null };
let mission = null;
let transition = { active: false, alpha: 0, dir: 0, cb: null };
let menuButtons = [];
let lastTime = performance.now();
let gameTime = 0;
let upgradeChoice = null;
let settingsReturn = 'title';

const SETTINGS_ACTIONS = [
  { action: 'throttleUp', label: '油门加速' },
  { action: 'throttleDown', label: '油门减速' },
  { action: 'turnLeft', label: '左转' },
  { action: 'turnRight', label: '右转' },
  { action: 'rollLeft', label: '滚筒左' },
  { action: 'rollRight', label: '滚筒右' },
  { action: 'dash', label: '急速突进' },
  { action: 'afterburn', label: '加力' },
  { action: 'gun', label: '机炮' },
  { action: 'missile', label: '导弹' },
  { action: 'pause', label: '暂停' },
  { action: 'mute', label: '静音' },
  { action: 'confirm', label: '确认 / 开始' },
  { action: 'menu', label: '菜单 / 取消' }
];

const QUALITY_MULT = { common: 0.8, good: 1, rare: 1.3 };
const QUALITY_NAME = { common: '普通', good: '良好', rare: '稀有' };
const QUALITY_COLOR = { common: '#dfe9f2', good: '#54c7ff', rare: '#ffd166' };
const QUALITY_ORDER = ['common', 'good', 'rare'];

const DROP_WEAPONS = {
  scatter: {
    name: '散射机炮', limited: false, per: 2, cd: 0.135, dmg: 8, speed: 1320,
    spread: 0.09, life: 0.72, size: 4, barrel: 3, color: '#ff9f43', desc: '三管散射，近距离清场'
  },
  heavy: {
    name: '重型机炮', limited: false, per: 2, cd: 0.16, dmg: 16, speed: 1500,
    spread: 0.045, life: 0.8, size: 6, barrel: 2, color: '#ff5f56', desc: '高伤害重型弹头'
  },
  pierce: {
    name: '穿甲机炮', limited: false, per: 2, cd: 0.1, dmg: 11, speed: 1620,
    spread: 0.02, life: 0.9, size: 5, barrel: 2, pierce: 2, color: '#bfe3ff', desc: '弹道平直，贯穿目标'
  },
  laser: {
    name: '激光炮', limited: true, per: 26, cd: 0.09, dmg: 9, speed: 1850,
    spread: 0.012, life: 0.6, size: 4, barrel: 1, color: '#ff4dd8', desc: '高速光束，弹速极快'
  },
  rocket: {
    name: '火箭弹', limited: true, per: 10, cd: 0.42, dmg: 34, speed: 980,
    spread: 0.03, life: 1.1, size: 7, barrel: 1, blast: 68, color: '#ff8a3c', desc: '小范围爆炸伤害'
  },
  plasma: {
    name: '能量炮', limited: true, per: 8, cd: 0.72, dmg: 64, speed: 1220,
    spread: 0.01, life: 1.3, size: 9, barrel: 1, blast: 82, color: '#7ee787', desc: '慢速重型能量球'
  }
};

const DROP_MOVES = {
  dash: {
    name: '急速突进', key: 'E', cd: [5, 4, 2], dur: [0.24, 0.28, 0.34],
    speed: [1500, 1850, 2300], invuln: [0.14, 0.18, 0.24], color: '#9be3ff', desc: '向前急速突进，短暂无敌'
  }
};

const DROP_SUPPLIES = {
  repair: { name: '应急维修', amount: 30, color: '#7ee787' },
  missiles: { name: '导弹补给', amount: 8, color: '#54c7ff' },
  score: { name: '荣誉点数', amount: 500, color: '#ffd166' }
};

const THEMES = {
  day: {
    name: '昼间海域',
    skyTop: '#0d4f86', skyMid: '#2f8dc0', skyBottom: '#a9dcec',
    waterTop: '#0e5f78', waterBottom: '#083548',
    sun: '#fff3c4', sunGlow: 'rgba(255,220,140,0.35)',
    sand: '#e8cd8a', grass: '#4d9a62', rock: '#71806b', tree: '#2f6f45',
    city: null, cloud: 'rgba(255,255,255,0.5)', haze: 'rgba(255,255,255,0.06)',
    wave: 'rgba(255,255,255,0.16)'
  },
  sunset: {
    name: '黄昏海域',
    skyTop: '#24336e', skyMid: '#a84f6f', skyBottom: '#ffb36b',
    waterTop: '#3a3768', waterBottom: '#171b3c',
    sun: '#ffe1a0', sunGlow: 'rgba(255,150,80,0.4)',
    sand: '#d9b478', grass: '#4f7d52', rock: '#5b5b63', tree: '#2f5538',
    city: '#ffe9a8', cloud: 'rgba(255,190,150,0.4)', haze: 'rgba(255,120,70,0.10)',
    wave: 'rgba(255,220,170,0.14)'
  },
  storm: {
    name: '风暴空域',
    skyTop: '#26303b', skyMid: '#46515c', skyBottom: '#7d857f',
    waterTop: '#2a3b46', waterBottom: '#101a22',
    sun: '#d8d9c4', sunGlow: 'rgba(210,220,190,0.18)',
    sand: '#8d8b72', grass: '#5d6b4e', rock: '#4c514e', tree: '#38462f',
    city: null, cloud: 'rgba(180,190,190,0.34)', haze: 'rgba(150,160,150,0.10)',
    wave: 'rgba(200,215,210,0.10)'
  },
  night: {
    name: '夜航空域',
    skyTop: '#070e22', skyMid: '#101c38', skyBottom: '#26385a',
    waterTop: '#0a1a30', waterBottom: '#040a16',
    sun: '#eef3ff', sunGlow: 'rgba(160,190,255,0.20)',
    sand: '#6f6f5a', grass: '#334a36', rock: '#3b4148', tree: '#243527',
    city: '#ffd27a', cloud: 'rgba(160,190,220,0.16)', haze: 'rgba(120,150,220,0.06)',
    wave: 'rgba(180,210,255,0.08)'
  }
};

// ---------- world generation ----------
function generateWorld(themeKey, seed) {
  const theme = THEMES[themeKey] || THEMES.day;
  world = { W: 7200, H: 5600, clouds: [], islands: [], seed: seed, theme: theme };
  const r = seeded(seed);
  for (let i = 0; i < 110; i++) {
    world.clouds.push({
      x: r() * world.W, y: r() * world.H,
      r: rand(60, 190), drift: rand(2, 7), alpha: rand(0.25, 0.8), seed: r()
    });
  }
  const n = randi(10, 16);
  for (let i = 0; i < n; i++) {
    const cx = 350 + r() * (world.W - 700);
    const cy = 350 + r() * (world.H - 700);
    const rad = rand(120, 430);
    const pts = [];
    const count = randi(8, 14);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      const rr = rad * rand(0.72, 1.22);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    world.islands.push({ cx, cy, rad, pts, seed: r(), city: theme.city && r() > 0.55 });
  }
}

// ---------- spawn helpers ----------
function spawnPointAround(cx, cy, minD, maxD) {
  const a = rand(0, TAU);
  const d = rand(minD, maxD);
  return {
    x: clamp(cx + Math.cos(a) * d, 260, world.W - 260),
    y: clamp(cy + Math.sin(a) * d, 260, world.H - 260)
  };
}

function makeEnemy(kind, x, y) {
  const defs = {
    fighter: { hp: 50, speed: rand(215, 250), turn: 2.1, r: 22, score: 120, exp: 100, fireCd: rand(0.8, 2), mslCd: rand(4, 8), color: '#e3554f' },
    gunner: { hp: 62, speed: rand(160, 185), turn: 1.7, r: 24, score: 160, exp: 130, fireCd: rand(0.4, 1), mslCd: rand(7, 11), color: '#e8913d' },
    bomber: { hp: 190, speed: rand(105, 125), turn: 0.7, r: 30, score: 320, exp: 260, fireCd: 2.2, mslCd: 999, color: '#9aa4a8' },
    ace: { hp: 720, speed: rand(235, 255), turn: 2.6, r: 26, score: 2500, exp: 1200, fireCd: 1, mslCd: 6, color: '#e04a3f' }
  };
  const d = defs[kind];
  return {
    kind, x, y, heading: rand(0, TAU), speed: d.speed, maxSpeed: d.speed,
    hp: d.hp, maxHp: d.hp, turn: d.turn, r: d.r, score: d.score, exp: d.exp, color: d.color,
    fireCd: d.fireCd, mslCd: d.mslCd, bank: 0, seed: rand(0, 10),
    strafeT: 0, attackT: rand(2, 5), phase2: false, retreat: false, smokeT: 0,
    wreckT: 0, wreckDone: false
  };
}

function spawnWave(kinds) {
  const cx = mission.escort ? (mission.transport ? mission.transport.x : player.x) : player.x;
  const cy = mission.escort ? (mission.transport ? mission.transport.y : player.y) : player.y;
  for (const kind of kinds) {
    const p = spawnPointAround(cx, cy, 850, 1250);
    const e = makeEnemy(kind, p.x, p.y);
    e.heading = angleTo(p.x, p.y, cx, cy);
    if (kind === 'bomber') e.heading = rand(-0.6, 0.6);
    enemies.push(e);
  }
}

function spawnTransport() {
  const t = {
    kind: 'transport', x: 700, y: world.H / 2, heading: 0, speed: 128,
    hp: 320, maxHp: 320, r: 44, waypoints: [
      { x: 700, y: world.H / 2 },
      { x: 2100, y: world.H / 2 + 300 },
      { x: 3800, y: world.H / 2 - 220 },
      { x: 6100, y: world.H / 2 + 80 }
    ], wpIndex: 1, smokeT: 0, bank: 0
  };
  allies.push(t);
  mission.transport = t;
}

function spawnAce() {
  const p = spawnPointAround(player.x, player.y, 950, 1150);
  const e = makeEnemy('ace', p.x, p.y);
  e.attackT = 2.2;
  enemies.push(e);
  mission.boss = e;
  for (let i = 0; i < 4; i++) {
    const q = spawnPointAround(e.x, e.y, 300, 430);
    const f = makeEnemy('fighter', q.x, q.y);
    f.heading = angleTo(q.x, q.y, player.x, player.y);
    enemies.push(f);
  }
}

// ---------- particles ----------
function addParticle(p) {
  if (particles.length > 700) particles.splice(0, particles.length - 700);
  particles.push(p);
}

function burstFire(x, y, n, spread, speed, life, big) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(speed * 0.4, speed);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(life * 0.5, life), maxLife: life,
      size: rand(6, big ? 22 : 12), type: 'fire', color: pick(['#ffd166', '#ff9f43', '#f368e0', '#ee5253'])
    });
  }
}

function burstSmoke(x, y, n, big) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(15, big ? 130 : 70);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.7, big ? 2.2 : 1.4), maxLife: big ? 2.2 : 1.4,
      size: rand(8, big ? 30 : 16), type: 'smoke', color: 'rgba(70,72,76,0.8)'
    });
  }
}

function burstSpark(x, y, n, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(speed * 0.3, speed);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.15, life), maxLife: life,
      size: rand(1.5, 3.5), type: 'spark', color: '#ffe08a'
    });
  }
}

function addRing(x, y, r, color, life) {
  addParticle({ x, y, vx: 0, vy: 0, life: life, maxLife: life, size: r, type: 'ring', color });
}

function addFlash(x, y, r, color, life) {
  addParticle({ x, y, vx: 0, vy: 0, life: life, maxLife: life, size: r, type: 'flash', color });
}

function burstDebris(x, y, count, big) {
  for (let i = 0; i < count; i++) {
    const chunk = i % 6 === 0;
    const a = rand(0, TAU);
    const sp = rand(110, big ? 520 : 390) * (chunk ? 0.82 : 1);
    const size = rand(6, big ? 20 : 13) * (chunk ? 1.4 : 1);
    const verts = [];
    const sides = randi(3, 6);
    for (let k = 0; k < sides; k++) {
      const rr = size * rand(0.55, 1);
      verts.push({ x: Math.cos((k / sides) * TAU) * rr, y: Math.sin((k / sides) * TAU) * rr });
    }
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(chunk ? 1.1 : 0.7, big ? 2.1 : 1.55), maxLife: big ? 2.1 : 1.55,
      size, verts, rot: rand(0, TAU), rotSpeed: rand(-9, 9),
      type: 'debris', color: pick(['#f2f6fb', '#c9d4df', '#94a3b2', '#5d6874', '#ffb84d', '#ff8a5c'])
    });
  }
}

function addText(x, y, text, color, size) {
  addParticle({ x, y, vx: 0, vy: -34, life: 1.1, maxLife: 1.1, size: size || 16, type: 'text', text, color });
}

function addToast(text, color, size) {
  addParticle({ x: W / 2, y: H * 0.62, vx: 0, vy: -30, life: 1.5, maxLife: 1.5, size: size || 17, type: 'text', text, color });
}

function explode(x, y, power, big) {
  burstFire(x, y, big ? 42 : 24, big ? 340 : 220, big ? 3.1 : 1.9, big);
  burstSmoke(x, y, big ? 16 : 9, big);
  burstSpark(x, y, big ? 26 : 14, big ? 520 : 340, 0.7);
  addRing(x, y, big ? 90 : 55, 'rgba(255,220,150,0.8)', 0.45);
  addFlash(x, y, big ? 70 : 42, 'rgba(255,240,200,0.85)', 0.18);
  cam.shake = Math.min(26, cam.shake + power);
  AudioSys.explosion(big);
}

// ---------- damage helpers ----------
function damagePlane(p, dmg) {
  p.hp -= dmg;
  p.hitFlash = 0.12;
  if (p.kind === 'player') {
    GAME.damageTaken += Math.min(dmg, p.hp + dmg);
    AudioSys.hit();
  }
  if (p.hp <= 0 && !p.dead) killPlane(p);
}

function killPlane(p) {
  p.dead = true;
  const big = p.kind === 'bomber' || p.kind === 'transport' || p.kind === 'ace';
  explode(p.x, p.y, big ? 22 : 12, big);
  burstDebris(p.x, p.y, big ? 10 : 6, big);
  if (p.kind === 'player') {
    player.alive = false;
    GAME.freezeTimer = 1.6;
    GAME.pendingState = 'gameover';
    GAME.pendingTimer = 2.2;
    return;
  }
  if (p.kind === 'transport') {
    mission.failed = true;
    GAME.freezeTimer = 1.2;
    GAME.pendingState = 'gameover';
    GAME.pendingTimer = 2.4;
    return;
  }
  GAME.kills++;
  const pts = p.score || 100;
  GAME.score += pts;
  addText(p.x, p.y - 24, '+' + pts, '#ffd166', 17);
  AudioSys.score();
  if (p.kind !== 'transport' && GAME.mode === 'endless') {
    const gained = Math.round((p.exp || 100) * expMultiplier() * (1 + (GAME.upgrades.expGain || 0)));
    addExp(gained);
    registerKillCombo();
  }
  if (p.kind === 'ace') mission.bossKilled = true;
  if (Math.random() < 0.32) {
    pickups.push({
      x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 30),
      type: pick(['repair', 'missiles', 'score']), life: 18, t: rand(0, 3)
    });
  }
  if (GAME.mode === 'endless') dropLoot(p.x, p.y);
  spawnEnemyFlame(p);
}

function expMultiplier() {
  return 1 + GAME.combo * 0.2;
}

function comboCountdown() {
  return Math.max(1.5, GAME.comboMax - GAME.combo * 0.2);
}

function registerKillCombo() {
  if (GAME.combo > 0 && GAME.comboTimer > 0) {
    GAME.combo++;
  } else {
    GAME.combo = 1;
  }
  GAME.comboTimer = comboCountdown();
  if (GAME.combo >= 2) {
    addText(player.x, player.y - 58, '连杀 ×' + GAME.combo + ' 经验 x' + (1 + GAME.combo * 0.2).toFixed(1), '#ffd166', 16);
    AudioSys.score();
  }
}

function addExp(amount) {
  GAME.exp += amount;
  addText(player.x, player.y - 40, '+' + amount + ' EXP', '#9be3ff', 14);
  let leveled = false;
  while (GAME.level < 300 && GAME.exp >= expNeeded(GAME.level)) {
    GAME.exp -= expNeeded(GAME.level);
    GAME.level++;
    const heal = Math.round(player.maxHp * 0.1);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    addText(player.x, player.y - 76, '升级 Lv.' + GAME.level + ' 修复 +' + heal, '#7ee787', 17);
    AudioSys.pickup();
    leveled = true;
  }
  if (GAME.level >= 300) GAME.exp = 0;
  if (leveled) showUpgradeChoice();
}

function expNeeded(level) {
  return Math.round(120 * Math.pow(level, 1.18));
}

function spawnEnemyFlame(p) {
  for (let i = 0; i < 6; i++) {
    addParticle({
      x: p.x + rand(-12, 12), y: p.y + rand(-12, 12),
      vx: rand(-40, 40), vy: rand(-90, -30),
      life: rand(0.5, 1.1), maxLife: 1.1, size: rand(5, 11), type: 'fire', color: '#ffb35c'
    });
  }
}

function hurtPlayer(dmg) {
  if (player.invuln > 0 || !player.alive) return;
  const mitigated = dmg * (1 - (GAME.upgrades.armor || 0));
  damagePlane(player, mitigated);
  player.hitFlash = Math.max(player.hitFlash, 0.3);
  cam.shake = Math.min(24, cam.shake + 8);
}

// ---------- updates ----------
function tryBarrelRoll(dir) {
  if (GAME.state !== 'playing' || !player.alive || transition.active) return false;
  if (player.rollActive || player.rollCd > 0) return false;
  player.rollActive = true;
  player.rollDir = dir === 'left' ? -1 : 1;
  player.rollT = 0;
  player.rollCd = 2.6;
  player.invuln = Math.max(player.invuln, 1);
  player.lastDirTap = { dir: null, t: -99 };
  AudioSys.roll();
  addText(player.x, player.y - 58, dir === 'left' ? '左滚筒' : '右滚筒', '#9be3ff', 16);
  return true;
}

function steerPlane(p, desired, dt, rateMult) {
  const diff = angDiff(p.heading, desired);
  let rate = p.turn * (rateMult || 1);
  if (p.speed > 1) rate *= (1 - 0.32 * clamp((p.speed - CFG.minSpeed) / (CFG.maxSpeed - CFG.minSpeed), 0, 1));
  const max = rate * dt;
  const turn = clamp(diff, -max, max);
  p.heading += turn;
  p.bank = lerp(p.bank, clamp(turn / (dt || 0.001) / 2.4, -1, 1), 1 - Math.exp(-dt * 9));
}

function movePlane(p, dt) {
  p.x += Math.cos(p.heading) * p.speed * dt;
  p.y += Math.sin(p.heading) * p.speed * dt;
  p.x = clamp(p.x, 120, world.W - 120);
  p.y = clamp(p.y, 120, world.H - 120);
}

function updatePlayer(dt) {
  if (!player.alive) return;
  const now = performance.now() / 1000;
  const mouseActive = (now - input.mouse.movedAt) < 1.8;
  const turnL = isActionDown('turnLeft');
  const turnR = isActionDown('turnRight');
  if (turnL || turnR) {
    const dir = turnL ? -1 : 1;
    steerPlane(player, player.heading + dir * Math.PI / 2, dt, 1.5);
  } else if (mouseActive) {
    const dx = input.mouse.x - W / 2;
    const dy = input.mouse.y - H / 2;
    if (dx * dx + dy * dy > 400) steerPlane(player, Math.atan2(dy, dx), dt);
  } else {
    player.bank = lerp(player.bank, 0, 1 - Math.exp(-dt * 8));
  }

  if (isActionDown('throttleUp')) player.throttle = clamp(player.throttle + dt * 0.65, 0, 1);
  if (isActionDown('throttleDown')) player.throttle = clamp(player.throttle - dt * 0.65, 0, 1);
  player.afterburn = isActionDown('afterburn');
  if (isActionDown('dash') && !player.dashPressed) {
    player.dashPressed = true;
    tryDash();
  }
  if (!isActionDown('dash')) player.dashPressed = false;
  const targetSpeed = CFG.minSpeed + player.throttle * (CFG.maxSpeed - CFG.minSpeed) + (player.afterburn ? CFG.abSpeed : 0);
  player.speed = lerp(player.speed, targetSpeed, 1 - Math.exp(-dt * (player.afterburn ? 2.2 : 1.4)));
  movePlane(player, dt);

  player.rollCd = Math.max(0, player.rollCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  if (player.dashActive) {
    player.dashT += dt;
    if (player.dashT >= player.dashDur) {
      player.dashActive = false;
      player.dashT = 0;
    } else {
      player.x += Math.cos(player.heading) * player.dashSpeed * dt;
      player.y += Math.sin(player.heading) * player.dashSpeed * dt;
      player.x = clamp(player.x, 120, world.W - 120);
      player.y = clamp(player.y, 120, world.H - 120);
    }
  }
  if (player.rollActive) {
    player.rollT += dt;
    if (player.rollT >= player.rollDur) {
      player.rollActive = false;
      player.rollT = 0;
      player.rollDir = 0;
    } else {
      const phase = player.rollT / player.rollDur;
      const px = -Math.sin(player.heading), py = Math.cos(player.heading);
      const amp = 120 * Math.sin(phase * Math.PI) * player.rollDir;
      player.x += px * amp * dt;
      player.y += py * amp * dt;
      player.x = clamp(player.x, 120, world.W - 120);
      player.y = clamp(player.y, 120, world.H - 120);
      if (Math.random() < dt * 55) {
        const ox = Math.cos(player.heading), oy = Math.sin(player.heading);
        const wob = Math.sin(player.rollT * 16) * 24;
        addParticle({
          x: player.x + px * wob - ox * 34, y: player.y + py * wob - oy * 34,
          vx: -ox * 60 + rand(-14, 14), vy: -oy * 60 + rand(-14, 14),
          life: rand(0.5, 0.9), maxLife: 0.9, size: rand(6, 10),
          type: 'smoke', color: 'rgba(230,240,245,0.6)'
        });
      }
    }
  }

  player.fireCd -= dt;
  player.missileCd -= dt;
  player.invuln = Math.max(0, player.invuln - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  if (player.throttle > 0.15 && Math.random() < dt * 6) {
    addParticle({
      x: player.x - Math.cos(player.heading) * 46, y: player.y - Math.sin(player.heading) * 46,
      vx: rand(-12, 12) - Math.cos(player.heading) * 40, vy: rand(-12, 12) - Math.sin(player.heading) * 40,
      life: rand(0.35, 0.7), maxLife: 0.7, size: rand(5, 9), type: 'smoke', color: 'rgba(230,230,235,0.55)'
    });
  }

  const wantFire = isActionDown('gun') || input.fireHeld;
  const wantMsl = isActionDown('missile') || input.mslHeld;
  if (wantFire) firePlayerGuns();
  if (wantMsl) firePlayerMissile();
}

function firePlayerGuns() {
  if (player.fireCd > 0 || !player.alive) return;
  const w = player.weapon;
  if (!w || w.ammo === 0) return;
  player.fireCd = w.cd / (1 + (GAME.upgrades.gunRate || 0));
  player.gunSide = -player.gunSide;
  const ox = Math.cos(player.heading), oy = Math.sin(player.heading);
  const px = -oy, py = ox;
  const count = Math.max(1, Math.round(w.barrel || 2));
  const offs = [];
  if (count === 1) offs.push(0);
  else if (count === 2) offs.push(-8, 8);
  else if (count === 3) offs.push(-13, 0, 13);
  else if (count === 4) offs.push(-16, -6, 6, 16);
  for (const side of offs) {
    const spread = rand(-w.spread, w.spread);
    const a = player.heading + spread;
    const dmgMult = 1 + (GAME.upgrades.gunDamage || 0);
    bullets.push({
      x: player.x + ox * 36 + px * side,
      y: player.y + oy * 36 + py * side,
      vx: Math.cos(a) * w.speed + Math.cos(player.heading) * player.speed * 0.7,
      vy: Math.sin(a) * w.speed + Math.sin(player.heading) * player.speed * 0.7,
      life: w.life, r: w.size, dmg: Math.round(w.dmg * dmgMult), enemy: false, fromPlayer: true,
      pierce: w.pierce || 0, blast: w.blast || 0
    });
  }
  GAME.shotsFired += offs.length;
  if (w.limited) w.ammo--;
  if (w.limited && w.ammo <= 0) switchWeaponBack();
  AudioSys.gun();
}

function switchWeaponBack() {
  const list = GAME.weapons;
  while (list.length > 1) {
    list.pop();
    const prev = list[list.length - 1];
    if (prev && (!prev.limited || prev.ammo > 0)) {
      player.weapon = prev;
      addToast(prev.name + ' 已接替', QUALITY_COLOR[prev.quality], 15);
      return;
    }
  }
  player.weapon = defaultWeapon();
  addToast('默认机炮 已接替', '#dfe9f2', 15);
}

function firePlayerMissile() {
  if (player.missileCd > 0 || player.missiles <= 0 || !player.alive) return;
  if (!player.target || player.target.dead || player.lock < CFG.lockTime) {
    if (GAME.freezeTimer <= 0) addText(player.x, player.y - 54, '未锁定', '#9ad0ff', 14);
    return;
  }
  player.missiles--;
  player.missileCd = 0.55;
  const t = player.target;
  launchMissile(player.x + Math.cos(player.heading) * 40, player.y + Math.sin(player.heading) * 40, player.heading, t, false, GAME.upgrades.missileDamage || 0);
  AudioSys.missileLaunch();
}

function launchMissile(x, y, heading, target, enemySide, dmgBonus) {
  missiles.push({
    x, y, heading, speed: CFG.missileSpeed * (enemySide ? 0.82 : 1),
    turn: enemySide ? 1.9 : CFG.missileTurn, life: CFG.missileLife, target: target,
    enemy: !!enemySide, trail: 0, r: 5, dmgBonus: dmgBonus || 0
  });
}

function acquireLock() {
  let best = null, bestScore = 1e9;
  for (const e of enemies) {
    if (e.dead || e.retreat) continue;
    const d = dist(player.x, player.y, e.x, e.y);
    const a = angDiff(player.heading, angleTo(player.x, player.y, e.x, e.y));
    if (d < CFG.lockRange && Math.abs(a) < CFG.lockCone) {
      const score = d * (1 + Math.abs(a) * 2);
      if (score < bestScore) { bestScore = score; best = e; }
    }
  }
  player.target = best;
  if (best) {
    player.lock = Math.min(CFG.lockTime, player.lock + 1 / 60);
    if (Math.abs(player.lock - 0.4) < 0.02 || Math.abs(player.lock - 0.75) < 0.02) AudioSys.lockBeep();
  } else {
    player.lock = 0;
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    b.hitCount = b.hitCount || 0;
    let dead = b.life <= 0;
    if (!dead) {
      if (b.fromPlayer) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (dist2(b.x, b.y, e.x, e.y) < (e.r + 8) * (e.r + 8)) {
            damagePlane(e, b.dmg);
            if (b.blast) {
              for (const other of enemies) {
                if (other.dead || other === e) continue;
                if (dist(b.x, b.y, other.x, other.y) < b.blast + other.r) damagePlane(other, b.dmg * 0.55);
              }
            }
            burstSpark(b.x, b.y, 3, 130, 0.25);
            GAME.shotsHit++;
            b.hitCount++;
            if (!b.pierce || b.hitCount > b.pierce) dead = true;
            break;
          }
        }
      } else {
        for (const t of [player, ...allies]) {
          if (t.dead || !t.alive) continue;
          if (dist2(b.x, b.y, t.x, t.y) < (t.r + 8) * (t.r + 8)) {
            if (t === player) hurtPlayer(b.dmg);
            else damagePlane(t, b.dmg);
            burstSpark(b.x, b.y, 3, 130, 0.25);
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (m.target && !m.target.dead) {
      const desired = angleTo(m.x, m.y, m.target.x, m.target.y);
      const diff = angDiff(m.heading, desired);
      let turnMult = 1;
      if (m.enemy && m.target === player && (player.rollActive || player.dashActive)) turnMult = 0.28;
      const max = m.turn * turnMult * dt;
      m.heading += clamp(diff, -max, max);
    }
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    m.life -= dt;
    m.trail -= dt;
    if (m.trail <= 0) {
      m.trail = 0.035;
      addParticle({
        x: m.x - Math.cos(m.heading) * 6, y: m.y - Math.sin(m.heading) * 6,
        vx: rand(-8, 8), vy: rand(-8, 8), life: rand(0.35, 0.6), maxLife: 0.6,
        size: rand(4, 7), type: 'smoke', color: 'rgba(220,220,225,0.7)'
      });
    }
    let dead = m.life <= 0;
    if (!dead && m.target && dist2(m.x, m.y, m.target.x, m.target.y) < (m.target.r + 9) * (m.target.r + 9)) {
      m.x = m.target.x; m.y = m.target.y;
      dead = true;
    }
    if (dead) {
      explode(m.x, m.y, 7, false);
      if (!m.enemy) {
        for (const e of enemies) {
          if (e.dead) continue;
          const d = dist(m.x, m.y, e.x, e.y);
          if (d < CFG.missileBlast + e.r) damagePlane(e, CFG.missileDamage * (1 + (m.dmgBonus || 0)));
        }
      } else {
        const targets = [player, ...allies];
        for (const t of targets) {
          if (t.dead || !t.alive) continue;
          const d = dist(m.x, m.y, t.x, t.y);
          if (d < CFG.missileBlast + t.r) {
            if (t === player) hurtPlayer(CFG.missileDamage * 0.8);
            else damagePlane(t, CFG.missileDamage);
          }
        }
      }
      missiles.splice(i, 1);
    }
  }
}

function enemyFireGuns(e, dt) {
  if (e.fireCd > 0) { e.fireCd -= dt; return; }
  const t = e.aiTarget || player;
  if (!t || t.dead || !t.alive) return;
  const d = dist(e.x, e.y, t.x, t.y);
  if (d > 820) return;
  const a = angDiff(e.heading, angleTo(e.x, e.y, t.x, t.y));
  if (Math.abs(a) > 0.5) return;
  e.fireCd = e.kind === 'gunner' ? 0.16 : rand(0.5, 0.9);
  const dir = e.heading + rand(-0.03, 0.03);
  for (let i = 0; i < (e.kind === 'gunner' ? 3 : 1); i++) {
    const off = (i - 1) * 8;
    bullets.push({
      x: e.x + Math.cos(e.heading) * 30 + -Math.sin(e.heading) * off,
      y: e.y + Math.sin(e.heading) * 30 + Math.cos(e.heading) * off,
      vx: Math.cos(dir) * 620 + Math.cos(e.heading) * e.speed * 0.6,
      vy: Math.sin(dir) * 620 + Math.sin(e.heading) * e.speed * 0.6,
      life: 1.6, r: 4, dmg: e.kind === 'gunner' ? 6 : 8, enemy: true, fromPlayer: false
    });
  }
}

function enemyFireMissile(e, dt) {
  if (e.mslCd > 0) { e.mslCd -= dt; return; }
  const t = e.aiTarget || player;
  if (!t || t.dead || !t.alive) return;
  const d = dist(e.x, e.y, t.x, t.y);
  if (d < 400 || d > 1250) return;
  const a = angDiff(e.heading, angleTo(e.x, e.y, t.x, t.y));
  if (Math.abs(a) > 0.6) return;
  e.mslCd = e.kind === 'ace' ? (e.phase2 ? 1.8 : 2.6) : rand(5, 8);
  if (e.kind === 'ace') {
    const count = e.phase2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      launchMissile(e.x, e.y, e.heading + (i - (count - 1) / 2) * 0.22, t, true);
    }
    AudioSys.warningLaunch();
  } else {
    launchMissile(e.x, e.y, e.heading, t, true);
    AudioSys.warningLaunch();
  }
}

function updateEnemy(e, dt) {
  if (e.dead) return;
  if (e.retreat) {
    e.speed = Math.max(300, e.speed + dt * 120);
    movePlane(e, dt);
    return;
  }
  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  e.aiTarget = t;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);

  if (e.kind === 'fighter') {
    const orbit = Math.sin(gameTime * 0.8 + e.seed) * 0.9;
    steerPlane(e, toT + orbit * 0.35 + (d > 1300 ? 0 : 0.4), dt);
    e.speed = lerp(e.speed, e.maxSpeed * (d > 900 ? 1.15 : 0.82), dt * 0.6);
    if (d > 1500) steerPlane(e, toT, dt);
    movePlane(e, dt);
  } else if (e.kind === 'gunner') {
    let desired;
    if (d < 470) desired = toT + Math.PI;
    else if (d > 800) desired = toT;
    else desired = toT + 1.15;
    steerPlane(e, desired, dt, 0.9);
    movePlane(e, dt);
  } else if (e.kind === 'bomber') {
    const wp = mission.transport && mission.escort ? mission.transport : t;
    const wx = wp.x + Math.cos(gameTime * 0.1) * 240;
    const wy = wp.y + Math.sin(gameTime * 0.1) * 160;
    steerPlane(e, angleTo(e.x, e.y, wx, wy), dt, 0.55);
    movePlane(e, dt);
  } else if (e.kind === 'ace') {
    e.attackT -= dt;
    const circleD = d < 430 ? 1.35 : (d > 780 ? -1.1 : 0.85);
    steerPlane(e, toT + circleD, dt, 1.05);
    e.speed = lerp(e.speed, e.maxSpeed * (d > 700 ? 1.1 : 0.9), dt * 0.8);
    if (e.attackT <= 0) {
      e.attackT = e.phase2 ? rand(3.4, 4.6) : rand(5, 7);
      e.mslCd = 0.15;
    }
    movePlane(e, dt);
  }

  enemyFireGuns(e, dt);
  enemyFireMissile(e, dt);

  if (e.hp < e.maxHp * 0.45) {
    e.smokeT -= dt;
    if (e.smokeT <= 0) {
      e.smokeT = 0.09;
      addParticle({
        x: e.x, y: e.y, vx: rand(-18, 18) - Math.cos(e.heading) * e.speed * 0.25,
        vy: rand(-18, 18) - Math.sin(e.heading) * e.speed * 0.25,
        life: rand(0.5, 1), maxLife: 1, size: rand(6, 11), type: 'smoke', color: 'rgba(50,52,55,0.85)'
      });
    }
  }
  if (e.kind === 'ace' && !e.phase2 && e.hp < e.maxHp * 0.4) {
    e.phase2 = true;
    addRing(e.x, e.y, 140, 'rgba(255,80,60,0.9)', 0.8);
    addText(e.x, e.y - 40, '绯红彗星 进入第二阶段', '#ff8a80', 17);
  }
}

function updateWrecks(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.dead) continue;
    if (GAME.state !== 'playing' && GAME.state !== 'paused' && GAME.state !== 'complete' && GAME.state !== 'gameover') continue;
    e.wreckT += dt;
    if (!e.wreckDone && e.wreckT > 5) {
      e.wreckDone = true;
      e.wreckFade = 0;
    }
    if (e.wreckDone) {
      e.wreckFade = Math.min(1, e.wreckFade + dt / 1.5);
      if (Math.random() < dt * 14) {
        addParticle({
          x: e.x + rand(-14, 14), y: e.y + rand(-14, 14),
          vx: rand(-18, 18), vy: rand(-30, -10),
          life: rand(0.4, 0.9), maxLife: 0.9, size: rand(4, 8),
          type: 'fire', color: '#ffb35c'
        });
      }
      if (e.wreckFade >= 1) enemies.splice(i, 1);
    }
  }
}

function updateCombo(dt) {
  if (GAME.mode !== 'endless') return;
  if (GAME.combo > 0 && GAME.comboTimer > 0) {
    GAME.comboTimer -= dt;
    if (GAME.comboTimer <= 0) {
      GAME.combo = 0;
      GAME.comboTimer = 0;
    }
  }
}

function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 62;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

function updatePickups(dt) {
  if (GAME.state !== 'playing') return;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx = lerp(p.vx, 0, dt * 2); p.vy = lerp(p.vy, 0, dt * 2);
    p.life -= dt;
    p.t += dt;
    if (player.alive && dist2(p.x, p.y, player.x, player.y) < 56 * 56) {
      if (GAME.mode === 'endless') {
        collectLoot(p);
      } else {
        if (p.type === 'repair') { player.hp = Math.min(player.maxHp, player.hp + 38); addText(player.x, player.y - 44, '机身修复 +38', '#7ee787', 15); }
        else if (p.type === 'missiles') { player.missiles = Math.min(player.maxMissiles, player.missiles + 10); addText(player.x, player.y - 44, '导弹 +10', '#7fd4ff', 15); }
        else { GAME.score += 500; addText(player.x, player.y - 44, '荣誉点数 +500', '#ffd166', 15); }
        AudioSys.pickup();
      }
      pickups.splice(i, 1);
      continue;
    }
    if (p.life <= 0) pickups.splice(i, 1);
  }
}

function defaultWeapon() {
  return {
    id: 'default', name: '默认机炮', limited: false, cd: CFG.gunRate, dmg: CFG.gunDamage,
    speed: CFG.gunSpeed, spread: CFG.gunSpread, life: 0.75, size: 4, barrel: 2,
    quality: 'common', ammo: Infinity
  };
}

function pickQuality() {
  const r = Math.random();
  if (r < 0.62) return 'common';
  if (r < 0.9) return 'good';
  return 'rare';
}

function makeWeapon(id, quality) {
  const t = DROP_WEAPONS[id];
  const q = QUALITY_MULT[quality] || 1;
  return {
    id, name: t.name, limited: !!t.limited,
    cd: Math.max(0.045, t.cd * (quality === 'common' ? 1 : quality === 'good' ? 0.94 : 0.88)),
    dmg: Math.max(1, Math.round(t.dmg * q)),
    speed: Math.round(t.speed * q),
    spread: t.spread * (quality === 'common' ? 1.12 : quality === 'good' ? 1 : 0.9),
    life: t.life, size: Math.max(3, Math.round(t.size * q)),
    barrel: t.barrel, pierce: t.pierce || 0, blast: t.blast || 0,
    ammo: t.limited ? Math.max(1, Math.round(t.per * q)) : Infinity,
    quality
  };
}

function dropLoot(x, y) {
  const r = Math.random();
  if (r < 0.1) return;
  if (r < 0.5) {
    const id = pick(Object.keys(DROP_WEAPONS));
    const quality = pickQuality();
    pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'weapon', id, quality, life: 18, t: rand(0, 3) });
    return;
  }
  if (r < 0.68) {
    const id = pick(Object.keys(DROP_MOVES));
    const quality = pickQuality();
    pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'move', id, quality, life: 18, t: rand(0, 3) });
    return;
  }
  const supply = pick(Object.keys(DROP_SUPPLIES));
  pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'supply', supply, life: 18, t: rand(0, 3) });
}

function collectLoot(p) {
  GAME.pickupsTaken++;
  if (p.type === 'weapon') {
    applyWeapon(p.id, p.quality);
  } else if (p.type === 'move') {
    const t = DROP_MOVES[p.id];
    const qi = QUALITY_ORDER.indexOf(p.quality);
    const q = QUALITY_MULT[p.quality] || 1;
    const newDash = {
      id: p.id, quality: p.quality, name: t.name,
      cd: t.cd[qi] * (p.quality === 'common' ? 1.05 : p.quality === 'good' ? 1 : 0.95),
      dur: t.dur[qi], speed: Math.round(t.speed[qi] * (p.quality === 'common' ? 0.9 : p.quality === 'good' ? 1 : 1.12)),
      invuln: t.invuln[qi]
    };
    const old = GAME.dash;
    GAME.dash = newDash;
    player.dashCd = 0;
    addToast(QUALITY_NAME[p.quality] + ' ' + t.name + ' 已获得', QUALITY_COLOR[p.quality], 16);
    AudioSys.pickup();
    void old;
  } else if (p.type === 'supply') {
    const s = DROP_SUPPLIES[p.supply];
    if (p.supply === 'repair') {
      player.hp = Math.min(player.maxHp, player.hp + s.amount);
      addToast(s.name + ' +' + s.amount, s.color, 16);
    } else if (p.supply === 'missiles') {
      player.missiles = Math.min(player.maxMissiles, player.missiles + s.amount);
      addToast(s.name + ' +' + s.amount, s.color, 16);
    } else {
      GAME.score += s.amount;
      addToast(s.name + ' +' + s.amount, s.color, 16);
    }
    AudioSys.pickup();
  }
}

function applyWeapon(id, quality) {
  if (id === 'default') return;
  const def = DROP_WEAPONS[id];
  const qIdx = QUALITY_ORDER.indexOf(quality);
  const sameId = GAME.weapons.filter(w => w.id === id && (!w.limited || w.ammo > 0));
  let best = null, bestIdx = -1;
  for (const w of sameId) {
    const i = QUALITY_ORDER.indexOf(w.quality);
    if (i > bestIdx) { best = w; bestIdx = i; }
  }
  if (best && qIdx < bestIdx) {
    GAME.synth = GAME.synth || {};
    const key = id + ':' + quality;
    GAME.synth[key] = (GAME.synth[key] || 0) + 1;
    if (GAME.synth[key] >= 3 && qIdx < QUALITY_ORDER.length - 1) {
      GAME.synth[key] = 0;
      const nextQ = QUALITY_ORDER[qIdx + 1];
      const nextW = makeWeapon(id, nextQ);
      if (!nextW.limited) nextW.count = 1;
      GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
      GAME.weapons.push(nextW);
      const nextIdx = QUALITY_ORDER.indexOf(nextQ);
      if (!best || nextIdx >= bestIdx) player.weapon = nextW;
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' ×3 已合成 ' + QUALITY_NAME[nextQ] + ' ' + nextW.name, QUALITY_COLOR[nextQ], 17);
      AudioSys.score();
    } else {
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 合成进度 ' + (GAME.synth[key] || 0) + '/3', QUALITY_COLOR[quality], 15);
      AudioSys.pickup();
    }
    return;
  }
  const existing = GAME.weapons.find(w => w.id === id && w.quality === quality && !w.limited);
  if (existing && !def.limited) {
    existing.count = (existing.count || 0) + 1;
    const curIdx = QUALITY_ORDER.indexOf(quality);
    if (existing.count >= 3 && curIdx < QUALITY_ORDER.length - 1) {
      const upgraded = makeWeapon(id, QUALITY_ORDER[curIdx + 1]);
      upgraded.count = 1;
      const idx = GAME.weapons.indexOf(existing);
      if (idx >= 0) GAME.weapons[idx] = upgraded;
      player.weapon = upgraded;
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 已升级为 ' + QUALITY_NAME[upgraded.quality] + ' ' + upgraded.name, QUALITY_COLOR[upgraded.quality], 17);
      AudioSys.score();
      return;
    }
    addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 合成进度 ' + (existing.count || 0) + '/3', QUALITY_COLOR[quality], 15);
    AudioSys.pickup();
    return;
  }
  const w = makeWeapon(id, quality);
  if (w.limited) {
    GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
    const sameLimited = GAME.weapons.find(x => x.id === id && x.quality === quality);
    if (sameLimited && sameLimited.ammo > 0) {
      const bonus = w.ammo;
      sameLimited.ammo = Math.min(999, sameLimited.ammo + bonus);
      player.weapon = sameLimited;
      addToast('已补充 ' + QUALITY_NAME[quality] + ' ' + w.name + ' +' + bonus, QUALITY_COLOR[quality], 16);
      AudioSys.pickup();
      return;
    }
    GAME.weapons.push(w);
    player.weapon = w;
    addToast('获得 ' + QUALITY_NAME[quality] + ' ' + w.name + ' 弹药 ×' + w.ammo, QUALITY_COLOR[quality], 16);
    AudioSys.pickup();
    return;
  }
  if (!w.limited) w.count = 1;
  GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
  GAME.weapons.push(w);
  player.weapon = w;
  addToast('获得 ' + QUALITY_NAME[quality] + ' ' + w.name, QUALITY_COLOR[quality], 16);
  AudioSys.pickup();
}

function tryDash() {
  const d = GAME.dash;
  if (!d || player.dashActive || player.dashCd > 0 || !player.alive) return false;
  player.dashActive = true;
  player.dashT = 0;
  player.dashDur = d.dur;
  player.dashSpeed = d.speed;
  player.dashCd = d.cd / (1 + (GAME.upgrades.dashCd || 0));
  player.invuln = Math.max(player.invuln, d.invuln);
  AudioSys.roll();
  addText(player.x, player.y - 58, '突进', '#9be3ff', 16);
  return true;
}

const UPGRADE_POOL = [
  { id: 'gunDamage', name: '机炮强化', desc: '机炮伤害 +15%', apply() { GAME.upgrades.gunDamage = (GAME.upgrades.gunDamage || 0) + 0.15; } },
  { id: 'gunRate', name: '射速强化', desc: '射速 +12%', apply() { GAME.upgrades.gunRate = (GAME.upgrades.gunRate || 0) + 0.12; } },
  { id: 'missileDamage', name: '导弹强化', desc: '导弹伤害 +15%', apply() { GAME.upgrades.missileDamage = (GAME.upgrades.missileDamage || 0) + 0.15; } },
  { id: 'maxHp', name: '装甲强化', desc: '最大完整度 +10 并回复 20', apply() { player.maxHp += 10; player.hp = Math.min(player.maxHp, player.hp + 20); } },
  { id: 'dashCd', name: '机动强化', desc: '突进冷却 -15%', apply() { GAME.upgrades.dashCd = (GAME.upgrades.dashCd || 0) + 0.15; } },
  { id: 'expGain', name: '经验强化', desc: '经验获取 +20%', apply() { GAME.upgrades.expGain = (GAME.upgrades.expGain || 0) + 0.2; } },
  { id: 'missiles', name: '弹药强化', desc: '导弹载弹 +4', apply() { player.maxMissiles += 4; player.missiles = Math.min(player.maxMissiles, player.missiles + 4); } },
  { id: 'armor', name: '减伤强化', desc: '所受伤害 -5%', apply() { GAME.upgrades.armor = Math.min(0.5, (GAME.upgrades.armor || 0) + 0.05); } }
];

function showUpgradeChoice() {
  if (GAME.mode !== 'endless' || upgradeChoice || !player.alive) return;
  const available = UPGRADE_POOL.filter(u => (GAME.upgrades[u.id] || 0) < (u.id === 'armor' ? 10 : 10));
  const pool = available.length >= 3 ? available : UPGRADE_POOL;
  const chosen = [];
  const bag = pool.slice();
  for (let i = 0; i < 3 && bag.length; i++) {
    const idx = Math.floor(Math.random() * bag.length);
    chosen.push(bag.splice(idx, 1)[0]);
  }
  upgradeChoice = {
    options: chosen,
    index: -1,
    timer: 0
  };
}

function applyUpgrade(u) {
  if (!upgradeChoice) return;
  u.apply();
  upgradeChoice = null;
  AudioSys.score();
  addToast('强化已生效：' + u.name, '#ffd166', 17);
}

function updateTransport(dt) {
  const t = mission.transport;
  if (!t || t.dead) return;
  const wp = t.waypoints[t.wpIndex];
  const desired = angleTo(t.x, t.y, wp.x, wp.y);
  const diff = angDiff(t.heading, desired);
  t.heading += clamp(diff, -1.2 * dt, 1.2 * dt);
  t.speed = lerp(t.speed, 128, dt * 0.4);
  movePlane(t, dt);
  if (dist2(t.x, t.y, wp.x, wp.y) < 160 * 160) {
    t.wpIndex++;
    if (t.wpIndex >= t.waypoints.length) {
      mission.escortDone = true;
    }
  }
  if (t.hp < t.maxHp * 0.55) {
    t.smokeT -= dt;
    if (t.smokeT <= 0) {
      t.smokeT = 0.12;
      addParticle({
        x: t.x + rand(-30, 30), y: t.y + rand(-10, 10),
        vx: rand(-20, 20) - Math.cos(t.heading) * 60, vy: rand(-20, 20) - Math.sin(t.heading) * 60,
        life: rand(0.6, 1.2), maxLife: 1.2, size: rand(7, 13), type: 'smoke', color: 'rgba(60,62,66,0.8)'
      });
    }
  }
}

// ---------- mission logic ----------
const MISSION_DEFS = [
  {
    index: 1, code: 'OPERATION FIRST LIGHT', name: '黎明扫荡', theme: 'day', seed: 1121,
    brief: '敌方“铁旗”中队正在近海集结，试图封锁我方航道。升空击坠全部敌机，夺回制空权。',
    objective: '击坠全部敌机',
    total: 11,
    waves: [
      ['fighter', 'fighter', 'fighter'],
      ['fighter', 'fighter', 'gunner'],
      ['fighter', 'gunner', 'gunner'],
      ['bomber', 'fighter', 'fighter']
    ],
    timeBonus: 340
  },
  {
    index: 2, code: 'OPERATION IRON BIRD', name: '护航行动', theme: 'sunset', seed: 2307,
    brief: '我方运输机“铁鸟”载着整队飞行员撤离战区。护卫它穿越敌方拦截，安全抵达东侧补给线。',
    objective: '护送铁鸟运输机抵达补给线',
    escort: true,
    total: 13,
    waves: [
      ['fighter', 'fighter'],
      ['fighter', 'gunner', 'fighter'],
      ['bomber', 'fighter'],
      ['fighter', 'fighter', 'gunner', 'gunner'],
      ['bomber', 'fighter', 'fighter']
    ],
    timeBonus: 420
  },
  {
    index: 3, code: 'OPERATION CRIMSON GALE', name: '赤色风暴', theme: 'storm', seed: 5519,
    brief: '风暴中心，敌王牌“绯红彗星”亲自升空。突破其护卫编队，终结这位不败的指挥官。',
    objective: '击落敌王牌 绯红彗星',
    boss: true,
    total: 5,
    waves: [['fighter']],
    timeBonus: 520
  }
];

function startMission(index, mode) {
  GAME.mode = mode || 'campaign';
  upgradeChoice = null;
  GAME.missionIndex = index;
  GAME.time = 0;
  GAME.missionTime = 0;
  GAME.score = 0;
  GAME.kills = 0;
  GAME.shotsFired = 0;
  GAME.shotsHit = 0;
  GAME.damageTaken = 0;
  GAME.hintTimer = 12;
  GAME.pendingState = null;
  GAME.pendingTimer = 0;
  GAME.freezeTimer = 0;
  bullets = []; missiles = []; particles = []; pickups = []; enemies = []; allies = [];
  const def = MISSION_DEFS[index];
  generateWorld(def.theme, def.seed);
  player.x = world.W / 2;
  player.y = world.H / 2;
  player.heading = -Math.PI / 2;
  player.speed = 200;
  player.hp = player.maxHp;
  player.missiles = player.maxMissiles;
  player.throttle = 0.68;
  player.target = null; player.lock = 0;
  player.alive = true; player.dead = false; player.invuln = 1;
  player.rollActive = false; player.rollT = 0; player.rollDir = 0; player.rollCd = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.dashActive = false; player.dashT = 0; player.dashCd = 0; player.dashPressed = false;
  player.weapon = defaultWeapon();
  player.maxHp = 100; player.hp = 100;
  player.maxMissiles = 48;
  GAME.exp = 0; GAME.level = 1; GAME.combo = 0; GAME.comboTimer = 0;
  GAME.upgrades = {}; GAME.weapons = []; GAME.dash = null; GAME.synth = {}; upgradeChoice = null;
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;

  mission = {
    def, index, escort: !!def.escort, boss: !!def.boss,
    spawned: 0, aliveTotal: 0, total: def.total,
    waveIndex: 0, waveTimer: 0.8,
    transport: null, escortDone: false, failed: false,
    bossKilled: false, complete: false
  };
  if (def.escort) spawnTransport();
  if (def.boss) {
    spawnAce();
    mission.spawned = 5;
  }
  setState('playing');
}

function startEndless() {
  GAME.mode = 'endless';
  upgradeChoice = null;
  GAME.missionIndex = 0;
  GAME.time = 0; GAME.missionTime = 0;
  GAME.score = 0; GAME.kills = 0;
  GAME.shotsFired = 0; GAME.shotsHit = 0;
  GAME.damageTaken = 0; GAME.hintTimer = 12;
  GAME.pendingState = null; GAME.pendingTimer = 0; GAME.freezeTimer = 0;
  bullets = []; missiles = []; particles = []; pickups = []; enemies = []; allies = [];
  generateWorld(pick(['day', 'sunset', 'night']), Math.floor(Math.random() * 99999));
  player.x = world.W / 2; player.y = world.H / 2;
  player.heading = -Math.PI / 2; player.speed = 200;
  player.hp = player.maxHp; player.missiles = player.maxMissiles;
  player.throttle = 0.68; player.target = null; player.lock = 0;
  player.alive = true; player.dead = false; player.invuln = 1;
  player.rollActive = false; player.rollT = 0; player.rollDir = 0; player.rollCd = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.dashActive = false; player.dashT = 0; player.dashCd = 0; player.dashPressed = false;
  player.weapon = defaultWeapon();
  player.maxHp = 100; player.hp = 100;
  player.maxMissiles = 48;
  GAME.exp = 0; GAME.level = 1; GAME.combo = 0; GAME.comboTimer = 0;
  GAME.upgrades = {}; GAME.weapons = []; GAME.dash = null; GAME.synth = {}; upgradeChoice = null;
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;
  mission = {
    def: { index: 0, code: 'ENDLESS SORTIE', name: '自由出击', theme: 'night', objective: '存活越久，击坠越多' },
    index: 0, escort: false, boss: false,
    spawned: 0, aliveTotal: 0, total: 999999,
    waveIndex: 1, waveTimer: 1.2,
    transport: null, escortDone: false, failed: false, bossKilled: false, complete: false,
    endless: true
  };
  spawnWave(['fighter', 'fighter']);
  mission.spawned = 2;
  setState('playing');
}

function updateMissionSpawn(dt) {
  if (!mission || mission.complete || mission.failed) return;
  mission.waveTimer -= dt;
  mission.aliveTotal = enemies.filter(e => !e.dead).length;
  if (mission.endless) {
    if (mission.aliveTotal === 0 && mission.waveTimer <= 0) {
      const lv = GAME.level;
      const n = Math.min(30, 2 + Math.ceil(mission.waveIndex * 0.9) + Math.floor(lv / 12) + (lv > 60 ? 3 : 0));
      const kinds = [];
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        if (r < 0.42) kinds.push('fighter');
        else if (r < 0.68) kinds.push('gunner');
        else if (r < 0.92) kinds.push('bomber');
        else kinds.push('ace');
      }
      if (lv > 20 && Math.random() < 0.4) kinds.push('ace');
      spawnWave(kinds);
      mission.spawned += kinds.length;
      mission.waveIndex++;
      player.missiles = Math.min(player.maxMissiles, player.missiles + 8);
      addText(player.x, player.y - 70, '第 ' + mission.waveIndex + ' 波来袭', '#ffd166', 18);
      mission.waveTimer = 3.5;
    }
    return;
  }
  const def = mission.def;
  if (mission.spawned < def.total && mission.aliveTotal < 4 && mission.waveTimer <= 0) {
    if (mission.boss) {
      if (!mission.bossKilled) spawnWave(['fighter']);
      mission.spawned++;
      mission.waveTimer = 12;
    } else {
      const kinds = def.waves[Math.min(mission.waveIndex, def.waves.length - 1)];
      spawnWave(kinds);
      mission.spawned += kinds.length;
      mission.waveIndex++;
      mission.waveTimer = 4;
    }
  }
  if (mission.escort && mission.transport && !mission.escortDone && mission.waveTimer > 0 && mission.aliveTotal < 2) {
    mission.waveTimer = Math.min(mission.waveTimer, 1.4);
  }
  if (mission.escortDone && mission.transport) {
    mission.complete = true;
  }
  if (!mission.escort && !mission.boss && mission.spawned >= def.total && mission.aliveTotal === 0) {
    mission.complete = true;
  }
  if (mission.boss && mission.bossKilled) {
    mission.complete = true;
    for (const e of enemies) if (!e.dead) e.retreat = true;
  }
}

function updateMission(dt) {
  if (GAME.freezeTimer > 0) {
    GAME.freezeTimer -= dt;
    if (GAME.freezeTimer <= 0 && GAME.pendingState) {
      finishMission(GAME.pendingState === 'gameover' ? false : true);
    }
  }
  if (!mission) return;
  if (GAME.state === 'playing' && !mission.complete && !mission.failed) {
    GAME.missionTime += dt;
  }
  if (mission.escort && mission.transport && !mission.transport.dead && !mission.escortDone) {
    updateTransport(dt);
  }
  if (mission.complete && !mission.completeShown) {
    mission.completeShown = true;
    GAME.pendingState = 'complete';
    GAME.pendingTimer = 1.8;
  }
  if (mission.failed && !mission.failedShown) {
    mission.failedShown = true;
  }
}

function finishMission(success) {
  if (success) {
    const def = mission.def;
    let timeBonus = 0;
    if (!mission.endless) {
      timeBonus = Math.max(0, Math.round((def.timeBonus || 300) - GAME.missionTime * 2.2));
    }
    GAME.score += timeBonus;
    const acc = GAME.shotsFired > 0 ? GAME.shotsHit / GAME.shotsFired : 0;
    let rank = 'C';
    const dmgRatio = GAME.damageTaken / 100;
    if (dmgRatio <= 0.22 && GAME.missionTime <= 200 && acc >= 0.3) rank = 'S';
    else if (dmgRatio <= 0.45 && GAME.missionTime <= 280) rank = 'A';
    else if (dmgRatio <= 0.8) rank = 'B';
    GAME.endStats = {
      success: true,
      time: GAME.missionTime,
      kills: GAME.kills,
      accuracy: acc,
      damage: GAME.damageTaken,
      score: GAME.score,
      timeBonus: timeBonus,
      rank: rank,
      missionName: def.name,
      code: def.code
    };
  } else {
    GAME.endStats = {
      success: false,
      time: GAME.missionTime,
      kills: GAME.kills,
      accuracy: GAME.shotsFired > 0 ? GAME.shotsHit / GAME.shotsFired : 0,
      damage: GAME.damageTaken,
      score: GAME.score,
      rank: '-',
      missionName: mission.def.name,
      code: mission.def.code
    };
  }
  if (success) {
    setState(mission.endless ? 'gameover' : 'complete');
  } else {
    setState('gameover');
  }
}

// ---------- state ----------
function setState(s) {
  GAME.state = s;
  menuButtons = [];
  if (s === 'title' || s === 'briefing' || s === 'complete' || s === 'gameover' || s === 'paused' || s === 'settings') {
    buildMenuButtons(s);
  }
}

function buildMenuButtons(state) {
  const cx = W / 2;
  const bw = Math.min(360, W * 0.72);
  const bh = 54;
  let top = 0;
  if (state === 'title') {
    menuButtons = [
      { x: cx - bw / 2, y: H * 0.60, w: bw, h: bh, label: '战役模式', action: () => { AudioSys.click(); GAME.mode = 'campaign'; startTransition(() => { GAME.missionIndex = 0; setState('briefing'); }); }, primary: true },
      { x: cx - bw / 2, y: H * 0.60 + bh + 14, w: bw, h: bh, label: '自由出击', action: () => { AudioSys.click(); GAME.mode = 'endless'; startTransition(() => startEndless()); } },
      { x: cx - bw / 2, y: H * 0.60 + (bh + 14) * 2, w: bw, h: bh, label: '按键设置', action: () => { AudioSys.click(); settingsReturn = 'title'; setState('settings'); } }
    ];
  } else if (state === 'briefing') {
    menuButtons = [
      { x: cx - bw / 2, y: H * 0.72, w: bw, h: bh, label: '出击', action: () => { AudioSys.click(); startTransition(() => startMission(GAME.missionIndex, GAME.mode)); }, primary: true },
      { x: cx - bw / 2, y: H * 0.72 + bh + 14, w: bw, h: bh, label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { GAME.mode = 'campaign'; setState('title'); }); } }
    ];
  } else if (state === 'complete') {
    const isLast = GAME.missionIndex >= MISSION_DEFS.length - 1;
    if (isLast) {
      menuButtons = [
        { x: cx - bw / 2, y: H * 0.78, w: bw, h: bh, label: '自由出击', action: () => { AudioSys.click(); startTransition(() => startEndless()); }, primary: true },
        { x: cx - bw / 2, y: H * 0.78 + bh + 14, w: bw, h: bh, label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
      ];
    } else {
      menuButtons = [
        { x: cx - bw / 2, y: H * 0.78, w: bw, h: bh, label: '下一任务', action: () => { AudioSys.click(); startTransition(() => { GAME.missionIndex++; setState('briefing'); }); }, primary: true },
        { x: cx - bw / 2, y: H * 0.78 + bh + 14, w: bw, h: bh, label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
      ];
    }
  } else if (state === 'gameover') {
    const retryLabel = GAME.mode === 'endless' ? '再战一轮' : '重新出击';
    menuButtons = [
      { x: cx - bw / 2, y: H * 0.78, w: bw, h: bh, label: retryLabel, action: () => { AudioSys.click(); if (GAME.mode === 'endless') startTransition(() => startEndless()); else startTransition(() => startMission(GAME.missionIndex, 'campaign')); }, primary: true },
      { x: cx - bw / 2, y: H * 0.78 + bh + 14, w: bw, h: bh, label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
    ];
  } else if (state === 'paused') {
    menuButtons = [
      { x: cx - bw / 2, y: H * 0.52, w: bw, h: bh, label: '继续战斗', action: () => { AudioSys.click(); setState('playing'); }, primary: true },
      { x: cx - bw / 2, y: H * 0.52 + bh + 14, w: bw, h: bh, label: '重新开始任务', action: () => { AudioSys.click(); startTransition(() => { if (GAME.mode === 'endless') startEndless(); else startMission(GAME.missionIndex, 'campaign'); }); } },
      { x: cx - bw / 2, y: H * 0.52 + (bh + 14) * 2, w: bw, h: bh, label: '按键设置', action: () => { AudioSys.click(); settingsReturn = 'paused'; setState('settings'); } },
      { x: cx - bw / 2, y: H * 0.52 + (bh + 14) * 3, w: bw, h: bh, label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
    ];
  } else if (state === 'settings') {
    menuButtons = [
      { x: cx - bw / 2, y: H * 0.88, w: bw * 0.48, h: bh, label: '恢复默认', action: () => { AudioSys.click(); keybinds = Object.assign({}, DEFAULT_BINDS); saveKeybinds(); }, primary: false },
      { x: cx + 18, y: H * 0.88, w: bw * 0.48 - 18, h: bh, label: '返回', action: () => { AudioSys.click(); setState(settingsReturn || 'title'); } }
    ];
  }
  top = 0;
  void top;
}

function settingsLayout() {
  const rowW = Math.min(560, W * 0.9);
  const rowX = W / 2 - rowW / 2;
  const rowH = Math.max(34, Math.min(46, (H * 0.66) / SETTINGS_ACTIONS.length));
  const startY = H * 0.12;
  return { rowW, rowX, rowH, startY };
}

function settingsRowAt(x, y) {
  const L = settingsLayout();
  if (x < L.rowX || x > L.rowX + L.rowW) return null;
  const idx = Math.floor((y - L.startY) / L.rowH);
  if (idx < 0 || idx >= SETTINGS_ACTIONS.length) return null;
  const rowY = L.startY + idx * L.rowH;
  if (y < rowY || y > rowY + L.rowH) return null;
  return SETTINGS_ACTIONS[idx];
}

function startBindCapture(action) {
  captureBind = action;
  AudioSys.click();
}

function completeBindCapture(code) {
  if (!captureBind) return;
  keybinds[captureBind] = code;
  captureBind = null;
  saveKeybinds();
  AudioSys.click();
}

function handleSettingsPress(x, y) {
  for (const b of menuButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.action();
      return true;
    }
  }
  const row = settingsRowAt(x, y);
  if (row) {
    startBindCapture(row.action);
    return true;
  }
  return false;
}

function drawSettings() {
  ctx.fillStyle = 'rgba(4,10,18,0.94)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(34, W * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('按键设置', W / 2, H * 0.065);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('点击动作后按下新按键；支持键盘、鼠标左/中/右键；Esc 取消本次修改', W / 2, H * 0.095);
  const L = settingsLayout();
  for (let i = 0; i < SETTINGS_ACTIONS.length; i++) {
    const row = SETTINGS_ACTIONS[i];
    const y = L.startY + i * L.rowH;
    const active = captureBind === row.action;
    ctx.fillStyle = active ? 'rgba(35,70,105,0.95)' : 'rgba(14,32,52,0.85)';
    ctx.strokeStyle = active ? '#ffd166' : 'rgba(140,180,210,0.5)';
    ctx.lineWidth = active ? 2.5 : 1.2;
    roundRect(L.rowX, y, L.rowW, L.rowH - 6, 7);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#ffd166' : '#dfe9f2';
    ctx.font = '600 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(row.label, L.rowX + 18, y + L.rowH * 0.62);
    ctx.textAlign = 'right';
    ctx.fillStyle = active ? '#9be3ff' : '#7fd4ff';
    ctx.fillText(active ? '请按键...' : prettyKey(bindFor(row.action)), L.rowX + L.rowW - 18, y + L.rowH * 0.62);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function handleCanvasPress(x, y) {
  if (transition.active) return false;
  if (GAME.state === 'settings') return handleSettingsPress(x, y);
  if (upgradeChoice && GAME.state === 'playing') {
    const c = upgradeChoice;
    const bw = Math.min(720, W * 0.9);
    const bx = W / 2 - bw / 2, by = H * 0.24;
    const cardW = Math.min(200, (bw - 80) / 3);
    const cardH = 130;
    const gap = Math.min(16, (bw - cardW * 3) / 4);
    let cx = bx + gap;
    for (let i = 0; i < c.options.length; i++) {
      if (x >= cx && x <= cx + cardW && y >= by + 110 && y <= by + 110 + cardH) {
        applyUpgrade(c.options[i]);
        return true;
      }
      cx += cardW + gap;
    }
    return false;
  }
  if (GAME.state === 'playing') return false;
  for (const b of menuButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.action();
      return true;
    }
  }
  if (GAME.state === 'title') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  } else if (GAME.state === 'briefing' || GAME.state === 'complete' || GAME.state === 'gameover') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  } else if (GAME.state === 'paused') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  }
  return false;
}

function handleConfirmKey() {
  if (transition.active) return;
  if (GAME.state === 'playing') return;
  if (GAME.state === 'settings') return;
  if (menuButtons.length) menuButtons[0].action();
}

function startTransition(cb) {
  transition = { active: true, alpha: 0, dir: 1, cb: cb };
}

function updateTransition(dt) {
  if (!transition.active) return;
  transition.alpha += transition.dir * dt * 1.7;
  if (transition.alpha >= 1) {
    transition.alpha = 1;
    transition.dir = -1;
    if (transition.cb) { const cb = transition.cb; transition.cb = null; cb(); }
  } else if (transition.alpha <= 0) {
    transition.active = false;
    transition.alpha = 0;
  }
}

// ---------- camera ----------
function updateCamera(dt) {
  const tx = player.x + Math.cos(player.heading) * player.speed * 0.12;
  const ty = player.y + Math.sin(player.heading) * player.speed * 0.12;
  const k = 1 - Math.exp(-dt * 5);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const targetZoom = Math.min(W, H) < 700 ? 0.9 : 1;
  cam.zoom = lerp(cam.zoom, targetZoom, dt * 2);
  cam.shake = Math.max(0, cam.shake - dt * 34);
  if (cam.shake > 0.2) {
    cam.shakeX = rand(-1, 1) * cam.shake * 0.5;
    cam.shakeY = rand(-1, 1) * cam.shake * 0.5;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}

// ---------- drawing ----------
function drawWater(theme) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.waterTop);
  g.addColorStop(1, theme.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme.wave;
  ctx.lineWidth = 1;
  const step = 46;
  for (let y = -40; y < H + 60; y += step) {
    const wy = y + gameTime * 8 % step;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 24) {
      const yy = wy + Math.sin(x * 0.012 + gameTime * 1.4 + wy) * 4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function drawIslandPoly(pts, fill) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawIslands() {
  const viewR = Math.hypot(W, H) / cam.zoom + 500;
  for (const isl of world.islands) {
    if (Math.abs(isl.cx - cam.x) > viewR || Math.abs(isl.cy - cam.y) > viewR) continue;
    const t = world.theme;
    const sand = isl.pts.map(p => ({ x: p.x * 1.045, y: p.y * 1.045 }));
    drawIslandPoly(sand, t.sand);
    drawIslandPoly(isl.pts, t.grass);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const r = seeded(Math.floor(isl.seed * 10000));
    const treeN = Math.floor(isl.rad / 55) + 3;
    for (let i = 0; i < treeN; i++) {
      const a = r() * TAU, rr = r() * isl.rad * 0.7;
      const tx = isl.cx + Math.cos(a) * rr, ty = isl.cy + Math.sin(a) * rr;
      ctx.fillStyle = t.tree;
      ctx.beginPath();
      ctx.arc(tx, ty, rand(7, 14), 0, TAU);
      ctx.fill();
    }
    if (isl.city && t.city) {
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, rr = r() * isl.rad * 0.72;
        const bx = isl.cx + Math.cos(a) * rr, by = isl.cy + Math.sin(a) * rr;
        ctx.fillStyle = t.city;
        ctx.globalAlpha = rand(0.35, 0.95);
        ctx.fillRect(bx, by, 5, 5);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawClouds() {
  const viewR = Math.hypot(W, H) / cam.zoom + 500;
  for (const c of world.clouds) {
    if (Math.abs(c.x - cam.x) > viewR || Math.abs(c.y - cam.y) > viewR) continue;
    const x = c.x + gameTime * c.drift;
    const g = ctx.createRadialGradient(x, c.y, 0, x, c.y, c.r);
    g.addColorStop(0, world.theme.cloud);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = c.alpha;
    ctx.beginPath();
    ctx.ellipse(x, c.y, c.r * 1.7, c.r * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawSun() {
  const t = world.theme;
  const sx = W * 0.78, sy = H * 0.16;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 220);
  g.addColorStop(0, t.sun);
  g.addColorStop(0.25, t.sunGlow);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, 220, 0, TAU);
  ctx.fill();
  ctx.fillStyle = t.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, 34, 0, TAU);
  ctx.fill();
}

function drawPlaneShape(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  if (p.kind === 'player' && p.rollActive) {
    const wing = Math.cos((p.rollT / p.rollDur) * TAU * p.rollDir);
    ctx.scale(1, Math.abs(wing) > 0.03 ? wing : 0.03);
  }
  ctx.scale(p.kind === 'transport' ? 1.25 : 1, 1);
  if (p.kind === 'player') {
    drawPlayerJet(p);
  } else if (p.kind === 'transport') {
    drawTransportJet(p);
  } else if (p.kind === 'bomber') {
    drawBomberJet(p);
  } else if (p.kind === 'ace') {
    drawAceJet(p);
  } else {
    drawFighterJet(p);
  }
  ctx.restore();
}

function drawWreckShape(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  ctx.scale(p.kind === 'transport' ? 1.25 : 1, 1);
  if (p.kind === 'transport') drawTransportJet(p);
  else if (p.kind === 'bomber') drawBomberJet(p);
  else if (p.kind === 'ace') drawAceJet(p);
  else drawFighterJet(p);

  const rnd = (salt) => {
    const x = Math.sin((p.seed + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const chunk = (cx, cy, radius, rot, salt) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + (rnd(salt) - 0.5) * 0.8);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const pts = 5 + Math.floor(rnd(salt + 9) * 3);
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const rr = radius * (0.55 + rnd(salt + i) * 0.75);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  ctx.globalCompositeOperation = 'destination-out';
  chunk(-13, -19, 13, 0.18, 1);
  chunk(-10, 20, 12, -0.22, 2);
  chunk(-2, 0, 8, 0.55, 3);
  if (rnd(4) > 0.35) chunk(25, 0, 8, -0.35, 4);
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(12,14,17,0.55)';
  ctx.beginPath();
  ctx.ellipse(-4, -2, 13, 3.5, 0.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(24,28,33,0.45)';
  ctx.beginPath();
  ctx.ellipse(10, 0, 8, 4, -0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,8,10,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-20, -10); ctx.lineTo(-8, -6); ctx.lineTo(2, -9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-14, 14); ctx.lineTo(-4, 8); ctx.lineTo(8, 12);
  ctx.stroke();
  ctx.restore();
}

function drawPlayerJet(p) {
  if (p.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(gameTime * 40) * 0.3;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const speedRatio = (p.speed - CFG.minSpeed) / (CFG.maxSpeed + CFG.abSpeed - CFG.minSpeed);
  const flame = p.afterburn ? 34 : 14 + speedRatio * 22;
  const fg = ctx.createLinearGradient(-46, 0, -14, 0);
  fg.addColorStop(0, 'rgba(255,120,40,0)');
  fg.addColorStop(0.55, '#ff9f43');
  fg.addColorStop(1, '#fff7c0');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-42, -5);
  ctx.lineTo(-42 - flame, 0);
  ctx.lineTo(-42, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.afterburn ? '#bfe3ff' : '#9db8c9';
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.lineTo(10, -5);
  ctx.lineTo(2, -8);
  ctx.lineTo(-10, -24);
  ctx.lineTo(-20, -26);
  ctx.lineTo(-28, -14);
  ctx.lineTo(-26, -4);
  ctx.lineTo(-38, -10);
  ctx.lineTo(-42, -17);
  ctx.lineTo(-44, -4);
  ctx.lineTo(-44, 4);
  ctx.lineTo(-42, 17);
  ctx.lineTo(-38, 10);
  ctx.lineTo(-26, 4);
  ctx.lineTo(-28, 14);
  ctx.lineTo(-20, 26);
  ctx.lineTo(-10, 24);
  ctx.lineTo(2, 8);
  ctx.lineTo(10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1d2b38';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#2c4356';
  ctx.beginPath();
  ctx.ellipse(11, 0, 9, 4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#66d9ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(18, 0, 3, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#e63e3e';
  ctx.fillRect(-6, -18, 3, 8);
  ctx.fillRect(-6, 10, 3, 8);
}

function drawFighterJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(4, -6);
  ctx.lineTo(-6, -17);
  ctx.lineTo(-15, -19);
  ctx.lineTo(-19, -9);
  ctx.lineTo(-15, -4);
  ctx.lineTo(-27, -8);
  ctx.lineTo(-31, -12);
  ctx.lineTo(-31, 12);
  ctx.lineTo(-27, 8);
  ctx.lineTo(-15, 4);
  ctx.lineTo(-19, 9);
  ctx.lineTo(-15, 19);
  ctx.lineTo(-6, 17);
  ctx.lineTo(4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a1518';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#8f2f2c';
  ctx.beginPath();
  ctx.arc(8, 0, 4, 0, TAU);
  ctx.fill();
}

function drawGunnerJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(4, -7);
  ctx.lineTo(-8, -22);
  ctx.lineTo(-18, -24);
  ctx.lineTo(-20, -10);
  ctx.lineTo(-16, -4);
  ctx.lineTo(-26, -7);
  ctx.lineTo(-28, -12);
  ctx.lineTo(-28, 12);
  ctx.lineTo(-26, 7);
  ctx.lineTo(-16, 4);
  ctx.lineTo(-20, 10);
  ctx.lineTo(-18, 24);
  ctx.lineTo(-8, 22);
  ctx.lineTo(4, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4a2a12';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawBomberJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(8, -8);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-22, -26);
  ctx.lineTo(-38, -30);
  ctx.lineTo(-40, -14);
  ctx.lineTo(-30, -9);
  ctx.lineTo(-30, 9);
  ctx.lineTo(-40, 14);
  ctx.lineTo(-38, 30);
  ctx.lineTo(-22, 26);
  ctx.lineTo(-14, 10);
  ctx.lineTo(8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2c3338';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#5b6368';
  ctx.fillRect(-38, -3, 8, 6);
  ctx.fillStyle = '#394248';
  ctx.beginPath();
  ctx.arc(10, 0, 5, 0, TAU);
  ctx.fill();
}

function drawAceJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(10, -5);
  ctx.lineTo(4, -9);
  ctx.lineTo(-12, -24);
  ctx.lineTo(-22, -25);
  ctx.lineTo(-28, -12);
  ctx.lineTo(-24, -4);
  ctx.lineTo(-36, -8);
  ctx.lineTo(-40, -15);
  ctx.lineTo(-42, -3);
  ctx.lineTo(-42, 3);
  ctx.lineTo(-40, 15);
  ctx.lineTo(-36, 8);
  ctx.lineTo(-24, 4);
  ctx.lineTo(-28, 12);
  ctx.lineTo(-22, 25);
  ctx.lineTo(-12, 24);
  ctx.lineTo(4, 9);
  ctx.lineTo(10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a0f0c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(-16, -4); ctx.lineTo(-16, 4); ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(12, 0, 3.5, 0, TAU);
  ctx.fill();
}

function drawTransportJet(p) {
  ctx.fillStyle = '#8fa3ad';
  ctx.beginPath();
  ctx.moveTo(52, 0);
  ctx.lineTo(20, -9);
  ctx.lineTo(-18, -11);
  ctx.lineTo(-30, -30);
  ctx.lineTo(-52, -33);
  ctx.lineTo(-56, -16);
  ctx.lineTo(-42, -12);
  ctx.lineTo(-42, 12);
  ctx.lineTo(-56, 16);
  ctx.lineTo(-52, 33);
  ctx.lineTo(-30, 30);
  ctx.lineTo(-18, 11);
  ctx.lineTo(20, 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#283238';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#5f727c';
  ctx.fillRect(-44, -5, 10, 10);
  ctx.fillStyle = '#d8e8ef';
  ctx.beginPath();
  ctx.arc(16, 0, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#48d06b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 26, -0.6, 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#48d06b';
  ctx.beginPath();
  ctx.arc(0, 0, 26, Math.PI - 0.6, Math.PI + 0.6);
  ctx.stroke();
}

function drawLockIndicator() {
  const t = player.target;
  if (!t || t.dead || !player.alive) return;
  const d = dist(player.x, player.y, t.x, t.y);
  if (d > CFG.lockRange + 150) return;
  const s = 30 + (t.r || 20) * 0.6;
  ctx.strokeStyle = player.lock >= CFG.lockTime ? '#ff4d4d' : '#7fd4ff';
  ctx.lineWidth = 2;
  const blink = player.lock >= CFG.lockTime ? 1 : 0.75 + Math.sin(gameTime * 18) * 0.25;
  ctx.globalAlpha = blink;
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(t.x + cx * s, t.y + cy * s);
    ctx.lineTo(t.x + cx * s - cx * 9, t.y + cy * s);
    ctx.lineTo(t.x + cx * s, t.y + cy * s - cy * 9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (player.lock < CFG.lockTime) {
    ctx.strokeStyle = '#7fd4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, s + 10, -Math.PI / 2, -Math.PI / 2 + (player.lock / CFG.lockTime) * TAU);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(t.x, t.y, s + 10, 0, TAU);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    const lifeRatio = p.life / p.maxLife;
    if (p.type === 'fire') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = lifeRatio * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.4 - lifeRatio * 0.4), 0, TAU);
      ctx.fill();
    } else if (p.type === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'ring') {
      const rr = p.size * (1.6 - lifeRatio);
      ctx.globalAlpha = lifeRatio;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.5 - lifeRatio * 0.5), 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'text') {
      ctx.globalAlpha = Math.min(1, lifeRatio * 2);
      ctx.font = '700 ' + p.size + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(p.text, p.x, p.y);
      ctx.shadowBlur = 0;
    } else if (p.type === 'debris') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.3 + 0.7 * lifeRatio;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(8,12,18,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < p.verts.length; i++) {
        if (i === 0) ctx.moveTo(p.verts[i].x, p.verts[i].y);
        else ctx.lineTo(p.verts[i].x, p.verts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'fire' || p.type === 'smoke') {
      p.vx *= 1 - dt * 1.6;
      p.vy *= 1 - dt * 1.6;
    }
    if (p.type === 'debris') {
      p.rot += p.rotSpeed * dt;
      p.vy += 130 * dt;
      p.vx *= 1 - dt * 0.7;
      p.vy *= 1 - dt * 0.35;
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawBullets() {
  for (const b of bullets) {
    ctx.strokeStyle = b.fromPlayer ? '#ffe9a0' : '#ff6b5e';
    ctx.lineWidth = 3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawMissiles() {
  for (const m of missiles) {
    const dirx = Math.cos(m.heading), diry = Math.sin(m.heading);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.heading);
    ctx.fillStyle = m.enemy ? '#ffb066' : '#d8e9ff';
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    void dirx; void diry;
  }
}

function drawPickups() {
  for (const p of pickups) {
    const bob = Math.sin(p.t * 4) * 4;
    let color, label, size = 14;
    if (p.type === 'weapon') {
      color = QUALITY_COLOR[p.quality];
      label = p.id === 'laser' ? '激' : p.id === 'rocket' ? '火' : p.id === 'plasma' ? '能' : p.id === 'scatter' ? '散' : p.id === 'heavy' ? '重' : '穿';
    } else if (p.type === 'move') {
      color = '#9be3ff';
      label = '突';
    } else if (p.type === 'supply') {
      color = DROP_SUPPLIES[p.supply] ? DROP_SUPPLIES[p.supply].color : '#ffffff';
      label = p.supply === 'repair' ? '修' : p.supply === 'missiles' ? '弹' : '分';
    } else {
      color = '#dfe9f2';
      label = '?';
    }
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.t * 0.8);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1c2430';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-p.t * 0.8);
    ctx.fillStyle = '#101820';
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}

function drawWorld() {
  drawWater(world.theme);
  drawSun();
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);
  drawIslands();
  drawClouds();
  for (const a of allies) drawPlaneShape(a);
  for (const e of enemies) {
    ctx.save();
    if (e.dead) {
      ctx.globalAlpha = e.wreckDone ? Math.max(0, 1 - e.wreckFade) : 0.96;
      ctx.filter = e.wreckDone ? 'grayscale(0.85) brightness(0.55)' : 'grayscale(0.4) brightness(0.8)';
    }
    if (e.dead) drawWreckShape(e);
    else drawPlaneShape(e);
    ctx.restore();
  }
  drawPickups();
  drawBullets();
  drawMissiles();
  if (player.alive) drawPlaneShape(player);
  drawLockIndicator();
  drawParticles();
  ctx.restore();
  ctx.fillStyle = world.theme.haze;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHudBar(x, y, w, h, ratio, fill, back, label, value) {
  ctx.fillStyle = back || 'rgba(8,14,22,0.72)';
  roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(x, y, Math.max(0, w * clamp(ratio, 0, 1)), h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, 4);
  ctx.stroke();
  if (label) {
    ctx.font = '600 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#dfe9f2';
    ctx.fillText(label, x + 7, y + h - 7);
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w - 7, y + h - 7);
  }
}

function drawHUD() {
  if (GAME.state !== 'playing' && GAME.state !== 'paused') return;
  const m = mission;
  const t = world.theme;
  const pad = 16;
  const hudScale = Math.min(1, Math.max(0.8, Math.min(W, H) / 900));

  // top-left mission panel
  ctx.fillStyle = 'rgba(6,14,24,0.58)';
  roundRect(pad, pad, 288 * hudScale, 84 * hudScale, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  roundRect(pad, pad, 288 * hudScale, 84 * hudScale, 8);
  ctx.stroke();
  ctx.font = '700 ' + Math.round(14 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(m.def.code, pad + 12, pad + 22 * hudScale);
  ctx.font = '600 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#eef4f8';
  ctx.fillText('目标：' + m.def.objective, pad + 12, pad + 44 * hudScale);
  let prog = 0;
  if (m.escort && m.transport) {
    const wp = m.transport.waypoints[m.transport.waypoints.length - 1];
    const start = m.transport.waypoints[0];
    const total = dist(start.x, start.y, wp.x, wp.y);
    const cur = dist(start.x, start.y, m.transport.x, m.transport.y);
    prog = clamp(cur / total, 0, 1);
  } else if (m.boss) {
    prog = m.boss && !m.boss.dead ? 1 - m.boss.hp / m.boss.maxHp : 1;
  } else {
    prog = m.spawned > 0 ? (m.spawned - enemies.filter(e => !e.dead).length) / m.total : 0;
  }
  drawHudBar(pad + 12, pad + 56 * hudScale, 264 * hudScale, 14 * hudScale, prog, '#48c774', 'rgba(255,255,255,0.12)', '', '');
  ctx.font = '600 ' + Math.round(10 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#aebecd';
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(prog * 100) + '%', pad + 276 * hudScale, pad + 67 * hudScale);

  // top-right score
  ctx.textAlign = 'right';
  ctx.font = '700 ' + Math.round(22 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.fillText(fmt(GAME.score), W - pad, pad + 28 * hudScale);
  ctx.shadowBlur = 0;
  ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#dfe9f2';
  ctx.fillText('击坠 ' + GAME.kills, W - pad, pad + 48 * hudScale);

  // mission time
  ctx.textAlign = 'center';
  ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#aebecd';
  const mm = Math.floor(GAME.missionTime / 60);
  const ss = Math.floor(GAME.missionTime % 60);
  ctx.fillText('任务时间 ' + mm + ':' + (ss < 10 ? '0' : '') + ss, W / 2, pad + 22 * hudScale);

  // transport hp when escorting
  if (m.escort && m.transport && !m.transport.dead) {
    const bw = 300 * hudScale;
    drawHudBar(W / 2 - bw / 2, pad + 34 * hudScale, bw, 14 * hudScale, m.transport.hp / m.transport.maxHp, '#4ecb71', 'rgba(8,14,22,0.72)', '铁鸟 机身', Math.round(m.transport.hp) + '/' + m.transport.maxHp);
  }

  // bottom-left status
  const blX = pad, blY = H - pad - 108 * hudScale;
  ctx.fillStyle = 'rgba(6,14,24,0.58)';
  roundRect(blX, blY, 262 * hudScale, 96 * hudScale, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  roundRect(blX, blY, 262 * hudScale, 96 * hudScale, 8);
  ctx.stroke();
  drawHudBar(blX + 12, blY + 12, 238 * hudScale, 16 * hudScale, player.hp / player.maxHp, player.hp > 35 ? '#48c774' : '#ff5252', 'rgba(255,255,255,0.12)', '机体完整度', Math.ceil(player.hp) + '%');
  ctx.fillStyle = '#7fd4ff';
  ctx.font = '700 ' + Math.round(17 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('导弹 ' + player.missiles, blX + 12, blY + 56 * hudScale);
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('速度 ' + Math.round(player.speed) + ' km/h', blX + 12, blY + 76 * hudScale);
  ctx.textAlign = 'right';
  ctx.fillText('高度 ' + Math.round(12000 - player.hp * 30) + ' m', blX + 250 * hudScale, blY + 76 * hudScale);

  // throttle gauge
  ctx.save();
  ctx.translate(blX + 12, blY + 88 * hudScale);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(0, 0, 238 * hudScale, 5, 2);
  ctx.fill();
  const thrFill = player.afterburn ? '#ff9f43' : '#66d9ff';
  ctx.fillStyle = thrFill;
  roundRect(0, 0, 238 * hudScale * clamp(player.throttle + (player.afterburn ? 0.3 : 0), 0, 1), 5, 2);
  ctx.fill();
  ctx.restore();

  // bottom-right radar
  const radarR = Math.max(92, Math.min(W, H) * 0.145);
  const rx = W - pad - radarR;
  const ry = input.isTouch ? Math.max(pad + radarR + 44, H * 0.34) : H - pad - radarR;
  ctx.fillStyle = 'rgba(6,14,24,0.58)';
  ctx.beginPath();
  ctx.arc(rx, ry, radarR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(rx, ry, radarR, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rx, ry, radarR * 0.55, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx - radarR, ry); ctx.lineTo(rx + radarR, ry);
  ctx.moveTo(rx, ry - radarR); ctx.lineTo(rx, ry + radarR);
  ctx.stroke();
  const sweep = gameTime * 2.2;
  ctx.strokeStyle = 'rgba(102,217,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(sweep) * radarR * 0.96, ry + Math.sin(sweep) * radarR * 0.96);
  ctx.stroke();
  const scale = radarR * 0.85 / 1700;
  function blip(x, y, color, size, shape) {
    const dx = clamp((x - player.x) * scale, -radarR + 6, radarR - 6);
    const dy = clamp((y - player.y) * scale, -radarR + 6, radarR - 6);
    ctx.fillStyle = color;
    if (shape === 'square') {
      ctx.fillRect(rx + dx - size / 2, ry + dy - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(rx + dx, ry + dy, size, 0, TAU);
      ctx.fill();
    }
  }
  for (const a of allies) if (!a.dead) blip(a.x, a.y, '#4ecb71', 5, 'square');
  for (const e of enemies) if (!e.dead) blip(e.x, e.y, e === player.target ? '#ff4d4d' : '#ff8a5c', e.kind === 'bomber' || e.kind === 'ace' ? 6 : 4.5);
  for (const p of pickups) blip(p.x, p.y, '#54c7ff', 3.5);
  blip(player.x, player.y, '#ffffff', 4);
  ctx.font = '600 ' + Math.round(10 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#aebecd';
  ctx.fillText('雷达', rx, ry + radarR + 14 * hudScale);

  if (GAME.mode === 'endless') {
    // level / exp bar / combo
    const ew = Math.min(360, W * 0.5);
    const ex = W / 2 - ew / 2;
    const ey = pad + 52 * hudScale;
    ctx.fillStyle = 'rgba(6,14,24,0.58)';
    roundRect(ex - 8, ey - 18, ew + 16, 42 * hudScale, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    roundRect(ex - 8, ey - 18, ew + 16, 42 * hudScale, 8);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('Lv.' + GAME.level, ex, ey);
    drawHudBar(ex + 44, ey - 7, ew - 50, 12 * hudScale, GAME.exp / expNeeded(GAME.level), '#9be3ff', 'rgba(255,255,255,0.12)', '', Math.floor(GAME.exp / expNeeded(GAME.level) * 100) + '%');
    if (GAME.combo > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 ' + Math.round(14 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('连杀 ×' + GAME.combo + '  ' + GAME.comboTimer.toFixed(1) + 's', ex + ew + 8, ey + 2);
    }
    // current weapon
    const w = player.weapon || defaultWeapon();
    const wcol = QUALITY_COLOR[w.quality] || '#dfe9f2';
    ctx.fillStyle = 'rgba(6,14,24,0.58)';
    roundRect(ex - 8, ey + 28, ew + 16, 24, 6);
    ctx.fill();
    ctx.fillStyle = wcol;
    ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('武器 ' + QUALITY_NAME[w.quality] + ' ' + w.name, ex, ey + 45);
    ctx.textAlign = 'right';
    ctx.fillText(w.limited ? '弹药 ' + w.ammo : '无限', ex + ew + 8, ey + 45);
    // dash cooldown
    if (GAME.dash) {
      ctx.fillStyle = '#9be3ff';
      ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('突进 ' + (player.dashCd > 0 ? player.dashCd.toFixed(1) + 's' : '就绪'), W - pad, H - pad - 30 * hudScale);
    }
  }

  // lock progress / missile warning center
  if (player.target && !player.target.dead && player.lock > 0.05) {
    ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = player.lock >= CFG.lockTime ? '#ff4d4d' : '#7fd4ff';
    const lockPct = Math.round(player.lock / CFG.lockTime * 100);
    ctx.fillText('LOCK ' + Math.min(100, lockPct) + '%', W / 2, H - 60 * hudScale);
  }

  if (player.rollActive || player.rollCd > 0) {
    ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = player.rollActive ? '#9be3ff' : '#aebecd';
    ctx.fillText(player.rollActive ? '滚筒中 · 导弹引导减弱' : '滚筒 ' + player.rollCd.toFixed(1) + 's', W / 2, H - 40 * hudScale);
  }

  // incoming missile warning
  let closestMsl = null, cd = 1e9;
  for (const m of missiles) {
    if (!m.enemy) continue;
    const d = dist(m.x, m.y, player.x, player.y);
    if (d < cd) { cd = d; closestMsl = m; }
  }
  if (closestMsl && cd < 640 && player.alive) {
    const flash = Math.sin(gameTime * 14) > -0.4;
    if (flash) {
      ctx.fillStyle = 'rgba(255,45,45,0.9)';
      ctx.font = '900 ' + Math.round(26 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 16;
      ctx.fillText('导弹来袭', W / 2, H * 0.3);
      ctx.shadowBlur = 0;
    }
  }

  // damage vignette
  const dmgAlpha = clamp((100 - player.hp) / 100 * 0.55 + player.hitFlash * 0.7, 0, 0.75);
  if (dmgAlpha > 0.02) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(255,20,20,0)');
    g.addColorStop(1, 'rgba(255,20,20,' + dmgAlpha.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // controls hint
  if (GAME.hintTimer > 0 && GAME.state === 'playing') {
    GAME.hintTimer -= 1 / 60;
    const a = clamp(GAME.hintTimer, 0, 1);
    ctx.globalAlpha = a * 0.85;
    ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f1f7';
    if (input.isTouch) {
      ctx.fillText('左区机炮 · 右区导弹 · 中区滚筒', W / 2, H - 24);
    } else {
      ctx.fillText(GAME.mode === 'endless'
        ? '鼠标瞄准 · ' + prettyKey(bindFor('gun')) + ' 机炮 · ' + prettyKey(bindFor('missile')) + ' 导弹 · ' + prettyKey(bindFor('dash')) + ' 突进 · ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒 · ' + prettyKey(bindFor('pause')) + ' 暂停'
        : '鼠标瞄准 · ' + prettyKey(bindFor('gun')) + ' 机炮 · ' + prettyKey(bindFor('missile')) + ' 导弹 · ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒 · ' + prettyKey(bindFor('afterburn')) + ' 加力 · ' + prettyKey(bindFor('pause')) + ' 暂停', W / 2, H - 24);
    }
    ctx.globalAlpha = 1;
  }
  if (input.isTouch && GAME.state === 'playing') {
    ctx.fillStyle = 'rgba(20,34,48,0.75)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(FIRE_RECT.x, FIRE_RECT.y, FIRE_RECT.w, FIRE_RECT.h, 10);
    ctx.fill(); ctx.stroke();
    roundRect(MSL_RECT.x, MSL_RECT.y, MSL_RECT.w, MSL_RECT.h, 10);
    ctx.fill(); ctx.stroke();
    roundRect(ROLL_RECT.x, ROLL_RECT.y, ROLL_RECT.w, ROLL_RECT.h, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(16 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('机炮', FIRE_RECT.x + FIRE_RECT.w / 2, FIRE_RECT.y + FIRE_RECT.h / 2);
    ctx.fillStyle = '#7fd4ff';
    ctx.fillText('导弹', MSL_RECT.x + MSL_RECT.w / 2, MSL_RECT.y + MSL_RECT.h / 2);
    ctx.fillStyle = '#9be3ff';
    ctx.fillText(player.rollCd > 0 ? '冷却' : '滚筒', ROLL_RECT.x + ROLL_RECT.w / 2, ROLL_RECT.y + ROLL_RECT.h / 2);
    ctx.textBaseline = 'alphabetic';
  }
  void t;
}

function drawMenuButton(b, hover) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = b.primary ? 'rgba(255,170,60,0.95)' : 'rgba(16,32,50,0.88)';
  if (hover) ctx.fillStyle = b.primary ? 'rgba(255,190,90,1)' : 'rgba(26,48,72,0.95)';
  roundRect(b.x, b.y, b.w, b.h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = b.primary ? '#ffe1a0' : 'rgba(140,180,210,0.7)';
  ctx.lineWidth = 1.5;
  roundRect(b.x, b.y, b.w, b.h, 8);
  ctx.stroke();
  ctx.fillStyle = b.primary ? '#20242c' : '#eaf2f8';
  ctx.font = '700 ' + Math.round(Math.min(22, b.h * 0.42)) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.restore();
}

function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2540');
  g.addColorStop(0.55, '#124d6e');
  g.addColorStop(1, '#1a6a7d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const time = gameTime;
  for (let i = 0; i < 22; i++) {
    const x = ((i * 137 + time * (8 + i % 5)) % (W + 300)) - 150;
    const y = ((i * 211 + time * (4 + i % 3) * 0.4) % (H + 200)) - 100;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + (i % 3) * 0.03) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, 70 + i * 7 % 90, 24 + i * 5 % 30, 0, 0, TAU);
    ctx.fill();
  }
  const jx = W * 0.24, jy = H * 0.34;
  ctx.save();
  ctx.translate(jx, jy);
  ctx.rotate(-0.35 + Math.sin(time * 0.6) * 0.05);
  ctx.scale(2.2, 2.2);
  drawPlayerJet({ speed: 260, afterburn: true, hitFlash: 0 });
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(255,150,40,0.55)';
  ctx.shadowBlur = 26;
  ctx.font = '900 ' + Math.round(Math.min(76, W * 0.11)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('苍穹之翼', W / 2, H * 0.26);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#bde4f5';
  ctx.font = '600 ' + Math.round(Math.min(18, W * 0.03)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('SKYFIRE ACES  ·  仿皇牌空战风格单机空战', W / 2, H * 0.26 + 34);
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('摧毁敌机 · 锁定导弹 · 完成任务，夺得王牌评价', W / 2, H * 0.26 + 62);

  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);

  ctx.fillStyle = 'rgba(210,230,240,0.75)';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  const lines = [
    '操作：鼠标瞄准 ｜ ' + prettyKey(bindFor('gun')) + ' 机炮 ｜ ' + prettyKey(bindFor('missile')) + ' 导弹 ｜ ' + prettyKey(bindFor('dash')) + ' 突进 ｜ ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒',
    prettyKey(bindFor('throttleUp')) + '/' + prettyKey(bindFor('throttleDown')) + ' 油门 ｜ ' + prettyKey(bindFor('afterburn')) + ' 加力 ｜ ' + prettyKey(bindFor('pause')) + ' 暂停 ｜ ' + prettyKey(bindFor('mute')) + ' 静音'
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, H * 0.86 + i * 24);
  }
  ctx.fillStyle = 'rgba(170,200,215,0.55)';
  ctx.font = '500 ' + Math.round(Math.min(12, W * 0.017)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('点击任意位置开始', W / 2, H * 0.86 + 64);
}

function drawBriefing() {
  const def = MISSION_DEFS[GAME.missionIndex];
  ctx.fillStyle = 'rgba(5,12,22,0.86)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(620, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.12, bh = H * 0.58;
  ctx.fillStyle = 'rgba(10,24,40,0.92)';
  ctx.strokeStyle = 'rgba(120,190,230,0.45)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 ' + Math.round(Math.min(17, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务简报', W / 2, by + 40);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(def.code, W / 2, by + 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 ' + Math.round(Math.min(38, W * 0.055)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(def.name, W / 2, by + 122);
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '500 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  const words = def.brief;
  let line = '';
  let y = by + 168;
  for (const ch of words) {
    line += ch;
    const w = ctx.measureText(line).width;
    if (w > bw - 80 && ch !== '，') {
      ctx.fillText(line, W / 2, y);
      y += 28;
      line = '';
    }
  }
  ctx.fillText(line, W / 2, y);
  y += 44;
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 ' + Math.round(Math.min(16, W * 0.021)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务目标：' + def.objective, W / 2, y);
  y += 34;
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('载弹：机炮 无限 ｜ 导弹 ×' + player.maxMissiles, W / 2, y);
  y += 26;
  ctx.fillText('空域：' + THEMES[def.theme].name, W / 2, y);
  y += 26;
  ctx.fillText('等级评价由时间、损伤与命中率共同决定', W / 2, y);
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawComplete() {
  const s = GAME.endStats;
  if (!s) return;
  ctx.fillStyle = 'rgba(4,10,18,0.88)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(560, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.10, bh = H * 0.58;
  ctx.fillStyle = 'rgba(10,24,40,0.94)';
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(34, W * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务完成', W / 2, by + 52);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(s.code + '  ' + s.missionName, W / 2, by + 84);
  const rankSize = Math.round(Math.min(86, W * 0.12));
  ctx.font = '900 ' + rankSize + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = s.rank === 'S' ? '#ffd166' : (s.rank === 'A' ? '#ff9f43' : '#dfe9f2');
  ctx.shadowColor = 'rgba(255,180,60,0.6)';
  ctx.shadowBlur = 22;
  ctx.fillText('评级 ' + s.rank, W / 2, by + 150);
  ctx.shadowBlur = 0;
  const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
  const rows = [
    ['任务用时', mm + ':' + (ss < 10 ? '0' : '') + ss],
    ['击坠数', s.kills],
    ['命中率', Math.round(s.accuracy * 100) + '%'],
    ['承受损伤', Math.round(s.damage) + '%'],
    ['时间奖励', '+' + fmt(s.timeBonus)],
    ['总得分', fmt(s.score)]
  ];
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  let y = by + 192;
  for (const [k, v] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aebecd';
    ctx.fillText(k, bx + 56, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(v), bx + bw - 56, y);
    y += 30;
  }
  if (GAME.missionIndex >= MISSION_DEFS.length - 1) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(Math.min(18, W * 0.023)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('战役通关！自由出击模式已解锁，挑战极限分数吧。', W / 2, y + 12);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawGameOver() {
  const s = GAME.endStats;
  if (!s) return;
  ctx.fillStyle = 'rgba(16,5,6,0.9)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(560, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.12, bh = H * 0.56;
  ctx.fillStyle = 'rgba(30,10,14,0.94)';
  ctx.strokeStyle = 'rgba(255,90,70,0.55)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6b5e';
  ctx.font = '900 ' + Math.round(Math.min(36, W * 0.048)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(s.success ? '出击结束' : '任务失败', W / 2, by + 54);
  ctx.fillStyle = '#f0b9b4';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(s.code + '  ' + s.missionName, W / 2, by + 86);
  const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
  const rows = [
    ['存活时间', mm + ':' + (ss < 10 ? '0' : '') + ss],
    ['击坠数', s.kills],
    ['命中率', Math.round(s.accuracy * 100) + '%'],
    ['得分', fmt(s.score)]
  ];
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  let y = by + 130;
  for (const [k, v] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8a7a2';
    ctx.fillText(k, bx + 56, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(v), bx + bw - 56, y);
    y += 32;
  }
  if (GAME.mode === 'endless') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(Math.min(17, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('坚持到第 ' + (mission ? mission.waveIndex : 1) + ' 波', W / 2, y + 10);
  } else {
    ctx.fillStyle = '#d8a7a2';
    ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('出击记录已统计，稍作休整后再次升空', W / 2, y + 10);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawPaused() {
  ctx.fillStyle = 'rgba(4,10,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '900 ' + Math.round(Math.min(40, W * 0.05)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('已暂停', W / 2, H * 0.34);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('按 P / Esc 继续战斗', W / 2, H * 0.34 + 34);
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawUpgradeChoice() {
  if (!upgradeChoice) return;
  const c = upgradeChoice;
  ctx.fillStyle = 'rgba(4,10,18,0.78)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(720, W * 0.9);
  const bx = W / 2 - bw / 2, by = H * 0.24, bh = H * 0.52;
  ctx.fillStyle = 'rgba(10,24,40,0.96)';
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(30, W * 0.04)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('升级强化 · 三选一', W / 2, by + 46);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('Lv.' + GAME.level + ' 选择一项强化，本局生效', W / 2, by + 74);
  const cardW = Math.min(200, (bw - 80) / 3);
  const cardH = 130;
  const gap = Math.min(16, (bw - cardW * 3) / 4);
  let cx = bx + gap;
  for (let i = 0; i < c.options.length; i++) {
    const u = c.options[i];
    const cardX = cx, cardY = by + 110;
    const hovered = hoverUpgradeCard(cardX, cardY, cardW, cardH);
    ctx.fillStyle = hovered ? 'rgba(30,60,90,0.95)' : 'rgba(16,38,60,0.9)';
    ctx.strokeStyle = hovered ? '#ffd166' : 'rgba(140,180,210,0.6)';
    ctx.lineWidth = hovered ? 3 : 1.5;
    roundRect(cardX, cardY, cardW, cardH, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(Math.min(19, W * 0.024)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(u.name, cardX + cardW / 2, cardY + 34);
    ctx.fillStyle = '#e8f1f7';
    ctx.font = '500 ' + Math.round(Math.min(13, W * 0.017)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(u.desc, cardX + cardW / 2, cardY + 70);
    cx += cardW + gap;
  }
}

function hoverUpgradeCard(x, y, w, h) {
  if (!upgradeChoice) return false;
  return input.mouse.x >= x && input.mouse.x <= x + w && input.mouse.y >= y && input.mouse.y <= y + h;
}

function hoverButton() {
  const mx = input.mouse.x, my = input.mouse.y;
  for (const b of menuButtons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b;
  }
  return null;
}

function drawTransition() {
  if (!transition.active) return;
  ctx.fillStyle = 'rgba(4,10,18,' + transition.alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
}

// ---------- main ----------
function update(dt) {
  gameTime += dt;
  const flying = GAME.state === 'playing' && player.alive && mission && !mission.complete && !mission.failed;
  AudioSys.updateEngine(flying ? clamp(player.speed / (CFG.maxSpeed + CFG.abSpeed), 0, 1) : 0);
  updateTransition(dt);
  updateWrecks(dt);
  updateCombo(dt);
  if (GAME.state === 'playing') {
    if (!mission.complete && !mission.failed && !upgradeChoice) {
      updatePlayer(dt);
      acquireLock();
      updateMissionSpawn(dt);
      for (const e of enemies) if (!e.dead) updateEnemy(e, dt);
      separateEnemies();
      updateBullets(dt);
      updateMissiles(dt);
      updatePickups(dt);
      updateParticles(dt);
      updateCamera(dt);
      updateMission(dt);
      if (mission.endless && player.alive) GAME.score += dt * (2 + mission.waveIndex);
      updateMissionSpawn(dt);
    } else {
      updateParticles(dt);
      updateCamera(dt);
      updateMission(dt);
    }
  } else if (GAME.state === 'paused') {
    // keep world visible but frozen
  } else if (GAME.state === 'title' || GAME.state === 'briefing' || GAME.state === 'complete' || GAME.state === 'gameover') {
    updateParticles(dt);
  }
  if (GAME.pendingTimer > 0) {
    GAME.pendingTimer -= dt;
    if (GAME.pendingTimer <= 0 && GAME.pendingState) {
      const st = GAME.pendingState;
      GAME.pendingState = null;
      if (st === 'complete') finishMission(true);
      else if (st === 'gameover') finishMission(false);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (GAME.state === 'title') {
    drawTitle();
  } else if (GAME.state === 'briefing') {
    drawBriefing();
  } else if (GAME.state === 'playing' || GAME.state === 'paused') {
    drawWorld();
    drawHUD();
    if (GAME.state === 'paused') drawPaused();
  } else if (GAME.state === 'complete') {
    drawWorld();
    drawHUD();
    drawComplete();
  } else if (GAME.state === 'gameover') {
    drawWorld();
    drawHUD();
    drawGameOver();
  } else if (GAME.state === 'settings') {
    drawSettings();
  }
  if (GAME.state === 'playing' && upgradeChoice) drawUpgradeChoice();
  drawTransition();
}

function loop(t) {
  const dt = Math.min(0.05, (t - lastTime) / 1000);
  lastTime = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// initial state
generateWorld('day', 1121);
player.x = world.W / 2; player.y = world.H / 2;
cam.x = player.x; cam.y = player.y;
transition = { active: true, alpha: 1, dir: -1, cb: null };
setState('title');
requestAnimationFrame(loop);
