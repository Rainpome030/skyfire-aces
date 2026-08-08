import { spawn } from 'node:child_process';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-task02-probe',
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
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolveMsg(msg.result);
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
async function reload() { await send('Page.reload', { ignoreCache: true }); await sleep(1800); }

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}
async function px(x, y) {
  return await evalJs(`(() => { const d = ctx.getImageData(${Math.round(x)}, ${Math.round(y)}, 1, 1).data; return [d[0], d[1], d[2], d[3]]; })()`);
}
const isDark = (c) => c[0] < 80 && c[1] < 110 && c[2] < 150;
const isGold = (c) => c[0] > 200 && c[1] > 150 && c[2] < 160;

async function main() {
  await connect();
  await evalJs('localStorage.clear()');
  await reload();

  // 标题:机库按钮中心应为深蓝按钮色
  const btn = await evalJs(`(() => { const b = menuButtons[2]; return { x: b.x + b.w/2, y: b.y + b.h/2 }; })()`);
  const c1 = await px(btn.x, btn.y);
  check('标题机库按钮已绘制(深蓝)', isDark(c1), JSON.stringify(c1));

  // 机库:选中卡金色描边 + 锁定卡暗色 + 困难按钮锁定
  await evalJs(`handleCanvasPress(menuButtons[2].x + menuButtons[2].w/2, menuButtons[2].y + menuButtons[2].h/2)`);
  await sleep(500);
  const geo = await evalJs(`(() => {
    const L = hangarLayout();
    const ids = Object.keys(PLANE_DEFS);
    const gale = L.cardsX + 0 * (L.cardW + L.gap);
    const phx = L.cardsX + ids.indexOf('phoenix') * (L.cardW + L.gap);
    const keys = Object.keys(DIFFICULTY_DEFS);
    const totalW = keys.length * L.diffW + (keys.length - 1) * L.diffGap;
    const hardX = W/2 - totalW/2 + keys.indexOf('hard') * (L.diffW + L.diffGap);
    return { gale, phx, cardsY: L.cardsY, cardH: L.cardH, cardW: L.cardW, hardX, diffY: L.diffY, diffH: L.diffH, statX: L.statX, statY: L.statY, statW: L.statW, statH: L.statH };
  })()`);
  // 右边缘扫描:找金色像素
  const strip = await evalJs(`(() => {
    const L = hangarLayout();
    const x0 = L.cardsX + L.cardW - 8, y0 = L.cardsY + L.cardH / 2;
    const out = [];
    for (let i = 0; i < 12; i++) {
      const d = ctx.getImageData(x0 + i, y0, 1, 1).data;
      out.push([d[0], d[1], d[2]]);
    }
    return out;
  })()`);
  console.log('  边缘采样(右→外): ' + JSON.stringify(strip));
  const border = await px(geo.gale + geo.cardW - 1, geo.cardsY + geo.cardH / 2);
  check('选中卡金色描边', isGold(border), JSON.stringify(border));
  const locked = await px(geo.phx + geo.cardW / 2, geo.cardsY + geo.cardH - 10);
  check('凤凰锁定卡暗色', isDark(locked), JSON.stringify(locked));
  const hardBtn = await px(geo.hardX + 40, geo.diffY + geo.diffH / 2);
  check('困难锁定按钮暗色', isDark(hardBtn), JSON.stringify(hardBtn));
  const statPanel = await px(geo.statX + 10, geo.statY + 10);
  check('属性面板已绘制', isDark(statPanel), JSON.stringify(statPanel));

  // 选重锤 → 重锤卡金色描边
  const hammer = await evalJs(`(() => { const L = hangarLayout(); const ids = Object.keys(PLANE_DEFS); const i = ids.indexOf('hammer'); return { x: L.cardsX + i*(L.cardW+L.gap) + L.cardW - 1, y: L.cardsY + L.cardH/2 }; })()`);
  await evalJs(`handleCanvasPress(${hammer.x - 100}, ${hammer.y})`);
  await sleep(500);
  const border2 = await px(hammer.x, hammer.y);
  check('重锤卡选中金色描边', isGold(border2), JSON.stringify(border2));

  // 返回标题 → 战役模式 → 简报
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  await sleep(400);
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  await sleep(1600);
  check('已进入简报', await evalJs(`GAME.state === 'briefing'`));
  const brief = await px(800, 300);
  check('简报面板已绘制', isDark(brief), JSON.stringify(brief));

  // 出击后再结算
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  await sleep(1600);
  check('已进入战斗', await evalJs(`GAME.state === 'playing'`));
  await evalJs(`GAME.kills = 11; finishMission(true);`);
  await sleep(500);
  const cb = await evalJs(`(() => { const b = menuButtons[0]; return { x: b.x + 24, y: b.y + b.h/2 }; })()`);
  const cbtn = await px(cb.x, cb.y);
  check('结算主按钮已绘制(橙)', cbtn[0] > 200 && cbtn[1] > 120 && cbtn[2] < 130, JSON.stringify(cbtn));

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 渲染探针: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ===');
  if (errors.length) { console.log('Chrome 错误:\n' + errors.join('\n')); process.exitCode = 1; }
  chrome.kill();
  process.exit(failed.length || errors.length ? 1 : 0);
}
main().catch((e) => { console.error('FATAL:', e.message); chrome.kill(); process.exit(1); });
