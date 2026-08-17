import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9343;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-revive', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-revive',
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

  // ---- 1. 初始次数:战役 1 次 / 无尽 3 次 ----
  const r1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    return { rc: GAME.reviveCount, ru: GAME.revivesUsed, state: GAME.state };
  })()`);
  check('战役开局 reviveCount === 1', r1.rc === 1 && r1.ru === 0, JSON.stringify(r1));

  const r2 = await evalJs(`(() => {
    startEndless();
    return { rc: GAME.reviveCount, ru: GAME.revivesUsed };
  })()`);
  check('无尽开局 reviveCount === 3', r2.rc === 3 && r2.ru === 0, JSON.stringify(r2));

  // ---- 2. 复活流程(有次数时死亡)----
  const r3 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.reviveCount = 1; GAME.revivesUsed = 0;
    // 造敌弹/敌导弹 + 己方弹
    bullets.length = 0; missiles.length = 0;
    bullets.push({ x: 0, y: 0, enemy: true, fromPlayer: false });
    bullets.push({ x: 0, y: 0, enemy: false, fromPlayer: true });
    missiles.push({ x: 0, y: 0, enemy: true });
    missiles.push({ x: 0, y: 0, enemy: false });
    player.hp = 0;
    killPlane(player);
    return {
      rc: GAME.reviveCount, ru: GAME.revivesUsed,
      hp: player.hp, maxHp: player.maxHp, invuln: player.invuln,
      alive: player.alive, dead: player.dead,
      state: GAME.state, pending: GAME.pendingState,
      enemyBullets: bullets.filter(b => b.enemy).length,
      playerBullets: bullets.filter(b => !b.enemy).length,
      enemyMissiles: missiles.filter(m => m.enemy).length,
      playerMissiles: missiles.filter(m => !m.enemy).length
    };
  })()`);
  check('死亡→复活:reviveCount-1 / revivesUsed+1', r3.rc === 0 && r3.ru === 1, JSON.stringify(r3));
  check('复活后 hp = 60% 最大生命', r3.hp === Math.round(r3.maxHp * 0.6), 'hp=' + r3.hp + '/' + r3.maxHp);
  check('复活后 invuln = 3', r3.invuln === 3, 'invuln=' + r3.invuln);
  check('复活后 alive=true dead=false', r3.alive === true && r3.dead === false);
  check('复活后敌弹清空、己方弹保留', r3.enemyBullets === 0 && r3.playerBullets === 1 && r3.enemyMissiles === 0 && r3.playerMissiles === 1, JSON.stringify({ eb: r3.enemyBullets, pb: r3.playerBullets, em: r3.enemyMissiles, pm: r3.playerMissiles }));
  check('复活后状态仍 playing、pending 清空', r3.state === 'playing' && r3.pending === null, 'state=' + r3.state);

  // ---- 3. 次数耗尽后再死亡 → gameover ----
  const r4 = await evalJs(`(() => {
    GAME.reviveCount = 0; GAME.revivesUsed = 1;
    player.hp = 0;
    killPlane(player);
    return { alive: player.alive, pending: GAME.pendingState, freeze: GAME.freezeTimer, rc: GAME.reviveCount, ru: GAME.revivesUsed };
  })()`);
  check('次数耗尽→gameover', r4.alive === false && r4.pending === 'gameover' && r4.freeze === 1.6 && r4.rc === 0 && r4.ru === 1, JSON.stringify(r4));

  // ---- 4. 拾取 revive 掉落 ----
  const r5 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.reviveCount = 2; GAME.revivesUsed = 0;
    player.alive = true; player.dead = false;
    bullets.length = 0; missiles.length = 0; particles.length = 0;
    pickups.length = 0;
    pickups.push({ x: player.x, y: player.y, vx: 0, vy: 0, type: 'revive', life: 18, t: 0 });
    updatePickups(0.016);
    return { rc: GAME.reviveCount, left: pickups.length };
  })()`);
  check('战役拾取复活徽章 → reviveCount+1 且拾取物消失', r5.rc === 3 && r5.left === 0, JSON.stringify(r5));

  const r6 = await evalJs(`(() => {
    GAME.reviveCount = 9;
    pickups.push({ x: player.x, y: player.y, vx: 0, vy: 0, type: 'revive', life: 18, t: 0 });
    updatePickups(0.016);
    return { rc: GAME.reviveCount, left: pickups.length };
  })()`);
  check('满 9 不叠加', r6.rc === 9, JSON.stringify(r6));

  const r7 = await evalJs(`(() => {
    GAME.reviveCount = 4;
    const p = { x: player.x, y: player.y, vx: 0, vy: 0, type: 'revive', life: 18, t: 0 };
    collectLoot(p);   // 无尽路径
    return { rc: GAME.reviveCount };
  })()`);
  check('无尽 collectLoot 拾取复活 → +1', r7.rc === 5, JSON.stringify(r7));

  // ---- 5. 结算减分 ----
  const r8 = await evalJs(`(() => {
    const base = { missionTime: 5, damageTaken: 0, maxCombo: 50, accuracy: 1, shotsFired: 100 };
    const a = computeRating({ ...base, revivesUsed: 0 });
    const b = computeRating({ ...base, revivesUsed: 1 });
    const c = computeRating({ ...base, revivesUsed: 2 });
    const d = computeRating({ ...base, revivesUsed: 3 });
    return { a, b, c, d };
  })()`);
  check('revivesUsed=0 与 =1 总分相同', r8.a.total === r8.b.total, 'a=' + r8.a.total + ' b=' + r8.b.total);
  check('revivesUsed=2 扣 5 分', r8.c.total === r8.a.total - 5, 'c=' + r8.c.total);
  check('revivesUsed=3 扣 10 分', r8.d.total === r8.a.total - 10, 'd=' + r8.d.total);

  const r9 = await evalJs(`(() => {
    const low = computeRating({ missionTime: 600, damageTaken: 120, maxCombo: 0, shotsFired: 0, revivesUsed: 99 });
    const drop = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 0.4, shotsFired: 100, revivesUsed: 3 });
    const noDrop = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 0.4, shotsFired: 100 });
    return { low, drop, noDrop };
  })()`);
  check('扣到负数归 0 → rank C', r9.low.total === 0 && r9.low.rank === 'C', JSON.stringify(r9.low));
  check('90 分(SS) 复活 3 次 → 80 分(S) 降级', r9.noDrop.total === 90 && r9.noDrop.rank === 'SS' && r9.drop.total === 80 && r9.drop.rank === 'S', JSON.stringify({ no: r9.noDrop, drop: r9.drop }));
  check('返回结构含 total/rank/parts', !!r9.noDrop.parts && r9.noDrop.parts.time !== undefined && r9.noDrop.parts.damage !== undefined && r9.noDrop.parts.combo !== undefined && r9.noDrop.parts.accuracy !== undefined);

  const r10 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    GAME.revivesUsed = 3;
    finishMission(true);
    return { total: GAME.endStats.rating.total, rank: GAME.endStats.rank, ru: GAME.revivesUsed };
  })()`);
  check('finishMission 传参:3 次复活 → total 90 / SS', r10.total === 90 && r10.rank === 'SS', JSON.stringify(r10));

  // ---- 6. HUD / 渲染冒烟 ----
  const r11 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.reviveCount = 2;
    pickups.push({ x: player.x + 60, y: player.y, vx: 0, vy: 0, type: 'revive', life: 18, t: 0 });
    drawHUD();
    drawPickups();
    return true;
  })()`);
  check('drawHUD + drawPickups 无异常(含复活显示)', r11 === true);

  await shot('t11-revive-hud.png');

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
