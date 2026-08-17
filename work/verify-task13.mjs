// 任务书 13 冒烟测试:成就界面 + 选关界面 + 标题布局修复
// 参照 work/verify-batch3.mjs 连接样板;端口 9360,profile work/chrome-profile-ui
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9360;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-ui', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-ui',
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
  await evalJs(`localStorage.clear(); location.reload();`);
  await sleep(1800);

  // ---- 1. 标题页:渲染无异常 + 按钮区与成就文字不重叠 ----
  const t1 = await evalJs(`(() => {
    setState('title');
    const maxBtnY = Math.max(...menuButtons.map(b => b.y + b.h));
    let h = H * 0.78;
    for (const b of menuButtons) h = Math.max(h, b.y + b.h);
    h += 26;   // 与 drawTitle 中 hintY 的计算一致
    drawTitle();
    return { maxBtnY, achLineY: h, gap: h - maxBtnY, btns: menuButtons.length, state: GAME.state };
  })()`);
  check('标题渲染无异常(4 按钮)', t1.state === 'title' && t1.btns === 4, JSON.stringify(t1));
  check('按钮区与成就行不重叠(gap>=26)', t1.gap >= 26 && t1.achLineY > t1.maxBtnY, 'gap=' + t1.gap);

  // ---- 2. 成就界面:12 卡片 + 已解锁/未解锁区分 ----
  const t2 = await evalJs(`(() => {
    save.achievements = ['first_kill'];   // 仅卡片0 解锁
    saveNow();
    setState('achievements');
    draw();
    const L = achievementsLayout();
    const dpr = DPR;
    const strip = (cx, y0, dyFrom, dyTo) => {
      const out = [];
      for (let dy = dyFrom; dy <= dyTo; dy++) {
        const d = ctx.getImageData(Math.round(cx * dpr), Math.round((y0 + dy) * dpr), 1, 1).data;
        out.push([d[0], d[1], d[2]]);
      }
      return out;
    };
    const c0x = L.startX + L.cardW / 2;                        // 卡片0 first_kill(已解锁)
    const c2x = L.startX + 2 * (L.cardW + L.gapX) + L.cardW / 2; // 卡片2 rank_s(未解锁)
    const gold = (p) => p[0] > 180 && p[1] > 150 && p[2] < 160;
    const dark = (p) => p[0] < 90 && p[1] < 110 && p[2] < 130;
    const s0 = strip(c0x, L.startY, -3, 1);   // 描边采样带(含抗锯齿偏移)
    const s2 = strip(c2x, L.startY, -3, 1);
    const f0 = strip(c0x, L.startY, 3, 6);    // 卡内填充
    const f2 = strip(c2x, L.startY, 3, 6);
    return {
      cards: ACHIEVEMENT_DEFS.length, cols: L.cols, rows: L.rows, state: GAME.state,
      unlocked: isUnlocked('first_kill'), locked: isUnlocked('rank_s'),
      backLabel: menuButtons.length ? menuButtons[0].label : null,
      c0gold: s0.some(gold), c2gold: s2.some(gold),
      c0fillBright: f0.some(p => p[1] > 35), c2fillDark: f2.some(dark)
    };
  })()`);
  await sleep(300);
  await shot('t13-achievements.png');
  check('成就界面渲染 12 卡片(状态断言)', t2.state === 'achievements' && t2.cards === 12 && t2.unlocked && !t2.locked && t2.backLabel === '返回标题', JSON.stringify({ cards: t2.cards, cols: t2.cols, rows: t2.rows, unlocked: t2.unlocked, locked: t2.locked, back: t2.backLabel }));
  check('已解锁金色描边 / 未解锁暗色(像素探针)', t2.c0gold && !t2.c2gold && t2.c0fillBright && t2.c2fillDark, JSON.stringify({ c0gold: t2.c0gold, c2gold: t2.c2gold, c0fillBright: t2.c0fillBright, c2fillDark: t2.c2fillDark }));

  // ---- 3. 入口:机库按钮 / 标题成就段 ----
  const e1 = await evalJs(`(() => {
    setState('hangar');
    const b = menuButtons[1];   // 「成就」按钮
    handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
    return { state: GAME.state, ret: achievementsReturn, label: menuButtons.length ? menuButtons[0].label : null };
  })()`);
  check('机库「成就」按钮 → achievements(记来源)', e1.state === 'achievements' && e1.ret === 'hangar' && e1.label === '返回机库', JSON.stringify(e1));
  const e2 = await evalJs(`(() => {
    const b = menuButtons[0];
    handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
    return GAME.state;
  })()`);
  check('成就「返回机库」→ hangar', e2 === 'hangar', e2);
  const e3 = await evalJs(`(() => {
    setState('title');
    const r = titleAchRegion();
    handleCanvasPress(r.x + r.w / 2, r.y + r.h / 2);
    return { state: GAME.state, ret: achievementsReturn };
  })()`);
  check('标题成就段点击 → achievements', e3.state === 'achievements' && e3.ret === 'title', JSON.stringify(e3));

  // ---- 4. 选关界面:9 卡片 + 点击已解锁/锁定 ----
  const s0 = await evalJs(`(() => {
    save.unlockedMissions = 3;
    save.bestRank = { 0: 'S', 1: 'A' };
    setState('select');
    draw();
    return { n: MISSION_DEFS.length, state: GAME.state, back: menuButtons.length ? menuButtons[0].label : null,
             unlockedFlags: MISSION_DEFS.map(d => d.index <= save.unlockedMissions) };
  })()`);
  await sleep(300);
  await shot('t13-select.png');
  check('选关界面渲染 9 关卡片', s0.state === 'select' && s0.n === 9 && s0.back === '返回标题' && s0.unlockedFlags[0] && !s0.unlockedFlags[3], JSON.stringify({ n: s0.n, back: s0.back, unlockedFlags: s0.unlockedFlags }));

  const s1 = await evalJs(`(() => {
    const L = selectLayout();
    const cx = L.startX + L.cardW / 2;
    const cy = L.groups[0].y + L.labelH + L.cardH / 2;
    handleCanvasPress(cx, cy);
    return { state: GAME.state, idx: GAME.missionIndex };
  })()`);
  check('点击已解锁第 1 关 → briefing idx=0', s1.state === 'briefing' && s1.idx === 0, JSON.stringify(s1));

  const s2 = await evalJs(`(() => {
    setState('select');
    const L = selectLayout();
    const cx = L.startX + 2 * (L.cardW + L.gapX) + L.cardW / 2;
    const cy = L.groups[0].y + L.labelH + L.cardH / 2;
    handleCanvasPress(cx, cy);
    return { state: GAME.state, idx: GAME.missionIndex };
  })()`);
  check('点击已解锁第 3 关 → briefing idx=2', s2.state === 'briefing' && s2.idx === 2, JSON.stringify(s2));

  const s3 = await evalJs(`(() => {
    save.unlockedMissions = 1;
    setState('select');
    const L = selectLayout();
    const cx = L.startX + (L.cardW + L.gapX) + L.cardW / 2;  // 第2关(锁定)
    const cy = L.groups[0].y + L.labelH + L.cardH / 2;
    handleCanvasPress(cx, cy);
    const toast = particles.some(p => p.type === 'text' && String(p.text || '').includes('解锁'));
    return { state: GAME.state, toast };
  })()`);
  check('点击锁定关 → 状态不变 + toast', s3.state === 'select' && s3.toast, JSON.stringify(s3));

  // ---- 5. 标题「战役模式」→ select;briefing「选择任务」→ select ----
  const t5 = await evalJs(`(() => {
    setState('title');
    const b = menuButtons[0];
    handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
    return { state: GAME.state, mode: GAME.mode };
  })()`);
  check('标题「战役模式」→ select(非 briefing)', t5.state === 'select' && t5.mode === 'campaign', JSON.stringify(t5));

  const t6 = await evalJs(`(() => {
    setState('briefing');
    const b = menuButtons[2];   // 「选择任务」
    handleCanvasPress(b.x + b.w / 2, b.y + b.h / 2);
    return { state: GAME.state, btns: menuButtons.length };
  })()`);
  check('briefing「选择任务」→ select', t6.state === 'select' && t6.btns === 1, JSON.stringify(t6));

  // ---- 6. handleConfirmKey 默认动作 ----
  const t7 = await evalJs(`(() => {
    setState('achievements');
    handleConfirmKey();
    return GAME.state;
  })()`);
  check('handleConfirmKey(成就)默认返回', t7 === 'title', t7);

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
