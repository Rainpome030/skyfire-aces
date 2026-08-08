import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9342;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-b4', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-b4',
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

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  await connect();
  await sleep(1200);

  // 1. 模块存在
  check('SlowMo 已集成', await evalJs(`typeof SlowMo !== 'undefined' && typeof SlowMo.trigger === 'function'`));

  // 2. big 击杀触发慢镜
  const s1 = await evalJs(`(() => {
    startMission(2, 'campaign');  // boss 关
    mission.boss.hp = 0;
    killPlane(mission.boss);
    return { active: SlowMo.isActive(), scale: SlowMo.getScale() };
  })()`);
  check('BOSS 击杀触发慢镜', s1.active === true && s1.scale === 0.3, JSON.stringify(s1));

  // 3. 小兵击杀不触发(慢镜未激活时)
  const s2 = await evalJs(`(() => {
    SlowMo.active = false; SlowMo.t = 0;
    startMission(0, 'campaign');
    const e = makeEnemy('fighter', 0, 0); enemies.push(e);
    e.hp = 0; killPlane(e);
    return SlowMo.isActive();
  })()`);
  check('普通敌机击杀不触发慢镜', s2 === false);

  // 4. 慢镜推进与结束
  const s3 = await evalJs(`(() => {
    SlowMo.trigger(0.35, 0.3);
    for (let i = 0; i < 40; i++) SlowMo.update(0.016);  // 0.64s > 0.35s
    return SlowMo.isActive();
  })()`);
  check('慢镜 0.64s 后自然结束', s3 === false);

  // 5. loop 时间缩放生效(过场不受影响——过场不走 update 战斗,但 loop 的 dt 缩放会同时缩 SlowMo 自身 update……验证 getScale 通路)
  const s4 = await evalJs(`(() => {
    SlowMo.trigger(0.35, 0.3);
    const sc = SlowMo.getScale();
    SlowMo.active = false; SlowMo.t = 0;
    return sc === 0.3;
  })()`);
  check('getScale 返回 0.3', s4 === true);

  // 6. 死代码清理回归:upgrades 无生效引用
  const s5 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.shotsFired = 10; GAME.shotsHit = 5;
    const e = makeEnemy('fighter', 0, 0); enemies.push(e);
    e.hp = 0; killPlane(e);
    finishMission(true);
    return { rank: GAME.endStats.rank, kills: GAME.kills };
  })()`);
  check('战斗全流程正常(清理后)', typeof s5.rank === 'string' && s5.kills === 1, JSON.stringify(s5));

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
