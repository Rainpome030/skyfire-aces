import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOST = '127.0.0.1';
const VITE_BIN = resolve(PROJECT_ROOT, 'node_modules/vite/bin/vite.js');
const WAIT_STEP_MS = 100;
const checks = [];

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
  { name: 'portrait-375x667', width: 375, height: 667, mobile: true }
];

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.SKYFIRE_CHROME_PATH,
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error('Chrome/Edge not found. Set SKYFIRE_CHROME_PATH to a Chromium executable.');
  }
  return executable;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local port.'));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForServer(url, processOutput, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview has not bound its port yet.
    }
    await sleep(WAIT_STEP_MS);
  }
  throw new Error(`Preview server did not start at ${url}.\n${processOutput()}`);
}

class CdpBrowser {
  constructor(config, pageUrl, executable) {
    this.config = config;
    this.pageUrl = pageUrl;
    this.executable = executable;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.profile = mkdtempSync(join(tmpdir(), `skyfire-three-${config.name}-`));
  }

  async start() {
    this.debugPort = await freePort();
    this.process = spawn(this.executable, [
      '--headless=new',
      '--mute-audio',
      '--disable-features=Translate',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-angle=swiftshader',
      `--remote-debugging-port=${this.debugPort}`,
      `--user-data-dir=${this.profile}`,
      `--window-size=${this.config.width},${this.config.height}`,
      'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });

    const target = await this.waitForTarget();
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveSocket, reject) => {
      this.socket.onopen = resolveSocket;
      this.socket.onerror = reject;
    });
    this.socket.onmessage = (event) => this.onMessage(JSON.parse(event.data));
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
    await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.config.width,
      height: this.config.height,
      deviceScaleFactor: 1,
      mobile: this.config.mobile,
      screenWidth: this.config.width,
      screenHeight: this.config.height
    });
    await this.send('Page.navigate', { url: this.pageUrl });
    await this.waitFor(`document.readyState === 'complete'`, 10_000);
  }

  async waitForTarget() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://${HOST}:${this.debugPort}/json/list`);
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page) return page;
      } catch {
        // Chrome is still starting.
      }
      await sleep(WAIT_STEP_MS);
    }
    throw new Error(`Chrome target not found for ${this.config.name}.`);
  }

  onMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const request = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      this.consoleErrors.push(details.exception?.description || details.text || 'Runtime exception');
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args
        .map((argument) => argument.value ?? argument.description ?? argument.type)
        .join(' ');
      this.consoleErrors.push(text || 'console.error');
      return;
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      this.consoleErrors.push(message.params.entry.text || 'Log error');
      return;
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      this.consoleErrors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
    }
  }

  send(method, params = {}) {
    return new Promise((resolveRequest, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve: resolveRequest, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  async waitFor(expression, timeoutMs = 8_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await this.evaluate(expression)) return;
      } catch {
        // A reload can briefly invalidate the execution context.
      }
      await sleep(WAIT_STEP_MS);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  async click(expression) {
    const point = await this.evaluate(expression);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`Could not resolve click point from: ${expression}`);
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1
    });
    await sleep(120);
  }

  async touch(x, y, id = 1) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }]
    });
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await sleep(120);
  }

  async swipe(x1, y1, x2, y2, id = 1) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x1, y: y1, id, radiusX: 1, radiusY: 1, force: 1 }]
    });
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x2, y: y2, id, radiusX: 1, radiusY: 1, force: 1 }]
    });
    await sleep(180);
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await sleep(180);
  }

  async touchStart(x, y, id = 1) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }]
    });
  }

  async touchMove(x, y, id = 1) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id, radiusX: 1, radiusY: 1, force: 1 }]
    });
  }

  async touchEnd() {
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async key(code, key = code) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
    await sleep(180);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
    await sleep(120);
  }

  async stop() {
    try { this.socket?.close(); } catch {}
    if (this.process && this.process.exitCode === null) {
      const exited = new Promise((resolveExit) => {
        this.process.once('exit', resolveExit);
        setTimeout(resolveExit, 2_000);
      });
      try { this.process.kill(); } catch {}
      await exited;
    }
    if (process.platform === 'win32' && this.process?.pid) {
      spawnSync('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
      console.warn(`Could not remove temporary Chrome profile ${this.profile}: ${error.message}`);
    }
  }
}

const OVERFLOW_PROBE = `(() => {
  const html = document.documentElement;
  const body = document.body;
  const root = document.querySelector('#three-root');
  const game = document.querySelector('#game');
  const threeCanvas = root && root.querySelector('canvas');
  const rect = (element) => element ? (() => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
      width: value.width, height: value.height };
  })() : null;
  return {
    viewport: { width: innerWidth, height: innerHeight },
    html: { width: html.scrollWidth, height: html.scrollHeight },
    body: { width: body.scrollWidth, height: body.scrollHeight },
    root: rect(root), game: rect(game), threeCanvas: rect(threeCanvas),
    overflowX: Math.max(html.scrollWidth, body.scrollWidth) > innerWidth + 1,
    overflowY: Math.max(html.scrollHeight, body.scrollHeight) > innerHeight + 1
  };
})()`;

async function runViewport(config, pageUrl, executable) {
  const browser = new CdpBrowser(config, pageUrl, executable);
  try {
    await browser.start();
    await browser.waitFor(`['ready', 'fallback'].includes(document.documentElement.dataset.skyfireThree)`);
    await browser.waitFor(`!transition.active`);

    const startup = await browser.evaluate(`({
      title: document.title,
      state: GAME.state,
      marker: document.documentElement.dataset.skyfireThree,
      bridge: !!window.SkyfireLegacyBridge,
      threeCanvas: !!document.querySelector('#three-root canvas'),
      viewport: { width: innerWidth, height: innerHeight, W, H },
      transition: { active: transition.active, alpha: transition.alpha },
      firstButton: menuButtons[0] && { x: menuButtons[0].x, y: menuButtons[0].y, w: menuButtons[0].w, h: menuButtons[0].h, label: menuButtons[0].label }
    })`);
    check(`${config.name} page starts`, startup.title.includes('苍穹之翼') && startup.state === 'title' && startup.bridge,
      JSON.stringify(startup));
    check(`${config.name} renderer reports ready/fallback`, ['ready', 'fallback'].includes(startup.marker), startup.marker);
    check(`${config.name} creates Three canvas`, startup.threeCanvas, String(startup.threeCanvas));
    let layout = await browser.evaluate(OVERFLOW_PROBE);
    check(`${config.name} title has no page overflow`, !layout.overflowX && !layout.overflowY, JSON.stringify(layout));

    await browser.click(`(() => {
      const button = menuButtons.find((item) => String(item.label).includes('战役')) || menuButtons[0];
      return button && { x: button.x + button.w / 2, y: button.y + button.h / 2 };
    })()`);
    await browser.waitFor(`GAME.state === 'select'`);
    check(`${config.name} title -> mission select`, await browser.evaluate(`GAME.state === 'select'`));

    await browser.click(`(() => {
      const layout = selectLayout();
      return {
        x: layout.startX + layout.cardW / 2,
        y: layout.groups[0].y + layout.labelH + layout.cardH / 2
      };
    })()`);
    await browser.waitFor(`GAME.state === 'briefing'`);
    check(`${config.name} mission select -> briefing`, await browser.evaluate(`GAME.state === 'briefing'`));

    await browser.click(`(() => {
      const button = menuButtons.find((item) => String(item.label).includes('出击')) || menuButtons[0];
      return button && { x: button.x + button.w / 2, y: button.y + button.h / 2 };
    })()`);
    await browser.waitFor(`GAME.state === 'playing'`);
    await browser.waitFor(`!transition.active`);
    await browser.evaluate(`(() => {
      if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
      return true;
    })()`);
    if (await browser.evaluate(`!!controlSchemeAsk`)) {
      await browser.click(`(() => {
        const button = controlSchemeAskLayout().buttons[0];
        return { x: button.x + button.w / 2, y: button.y + button.h / 2 };
      })()`);
    }
    await browser.evaluate(`(() => {
      // The smoke gate should test the battlefield, not wait through the
      // first campaign spawn timer. Advance that deterministic timer once.
      if (mission && typeof updateMissionSpawn === 'function') {
        mission.waveTimer = 0;
        updateMissionSpawn(0);
      }
      return true;
    })()`);
    try {
      await browser.waitFor(`(!ChapterCard || !ChapterCard.isActive()) && enemies.some((enemy) => !enemy.dead)`, 12_000);
    } catch (error) {
      console.log(`${config.name} battlefield debug`, JSON.stringify(await browser.evaluate(`({ state: GAME.state, controlSchemeAsk, transition: transition.active, chapter: ChapterCard && ChapterCard.isActive(), spawned: mission && mission.spawned, waveTimer: mission && mission.waveTimer, enemies: enemies.length, alive: enemies.filter((enemy) => !enemy.dead).length })`)));
      throw error;
    }
    const battlefield = await browser.evaluate(`(() => {
      const snapshot = window.SkyfireLegacyBridge.getSnapshot();
      return {
        state: GAME.state,
        missionIndex: GAME.missionIndex,
        playerAlive: snapshot.player.alive,
        enemies: snapshot.enemies.length,
        renderer: document.documentElement.dataset.skyfireThree
      };
    })()`);
    check(`${config.name} briefing -> battlefield`, battlefield.state === 'playing' && battlefield.missionIndex === 0 && battlefield.playerAlive && battlefield.enemies > 0,
      JSON.stringify(battlefield));
    const battlefieldPixels = await browser.evaluate(`(() => {
      const canvas = document.querySelector('#three-root canvas');
      if (!canvas || canvas.width < 2 || canvas.height < 2) return { ready: false, nonBlank: false };
      const encoded = canvas.toDataURL('image/png');
      return { ready: true, nonBlank: encoded.length > 2000, dataLength: encoded.length, width: canvas.width, height: canvas.height };
    })()`);
    check(`${config.name} battlefield Three canvas has rendered pixels`, battlefieldPixels.ready && battlefieldPixels.nonBlank, JSON.stringify(battlefieldPixels));

    layout = await browser.evaluate(OVERFLOW_PROBE);
    check(`${config.name} battlefield has no page overflow`, !layout.overflowX && !layout.overflowY, JSON.stringify(layout));
    check(`${config.name} viewport is exact`, layout.viewport.width === config.width && layout.viewport.height === config.height,
      JSON.stringify(layout.viewport));
    if (!config.mobile) {
      const headingBeforeKey = await browser.evaluate('player.heading');
      await browser.key('KeyD', 'd');
      const headingAfterKey = await browser.evaluate('player.heading');
      let keyDelta = (headingAfterKey - headingBeforeKey) % (Math.PI * 2);
      if (keyDelta > Math.PI) keyDelta -= Math.PI * 2;
      if (keyDelta < -Math.PI) keyDelta += Math.PI * 2;
      check(`${config.name} keyboard D turns right`, keyDelta > 1e-5,
        JSON.stringify({ headingBeforeKey, headingAfterKey, keyDelta }));
    }
    if (config.mobile) {
      await browser.touch(config.width / 2, config.height / 2);
      const touchState = await browser.evaluate(`({
        isTouch: input.isTouch === true,
        portraitHud: hudRects().portraitTouch === true,
        state: GAME.state
      })`);
      check(`${config.name} real touch activates portrait controls`,
        touchState.isTouch && touchState.portraitHud && touchState.state === 'playing',
        JSON.stringify(touchState));

      const controls = await browser.evaluate(`(() => {
        const hud = hudRects();
        return {
          throttle: { x: hud.throttle.x + hud.throttle.w / 2, y: hud.throttle.y + hud.throttle.h * 0.12 },
          missile: { x: hud.msl.x + hud.msl.w / 2, y: hud.msl.y + hud.msl.h / 2 },
          pause: { x: hud.pauseBtn.x + hud.pauseBtn.w / 2, y: hud.pauseBtn.y + hud.pauseBtn.h / 2 },
          swipeY: Math.max(160, Math.min(innerHeight - 220, innerHeight * 0.45))
        };
      })()`);
      await browser.touch(controls.throttle.x, controls.throttle.y);
      const throttle = await browser.evaluate('player.throttle');
      check(`${config.name} touch throttle reaches upper range`, throttle > 0.75, String(throttle));

      await browser.touch(controls.missile.x, controls.missile.y);
      const missileOn = await browser.evaluate('input.missileAuto === true');
      check(`${config.name} touch missile switch toggles ON`, missileOn, String(missileOn));

      const headingBeforeSwipe = await browser.evaluate('player.heading');
      await browser.touchStart(config.width * 0.28, controls.swipeY, 77);
      await sleep(80);
      await browser.touchMove(config.width * 0.72, controls.swipeY, 77);
      await sleep(180);
      const gestureState = await browser.evaluate(`({
        id: input.touch.swipeId,
        active: touchSwipe.active,
        dir: touchSwipe.dir,
        strength: touchSwipe.strength,
        state: GAME.state
      })`);
      await browser.touchEnd();
      await sleep(120);
      const headingAfterSwipe = await browser.evaluate('player.heading');
      const swipeDelta = await browser.evaluate(`(() => {
        let delta = (player.heading - ${headingBeforeSwipe}) % (Math.PI * 2);
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        return Math.abs(delta);
      })()`);
      check(`${config.name} horizontal touch swipe changes heading`,
        swipeDelta > 1e-5 && gestureState.active === true && gestureState.dir === 'right',
        JSON.stringify({ headingBeforeSwipe, headingAfterSwipe, swipeDelta, gestureState }));

      await browser.touch(controls.pause.x, controls.pause.y);
      const paused = await browser.evaluate('GAME.state === "paused"');
      check(`${config.name} touch pause enters paused state`, paused, String(paused));
      await browser.evaluate('requestResume()');
      check(`${config.name} pause path resumes`, await browser.evaluate('GAME.state === "playing"'), String(await browser.evaluate('GAME.state')));
    }
    check(`${config.name} console has no errors`, browser.consoleErrors.length === 0,
      browser.consoleErrors.join(' || '));
  } finally {
    await browser.stop();
  }
}

async function main() {
  if (!existsSync(resolve(PROJECT_ROOT, 'dist/index.html'))) {
    throw new Error('Missing dist/index.html. Run `npm run build` before the smoke script.');
  }
  const executable = chromeExecutable();
  const previewPort = await freePort();
  const pageUrl = `http://${HOST}:${previewPort}/`;
  let output = '';
  const preview = spawn(process.execPath, [
    VITE_BIN, 'preview', '--host', HOST, '--port', String(previewPort), '--strictPort'
  ], { cwd: PROJECT_ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const collectOutput = (chunk) => { output = (output + String(chunk)).slice(-8_000); };
  preview.stdout.on('data', collectOutput);
  preview.stderr.on('data', collectOutput);

  try {
    await waitForServer(pageUrl, () => output);
    for (const viewport of viewports) await runViewport(viewport, pageUrl, executable);
  } finally {
    try { preview.kill(); } catch {}
  }

  const failed = checks.filter((item) => !item.pass);
  console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} smoke checks passed`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((item) => item.name).join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('SMOKE FATAL', error.stack || error.message || error);
  process.exitCode = 1;
});
