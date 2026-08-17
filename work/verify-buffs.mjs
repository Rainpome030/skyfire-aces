// 新系统针对性验证: buff 掉落/生效/护盾/武器三选一/无武器掉落
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9444;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = [];

mkdirSync(ROOT + '/work/chrome-profile-buff', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-buff',
  '--window-size=1280,800',
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
      const { resolveMsg, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolveMsg(msg.result);
    }
  };
  await send('Runtime.enable');
}

async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}

function check(name, cond, detail) {
  results.push((cond ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(detail));
}

// ---- 测试主体 ----
const T = `
(async () => {
  const out = {};
  // 1) 开局无尽模式
  startEndless();
  out.state = GAME.state;
  out.mode = GAME.mode;

  // 2) dropLoot 永不产生 weapon 类型 (用固定随机数扫全区间)
  let types = {};
  for (let i = 0; i <= 100; i++) {
    const oldR = Math.random;
    Math.random = () => i / 100;
    const before = pickups.length;
    dropLoot(500, 500);
    for (let k = pickups.length - 1; k >= before; k--) {
      const p = pickups[k];
      types[p.type] = (types[p.type] || 0) + 1;
      pickups.splice(k, 1);
    }
    Math.random = oldR;
  }
  out.dropTypes = types;  // 应只有 buff / move / supply

  // 3) 拾取 buff 生效
  collectLoot({ type: 'buff', id: 'damage' });
  out.buffDamage = !!player.buffs.damage;
  out.buffDamageT = player.buffs.damage ? Math.round(player.buffs.damage.t) : 0;
  collectLoot({ type: 'buff', id: 'shield' });
  out.buffShieldN = player.buffs.shield ? player.buffs.shield.n : 0;

  // 4) 火力 buff 提高子弹伤害
  const oldUp = GAME.upgrades;
  GAME.upgrades = {};
  delete player.buffs.damage;
  player.weapon = defaultWeapon();
  player.fireCd = 0;
  const n0 = bullets.length;
  firePlayerGuns();
  out.gunDmgBase = bullets[n0] ? bullets[n0].dmg : -1;
  player.buffs.damage = { t: 15, n: 0 };
  player.fireCd = 0;
  const n1 = bullets.length;
  firePlayerGuns();
  out.gunDmgBuffed = bullets[n1] ? bullets[n1].dmg : -1;
  GAME.upgrades = oldUp;
  delete player.buffs.damage;

  // 5) 护盾挡伤
  const hpBefore = player.hp;
  player.invuln = 0;
  player.buffs.shield = { t: 20, n: 2 };
  hurtPlayer(40);
  out.shieldAfterHit1 = { hp: player.hp, n: player.buffs.shield ? player.buffs.shield.n : 0 };
  hurtPlayer(40);
  out.shieldAfterHit2 = { hp: player.hp, n: player.buffs.shield ? player.buffs.shield.n : 0, gone: !player.buffs.shield };

  // 6) 升级三选一 = 武器
  player.buffs = {};
  GAME.upgrades = {}; GAME.weapons = []; GAME.dash = null; GAME.synth = {};
  player.weapon = defaultWeapon(); player.hp = player.maxHp = 100;
  GAME.level = 1; GAME.exp = 0;
  upgradeChoice = null;
  addExp(200);  // 足够升 1 级
  out.choice = !!upgradeChoice;
  out.choiceOptions = upgradeChoice ? upgradeChoice.options.map(o => o.id + ':' + o.quality) : [];

  // 7) 选武器后 applyWeapon 生效
  if (upgradeChoice) {
    const o = upgradeChoice.options[0];
    const had = GAME.weapons.length;
    applyUpgrade(o);
    out.afterApply = { weapons: GAME.weapons.length, had, playerW: player.weapon.id, choiceClosed: !upgradeChoice };
  }

  // 8) buff 计时到期移除
  player.buffs.rate = { t: 0.05, n: 0 };
  updateBuffs(0.1);
  out.buffExpired = !player.buffs.rate;
  return out;
})()
`;

const chromeUrl = `file:///${FILE.replace(/\\/g, '/')}`;

try {
  await connect();
  const out = await evalJS(T);
  check('无尽模式启动', out.state === 'playing' && out.mode === 'endless', out.state + '/' + out.mode);
  const dt = out.dropTypes;
  check('掉落物无 weapon 类型', !dt.weapon, dt);
  check('掉落物含 buff', !!dt.buff && dt.buff > 0, dt);
  check('掉落物含 move/supply', !!dt.move && !!dt.supply, dt);
  check('buff 拾取生效(火力15s)', out.buffDamage && out.buffDamageT === 15, { t: out.buffDamageT });
  check('护盾拾取=2层', out.buffShieldN === 2, out.buffShieldN);
  check('火力buff子弹伤害提升', out.gunDmgBuffed > out.gunDmgBase, { before: out.gunDmgBase, after: out.gunDmgBuffed });
  check('护盾挡第1击不掉血', out.shieldAfterHit1.hp === 100 && out.shieldAfterHit1.n === 1, out.shieldAfterHit1);
  check('护盾挡第2击后破碎', out.shieldAfterHit2.hp === 100 && out.shieldAfterHit2.gone, out.shieldAfterHit2);
  check('升级面板打开且为武器', out.choice && out.choiceOptions.every(s => ['scatter','heavy','pierce','laser','rocket','plasma'].includes(s.split(':')[0])), out.choiceOptions);
  check('选择武器后获得并关闭面板', out.afterApply && out.afterApply.choiceClosed && out.afterApply.weapons > out.afterApply.had, out.afterApply);
  check('buff 计时到期自动移除', out.buffExpired, true);
} catch (e) {
  errors.push(String(e));
  results.push('FAIL script threw: ' + e.message);
} finally {
  try { chrome.kill(); } catch {}
}

console.log(results.join('\n'));
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('\nNO ERRORS');
