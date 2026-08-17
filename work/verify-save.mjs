import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-save', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-save',
  '--window-size=1600,900', '--disable-features=Translate',
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
  await new Promise((resolveMsg, reject) => { ws.onopen = resolveMsg; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolveMsg(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || ''));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
}

async function evalJs(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error('EVAL ERROR: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  return res.result.value;
}

async function reload() {
  await send('Page.reload', { ignoreCache: true });
  await sleep(1800);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  await connect();

  // 1. 无存档启动
  await evalJs('localStorage.clear()');
  await reload();
  check('无存档启动到标题', await evalJs(`GAME.state === 'title' && !!save && save.unlockedMissions === 1 && save.selectedPlane === 'gale'`));
  check('saveNow 后 localStorage 有存档', await evalJs(`(saveNow() && JSON.parse(localStorage.getItem('skyfire_save_v1')).unlockedMissions === 1) === true`));

  // 2. 重锤机体乘区
  await evalJs(`save.selectedPlane = 'hammer'; saveNow(); startMission(0, 'campaign');`);
  check('重锤 maxHp=150', await evalJs(`player.maxHp === 150 && player.hp === 150`));
  check('重锤 maxMissiles=64', await evalJs(`player.maxMissiles === 64 && player.missiles === 64`));
  check('重锤 转向=2.16 (CFG.turnRate*0.8)', await evalJs(`Math.abs(player.turn - 2.7 * 0.8) < 0.001`));
  check('重锤 机炮伤害乘区=1.25', await evalJs(`player.gunDmgMult === 1.25`));

  // 3. 迅雷机体乘区
  await evalJs(`save.selectedPlane = 'bolt'; saveNow(); startMission(0, 'campaign');`);
  check('迅雷 maxHp=75', await evalJs(`player.maxHp === 75`));
  check('迅雷 maxMissiles=32', await evalJs(`player.maxMissiles === 32`));
  check('迅雷 射速乘区=1.3', await evalJs(`player.fireRateMult === 1.3`));

  // 4. 通关第 1 关 → 解锁第 2 关 + 存档持久化
  await evalJs(`save.selectedPlane = 'gale'; saveNow(); startMission(0, 'campaign'); GAME.kills = 11; finishMission(true);`);
  check('通关后 unlockedMissions=2', await evalJs(`save.unlockedMissions === 2`));
  check('通关后 missionsCleared=1', await evalJs(`save.missionsCleared === 1`));
  check('localStorage 已持久化 unlockedMissions=2', await evalJs(`JSON.parse(localStorage.getItem('skyfire_save_v1')).unlockedMissions === 2`));

  // 5. 难度解锁 + 乘区
  check('新档困难未解锁', await evalJs(`isDifficultyUnlocked('hard') === false`));
  await evalJs(`save.chapterCleared = 1; saveNow();`);
  check('第一章通关后困难解锁', await evalJs(`isDifficultyUnlocked('hard') === true`));
  await evalJs(`save.difficulty = 'hard'; saveNow(); startMission(0, 'campaign');`);
  const eh = await evalJs(`(() => { const e = makeEnemy('fighter', 0, 0); return { hp: e.hp, maxHp: e.maxHp }; })()`);
  check('困难敌人血量 ×1.25 (50→62.5)', eh.maxHp === 62.5, JSON.stringify(eh));
  const eb = await evalJs(`(() => { const e = makeEnemy('bomber', 0, 0); return e.maxHp; })()`);
  check('困难轰炸机血量 190→237.5', eb === 237.5, 'got ' + eb);

  // 6. 凤凰解锁
  check('凤凰初始未解锁', await evalJs(`isPlaneUnlocked('phoenix') === false`));
  await evalJs(`save.chapterCleared = 2; saveNow();`);
  check('第二章通关后凤凰解锁', await evalJs(`isPlaneUnlocked('phoenix') === true`));
  await evalJs(`save.selectedPlane = 'phoenix'; saveNow(); startMission(0, 'campaign');`);
  check('凤凰 buffCdMult=0.7', await evalJs(`player.buffCdMult === 0.7`));

  // 7. 刷新后存档保留(持久化验证)
  await reload();
  check('刷新后存档保留', await evalJs(`save.unlockedMissions === 2 && save.chapterCleared === 2 && save.difficulty === 'hard' && save.selectedPlane === 'phoenix'`));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ===');
  if (errors.length) { console.log('Chrome 错误:\n' + errors.join('\n')); process.exitCode = 1; }
  if (failed.length) {
    console.log('失败项:'); failed.forEach((f) => console.log(' - ' + f.name));
    process.exitCode = 1;
  }
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('FATAL:', e.message); chrome.kill(); process.exit(1); });
