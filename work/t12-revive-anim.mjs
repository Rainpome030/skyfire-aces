// 任务书 12 冒烟:复活动画 + 无敌计时
// 连接样板参照 work/verify-revive2.mjs;端口 9350;profile work/chrome-profile-revive-anim
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-revive-anim', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-revive-anim',
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

  // ===== 战役开局(无限复活) =====
  await evalJs(`startMission(0, 'campaign');`);
  const c0 = await evalJs(`({ rc: GAME.reviveCount, ur: GAME.unlimitedRevive })`);
  check('战役开局:无限标志=true 计数=0', c0.ur === true && c0.rc === 0, JSON.stringify(c0));

  // ===== A. 复活瞬间状态 =====
  const a1 = await evalJs(`(() => {
    player.hp = 0;
    killPlane(player);
    return { alive: player.alive, hp: player.hp, maxHp: player.maxHp, invuln: player.invuln,
             ra: player.reviveAnim, shake: cam.shake,
             ringN: particles.filter(p => p.type === 'ring').length,
             flashN: particles.filter(p => p.type === 'flash').length };
  })()`);
  check('复活后 reviveAnim 非空 {t:0,dur:1.0}', !!a1.ra && a1.ra.t === 0 && a1.ra.dur === 1.0, JSON.stringify(a1.ra));
  check('复活瞬间 invuln === 1.2(动画期)', a1.invuln === 1.2, 'invuln=' + a1.invuln);
  check('复活:60% 血', a1.hp === Math.round(a1.maxHp * 0.6), 'hp=' + a1.hp);
  check('复活瞬间有 addRing/addFlash 粒子', a1.ringN >= 1 && a1.flashN >= 1, 'ring=' + a1.ringN + ' flash=' + a1.flashN);
  check('复活触发轻微震屏(shake>=5)', a1.shake >= 5, 'shake=' + a1.shake.toFixed(2));

  // ===== B. 动画期间:无敌 + 开火 + 移动 =====
  const b1 = await evalJs(`(() => {
    const hp0 = player.hp;
    hurtPlayer(50);
    return { hp0, hp1: player.hp, invuln: player.invuln, alive: player.alive };
  })()`);
  check('动画期 hurtPlayer(50) → hp 不变(无敌)', b1.hp0 === b1.hp1 && b1.hp0 > 0, 'hp=' + b1.hp0 + '→' + b1.hp1);

  const b2 = await evalJs(`(() => {
    const before = bullets.filter(b => !b.enemy).length;
    const w0 = player.weapon ? { cd: player.fireCd, ammo: player.weapon.ammo } : null;
    firePlayerGuns();
    const after = bullets.filter(b => !b.enemy).length;
    return { before, after, w0, fireCd: player.fireCd };
  })()`);
  check('动画期 firePlayerGuns 正常(子弹生成)', b2.after > b2.before, 'bullets ' + b2.before + '→' + b2.after);

  const b3 = await evalJs(`(() => {
    const x0 = player.x, y0 = player.y, t0 = player.reviveAnim.t;
    for (let i = 0; i < 10; i++) updatePlayer(0.016);
    return { x0, y0, x1: player.x, y1: player.y, moved: Math.hypot(player.x - x0, player.y - y0), t0, t1: player.reviveAnim.t, stillAnim: !!player.reviveAnim };
  })()`);
  check('动画期玩家可移动(updatePlayer 推进 x/y)', b3.moved > 0, 'moved=' + b3.moved.toFixed(2));
  check('动画期推进后 reviveAnim.t 增加且动画未结束', b3.stillAnim && b3.t1 > b3.t0, 't=' + b3.t0 + '→' + b3.t1.toFixed(3));

  // ===== C. 动画结束:invuln = 3 重新计时 =====
  const c1 = await evalJs(`(() => {
    // 推进到动画结束的那一帧,立即读取
    let guard = 0;
    while (player.reviveAnim && guard++ < 500) updatePlayer(0.016);
    const endRing = particles.filter(p => p.type === 'ring').length;
    const toast = particles.filter(p => p.type === 'text' && p.text === '无敌 3 秒').length;
    return { ra: player.reviveAnim, invuln: player.invuln, frames: guard, endRing, toast, t: player.reviveAnim ? player.reviveAnim.t : null };
  })()`);
  check('推进 1.0s 后 reviveAnim === null', c1.ra === null, 'frames=' + c1.frames);
  check('动画结束瞬间 invuln === 3(开始无敌计时)', c1.invuln === 3, 'invuln=' + c1.invuln);
  check('动画结束有收尾 ring + 「无敌 3 秒」toast', c1.endRing >= 1 && c1.toast >= 1, 'ring=' + c1.endRing + ' toast=' + c1.toast);

  // ===== D. 3 秒后无敌结束(顺带验证计时从动画后开始) =====
  const d1 = await evalJs(`(() => {
    for (let i = 0; i < 190; i++) updatePlayer(0.016);  // ≈3.04s
    return { invuln: player.invuln, hp: player.hp };
  })()`);
  check('动画结束后约 3s → invuln 归零', d1.invuln === 0, 'invuln=' + d1.invuln);

  // ===== E. 回归:复活计数/清弹(战役,无限) =====
  const e1 = await evalJs(`(() => {
    bullets.length = 0; missiles.length = 0;  // 清空既有子弹,避免主循环/前序测试残留
    bullets.push({ enemy: true, x: 0, y: 0 });
    missiles.push({ enemy: true, x: 0, y: 0 });
    bullets.push({ enemy: false, x: 0, y: 0 });
    killPlane(player);
    return { alive: player.alive, rc: GAME.reviveCount, ru: GAME.revivesUsed,
             enemyBullets: bullets.filter(b => b.enemy).length,
             myBullets: bullets.filter(b => !b.enemy).length,
             enemyMsl: missiles.filter(m => m.enemy).length,
             invuln: player.invuln };
  })()`);
  check('回归:复活清敌弹留己弹+不耗计数', e1.alive && e1.rc === 0 && e1.enemyBullets === 0 && e1.myBullets === 1 && e1.enemyMsl === 0, JSON.stringify({ eb: e1.enemyBullets, mb: e1.myBullets, em: e1.enemyMsl, rc: e1.rc }));
  check('回归:再次复活 invuln=1.2(新规则)', e1.invuln === 1.2, 'invuln=' + e1.invuln);
  await evalJs(`ChapterCard.skip();`);

  // ===== F. 回归:无尽模式 3 次复活 + 耗尽 → gameover =====
  await evalJs(`startEndless();`);
  const f0 = await evalJs(`({ rc: GAME.reviveCount, ur: GAME.unlimitedRevive })`);
  check('无尽开局:无限标志=false 计数=3', f0.ur === false && f0.rc === 3, JSON.stringify(f0));
  let endlessOk = true, lastState = null;
  for (let i = 0; i < 3; i++) {
    const r = await evalJs(`(() => { player.hp = 0; killPlane(player); return { alive: player.alive, rc: GAME.reviveCount, ra: !!player.reviveAnim }; })()`);
    if (!r.alive || r.rc !== 2 - i || !r.ra) { endlessOk = false; lastState = JSON.stringify(r); break; }
  }
  check('无尽 3 次死亡全部复活(剩 2/1/0,均带动画)', endlessOk === true, lastState || '');
  const f1 = await evalJs(`(() => { player.hp = 0; killPlane(player); return { alive: player.alive, state: GAME.state }; })()`);
  check('无尽第 4 次死亡 → 死亡(无动画)', f1.alive === false && f1.state === 'playing', JSON.stringify(f1));
  const f2 = await evalJs(`(() => { for (let i = 0; i < 200; i++) update(0.016); return GAME.state; })()`);
  check('无尽次数耗尽 3.2s 后 → gameover', f2 === 'gameover', 'state=' + f2);

  // ===== G. 回归:掉落池 =====
  const g1 = await evalJs(`(() => {
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
  check('回归:战役掉落池不含复活徽章(300次采样)', g1 === false);

  const g2 = await evalJs(`(() => {
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
  check('回归:无尽掉落池含复活徽章(300次采样)', g2 === true);

  // ===== H. 回归:结算减分 =====
  const h1 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    GAME.revivesUsed = 2;
    finishMission(true);
    return { total: GAME.endStats.rating.total, rank: GAME.endStats.rating.rank };
  })()`);
  check('回归:战役 2 次复活 → 95 分 SSS', h1.total === 95 && h1.rank === 'SSS', JSON.stringify(h1));
  const h2 = await evalJs(`(() => {
    startMission(0, 'campaign');
    GAME.missionTime = 5; GAME.damageTaken = 0; GAME.maxCombo = 50;
    GAME.shotsFired = 100; GAME.shotsHit = 100;
    GAME.revivesUsed = 4;
    finishMission(true);
    return { total: GAME.endStats.rating.total, rank: GAME.endStats.rating.rank };
  })()`);
  check('回归:战役 4 次复活 → 85 分 SS', h2.total === 85 && h2.rank === 'SS', JSON.stringify(h2));

  // ===== I. 动画态渲染上下文恢复(静态检查:drawPlayerJet 末尾恢复 shadowBlur/alpha) =====
  const i1 = await evalJs(`(() => {
    player.reviveAnim = { t: 0.5, dur: 1.0 };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawPlayerJet(player);
    ctx.restore();
    return { shadowBlur: ctx.shadowBlur, alpha: ctx.globalAlpha, ra: player.reviveAnim };
  })()`);
  check('drawPlayerJet 动画态绘制后恢复 shadowBlur=0/alpha=1', i1.shadowBlur === 0 && i1.alpha === 1, JSON.stringify({ sb: i1.shadowBlur, a: i1.alpha }));

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
