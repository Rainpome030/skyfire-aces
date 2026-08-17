import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const configs = [
  { name: '360x800@1', width: 360, height: 800, dpr: 1, port: 9471 },
  { name: '390x844@3', width: 390, height: 844, dpr: 3, port: 9472 },
  { name: '1365x768@1.25', width: 1365, height: 768, dpr: 1.25, port: 9473 },
  { name: '844x390@2', width: 844, height: 390, dpr: 2, port: 9474 }
];
const states = ['title', 'briefing', 'complete', 'gameover', 'paused', 'settings', 'hangar', 'achievements', 'select'];
const expectedButtons = { title: 4, briefing: 3, complete: 2, gameover: 2, paused: 4, settings: 2, hangar: 2, achievements: 1, select: 1 };
const pointFractions = [[0.08, 0.5], [0.5, 0.5], [0.92, 0.5], [0.08, 0.12], [0.92, 0.12], [0.08, 0.88], [0.92, 0.88]];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

class BrowserRun {
  constructor(config) {
    this.config = config;
    this.profile = `${ROOT}/work/chrome-profile-buttons-${config.port}`;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true });
    mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--mute-audio', '--disable-features=Translate',
      `--remote-debugging-port=${this.config.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.config.width},${this.config.height}`,
      'file:///' + FILE.replace(/\\/g, '/')
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', (data) => {
      const text = String(data);
      if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(text)) this.errors.push(text.trim());
    });
    let target;
    for (let i = 0; i < 80; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.config.port}/json/list`)).json();
        target = list.find((item) => item.type === 'page');
        if (target) break;
      } catch { }
      await sleep(100);
    }
    if (!target) throw new Error(`Chrome target not found: ${this.config.name}`);
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.config.width, height: this.config.height,
      deviceScaleFactor: this.config.dpr, mobile: false
    });
    await this.send('Page.reload', { ignoreCache: true });
    await sleep(500);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async mouse(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async touch(x, y, id = 1, hold = false) {
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }] });
    if (!hold) await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  async stop() {
    try { if (this.ws) this.ws.close(); } catch { }
    try { if (this.chrome) this.chrome.kill(); } catch { }
    await sleep(150);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

const SETUP_STATE = (state) => `(() => {
  transition.active = false; transition.alpha = 0; transition.cb = null;
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
  upgradeChoice = null;
  input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null };
  input.mslHeld = false; input.fireHeld = false;
  if (${JSON.stringify(state)} === 'paused') {
    startMission(0, 'campaign');
    if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    setState('paused');
  } else {
    GAME.mode = 'campaign'; GAME.missionIndex = 0;
    GAME.endStats = { success: true, code: 'TEST', missionName: 'TEST', time: 1, kills: 0, accuracy: 1, damage: 0, timeBonus: 0, score: 0, rating: { rank: 'A', total: 80, parts: {} } };
    setState(${JSON.stringify(state)});
  }
  window.__buttonHit = 0;
  menuButtons.forEach((b, i) => { b.action = () => { window.__buttonHit = i + 1; }; });
  return { count: menuButtons.length, buttons: menuButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, label: b.label })), W, H, dpr: DPR, rect: (() => { const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })() };
})()`;

async function clientPoint(run, logicalX, logicalY) {
  return run.eval(`(() => { const r = canvas.getBoundingClientRect(); return { x: r.left + ${logicalX} * r.width / W, y: r.top + ${logicalY} * r.height / H }; })()`);
}

async function runMenuMatrix(run, kind) {
  let passed = 0;
  let total = 0;
  let inside = true;
  const failures = [];
  for (const state of states) {
    const setup = await run.eval(SETUP_STATE(state));
    if (setup.count !== expectedButtons[state]) throw new Error(`${state}: expected ${expectedButtons[state]} buttons, got ${setup.count}`);
    for (let index = 0; index < setup.buttons.length; index++) {
      const b = setup.buttons[index];
      inside = inside && b.x >= 0 && b.y >= 0 && b.x + b.w <= setup.W && b.y + b.h <= setup.H;
      for (let pointIndex = 0; pointIndex < pointFractions.length; pointIndex++) {
        const [fx, fy] = pointFractions[pointIndex];
        await run.eval(SETUP_STATE(state));
        const point = await clientPoint(run, b.x + b.w * fx, b.y + b.h * fy);
        if (kind === 'mouse') await run.mouse(point.x, point.y);
        else await run.touch(point.x, point.y, 11);
        const outcome = await run.eval(`({ hit: window.__buttonHit, mslId: input.touch.mslId, throttleBarId: input.touch.throttleBarId })`);
        if (outcome.hit === index + 1 && outcome.mslId === null && outcome.throttleBarId === null) passed++;
        else failures.push(`${state}/${index}:${b.label}/p${pointIndex}/hit=${outcome.hit}`);
        total++;
      }
    }
  }
  return { passed, total, inside, failures };
}

async function testRouting(run) {
  const state = await run.eval(SETUP_STATE('title'));
  const missile = await run.eval(`({ x: MSL_RECT.x + MSL_RECT.w / 2, y: MSL_RECT.y + MSL_RECT.h / 2 })`);
  let p = await clientPoint(run, missile.x, missile.y);
  await run.touch(p.x, p.y, 51);
  const nonCombat = await run.eval(`({ mslId: input.touch.mslId, throttleBarId: input.touch.throttleBarId, held: input.mslHeld })`);
  check(`${run.config.name} 非战斗导弹热区不抢占`, nonCombat.mslId === null && nonCombat.throttleBarId === null && !nonCombat.held, JSON.stringify(nonCombat));

  await run.eval(`(() => { startMission(0, 'campaign'); ChapterCard.skip(); transition.active = false; GAME.state = 'playing'; upgradeChoice = null; input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null }; input.mslHeld = false; })()`);
  p = await clientPoint(run, missile.x, missile.y);
  await run.touch(p.x, p.y, 52, true);
  const combat = await run.eval(`({ mslId: input.touch.mslId, held: input.mslHeld })`);
  check(`${run.config.name} 战斗导弹按住保留`, combat.mslId === 52 && combat.held === true, JSON.stringify(combat));
  await run.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function testUpgradePriority(run) {
  if (run.config.width !== 360) return;
  const geometry = await run.eval(`(() => {
    startEndless(); if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    transition.active = false; GAME.state = 'playing';
    const ids = Object.keys(DROP_WEAPONS);
    upgradeChoice = { options: ids.slice(0, 3).map(id => ({ id, quality: 'common' })), index: -1, timer: 0 };
    input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null }; input.mslHeld = false;
    const bw = Math.min(720, W * 0.9), bx = W / 2 - bw / 2, by = H * 0.24;
    const cardW = Math.min(200, (bw - 80) / 3), cardH = 130, gap = Math.min(16, (bw - cardW * 3) / 4);
    const cardX = bx + gap + 2 * (cardW + gap), cardY = by + 110;
    MSL_RECT.x = cardX + cardW * 0.55; MSL_RECT.y = cardY + cardH * 0.45;
    MSL_RECT.w = cardW * 0.45; MSL_RECT.h = cardH * 0.55;
    const left = Math.max(cardX + 2, MSL_RECT.x + 2), right = Math.min(cardX + cardW - 2, MSL_RECT.x + MSL_RECT.w - 2);
    const top = Math.max(cardY + 2, MSL_RECT.y + 2), bottom = Math.min(cardY + cardH - 2, MSL_RECT.y + MSL_RECT.h - 2);
    return { x: (left + right) / 2, y: (top + bottom) / 2, overlaps: left <= right && top <= bottom };
  })()`);
  check('升级卡与导弹热区测试几何相交', geometry.overlaps, JSON.stringify(geometry));
  const p = await clientPoint(run, geometry.x, geometry.y);
  await run.touch(p.x, p.y, 61);
  const result = await run.eval(`({ chosen: upgradeChoice === null, mslId: input.touch.mslId, held: input.mslHeld })`);
  check('playing + upgradeChoice 升级卡优先于导弹', result.chosen && result.mslId === null && !result.held, JSON.stringify(result));
}

async function testCssScaling(run) {
  if (run.config.width !== 360) return;
  for (const scale of [0.5, 1.5]) {
    for (const kind of ['mouse', 'touch']) {
      await run.eval(SETUP_STATE('title'));
      const setup = await run.eval(`(() => { canvas.style.width = '${scale * 100}vw'; canvas.style.height = '${scale * 100}vh'; const b = menuButtons[0]; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })()`);
      const p = await clientPoint(run, setup.x, setup.y);
      if (kind === 'mouse') await run.mouse(p.x, p.y);
      else await run.touch(p.x, p.y, 70);
      const hit = await run.eval('window.__buttonHit');
      check(`CSS ${scale}x ${kind} 逻辑坐标命中`, hit === 1, `hit=${hit}`);
      await run.eval(`canvas.style.width = '100vw'; canvas.style.height = '100vh';`);
    }
  }
}

async function testSpecialTargets(run) {
  if (run.config.width !== 360) return;
  const cases = [
    { name: '设置行', setup: `setState('settings'); captureBind = null; const L = settingsLayout(); return { x: L.rowX + L.rowW / 2, y: L.startY + L.rowH / 2 };`, result: `captureBind === SETTINGS_ACTIONS[0].action` },
    { name: '机库卡', setup: `save.selectedPlane = 'bolt'; setState('hangar'); const L = hangarLayout(); return { x: L.cardsX + L.cardW / 2, y: L.cardsY + L.cardH / 2 };`, result: `save.selectedPlane === Object.keys(PLANE_DEFS)[0]` },
    { name: '标题成就入口', setup: `setState('title'); const r = titleAchRegion(); return { x: r.x + r.w / 2, y: r.y + r.h / 2 };`, result: `GAME.state === 'achievements'` },
    { name: '选关卡', setup: `save.unlockedMissions = MISSION_DEFS.length; setState('select'); const L = selectLayout(); return { x: L.startX + L.cardW / 2, y: L.groups[0].y + L.labelH + L.cardH / 2 };`, result: `GAME.state === 'briefing' && GAME.missionIndex === 0` }
  ];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const logical = await run.eval(`(() => { transition.active = false; if (ChapterCard.isActive()) ChapterCard.skip(); upgradeChoice = null; input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null }; ${item.setup} })()`);
    const p = await clientPoint(run, logical.x, logical.y);
    await run.touch(p.x, p.y, 80 + i);
    const ok = await run.eval(item.result);
    check(`${item.name}真实触摸`, ok === true);
  }
}

let fatal = null;
for (const config of configs) {
  const run = new BrowserRun(config);
  try {
    await run.start();
    const actual = await run.eval(`({ W, H, DPR, innerWidth, innerHeight })`);
    check(`${config.name} 逻辑视口`, actual.W === config.width && actual.H === config.height, JSON.stringify(actual));
    if (config.dpr === 3) check(`${config.name} DPR钳制为2`, actual.DPR === 2, `DPR=${actual.DPR}`);
    const mouse = await runMenuMatrix(run, 'mouse');
    const touch = await runMenuMatrix(run, 'touch');
    check(`${config.name} 按钮均在视口`, mouse.inside, `mouse=${mouse.passed}/${mouse.total}`);
    check(`${config.name} 鼠标菜单矩阵`, mouse.passed === 147 && mouse.total === 147, `${mouse.passed}/${mouse.total} ${mouse.failures.join(',')}`);
    check(`${config.name} 触摸菜单矩阵`, touch.passed === 147 && touch.total === 147, `${touch.passed}/${touch.total} ${touch.failures.join(',')}`);
    await testRouting(run);
    await testUpgradePriority(run);
    await testCssScaling(run);
    await testSpecialTargets(run);
    check(`${config.name} Chrome无运行时错误`, run.errors.length === 0, run.errors.join(' | '));
  } catch (error) {
    fatal = error;
    console.error(`FATAL ${config.name}:`, error.stack || error);
  } finally {
    await run.stop();
  }
  if (fatal) break;
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map((item) => item.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;
