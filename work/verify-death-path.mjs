import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9354;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-die', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-die',
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

async function main() {
  await connect();
  await sleep(1200);

  // 场景 1:敌弹在 updateBullets 遍历中打死玩家
  const s1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    player.hp = 5; player.invuln = 0;
    bullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: 1, r: 4, dmg: 100, enemy: true, fromPlayer: false, hitCount: 0 });
    try {
      updateBullets(0.016);  // 敌弹命中 → 死亡 → 复活(遍历中清弹)
      return { ok: true, alive: player.alive, anim: !!player.reviveAnim, enemyBullets: bullets.filter(b => b.enemy).length };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check('敌弹遍历中死亡→复活无异常', s1.ok === true && s1.alive === true && s1.anim === true, JSON.stringify(s1));
  check('敌方子弹已原地清除', s1.enemyBullets === 0, 'left=' + s1.enemyBullets);

  // 场景 2:导弹在 updateMissiles 遍历中打死玩家
  const s2 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    player.hp = 5; player.invuln = 0;
    missiles.push({ x: player.x, y: player.y, heading: 0, speed: 0, turn: 0, life: 1, target: player, enemy: true, trail: 0, r: 5, damage: 100, dmgBonus: 0 });
    try {
      updateMissiles(0.016);
      return { ok: true, alive: player.alive, enemyMsl: missiles.filter(m => m.enemy).length };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check('敌导弹遍历中死亡→复活无异常', s2.ok === true && s2.alive === true, JSON.stringify(s2));
  check('敌方导弹已原地清除', s2.enemyMsl === 0, 'left=' + s2.enemyMsl);

  // 场景 3:复活后连续 300 帧真实 update 无异常(动画推进→无敌计时→归零)
  const s3 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    player.hp = 0; killPlane(player);
    for (let i = 0; i < 300; i++) update(0.016);
    return { alive: player.alive, anim: player.reviveAnim, invuln: player.invuln, state: GAME.state };
  })()`);
  check('复活后 300 帧正常(动画结束+无敌归零)', s3.alive === true && s3.anim === null && s3.invuln === 0 && s3.state === 'playing', JSON.stringify(s3));

  // 场景 4:密集交战中死亡(30 敌机 + 50 敌弹 + 玩家低血),真实 loop 路径
  const s4 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    for (let i = 0; i < 30; i++) { const e = makeEnemy('fighter', rand(0, 3000), rand(0, 3000)); enemies.push(e); }
    for (let i = 0; i < 50; i++) bullets.push({ x: rand(0, 3000), y: rand(0, 3000), vx: rand(-400, 400), vy: rand(-400, 400), life: 1, r: 4, dmg: 8, enemy: true, fromPlayer: false, hitCount: 0 });
    player.hp = 5; player.invuln = 0;
    try {
      for (let i = 0; i < 200; i++) update(0.016);
      return { ok: true, alive: player.alive, ru: GAME.revivesUsed, state: GAME.state };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check('密集交战中死亡→复活→200帧稳定', s4.ok === true && s4.alive === true && s4.state === 'playing', JSON.stringify(s4));

  // 场景 6:敌我子弹混排时玩家被敌弹打死(v1.2.1 遗漏的崩溃场景)
  const s6 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    player.hp = 5; player.invuln = 0;
    // 混排:[敌,己,敌,己,...] 交替,玩家子弹位置远离,敌弹一颗在玩家身上
    for (let i = 0; i < 20; i++) {
      const enemy = (i % 2 === 0);
      bullets.push({
        x: enemy ? (i === 4 ? player.x : rand(200, 3000)) : rand(100, 2000),
        y: enemy ? (i === 4 ? player.y : rand(200, 3000)) : rand(100, 2000),
        vx: 0, vy: 0, life: 1, r: 4,
        dmg: enemy ? 100 : 7, enemy: enemy, fromPlayer: !enemy, hitCount: 0
      });
    }
    try {
      updateBullets(0.016);  // 第 4 个元素(敌弹)命中玩家 → 死亡 → 复活(标记清弹)
      // 残留敌弹(已过本次处理点)必须全部被标记失效,下一帧自然清除
      const leftover = bullets.filter(b => b.enemy);
      const allMarked = leftover.length === 0 || leftover.every(b => b.life <= 0);
      for (let i = 0; i < 120; i++) update(0.016);
      return { ok: true, alive: player.alive, allMarked, enemyLeft: bullets.filter(b => b.enemy).length, total: bullets.length };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check('混排子弹中死亡→复活→120帧无异常', s6.ok === true && s6.alive === true, JSON.stringify(s6));
  check('混排后敌方子弹全清(标记失效)', s6.allMarked === true, JSON.stringify({ allMarked: s6.allMarked, enemyLeft: s6.enemyLeft }));

  // 场景 7:混排导弹(敌我交错)玩家被敌导弹炸死
  const s7 = await evalJs(`(() => {
    startMission(0, 'campaign');
    ChapterCard.skip();
    player.hp = 5; player.invuln = 0;
    for (let i = 0; i < 12; i++) {
      const enemy = (i % 2 === 0);
      missiles.push({
        x: enemy ? (i === 2 ? player.x : rand(200, 3000)) : rand(100, 2000),
        y: enemy ? (i === 2 ? player.y : rand(200, 3000)) : rand(100, 2000),
        heading: 0, speed: 0, turn: 0, life: 1,
        target: enemy ? player : (enemies[0] || null), enemy: enemy, trail: 0,
        r: 5, damage: 100, dmgBonus: 0
      });
    }
    try {
      updateMissiles(0.016);  // 敌导弹命中玩家 → 死亡 → 复活
      for (let i = 0; i < 120; i++) update(0.016);
      return { ok: true, alive: player.alive, enemyLeft: missiles.filter(m => m.enemy).length, total: missiles.length };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  })()`);
  check('混排导弹中死亡→复活→120帧无异常', s7.ok === true && s7.alive === true, JSON.stringify(s7));
  check('混排后敌方导弹全清', s7.enemyLeft === 0, 'left=' + s7.enemyLeft);

  // 场景 5:真实时间流逝验证(页面 loop 活着)
  const t0 = await evalJs(`gameTime`);
  await sleep(1200);
  const t1 = await evalJs(`gameTime`);
  check('页面主循环存活(gameTime 流逝)', t1 > t0 + 0.5, `gt: ${t0.toFixed(1)} → ${t1.toFixed(1)}`);

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
