import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-revive2', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-revive2',
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

// 模拟玩家死亡(走 killPlane 玩家分支)
const KILL_PLAYER = `(() => {
  player.hp = 0;
  killPlane(player);
  return { alive: player.alive, hp: player.hp, invuln: player.invuln, rc: GAME.reviveCount, ru: GAME.revivesUsed, state: GAME.state };
})()`;

async function main() {
  await connect();
  await sleep(1200);

  // ===== 战役模式:无限复活 =====
  await evalJs(`startMission(0, 'campaign');`);
  const c0 = await evalJs(`({ rc: GAME.reviveCount, ur: GAME.unlimitedRevive })`);
  check('战役开局:无限标志=true 计数=0', c0.ur === true && c0.rc === 0, JSON.stringify(c0));

  // 死 5 次全部复活,不消耗计数
  let reviveOk = true, ruAfter = 0;
  for (let i = 0; i < 5; i++) {
    const r = await evalJs(KILL_PLAYER);
    if (!r.alive || r.state !== 'playing') { reviveOk = false; break; }
    ruAfter = r.ru;
  }
  const c1 = await evalJs(`({ rc: GAME.reviveCount })`);
  check('战役连死 5 次全部复活', reviveOk === true, 'ru=' + ruAfter);
  check('战役复活不消耗计数(仍 0)', c1.rc === 0, JSON.stringify(c1));
  check('战役复活累计 revivesUsed=5', ruAfter === 5, 'ru=' + ruAfter);

  // 复活效果:60% 血 + 无敌 + 敌弹清空
  const c2 = await evalJs(`(() => {
    startMission(0, 'campaign');
    player.hp = 0;
    bullets.push({ enemy: true, x: 0, y: 0 });
    missiles.push({ enemy: true, x: 0, y: 0 });
    bullets.push({ enemy: false, x: 0, y: 0 });
    killPlane(player);
    return { hp: player.hp, maxHp: player.maxHp, invuln: player.invuln, enemyBullets: bullets.filter(b => b.enemy).length, myBullets: bullets.filter(b => !b.enemy).length, enemyMsl: missiles.filter(m => m.enemy).length };
  })()`);
  check('复活:60%血+动画期无敌(1.2s)+清敌弹留己弹', c2.hp === Math.round(c2.maxHp * 0.6) && c2.invuln === 1.2 && c2.enemyBullets === 0 && c2.myBullets === 1 && c2.enemyMsl === 0, JSON.stringify(c2));
  // 动画结束后才开始 3 秒无敌计时
  const c2b = await evalJs(`(() => {
    for (let i = 0; i < 70; i++) updatePlayer(0.016);  // 1.12s > 动画 1.0s
    return { invuln: player.invuln, anim: player.reviveAnim };
  })()`);
  check('动画结束后 invuln=3 开始计时', c2b.anim === null && c2b.invuln >= 2.5 && c2b.invuln <= 3.1, JSON.stringify(c2b));
  await evalJs(`ChapterCard.skip();`);  // 清掉 c2 触发的章节过场,避免短路后续 update

  // ===== 无尽模式:3 次 =====
  await evalJs(`startEndless();`);
  const e0 = await evalJs(`({ rc: GAME.reviveCount, ur: GAME.unlimitedRevive })`);
  check('无尽开局:无限标志=false 计数=3', e0.ur === false && e0.rc === 3, JSON.stringify(e0));

  const e1 = await evalJs(KILL_PLAYER);
  check('无尽第1次死亡复活(剩2)', e1.alive === true && e1.rc === 2, JSON.stringify({ alive: e1.alive, rc: e1.rc }));
  const e2 = await evalJs(KILL_PLAYER);
  check('无尽第2次死亡复活(剩1)', e2.alive === true && e2.rc === 1, JSON.stringify({ alive: e2.alive, rc: e2.rc }));
  const e3 = await evalJs(KILL_PLAYER);
  check('无尽第3次死亡复活(剩0)', e3.alive === true && e3.rc === 0, JSON.stringify({ alive: e3.alive, rc: e3.rc }));
  const e4 = await evalJs(KILL_PLAYER);
  check('无尽第4次死亡 → 死亡+pending gameover', e4.alive === false && e4.state === 'playing', JSON.stringify({ alive: e4.alive, state: e4.state }));
  const e5 = await evalJs(`(() => { const before = { ft: GAME.freezeTimer, pend: GAME.pendingState, st: GAME.state }; for (let i = 0; i < 200; i++) update(0.016); return { before, after: { ft: GAME.freezeTimer, pend: GAME.pendingState, st: GAME.state } }; })()`);
  check('无尽次数耗尽 3.2s 后 → gameover', e5.after.st === 'gameover', JSON.stringify(e5));

  // ===== 掉落池 =====
  const d1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    let hasRevive = false;
    for (let i = 0; i < 300; i++) {
      const e = makeEnemy('fighter', 0, 0); enemies.push(e); e.hp = 0;
      const before = pickups.length;
      killPlane(e);
      for (let j = before; j < pickups.length; j++) if (pickups[j].type === 'revive') hasRevive = true;
      pickups.length = before;
      enemies.pop();
    }
    return hasRevive;
  })()`);
  check('战役掉落池不含复活徽章(300次采样)', d1 === false);

  const d2 = await evalJs(`(() => {
    startEndless();
    let hasRevive = false;
    for (let i = 0; i < 300; i++) {
      const e = makeEnemy('fighter', 0, 0); enemies.push(e); e.hp = 0;
      const before = pickups.length;
      killPlane(e);
      for (let j = before; j < pickups.length; j++) if (pickups[j].type === 'revive') hasRevive = true;
      pickups.length = before;
      enemies.pop();
    }
    return hasRevive;
  })()`);
  check('无尽掉落池含复活徽章(300次采样)', d2 === true);

  // ===== 结算减分(战役,revivesUsed 计入) =====
  const s1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    GAME.revivesUsed = 2;
    finishMission(true);
    return { total: GAME.endStats.rating.total, rank: GAME.endStats.rating.rank };
  })()`);
  check('战役用2次复活:满分100-5=95 → SSS', s1.total === 95 && s1.rank === 'SSS', JSON.stringify(s1));
  const s2 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    GAME.revivesUsed = 4;
    finishMission(true);
    return { total: GAME.endStats.rating.total, rank: GAME.endStats.rating.rank };
  })()`);
  check('战役用4次复活:100-15=85 → SS', s2.total === 85 && s2.rank === 'SS', JSON.stringify(s2));

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
