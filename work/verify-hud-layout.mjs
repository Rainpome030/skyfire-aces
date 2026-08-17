// verify-hud-layout.mjs — P38 HUD 重整 专项(RED-first)
// 覆盖: hudRects 单一布局源扩展(hpWin/speedAltBox/雷达新位/面积-50%/标记-50% 命名常量);
//       左上角删 endless sortie 标题仅留任务时间+击杀数(战役另加任务目标);
//       经验窗↔血量窗互换(左下经验/顶部中央血条); 连杀计时在血条下;
//       速度/高度小框在油门条底部下方(格式「速度 xx 高度: xxxx」, 显示框不占命中区);
//       导弹剩余量在「导弹」字样下; 重叠矩阵(视觉框+触控框两两间距>=8px);
//       暂停按钮/油门拖动/导弹发射回归; 竖屏 360x780/390x844 横屏 844x390 + 桌面, DPR 1/2/3 像素探针。
// 运行: node work/verify-hud-layout.mjs  (未改主文件先跑记录 RED 签名)
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
const cnt = (re) => (html.match(re) || []).length;
const DRAWHUD = () => slice('function drawHUD', 'function drawPaused');

// ---------- S 静态 ----------
check('S1 hudRects 含 hpWin + speedAltBox 字段(单一布局源)', /function\s+hudRects\(\)/.test(html)
  && slice('function hudRects', 'function canvasPointFromClient').includes('hpWin')
  && slice('function hudRects', 'function canvasPointFromClient').includes('speedAltBox'));
check('S2 命名常量 RADAR_AREA_SCALE=0.5 / RADAR_MARKER_SCALE=0.5(可调)', /const\s+RADAR_AREA_SCALE\s*=\s*0\.5/.test(html)
  && /const\s+RADAR_MARKER_SCALE\s*=\s*0\.5/.test(html));
check('S3 drawHUD 不再绘制 m.def.code(删 endless sortie 标题)', !DRAWHUD().includes('fillText(m.def.code'));
check('S4 左上角仅任务时间+击杀数(战役另加目标文本)', DRAWHUD().includes("'任务时间 '") && DRAWHUD().includes("'击杀 '")
  && DRAWHUD().includes("'目标：' + m.def.objective") && DRAWHUD().includes("GAME.mode !== 'endless'"));
check('S5 连杀计时画在血条下(引用 hr.hpWin)', DRAWHUD().includes('hr.hpWin')
  && DRAWHUD().includes("'连杀 ×' + GAME.combo") && DRAWHUD().includes('hw.x + hw.w / 2'));
check('S6 速度/高度小框格式「速度 xx 高度: xxxx」', DRAWHUD().includes("'速度 ' + Math.round(player.speed) + ' 高度: ' + Math.round(player.altitude)"));
check('S7 导弹剩余量画在「导弹」字样下且不新增 fillText(\'导弹\')', DRAWHUD().includes("'×' + player.missiles")
  && cnt(/fillText\('导弹'/g) === 1);
check('S8 旧高度字面量保留(桌面分支, verify-altitude a2 契约)', html.includes("'高度 ' + Math.round(player.altitude) + ' m'"));
check('S9 雷达标记缩放收在 blip 内(调用处字面量不变, 僚机静态契约)', html.includes('size = size * RADAR_MARKER_SCALE')
  && html.includes("if (a.kind === 'wingman') blip(a.x, a.y, '#55e6c1', 6, 'wingman')"));
check('S10 雷达半径=基数×√(RADAR_AREA_SCALE)(面积-50%)', html.includes('Math.sqrt(RADAR_AREA_SCALE)') && slice('function hudRects', 'function canvasPointFromClient').includes('radarR = Math.max(92, s * 0.145) * Math.sqrt(RADAR_AREA_SCALE)'));
check('S11 经验窗/武器文本保留(Lv./武器 品质 名称)', DRAWHUD().includes("'Lv.' + GAME.level")
  && DRAWHUD().includes("'武器 ' + QUALITY_NAME[w.quality] + ' ' + w.name"));

// ---------- CDP harness ----------
class Run {
  constructor(port, winW = 900, winH = 1000) {
    this.port = port; this.winW = winW; this.winH = winH;
    this.profile = join(tmpdir(), `skyfire-p38-hl-${process.pid}-${port}`);
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
  if (mission) { mission.complete = false; mission.failed = false; }
`;
const HELPERS = `
  const fireTouch = (type, id, x, y) => {
    const ev = new Event(type, { cancelable: true, bubbles: true });
    Object.defineProperty(ev, 'changedTouches', { value: [{ identifier: id, clientX: x, clientY: y }] });
    canvas.dispatchEvent(ev);
  };
  const overlap = (a, b) => !!(a && b && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
  const gapBetween = (a, b) => {
    if (overlap(a, b)) return 0;
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return Math.max(dx, dy);
  };
`;

const MATRIX = [[360, 780], [390, 844], [844, 390]];
const INSET_SETS = [{ top: 0, right: 0, bottom: 0, left: 0 }, { top: 47, right: 21, bottom: 34, left: 21 }];

const r1 = new Run(9570, 390, 844);
try {
  await r1.start();
  await r1.evalJS(`startEndless(); GAME.state = 'playing';`);
  for (const [vw, vh] of MATRIX) {
    await r1.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    for (const ins of INSET_SETS) {
      const lbl = `${vw}x${vh}@ins${ins.top}`;
      const g = await r1.evalJS(`(() => {
        ${SETUP}
        input.isTouch = true;
        document.documentElement.style.setProperty('--sat', '${ins.top}px');
        document.documentElement.style.setProperty('--sar', '${ins.right}px');
        document.documentElement.style.setProperty('--sab', '${ins.bottom}px');
        document.documentElement.style.setProperty('--sal', '${ins.left}px');
        if (typeof refreshSafeInsets === 'function') refreshSafeInsets();
        resize();
        if (typeof hudRects !== 'function') return { missing: 'hudRects' };
        ${HELPERS}
        const hr = hudRects();
        if (!hr.hpWin || !hr.speedAltBox) return { missing: 'hpWin/speedAltBox', hasHp: !!hr.hpWin, hasSab: !!hr.speedAltBox };
        const s = Math.min(W, H);
        const rExp = Math.max(92, s * 0.145) * Math.sqrt(RADAR_AREA_SCALE);
        const radarBox = { x: hr.radar.x - hr.radar.r, y: hr.radar.y - hr.radar.r, w: hr.radar.r * 2, h: hr.radar.r * 2 };
        const rects = { missionPanel: hr.missionPanel, wingmanPanel: hr.wingmanPanel, throttle: hr.throttle, msl: hr.msl,
          pauseBtn: hr.pauseBtn, statusPanel: hr.statusPanel, radar: radarBox, hpWin: hr.hpWin, speedAltBox: hr.speedAltBox };
        const keys = Object.keys(rects);
        const badPairs = [];
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          const g2 = gapBetween(rects[keys[i]], rects[keys[j]]);
          if (g2 < 8 - 1e-9) badPairs.push(keys[i] + '~' + keys[j] + '=' + g2.toFixed(1));
        }
        const isPortrait = H > W;
        const radOk = Math.abs(hr.radar.r - rExp) < 1e-6
          && (isPortrait
            ? (Math.abs(hr.radar.x - (hr.ml + hr.radar.r)) < 1e-6 && Math.abs(hr.radar.y - (hr.wingmanPanel.y + hr.wingmanPanel.h + 8 + hr.radar.r)) < 1e-6)
            : (Math.abs(hr.radar.x - (hr.wingmanPanel.x + hr.wingmanPanel.w + 8 + hr.radar.r)) < 1e-6 && Math.abs(hr.radar.y - (hr.missionPanel.y + hr.missionPanel.h + 8 + hr.radar.r)) < 1e-6));
        const hpOk = Math.abs(hr.hpWin.y - (hr.wingmanPanel.y + hr.wingmanPanel.h + 8)) < 1e-6
          && hr.hpWin.x >= hr.radar.x + hr.radar.r + 7.9 && hr.hpWin.h > 0;
        const sabOk = Math.abs(hr.speedAltBox.y - (hr.throttle.y + hr.throttle.h + 8)) < 1e-6
          && Math.abs(hr.speedAltBox.x + hr.speedAltBox.w - Math.min(hr.throttle.x + hr.throttle.w, hr.msl.x - 8)) < 1e-6;
        const wingEq = hr.wingmanPanel.y === Math.max(hr.mt + 96, H * 0.18) - 8;
        const pauseEq = hr.pauseBtn.y === hr.mt && hr.pauseBtn.w === 48;
        return { missing: '', radOk, hpOk, sabOk, badPairs, r: hr.radar.r, rExp,
          radar: { x: hr.radar.x, y: hr.radar.y, r: hr.radar.r }, hpWin: hr.hpWin, sab: hr.speedAltBox,
          wingEq, pauseEq, W, H, mt: hr.mt };
      })()`);
      if (g && g.missing) check(`L1 ${lbl} 布局矩阵(${g.missing})`, false, JSON.stringify(g));
      else {
        check(`L1a ${lbl} 雷达半径=基数×√0.5(面积-50%)`, g.radOk, `r=${g.r?.toFixed?.(1)} exp=${g.rExp?.toFixed?.(1)} pos=${JSON.stringify(g.radar)}`);
        check(`L1b ${lbl} 血量窗口在僚机槽下方/雷达右侧`, g.hpOk, JSON.stringify(g.hpWin));
        check(`L1c ${lbl} 速度/高度小框在油门条底部下方`, g.sabOk, JSON.stringify(g.sab));
        check(`L1d ${lbl} 重叠矩阵(视觉框+触控框两两间距>=8px)`, g.badPairs.length === 0, g.badPairs.join(','));
        check(`L1e ${lbl} 僚机槽/暂停槽位置不回归(旧契约)`, g.wingEq && g.pauseEq, `wingEq=${g.wingEq} pauseEq=${g.pauseEq}`);
      }
    }
  }
} catch (e) { check('L1 矩阵运行', false, 'EXC: ' + String(e && e.message || e).slice(0, 200)); }
await r1.stop();

// ---------- L2 像素探针(360x780 触屏, insets 47, DPR 1/2/3) ----------
const r2 = new Run(9571, 390, 844);
try {
  await r2.start();
  await r2.evalJS(`startEndless(); GAME.state = 'playing';`);
  for (const dpr of [1, 2, 3]) {
    await r2.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: dpr, mobile: false });
    await sleep(300);
    const p = await r2.evalJS(`(() => {
      ${SETUP}
      input.isTouch = true;
      document.documentElement.style.setProperty('--sat', '47px');
      document.documentElement.style.setProperty('--sar', '21px');
      document.documentElement.style.setProperty('--sab', '34px');
      document.documentElement.style.setProperty('--sal', '21px');
      if (typeof refreshSafeInsets === 'function') refreshSafeInsets();
      resize();
      const hr = hudRects();
      if (!hr.hpWin) return { missing: 'hpWin' };
      player.weapon = null; GAME.exp = Math.max(1, expNeeded(GAME.level) * 0.5);
      player.missiles = 24; player.hp = player.maxHp; player.hitFlash = 0;
      gameTime = 0; GAME.hintTimer = 0;
      const realDpr = canvas.width / W;
      const M = (r) => Math.round(r * realDpr);
      const reg = (r) => ({ x: M(r.x), y: M(r.y), w: M(r.w), h: M(r.h) });
      const clear = (r) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(M(r.x) - 2, M(r.y) - 2, M(r.w) + 4, M(r.h) + 4); ctx.restore(); };
      const diffCount = (r) => {
        clear(r);
        const bg = ctx.getImageData(M(r.x), M(r.y), M(r.w), M(r.h)).data;
        drawHUD();
        const fg = ctx.getImageData(M(r.x), M(r.y), M(r.w), M(r.h)).data;
        let d = 0;
        for (let i = 0; i < fg.length; i += 4) d += Math.abs(fg[i] - bg[i]) + Math.abs(fg[i + 1] - bg[i + 1]) + Math.abs(fg[i + 2] - bg[i + 2]);
        return d;
      };
      const countIn = (r, sel) => {
        clear(r);
        drawHUD();
        const d = ctx.getImageData(M(r.x), M(r.y), M(r.w), M(r.h)).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (sel(d[i], d[i + 1], d[i + 2], d[i + 3])) n++;
        return n;
      };
      const hpRegion = { x: hr.hpWin.x, y: hr.hpWin.y, w: hr.hpWin.w, h: hr.hpWin.h };
      const expRegion = { x: hr.statusPanel.x, y: hr.statusPanel.y, w: hr.statusPanel.w, h: hr.statusPanel.h };
      const green = (r, g2, b) => r > 45 && r < 100 && g2 > 165 && g2 < 220 && b > 85 && b < 145;
      const expBlue = (r, g2, b) => r > 125 && r < 185 && g2 > 200 && g2 < 245 && b > 235;
      const gold = (r, g2, b) => r > 220 && g2 > 165 && b < 130;
      const hpGreen = countIn(hpRegion, green);
      const expBluePx = countIn(expRegion, expBlue);
      const expGreen = countIn(expRegion, green);
      // 旧触屏雷达位(油门条左、僚机槽下)应已无雷达盘; 探测框 64×64 中心=旧盘心, 不与新雷达盘/任何控件重叠
      const rOld = Math.max(92, Math.min(W, H) * 0.145);
      const oldRadarRegion = { x: hr.throttle.x - 8 - rOld - 32, y: hr.wingmanPanel.y + hr.wingmanPanel.h + 8 + rOld - 32, w: 64, h: 64 };
      const oldRadarDiff = diffCount(oldRadarRegion);
      // 新雷达位应有雷达盘
      const newRadarRegion = { x: hr.radar.x - 46, y: hr.radar.y - 46, w: 92, h: 92 };
      const newRadarDiff = diffCount(newRadarRegion);
      // 速度/高度小框
      const sabDiff = diffCount({ x: hr.speedAltBox.x, y: hr.speedAltBox.y, w: hr.speedAltBox.w, h: hr.speedAltBox.h });
      // 导弹剩余量(导弹字样下)
      const mslBand = { x: hr.msl.x + hr.msl.w / 2 - 24, y: hr.msl.y + hr.msl.h / 2 + 6, w: 48, h: 22 };
      const mslDiff = diffCount(mslBand);
      // 连杀计时(血条下)
      GAME.combo = 4; GAME.comboTimer = 2.5;
      const comboBand = { x: hr.hpWin.x - 10, y: hr.hpWin.y + hr.hpWin.h + 2, w: hr.hpWin.w + 20, h: 28 };
      const comboGold = countIn(comboBand, gold);
      GAME.combo = 0; GAME.comboTimer = 0;
      // 左上角 endless 面板: 无黄色标题/目标(探针区右侧让出右上「复活 ×N」金色文字带, 防像素串扰)
      const panelYellow = countIn({ x: hr.missionPanel.x, y: hr.missionPanel.y, w: hr.missionPanel.w - 62, h: hr.missionPanel.h }, gold);
      return { missing: '', realDpr, want: Math.min(2, ${dpr}), cw: canvas.width, hpGreen, expBluePx, expGreen,
        oldRadarDiff, newRadarDiff, sabDiff, mslDiff, comboGold, panelYellow, W, H,
        hpWin: hr.hpWin, radar: hr.radar };
    })()`);
    if (p && p.missing) check(`L2@DPR${dpr} 像素探针布置`, false, 'missing=' + p.missing);
    else {
      check(`L2a@DPR${dpr} 血量窗绿色血条(顶部中央, DPR坐标)`, p.hpGreen > 30, `green=${p.hpGreen} realDpr=${p.realDpr}/${p.want} cw=${p.cw}/${Math.round(p.W * p.want)}`);
      check(`L2b@DPR${dpr} 经验窗蓝色经验条(左下, 互换完成)`, p.expBluePx > 30 && p.expGreen === 0, `expBlue=${p.expBluePx} green=${p.expGreen}`);
      check(`L2c@DPR${dpr} 旧雷达位已空/新雷达位有盘`, p.oldRadarDiff < 8000 && p.newRadarDiff > 8000, `old=${p.oldRadarDiff} new=${p.newRadarDiff}`);
      check(`L2d@DPR${dpr} 速度/高度小框绘制`, p.sabDiff > 8000, `diff=${p.sabDiff}`);
      check(`L2e@DPR${dpr} 导弹剩余量在「导弹」字样下`, p.mslDiff > 4000, `diff=${p.mslDiff}`);
      check(`L2f@DPR${dpr} 连杀计时在血条下(金色文字)`, p.comboGold > 10, `gold=${p.comboGold}`);
      check(`L2g@DPR${dpr} 左上角无 endless 标题/金色目标(无尽模式)`, p.panelYellow === 0, `yellow=${p.panelYellow}`);
    }
  }
} catch (e) { check('L2 像素探针运行', false, 'EXC: ' + String(e && e.message || e).slice(0, 200)); }
await r2.stop();

// ---------- L3 战役目标文本 + 触控回归 + 桌面布局 ----------
const r3 = new Run(9572, 900, 1000);
try {
  await r3.start();
  const evalCheck = async (name, expr, predicate, fmt) => {
    try { const v = await r3.evalJS(expr); check(name, predicate(v), fmt ? fmt(v) : JSON.stringify(v).slice(0, 160)); }
    catch (e) { check(name, false, 'EXC: ' + String(e && e.message || e).slice(0, 160)); }
  };
  await evalCheck('L3a 战役模式左上角含任务目标文本(金色目标行)', `(() => {
    ${SETUP}
    input.isTouch = true; resize();
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing'; gameTime = 0; GAME.hintTimer = 0;
    const hr = hudRects();
    const realDpr = canvas.width / W;
    const M = (v) => Math.round(v * realDpr);
    ctx.clearRect(M(hr.missionPanel.x), M(hr.missionPanel.y), M(hr.missionPanel.w), M(hr.missionPanel.h));
    drawHUD();
    const d = ctx.getImageData(M(hr.missionPanel.x), M(hr.missionPanel.y), M(hr.missionPanel.w), M(hr.missionPanel.h)).data;
    let gold = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 165 && d[i + 2] < 130) gold++;
    return { gold, mode: GAME.mode };
  })()`, (o) => o && o.gold > 10, (o) => JSON.stringify(o));
  await evalCheck('L3b 暂停按钮命中→paused(回归)', `(() => {
    ${SETUP}${HELPERS}
    startEndless(); GAME.state = 'playing';
    input.isTouch = true; resize();
    const b = hudRects().pauseBtn;
    fireTouch('touchstart', 91, b.x + b.w / 2, b.y + b.h / 2);
    fireTouch('touchend', 91, b.x + b.w / 2, b.y + b.h / 2);
    return { state: GAME.state };
  })()`, (o) => o && o.state === 'paused', (o) => JSON.stringify(o));
  await evalCheck('L3c 油门拖动映射(回归, 条顶=1/条底=0)', `(() => {
    ${SETUP}${HELPERS}
    startEndless(); GAME.state = 'playing';
    input.isTouch = true; resize();
    const tb = hudRects().throttle;
    fireTouch('touchstart', 92, tb.x + tb.w / 2, tb.y + tb.h);
    const atBottom = player.throttle;
    fireTouch('touchmove', 92, tb.x + tb.w / 2, tb.y);
    const atTop = player.throttle;
    fireTouch('touchend', 92, tb.x + tb.w / 2, tb.y);
    return { atBottom, atTop, id: input.touch.throttleBarId };
  })()`, (o) => o && o.atBottom === 0 && o.atTop === 1 && o.id === null, (o) => JSON.stringify(o));
  await evalCheck('L3d 导弹发射(回归, 剩余量-1)', `(() => {
    ${SETUP}${HELPERS}
    startEndless(); GAME.state = 'playing';
    input.isTouch = true; resize();
    const b = hudRects().msl;
    player.target = makeEnemy('fighter', player.x + 300, player.y);
    player.lock = CFG.lockTime; player.missileCd = 0;
    const before = player.missiles;
    fireTouch('touchstart', 93, b.x + b.w / 2, b.y + b.h / 2);
    updatePlayer(0.016);
    const fired = missiles.length;
    fireTouch('touchend', 93, b.x + b.w / 2, b.y + b.h / 2);
    return { before, after: player.missiles, fired };
  })()`, (o) => o && o.fired === 1 && o.after === o.before - 1, (o) => JSON.stringify(o));
  await evalCheck('L3e 桌面: 雷达右下不回归 + hpWin 任务面板下(旧契约)', `(() => {
    ${SETUP}
    input.isTouch = false; resize();
    const hr = hudRects();
    return { wingY: hr.wingmanPanel.y, radarX: hr.radar.x, radarY: hr.radar.y, R: hr.radar.r, W, H, mr: hr.mr, mb: hr.mb,
      hpY: hr.hpWin && hr.hpWin.y, mpBottom: hr.missionPanel.y + hr.missionPanel.h, hasHp: !!hr.hpWin, hasSab: !!hr.speedAltBox };
  })()`, (o) => o && o.wingY === 104 && o.radarX === o.W - 16 - o.R && o.radarY === o.H - 16 - o.R
    && o.hasHp && !o.hasSab && o.hpY >= o.mpBottom + 12.7, (o) => JSON.stringify(o));
  await evalCheck('L3f 桌面像素: hpWin 绿血条 + 状态面板无绿(互换)', `(() => {
    ${SETUP}
    input.isTouch = false; resize();
    startEndless(); GAME.state = 'playing';
    player.weapon = null; GAME.exp = Math.max(1, expNeeded(GAME.level) * 0.5);
    player.hp = player.maxHp; gameTime = 0; GAME.hintTimer = 0;
    const hr = hudRects();
    const realDpr = canvas.width / W;
    const M = (v) => Math.round(v * realDpr);
    ctx.clearRect(M(hr.hpWin.x), M(hr.hpWin.y), M(hr.hpWin.w), M(hr.hpWin.h));
    ctx.clearRect(M(hr.statusPanel.x), M(hr.statusPanel.y), M(hr.statusPanel.w), M(hr.statusPanel.h));
    drawHUD();
    const d1 = ctx.getImageData(M(hr.hpWin.x), M(hr.hpWin.y), M(hr.hpWin.w), M(hr.hpWin.h)).data;
    const d2 = ctx.getImageData(M(hr.statusPanel.x), M(hr.statusPanel.y), M(hr.statusPanel.w), M(hr.statusPanel.h)).data;
    const green = (r, g, b) => r > 45 && r < 100 && g > 165 && g < 220 && b > 85 && b < 145;
    let g1 = 0, g2 = 0;
    for (let i = 0; i < d1.length; i += 4) if (green(d1[i], d1[i + 1], d1[i + 2])) g1++;
    for (let i = 0; i < d2.length; i += 4) if (green(d2[i], d2[i + 1], d2[i + 2])) g2++;
    return { g1, g2 };
  })()`, (o) => o && o.g1 > 30 && o.g2 === 0, (o) => JSON.stringify(o));
} catch (e) { check('L3 回归运行', false, 'EXC: ' + String(e && e.message || e).slice(0, 200)); }
await r3.stop();

check('R1 测试全程无 Runtime 异常', r1.errors.length + r2.errors.length + r3.errors.length === 0,
  (r1.errors.concat(r2.errors, r3.errors).slice(0, 3)).join(' | '));
check('R2 主文件未被测试改动(hash 前后一致)', sha256(readFileSync(FILE, 'utf8')) === hashBefore);

const failed = checks.filter((c) => !c.pass);
console.log(`\n=== hud-layout 结果: ${checks.length - failed.length}/${checks.length} 通过 ===`);
if (failed.length) { console.log('失败项:'); failed.forEach((f) => console.log(' - ' + f.name)); }
process.exit(failed.length ? 1 : 0);
