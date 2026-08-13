// verify-hit-feedback.mjs — P32 普通敌机命中反馈接线 + 50ms 离散反馈聚合 专项(RED-first)
// 覆盖: 视觉闪白立即消费(hitFlash 写入→像素差>阈值→约80ms恢复→递减)、50ms 聚合窗口(窗口内≤1事件、
//       全局计数上限、暂停冻结清空不补喷、hit/kill 可区分、真实命中路径多目标不放大)、击毁反馈不回归。
// 运行: node work/verify-hit-feedback.mjs  (未改主文件先跑一遍记录 RED 签名)
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
const slice = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : html.slice(i, j); };

// ---------- S 静态: 实现在场与挂接 ----------
check('S1 HIT_AGG_WINDOW=0.05 命名常量在场', /(const|let|var)\s+HIT_AGG_WINDOW\s*=\s*0\.05\b/.test(html));
check('S2 ENEMY_HIT_FLASH=0.08 命名常量在场', /(const|let|var)\s+ENEMY_HIT_FLASH\s*=\s*0\.08\b/.test(html));
check('S3 HitFeedback 聚合器+queue 在场', /const\s+HitFeedback\s*=\s*\{/.test(html) && /queue:\s*\[\]/.test(html));
const ds = slice('function drawPlaneShape', 'function drawWreckShape');
check('S4 drawPlaneShape 消费 hitFlash(闪白绘制)', ds.includes('p.hitFlash > 0') && ds.includes('#ffffff'));
const us = slice('function updateEnemy', 'function updateWrecks');
check('S5 updateEnemy 递减 hitFlash', us.includes('e.hitFlash = Math.max(0, e.hitFlash - dt)'));
const bs = slice('function updateBullets', 'function updateMissiles');
check('S6 updateBullets 命中走聚合记账 noteHit(不再逐发 burstSpark)', bs.includes('HitFeedback.noteHit(hx, hy)') && !bs.includes('burstSpark(hx, hy'));
const ks = slice('function killPlane', 'function expMultiplier');
check('S7 killPlane 记 noteKill', ks.includes('HitFeedback.noteKill()'));
const upi = html.lastIndexOf('function update(dt)');
const ups = html.slice(upi, html.indexOf('function draw()', upi + 1));
check('S8 update() playing 挂 HitFeedback.update + paused 挂 reset', ups.includes('HitFeedback.update(dt);') && ups.includes('HitFeedback.reset();'));
const ms = slice('const HIT_AGG_WINDOW', '// ---------- damage helpers');
check('S9 聚合器禁 setTimeout', ms.length > 100 && !ms.includes('setTimeout'));
const dms = slice('function damagePlane', 'SlowMo');
check('S10 damagePlane 敌机闪白用 ENEMY_HIT_FLASH(玩家保持 0.12)', dms.includes('ENEMY_HIT_FLASH') && dms.includes("p.kind === 'player' ? 0.12"));
const hs = slice('function drawHUD', 'function drawPaused');
check('S11 HUD 命中标记消费 markT', hs.includes('HitFeedback.markT > 0'));
check('S12 HIT_AGG_MAX_COUNT=3 全局计数上限在场', /(const|let|var)\s+HIT_AGG_MAX_COUNT\s*=\s*3\b/.test(html));

// ---------- CDP harness ----------
class Run {
  constructor(port) {
    this.port = port;
    this.profile = join(tmpdir(), `skyfire-p32-hf-${process.pid}-${port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      '--window-size=900,1000', 'file:///' + FILE],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json(); target = list.find(x => x.type === 'page'); if (target) break; } catch {}
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
    await this.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.reload', { ignoreCache: true }); await sleep(500);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval exception');
    return r.result.value;
  }
  async stop() {
    try { this.chrome.kill(); } catch {}
    await sleep(300);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

const SETUP = `
  input.keys = {}; input.touch = { active:false, mslId:null, swipeId:null, throttleBarId:null };
  input.mouse.movedAt = -99; input.mouse.x = 0; input.mouse.y = 0;
  enemies.length = 0; bullets.length = 0; missiles.length = 0; particles.length = 0; pickups.length = 0; allies.length = 0;
  if (typeof HitFeedback !== 'undefined') HitFeedback.reset();
  GAME.state = 'playing'; GAME.freezeTimer = 0; GAME.pendingTimer = 0; GAME.pendingState = null;
  player.invuln = 0; player.alive = true; player.dead = false; player.hp = player.maxHp;
  player.gunDmgMult = 1; player.fireRateMult = 1;
  player.heading = -Math.PI / 2; player.speed = 200; player.throttle = 0.68;
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;
  mission.complete = false; mission.failed = false;
`;
const HELPERS = `
  const dpr = window.devicePixelRatio || 1;
  const mkE = () => { const e = makeEnemy('fighter', player.x, player.y - 80); e.speed = 0; e.fireCd = 9999; enemies.push(e); return e; };
  const probe = () => {
    const cx = Math.round((W / 2) * dpr), cy = Math.round((H * CAM_ANCHOR_Y - 80 * cam.zoom) * dpr);
    return Array.from(ctx.getImageData(cx - 22, cy - 22, 44, 44).data);
  };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]); return s; };
`;

let fatal = null;
const run = new Run(9520);
try {
  await run.start();
  await run.evalJS(`startEndless(); GAME.state = 'playing';`);
  const evalCheck = async (name, expr, predicate, fmt) => {
    try {
      const v = await run.evalJS(expr);
      check(name, predicate(v), fmt ? fmt(v) : JSON.stringify(v).slice(0, 160));
    } catch (e) { check(name, false, 'EXC: ' + String(e && e.message || e).slice(0, 160)); }
  };

  // T1 真实命中路径: hitFlash 立即写入并立即消费(像素差>阈值; RED 时为 0)
  await evalCheck('T1 真实命中后受击区域像素差>阈值(闪白立即消费)', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE();
    draw();
    const base = probe();
    const hp0 = e.hp;
    bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1, fromPlayer: true, dmg: 7, r: 3, blast: 0, pierce: 0, source: 'player' });
    updateBullets(1/60);
    draw();
    const after = probe();
    return { d: diff(base, after), f: e.hitFlash, hp0, hp1: e.hp };
  })()`, (o) => o.hp1 === o.hp0 - 7 && o.d > 20000 && Math.abs(o.f - 0.08) < 1e-9);

  // T2 hitFlash 递减(3 帧后约 0.03)
  await evalCheck('T2 hitFlash 递减(0.08 → 3帧后 0.02~0.045)', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hitFlash = 0.08;
    for (let i = 0; i < 3; i++) updateEnemy(e, 1/60);
    return { f: e.hitFlash };
  })()`, (o) => o.f > 0.02 && o.f < 0.045);

  // T3 约80ms后恢复: 6帧(0.1s)归零 + 像素回基线 + 正控制(闪白再次点亮)
  await evalCheck('T3 约80ms恢复(hitFlash→0、像素回基线、正控制再点亮)', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hitFlash = 0.08;
    for (let i = 0; i < 6; i++) updateEnemy(e, 1/60);
    const f0 = e.hitFlash;
    draw();
    const rec = probe();
    draw();
    const base = probe();
    e.hitFlash = 0.08;
    draw();
    const flash = probe();
    return { f0, recVsBase: diff(rec, base), flashVsBase: diff(flash, base) };
  })()`, (o) => o.f0 === 0 && o.recVsBase < 1000 && o.flashVsBase > 20000);

  // T4 聚合窗口: 窗口内≤1事件, 计数受全局上限
  await evalCheck('T4 高频命中窗口内≤1事件且计数≤上限(3)', `(() => {
    ${SETUP}
    for (let i = 0; i < 10; i++) HitFeedback.noteHit(100 + i, 200);
    HitFeedback.update(0.03);
    const q0 = HitFeedback.queue.length;
    HitFeedback.update(0.03);
    const q = HitFeedback.queue.map(x => x.type + ':' + x.count);
    return { q0, q, len: HitFeedback.queue.length };
  })()`, (o) => o.q0 === 0 && o.len === 1 && o.q[0] === 'hit:3');

  // T5 普通命中与击毁可区分
  await evalCheck('T5 聚合事件 hit/kill 可区分', `(() => {
    ${SETUP}
    HitFeedback.noteHit(10, 20); HitFeedback.noteKill();
    HitFeedback.update(0.06);
    const q = HitFeedback.queue.map(x => x.type + ':' + x.count);
    return { q, len: HitFeedback.queue.length };
  })()`, (o) => o.len === 2 && o.q[0] === 'hit:1' && o.q[1] === 'kill:1');

  // T6 真实路径多弹同帧命中: 12 弹 → 1 聚合事件(不按目标数放大)
  await evalCheck('T6 真实路径多弹同帧: 12 命中 → 1 事件 count=3', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hp = e.maxHp;
    for (let i = 0; i < 12; i++) bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1, fromPlayer: true, dmg: 1, r: 3, blast: 0, pierce: 0, source: 'player' });
    updateBullets(1/60);
    const norm = HitFeedback.norm;
    const flash = e.hitFlash;
    HitFeedback.update(0.06);
    const q = HitFeedback.queue.map(x => x.type + ':' + x.count);
    return { norm, flash, q, len: HitFeedback.queue.length };
  })()`, (o) => o.norm === 12 && Math.abs(o.flash - 0.08) < 1e-9 && o.len === 1 && o.q[0] === 'hit:3');

  // T7 暂停冻结+清空, 恢复不补喷
  await evalCheck('T7 暂停冻结清空、恢复不补喷', `(() => {
    ${SETUP}
    HitFeedback.noteHit(10, 20); HitFeedback.noteKill();
    GAME.state = 'paused';
    HitFeedback.noteHit(0, 0); HitFeedback.noteKill();
    const guarded = { n: HitFeedback.norm, k: HitFeedback.kills };
    for (let i = 0; i < 5; i++) update(1/60);
    const cleared = { n: HitFeedback.norm, k: HitFeedback.kills, q: HitFeedback.queue.length };
    GAME.state = 'playing';
    HitFeedback.update(0.06);
    return { guarded, cleared, q: HitFeedback.queue.length };
  })()`, (o) => o.guarded.n === 1 && o.guarded.k === 1 && o.cleared.n === 0 && o.cleared.k === 0 && o.cleared.q === 0 && o.q === 0);

  // T8a 击毁即时反馈不回归(爆炸粒子/得分/击杀数, 与聚合无关)
  await evalCheck('T8a 击毁即时反馈不回归(爆炸粒子+击杀数)', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hp = 5;
    bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1, fromPlayer: true, dmg: 7, r: 3, blast: 0, pierce: 0, source: 'player' });
    updateBullets(1/60);
    const boom = particles.filter(p => p.type === 'fire' || p.type === 'flash' || p.type === 'ring' || p.type === 'debris').length;
    return { dead: e.dead, kills: GAME.kills, boom };
  })()`, (o) => o.dead === true && o.kills === 1 && o.boom > 5);

  // T8b 击毁进入聚合事件(kill 通道)
  await evalCheck('T8b 击毁记入聚合 kill 通道(真实路径)', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hp = 5;
    bullets.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 1, fromPlayer: true, dmg: 7, r: 3, blast: 0, pierce: 0, source: 'player' });
    updateBullets(1/60);
    return { fKills: HitFeedback.kills, fNorm: HitFeedback.norm };
  })()`, (o) => o.fKills === 1 && o.fNorm === 1);

  // T9 玩家受击闪白 0.12 保持不变, 敌机 0.08
  await evalCheck('T9 敌机闪白 0.08 / 玩家 0.12 不变', `(() => {
    ${SETUP}${HELPERS}
    const e = mkE(); e.hp = e.maxHp;
    player.hp = player.maxHp;
    damagePlane(e, 5);
    const ef = e.hitFlash;
    damagePlane(player, 5);
    const pf = player.hitFlash;
    return { ef, pf };
  })()`, (o) => Math.abs(o.ef - 0.08) < 1e-9 && o.pf === 0.12);

  check('R1 无 Runtime 异常', run.errors.length === 0, run.errors.join(' | ').slice(0, 200));
} catch (e) { fatal = e; console.error('FATAL', e.stack || e); }
finally {
  await run.stop();
  check('R2 profile 已清理', !existsSync(run.profile), run.profile);
}

const hashAfter = sha256(readFileSync(FILE, 'utf8'));
check('R3 测试后主文件 hash 不变', hashBefore === hashAfter, hashAfter.slice(0, 16));

const failed = checks.filter(x => !x.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map(x => x.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;
