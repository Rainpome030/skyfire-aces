// verify-close-range.mjs — P31 近距命中扫掠 + 玩家/敌机分离(接触伤害零值) 专项(RED-first)
// 全部动态用例在单个 CDP eval 内原子完成; 未改主文件先跑一遍记录 RED 签名。
// 运行: node work/verify-close-range.mjs
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashBefore = sha256(html);

const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

// ---------- R1 静态: 实现在场与挂接 ----------
check('R1a segmentCircleHitT 在场', /function\s+segmentCircleHitT\s*\(/.test(html));
check('R1b segmentHitsCircle 布尔包装在场', /function\s+segmentHitsCircle\s*\(/.test(html));
check('R1c separatePlayerFromEnemies 在场', /function\s+separatePlayerFromEnemies\s*\(/.test(html));
check('R1d updatePlayerContact 在场', /function\s+updatePlayerContact\s*\(/.test(html));
check('R1e SEP_MARGIN=10 且 SEP_MAX_PUSH=6', /(const|let|var)\s+SEP_MARGIN\s*=\s*10\b/.test(html) && /(const|let|var)\s+SEP_MAX_PUSH\s*=\s*6\b/.test(html));
check('R1f CONTACT_DMG 发布默认 0', /(const|let|var)\s+CONTACT_DMG\s*=\s*0\b/.test(html));
check('R1g updateBullets 玩家弹走扫掠调用', /segmentCircleHitT\(\s*sx\s*,\s*sy\s*,\s*b\.x\s*,\s*b\.y\s*/.test(html));
check('R1h update() 挂接分离与接触', html.includes('separatePlayerFromEnemies();') && html.includes('updatePlayerContact(dt);'));
check('R1i 敌弹分支点判定原样保留', /for \(const t of \[player, \.\.\.allies\]\)/.test(html) && /dist2\(b\.x, b\.y, t\.x, t\.y\) < \(t\.r \+ 8\) \* \(t\.r \+ 8\)/.test(html));
check('R1j separateEnemies min=62 未动 + 敌导弹门控未动', /const min = 62;/.test(html) && /d < CFG\.missileBlast \+ e\.r/.test(html));
check('R1k 接触冷却重置挂接 ≥3 处(重开/返回标题/新任务)', (html.match(/player\.contactCd\s*=\s*0/g) || []).length >= 3);

// ---------- G 几何纯函数(node 侧原子, 从主文件抽取后执行) ----------
const fnT = html.match(/function\s+segmentCircleHitT\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
const fnH = html.match(/function\s+segmentHitsCircle\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
let G = null;
if (fnT && fnH) {
  try {
    G = new Function(fnT[0] + '\n' + fnH[0] + '\nreturn { t: segmentCircleHitT, h: segmentHitsCircle };')();
  } catch (e) { G = null; }
}
const g = (name, cond, detail = '') => {
  if (!G) { check(name, false, 'EXC: 函数未抽取到(未实现?)'); return; }
  check(name, cond, detail);
};
// G1 起点在圆内 → t=0
g('G1 起点在圆内 t=0', G && G.t(0, 0, 10, 0, 0, 0, 10) === 0);
// G2 两端圆外完整贯穿 → 最近交点 t=0.25(精确)
g('G2 完整贯穿取最近 t=0.25', G && G.t(-20, 0, 20, 0, 0, 0, 10) === 0.25);
// G3 擦边(相切) → t=0.5
g('G3 擦边相切 t=0.5', G && G.t(-5, 10, 5, 10, 0, 0, 10) === 0.5);
// G4 零长度线段: 圆内 → 0; 圆外 → null
g('G4 零长度: 中心→0 / 远处→null', G && G.t(0, 0, 0, 0, 0, 0, 10) === 0 && G.t(50, 50, 50, 50, 0, 0, 10) === null);
// G5 无交 → null
g('G5 无交 null', G && G.t(0, 0, 5, 5, 100, 100, 10) === null);
// G6 起点在圆上 → 0; 终点在圆上 → 1
g('G6 起点圆上 t=0 / 终点圆上 t=1', G && G.t(10, 0, 20, 0, 0, 0, 10) === 0 && G.t(-20, 0, -10, 0, 0, 0, 10) === 1);
// G7 数值边界: 1e6 量级无 NaN; r=0 点在线段上
g('G7 大坐标/零半径无 NaN', G && (() => { const a = G.t(1e6 - 60, 1e6, 1e6 + 60, 1e6, 1e6, 1e6, 30); const b = G.t(0, 0, 10, 0, 5, 0, 0); const c = G.t(0, 0, 10, 0, 5, 5, 0); return Number.isFinite(a) && Math.abs(a - 0.25) < 1e-9 && b === 0.5 && c === null; })());
// G8 反向线段(终点→起点)仍取最近
g('G8 反向线段 t=0.25', G && G.t(20, 0, -20, 0, 0, 0, 10) === 0.25);
// G9 布尔包装
g('G9 segmentHitsCircle 布尔', G && G.h(-20, 0, 20, 0, 0, 0, 10) === true && G.h(0, 0, 5, 5, 100, 100, 10) === false);
// G10 圆内往返段(起点圆内) → t=0
g('G10 起点圆内任意方向 t=0', G && G.t(0, 0, 50, 50, 0, 0, 10) === 0);

// ---------- CDP harness ----------
class Run {
  constructor(c) {
    this.c = c;
    this.profile = join(tmpdir(), `skyfire-p31-cr-${process.pid}-${c.port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.c.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.c.width},${this.c.height}`, 'file:///' + FILE],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${this.c.port}/json/list`)).json(); target = list.find(x => x.type === 'page'); if (target) break; } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target not found');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'Runtime exception');
    };
    await this.send('Runtime.enable'); await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.c.width, height: this.c.height, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.reload', { ignoreCache: true }); await sleep(400);
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async stop() { try { this.ws?.close(); } catch {} try { this.chrome?.kill(); } catch {} await sleep(150); rmSync(this.profile, { recursive: true, force: true }); }
}

// 页面辅助(挂 window 持久)
const HELPERS = `(() => {
  window.__setCR = function () {
    transition.active = false; if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    GAME.state = 'playing'; GAME.freezeTimer = 0; GAME.pendingState = null; GAME.pendingTimer = 0;
    bullets = []; missiles = []; enemies = []; allies = []; pickups = [];
    mission = { def: MISSION_DEFS[0] || {}, complete: false, failed: false, endless: false, spawned: 1e9, aliveTotal: 0, total: 1e9, waveIndex: 0, waveTimer: 99, bossKilled: false, escortDone: false };
    GAME.unlimitedRevive = true; GAME.reviveCount = 0; GAME.revivesUsed = 0;
    player.alive = true; player.dead = false; player.invuln = 0; player.hp = player.maxHp;
    player.buffs = {}; player.hitFlash = 0; cam.shake = 0; player.contactCd = 0;
    player.x = 2000; player.y = 2000; player.heading = -Math.PI / 2; player.speed = 0; player.altitude = 3500;
    player.fireCd = 0; player.gunSide = 1; player.weapon = defaultWeapon();
    player.gunDmgMult = 1; player.fireRateMult = 1;   // applyPlaneSetup 派生物, 测试环境显式置 1
    player.target = null; player.lock = 0;
    input.keys = {}; input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null }; input.fireHeld = false; input.mslHeld = false; input.isTouch = false;
    GAME.shotsFired = 0; GAME.shotsHit = 0; GAME.damageTaken = 0; GAME.score = 0;
  };
  window.__mkE = function (x, y, hp, r) {
    return { kind: 'fighter', x: x, y: y, r: r || 22, hp: hp || 500, maxHp: hp || 500, dead: false, score: 0, exp: 0,
      color: '#e3554f', heading: 0, speed: 0, maxSpeed: 250, turn: 2, fireCd: 99, mslCd: 99, bank: 0, seed: 1,
      strafeT: 0, attackT: 5, phase2: false, retreat: false, smokeT: 0, wreckT: 0, wreckDone: false, takeDmgMult: 1 };
  };
  window.__mkB = function (x, y, vx, vy, dmg, pierce, blast, life) {
    return { x: x, y: y, vx: vx, vy: vy, life: life || 1, r: 4, dmg: dmg || 7, enemy: false, fromPlayer: true, pierce: pierce || 0, blast: blast || 0, hitCount: 0 };
  };
  window.__randOn = function () { if (!window.__r0) window.__r0 = rand; rand = function (a, b) { return 0; }; };
  window.__randOff = function () { if (window.__r0) rand = window.__r0; };
})();`;

const c = { name: 'P31', width: 1280, height: 720, port: 9893 };
const r = new Run(c);
let fatal = null;
async function evalCheck(name, expr, assert, fmt) {
  let out;
  try { out = await r.eval(expr); }
  catch (e) { check(name, false, 'EXC: ' + String(e.message || e).slice(0, 120)); return; }
  let pass = false, detail = '';
  try { pass = !!assert(out); detail = fmt ? fmt(out) : JSON.stringify(out); }
  catch (e) { detail = 'ASSERT EXC: ' + e.message; }
  check(name, pass, detail);
}
const fmt = (o) => JSON.stringify(o);

try {
  await r.start();
  await r.eval(HELPERS);

  // R2 页面存活: gameTime 流逝(两次读数)
  {
    const t0 = await r.eval('gameTime');
    await sleep(350);
    const t1 = await r.eval('gameTime');
    check('R2a 主循环存活(gameTime 流逝)', t1 > t0, `t0=${t0} t1=${t1}`);
  }

  // ---------- B 组: 近距盲区与穿透 ----------
  await evalCheck('B1 贴脸 d=25 首/次帧命中(≤6帧)', `(() => {
    __setCR(); __randOn();
    const e = __mkE(player.x, player.y - 25, 500, 22); enemies.push(e);
    player.fireCd = 0; player.weapon = defaultWeapon();
    firePlayerGuns();
    let hit = -1;
    for (let f = 0; f < 6; f++) { updateBullets(1 / 60); if (e.hp < 500) { hit = f + 1; break; } }
    __randOff();
    return { hit, hp: e.hp, shotsHit: GAME.shotsHit };
  })()`, (o) => o.hit >= 1 && o.hit <= 2 && o.hp < 500, fmt);

  await evalCheck('B2 参数化 d∈{10,30,36,40,60}×武器×dt 全部命中(75/75)+中管 d=6', `(() => {
    __randOn();
    const wps = ['default', 'scatter', 'heavy', 'pierce', 'laser'];
    const ds = [10, 30, 36, 40, 60];
    const dts = [1 / 60, 1 / 30, 0.05];
    const fails = []; let total = 0;
    for (const w of wps) for (const d of ds) for (const dt of dts) {
      total++;
      __setCR(); __randOn();
      player.weapon = w === 'default' ? defaultWeapon() : makeWeapon(w, 'good');
      player.fireCd = 0;
      const e = __mkE(player.x, player.y - d, 2000, 22); enemies.push(e);
      firePlayerGuns();
      updateBullets(dt);
      if (e.hp >= 2000) fails.push(w + ':' + d + ':' + dt.toFixed(3));
    }
    // 中管武器(散射/激光)在 d=6(命中圆擦边)仍命中; ±8 侧管武器 d=6 为几何盲区(合法)
    const c6 = [];
    for (const w of ['scatter', 'laser']) {
      __setCR(); __randOn();
      player.weapon = makeWeapon(w, 'good'); player.fireCd = 0;
      const e = __mkE(player.x, player.y - 6, 2000, 22); enemies.push(e);
      firePlayerGuns(); updateBullets(1 / 60);
      if (e.hp >= 2000) c6.push(w);
    }
    __randOff();
    return { total, hit: total - fails.length, fails, c6 };
  })()`, (o) => o.total === 75 && o.hit === 75 && o.c6.length === 0, fmt);

  await evalCheck('B3 一帧穿两敌: 最近者获伤/另一无损/非穿透单次结算', `(() => {
    __setCR(); __randOn();
    const a = __mkE(player.x, player.y - 50, 2000, 22);
    const b = __mkE(player.x, player.y - 90, 2000, 22);
    enemies.push(a, b);
    bullets.push(__mkB(player.x, player.y - 36, 0, -1550, 7, 0, 0, 1));
    updateBullets(0.05);
    __randOff();
    return { hpA: a.hp, hpB: b.hp, n: bullets.length, shotsHit: GAME.shotsHit };
  })()`, (o) => o.hpA === 1993 && o.hpB === 2000 && o.n === 0 && o.shotsHit === 1, fmt);

  await evalCheck('B4 穿透弹一帧两敌: 先最近, 自交点续飞再中第二', `(() => {
    __setCR(); __randOn();
    const a = __mkE(player.x, player.y - 50, 2000, 22);
    const b = __mkE(player.x, player.y - 90, 2000, 22);
    enemies.push(a, b);
    const bl = __mkB(player.x, player.y - 36, 0, -1620, 11, 2, 0, 1);
    bullets.push(bl);
    updateBullets(0.05);
    const f1 = { hpA: a.hp, hpB: b.hp, n: bullets.length, hc: bl.hitCount };
    updateBullets(0.05);
    const f2 = { hpA: a.hp, hpB: b.hp, n: bullets.length, hc: bl.hitCount, shotsHit: GAME.shotsHit };
    __randOff();
    return { f1, f2 };
  })()`, (o) => o.f1.hpA === 1989 && o.f1.hpB === 2000 && o.f1.n === 1 && o.f1.hc === 1
      && o.f2.hpA === 1989 && o.f2.hpB === 1989 && o.f2.n === 1 && o.f2.hc === 2 && o.f2.shotsHit === 2, fmt);

  await evalCheck('B5 侧管弹(±8)贴脸 d=25 命中', `(() => {
    __setCR(); __randOn();
    const e = __mkE(player.x, player.y - 25, 500, 22); enemies.push(e);
    player.fireCd = 0; player.weapon = defaultWeapon();
    firePlayerGuns();
    const n0 = bullets.length;
    updateBullets(1 / 60);
    __randOff();
    return { hp: e.hp, n0, n1: bullets.length };
  })()`, (o) => o.n0 === 2 && o.hp < 500 && o.n1 === 0, fmt);

  await evalCheck('B6 爆炸武器贴脸: 命中+溅射(0.55×)在交点, 远目标不伤', `(() => {
    __setCR(); __randOn();
    player.weapon = makeWeapon('rocket', 'good'); player.fireCd = 0;
    const e = __mkE(player.x, player.y - 40, 2000, 22);
    const near = __mkE(player.x + 50, player.y - 40, 2000, 22);
    const far = __mkE(player.x + 200, player.y - 40, 2000, 22);
    enemies.push(e, near, far);
    firePlayerGuns();
    updateBullets(0.05);
    __randOff();
    return { hpE: e.hp, hpNear: near.hp, hpFar: far.hp, n: bullets.length, shotsHit: GAME.shotsHit };
  })()`, (o) => o.hpE === 1966 && Math.abs(o.hpNear - (2000 - 34 * 0.55)) < 1e-9 && o.hpFar === 2000 && o.n === 0 && o.shotsHit === 1, fmt);

  await evalCheck('B7 单发命中 shotsHit 只 +1(激光单管)', `(() => {
    __setCR(); __randOn();
    player.weapon = makeWeapon('laser', 'good'); player.fireCd = 0;
    const e = __mkE(player.x, player.y - 25, 500, 22); enemies.push(e);
    firePlayerGuns();
    updateBullets(1 / 60);
    __randOff();
    return { hp: e.hp, n: bullets.length, shotsHit: GAME.shotsHit };
  })()`, (o) => o.hp < 500 && o.n === 0 && o.shotsHit === 1, fmt);

  await evalCheck('B8 回归: d=400 正常命中 + 死敌跳过 + 敌弹分支不动', `(() => {
    __setCR(); __randOn();
    const deadE = __mkE(player.x, player.y - 80, 500, 22); deadE.dead = true;
    const e = __mkE(player.x, player.y - 400, 500, 22);
    enemies.push(deadE, e);
    bullets.push(__mkB(player.x, player.y - 36, 0, -1550, 7, 0, 0, 1));
    let hit = -1;
    for (let f = 0; f < 40; f++) { updateBullets(1 / 60); if (e.hp < 500) { hit = f + 1; break; } }
    const hpDead = deadE.hp;
    bullets.length = 0; player.hp = 100; player.invuln = 0; player.buffs = {}; GAME.damageTaken = 0;
    bullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: 1, r: 4, dmg: 8, enemy: true, fromPlayer: false });
    updateBullets(1 / 60);
    __randOff();
    return { hit, hpDead, hpPlayer: player.hp, shotsHit: GAME.shotsHit };
  })()`, (o) => o.hit >= 1 && o.hit <= 20 && o.hpDead === 500 && o.hpPlayer === 92 && o.shotsHit === 1, fmt);

  // ---------- C 组: 重叠分离 ----------
  await evalCheck('C1 中心完全重合: 60 tick 后分离达标(≥47.5)', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y, 500, 22); enemies.push(e);
    for (let i = 0; i < 60; i++) separatePlayerFromEnemies();
    return { d: dist(player.x, player.y, e.x, e.y), min: player.r + 22 + 10 };
  })()`, (o) => o.d >= o.min - 0.5 && o.d <= o.min + 0.5, fmt);

  await evalCheck('C2 柔和度: 单 tick 玩家位移≤6, 航向/速度/高度不变', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y, 500, 22); enemies.push(e);
    const px0 = player.x, py0 = player.y, h0 = player.heading, s0 = player.speed, a0 = player.altitude;
    const ex0 = e.x, ey0 = e.y;
    separatePlayerFromEnemies();
    const moved = Math.hypot(player.x - px0, player.y - py0);
    const movedE = Math.hypot(e.x - ex0, e.y - ey0);
    return { moved, movedE, h: player.heading === h0, s: player.speed === s0, a: player.altitude === a0 };
  })()`, (o) => o.moved > 0 && o.moved <= 6 + 1e-9 && o.movedE > 0 && o.h && o.s && o.a, fmt);

  await evalCheck('C3 未重叠敌机(d=300) 60 tick 距离不变', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 300, 500, 22); enemies.push(e);
    const px0 = player.x, py0 = player.y;
    for (let i = 0; i < 60; i++) separatePlayerFromEnemies();
    return { d: dist(player.x, player.y, e.x, e.y), pm: Math.hypot(player.x - px0, player.y - py0) };
  })()`, (o) => Math.abs(o.d - 300) < 1e-6 && o.pm === 0, fmt);

  await evalCheck('C4 三敌重叠包围: 120 tick 全部分离, 位置有限且在界内', `(() => {
    __setCR();
    const es = [__mkE(player.x, player.y, 500, 22), __mkE(player.x, player.y, 500, 22), __mkE(player.x, player.y, 500, 22)];
    enemies.push(...es);
    for (let i = 0; i < 120; i++) separatePlayerFromEnemies();
    const ds = es.map(e => dist(player.x, player.y, e.x, e.y));
    const inB = player.x >= 120 && player.x <= world.W - 120 && player.y >= 120 && player.y <= world.H - 120;
    const finite = es.every(e => Number.isFinite(e.x) && Number.isFinite(e.y));
    return { ds, min: 48, inB, finite };
  })()`, (o) => o.ds.every(d => d >= o.min - 0.5) && o.inB && o.finite, fmt);

  await evalCheck('C5 飞行边界: 贴边重叠分离后玩家仍在界内', `(() => {
    __setCR();
    player.x = 120; player.y = 120; player.heading = 0;
    const e = __mkE(140, 120, 500, 22); enemies.push(e);
    separatePlayerFromEnemies();
    const inB = player.x >= 120 && player.y >= 120 && player.x <= world.W - 120 && player.y <= world.H - 120;
    return { inB, px: player.x, py: player.y, ex: e.x };
  })()`, (o) => o.inB === true, fmt);

  await evalCheck('C6 暂停/死亡/结算期间不执行分离', `(() => {
    __setCR();
    const out = {};
    GAME.state = 'paused';
    const e1 = __mkE(player.x, player.y, 500, 22); enemies = [e1];
    for (let i = 0; i < 10; i++) separatePlayerFromEnemies();
    out.paused = { d: dist(player.x, player.y, e1.x, e1.y) };
    GAME.state = 'playing'; player.alive = false;
    const px1 = player.x, py1 = player.y, ex1 = e1.x, ey1 = e1.y;
    for (let i = 0; i < 10; i++) separatePlayerFromEnemies();
    out.dead = { moved: player.x !== px1 || player.y !== py1, movedE: e1.x !== ex1 || e1.y !== ey1 };
    player.alive = true; mission.complete = true;
    const px2 = player.x, py2 = player.y, ex2 = e1.x;
    for (let i = 0; i < 10; i++) separatePlayerFromEnemies();
    out.complete = { moved: player.x !== px2 || player.y !== py2, movedE: e1.x !== ex2 };
    return out;
  })()`, (o) => o.paused.d === 0 && o.dead.moved === false && o.dead.movedE === false && o.complete.moved === false && o.complete.movedE === false, fmt);

  await evalCheck('C7 kamikaze 与分离互扰: 分离不推出 70px, 自爆照常', `(() => {
    __setCR();
    const km2 = makeEnemy('kamikaze', player.x, player.y - 20);
    enemies.push(km2);
    separatePlayerFromEnemies();
    const d2 = dist(player.x, player.y, km2.x, km2.y);
    player.invuln = 0; player.hp = 100; player.buffs = {};
    updateEnemy(km2, 1 / 60);
    const r2 = { d2, dead2: km2.dead, hp2: player.hp };
    __setCR();
    const km = makeEnemy('kamikaze', player.x, player.y - 45);
    enemies.push(km);
    separatePlayerFromEnemies();
    const dAfterSep = dist(player.x, player.y, km.x, km.y);
    player.invuln = 0; player.hp = 100; player.buffs = {};
    updateEnemy(km, 1 / 60);
    return { r2, dAfterSep, dead: km.dead, hp: player.hp };
  })()`, (o) => o.r2.d2 < 70 && o.r2.dead2 === true && o.r2.hp2 === 65 && o.dAfterSep < 70 && o.dead === true && o.hp === 65, fmt);

  // ---------- P 组: 接触伤害(默认零值 + 非零路径) ----------
  await evalCheck('P1 默认 CONTACT_DMG=0: 重叠 2s 不扣血/不震动/无冷却', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.hp = 100; player.hitFlash = 0; cam.shake = 0;
    for (let i = 0; i < 120; i++) updatePlayerContact(1 / 60);
    return { hp: player.hp, flash: player.hitFlash, shake: cam.shake, cd: player.contactCd || 0, dmgo: CONTACT_DMG };
  })()`, (o) => o.hp === 100 && o.flash === 0 && o.shake === 0 && o.cd === 0 && o.dmgo === 0, fmt);

  await evalCheck('P2 非零路径: 单次扣血=min(DMG, 3%maxHp)=3, 冷却 0.5s', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.hp = 100; player.invuln = 0;
    const old = CONTACT_DMG;
    try {
      CONTACT_DMG = 8;
      updatePlayerContact(1 / 60);
      return { hp: player.hp, cd: player.contactCd };
    } finally { CONTACT_DMG = old; }
  })()`, (o) => o.hp === 97 && o.cd === 0.5, fmt);

  await evalCheck('P3 全局冷却: 0.5s 内不重复扣; 脱离接触 cd 归零; 到期再扣', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.hp = 100; player.invuln = 0;
    const old = CONTACT_DMG;
    try {
      CONTACT_DMG = 8;
      updatePlayerContact(1 / 60);
      const after1 = { hp: player.hp, cd: player.contactCd };
      let ticksNoDmg = 0;
      for (let i = 0; i < 30; i++) { const h0 = player.hp; updatePlayerContact(1 / 60); if (player.hp !== h0) ticksNoDmg++; }
      updatePlayerContact(1 / 60);   // 浮点边界: 冷却 0.5s 在 60Hz 下第 32 tick 到期, 恰好再扣一次
      const after2 = { hp: player.hp, cd: player.contactCd };
      enemies.length = 0; updatePlayerContact(1 / 60);
      const cdAfterBreak = player.contactCd;
      enemies.push(__mkE(player.x, player.y - 20, 500, 22));
      updatePlayerContact(1 / 60);
      const after3 = { hp: player.hp, cd: player.contactCd };
      return { after1, ticksNoDmg, after2, cdAfterBreak, after3 };
    } finally { CONTACT_DMG = old; }
  })()`, (o) => o.after1.hp === 97 && o.after1.cd === 0.5 && o.ticksNoDmg === 0
      && o.after2.hp === 94 && Math.abs(o.after2.cd - 0.5) < 1e-9
      && o.cdAfterBreak === 0 && o.after3.hp === 91 && o.after3.cd === 0.5, fmt);

  await evalCheck('P4 冷却冻结(暂停)与重置(标题/重开/新任务)', `(() => {
    __setCR();
    player.contactCd = 0.5;
    GAME.state = 'paused';
    for (let i = 0; i < 10; i++) updatePlayerContact(1 / 60);
    const frozen = player.contactCd;
    GAME.state = 'playing';
    setState('title');
    const afterTitle = player.contactCd;
    player.contactCd = 0.5;
    startMission(0, 'campaign');
    const afterMission = player.contactCd;
    player.contactCd = 0.5;
    startEndless();
    const afterEndless = player.contactCd;
    return { frozen, afterTitle, afterMission, afterEndless };
  })()`, (o) => o.frozen === 0.5 && o.afterTitle === 0 && o.afterMission === 0 && o.afterEndless === 0, fmt);

  await evalCheck('P5 无敌帧门: 不扣血/不消耗冷却/无反馈', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.hp = 100; player.invuln = 2; player.hitFlash = 0; cam.shake = 0; player.contactCd = 0;
    const old = CONTACT_DMG;
    try {
      CONTACT_DMG = 8;
      updatePlayerContact(1 / 60);
      return { hp: player.hp, cd: player.contactCd, flash: player.hitFlash, shake: cam.shake };
    } finally { CONTACT_DMG = old; }
  })()`, (o) => o.hp === 100 && o.cd === 0 && o.flash === 0 && o.shake === 0, fmt);

  await evalCheck('P6 接触致死链: killPlane→复活(无敌 1.2), 循环存活', `(() => {
    __setCR();
    GAME.unlimitedRevive = true; GAME.reviveCount = 0;
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.hp = 2; player.invuln = 0;
    const old = CONTACT_DMG;
    try {
      CONTACT_DMG = 5;
      updatePlayerContact(1 / 60);
      return { alive: player.alive, dead: player.dead, invuln: player.invuln, hp: player.hp, revivesUsed: GAME.revivesUsed, freeze: GAME.freezeTimer };
    } finally { CONTACT_DMG = old; __setCR(); }
  })()`, (o) => o.alive === true && o.dead === false && Math.abs(o.invuln - 1.2) < 0.01 && o.hp === 60 && o.revivesUsed === 1 && o.freeze > 0, fmt);

  await evalCheck('P7 帧率无关: 2s 接触 @60Hz 与 @120Hz 扣血次数一致(±1)', `(() => {
    __setCR();
    const e = __mkE(player.x, player.y - 20, 500, 22); enemies.push(e);
    player.invuln = 0;
    const old = CONTACT_DMG;
    try {
      CONTACT_DMG = 8;
      const countAt = (dt, n) => { let cc = 0; for (let i = 0; i < n; i++) { const h0 = player.hp; updatePlayerContact(dt); if (player.hp !== h0) cc++; } return cc; };
      player.hp = 100; player.contactCd = 0;
      const c60 = countAt(1 / 60, 120);
      player.hp = 100; player.contactCd = 0;
      const c120 = countAt(1 / 120, 240);
      return { c60, c120 };
    } finally { CONTACT_DMG = old; }
  })()`, (o) => o.c60 >= 3 && o.c60 <= 5 && o.c120 >= 3 && o.c120 <= 5 && Math.abs(o.c60 - o.c120) <= 1, fmt);

  check('R2b 无 Runtime 异常', r.errors.length === 0, r.errors.join(' | ').slice(0, 200));
} catch (e) { fatal = e; console.error('FATAL', e.stack || e); }
finally {
  await r.stop();
  check('R2c profile 已清理', !existsSync(r.profile), r.profile);
}

const hashAfter = sha256(readFileSync(FILE, 'utf8'));
check('R2d 测试后主文件 hash 不变', hashBefore === hashAfter, hashAfter.slice(0, 16));

const failed = checks.filter(x => !x.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map(x => x.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;
