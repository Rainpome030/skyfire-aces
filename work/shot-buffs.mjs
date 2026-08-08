// 新 UI 截图: 武器补给面板 + HUD buff 图标
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9555;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(ROOT + '/work/chrome-profile-shot', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-shot',
  '--window-size=1280,800',
  '--force-device-scale-factor=1',
  'file:///' + FILE.replace(/\\/g, '/')
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome target not found');
}

let msgId = 0;
const pending = new Map();
let ws;
function send(method, params) {
  return new Promise((resolveMsg, reject) => {
    const id = ++msgId;
    pending.set(id, { resolveMsg, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function connect() {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveMsg, reject) => { ws.onopen = resolveMsg; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolveMsg, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolveMsg(msg.result);
    }
  };
  await send('Runtime.enable');
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(ROOT + '/work/' + name + '.png', Buffer.from(r.data, 'base64'));
  console.log('saved', name + '.png');
}

try {
  await connect();
  await send('Page.enable');
  await sleep(500);

  // 场景1: 升级面板 = 武器三选一
  await evalJS(`startEndless(); GAME.upgrades={}; GAME.weapons=[]; GAME.dash=null; GAME.synth={}; upgradeChoice=null;
    player.weapon=defaultWeapon(); player.hp=player.maxHp=100; GAME.level=1; GAME.exp=0;
    addExp(200); true`);
  await sleep(400);
  await shot('07-weapon-choice');
  const opts = await evalJS(`upgradeChoice ? upgradeChoice.options.map(o=>o.id+':'+o.quality).join(',') : 'none'`);
  console.log('choice options:', opts);

  // 场景2: 拾取 buff 后 HUD 显示图标
  await evalJS(`(async () => {
    if (upgradeChoice) { const o = upgradeChoice.options[0]; applyUpgrade(o); }
    player.invuln = 0;
    // 直接给全 buff 显示 HUD
    for (const id of Object.keys(BUFF_DEFS)) {
      player.buffs[id] = { t: BUFF_DEFS[id].dur, n: id === 'shield' ? 2 : 0 };
    }
    return true;
  })()`);
  await sleep(300);
  await shot('08-buff-hud');

  // 场景3: 场景里的 buff 掉落物图标
  await evalJS(`(async () => {
    player.buffs = {};
    const ids = Object.keys(BUFF_DEFS);
    ids.forEach((id, i) => {
      pickups.push({ x: 400 + i * 90, y: 400, vx: 0, vy: 0, type: 'buff', id, life: 18, t: i });
    });
    return true;
  })()`);
  await sleep(300);
  await shot('09-buff-pickups');

  // 场景4: 护盾被击中瞬间
  await evalJS(`player.buffs = { shield: { t: 20, n: 2 } }; player.invuln = 0; hurtPlayer(30); true`);
  await sleep(250);
  await shot('10-shield-block');

  console.log('done');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  try { chrome.kill(); } catch {}
}
