// verify-weapon-switch.mjs — P30 主动选择不同武器立即换型 专项(RED-first)
// 全部动态用例走真实 applyUpgrade -> applyWeapon 路径, 单个 CDP eval 内原子完成。
// 运行: node work/verify-weapon-switch.mjs   (RED: 未改主文件时 W1/W2 与静态项失败)
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashBefore = sha256(html);

const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

// ---------- R1 静态: 可达路径与实现在场 ----------
check('R1a 静态存在 switchingType 换型分支', /const\s+switchingType\s*=\s*player\.weapon\s*&&\s*player\.weapon\.id\s*!==\s*id/.test(html));
check('R1b 静态存在 equipIncomingWeapon 立即装备函数', /function\s+equipIncomingWeapon\s*\(/.test(html));
check('R1c applyWeapon 仅被 applyUpgrade 调用(可达路径唯一)', (html.match(/applyWeapon\(/g) || []).length === 2);
check('R1d equipIncomingWeapon 仅被 applyWeapon 调用', (html.match(/equipIncomingWeapon\(/g) || []).length === 2);
check('R1e 换型 toast 文案在场', html.includes('已切换为'));
check('R1f 同ID防降级/三合一/有限补弹/回退规则原样保留',
  /GAME\.synth\[key\]\s*=\s*\(GAME\.synth\[key\]\s*\|\|\s*0\)\s*\+\s*1/.test(html)
  && html.includes('existing.count = (existing.count || 0) + 1')
  && html.includes('sameLimited.ammo = Math.min(999, sameLimited.ammo + bonus)')
  && /function\s+switchWeaponBack\s*\(/.test(html));

// ---------- CDP harness ----------
class Run {
  constructor(c) {
    this.c = c;
    this.profile = join(tmpdir(), `skyfire-p30-ws-${process.pid}-${c.port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.c.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.c.width},${this.c.height}`, 'file:///' + FILE],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${this.c.port}/json/list`)).json(); target = list.find(x => x.type === 'page'); if (target) break; } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target not found');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'Runtime exception');
    };
    await this.send('Runtime.enable'); await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.c.width, height: this.c.height, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.reload', { ignoreCache: true }); await sleep(350);
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async stop() { try { this.ws?.close(); } catch {} try { this.chrome?.kill(); } catch {} await sleep(120); rmSync(this.profile, { recursive: true, force: true }); }
}

const setup = `
  transition.active = false; if (ChapterCard.isActive()) ChapterCard.skip();
  startEndless(); if (ChapterCard.isActive()) ChapterCard.skip(); transition.active = false; GAME.state = 'playing';
  GAME.weapons = []; GAME.synth = {}; player.weapon = defaultWeapon();
  input.keys = {}; input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null }; input.fireHeld = false; input.mslHeld = false;
`;
const pickFn = `const pick = (id, q) => { upgradeChoice = { options: [{ id, quality: q }], index: -1, timer: 0 }; applyUpgrade(upgradeChoice.options[0]); };`;
const toastOf = (kw) => `particles.some(p => p.type === 'text' && p.text && p.text.indexOf('${kw}') >= 0)`;

// W1: scatter common -> pierce good -> scatter common(原子 eval)
const w1 = `(() => {
  ${setup} ${pickFn}
  pick('scatter','common');
  const s1 = { id: player.weapon.id, q: player.weapon.quality };
  pick('pierce','good');
  const s2 = { id: player.weapon.id, q: player.weapon.quality };
  pick('scatter','common');
  const fin = { id: player.weapon.id, q: player.weapon.quality, count: player.weapon.count, name: player.weapon.name };
  bullets.length = 0; player.fireCd = 0; player.alive = true;
  firePlayerGuns();
  return { s1, s2, fin, volley: bullets.length, toastHit: ${toastOf('已切换为')} && ${toastOf('散射机炮')},
           inv: GAME.weapons.map(w => w.id + ':' + w.quality + ':' + (w.count || 0)), synthKeys: Object.keys(GAME.synth) };
})()`;

// W2: scatter good 历史 -> pierce rare -> scatter common(不得被历史 best 截流)
const w2 = `(() => {
  ${setup} ${pickFn}
  const sg = makeWeapon('scatter','good'); sg.count = 1;
  const pr = makeWeapon('pierce','rare'); pr.count = 1;
  GAME.weapons.push(sg, pr); player.weapon = pr;
  pick('scatter','common');
  return { id: player.weapon.id, q: player.weapon.quality, count: player.weapon.count,
           isNewObj: player.weapon !== sg && player.weapon !== pr,
           keepHistGood: GAME.weapons.some(w => w.id === 'scatter' && w.quality === 'good'),
           invLen: GAME.weapons.length, synthKeys: Object.keys(GAME.synth),
           toastHit: ${toastOf('已切换为')} && ${toastOf('散射机炮')} };
})()`;

// W3: 当前同 ID 重复三合一(回归守卫: 不被换型修复破坏)
const w3 = `(() => {
  ${setup} ${pickFn}
  const w = makeWeapon('scatter','common'); w.count = 1;
  GAME.weapons.push(w); player.weapon = w;
  pick('scatter','common');
  const a = { same: player.weapon === w, q: player.weapon.quality, count: w.count, invLen: GAME.weapons.length };
  pick('scatter','common');
  return { a, b: { q: player.weapon.quality, count: player.weapon.count, invLen: GAME.weapons.length, invQ: GAME.weapons.map(x => x.quality) } };
})()`;

// W4: 当前同 ID 低品质拾取(防降级/合成回归守卫)
const w4 = `(() => {
  ${setup} ${pickFn}
  const wg = makeWeapon('scatter','good'); wg.count = 1;
  GAME.weapons.push(wg); player.weapon = wg;
  pick('scatter','common');
  const a = { same: player.weapon === wg, q: player.weapon.quality, synth: GAME.synth['scatter:common'] || 0 };
  pick('scatter','common');
  const b = { q: player.weapon.quality, synth: GAME.synth['scatter:common'] || 0 };
  pick('scatter','common');
  return { a, b, q: player.weapon.quality, synth: GAME.synth['scatter:common'] || 0, invQ: GAME.weapons.map(x => x.quality) };
})()`;

// W5: 有限武器同 ID 补弹 + 耗尽回退 + 空弹清理(回归守卫)
const w5 = `(() => {
  ${setup} ${pickFn}
  const sc = makeWeapon('scatter','common'); sc.count = 1;
  const lz = makeWeapon('laser','common');
  const initial = lz.ammo;
  GAME.weapons.push(sc, lz); player.weapon = lz;
  pick('laser','common');
  const fresh = makeWeapon('laser','common').ammo;
  const ref = { ammo: lz.ammo, expected: Math.min(999, initial + fresh), same: player.weapon === lz, invLen: GAME.weapons.length };
  lz.ammo = 1; player.fireCd = 0; player.alive = true; firePlayerGuns();
  const fb = { id: player.weapon.id, toast: ${toastOf('已接替')} };
  const lzA = makeWeapon('laser','common'); lzA.ammo = 0;
  const lzB = makeWeapon('laser','good');
  GAME.weapons.push(lzA, lzB); player.weapon = lzB;
  pick('heavy','common');
  return { ref, fb, cl: { id: player.weapon.id, depletedGone: !GAME.weapons.some(x => x.limited && x.ammo <= 0), invLen: GAME.weapons.length } };
})()`;

const c = { name: 'P30', width: 1280, height: 720, port: 9891 };
const r = new Run(c);
let fatal = null;
try {
  await r.start();
  const w1o = await r.eval(w1);
  check('W1 前两步换型立即生效 scatter->pierce', w1o.s1.id === 'scatter' && w1o.s1.q === 'common' && w1o.s2.id === 'pierce' && w1o.s2.q === 'good', JSON.stringify({ s1: w1o.s1, s2: w1o.s2 }));
  check('W1 最后立即散射common且count=1', w1o.fin.id === 'scatter' && w1o.fin.q === 'common' && w1o.fin.count === 1, JSON.stringify(w1o.fin));
  check('W1 弹道 3 发(散射三管)', w1o.volley === 3, 'volley=' + w1o.volley);
  check('W1 HUD 名称为散射机炮', w1o.fin.name === '散射机炮', w1o.fin.name);
  check('W1 换型 toast「已切换为 散射机炮」', w1o.toastHit === true);
  check('W1 换型不产生合成进度', w1o.synthKeys.length === 0, JSON.stringify(w1o.synthKeys));

  const w2o = await r.eval(w2);
  check('W2 不被历史 best 截流 立即散射common', w2o.id === 'scatter' && w2o.q === 'common', JSON.stringify({ id: w2o.id, q: w2o.q }));
  check('W2 装备的是新对象且 count=1', w2o.isNewObj === true && w2o.count === 1);
  check('W2 历史 scatter good 保留', w2o.keepHistGood === true);
  check('W2 库存 3 件', w2o.invLen === 3, 'invLen=' + w2o.invLen);
  check('W2 不产生 synth 进度', w2o.synthKeys.length === 0, JSON.stringify(w2o.synthKeys));
  check('W2 换型 toast 在场', w2o.toastHit === true);

  const w3o = await r.eval(w3);
  check('W3 同ID第1次 count 1->2 同对象', w3o.a.same === true && w3o.a.count === 2 && w3o.a.invLen === 1, JSON.stringify(w3o.a));
  check('W3 同ID第2次 2->3 合成 good', w3o.b.q === 'good' && w3o.b.count === 1 && w3o.b.invLen === 1 && w3o.b.invQ.join(',') === 'good', JSON.stringify(w3o.b));

  const w4o = await r.eval(w4);
  check('W4 低品质不降级 仍good synth=1', w4o.a.same === true && w4o.a.q === 'good' && w4o.a.synth === 1, JSON.stringify(w4o.a));
  check('W4 synth 累计到 2', w4o.b.q === 'good' && w4o.b.synth === 2, JSON.stringify(w4o.b));
  check('W4 三合一后仍 good 且 synth 归零', w4o.q === 'good' && w4o.synth === 0 && w4o.invQ.join(',') === 'good,good', JSON.stringify({ q: w4o.q, synth: w4o.synth, invQ: w4o.invQ }));

  const w5o = await r.eval(w5);
  check('W5 同ID有限补弹=初始+新弹 同对象', w5o.ref.ammo === w5o.ref.expected && w5o.ref.same === true && w5o.ref.invLen === 2, JSON.stringify(w5o.ref));
  check('W5 耗尽回退到前一武器', w5o.fb.id === 'scatter' && w5o.fb.toast === true, JSON.stringify(w5o.fb));
  check('W5 换型后空弹清理且装备新武器', w5o.cl.id === 'heavy' && w5o.cl.depletedGone === true && w5o.cl.invLen === 3, JSON.stringify(w5o.cl));

  check('R2 无 Runtime 异常', r.errors.length === 0, r.errors.join(' | '));
} catch (e) { fatal = e; console.error('FATAL', e.stack || e); }
finally { await r.stop(); check('R2 profile 已清理', !existsSync(r.profile), r.profile); }

const hashAfter = sha256(readFileSync(FILE, 'utf8'));
check('R2 测试后主文件 hash 不变', hashBefore === hashAfter, hashAfter.slice(0, 16));

const failed = checks.filter(x => !x.pass);
console.log(`\nRESULT ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) console.log('FAILED: ' + failed.map(x => x.name).join('; '));
if (fatal || failed.length) process.exitCode = 1;
