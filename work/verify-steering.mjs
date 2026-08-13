// verify-steering.mjs — P34.1 触屏滑动转向连续强度映射(候选A)专项(RED-first)
// 覆盖: 常量与纯函数锚点(28px→0.35 / W_eff*0.30→1.0 / 中间线性 / 钳制[0,1] / 单调);
//       真实 touchmove 合成事件链路(27px 不转 / 28px 死区边界保留 / 29px 起转 strength≈0.35 /
//       40/120/300px 距离→转角(RED 现状=相同, GREEN=严格递增) / 左右对称 / 超30%有效宽度钳制1.0 /
//       touchend·touchcancel·回退阈值内 复位 / 60Hz↔120Hz 单位时间转角一致);
//       PC 鼠标相对转向 / 键盘 A/D / 双击 A/D 滚筒 / 触屏双滑滚筒 回归(路径一分不动)。
// 运行: node work/verify-steering.mjs  (未改主文件先跑一遍记录 RED 签名; 改后 GREEN 全过)
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const PORT = 9711;
const html = readFileSync(FILE, 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashBefore = sha256(html);
const hasMap = html.includes('function steerStrengthFromPx(');
console.log('MODE=' + (hasMap ? 'GREEN' : 'RED') + '  hasMap=' + hasMap);

const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}
const slice = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : html.slice(i, j); };

// ---------- S 静态: 实现在场与挂接 ----------
check('S1 常量: STEER_STRENGTH_MIN_PX=28 / FULL_RATIO=0.30 / RATE_MIN=0.8 / RATE_MAX=1.8',
  html.includes('STEER_STRENGTH_MIN_PX = 28') && html.includes('STEER_STRENGTH_FULL_RATIO = 0.30')
  && html.includes('STEER_RATE_MIN = 0.8') && html.includes('STEER_RATE_MAX = 1.8'));
check('S2 纯函数在场: steerStrengthFromPx / steerEffectiveWidth',
  html.includes('function steerStrengthFromPx(') && html.includes('function steerEffectiveWidth('));
check('S3 touchSwipe 状态含 strength 字段', html.includes('lastDir: null, lastT: -99, strength: 0'));
check('S4 touchmove 挂接强度计算(真实事件链路)', slice("canvas.addEventListener('touchmove'", '// 完成一次手势').includes('touchSwipe.strength = steerStrengthFromPx(Math.abs(dx))'));
check('S5 completeSwipe 复位 strength', slice('function completeSwipe', 'function endTouch').includes('touchSwipe.strength = 0'));
check('S6 updatePlayer 触屏分支用 rateMult=lerp(0.8,1.8,strength) 且 1.5 保持现状',
  slice('function updatePlayer', '// 油门:W/S').includes('lerp(STEER_RATE_MIN, STEER_RATE_MAX, touchSwipe.strength)')
  && slice('function updatePlayer', '// 油门:W/S').includes('1.5 * rateMult'));
check('S7 激活门保留(任务书21: |dx|>SWIPE_THRESH 且水平主轴)', /Math\.abs\(dx\) > SWIPE_THRESH && Math\.abs\(dx\) > Math\.abs\(dy\)/.test(html));
check('S8 无运行时 A/B 开关', !html.includes('STEER_AB') && !html.includes('steerAbTest') && !html.includes('STEER_STRENGTH_LEGACY') && !html.includes('steerMode'));
check('S9 PC 键盘/鼠标路径一分不动(键盘 1.5 / 鼠标 MOUSE_STEER_* / 高速衰减 32%)',
  html.includes('steerPlane(player, player.heading + dir * Math.PI / 2, dt, 1.5)')
  && html.includes('MOUSE_STEER_RATE * clamp(Math.abs(mx) / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1)')
  && slice('function steerPlane', 'function movePlane').includes('1 - 0.32 * clamp(')
  && /MOUSE_STEER_DEADZONE = 40/.test(html) && /MOUSE_STEER_FULL = 0\.35/.test(html) && /MOUSE_STEER_RATE = 1\.5/.test(html));
check('S10 steerEffectiveWidth 复用 P33 hudRects() 布局源', slice('function steerEffectiveWidth', 'function steerStrengthFromPx').includes('hudRects()'));
check('S11 距离用 CSS 逻辑像素(canvasPointFromClient 口径)', slice("canvas.addEventListener('touchmove'", '// 完成一次手势').includes('canvasPointFromClient(t.clientX, t.clientY)'));

// ---------- CDP harness ----------
class Run {
  constructor(port, winW = 900, winH = 1000) {
    this.port = port;
    this.winW = winW; this.winH = winH;
    this.profile = join(tmpdir(), `skyfire-p34s-${process.pid}-${port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.winW},${this.winH}`, 'file:///' + FILE],
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
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.winW, height: this.winH, deviceScaleFactor: 1, mobile: false });
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

// ---------- 页面内布置/工具(每个 eval 原子执行; 帧/计时器不推进) ----------
const SETUP = `(() => {
  GAME.state = 'playing';
  player.alive = true;
  player.turn = 2.7;
  player.speed = CFG.minSpeed; player.throttle = 0; player.afterburn = false;
  player.altitude = 9000; player.accelMult = 1;
  player.heading = 0; player.bank = 0;
  player.rollActive = false; player.rollCd = 0; player.invuln = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.fireCd = 9999; player.dashPressed = false;
  if (typeof transition !== 'undefined') transition.active = false;
  input.isTouch = true;
  input.keys = {}; input.fireHeld = false; input.mslHeld = false;
  input.mouse.x = 0; input.mouse.y = 0; input.mouse.movedAt = -99;
  input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null, pauseId: null };
  touchSwipe.dir = null; touchSwipe.active = false;
  touchSwipe.startX = 0; touchSwipe.startY = 0; touchSwipe.lastDir = null; touchSwipe.lastT = -99;
  if ('strength' in touchSwipe) touchSwipe.strength = 0;
})();`;
const FIRE_TOUCH = `const fireTouch = (type, x, y, id) => {
  const ev = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(ev, 'changedTouches', { value: [{ identifier: id, clientX: x, clientY: y }] });
  canvas.dispatchEvent(ev);
};`;
const ev = (body) => `(() => { ${SETUP} ${FIRE_TOUCH} ${body} })()`;

const run = new Run(PORT);
await run.start();

// T1 纯函数锚点/单调/钳制
const t1 = await run.evalJS(ev(`let out = {};
if (typeof steerStrengthFromPx !== 'function') { out.noMap = true; }
else {
  const full = steerEffectiveWidth() * STEER_STRENGTH_FULL_RATIO;
  out.W = W; out.fullW = steerEffectiveWidth(); out.full = full;
  out.s0 = steerStrengthFromPx(0); out.s27 = steerStrengthFromPx(27);
  out.s28 = steerStrengthFromPx(28); out.s29 = steerStrengthFromPx(29);
  out.sFull = steerStrengthFromPx(full);
  out.sMid = steerStrengthFromPx((28 + full) / 2);
  out.sOver = steerStrengthFromPx(full * 2); out.sNeg = steerStrengthFromPx(-5);
  let mono = true; let prev = -1;
  for (const d of [0, 10, 27, 28, 29, 50, 120, 300, full, full * 2]) {
    const v = steerStrengthFromPx(d); if (v < prev - 1e-12) mono = false; prev = v;
  }
  out.mono = mono;
}
GAME.state = 'title';
return out;`));
if (t1.noMap) {
  check('T1 RED 现状: steerStrengthFromPx 未实现(预期 RED 签名)', false, 'noMap');
} else {
  check('T1a 锚点: 27px→0 / 28px→0.35 / W_eff*0.30→1.0', t1.s27 === 0 && Math.abs(t1.s28 - 0.35) < 1e-9 && t1.sFull === 1,
    `s27=${t1.s27} s28=${t1.s28} sFull=${t1.sFull} fullW=${t1.fullW} full=${t1.full}`);
  check('T1b 中间线性: (28+full)/2 → 0.675', Math.abs(t1.sMid - 0.675) < 1e-9, 'sMid=' + t1.sMid);
  check('T1c 钳制[0,1]: 负值→0 / 超满幅→1', t1.sNeg === 0 && t1.sOver === 1, `sNeg=${t1.sNeg} sOver=${t1.sOver}`);
  check('T1d 单调不减(0..full*2 采样序列)', t1.mono === true);
}

// T2 阈值(真实 touchmove 事件链路)
const t2a = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 227, 300, 1);
const active = touchSwipe.active;
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dH = player.heading - h0;
GAME.state = 'title';
return { active, dH };`));
check('T2a 27px 不转(死区)', t2a.active === false && Math.abs(t2a.dH) < 1e-9, `active=${t2a.active} dH=${t2a.dH}`);

const t2b = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 228, 300, 1);
const active = touchSwipe.active;
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
GAME.state = 'title';
return { active, dH: player.heading - h0 };`));
check('T2b 28px 恰在阈值上: 保持历史死区语义(|dx|>28 才激活)', t2b.active === false && Math.abs(t2b.dH) < 1e-9, `active=${t2b.active} dH=${t2b.dH}`);

const t2c = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 229, 300, 1);
const active = touchSwipe.active, dir = touchSwipe.dir;
const s = (typeof steerStrengthFromPx === 'function') ? steerStrengthFromPx(29) : null;
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dH = player.heading - h0;
GAME.state = 'title';
return { active, dir, s, dH };`));
check('T2c 29px 起转(死区外激活)', t2c.active === true && t2c.dir === 'right' && t2c.dH > 0, `dir=${t2c.dir} dH=${t2c.dH}`);
check('T2d strength 在场且≈0.35', t2c.s !== null && Math.abs(t2c.s - 0.35) < 0.06, 's29=' + t2c.s);
{
  const exp = t2c.s === null ? 2.7 * 1.5 * 0.5 : 2.7 * 1.5 * (0.8 + 1.0 * t2c.s) * 0.5;
  check('T2e 转角符合 rateMult=lerp(0.8,1.8,strength)×触屏倍率1.5 公式', Math.abs(t2c.dH - exp) < 1e-6, `dH=${t2c.dH} exp=${exp}`);
}

// T3 距离→转角(40/120/300px)
const t3 = await run.evalJS(ev(`const out = {};
const hasFn = typeof steerStrengthFromPx === 'function';
for (const d of [40, 120, 300]) {
  fireTouch('touchstart', 200, 300, 1);
  fireTouch('touchmove', 200 + d, 300, 1);
  const s = hasFn ? steerStrengthFromPx(d) : null;
  const h0 = player.heading;
  for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
  out['a' + d] = player.heading - h0;
  out['s' + d] = s;
  fireTouch('touchend', 200 + d, 300, 1);
  touchSwipe.lastDir = null; touchSwipe.lastT = -99;
}
GAME.state = 'title';
return out;`));
{
  const { a40, a120, a300, s40, s120, s300 } = t3;
  const detail = `a40=${a40.toFixed(4)} a120=${a120.toFixed(4)} a300=${a300.toFixed(4)} s40=${s40} s120=${s120} s300=${s300}`;
  if (hasMap) {
    check('T3a GREEN: 40/120/300px 转角严格递增(连续强度)', a40 < a120 && a120 < a300, detail);
    const pred = (s) => 2.7 * 1.5 * (0.8 + 1.0 * s) * 0.5;
    check('T3b GREEN: 三距离转角均符合映射公式', Math.abs(a40 - pred(s40)) < 1e-6 && Math.abs(a120 - pred(s120)) < 1e-6 && Math.abs(a300 - pred(s300)) < 1e-6, detail);
  } else {
    check('T3a RED 现状: 40/120/300px 转角相同(二值门槛)', Math.abs(a40 - a120) < 1e-9 && Math.abs(a120 - a300) < 1e-9 && Math.abs(a40 - 2.025) < 1e-6, detail);
  }
}

// T4 最大钳制(超 30% 有效宽度)
const t4 = await run.evalJS(ev(`const hasFn = typeof steerStrengthFromPx === 'function';
const full = hasFn ? steerEffectiveWidth() * STEER_STRENGTH_FULL_RATIO : 300;
const out = { full, W, fullW: hasFn ? steerEffectiveWidth() : null };
for (const [k, mult] of [['15', 1.5], ['20', 2.0]]) {
  fireTouch('touchstart', 200, 300, 1);
  fireTouch('touchmove', 200 + full * mult, 300, 1);
  out['s' + k] = hasFn ? steerStrengthFromPx(full * mult) : null;
  const h0 = player.heading;
  for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
  out['a' + k] = player.heading - h0;
  fireTouch('touchend', 200 + full * mult, 300, 1);
  touchSwipe.lastDir = null; touchSwipe.lastT = -99;
}
GAME.state = 'title';
return out;`));
check('T4a 超30%有效宽度 strength 恒 1.0', t4.s15 === 1 && t4.s20 === 1, `s15=${t4.s15} s20=${t4.s20} full=${t4.full} fullW=${t4.fullW}`);
check('T4b 满幅以上转角不再增加', Math.abs(t4.a15 - t4.a20) < 1e-9, `a15=${t4.a15} a20=${t4.a20}`);

// T5 左右对称
const t5 = await run.evalJS(ev(`fireTouch('touchstart', 400, 300, 1);
fireTouch('touchmove', 700, 300, 1);
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dR = player.heading - h0;
fireTouch('touchend', 700, 300, 1);
touchSwipe.lastDir = null; touchSwipe.lastT = -99;
fireTouch('touchstart', 400, 300, 1);
fireTouch('touchmove', 100, 300, 1);
const h1 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dL = player.heading - h1;
GAME.state = 'title';
return { dR, dL };`));
check('T5 左右对称: 同距离左右转角镜像', Math.abs(t5.dR + t5.dL) < 1e-9 && t5.dR > 0 && t5.dL < 0, `dR=${t5.dR.toFixed(4)} dL=${t5.dL.toFixed(4)}`);

// T6 释放/复位
const t6 = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 500, 300, 1);
const activeBefore = touchSwipe.active;
fireTouch('touchend', 500, 300, 1);
const after = { active: touchSwipe.active, dir: touchSwipe.dir, strength: ('strength' in touchSwipe) ? touchSwipe.strength : 'absent', swipeId: input.touch.swipeId };
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
GAME.state = 'title';
return { activeBefore, after, dH: player.heading - h0 };`));
check('T6a touchend 释放: 状态复位且不再转向', t6.activeBefore === true && t6.after.active === false && t6.after.dir === null && t6.after.swipeId === null && Math.abs(t6.dH) < 1e-9, `activeBefore=${t6.activeBefore} dH=${t6.dH}`);
check('T6b strength 归零复位', t6.after.strength === 0, 'strength=' + t6.after.strength);

const t6c = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 500, 300, 1);
fireTouch('touchcancel', 500, 300, 1);
const after = touchSwipe.active;
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
GAME.state = 'title';
return { after, dH: player.heading - h0 };`));
check('T6c touchcancel 同样复位且不再转向', t6c.after === false && Math.abs(t6c.dH) < 1e-9);

const t6d = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1);
fireTouch('touchmove', 500, 300, 1);
const a1 = touchSwipe.active;
fireTouch('touchmove', 210, 300, 1);
const a2 = touchSwipe.active, s2 = ('strength' in touchSwipe) ? touchSwipe.strength : 'absent';
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
GAME.state = 'title';
return { a1, a2, s2, dH: player.heading - h0 };`));
check('T6d 回退阈值内: 取消激活且不再转向', t6d.a1 === true && t6d.a2 === false && Math.abs(t6d.dH) < 1e-9, `a1=${t6d.a1} a2=${t6d.a2} s2=${t6d.s2}`);
check('T6e 回退阈值内 strength 归零', t6d.s2 === 0, 's2=' + t6d.s2);

// T7 帧率无关(60Hz vs 120Hz)
const t7 = await run.evalJS(ev(`const out = {};
for (const [key, d] of [['m150', 150], ['m300', 300]]) {
  fireTouch('touchstart', 200, 300, 1);
  fireTouch('touchmove', 200 + d, 300, 1);
  const h0 = player.heading;
  for (let i = 0; i < 60; i++) updatePlayer(1 / 60);
  const a60 = player.heading - h0;
  fireTouch('touchend', 200 + d, 300, 1);
  touchSwipe.lastDir = null; touchSwipe.lastT = -99;
  player.heading = 0;
  fireTouch('touchstart', 200, 300, 1);
  fireTouch('touchmove', 200 + d, 300, 1);
  const h1 = player.heading;
  for (let i = 0; i < 120; i++) updatePlayer(1 / 120);
  const a120 = player.heading - h1;
  fireTouch('touchend', 200 + d, 300, 1);
  touchSwipe.lastDir = null; touchSwipe.lastT = -99;
  out[key] = { a60, a120 };
}
GAME.state = 'title';
return out;`));
check('T7 帧率无关: 60Hz/120Hz 单位时间转角一致(150px 与 300px)',
  Math.abs(t7.m150.a60 - t7.m150.a120) < 1e-6 && Math.abs(t7.m300.a60 - t7.m300.a120) < 1e-6,
  `m150: ${t7.m150.a60.toFixed(5)} vs ${t7.m150.a120.toFixed(5)} | m300: ${t7.m300.a60.toFixed(5)} vs ${t7.m300.a120.toFixed(5)}`);

// T8 PC 键盘 A/D(rate 1.5, 一分不动)
const t8 = await run.evalJS(ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dA = player.heading - h0;
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
const h1 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dD = player.heading - h1;
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
input.keys = {};
GAME.state = 'title';
return { dA, dD };`));
check('T8 键盘 A/D 转向不变(turn×1.5×0.5s=±2.025)', Math.abs(t8.dA + 2.025) < 1e-9 && Math.abs(t8.dD - 2.025) < 1e-9, `dA=${t8.dA} dD=${t8.dD}`);

// T9 PC 双击 A/D 滚筒(单击不触发/双击触发)
const t9 = await run.evalJS(ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
const singleRoll = player.rollActive === true || player.rollCd > 0;
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
const doubleRoll = player.rollActive === true || player.rollCd > 0;
input.keys = {};
GAME.state = 'title';
return { singleRoll, doubleRoll };`));
check('T9 双击 A/D 滚筒不变(单击不触发/双击触发)', t9.singleRoll === false && t9.doubleRoll === true, JSON.stringify(t9));

// T10 触屏双滑滚筒(completeSwipe 路径不变)
const t10 = await run.evalJS(ev(`fireTouch('touchstart', 200, 300, 1); fireTouch('touchmove', 400, 300, 1); fireTouch('touchend', 400, 300, 1);
fireTouch('touchstart', 200, 300, 1); fireTouch('touchmove', 400, 300, 1); fireTouch('touchend', 400, 300, 1);
const rolled = player.rollActive === true || player.rollCd > 0;
GAME.state = 'title';
return { rolled, lastDir: touchSwipe.lastDir };`));
check('T10 触屏双滑滚筒不变', t10.rolled === true && t10.lastDir === null, JSON.stringify(t10));

// T11 PC 鼠标相对转向(距离控速, 一分不动)
const t11 = await run.evalJS(ev(`input.mouse.x = W / 2 + 120; input.mouse.movedAt = performance.now() / 1000;
const expected = player.turn * MOUSE_STEER_RATE * clamp(120 / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1) * 0.5;
const h0 = player.heading;
for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
const dM = player.heading - h0;
input.mouse.movedAt = -99;
GAME.state = 'title';
return { dM, expected, W };`));
check('T11 PC 鼠标相对转向不变(距离控速公式)', Math.abs(t11.dM - t11.expected) < 1e-9 && t11.dM > 0, `dM=${t11.dM} exp=${t11.expected} W=${t11.W}`);

await run.stop();

// ---------- 收尾 ----------
const failed = checks.filter(c => !c.pass).length;
const hashAfter = sha256(readFileSync(FILE, 'utf8'));
console.log('HASH_UNCHANGED=' + (hashBefore === hashAfter));
console.log(`\nRESULT steering ${checks.length - failed}/${checks.length} checks passed (mode=${hasMap ? 'GREEN' : 'RED'})`);
if (run.errors.length) console.log('CHROME_ERRORS=' + run.errors.length + '\n' + run.errors.slice(0, 5).join('\n'));
process.exit(failed ? 1 : 0);
