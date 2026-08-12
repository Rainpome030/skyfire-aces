import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9368;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const results = [];

mkdirSync(ROOT + '/work/chrome-profile-perf-r1', { recursive: true });
const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-perf-r1', '--window-size=1600,900',
  '--disable-features=Translate', 'file:///' + FILE.replace(/\\/g, '/')
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', (data) => {
  const text = String(data);
  if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(text)) errors.push(text.trim());
});

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((target) => target.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome target not found');
}

let messageId = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function connect() {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + (message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || ''));
    }
  };
  await send('Runtime.enable');
}
async function evalJs(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  await connect();
  await sleep(1200);

  const dpr = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    const oldDpr = DPR;
    DPR = 1; ensureRenderCache(world.theme); const first = renderCache.water;
    const firstSize = [first.width, first.height];
    DPR = 2; ensureRenderCache(world.theme); const second = renderCache.water;
    const secondSize = [second.width, second.height];
    DPR = oldDpr; ensureRenderCache(world.theme);
    return { rebuilt: first !== second, firstSize, secondSize, css: [W, H], cacheDpr: renderCache.dpr };
  })()`);
  check('DPR 改变会重建缓存物理尺寸', dpr.rebuilt && dpr.secondSize[0] === dpr.css[0] * 2 && dpr.secondSize[1] === dpr.css[1] * 2, JSON.stringify(dpr));

  const rng = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    let calls = 0; const oldRandom = Math.random;
    Math.random = () => { calls++; return 0.25; };
    try {
      prewarmRender();
      const afterPrewarm = calls;
      draw();
      return { afterPrewarm, afterDraw: calls };
    } finally { Math.random = oldRandom; }
  })()`);
  check('纯预热与后续绘制不消耗玩法 RNG', rng.afterPrewarm === 0 && rng.afterDraw === 0, JSON.stringify(rng));

  const priority = await evalJs(`(() => {
    particles = []; particlePressureT = 0;
    const particle = (type, id) => ({ x:0, y:0, vx:0, vy:0, life:2, maxLife:2, size:4, type, color:'#fff', text:String(id) });
    for (let i = 0; i < 300; i++) addParticle(particle(i % 3 === 0 ? 'text' : (i % 3 === 1 ? 'ring' : 'flash'), i));
    for (let i = 0; i < 300; i++) addParticle(particle('spark', i));
    addParticle(particle('text', 'new'));
    return { total: particles.length, important: particles.filter(p => particlePriority(p) === 2).length, hasNew: particles.some(p => p.text === 'new') };
  })()`);
  check('粒子触顶优先保留文字/ring/flash', priority.important === 301 && priority.hasNew && priority.total <= 600, JSON.stringify(priority));

  const cleanup = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    particles = []; bullets = []; missiles = [];
    for (let i = 0; i < 1000; i++) {
      bullets.push({ x:0,y:0,vx:0,vy:0,life:0.05,r:1,dmg:0,enemy:false,fromPlayer:true,pierce:0,blast:0,hitCount:0 });
      missiles.push({ x:0,y:0,heading:0,speed:0,turn:0,life:0.05,target:null,enemy:false,trail:0,r:1,damage:0,dmgBonus:0 });
      addParticle({ x:0,y:0,vx:0,vy:0,life:0.05,maxLife:0.05,size:1,type:'spark',color:'#fff' });
    }
    player.throttle = 0;
    for (let i = 0; i < 120; i++) { updateBullets(0.016); updateMissiles(0.016); updateParticles(0.016); }
    return { bullets: bullets.length, missiles: missiles.length, particles: particles.length };
  })()`);
  check('长期有限寿命对象可完全清理', cleanup.bullets === 0 && cleanup.missiles === 0 && cleanup.particles === 0, JSON.stringify(cleanup));

  const culling = await evalJs(`(() => {
    const old = { W, H, zoom: cam.zoom, x: cam.x, y: cam.y };
    const cases = [[1600,900,0.85],[390,844,0.85],[844,390,1.25],[2560,720,0.7]];
    const detail = [];
    for (const [w,h,z] of cases) {
      W=w; H=h; cam.zoom=z; cam.x=1000; cam.y=1000;
      const halfW=w/(2*z), halfH=h/(2*z);
      const corners = [[-halfW,-halfH],[halfW,-halfH],[-halfW,halfH],[halfW,halfH]];
      detail.push({ w,h,z, pass: corners.every(([dx,dy]) => inDrawView(cam.x+dx, cam.y+dy, 80)) });
    }
    W=old.W; H=old.H; cam.zoom=old.zoom; cam.x=old.x; cam.y=old.y;
    return detail;
  })()`);
  check('旋转四角/竖屏/zoom 裁剪边界保守覆盖', culling.every(item => item.pass), JSON.stringify(culling));

  const failed = results.filter((result) => !result.pass);
  console.log(`\n=== P23-R1 结果: ${results.length - failed.length}/${results.length} 通过 ===`);
  if (errors.length) { console.log('Chrome 错误:\n' + errors.join('\n')); process.exitCode = 1; }
  if (failed.length) process.exitCode = 1;
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((error) => { console.error('FATAL:', error.message); chrome.kill(); process.exit(1); });
