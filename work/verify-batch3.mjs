import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-b3', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-b3',
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

  // 1. 评级系统
  const r1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    finishMission(true);
    return { rank: GAME.endStats.rank, total: GAME.endStats.rating.total, parts: GAME.endStats.rating.parts };
  })()`);
  check('完美局 → SSS', r1.rank === 'SSS', JSON.stringify(r1));
  const r2 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 500; GAME.damageTaken = 100; GAME.maxCombo = 0;
    GAME.shotsFired = 0; GAME.shotsHit = 0;
    finishMission(true);
    return { rank: GAME.endStats.rank, total: GAME.endStats.rating.total };
  })()`);
  check('惨败局 → C', r2.rank === 'C', JSON.stringify(r2));
  check('bestRank 已写入', await evalJs(`save.bestRank[0] === 'SSS'`));

  // 2. 成就系统
  const a1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    const e = makeEnemy('fighter', 0, 0); enemies.push(e);
    e.hp = 0; killPlane(e);
    return save.achievements;
  })()`);
  check('首杀成就解锁', a1.includes('first_kill'), JSON.stringify(a1));
  const a2 = await evalJs(`(() => {
    // 通关第3关(第一章) → chapter1 成就
    save.achievements = []; save.chapterCleared = 0;
    startMission(2, 'campaign');
    mission.boss.hp = 0; killPlane(mission.boss); mission.bossKilled = true;
    finishMission(true);
    return { ach: save.achievements, cc: save.chapterCleared };
  })()`);
  check('通关第一章 → chapter1 成就', a2.ach.includes('chapter1'), JSON.stringify(a2));
  const a3 = await evalJs(`(() => {
    save.achievements = []; save.chapterCleared = 3; save.difficulty = 'hard';
    save.bestRank[0] = 'SSS'; save.selectedPlane = 'phoenix';
    grantAchievements();
    const has = save.achievements;
    return { hard: has.includes('hard_clear'), sss: has.includes('rank_sss'), plane: has.includes('plane_all'), ch3: has.includes('chapter3') };
  })()`);
  check('成就批量解锁(hard/sss/plane/ch3)', a3.hard && a3.sss && a3.plane && a3.ch3, JSON.stringify(a3));

  // 3. 章节过场
  const c1 = await evalJs(`(() => {
    save.chapterCleared = 0; saveNow();
    startMission(3, 'campaign');   // 第二章首关(第4关)
    return ChapterCard.isActive();
  })()`);
  check('首进第二章 → 过场激活', c1 === true);
  const c2 = await evalJs(`(() => { for (let i = 0; i < 700; i++) ChapterCard.update(0.016); return ChapterCard.isActive(); })()`);
  check('过场 11.2s 后自然结束', c2 === false);
  const c3 = await evalJs(`(() => {
    save.chapterCleared = 2; saveNow();
    startMission(3, 'campaign');   // 已通关章节重玩
    return ChapterCard.isActive();
  })()`);
  check('重玩已通关章节不触发过场', c3 === false);
  const c4 = await evalJs(`(() => {
    save.chapterCleared = 0; saveNow();
    startMission(3, 'campaign');
    ChapterCard.skip();
    return ChapterCard.isActive();
  })()`);
  check('skip 立即结束过场', c4 === false);

  // 4. 过场期间战斗暂停
  const c5 = await evalJs(`(() => {
    save.chapterCleared = 0; saveNow();
    startMission(3, 'campaign');
    const t0 = GAME.missionTime;
    for (let i = 0; i < 60; i++) update(0.016);
    return GAME.missionTime === t0;
  })()`);
  check('过场期间 missionTime 不推进', c5 === true);

  await shot('b3-complete-rank.png');

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
