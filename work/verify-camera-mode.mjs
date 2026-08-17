import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const checks = [];

function check(name, pass, detail = '') {
  checks.push(!!pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class BrowserRun {
  constructor() {
    this.port = 9898;
    this.profile = join(tmpdir(), `skyfire-camera-mode-${process.pid}`);
    this.pending = new Map();
    this.id = 0;
    this.errors = [];
  }

  async start() {
    rmSync(this.profile, { recursive: true, force: true });
    mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      '--window-size=1280,720', 'file:///' + FILE
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        target = list.find(item => item.type === 'page');
        if (target) break;
      } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target not found');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.reload', { ignoreCache: true });
    await sleep(350);
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

  async stop() {
    try { this.ws?.close(); } catch {}
    try { this.chrome?.kill(); } catch {}
    await sleep(120);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

check('静态存在持久化视角设置', html.includes("cameraMode: CAMERA_HEADING_UP") && html.includes('save.cameraMode !== CAMERA_WORLD_UP'));
check('静态存在设置页视角开关', html.includes('function cameraModeRowLayout') && html.includes("ctx.fillText('视角模式'"));
check('世界与方向HUD共用视角角度', (html.match(/cameraViewAngle\(\)/g) || []).length >= 6);
check('旧追尾角度只保留在统一函数内', (html.match(/-Math\.PI \/ 2 - player\.heading/g) || []).length === 1);

const run = new BrowserRun();
let fatal = null;
try {
  await run.start();

  const migration = await run.eval(`(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, selectedPlane: 'gale', difficulty: 'normal' }));
    loadSave(); const missing = save.cameraMode;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, selectedPlane: 'gale', difficulty: 'normal', cameraMode: 'bad-value' }));
    loadSave(); const invalid = save.cameraMode;
    return { missing, invalid };
  })()`);
  check('旧存档与非法值都回退到原追尾视角', migration.missing === 'heading-up' && migration.invalid === 'heading-up', JSON.stringify(migration));

  const angles = await run.eval(`(() => {
    player.heading = 0.37;
    save.cameraMode = CAMERA_HEADING_UP; const chase = cameraViewAngle();
    const chaseNet = chase + player.heading;
    save.cameraMode = CAMERA_WORLD_UP; const fixed = cameraViewAngle();
    const fixedNet = fixed + player.heading;
    return { chase, chaseNet, fixed, fixedNet };
  })()`);
  check('战机朝上模式保持原地图旋转角', Math.abs(angles.chase - (-Math.PI / 2 - 0.37)) < 1e-9 && Math.abs(angles.chaseNet + Math.PI / 2) < 1e-9, JSON.stringify(angles));
  check('地图朝上模式世界不旋转且战机按航向旋转', angles.fixed === 0 && Math.abs(angles.fixedNet - 0.37) < 1e-9, JSON.stringify(angles));

  const worldDraw = await run.eval(`(() => {
    startEndless(); transition.active = false; controlSchemeAsk = false;
    if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    player.heading = 0.41;
    const captureFirstRotation = (mode) => {
      save.cameraMode = mode;
      const rotations = [];
      const original = ctx.rotate;
      ctx.rotate = function (angle) { rotations.push(angle); return original.call(this, angle); };
      try { drawWorld(); } finally { ctx.rotate = original; }
      return rotations[0];
    };
    return { chase: captureFirstRotation(CAMERA_HEADING_UP), fixed: captureFirstRotation(CAMERA_WORLD_UP) };
  })()`);
  check('drawWorld真实消费当前视角角度', Math.abs(worldDraw.chase - (-Math.PI / 2 - 0.41)) < 1e-9 && worldDraw.fixed === 0, JSON.stringify(worldDraw));

  const desktopToggle = await run.eval(`(() => {
    input.isTouch = false; setState('settings'); settingsScrollY = settingsMaxScroll();
    save.cameraMode = CAMERA_HEADING_UP; saveNow();
    const R = cameraModeRowLayout();
    const visible = R.y >= settingsLayout().viewportTop && R.y + R.h <= settingsLayout().viewportBottom;
    handleSettingsPress(R.x + R.w / 2, R.y + R.h / 2);
    return { visible, mode: save.cameraMode, stored: JSON.parse(localStorage.getItem(SAVE_KEY)).cameraMode };
  })()`);
  check('桌面设置开关即时切换并保存', desktopToggle.visible && desktopToggle.mode === 'world-up' && desktopToggle.stored === 'world-up', JSON.stringify(desktopToggle));

  await run.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    screenWidth: 390, screenHeight: 844
  });
  const touchToggle = await run.eval(`(() => {
    resize();
    input.isTouch = true; settingsScrollY = settingsMaxScroll();
    const R = cameraModeRowLayout();
    const visible = R.y >= settingsLayout().viewportTop && R.y + R.h <= settingsLayout().viewportBottom;
    handleSettingsPress(R.x + R.w / 2, R.y + R.h / 2);
    return { width: W, height: H, visible, mode: save.cameraMode, stored: JSON.parse(localStorage.getItem(SAVE_KEY)).cameraMode };
  })()`);
  check('390x844 手机设置页同样可以切换视角', touchToggle.width === 390 && touchToggle.height === 844 && touchToggle.visible && touchToggle.mode === 'heading-up' && touchToggle.stored === 'heading-up', JSON.stringify(touchToggle));

  await run.send('Emulation.clearDeviceMetricsOverride');

  const reset = await run.eval(`(() => {
    resize(); input.isTouch = false; save.cameraMode = CAMERA_WORLD_UP; setState('settings');
    menuButtons.find(button => button.label === '恢复默认').action();
    return { mode: save.cameraMode, stored: JSON.parse(localStorage.getItem(SAVE_KEY)).cameraMode };
  })()`);
  check('恢复默认会回到战机朝上', reset.mode === 'heading-up' && reset.stored === 'heading-up', JSON.stringify(reset));
  check('运行过程无Runtime异常', run.errors.length === 0, run.errors.join(' | '));
} catch (error) {
  fatal = error;
  console.error(error.stack || error.message);
} finally {
  await run.stop();
}

const passed = checks.filter(Boolean).length;
console.log(`\nRESULT ${passed}/${checks.length} checks passed`);
if (fatal || passed !== checks.length) process.exitCode = 1;
