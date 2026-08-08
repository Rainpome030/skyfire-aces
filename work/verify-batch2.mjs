import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-b2', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-b2',
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

  // 1. 9 关数据
  const defs = await evalJs(`MISSION_DEFS.map(d => ({ name: d.name, type: d.type, chapter: d.chapter, bossKind: d.bossKind || null }))`);
  check('9 关战役', defs.length === 9, 'len=' + defs.length);
  check('前3关类型正确', defs[0].type === 'clear' && defs[1].type === 'escort' && defs[2].type === 'boss', JSON.stringify(defs.slice(0, 3)));
  check('新6关类型正确', defs[3].type === 'intercept' && defs[4].type === 'survive' && defs[5].type === 'boss' && defs[6].type === 'race' && defs[7].type === 'escort' && defs[8].type === 'boss', JSON.stringify(defs.slice(3)));
  check('BOSS 关 bossKind 指定', defs[5].bossKind === 'eye' && defs[8].bossKind === 'king', JSON.stringify([defs[5].bossKind, defs[8].bossKind]));
  check('章节分布', defs[0].chapter === 1 && defs[3].chapter === 2 && defs[6].chapter === 3, JSON.stringify(defs.map(d => d.chapter)));

  // 2. 各关 startMission 不抛错
  for (const idx of [3, 4, 5, 6, 7, 8]) {
    const r = await evalJs(`(() => { try { startMission(${idx}, 'campaign'); return 'ok'; } catch (e) { return String(e); } })()`);
    check(`第${idx + 1}关启动正常`, r === 'ok', r);
  }

  // 3. eye BOSS:生成 + 阶段切换 + takeDmgMult
  await evalJs(`startMission(5, 'campaign');`);
  const eye = await evalJs(`(() => { const b = mission.boss; return { kind: b && b.kind, phase: b && b.phase, hp: b && b.hp }; })()`);
  check('eye BOSS 生成', eye.kind === 'eye' && eye.phase === 1, JSON.stringify(eye));
  const eyePhase = await evalJs(`(() => { const b = mission.boss; b.hp = b.maxHp * 0.6; updateEyeBoss(b, 0.016); const p2 = b.phase; b.hp = b.maxHp * 0.3; updateEyeBoss(b, 0.016); return { p2, p3: b.phase, mult: b.takeDmgMult }; })()`);
  check('eye 阶段2血线66%→phase2', eyePhase.p2 === 2, JSON.stringify(eyePhase));
  check('eye 阶段3血线33%→phase3', eyePhase.p3 === 3, JSON.stringify(eyePhase));
  check('eye 阶段3 takeDmgMult=1.5', eyePhase.mult === 1.5, JSON.stringify(eyePhase));

  // 4. king BOSS
  await evalJs(`startMission(8, 'campaign');`);
  const king = await evalJs(`(() => { const b = mission.boss; return { kind: b && b.kind, phase: b && b.phase }; })()`);
  check('king BOSS 生成', king.kind === 'king' && king.phase === 1, JSON.stringify(king));
  const kingPhase = await evalJs(`(() => { const b = mission.boss; b.hp = b.maxHp * 0.5; updateKingBoss(b, 0.016); return b.phase; })()`);
  check('king 阶段2血线60%→phase2', kingPhase === 2, 'phase=' + kingPhase);

  // 5. bossKilled 判定
  const bk = await evalJs(`(() => { startMission(5, 'campaign'); mission.boss.hp = 0; killPlane(mission.boss); return mission.bossKilled; })()`);
  check('eye 击坠 → bossKilled', bk === true);

  // 6. intercept 关:达标完成
  const intc = await evalJs(`(() => { startMission(3, 'campaign'); GAME.kills = mission.def.targetKills; updateIntercept(mission, 0.016); return mission.complete; })()`);
  check('intercept 达标→complete', intc === true);
  const intcFail = await evalJs(`(() => { startMission(3, 'campaign'); mission.def.timeLimit = 0; updateIntercept(mission, 0.016); updateMission(0.016); return { failed: mission.failed, pend: GAME.pendingState }; })()`);
  check('intercept 超时→failed+兜底', intcFail.failed === true && intcFail.pend === 'gameover', JSON.stringify(intcFail));

  // 7. race 关:检查点推进
  const race = await evalJs(`(() => { startMission(6, 'campaign'); const n = mission.def.checkpoints.length; player.x = mission.def.checkpoints[0].x; player.y = mission.def.checkpoints[0].y; updateRace(mission, 0.016); const after = mission.raceIndex; return { n, after }; })()`);
  check('race 检查点推进', race.n === 5 && race.after === 1, JSON.stringify(race));
  const raceDone = await evalJs(`(() => { startMission(6, 'campaign'); const cps = mission.def.checkpoints; for (let i = 0; i < cps.length; i++) { player.x = cps[i].x; player.y = cps[i].y; updateRace(mission, 0.016); } return mission.complete; })()`);
  check('race 全检查点→complete', raceDone === true);

  // 8. survive 关:时长完成
  const surv = await evalJs(`(() => { startMission(4, 'campaign'); mission.def.duration = 0; updateSurvive(mission, 0.016); return mission.complete; })()`);
  check('survive 时间到→complete', surv === true);

  // 9. HUD 计时文本
  const hud = await evalJs(`(() => { startMission(3, 'campaign'); const t = missionTimerText(); return typeof t === 'string' && t.length > 0; })()`);
  check('intercept HUD 计时文本', hud === true);
  const hudNull = await evalJs(`(() => { startMission(0, 'campaign'); return missionTimerText() === null; })()`);
  check('clear 关无计时文本', hudNull === true);

  // 10. 通关第 9 关 → chapterCleared=3
  const ch9 = await evalJs(`(() => { startMission(8, 'campaign'); mission.boss.hp = 0; killPlane(mission.boss); mission.bossKilled = true; finishMission(true); return { cc: save.chapterCleared, um: save.unlockedMissions }; })()`);
  check('终章通关 chapterCleared=3', ch9.cc === 3, JSON.stringify(ch9));

  await shot('b2-boss-eye.png');

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
