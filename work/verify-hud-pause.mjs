// verify-hud-pause.mjs — P33 HUD 安全区 + 触屏暂停(含两处冻结补口) 专项(RED-first)
// 覆盖: 安全区缓存(env() CSS 变量 + resize/orientationchange/visualViewport 更新, 禁逐帧 getComputedStyle);
//       hudRects() 单一布局源(绘制=命中=断言); 视口矩阵 360×780/390×844/844×390 × DPR1/2/3 × 非零安全区,
//       每矩形视觉框=触控框、可触控件间距≥8px、雷达×油门条零重叠、暂停按钮 48×48 上方安全区控制槽;
//       触屏暂停命中后 paused、敌/弹/任务时间/combo/pending 全冻结(快照差分)、继续恢复、恢复首帧 dt 钳制、
//       暂停触点不触发开火/导弹/转向、后台事件只暂停不 toggle、暂停中组合器不喷发; 键盘 Esc/P 不回归。
// 运行: node work/verify-hud-pause.mjs  (未改主文件先跑一遍记录 RED 签名)
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
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
check('S1 viewport meta 含 viewport-fit=cover', /viewport-fit=cover/.test(html));
check('S2 CSS :root 安全区变量(env 四边)', /--sat:\s*env\(safe-area-inset-top, 0px\)/.test(html)
  && /--sar:\s*env\(safe-area-inset-right, 0px\)/.test(html)
  && /--sab:\s*env\(safe-area-inset-bottom, 0px\)/.test(html)
  && /--sal:\s*env\(safe-area-inset-left, 0px\)/.test(html));
check('S3 safeInsets()+refreshSafeInsets()+SAFE 缓存在场, resize 调用 refreshSafeInsets',
  /function\s+safeInsets\(\)/.test(html) && /function\s+refreshSafeInsets\(\)/.test(html)
  && /getPropertyValue/.test(slice('function refreshSafeInsets', 'function'))
  && slice('function resize', 'window.addEventListener').includes('refreshSafeInsets();'));
check('S4 orientationchange + visualViewport 监听在场', /window\.addEventListener\('orientationchange', resize\)/.test(html)
  && /visualViewport/.test(html));
check('S5 hudRects() 单一布局源: updateTouchRects 与 drawHUD 均消费 hudRects()',
  /function\s+hudRects\(\)/.test(html)
  && slice('function updateTouchRects', 'updateTouchRects();').includes('hudRects()')
  && slice('function drawHUD', 'function drawPaused').includes('hudRects()')
  && slice('function drawWingmanHud', 'function drawPlaneShape').includes('hudRects()'));
check('S6 requestPause(source)+requestResume 在场, 键盘/后台共用状态机(后台只请求不 toggle)',
  /function\s+requestPause\(source\)/.test(html) && /function\s+requestResume\(\)/.test(html)
  && slice('window.addEventListener(\'keydown\'', 'window.addEventListener(\'keyup\'').includes('requestPause(')
  && /window\.addEventListener\('blur', \(\) => \{ requestPause\('blur'\); \}\)/.test(html)
  && /if \(document\.hidden\) requestPause\('visibility'\)/.test(html));
check('S7 updateCombo 暂停冻结守卫在场', slice('function updateCombo', 'function separateEnemies').includes("if (GAME.state !== 'playing') return;"));
check('S8 pendingTimer 递减加 playing 门控', html.includes('if (GAME.pendingTimer > 0 && GAME.state === \'playing\') {'));
check('S9 touchstart 暂停分支 + endTouch 调 requestPause(触点被消费)',
  html.includes('input.touch.pauseId = t.identifier')
  && slice('function endTouch', 'canvas.addEventListener(\'touchend\'').includes("requestPause('touch')"));
check('S10 暂停菜单: 继续战斗走 requestResume, 返回标题清 pendingTimer',
  slice('state === \'paused\'', '} else if (state === \'settings\')').includes('requestResume()')
  && slice('state === \'paused\'', '} else if (state === \'settings\')').includes("GAME.pendingTimer = 0; GAME.pendingState = null;"));
check('S11 requestPause/requestResume 重置帧时钟(lastTime)',
  slice('function requestPause', 'function requestResume').includes('lastTime = performance.now()')
  && slice('function requestResume', 'function buildMenuButtons').includes('lastTime = performance.now()'));
check('S12 PAUSE_BTN_SIZE=48 + HUD_CONTROL_GAP=8 常量在场',
  /const\s+PAUSE_BTN_SIZE\s*=\s*48/.test(html) && /const\s+HUD_CONTROL_GAP\s*=\s*8/.test(html));
check('S13 绘制消费 hr.throttle/hr.msl/hr.pauseBtn(与命中同源)',
  slice('function drawHUD', 'function drawPaused').includes('hr.throttle')
  && slice('function drawHUD', 'function drawPaused').includes('hr.msl')
  && slice('function drawHUD', 'function drawPaused').includes('hr.pauseBtn'));
check('S14 drawPaused 触屏文案分支在场', slice('function drawPaused', 'function drawUpgradeChoice').includes('input.isTouch'));

// ---------- CDP harness ----------
class Run {
  constructor(port, winW = 900, winH = 1000) {
    this.port = port;
    this.winW = winW; this.winH = winH;
    this.profile = join(tmpdir(), `skyfire-p33-hp-${process.pid}-${port}`);
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

const SETUP = `
  input.keys = {}; input.touch = { active:false, mslId:null, swipeId:null, throttleBarId:null, pauseId:null };
  input.mouse.movedAt = -99; input.mouse.x = 0; input.mouse.y = 0; input.mouse.down = false;
  input.fireHeld = false; input.mslHeld = false;
  touchSwipe.active = false; touchSwipe.dir = null; touchSwipe.lastDir = null; touchSwipe.lastT = -99;
  enemies.length = 0; bullets.length = 0; missiles.length = 0; particles.length = 0; pickups.length = 0; allies.length = 0;
  GAME.state = 'playing'; GAME.freezeTimer = 0; GAME.pendingTimer = 0; GAME.pendingState = null;
  GAME.combo = 0; GAME.comboTimer = 0;
  upgradeChoice = null; transition.active = false; transition.cb = null;
  player.invuln = 0; player.alive = true; player.dead = false; player.hp = player.maxHp;
  player.gunDmgMult = 1; player.fireRateMult = 1;
  player.heading = -Math.PI / 2; player.speed = 200; player.throttle = 0.68;
  player.rollCd = 0; player.dashCd = 0;
  cam.x = player.x; cam.y = player.y; cam.shake = 0; cam.zoom = 1;
  mission.complete = false; mission.failed = false;
`;
const HELPERS = `
  const fireTouch = (type, id, x, y) => {
    const ev = new Event(type, { cancelable: true, bubbles: true });
    Object.defineProperty(ev, 'changedTouches', { value: [{ identifier: id, clientX: x, clientY: y }] });
    canvas.dispatchEvent(ev);
  };
  const overlap = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const gapBetween = (a, b) => {
    if (overlap(a, b)) return 0;
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return Math.max(dx, dy);
  };
`;

let fatal = null;

// ============ M 视口矩阵: 360×780 / 390×844 / 844×390 × DPR 1/2/3 × 非零安全区 ============
const MATRIX = [[360, 780], [390, 844], [844, 390]];
const DPRS = [1, 2, 3];
const INSETS = { top: 47, right: 21, bottom: 34, left: 21 };
const r1 = new Run(9533, 390, 844);
try {
  await r1.start();
  await r1.evalJS(`startEndless(); GAME.state = 'playing';`);
  for (const [vw, vh] of MATRIX) {
    await r1.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const g = await r1.evalJS(`(() => {
      input.isTouch = true;
      document.documentElement.style.setProperty('--sat', '${INSETS.top}px');
      document.documentElement.style.setProperty('--sar', '${INSETS.right}px');
      document.documentElement.style.setProperty('--sab', '${INSETS.bottom}px');
      document.documentElement.style.setProperty('--sal', '${INSETS.left}px');
      if (typeof refreshSafeInsets === 'function') refreshSafeInsets();
      resize();
      if (typeof hudRects !== 'function') return { missing: 'hudRects' };
      ${HELPERS}
      const hr = hudRects();
      const radarBox = { x: hr.radar.x - hr.radar.r, y: hr.radar.y - hr.radar.r, w: hr.radar.r * 2, h: hr.radar.r * 2 };
      const gaps = {
        pauseThrottle: gapBetween(hr.pauseBtn, hr.throttle),
        pauseMsl: gapBetween(hr.pauseBtn, hr.msl),
        throttleMsl: gapBetween(hr.throttle, hr.msl)
      };
      const disc = {
        radarThrottle: overlap(radarBox, hr.throttle),
        radarMsl: overlap(radarBox, hr.msl),
        radarPause: overlap(radarBox, hr.pauseBtn),
        radarStatus: overlap(radarBox, hr.statusPanel),
        radarWingman: overlap(radarBox, hr.wingmanPanel),
        radarMission: overlap(radarBox, hr.missionPanel)
      };
      return {
        W, H, SAFE: { ...SAFE },
        gaps, disc,
        pbEq: PAUSE_BTN.x === hr.pauseBtn.x && PAUSE_BTN.y === hr.pauseBtn.y && PAUSE_BTN.w === hr.pauseBtn.w && PAUSE_BTN.h === hr.pauseBtn.h,
        tbEq: THROTTLE_BAR.x === hr.throttle.x && THROTTLE_BAR.y === hr.throttle.y && THROTTLE_BAR.w === hr.throttle.w && THROTTLE_BAR.h === hr.throttle.h,
        mslEq: MSL_RECT.x === hr.msl.x && MSL_RECT.y === hr.msl.y && MSL_RECT.w === hr.msl.w && MSL_RECT.h === hr.msl.h,
        pauseW: hr.pauseBtn.w, pauseH: hr.pauseBtn.h,
        statusBottom: hr.statusPanel.y + hr.statusPanel.h,
        mslBottom: hr.msl.y + hr.msl.h,
        pauseY: hr.pauseBtn.y, missionY: hr.missionPanel.y,
        wingEq: hr.wingmanPanel.y === Math.max(hr.mt + 96, H * 0.18) - 8
      };
    })()`);
    const ok = (c, p, d = '') => check(c, p, d);
    if (g && g.missing) { ok(`M ${vw}x${vh} hudRects 存在`, false, 'missing=' + g.missing); }
    else {
      const lbl = `${vw}x${vh}`;
      ok(`M1 ${lbl} 视觉框=触控框(PAUSE/THROTTLE/MSL 与 hudRects 同源)`, g.pbEq && g.tbEq && g.mslEq, JSON.stringify({ pbEq: g.pbEq, tbEq: g.tbEq, mslEq: g.mslEq }));
      ok(`M2 ${lbl} 可触控件间距≥8px`, g.gaps.pauseThrottle >= 8 && g.gaps.pauseMsl >= 8 && g.gaps.throttleMsl >= 8, JSON.stringify(g.gaps));
      ok(`M3 ${lbl} 雷达×油门条零重叠带`, !g.disc.radarThrottle, JSON.stringify(g.disc));
      ok(`M4 ${lbl} 雷达不重叠其余控件/HUD(msl/暂停/状态/僚机/任务)`, !g.disc.radarMsl && !g.disc.radarPause && !g.disc.radarStatus && !g.disc.radarWingman && !g.disc.radarMission, JSON.stringify(g.disc));
      ok(`M5 ${lbl} 暂停按钮 48×48 独立控制槽(≥44, 上方安全区)`, g.pauseW === 48 && g.pauseH === 48 && g.pauseY === 47, `pauseW=${g.pauseW} pauseY=${g.pauseY}`);
      ok(`M6 ${lbl} 安全区安置(面板/导弹入底缘, 任务面板入顶缘)`, g.statusBottom <= g.H - 34 + 0.01 && g.mslBottom <= g.H - 34 + 0.01 && g.missionY === 47, `statusBottom=${g.statusBottom} H-34=${g.H - 34}`);
      ok(`M7 ${lbl} 僚机 HUD 位置不回归(y=max(mt+96,H*0.18)-8)`, g.wingEq === true, 'wingEq=' + g.wingEq);
    }
    for (const dpr of DPRS) {
      await r1.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: dpr, mobile: false });
      await sleep(300);
      const p = await r1.evalJS(`(() => {
        input.isTouch = true;
        if (typeof refreshSafeInsets === 'function') refreshSafeInsets();
        resize();
        if (typeof hudRects !== 'function') return { missing: 'hudRects' };
        const hr = hudRects();
        const b = hr.pauseBtn;
        const realDpr = canvas.width / W;
        const rx = Math.round(b.x * realDpr), ry = Math.round(b.y * realDpr);
        const rw = Math.round(b.w * realDpr), rh = Math.round(b.h * realDpr);
        ctx.clearRect(rx - 2, ry - 2, rw + 4, rh + 4);
        const bg = Array.from(ctx.getImageData(rx + 2, ry + 2, rw - 4, rh - 4).data);
        drawHUD();
        const fg = Array.from(ctx.getImageData(rx + 2, ry + 2, rw - 4, rh - 4).data);
        let d = 0;
        for (let i = 0; i < fg.length; i += 4) d += Math.abs(fg[i] - bg[i]) + Math.abs(fg[i + 1] - bg[i + 1]) + Math.abs(fg[i + 2] - bg[i + 2]);
        return { d, realDpr, want: Math.min(2, ${dpr}), cw: canvas.width, W, H, bx: b.x, by: b.y, bw: b.w };
      })()`);
      check(`M8 ${vw}x${vh}@DPR${dpr} 暂停按钮像素探针(坐标×DPR, 绘制真实存在)`,
        p && !p.missing && p.d > 20000 && p.realDpr === p.want && p.cw === Math.round(p.W * p.want),
        p ? `diff=${p.d} realDpr=${p.realDpr} cw=${p.cw} W=${p.W} btn=${p.bx},${p.by}@${p.bw}` : 'no result');
    }
  }
} catch (e) { fatal = e; check('矩阵运行', false, 'EXC: ' + String(e && e.message || e).slice(0, 200)); }
await r1.stop();

// ============ P 暂停行为(900×1000 触屏竖屏) ============
const run = new Run(9534, 900, 1000);
try {
  await run.start();
  await run.evalJS(`startEndless(); GAME.state = 'playing';`);
  const evalCheck = async (name, expr, predicate, fmt) => {
    try {
      const v = await run.evalJS(expr);
      check(name, predicate(v), fmt ? fmt(v) : JSON.stringify(v).slice(0, 160));
    } catch (e) { check(name, false, 'EXC: ' + String(e && e.message || e).slice(0, 160)); }
  };

  // 桌面基线: 僚机/雷达位置不回归(无触屏)
  await evalCheck('P0 桌面布局不回归(僚机 y=104, 雷达右下角)', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = false;
    resize();
    if (typeof hudRects !== 'function') return { missing: 'hudRects' };
    const hr = hudRects();
    return { wingY: hr.wingmanPanel.y, radarX: hr.radar.x, radarY: hr.radar.y, R: hr.radar.r, W, H, mr: hr.mr, mb: hr.mb };
  })()`, (o) => o && o.wingY === 104 && o.radarX === o.W - 16 - o.R && o.radarY === o.H - 16 - o.R);

  // P1 触屏暂停按钮命中 → paused; 触点被消费(不触发开火/导弹/转向)
  await evalCheck('P1 暂停按钮命中→paused, 触点被消费(子弹/导弹/转向零变化)', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = true; resize();
    if (typeof hudRects !== 'function') return { missing: 'hudRects' };
    const b = hudRects().pauseBtn;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const b0 = bullets.length, m0 = missiles.length, h0 = player.heading;
    fireTouch('touchstart', 77, cx, cy);
    fireTouch('touchend', 77, cx, cy);
    return { state: GAME.state, bullets: bullets.length, missiles: missiles.length, hd: player.heading, h0,
      pauseId: input.touch.pauseId, swipeActive: touchSwipe.active, mslHeld: input.mslHeld, fireHeld: input.fireHeld };
  })()`, (o) => o && o.state === 'paused' && o.bullets === 0 && o.missiles === 0 && Math.abs(o.hd - o.h0) < 1e-9
    && o.pauseId === null && !o.swipeActive && !o.mslHeld && !o.fireHeld, (o) => JSON.stringify(o));

  // P2 快照差分: 敌/弹/任务时间/连击/结算/combo/冷却全冻结
  await evalCheck('P2 暂停冻结快照差分(敌/弹/任务时间/combo/pending/冷却 全增量 0)', `(() => {
    ${SETUP}${HELPERS}
    const e = makeEnemy('fighter', player.x + 60, player.y - 60); e.speed = 60; e.fireCd = 5; enemies.push(e);
    bullets.push({ x: e.x + 40, y: e.y, vx: -90, vy: 0, life: 2, fromPlayer: false, dmg: 5, r: 3 });
    GAME.mode = 'endless'; GAME.combo = 4; GAME.comboTimer = 2.5;
    GAME.pendingTimer = 1.7; GAME.pendingState = 'complete';
    player.rollCd = 0.8; player.dashCd = 1.2;
    GAME.score = 1234;
    const sn = () => ({ ex: e.x, ey: e.y, bx: bullets[0].x, by: bullets[0].y, mt: GAME.missionTime,
      combo: GAME.combo, ct: GAME.comboTimer, pt: GAME.pendingTimer, sc: GAME.score,
      rc: player.rollCd, dc: player.dashCd, px: player.x, sp: player.speed });
    const a = sn();
    if (typeof requestPause === 'function') requestPause('test'); else GAME.state = 'paused';
    for (let i = 0; i < 10; i++) update(0.5);
    const b = sn();
    const still = GAME.state === 'paused';
    if (typeof requestResume === 'function') requestResume();
    update(1 / 60);
    const c = sn();
    const deltas = Object.keys(a).map(k => Math.abs(b[k] - a[k]));
    return { deltas, still, mtAfter: c.mt, ptAfter: c.pt };
  })()`, (o) => o && o.deltas.every(d => d < 1e-9) && o.still === true && o.mtAfter > 0 && o.ptAfter < 1.7,
    (o) => JSON.stringify(o));

  // P3 恢复首帧 dt 钳制: 陈旧 lastTime 在恢复时被重置(setState 内音频初始化在 headless 下同步阻塞 ~0.4s, 阈值放宽到 1s; 判别式: 陈旧值 5000ms 被重置)
  await evalCheck('P3 恢复重置上一帧时间戳(lastTime 钳制)', `(() => {
    ${SETUP}
    if (typeof requestPause !== 'function') return { missing: 'requestPause' };
    requestPause('t');
    lastTime = performance.now() - 5000;
    requestResume();
    return { fresh: (performance.now() - lastTime) < 1.0, state: GAME.state };
  })()`, (o) => o && o.fresh === true && o.state === 'playing', (o) => JSON.stringify(o));

  // P4 后台事件只暂停不 toggle(blur×2 不回 playing; visible 事件 no-op)
  await evalCheck('P4 后台事件只请求暂停不 toggle', `(() => {
    ${SETUP}
    window.dispatchEvent(new Event('blur'));
    const s1 = GAME.state;
    window.dispatchEvent(new Event('blur'));
    const s2 = GAME.state;
    document.dispatchEvent(new Event('visibilitychange'));
    const s3 = GAME.state;
    if (typeof requestResume === 'function') requestResume();
    document.dispatchEvent(new Event('visibilitychange'));
    const s4 = GAME.state;
    return { s1, s2, s3, s4 };
  })()`, (o) => o && o.s1 === 'paused' && o.s2 === 'paused' && o.s3 === 'paused' && o.s4 === 'playing', (o) => JSON.stringify(o));

  // P5 连击计时冻结(RED 判别: 旧版暂停中 comboTimer 继续衰减)
  await evalCheck('P5 暂停中连击计时冻结(updateCombo 补口)', `(() => {
    ${SETUP}
    GAME.mode = 'endless'; GAME.combo = 4; GAME.comboTimer = 2.5;
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    for (let i = 0; i < 4; i++) update(0.25);
    return { combo: GAME.combo, t: GAME.comboTimer };
  })()`, (o) => o && o.combo === 4 && Math.abs(o.t - 2.5) < 1e-9, (o) => JSON.stringify(o));

  // P6 结算倒计时冻结(RED 判别: 旧版暂停中 pendingTimer 递减甚至触发结算)
  await evalCheck('P6 暂停中结算倒计时冻结(pendingTimer 补口)', `(() => {
    ${SETUP}
    GAME.pendingTimer = 1.0; GAME.pendingState = 'complete';
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    for (let i = 0; i < 3; i++) update(0.5);
    return { state: GAME.state, pt: GAME.pendingTimer, ps: GAME.pendingState };
  })()`, (o) => o && o.state === 'paused' && Math.abs(o.pt - 1.0) < 1e-9 && o.ps === 'complete', (o) => JSON.stringify(o));

  // P7 进入暂停清触控/持续开火/转向状态(防恢复粘键)
  await evalCheck('P7 进入暂停清理触控/持续开火/转向(粘键清除)', `(() => {
    ${SETUP}
    input.isTouch = true; input.fireHeld = true; input.mslHeld = true; input.mouse.down = true;
    touchSwipe.active = true; touchSwipe.dir = 'left';
    input.touch.swipeId = 3; input.touch.mslId = 4; input.touch.throttleBarId = 5;
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    return { fireHeld: input.fireHeld, mslHeld: input.mslHeld, md: input.mouse.down,
      swA: touchSwipe.active, swD: touchSwipe.dir, mslId: input.touch.mslId, thrId: input.touch.throttleBarId, swipeId: input.touch.swipeId };
  })()`, (o) => o && !o.fireHeld && !o.mslHeld && !o.md && !o.swA && o.swD === null && o.mslId === null && o.thrId === null && o.swipeId === null,
    (o) => JSON.stringify(o));

  // P8 键盘 Esc/P 不回归(Esc→暂停, P→继续)
  await evalCheck('P8 键盘 Esc 暂停 / P 继续(回归)', `(() => {
    ${SETUP}
    input.isTouch = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const s1 = GAME.state;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    const s2 = GAME.state;
    return { s1, s2 };
  })()`, (o) => o && o.s1 === 'paused' && o.s2 === 'playing', (o) => JSON.stringify(o));

  // P9 升级模态: 键盘 P 暂停且模态保留(历史语义), Esc 放弃(回归)
  await evalCheck('P9 升级模态 P 暂停保留模态 + Esc 放弃回归', `(() => {
    ${SETUP}
    upgradeChoice = { options: [], timer: 5, skip: { x: 0, y: 0, w: 10, h: 10 } };
    let r;
    if (typeof requestPause === 'function') { r = requestPause('t'); }
    else { r = 'undefined'; }
    const s1 = GAME.state, keep = !!upgradeChoice;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    const s2 = GAME.state;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const afterEsc = upgradeChoice === null;
    return { r, s1, keep, s2, afterEsc };
  })()`, (o) => o && o.r === true && o.s1 === 'paused' && o.keep === true && o.s2 === 'playing' && o.afterEsc === true, (o) => JSON.stringify(o));

  // P10 过渡动画中 requestPause 拒绝
  await evalCheck('P10 transition.active 时 requestPause 返回 false 且状态不变', `(() => {
    ${SETUP}
    transition.active = true;
    let r;
    if (typeof requestPause === 'function') r = requestPause('t');
    else r = 'undefined';
    return { r, state: GAME.state };
  })()`, (o) => o && o.r === false && o.state === 'playing', (o) => JSON.stringify(o));

  // P11 暂停菜单触屏点「继续战斗」恢复
  await evalCheck('P11 暂停菜单触屏点「继续战斗」→ playing(回归)', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = true;
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    const b = menuButtons[0];
    fireTouch('touchstart', 81, b.x + b.w / 2, b.y + b.h / 2);
    fireTouch('touchend', 81, b.x + b.w / 2, b.y + b.h / 2);
    return { state: GAME.state };
  })()`, (o) => o && o.state === 'playing', (o) => JSON.stringify(o));

  // P12 返回标题取消未完成 pendingTimer
  await evalCheck('P12 暂停菜单「返回标题」取消 pendingTimer', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = true;
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    GAME.pendingTimer = 1.5; GAME.pendingState = 'complete';
    const b = menuButtons[menuButtons.length - 1];
    fireTouch('touchstart', 82, b.x + b.w / 2, b.y + b.h / 2);
    fireTouch('touchend', 82, b.x + b.w / 2, b.y + b.h / 2);
    return { pending: GAME.pendingTimer, pendingState: GAME.pendingState };
  })()`, (o) => o && o.pending === 0 && o.pendingState === null, (o) => JSON.stringify(o));

  // P13 暂停中组合器不喷发(HitFeedback 被 reset, 无补喷)
  await evalCheck('P13 暂停中命中聚合器不喷发(markT 归零)', `(() => {
    ${SETUP}
    if (typeof requestPause === 'function') requestPause('t'); else GAME.state = 'paused';
    if (typeof HitFeedback !== 'undefined') { HitFeedback.noteHit(100, 100); HitFeedback.noteKill(); }
    for (let i = 0; i < 3; i++) update(1 / 60);
    return { markT: typeof HitFeedback !== 'undefined' ? HitFeedback.markT : -1, n: typeof HitFeedback !== 'undefined' ? HitFeedback.n : -1 };
  })()`, (o) => o && o.markT === 0, (o) => JSON.stringify(o));

  // P14 按钮外 8px 轻点不触发暂停(命中区精确)
  await evalCheck('P14 暂停按钮外 8px 轻点不暂停(命中区精确)', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = true; resize();
    if (typeof hudRects !== 'function') return { missing: 'hudRects' };
    const b = hudRects().pauseBtn;
    fireTouch('touchstart', 88, b.x - 10, b.y + b.h / 2);
    fireTouch('touchend', 88, b.x - 10, b.y + b.h / 2);
    return { state: GAME.state };
  })()`, (o) => o && o.state === 'playing', (o) => JSON.stringify(o));

  // P15 油门条触控不回归(动态坐标命中映射)
  await evalCheck('P15 油门条触控映射不回归(条顶=1)', `(() => {
    ${SETUP}${HELPERS}
    input.isTouch = true; resize();
    const bx = THROTTLE_BAR.x + THROTTLE_BAR.w / 2;
    fireTouch('touchstart', 11, bx, THROTTLE_BAR.y);
    fireTouch('touchend', 11, bx, THROTTLE_BAR.y);
    return { throttle: player.throttle, state: GAME.state };
  })()`, (o) => o && Math.abs(o.throttle - 1) < 1e-9 && o.state === 'playing', (o) => JSON.stringify(o));

  // P16 全测试无运行时异常
  check('P16 CDP 全程无 Uncaught 异常', run.errors.length === 0, run.errors.slice(0, 3).join(' || '));
} catch (e) { fatal = e; check('行为运行', false, 'EXC: ' + String(e && e.message || e).slice(0, 200)); }
await run.stop();

// ---------- 汇总 ----------
const pass = checks.filter(c => c.pass).length;
const fail = checks.filter(c => !c.pass).length;
console.log(`\nRESULT ${pass}/${checks.length} checks passed (FAIL ${fail})  hash-before=${hashBefore.slice(0, 12)} hash-after=${sha256(readFileSync(FILE, 'utf8')).slice(0, 12)}`);
process.exit(fatal || fail ? 1 : 0);
