import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-integ', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-integ',
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

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(ROOT + '/work/' + name, Buffer.from(data, 'base64'));
  console.log('📸 ' + name);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  await connect();
  await sleep(1200);

  // 1. 模块存在性
  check('MusicSys 已集成', await evalJs(`typeof MusicSys !== 'undefined' && typeof MusicSys.play === 'function'`));
  check('ENEMY_DEFS_EXT 已集成', await evalJs(`typeof ENEMY_DEFS_EXT !== 'undefined' && Object.keys(ENEMY_DEFS_EXT).length === 4`));
  check('旧音乐循环已停用', await evalJs(`AudioSys.musicOn === false`));
  check('正面减伤 hook 已安装', await evalJs(`window.__skyfireFacingHookInstalled === true`));

  // 2. 新敌机生成
  const defs = await evalJs(`(() => {
    const r = {};
    for (const k of ['drone', 'kamikaze', 'interceptor', 'gunship']) {
      const e = makeEnemy(k, 1000, 1000);
      r[k] = { hp: e.hp, r: e.r, color: e.color };
    }
    return r;
  })()`);
  check('drone 生成 hp=18 r=14', defs.drone.hp === 18 && defs.drone.r === 14, JSON.stringify(defs.drone));
  check('kamikaze 生成 hp=30', defs.kamikaze.hp === 30, JSON.stringify(defs.kamikaze));
  check('interceptor 生成 hp=140', defs.interceptor.hp === 140, JSON.stringify(defs.interceptor));
  check('gunship 生成 hp=520 r=42', defs.gunship.hp === 520 && defs.gunship.r === 42, JSON.stringify(defs.gunship));

  // 3. 进战斗:新敌机 update/draw 不崩
  await evalJs(`startMission(0, 'campaign'); spawnWave(['drone', 'kamikaze', 'interceptor', 'gunship']);`);
  const alive = await evalJs(`enemies.filter(e => !e.dead).length`);
  check('4 新敌机已生成', alive === 4, 'alive=' + alive);
  await sleep(600);
  const sim = await evalJs(`(() => { try { update(0.016); draw(); return 'ok'; } catch (e) { return String(e); } })()`);
  check('update+draw 一帧无异常', sim === 'ok', sim);
  await sleep(400);
  const sim2 = await evalJs(`(() => { try { update(0.016); draw(); return 'ok'; } catch (e) { return String(e); } })()`);
  check('新敌机行为帧正常(含自爆/弹幕)', sim2 === 'ok', sim2);
  await shot('integ-combat.png');

  // 4. BGM 状态切换不崩
  const bgmState = await evalJs(`(() => { try { setState('title'); const a = MusicSys.playing; setState('playing'); const b = MusicSys.playing; return { a, b }; } catch (e) { return String(e); } })()`);
  check('BGM 状态切换(title→combat)', typeof bgmState === 'object' && bgmState.a === 'title' && bgmState.b === 'combat', JSON.stringify(bgmState));

  // 5. 正面减伤纯函数
  const facing = await evalJs(`(() => {
    const e = makeEnemy('interceptor', 0, 0);
    e.heading = 0;
    const front = applyFacingDamageReduction(e, 100, { vx: Math.cos(Math.PI), vy: Math.sin(Math.PI) });
    const back = applyFacingDamageReduction(e, 100, { vx: Math.cos(0), vy: Math.sin(0) });
    return { front, back };
  })()`);
  check('正面减伤 ×0.5', facing.front === 50, JSON.stringify(facing));
  check('背面不减伤', facing.back === 100, JSON.stringify(facing));

  // 6. 自爆机行为
  const kami = await evalJs(`(() => {
    const e = makeEnemy('kamikaze', player.x + 60, player.y);
    enemies.push(e);
    player.invuln = 0;
    const hpBefore = player.hp;
    updateKamikaze(e, 0.05);
    return { died: e.dead, hpLost: hpBefore - player.hp };
  })()`);
  check('自爆机近距自爆(60px)', kami.died === true, JSON.stringify(kami));

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
