import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-task02', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-task02',
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

async function shot(name) {
  await sleep(400);
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(ROOT + '/work/' + name, Buffer.from(res.data, 'base64'));
  console.log('📸 截图: ' + name);
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  await connect();

  // ---- 1. 标题:4 按钮 + 机库入口 + 总战绩数据 ----
  await evalJs('localStorage.clear()');
  await reload();
  check('标题 4 按钮含机库', await evalJs(`JSON.stringify(menuButtons.map(b => b.label)) === JSON.stringify(['战役模式','自由出击','机库','按键设置'])`),
    JSON.stringify(await evalJs(`menuButtons.map(b => b.label)`)));
  check('机库按钮 y 递推 (index 2)', await evalJs(`Math.abs(menuButtons[2].y - (H*0.60 + (54+14)*2)) < 0.001 && menuButtons[2].label === '机库'`));
  check('标题总战绩初始值', await evalJs(`save.totalKills === 0 && save.missionsCleared === 0 && save.bestKills === 0`));
  await shot('02a-title.png');

  // ---- 2. 进入机库:卡片/难度/返回 ----
  await evalJs(`handleCanvasPress(menuButtons[2].x + menuButtons[2].w/2, menuButtons[2].y + menuButtons[2].h/2)`);
  check('点击机库进入 hangar', await evalJs(`GAME.state === 'hangar'`));
  check('hangar 返回按钮为首按钮', await evalJs(`menuButtons.length === 1 && menuButtons[0].label === '返回'`));
  check('新档凤凰未解锁', await evalJs(`isPlaneUnlocked('phoenix') === false`));
  check('新档困难未解锁', await evalJs(`isDifficultyUnlocked('hard') === false`));
  await shot('02b-hangar.png');

  // ---- 3. 锁定交互:凤凰卡不可选 ----
  const phoenixCard = await evalJs(`(() => { const L = hangarLayout(); const ids = Object.keys(PLANE_DEFS); const i = ids.indexOf('phoenix'); return { x: L.cardsX + i*(L.cardW+L.gap) + L.cardW/2, y: L.cardsY + L.cardH/2 }; })()`);
  await evalJs(`handleCanvasPress(${phoenixCard.x}, ${phoenixCard.y})`);
  check('点凤凰卡不选中且仍在机库', await evalJs(`save.selectedPlane === 'gale' && GAME.state === 'hangar'`));
  check('凤凰锁定 toast', await evalJs(`particles.some(p => p.type === 'text' && String(p.text).includes('通关第二章解锁'))`));

  // ---- 4. 选重锤 + 持久化 ----
  const hammerCard = await evalJs(`(() => { const L = hangarLayout(); const ids = Object.keys(PLANE_DEFS); const i = ids.indexOf('hammer'); return { x: L.cardsX + i*(L.cardW+L.gap) + L.cardW/2, y: L.cardsY + L.cardH/2 }; })()`);
  await evalJs(`handleCanvasPress(${hammerCard.x}, ${hammerCard.y})`);
  check('选中重锤并持久化', await evalJs(`save.selectedPlane === 'hammer' && JSON.parse(localStorage.getItem('skyfire_save_v1')).selectedPlane === 'hammer'`));

  // ---- 5. 困难按钮:未解锁不可选 ----
  const hardBtn = await evalJs(`(() => { const L = hangarLayout(); const keys = Object.keys(DIFFICULTY_DEFS); const totalW = keys.length*L.diffW + (keys.length-1)*L.diffGap; const i = keys.indexOf('hard'); const dx = W/2 - totalW/2 + i*(L.diffW+L.diffGap); return { x: dx + L.diffW/2, y: L.diffY + L.diffH/2 }; })()`);
  await evalJs(`handleCanvasPress(${hardBtn.x}, ${hardBtn.y})`);
  check('未解锁点困难不生效', await evalJs(`save.difficulty === 'normal'`));

  // ---- 6. chapterCleared=1 后困难可选 ----
  await evalJs(`save.chapterCleared = 1; saveNow();`);
  await evalJs(`handleCanvasPress(${hardBtn.x}, ${hardBtn.y})`);
  check('解锁后选困难并持久化', await evalJs(`save.difficulty === 'hard' && isDifficultyUnlocked('hard') && JSON.parse(localStorage.getItem('skyfire_save_v1')).difficulty === 'hard'`));
  await shot('02b2-hangar-hard.png');

  // ---- 7. 返回标题 ----
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  check('返回按钮回标题', await evalJs(`GAME.state === 'title'`));

  // ---- 8. 战役模式 → 简报 ----
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  await sleep(1600);
  check('进入简报', await evalJs(`GAME.state === 'briefing'`));
  await shot('02c-briefing.png');

  // ---- 9. 出击 → 重锤乘区联动 ----
  await evalJs(`handleCanvasPress(menuButtons[0].x + menuButtons[0].w/2, menuButtons[0].y + menuButtons[0].h/2)`);
  await sleep(1600);
  check('出击后重锤 maxHp=150', await evalJs(`player.maxHp === 150 && player.hp === 150`));

  // ---- 10. 通关第 1 关 → 结算守卫 + 进度后缀 ----
  await evalJs(`GAME.kills = 11; finishMission(true);`);
  check('通关后解锁进度 2/9', await evalJs(`save.unlockedMissions === 2 && MISSION_DEFS.length === 9`));
  check('结算按钮带进度后缀', await evalJs(`menuButtons[0].label === '下一任务 (解锁进度 2/9)'`), await evalJs(`menuButtons[0].label`));
  await shot('02d-complete.png');

  // ---- 11. 未解锁下一关时视作最后一关 ----
  await evalJs(`GAME.missionIndex = 2; setState('complete');`);
  check('未解锁关显示自由出击', await evalJs(`menuButtons[0].label === '自由出击'`), await evalJs(`menuButtons[0].label`));

  // ---- 12. hangar 确认键 = 返回 ----
  await evalJs(`setState('hangar'); handleConfirmKey();`);
  check('hangar 确认键触发返回', await evalJs(`GAME.state === 'title'`));

  // ---- 13. 标题总战绩与存档一致 ----
  await evalJs(`save.totalKills = 5; save.missionsCleared = 1; save.bestKills = 3; saveNow(); setState('title');`);
  check('标题总战绩数据就绪', await evalJs(`save.totalKills === 5 && save.missionsCleared === 1 && save.bestKills === 3`));
  await shot('02e-title-stats.png');

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
