// 任务书 16 冒烟测试:四战机同机身(初始机身 drawGaleBody)+ 主题徽标
// 验收:4 造型机身主体像素高度相似(灰蓝 #9db8c9 系 >500,证明同机身);
//      徽标存在(hammer 橙 #ff9f43 >20、bolt 天蓝 #66d9ff >20、phoenix 金 #f5c94c >20);
//      复活动画叠加 / 标题预览 / 战斗内 selectedPlane 切换不抛错;
//      截图 work/t16-badges.png(4 造型对比)。
// 端口 9364,profile work/chrome-profile-badges(任务书指定)。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9364;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-badges', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-badges',
  '--window-size=1600,900', '--disable-features=Translate', '--hide-scrollbars',
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

// 采样机身中心区域(避开尾焰渐变带:尾焰可见区在局部 x∈[-46,-42] → 屏幕 x∈[754,758]):
// 屏幕 (760,400,90,100) = 局部 x∈[-40,50]、y∈[-50,50],覆盖机身主体 + 徽标,不含尾焰。
// 统计各特征色像素(容差 40/通道):gale 灰蓝 #9db8c9 / 橙 #ff9f43 / 天蓝 #66d9ff / 金 #f5c94c
const RENDER_ONE = (planeId) => `(() => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(800, 450);
  const fake = { speed: 300, afterburn: false, hitFlash: 0, reviveAnim: null, planeId: '${planeId}' };
  drawPlayerJet(fake);
  ctx.restore();
  const data = ctx.getImageData(760, 400, 90, 100).data;
  const count = (r, g, b) => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) < 40 && Math.abs(data[i+1] - g) < 40 && Math.abs(data[i+2] - b) < 40) n++;
    }
    return n;
  };
  return { gray: count(157, 184, 201), orange: count(255, 159, 67), sky: count(102, 217, 255), gold: count(245, 201, 76) };
})()`;

async function main() {
  await connect();
  await sleep(1200);

  // ---- 4 造型:同机身(灰蓝像素相似)+ 徽标存在 ----
  const gale = await evalJs(RENDER_ONE('gale'));
  check('gale 造型:灰蓝机身像素 >500', gale.gray > 500, JSON.stringify(gale));
  const hammer = await evalJs(RENDER_ONE('hammer'));
  check('hammer 造型:灰蓝机身像素 >500(同机身)', hammer.gray > 500, JSON.stringify(hammer));
  check('hammer 徽标:橙盾 #ff9f43 系像素 >20', hammer.orange > 20, 'orangePx=' + hammer.orange);
  check('hammer 徽标:橙像素显著多于 gale(非机身自带误报)', hammer.orange > gale.orange + 10, 'hammer=' + hammer.orange + ' gale=' + gale.orange);
  const bolt = await evalJs(RENDER_ONE('bolt'));
  check('bolt 造型:灰蓝机身像素 >500(同机身)', bolt.gray > 500, JSON.stringify(bolt));
  check('bolt 徽标:天蓝闪电 #66d9ff 系像素 >20', bolt.sky > 20, 'skyPx=' + bolt.sky);
  check('bolt 徽标:天蓝像素多于 gale(机身引擎环为天蓝,故用相对差)', bolt.sky > gale.sky + 5, 'bolt=' + bolt.sky + ' gale=' + gale.sky);
  const phoenix = await evalJs(RENDER_ONE('phoenix'));
  check('phoenix 造型:灰蓝机身像素 >500(同机身)', phoenix.gray > 500, JSON.stringify(phoenix));
  check('phoenix 徽标:金鹰 #f5c94c 系像素 >20', phoenix.gold > 20, 'goldPx=' + phoenix.gold);
  check('phoenix 徽标:金像素显著多于 gale(非机身自带误报)', phoenix.gold > gale.gold + 10, 'phoenix=' + phoenix.gold + ' gale=' + gale.gold);

  // ---- 机身同构:四造型灰蓝像素量相近(徽标只盖掉少量机身像素) ----
  const grays = [gale.gray, hammer.gray, bolt.gray, phoenix.gray];
  const spread = Math.max(...grays) - Math.min(...grays);
  check('机身同构:四造型灰蓝像素量相近(极差 <300)', spread < 300, 'grays=' + JSON.stringify(grays) + ' spread=' + spread);

  // ---- 真实玩家:战斗内 selectedPlane 切换生效(相机对准玩家,中心区域采样) ----
  const real = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    save.selectedPlane = 'phoenix';
    cam.x = player.x; cam.y = player.y; cam.shake = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawWorld();
    const data = ctx.getImageData(Math.round(W / 2) - 40, Math.round(H * 0.62) - 40, 80, 80).data;
    let gold = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 245) < 40 && Math.abs(data[i+1] - 201) < 40 && Math.abs(data[i+2] - 76) < 40) gold++;
    }
    save.selectedPlane = 'gale';
    return gold;
  })()`);
  check('战斗内选中凤凰 → 金色鹰头徽标渲染', real > 15, 'goldPx=' + real);

  // ---- 复活动画叠加不抛错 + 状态恢复 ----
  const anim = await evalJs(`(() => {
    const fake = { speed: 300, afterburn: true, hitFlash: 0, reviveAnim: { t: 0.5, dur: 1.0 }, planeId: 'phoenix' };
    drawPlayerJet(fake);
    return { sb: ctx.shadowBlur, alpha: ctx.globalAlpha };
  })()`);
  check('复活动画叠加(凤凰)不抛错且状态恢复', anim.sb === 0 && anim.alpha === 1, JSON.stringify(anim));

  // ---- drawTitle 预览(无 planeId → gale 回退)不抛错 ----
  const title = await evalJs(`(() => { try { drawTitle(); return 'ok'; } catch (e) { return 'THROW: ' + String(e); } })()`);
  check('标题页预览不抛错(gale 回退)', title === 'ok', title);

  // ---- 页面无未捕获 JS 错误 ----
  check('页面无未捕获 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ---- 截图:4 造型对比(2×2 布局) ----
  await evalJs(`(() => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cells = [['gale', 400, 225], ['hammer', 1200, 225], ['bolt', 400, 675], ['phoenix', 1200, 675]];
    for (const [id, x, y] of cells) {
      ctx.save();
      ctx.translate(x, y);
      drawPlayerJet({ speed: 300, afterburn: false, hitFlash: 0, reviveAnim: null, planeId: id });
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(id, x, y - 60);
    }
    return 'ok';
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(ROOT + '/work/t16-badges.png', Buffer.from(shot.data, 'base64'));
  check('截图已保存 work/t16-badges.png', true, (shot.data.length / 1024).toFixed(0) + 'KB');

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ===');
  if (failed.length) { console.log('失败项:'); failed.forEach((f) => console.log(' - ' + f.name)); process.exitCode = 1; }
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('FATAL:', e.message); chrome.kill(); process.exit(1); });
