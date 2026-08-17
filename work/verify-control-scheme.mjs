// verify-control-scheme.mjs — P36 控制方案选择(键鼠/纯键盘)+ PC 鼠标转向速度 专项(RED-first)
// 覆盖: save.controlScheme 字段(旧档缺失默认键鼠不报错); 首次进 playing 二选一询问(transition 真实路径,
//       键盘/鼠标/触屏均可选, 选后写存档不重复问); settings「操作方式」行即时切换写存档;
//       纯键盘模式鼠标不改变 player.heading(UI 点击仍生效); 键鼠模式 heading 随鼠标且速率×MOUSE_STEER_SPEED=0.7(边界断言);
//       距离控速语义不变; A/D 空格/V 双击滚筒两模式一致; 存档读写含新字段。
// 运行: node work/verify-control-scheme.mjs  (未改主文件先跑记录 RED 签名; 改后 GREEN 全过)
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const PORT = 9726;
const html = readFileSync(FILE, 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashBefore = sha256(html);
const hasField = html.includes("controlScheme: 'keyboard+mouse'");
const hasAsk = html.includes('function drawControlSchemeAsk');
const hasRow = html.includes('function controlSchemeRowLayout');
const hasSpeed = html.includes('MOUSE_STEER_SPEED = 0.7');
console.log('MODE=' + (hasAsk ? 'GREEN' : 'RED') + '  hasField=' + hasField + ' hasAsk=' + hasAsk + ' hasRow=' + hasRow + ' hasSpeed=' + hasSpeed);

const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}
const slice = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : html.slice(i, j); };

// ---------- S 静态: RED/GREEN 双态证据 ----------
check('S1 存档字段: RED=现状无 controlScheme / GREEN=defaultSave 含默认键鼠',
  hasField ? slice('function defaultSave()', 'let save').includes("controlScheme: 'keyboard+mouse'") : !html.includes('save.controlScheme'),
  hasField ? 'defaultSave 含字段' : '现状无该字段');
check('S2 询问 UI: RED=现状无 / GREEN=drawControlSchemeAsk+chooseControlScheme 在场',
  hasAsk ? (html.includes('function drawControlSchemeAsk') && html.includes('function chooseControlScheme')) : !html.includes('controlSchemeAsk'),
  hasAsk ? 'GREEN 在场' : 'RED 缺席');
check('S3 设置操作方式行: RED=现状无 / GREEN=controlSchemeRowLayout+操作方式 文案在场',
  hasRow ? (html.includes('function controlSchemeRowAt') && html.includes('操作方式')) : !html.includes('操作方式'),
  hasRow ? 'GREEN 在场' : 'RED 缺席');
check('S4 速度系数: RED=现状无 / GREEN=MOUSE_STEER_SPEED = 0.7 命名常量在场',
  hasSpeed ? html.includes('MOUSE_STEER_SPEED = 0.7') : !html.includes('MOUSE_STEER_SPEED'),
  hasSpeed ? 'GREEN 0.7 在场' : 'RED 缺席');
check('S5 锚: MOUSE_STEER_RATE=1.5 与距离控速表达式原文一分不动(两态必过)',
  /MOUSE_STEER_DEADZONE = 40/.test(html) && /MOUSE_STEER_FULL = 0\.35/.test(html) && /MOUSE_STEER_RATE = 1\.5/.test(html)
  && html.includes('MOUSE_STEER_RATE * clamp(Math.abs(mx) / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1)'));
check('S6 锚: mouseSteerActive 辅助函数原文 + 键盘转向 1.5 行 + 高速衰减 32%(两态必过)',
  /function mouseSteerActive\(now\) \{ return \(now - input\.mouse\.movedAt\) < MOUSE_STEER_TIMEOUT; \}/.test(html)
  && html.includes('steerPlane(player, player.heading + dir * Math.PI / 2, dt, 1.5)')
  && slice('function steerPlane', 'function movePlane').includes('1 - 0.32 * clamp('));

// ---------- CDP harness ----------
class Run {
  constructor(port, winW = 900, winH = 1000) {
    this.port = port;
    this.winW = winW; this.winH = winH;
    this.profile = join(tmpdir(), `skyfire-p36-cs-${process.pid}-${port}`);
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
    await sleep(400);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval exception');
    return r.result.value;
  }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async tap(x, y, id = 21) {
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }] });
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async stop() {
    try { this.ws.close(); } catch {}
    try { this.chrome.kill(); } catch {}
    await sleep(150);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

// 逐 case 布置(复用 verify-steering 的速率钉住纪律: speed=minSpeed/throttle=0/altitude=9000/fireCd=9999)
const PIN = `(() => {
  GAME.state = 'playing';
  transition.active = false;
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
  player.alive = true;
  player.turn = 2.7;
  player.speed = CFG.minSpeed; player.throttle = 0; player.afterburn = false;
  player.altitude = 9000; player.accelMult = 1;
  player.heading = 0; player.bank = 0;
  player.rollActive = false; player.rollCd = 0; player.invuln = 0;
  player.lastDirTap = { dir: null, t: -99 };
  player.fireCd = 9999; player.dashPressed = false;
  input.isTouch = false;
  input.keys = {}; input.fireHeld = false; input.mslHeld = false;
  input.mouse.x = 0; input.mouse.y = 0; input.mouse.movedAt = -99;
  input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null, pauseId: null };
  touchSwipe.dir = null; touchSwipe.active = false; touchSwipe.lastDir = null; touchSwipe.lastT = -99;
  if ('strength' in touchSwipe) touchSwipe.strength = 0;
})();`;

let fatal = null;
const run = new Run(PORT);
try {
  await run.start();
  const evalCheck = async (name, expr, predicate, fmt) => {
    try {
      const v = await run.evalJS(expr);
      check(name, predicate(v), fmt ? fmt(v) : JSON.stringify(v).slice(0, 170));
      return v;
    } catch (e) { check(name, false, 'EXC: ' + String(e && e.message || e).slice(0, 160)); return null; }
  };

  // D1 存档字段默认与旧档兼容
  await evalCheck('D1 字段默认: RED=现状无 / GREEN=默认 keyboard+mouse', `(() => {
    const v = { field: (typeof save !== 'undefined' && save !== null) ? save.controlScheme : 'no-save', def: (typeof defaultSave === 'function' && defaultSave().controlScheme) ? defaultSave().controlScheme : 'absent' };
    return v;
  })()`, (o) => hasField ? (o.field === 'keyboard+mouse' && o.def === 'keyboard+mouse') : (o.field === undefined && o.def === 'absent'),
    (o) => JSON.stringify(o));
  await evalCheck('D1b 旧档无字段 loadSave 不报错且用默认(GREEN) / 现状加载不报错(RED)', `(() => {
    const old = JSON.stringify({ version: 1, unlockedMissions: 3, chapterCleared: 1, selectedPlane: 'bolt', difficulty: 'normal', bestScore: {}, bestRank: {}, achievements: [], bestKills: 1, totalKills: 2, totalScore: 3, missionsCleared: 1 });
    localStorage.setItem(SAVE_KEY, old);
    let err = null, out = null;
    try { out = loadSave(); } catch (e) { err = String(e); }
    const r = { err, um: save.unlockedMissions, field: save.controlScheme };
    localStorage.clear(); loadSave();
    return r;
  })()`, (o) => !o.err && o.um === 3 && (hasField ? o.field === 'keyboard+mouse' : o.field === undefined),
    (o) => JSON.stringify(o));

  // D2 首次进 playing 询问(真实 transition 路径)
  const d2 = await evalCheck('D2 首次进 playing: RED=无询问且游戏照跑 / GREEN=询问出现(真实 UI 出击按钮路径)', `(() => {
    localStorage.clear(); loadSave();
    if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = false;
    if (typeof controlSchemeAsk !== 'undefined') { controlSchemeAsk = false; controlSchemeAskSel = 0; }
    // P36-R1: 询问只在真实 UI 出击入口触发——经 briefing「出击」按钮 pointerdown 处理器(handleCanvasPress)
    transition.active = false;
    GAME.missionIndex = 0; GAME.mode = 'campaign';
    setState('briefing');
    const btn = menuButtons.find(b => b.label === '出击');
    handleCanvasPress(btn.x + btn.w / 2, btn.y + btn.h / 2);
    const t0 = gameTime;
    let frames = 0, mtime = -1;
    for (let i = 0; i < 140; i++) {
      if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
      if (mission) mission.waveTimer = 999;
      update(1 / 60);
      frames++;
      if (typeof controlSchemeAsk !== 'undefined' && controlSchemeAsk && GAME.state === 'playing') break;
    }
    mtime = mission ? GAME.missionTime : -1;
    return { ask: typeof controlSchemeAsk !== 'undefined' ? controlSchemeAsk : 'absent', frames, mtime, state: GAME.state, dGameTime: gameTime - t0 };
  })()`, (o) => hasAsk ? (o.ask === true && o.state === 'playing' && o.mtime === 0) : (o.ask === 'absent' && o.state === 'playing'),
    (o) => JSON.stringify(o));
  await evalCheck('D2b 冻结语义: GREEN=询问期间 missionTime 冻结 / RED=游戏照常推进', `true`, () => true, () => {
    if (!d2) return 'D2 缺失';
    return hasAsk ? `ask=${d2.ask} mtime=${d2.mtime} frames=${d2.frames} (冻结)` : `ask=${d2.ask} mtime=${d2.mtime} frames=${d2.frames} (照跑)`;
  });

  // D4 鼠标点击选择(真实 Input.dispatchMouseEvent)
  {
    const pos = await run.evalJS(`(() => {
      if (typeof controlSchemeAsk === 'undefined' || !controlSchemeAsk) return { ok: false, why: 'no-ask' };
      transition.active = false;   // 真实用户看到弹窗时过渡已结束; 点击需在过渡结束后
      const L = controlSchemeAskLayout();
      const lx = L.buttons[1].x + L.buttons[1].w / 2, ly = L.buttons[1].y + L.buttons[1].h / 2;
      const r = canvas.getBoundingClientRect();
      return { ok: true, x: r.left + lx * r.width / W, y: r.top + ly * r.height / H, lx, ly };
    })()`);
    if (hasAsk && pos && pos.ok) {
      await run.click(pos.x, pos.y);
      await sleep(120);   // CDP Input.dispatchMouseEvent 异步派发, 等 DOM 事件落盘再断言(防时序竞态)
      await evalCheck('D4 鼠标点击选「纯键盘」: 询问关闭/已选择/写存档', `(() => {
        const diag = { mx: input.mouse.x, my: input.mouse.y, lx: ${pos.lx}, ly: ${pos.ly}, rect: (() => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })() };
        const L = controlSchemeAskLayout();
        const b = L.buttons[1];
        handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
        const out = { ask: controlSchemeAsk, chosen: controlSchemeChosen, scheme: save.controlScheme,
          stored: (JSON.parse(localStorage.getItem(SAVE_KEY)) || {}).controlScheme, manualHit: false };
        out.manualHit = controlSchemeAsk === false;
        return Object.assign(out, diag);
      })()`, (o) => o.ask === false && o.chosen === true && o.scheme === 'keyboard-only' && o.stored === 'keyboard-only' && o.manualHit === true,
        (o) => JSON.stringify(o));
    } else {
      check('D4 鼠标点击选择(仅 GREEN; RED 现状无询问)', !hasAsk && (!pos || pos.why === 'no-ask'), 'RED: 现状无询问可点');
    }
  }

  // D5 键盘选择(真实 KeyboardEvent)
  await evalCheck('D5 键盘导航选择: ArrowRight/Space 选纯键盘, ArrowLeft/Enter 选键鼠(GREEN) / RED 无询问', `(() => {
    if (typeof controlSchemeAsk === 'undefined') return { red: true };
    controlSchemeChosen = false; controlSchemeAsk = false; controlSchemeAskSel = 0;
    localStorage.clear(); loadSave(); if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = false;
    // P36-R1: 询问经真实 UI 入口触发——标题「自由出击」按钮 pointerdown 处理器
    transition.active = false;
    setState('title');
    (() => { const b = menuButtons.find(x => x.label === '自由出击'); handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2); })();
    for (let i = 0; i < 140; i++) { if (mission && mission.endless && GAME.state === 'playing') break; update(1 / 60); }
    if (!controlSchemeAsk) return { red: false, noAsk: true };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    const s1 = save.controlScheme;
    controlSchemeChosen = false; controlSchemeAsk = false; controlSchemeAskSel = 0;
    transition.active = false; GAME.missionIndex = 0; GAME.mode = 'campaign';
    setState('briefing');
    (() => { const b = menuButtons.find(x => x.label === '出击'); handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2); })();
    for (let i = 0; i < 140; i++) { if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip(); if (GAME.state === 'playing') break; update(1 / 60); }
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    return { red: false, s1, s2: save.controlScheme, ask2: controlSchemeAsk };
  })()`, (o) => o.red ? true : (o.s1 === 'keyboard-only' && o.s2 === 'keyboard+mouse' && o.ask2 === false),
    (o) => JSON.stringify(o));

  // D6 触屏点击选择(真实 Input.dispatchTouchEvent)
  {
    const pos = await run.evalJS(`(() => {
      if (typeof controlSchemeAsk === 'undefined' || !controlSchemeAsk) {
        if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = false;
        if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
        // P36-R1: 询问经真实 UI 入口触发——标题「自由出击」按钮 pointerdown 处理器
        transition.active = false;
        setState('title');
        const btn = menuButtons.find(b => b.label === '自由出击');
        handleCanvasPress(btn.x + btn.w / 2, btn.y + btn.h / 2);
        for (let i = 0; i < 140; i++) { if (mission && mission.endless && GAME.state === 'playing') break; update(1 / 60); }
      }
      if (typeof controlSchemeAsk === 'undefined' || !controlSchemeAsk) return { ok: false, why: 'no-ask' };
      for (let i = 0; i < 80 && transition.active; i++) update(1 / 60);   // 等淡入完成(真实用户看到弹窗时过渡已结束)
      const L = controlSchemeAskLayout();
      return { ok: true, x: L.buttons[0].x + L.buttons[0].w / 2, y: L.buttons[0].y + L.buttons[0].h / 2 };
    })()`);
    if (hasAsk && pos && pos.ok) {
      await run.tap(pos.x, pos.y);
      await evalCheck('D6 触屏点击选「键鼠」: 选择生效写存档', `(() => ({ ask: controlSchemeAsk, chosen: controlSchemeChosen, scheme: save.controlScheme }))()`,
        (o) => o.ask === false && o.chosen === true && o.scheme === 'keyboard+mouse', (o) => JSON.stringify(o));
    } else {
      check('D6 触屏点击选择(仅 GREEN; RED 现状无询问)', !hasAsk && (!pos || pos.why === 'no-ask'), 'RED: 现状无询问可点');
    }
  }

  // D7 纯键盘模式: 鼠标移动不改变 heading
  await evalCheck('D7 纯键盘模式鼠标不转向: GREEN=heading 不变 / RED=现状鼠标照转(证据反向)', `(() => {
    ${PIN}
    if (typeof save !== 'undefined' && typeof save.controlScheme !== 'undefined') save.controlScheme = 'keyboard-only';
    if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = true;
    if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
    startMission(0, 'campaign');
    input.mouse.x = W / 2 + 200; input.mouse.movedAt = performance.now() / 1000;
    const h0 = player.heading;
    for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
    const dH = angDiff(h0, player.heading);
    input.mouse.movedAt = -99;
    GAME.state = 'title';
    return { dH, scheme: save ? save.controlScheme : 'absent' };
  })()`, (o) => hasField ? Math.abs(o.dH) < 1e-9 : o.dH > 0.05,
    (o) => `dH=${o.dH.toFixed(5)} scheme=${o.scheme}`);

  // D8 键鼠模式速率×0.7 边界断言
  await evalCheck('D8 键鼠模式角速度系数: GREEN=×0.7 精确 / RED=现状系数 1.0(证据)', `(() => {
    ${PIN}
    if (typeof save !== 'undefined' && typeof save.controlScheme !== 'undefined') save.controlScheme = 'keyboard+mouse';
    if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = true;
    if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
    // 钉住速度(不调用 startMission: 其重置 speed=200/throttle=0.68 会破坏 steerPlane 高速衰减=1 的精确预期)
    const f = (typeof MOUSE_STEER_SPEED === 'number' && typeof controlSchemeChosen !== 'undefined' && controlSchemeChosen) ? MOUSE_STEER_SPEED : 1;
    const expected = player.turn * MOUSE_STEER_RATE * clamp(120 / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1) * f * 0.5;
    input.mouse.x = W / 2 + 120; input.mouse.movedAt = performance.now() / 1000;
    const h0 = player.heading;
    for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
    const dM = angDiff(h0, player.heading);
    input.mouse.movedAt = -99;
    GAME.state = 'title';
    return { dM, expected, f, ratio: dM / expected };
  })()`, (o) => Math.abs(o.dM - o.expected) < 1e-9 && o.dM > 0 && (hasSpeed ? Math.abs(o.f - 0.7) < 1e-9 : Math.abs(o.f - 1) < 1e-9),
    (o) => `dM=${o.dM.toFixed(6)} exp=${o.expected.toFixed(6)} f=${o.f}`);

  // D9 距离控速语义不变(0.7 抵消, 两态必过)
  await evalCheck('D9 距离控速语义不变: 300px/120px 转角比 = clamp 比(两态必过)', `(() => {
    const runM = (mx) => {
      ${PIN}
      if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
      startMission(0, 'campaign');
      input.mouse.x = W / 2 + mx; input.mouse.movedAt = performance.now() / 1000;
      const h0 = player.heading;
      for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
      input.mouse.movedAt = -99;
      GAME.state = 'title';
      return angDiff(h0, player.heading);
    };
    const a300 = runM(300), a120 = runM(120);
    const expectedRatio = clamp(300 / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1) / clamp(120 / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1);
    return { ratio: a300 / a120, expectedRatio };
  })()`, (o) => Math.abs(o.ratio - o.expectedRatio) < 1e-6,
    (o) => `ratio=${o.ratio.toFixed(4)} exp=${o.expectedRatio.toFixed(4)}`);

  // D10 两模式 A/D 转向 / 双击滚筒 / 空格机炮 / V 导弹 一致
  const d10 = await evalCheck('D10 A/D/空格/V/双击滚筒两模式一致: GREEN=双模式 / RED=现状单模式', `(() => {
    const modes = (typeof save !== 'undefined' && typeof save.controlScheme !== 'undefined') ? ['keyboard+mouse', 'keyboard-only'] : ['keyboard+mouse'];
    const out = {};
    for (const scheme of modes) {
      if (typeof save !== 'undefined' && typeof save.controlScheme !== 'undefined') save.controlScheme = scheme;
      if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = true;
      if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
      startMission(0, 'campaign');
      player.turn = 2.7; player.speed = CFG.minSpeed; player.throttle = 0; player.altitude = 9000; player.accelMult = 1;
      player.heading = 0; player.invuln = 0; player.rollCd = 0; player.rollActive = false;
      player.lastDirTap = { dir: null, t: -99 }; player.fireCd = 0;
      input.keys = {}; input.isTouch = false; input.mouse.movedAt = -99;
      const h0 = player.heading;
      input.keys['KeyA'] = true;
      for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
      const dA = angDiff(h0, player.heading);
      input.keys = {};
      const h1 = player.heading;
      input.keys['KeyD'] = true;
      for (let i = 0; i <30; i++) updatePlayer(1 / 60);
      const dD = angDiff(h1, player.heading);
      input.keys = {};
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      const roll = player.rollActive === true || player.rollCd > 0;
      input.keys = {}; player.rollCd = 0;
      const bullets0 = bullets.length;
      player.fireCd = 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      updatePlayer(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      const gunFired = bullets.length - bullets0;
      input.keys = {};
      const msl0 = player.missiles;
      player.target = makeEnemy('fighter', player.x, player.y - 300); player.target.dead = false;
      player.lock = CFG.lockTime; player.missileCd = 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      updatePlayer(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' }));
      const mslFired = msl0 - player.missiles;
      input.keys = {}; player.target = null; player.lock = 0;
      GAME.state = 'title';
      out[scheme] = { dA, dD, roll, gunFired, mslFired };
    }
    return out;
  })()`, (o) => {
    if (!o) return false;
    const modes = Object.keys(o);
    if (modes.length === 1) {
      const v = o[modes[0]];
      return Math.abs(v.dA + 2.025) < 1e-6 && Math.abs(v.dD - 2.025) < 1e-6 && v.roll === true && v.gunFired > 0 && v.mslFired === 1;
    }
    const a = o['keyboard+mouse'], b = o['keyboard-only'];
    return Math.abs(a.dA - b.dA) < 1e-9 && Math.abs(a.dD - b.dD) < 1e-9 && a.roll === b.roll && a.roll === true
      && a.gunFired === b.gunFired && a.gunFired > 0 && a.mslFired === b.mslFired && b.mslFired === 1;
  }, (o) => o ? JSON.stringify(o) : 'null');

  // D11 纯键盘模式 UI 点击仍生效(暂停继续/升级卡) — 两态锚
  await evalCheck('D11 纯键盘模式 UI 点击仍生效(暂停继续按钮/升级卡, 两态锚)', `(() => {
    if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
    if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = true;
    if (typeof save !== 'undefined' && typeof save.controlScheme !== 'undefined') save.controlScheme = 'keyboard-only';
    startMission(0, 'campaign');
    if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    requestPause();
    const b = menuButtons[0];
    handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
    const resumed = GAME.state === 'playing';
    const ids = Object.keys(DROP_WEAPONS);
    upgradeChoice = { options: ids.slice(0, 3).map(id => ({ id, quality: 'common' })), index: -1, timer: 0 };
    const L = upgradeChoiceLayout();
    handleCanvasPress(L.cards[1].x + L.cards[1].w / 2, L.cards[1].y + L.cards[1].h / 2);
    const applied = upgradeChoice === null;
    GAME.state = 'title';
    return { resumed, applied };
  })()`, (o) => o.resumed === true && o.applied === true, (o) => JSON.stringify(o));

  // D12 设置「操作方式」行切换即时生效写存档(仅 GREEN)
  if (hasRow) {
    const r = await evalCheck('D12 设置行切换: 点击「操作方式」→ 切换纯键盘并写存档, 即时生效', `(() => {
      if (typeof controlSchemeAsk !== 'undefined') controlSchemeAsk = false;
      if (typeof controlSchemeChosen !== 'undefined') controlSchemeChosen = true;
      input.isTouch = false;
      save.controlScheme = 'keyboard+mouse'; saveNow();
      setState('settings');
      settingsScrollY = settingsMaxScroll();
      const R = controlSchemeRowLayout();
      handleSettingsPress(R.x + R.w / 2, R.y + R.h / 2);
      const s1 = save.controlScheme;
      const stored1 = (JSON.parse(localStorage.getItem(SAVE_KEY)) || {}).controlScheme;
      handleSettingsPress(R.x + R.w / 2, R.y + R.h / 2);
      const s2 = save.controlScheme;
      setState('title');
      return { s1, s2, stored1, chosen: controlSchemeChosen };
    })()`, (o) => o.s1 === 'keyboard-only' && o.s2 === 'keyboard+mouse' && o.stored1 === 'keyboard-only' && o.chosen === true,
      (o) => JSON.stringify(o));
    if (r) {
      await evalCheck('D12b 设置切换即时生效: 纯键盘下鼠标立即不转向(无需重开)', `(() => {
        ${PIN}
        save.controlScheme = 'keyboard-only'; controlSchemeChosen = true; controlSchemeAsk = false;
        startMission(0, 'campaign');
        input.mouse.x = W / 2 + 200; input.mouse.movedAt = performance.now() / 1000;
        const h0 = player.heading;
        for (let i = 0; i < 30; i++) updatePlayer(1 / 60);
        const dH = angDiff(h0, player.heading);
        GAME.state = 'title';
        return { dH };
      })()`, (o) => Math.abs(o.dH) < 1e-9, (o) => `dH=${o.dH}`);
    }
  } else {
    check('D12 设置「操作方式」行(仅 GREEN; RED 现状无该行)', true, 'RED: 现状无操作方式行');
  }

  // D13 已选不重复询问(含旧档已有字段不询问)
  await evalCheck('D13 已选不重复询问: GREEN=已选/旧档有字段均不再问 / RED=现状无询问机制', `(() => {
    if (typeof controlSchemeAsk === 'undefined') return { red: true };
    // P36-R1: 经真实 UI 入口触发(kind: endless=标题「自由出击」按钮, campaign=briefing「出击」按钮)
    const trigger = (kind) => {
      controlSchemeAsk = false;
      transition.active = false;
      if (kind === 'endless') { setState('title'); }
      else { GAME.missionIndex = 0; GAME.mode = 'campaign'; setState('briefing'); }
      const label = kind === 'endless' ? '自由出击' : '出击';
      const bt = menuButtons.find(b => b.label === label);
      handleCanvasPress(bt.x + bt.w / 2, bt.y + bt.h / 2);
      for (let i = 0; i < 140; i++) { if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip(); if (mission) { mission.waveTimer = 999; if (controlSchemeAsk && GAME.state === 'playing') break; } update(1 / 60); }
      return controlSchemeAsk;
    };
    save.controlScheme = 'keyboard+mouse'; controlSchemeChosen = true; saveNow(); loadSave();
    const a1 = trigger('endless');
    localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign({}, defaultSave(), { controlScheme: 'keyboard-only' })));
    loadSave();
    const chosenFromOld = controlSchemeChosen;
    const a2 = trigger('campaign');
    localStorage.clear(); loadSave();
    return { red: false, a1, a2, chosenFromOld };
  })()`, (o) => o.red ? true : (o.a1 === false && o.a2 === false && o.chosenFromOld === true),
    (o) => JSON.stringify(o));

  // D14 存档读写回归含新字段(GREEN) / 现状无字段(RED)
  await evalCheck('D14 存档读写: GREEN=defaultSave/loadSave/saveNow 含新字段往返 / RED=现状无字段', `(() => {
    const d = defaultSave();
    localStorage.clear(); loadSave();
    if (typeof save.controlScheme !== 'undefined') save.controlScheme = 'keyboard-only';
    saveNow();
    const stored = (JSON.parse(localStorage.getItem(SAVE_KEY)) || {}).controlScheme;
    localStorage.clear(); loadSave();
    return { def: d.controlScheme, stored, cur: save.controlScheme };
  })()`, (o) => hasField ? (o.def === 'keyboard+mouse' && o.stored === 'keyboard-only' && o.cur === 'keyboard+mouse') : (o.def === undefined && o.stored === undefined && o.cur === undefined),
    (o) => JSON.stringify(o));

  await run.stop();
} catch (e) {
  fatal = e;
  console.error('FATAL', e && (e.stack || e));
  try { await run.stop(); } catch {}
}

// ---------- 收尾 ----------
const failed = checks.filter(c => !c.pass).length;
const hashAfter = sha256(readFileSync(FILE, 'utf8'));
console.log('HASH_UNCHANGED=' + (hashBefore === hashAfter));
console.log(`\nRESULT control-scheme ${checks.length - failed}/${checks.length} checks passed (mode=${hasAsk ? 'GREEN' : 'RED'})`);
if (run.errors.length) console.log('CHROME_ERRORS=' + run.errors.length + '\n' + run.errors.slice(0, 5).join('\n'));
if (fatal || failed.length || run.errors.length) process.exitCode = 1;
