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
    this.port = 9897;
    this.profile = join(tmpdir(), `skyfire-mouse-bind-${process.pid}`);
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

  async mouse(type, button, x, y) {
    return this.send('Input.dispatchMouseEvent', { type, button, x, y, clickCount: 1 });
  }

  async click(button, x, y) {
    await this.mouse('mousePressed', button, x, y);
    await this.mouse('mouseReleased', button, x, y);
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    try { this.chrome?.kill(); } catch {}
    await sleep(120);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

check('静态支持五个标准鼠标按钮', html.includes("['左键', '中键', '右键', '侧键1', '侧键2']"));
check('捕获态优先完成鼠标绑定', /captureBind\s*&&\s*GAME\.state\s*===\s*'settings'\s*&&\s*mouseCode/.test(html));
check('键鼠共用单次动作分发', html.includes('function handleBoundPress(code, repeat, source)'));

const run = new BrowserRun();
let fatal = null;
try {
  await run.start();
  const row = await run.eval(`(() => {
    input.isTouch = false; transition.active = false; setState('settings');
    const L = settingsLayout();
    const index = SETTINGS_ACTIONS.findIndex(item => item.action === 'gun');
    return { x: L.rowX + L.rowW / 2, y: L.startY + index * L.rowH + L.rowH / 2 };
  })()`);

  const cases = [
    ['left', 'mouse0', '左键'],
    ['middle', 'mouse1', '中键'],
    ['right', 'mouse2', '右键'],
    ['back', 'mouse3', '侧键1'],
    ['forward', 'mouse4', '侧键2']
  ];
  for (const [button, code, label] of cases) {
    await run.click('left', row.x, row.y);
    const capturing = await run.eval('captureBind');
    await run.click(button, row.x, row.y);
    const result = await run.eval(`({ bind: bindFor('gun'), capture: captureBind, label: prettyKey(bindFor('gun')), saved: JSON.parse(localStorage.getItem('skyfire_keybinds')).gun })`);
    check(`${label}可在同一动作行完成捕获`, capturing === 'gun' && result.bind === code && result.capture === null && result.label === label && result.saved === code, JSON.stringify(result));
  }

  await run.eval(`keybinds.gun = 'mouse3'; saveKeybinds(); clearMouseButtonState(); transition.active = false; 'ok'`);
  await run.mouse('mousePressed', 'back', 10, 10);
  const held = await run.eval(`({ down: isActionDown('gun'), raw: input.mouse.buttons[3] })`);
  await run.mouse('mouseReleased', 'back', 10, 10);
  const released = await run.eval(`({ down: isActionDown('gun'), raw: input.mouse.buttons[3] })`);
  check('侧键按下与松开可驱动持续动作', held.down === true && held.raw === true && released.down === false && released.raw === false, JSON.stringify({ held, released }));

  await run.eval(`(() => {
    window.__mouseMuteAudio = 0; window.__mouseMuteMusic = 0;
    window.__oldAudioToggle = AudioSys.toggleMute; AudioSys.toggleMute = () => { window.__mouseMuteAudio++; };
    window.__oldMusicToggle = MusicSys.toggleMute; MusicSys.toggleMute = () => { window.__mouseMuteMusic++; };
    keybinds.mute = 'mouse4'; saveKeybinds(); transition.active = false;
  })()`);
  await run.click('forward', 10, 10);
  const edge = await run.eval(`(() => {
    const result = { audio: window.__mouseMuteAudio, music: window.__mouseMuteMusic };
    AudioSys.toggleMute = window.__oldAudioToggle; MusicSys.toggleMute = window.__oldMusicToggle;
    return result;
  })()`);
  check('鼠标绑定可触发静音等单次动作', edge.audio === 1 && edge.music === 1, JSON.stringify(edge));

  await run.eval(`(() => {
    keybinds.pause = 'mouse2'; saveKeybinds(); startEndless(); transition.active = false;
    if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.skip();
    controlSchemeAsk = false; upgradeChoice = null; GAME.state = 'playing';
  })()`);
  await run.click('right', 10, 10);
  const paused = await run.eval('GAME.state');
  await run.click('right', 10, 10);
  const resumed = await run.eval('GAME.state');
  await run.eval(`setState('settings'); 'ok'`);
  check('鼠标绑定可暂停并再次按下恢复', paused === 'paused' && resumed === 'playing', JSON.stringify({ paused, resumed }));
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
