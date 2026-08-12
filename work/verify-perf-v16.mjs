import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9358;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-perf-v16', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-perf-v16',
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

  const perf = await evalJs(`(() => {
    let seed = 0x16c0ffee;
    const oldRandom = Math.random;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    try {
      startMission(0, 'campaign'); ChapterCard.skip();
      for (let i = 0; i < 60; i++) explode(rand(0, 2000), rand(0, 2000), 12, true);
      for (let i = 0; i < 200; i++) bullets.push({ x: rand(0, 2000), y: rand(0, 2000), vx: rand(-500, 500), vy: rand(-500, 500), life: 0.3, r: 4, dmg: 7, enemy: false, fromPlayer: true, pierce: 0, blast: 0, hitCount: 0 });
      for (let i = 0; i < 30; i++) enemies.push(makeEnemy('fighter', rand(0, 3000), rand(0, 3000)));
      for (let i = 0; i < 40; i++) missiles.push({ x: rand(0, 2000), y: rand(0, 2000), heading: rand(0, TAU), speed: 760, turn: 3.1, life: 2, target: null, enemy: false, trail: 0, r: 5, damage: 65, dmgBonus: 0 });
      for (let i = 0; i < 60; i++) update(0.016);
      for (let i = 0; i < 20; i++) draw();
      const drawTimes = [], updateTimes = [];
      for (let i = 0; i < 80; i++) {
        let t = performance.now(); update(0.016); updateTimes.push(performance.now() - t);
        t = performance.now(); draw(); drawTimes.push(performance.now() - t);
      }
      const percentile = (a, q) => { const s = a.slice().sort((x,y)=>x-y); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * q))]; };
      return {
        drawP50: percentile(drawTimes, 0.50), drawP95: percentile(drawTimes, 0.95),
        updateP50: percentile(updateTimes, 0.50), updateP95: percentile(updateTimes, 0.95),
        particles: particles.length, bullets: bullets.length, enemies: enemies.length, missiles: missiles.length,
        snapshotThresholds: { particles: PARTICLE_LIMIT, bullets: 500, enemies: 80, missiles: 120 }
      };
    } finally { Math.random = oldRandom; }
  })()`);
  console.log('v1.6 性能基线:', JSON.stringify(perf));
  console.log('基线对比: v1.5.2 极端单帧 draw=24.10ms; v1.6 预热后 draw P50=' + perf.drawP50.toFixed(2) + 'ms, P95=' + perf.drawP95.toFixed(2) + 'ms');
  check('draw P50 < 12ms', perf.drawP50 < 12, 'P50=' + perf.drawP50.toFixed(2));
  check('draw P95 < 16ms', perf.drawP95 < 16, 'P95=' + perf.drawP95.toFixed(2));
  check('update P95 < 16ms', perf.updateP95 < 16, 'P95=' + perf.updateP95.toFixed(2));
  check('压力场景快照数量低于回归阈值', perf.particles <= perf.snapshotThresholds.particles && perf.bullets <= perf.snapshotThresholds.bullets && perf.enemies <= perf.snapshotThresholds.enemies && perf.missiles <= perf.snapshotThresholds.missiles, JSON.stringify({particles:perf.particles,bullets:perf.bullets,enemies:perf.enemies,missiles:perf.missiles}));
  // 连续爆炸压力:粒子池循环(模拟 BOSS 战清场)
  const burst = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      explode(rand(0, 2000), rand(0, 2000), 8, i % 5 === 0);
      update(0.016);
    }
    const t1 = performance.now();
    return { avgMs: (t1 - t0) / 300, particles: particles.length };
  })()`);
  console.log('连爆压力:', JSON.stringify(burst));
  check('300 连爆平均 < 16ms', burst.avgMs < 16, 'avgMs=' + burst.avgMs.toFixed(2));

  // 粒子交换删除正确性:更新后粒子数不异常增长
  const pool = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    particles = [];
    for (let i = 0; i < 500; i++) addParticle({ x: 0, y: 0, vx: 0, vy: 0, life: 0.05, maxLife: 0.05, size: 5, type: 'spark', color: '#fff' });
    for (let i = 0; i < 10; i++) update(0.016);
    return particles.length;
  })()`);
  check('粒子 10 帧后全部过期清除', pool === 0, 'left=' + pool);

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
