import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9363;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(ROOT + '/work/chrome-profile-planes', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-planes',
  '--window-size=1600,900', '--disable-features=Translate',
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
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolveMsg(msg.result);
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

// 采样机身中心区域的标志色像素(在固定屏幕位置绘制单架飞机)
const RENDER_ONE = (planeId) => `(() => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(800, 450);
  const fake = { speed: 300, afterburn: false, hitFlash: 0, reviveAnim: null, planeId: '${planeId}' };
  drawPlayerJet(fake);
  ctx.restore();
  const data = ctx.getImageData(720, 380, 160, 140).data;
  // 统计标志色附近像素(容差 40/通道)
  const count = (r, g, b) => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) < 40 && Math.abs(data[i+1] - g) < 40 && Math.abs(data[i+2] - b) < 40) n++;
    }
    return n;
  };
  return { hammer: count(107, 118, 132), bolt: count(216, 233, 242), phoenix: count(245, 201, 76), gale: count(157, 184, 201) };
})()`;

async function main() {
  await connect();
  await sleep(1200);

  // 4 种造型:各自标志色像素显著(>100),且他色不显著(<80)
  const gale = await evalJs(RENDER_ONE('gale'));
  check('gale 造型:灰蓝机身可见', gale.gale > 100, JSON.stringify(gale));
  const hammer = await evalJs(RENDER_ONE('hammer'));
  check('hammer 造型:深灰蓝机身可见', hammer.hammer > 100, JSON.stringify(hammer));
  check('hammer 造型:无 gale 灰蓝误报', hammer.gale < 80, 'galePx=' + hammer.gale);
  const bolt = await evalJs(RENDER_ONE('bolt'));
  check('bolt 造型:银白机身可见', bolt.bolt > 100, JSON.stringify(bolt));
  const phoenix = await evalJs(RENDER_ONE('phoenix'));
  check('phoenix 造型:金色机身可见', phoenix.phoenix > 100, JSON.stringify(phoenix));
  check('phoenix 造型:无 gale 误报', phoenix.gale < 80, 'galePx=' + phoenix.gale);

  // 真实玩家:selectedPlane 切换生效(战斗内 drawWorld 使用选中造型,相机对准玩家)
  const real = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    save.selectedPlane = 'phoenix';
    cam.x = player.x; cam.y = player.y; cam.shake = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawWorld();  // 含相机变换,玩家在屏幕中心
    const data = ctx.getImageData(Math.round(W / 2) - 40, Math.round(H / 2) - 40, 80, 80).data;
    let gold = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 245) < 40 && Math.abs(data[i+1] - 201) < 40 && Math.abs(data[i+2] - 76) < 40) gold++;
    }
    save.selectedPlane = 'gale';
    return gold;
  })()`);
  check('战斗内选中凤凰 → 金色机身渲染', real > 100, 'goldPx=' + real);

  // 复活动画叠加不抛错 + 状态恢复
  const anim = await evalJs(`(() => {
    const fake = { speed: 300, afterburn: true, hitFlash: 0, reviveAnim: { t: 0.5, dur: 1.0 }, planeId: 'phoenix' };
    drawPlayerJet(fake);
    return { sb: ctx.shadowBlur, alpha: ctx.globalAlpha };
  })()`);
  check('复活动画叠加(凤凰)不抛错且状态恢复', anim.sb === 0 && anim.alpha === 1, JSON.stringify(anim));

  // drawTitle 预览(无 planeId → gale 回退)不抛错
  const title = await evalJs(`(() => { try { drawTitle(); return 'ok'; } catch (e) { return 'THROW: ' + String(e); } })()`);
  check('标题页预览不抛错(gale 回退)', title === 'ok', title);

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ===');
  if (failed.length) { console.log('失败项:'); failed.forEach((f) => console.log(' - ' + f.name)); process.exitCode = 1; }
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('FATAL:', e.message); chrome.kill(); process.exit(1); });
