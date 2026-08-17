import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9340;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-cmp', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-cmp',
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

// 作弊通关:按关卡类型完成目标
const CHEAT = `
(() => {
  if (!mission || mission.complete || mission.failed) return 'skip';
  const def = mission.def;
  if (def.type === 'boss') {
    if (mission.boss) { mission.boss.hp = 0; killPlane(mission.boss); mission.bossKilled = true; }
    finishMission(true);
  } else if (def.type === 'intercept') {
    GAME.kills = def.targetKills; updateIntercept(mission, 0.016); finishMission(true);
  } else if (def.type === 'survive') {
    mission.def.duration = 0; updateSurvive(mission, 0.016); finishMission(true);
  } else if (def.type === 'race') {
    const cps = def.checkpoints;
    for (let i = 0; i < cps.length; i++) { player.x = cps[i].x; player.y = cps[i].y; updateRace(mission, 0.016); }
    finishMission(true);
  } else if (def.type === 'escort') {
    mission.escortDone = true; mission.transport.wpIndex = mission.transport.waypoints.length; finishMission(true);
  } else {
    // clear:杀光场上敌人
    for (const e of enemies) if (!e.dead) { e.hp = 0; killPlane(e); }
    finishMission(true);
  }
  return GAME.endStats ? GAME.endStats.missionName : '?';
})()
`;

async function main() {
  await connect();
  await sleep(1200);

  // 清档,从头打
  await evalJs(`localStorage.clear(); location.reload();`);
  await sleep(1800);
  check('初始状态', await evalJs(`GAME.state === 'title' && save.unlockedMissions === 1`));

  const playthrough = [];
  for (let i = 0; i < 9; i++) {
    // 进入战役
    await evalJs(`GAME.mode = 'campaign'; GAME.missionIndex = ${i}; startMission(${i}, 'campaign');`);
    await sleep(150);
    // 作弊通关
    const r = await evalJs(CHEAT);
    await sleep(200);
    const st = await evalJs(`({ state: GAME.state, mIdx: GAME.missionIndex, um: save.unlockedMissions, cc: save.chapterCleared, rank: GAME.endStats && GAME.endStats.rank, btn: menuButtons.length ? menuButtons[0].label : null })`);
    playthrough.push({ i: i + 1, r, ...st });
    console.log(`关卡 ${i + 1}: ${r} → state=${st.state} 解锁=${st.um} 章节=${st.cc} 评级=${st.rank}`);
  }

  const last = playthrough[8];
  check('第9关通关 → complete', last.state === 'complete', last.state);
  check('全9关解锁 um=9', last.um === 9, 'um=' + last.um);
  check('终章通关 chapterCleared=3', last.cc === 3, 'cc=' + last.cc);
  check('终章按钮=自由出击(无下一关)', last.btn && last.btn.includes('自由出击'), last.btn);
  check('9 关全部通关无异常', playthrough.every((p) => p.r !== 'skip' && !String(p.r).startsWith('E')), JSON.stringify(playthrough.map(p => p.r)));

  // 评级存在性
  check('评级已产出(S/A/B/C)', ['S', 'A', 'B', 'C'].includes(last.rank) || last.rank === 'C', 'rank=' + last.rank);

  // 重玩已通关章节不触发任何异常
  const replay = await evalJs(`(() => { try { startMission(0, 'campaign'); return 'ok'; } catch (e) { return String(e); } })()`);
  check('重玩第1关正常', replay === 'ok', replay);

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
