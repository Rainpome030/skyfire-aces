import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new',
  '--disable-gpu',
  '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile',
  '--window-size=1600,900',
  '--disable-features=Translate',
  'file:///' + FILE.replace(/\\/g, '/')
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

chrome.stderr.on('data', (d) => {
  const s = String(d);
  if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) errors.push(s.trim());
});

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
  await new Promise((resolveMsg, reject) => {
    ws.onopen = resolveMsg;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolveMsg(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.text || '') + ' ' + (msg.params.exceptionDetails?.exception?.description || ''));
    } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
      if (!String(msg.params.entry.text || '').includes('willReadFrequently')) {
        errors.push('LOG: ' + msg.params.entry.text);
      }
    }
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
}

async function evalJs(expr) {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('EVAL ERROR: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  }
  return res.result.value;
}

async function waitFor(expr, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evalJs(expr)) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(ROOT, 'work', name + '.png'), Buffer.from(res.data, 'base64'));
}

function check(name, cond, detail) {
  if (cond) console.log('PASS ' + name + (detail ? '  [' + detail + ']' : ''));
  else {
    console.log('FAIL ' + name + (detail ? '  [' + detail + ']' : ''));
    errors.push('CHECK FAIL: ' + name + ' ' + (detail || ''));
  }
}

const SAMPLE = `(() => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let min = 255, max = 0, sum = 0, n = 0, colors = 0;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 400) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const v = r + gg + b;
    if (v < min) min = v; if (v > max) max = v;
    sum += v; n++;
    seen.add((r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4));
  }
  return { min, max, avg: Math.round(sum / n), colors: seen.size };
})()`;

async function main() {
  await connect();
  await sleep(1200);

  let v = await evalJs(`({ state: GAME.state, title: document.title, menu: menuButtons.length })`);
  check('title state', v.state === 'title', JSON.stringify(v));
  check('page title', v.title.includes('苍穹之翼'), v.title);

  let px = await evalJs(SAMPLE);
  check('canvas rendered', px.colors > 8 && px.max > 80, JSON.stringify(px));
  await shot('01-title');

  // Key binding settings: open from title, rebind gun, cancel with Esc, restore defaults.
  v = await evalJs(`(() => { const i = menuButtons.findIndex(b => b.label === '按键设置'); const b = menuButtons[i]; return { idx: i, x: b.x + b.w / 2, y: b.y + b.h / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(200);
  v = await evalJs(`({ state: GAME.state, rows: SETTINGS_ACTIONS.map(r => r.action).join(',') })`);
  check('settings opens from title', v.state === 'settings' && v.rows.includes('turnLeft'), JSON.stringify(v));
  await shot('05-settings');

  v = await evalJs(`(() => { const L = settingsLayout(); const idx = SETTINGS_ACTIONS.findIndex(r => r.action === 'gun'); return { x: L.rowX + L.rowW / 2, y: L.startY + idx * L.rowH + L.rowH / 2, defaultKey: bindFor('gun') }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(100);
  v = await evalJs(`captureBind`);
  check('clicking action row starts bind capture', v === 'gun', String(v));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81 });
  await sleep(100);
  v = await evalJs(`({ bind: keybinds.gun, capture: captureBind })`);
  check('key press assigns new binding', v.bind === 'KeyQ' && v.capture === null, JSON.stringify(v));
  await evalJs(`startBindCapture('gun'); 'ok'`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(100);
  v = await evalJs(`({ bind: keybinds.gun, capture: captureBind })`);
  check('escape cancels bind capture without overwrite', v.bind === 'KeyQ' && v.capture === null, JSON.stringify(v));
  await evalJs(`keybinds = Object.assign({}, DEFAULT_BINDS); saveKeybinds(); 'ok'`);
  v = await evalJs(`(() => { const b = menuButtons.find(x => x.label === '返回'); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(200);
  v = await evalJs(`({ state: GAME.state, gun: bindFor('gun') })`);
  check('settings returns to title and defaults restored', v.state === 'title' && v.gun === 'mouse0', JSON.stringify(v));

  v = await evalJs(`({ x: menuButtons[0].x + menuButtons[0].w / 2, y: menuButtons[0].y + menuButtons[0].h / 2 })`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  v = await evalJs(`GAME.state`);
  check('title button opens briefing', v === 'briefing', v);

  v = await evalJs(`({ x: menuButtons[0].x + menuButtons[0].w / 2, y: menuButtons[0].y + menuButtons[0].h / 2 })`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  v = await evalJs(`({ state: GAME.state, index: GAME.missionIndex, enemies: enemies.filter(e=>!e.dead).length, spawned: mission.spawned })`);
  check('briefing launch starts mission', v.state === 'playing' && v.index === 0, JSON.stringify(v));
  check('mission1 wave spawned', v.enemies > 0 && v.spawned > 0, JSON.stringify(v));

  await evalJs(`window.__engineRatio = -1; AudioSys.updateEngine = function (r) { window.__engineRatio = r; }; 'ok'`);
  await sleep(300);
  v = await evalJs(`window.__engineRatio`);
  check('engine runs in flight', v > 0, String(v));
  await evalJs(`setState('paused'); 'ok'`);
  await sleep(300);
  v = await evalJs(`window.__engineRatio`);
  check('engine silenced on pause', v === 0, String(v));
  await evalJs(`setState('title'); 'ok'`);
  await sleep(300);
  v = await evalJs(`window.__engineRatio`);
  check('engine silenced on title', v === 0, String(v));
  await evalJs(`startMission(0, 'campaign'); 'ok'`);
  await sleep(200);

  await evalJs(`input.mouse.down = true; input.mouse.x = W/2 + 260; input.mouse.y = H/2 - 120; 'ok'`);
  await sleep(1000);
  v = await evalJs(`({ shots: GAME.shotsFired, bullets: bullets.length })`);
  check('guns fire', v.shots > 0 && v.bullets > 0, JSON.stringify(v));

  await evalJs(`player.target = enemies.find(e=>!e.dead); player.lock = CFG.lockTime; input.mouse.rdown = true; 'ok'`);
  await sleep(400);
  v = await evalJs(`({ msl: player.missiles, mslCount: missiles.length })`);
  check('missile fired', v.msl < 48 && v.mslCount > 0, JSON.stringify(v));
  inputReset();

  await evalJs(`for (const e of enemies) if (!e.dead) damagePlane(e, 99999); mission.spawned = 11; 'ok'`);
  await sleep(300);
  await evalJs(`GAME.pendingTimer = 0.01; 'ok'`);
  await waitFor(`GAME.state === 'complete'`, 8000);
  v = await evalJs(`({ state: GAME.state, kills: GAME.kills, complete: mission.complete, rank: GAME.endStats ? GAME.endStats.rank : null, pending: GAME.pendingState, timer: GAME.pendingTimer, shown: mission.completeShown, frameTime: gameTime })`);
  check('mission1 complete flow', v.state === 'complete' && v.kills > 0 && v.rank, JSON.stringify(v));
  await shot('02-complete');

  await evalJs(`startMission(1, 'campaign'); 'ok'`);
  await sleep(2500);
  v = await evalJs(`({ transport: !!mission.transport, tx: mission.transport ? Math.round(mission.transport.x) : -1, esc: mission.escort })`);
  check('mission2 escort', v.transport && v.esc && v.tx > 700, JSON.stringify(v));

  await evalJs(`for (const e of enemies) if (!e.dead) damagePlane(e, 99999); 'ok'`);
  await sleep(100);
  await evalJs(`mission.transport.waypoints = [mission.transport.waypoints[0], {x: mission.transport.x + 40, y: mission.transport.y}]; mission.transport.wpIndex = 1; 'ok'`);
  await waitFor(`!!mission.escortDone`, 8000);
  v = await evalJs(`({ done: !!mission.escortDone, state: GAME.state })`);
  check('mission2 escort done', v.done === true, JSON.stringify(v));

  await evalJs(`startMission(2, 'campaign'); 'ok'`);
  await sleep(1500);
  v = await evalJs(`({ boss: !!mission.boss, hp: mission.boss ? mission.boss.hp : 0, escorts: enemies.filter(e=>e.kind==='fighter' && !e.dead).length })`);
  check('mission3 boss spawn', v.boss && v.hp === 720 && v.escorts >= 3, JSON.stringify(v));

  await evalJs(`if (mission.boss) damagePlane(mission.boss, 99999); 'ok'`);
  await sleep(300);
  await evalJs(`GAME.pendingTimer = 0.01; 'ok'`);
  await waitFor(`GAME.state === 'complete'`, 8000);
  v = await evalJs(`({ state: GAME.state, complete: mission.complete, kills: GAME.kills })`);
  check('mission3 complete', v.state === 'complete' && v.complete, JSON.stringify(v));

  await evalJs(`startEndless(); 'ok'`);
  await sleep(1600);
  v = await evalJs(`({ state: GAME.state, endless: !!mission.endless, wave: mission.waveIndex, enemies: enemies.filter(e=>!e.dead).length })`);
  check('endless mode', v.state === 'playing' && v.endless && v.enemies > 0, JSON.stringify(v));
  await shot('03-endless');

  await evalJs(`(() => { const e = enemies.find(e=>!e.dead); if (e) { e.x = player.x + 320; e.y = player.y; damagePlane(e, 99999); } return e ? e.dead : false; })()`);
  await sleep(50);
  v = await evalJs(`particles.filter(p => p.type === 'debris').length`);
  check('enemy death spawns debris fragments', v >= 4 && v <= 8, String(v));
  await evalJs(`particles = particles.filter(p => p.type === 'debris'); draw(); 'ok'`);
  v = await evalJs(`(() => { const c = document.getElementById('game'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let bright = 0; const colors = [[242,246,251],[201,212,223],[148,163,178],[93,104,116],[255,184,77],[255,138,92]]; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i+1], b = d[i+2]; for (const [cr, cg, cb] of colors) { if (Math.abs(r-cr) < 36 && Math.abs(gg-cg) < 36 && Math.abs(b-cb) < 36) { bright++; break; } } } return { bright, w: c.width, h: c.height }; })()`);
  check('debris fragments render to canvas', v.bright > 200, JSON.stringify(v));
  await shot('06-debris');

  await evalJs(`window.__wreck = null; const e = enemies.find(e=>!e.dead); if (e) { for (const o of enemies) if (!o.dead && o !== e) damagePlane(o, 99999); e.x = player.x + 420; e.y = player.y; damagePlane(e, 99999); window.__wreck = e; } 'ok'`);
  await sleep(300);
  v = await evalJs(`({ kept: enemies.includes(window.__wreck), alive: !window.__wreck.dead, lockable: (() => { player.heading = angleTo(player.x, player.y, window.__wreck.x, window.__wreck.y); acquireLock(); return player.target === window.__wreck; })() })`);
  check('wreck persists and cannot be locked', v.kept === true && v.alive === false && v.lockable === false, JSON.stringify(v));
  await evalJs(`window.__wreck.wreckT = 5.1; window.__wreck.wreckDone = true; window.__wreck.wreckFade = 0; updateWrecks(1.6); 'ok'`);
  v = await evalJs(`!enemies.includes(window.__wreck)`);
  check('wreck fades and is removed after 5s + fade', v === true, String(v));

  await evalJs(`bullets.length = 0; player.weapon = makeWeapon('scatter', 'good'); player.fireCd = 0; firePlayerGuns(); 'ok'`);
  v = await evalJs(`({ count: bullets.length, dmg: bullets[0] ? bullets[0].dmg : 0 })`);
  check('dropped scatter weapon fires 3 bullets', v.count === 3 && v.dmg > 0, JSON.stringify(v));

  await evalJs(`(() => { GAME.combo = 0; GAME.comboTimer = 0; spawnWave(['fighter']); const e = enemies.find(e=>!e.dead); e.x = player.x; e.y = player.y; damagePlane(e, 99999); return GAME.combo; })()`);
  v = await evalJs(`({ kills: GAME.kills, combo: GAME.combo, timer: GAME.comboTimer })`);
  check('kill grants exp and combo 1', v.kills > 0 && v.combo === 1 && v.timer > 1.4, JSON.stringify(v));
  await evalJs(`GAME.level = 10; GAME.exp = 0; 'ok'`);
  const beforeExp = await evalJs(`GAME.exp`);
  await evalJs(`(() => { spawnWave(['fighter']); const e = enemies.find(e=>!e.dead); e.x = player.x; e.y = player.y; damagePlane(e, 99999); return GAME.combo; })()`);
  v = await evalJs(`({ combo: GAME.combo, exp: GAME.exp, timer: GAME.comboTimer })`);
  check('kill within 5s builds combo and more exp', v.combo >= 2 && v.exp >= beforeExp + 100, JSON.stringify(v));
  await evalJs(`GAME.comboTimer = 0.01; 'ok'`);
  await sleep(200);
  v = await evalJs(`GAME.combo`);
  check('combo resets after countdown', v === 0, String(v));

  await evalJs(`GAME.exp = expNeeded(GAME.level) - 1; player.hp = 50; GAME.combo = 0; GAME.comboTimer = 0; 'ok'`);
  await evalJs(`(() => { spawnWave(['fighter']); const e = enemies.find(e=>!e.dead && e !== player); if (!e) return -1; e.x = player.x; e.y = player.y; damagePlane(e, 99999); return GAME.level; })()`);
  v = await evalJs(`({ level: GAME.level, hp: player.hp, choice: !!upgradeChoice, alive: enemies.filter(e=>!e.dead).length })`);
  check('level up restores 10% and opens upgrade choice', v.level > 1 && v.hp > 50 && v.choice === true, JSON.stringify(v));

  v = await evalJs(`(() => { const c = upgradeChoice; const bw = Math.min(720, W*0.9); const bx = W/2 - bw/2; const cardW = Math.min(200, (bw-80)/3); const cardH = 130; const gap = Math.min(16, (bw-cardW*3)/4); return { x: bx + gap + cardW/2, y: H*0.24 + 110 + cardH/2, id: c.options[0].id }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(300);
  const choiceId = String(v.id);
  v = await evalJs(`({ choice: !!upgradeChoice, has: !!(GAME.upgrades[${JSON.stringify(choiceId)}]), options: upgradeChoice ? upgradeChoice.options.length : 0 })`);
  check('upgrade choice applies and closes', v.choice === false, JSON.stringify(v));

  await evalJs(`GAME.weapons = [defaultWeapon()]; player.weapon = defaultWeapon(); applyWeapon('scatter', 'common'); applyWeapon('scatter', 'common'); applyWeapon('scatter', 'common'); 'ok'`);
  v = await evalJs(`({ count: GAME.weapons.length, id: player.weapon.id, quality: player.weapon.quality })`);
  check('three common scatter synthesize to good', v.id === 'scatter' && v.quality === 'good', JSON.stringify(v));

  await evalJs(`applyWeapon('scatter', 'common'); 'ok'`);
  v = await evalJs(`({ id: player.weapon.id, quality: player.weapon.quality, synth: GAME.synth['scatter:common'] || 0 })`);
  check('lower quality pickup counts without downgrade', v.id === 'scatter' && v.quality === 'good' && v.synth === 1, JSON.stringify(v));

  await evalJs(`applyWeapon('scatter', 'common'); applyWeapon('scatter', 'common'); 'ok'`);
  v = await evalJs(`({ synth: GAME.synth['scatter:common'] || 0, goods: GAME.weapons.filter(w => w.id === 'scatter' && w.quality === 'good').length, id: player.weapon.id, quality: player.weapon.quality })`);
  check('three lower quality pickups synthesize another good', v.synth === 0 && v.goods >= 2 && v.id === 'scatter' && v.quality === 'good', JSON.stringify(v));

  await evalJs(`GAME.weapons = [defaultWeapon()]; player.weapon = defaultWeapon(); applyWeapon('laser', 'common'); const w0 = player.weapon; applyWeapon('rocket', 'common'); const w1 = player.weapon; w1.ammo = 1; switchWeaponBack(); 'ok'`);
  v = await evalJs(`({ id: player.weapon.id, chain: GAME.weapons.map(w=>w.id+':'+w.quality).join(',') })`);
  check('limited weapon returns to previous limited', v.id === 'laser', JSON.stringify(v));

  await evalJs(`GAME.weapons = [defaultWeapon()]; player.weapon = defaultWeapon(); applyWeapon('laser', 'common'); player.weapon.ammo = 0; applyWeapon('rocket', 'common'); const r = player.weapon; r.ammo = 1; switchWeaponBack(); 'ok'`);
  v = await evalJs(`({ id: player.weapon.id, chain: GAME.weapons.map(w=>w.id+':'+w.quality).join(',') })`);
  check('empty limited is dropped from chain', v.id === 'default', JSON.stringify(v));

  await evalJs(`GAME.upgrades.dashCd = 0; GAME.dash = null; collectLoot({type:'move', id:'dash', quality:'rare'}); player.dashCd = 0; tryDash(); 'ok'`);
  v = await evalJs(`({ dash: GAME.dash ? GAME.dash.quality : null, active: player.dashActive, cd: player.dashCd, inv: player.invuln })`);
  check('rare dash pickup and E dash works', v.dash === 'rare' && v.active === true && v.cd > 1.7 && v.inv > 0.15, JSON.stringify(v));

  await evalJs(`player.dashActive = false; player.dashCd = 0; input.keys['e'] = false; player.dashPressed = false; 'ok'`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
  await sleep(150);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69 });
  v = await evalJs(`player.dashActive`);
  check('E key triggers dash', v === true, String(v));

  await evalJs(`player.rollCd = 0; player.rollActive = false; player.rollT = 0; player.invuln = 0; player.lastDirTap = {dir:null,t:-99}; tryBarrelRoll('left'); 'ok'`);
  v = await evalJs(`({ active: player.rollActive, dir: player.rollDir })`);
  check('single tap triggers barrel roll', v.active === true && v.dir === -1, JSON.stringify(v));
  await sleep(350);
  v = await evalJs(`({ active: player.rollActive, inv: player.invuln > 0.6 })`);
  check('roll grants 1s invulnerability', v.active === true && v.inv === true, JSON.stringify(v));

  await evalJs(`player.rollCd = 0; player.rollActive = false; player.rollT = 0; player.invuln = 0; player.lastDirTap = {dir:null,t:-99}; 'ok'`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
  await sleep(120);
  v = await evalJs(`({ active: player.rollActive, last: player.lastDirTap, state: GAME.state })`);
  check('keyboard single tap triggers roll', v.active === true, JSON.stringify(v));

  await evalJs(`player.rollActive = false; player.rollCd = 0; player.rollT = 0; player.invuln = 0; input.mouse.movedAt = -99; window.__h0 = player.heading; input.keys['ArrowLeft'] = true; 'ok'`);
  await sleep(400);
  v = await evalJs(`(() => { const d = Math.abs(Math.atan2(Math.sin(player.heading - window.__h0), Math.cos(player.heading - window.__h0))); return { h: player.heading, d, roll: player.rollActive, bank: player.bank }; })()`);
  check('held turn key steers plane without rolling', v.d > 0.02 && v.roll === false, JSON.stringify(v));
  await evalJs(`input.keys['ArrowLeft'] = false; 'ok'`);

  v = await evalJs(`player.rollActive = true; player.rollT = 0.3; missiles.length = 0; launchMissile(player.x + 600, player.y, 0, player, true); const m = missiles[0]; const h0 = m.heading; updateMissiles(0.3); const h1 = missiles[0] ? missiles[0].heading : -999; player.rollActive = false; ({ delta: Math.abs(angDiff(h0, h1)), alive: missiles.length > 0 })`);
  check('roll weakens missile homing', v.delta < 0.35 && v.alive, JSON.stringify(v));

  await evalJs(`player.rollActive = true; player.rollT = 0.8; player.rollDir = 1; 'ok'`);
  await sleep(220);
  v = await evalJs(`player.rollActive`);
  check('barrel roll ends', v === false, String(v));

  await evalJs(`launchMissile(player.x + 80, player.y, Math.PI, player, true); 'ok'`);
  await sleep(900);
  v = await evalJs(`({ hp: player.hp })`);
  check('enemy missile damages player', v.hp < 100, JSON.stringify(v));

  await evalJs(`bullets.push({x: player.x + 60, y: player.y, vx: -700, vy: 0, life: 1, r: 4, dmg: 8, enemy: true, fromPlayer: false}); 'ok'`);
  await sleep(300);
  v = await evalJs(`({ hp: player.hp })`);
  check('enemy bullet damages player', v.hp < 100, JSON.stringify(v));

  await evalJs(`bullets.length = 0; missiles.length = 0; for (const e of enemies) if (!e.dead) damagePlane(e, 99999); 'ok'`);
  await evalJs(`mission.waveTimer = 0; 'ok'`);
  await waitFor(`mission.waveIndex >= 2`, 8000);
  v = await evalJs(`({ wave: mission.waveIndex, spawned: mission.spawned, enemies: enemies.filter(e=>!e.dead).length })`);
  check('endless wave 2 spawns', v.wave >= 2 && v.spawned > 0, JSON.stringify(v));

  v = await evalJs(`(() => { input.fireHeld = false; input.keys[' '] = true; handleConfirmKey(); const r = input.fireHeld; input.keys[' '] = false; return r; })()`);
  check('space confirm not sticky', v === false, String(v));

  await evalJs(`startEndless(); player.invuln = 0; hurtPlayer(9999); 'ok'`);
  await sleep(300);
  await evalJs(`GAME.freezeTimer = 0.01; GAME.pendingTimer = 0.01; 'ok'`);
  await waitFor(`GAME.state === 'gameover'`, 8000);
  v = await evalJs(`({ state: GAME.state, stats: GAME.endStats ? GAME.endStats.success : null, freeze: GAME.freezeTimer, pending: GAME.pendingState, timer: GAME.pendingTimer })`);
  check('player death shows gameover', v.state === 'gameover' && v.stats === false, JSON.stringify(v));

  v = await evalJs(`({ x: menuButtons[0].x + menuButtons[0].w / 2, y: menuButtons[0].y + menuButtons[0].h / 2, label: menuButtons[0].label })`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.x, y: v.y, button: 'left', clickCount: 1 });
  await sleep(1800);
  v = await evalJs(`({ state: GAME.state, alive: player.alive, dead: player.dead })`);
  check('retry after death resets player', v.state === 'playing' && v.alive === true && v.dead === false, JSON.stringify(v));

  await evalJs(`(() => { const e = enemies.find(e=>!e.dead); player.invuln = 0; e.x = player.x + 200; e.y = player.y; e.heading = Math.PI; e.aiTarget = player; e.fireCd = 0.05; return e.kind; })()`);
  await sleep(700);
  v = await evalJs(`({ hp: player.hp, enemyBullets: bullets.filter(b=>b.enemy).length })`);
  check('enemies fire after retry', v.hp < 100 || v.enemyBullets > 0, JSON.stringify(v));

  await evalJs(`setState('paused'); 'ok'`);
  v = await evalJs(`GAME.state`);
  check('pause state', v === 'paused', v);

  await shot('04-final');
  await evalJs(`setState('title'); 'ok'`);
  v = await evalJs(`GAME.state`);
  check('return to title', v === 'title', v);

  console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nNO ERRORS');
  ws.close();
  chrome.kill();
  process.exit(errors.length ? 1 : 0);
}

function inputReset() {
  // keep mouse buttons held off after missile test
  return evalJs(`input.mouse.down = false; input.mouse.rdown = false; 'ok'`);
}

main().catch((e) => {
  console.error('VERIFY CRASH:', e);
  try { chrome.kill(); } catch {}
  process.exit(1);
});
