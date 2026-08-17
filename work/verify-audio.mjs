// verify-audio.mjs — P34.2 命中/击毁音频消费聚合事件合同 + 引擎声生命周期 + 双路音量 专项(RED-first)
// 覆盖: 非飞行/暂停引擎 gain→0(基线≈0.018 RED)、暂停 SFX 冻结、hit 0.06s 限频、kill 即时且音色可区分、
//       高频命中节点泄漏断言(created-stopped 平衡)、引擎振荡器复用(禁每次新建)、音量平滑无跳变、
//       双路音量(sfxVolume/engineVolume)生效、旧存档无字段用默认值不报错、合同消费读后清空。
// 运行: node work/verify-audio.mjs red   (未改主文件, 记录 RED 签名, 断言主文件 hash 未变)
//       node work/verify-audio.mjs green (改后主文件, 断言 hash 已变)
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const MODE = process.argv[2] || 'green';
const BASELINE_SHA = 'c728ea7a0ba5567a28856b109b6205b14393aec63b471dc310573c5da20e0755';
const html = readFileSync(FILE, 'utf8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hashNow = sha256(html);

const checks = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}
const slice = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : html.slice(i, j); };

// ---------- S 静态: 实现在场与挂接 ----------
check('S1 HIT_SFX_MIN_INTERVAL=0.06 命名常量在场', /(const|let|var)\s+HIT_SFX_MIN_INTERVAL\s*=\s*0\.06\b/.test(html));
check('S2 AudioSys.consumeHitQueue 消费方在场', /consumeHitQueue\s*\(\s*\)\s*\{/.test(html) && html.includes('HitFeedback.queue'));
check('S3 update() 挂 setPaused(状态驱动) + 每帧消费队列', (() => {
  const upi = html.lastIndexOf('function update(dt)');
  const ups = html.slice(upi, html.indexOf('function draw()', upi + 1));
  return ups.includes("AudioSys.setPaused(GAME.state === 'paused')") && ups.includes('AudioSys.consumeHitQueue()');
})());
const ue = slice('updateEngine(ratio)', 'startMusic()');
check('S4 updateEngine 非飞行 gain→0、setTargetAtTime 平滑、无 setValueAtTime 跳变', ue.includes('ratio > 0') && ue.includes('setTargetAtTime') && !ue.includes('engineGain.gain.setValueAtTime') && ue.includes('engineVol()'));
check('S5 ENGINE_GAIN_MAX/ENGINE_GAIN_TAU 增益上限与时间常数命名常量在场', /const\s+ENGINE_GAIN_MAX\s*=\s*0\.06\b/.test(html) && /const\s+ENGINE_GAIN_TAU\s*=\s*0\.1\b/.test(html));
check('S6 defaultSave 双路音量默认字段在场', slice('function defaultSave()', 'let save').includes('sfxVolume') && slice('function defaultSave()', 'let save').includes('engineVolume'));
check('S7 loadSave 旧存档无字段回退默认(类型守卫)', slice('function loadSave()', 'function saveNow()').includes("typeof save.sfxVolume !== 'number'") && slice('function loadSave()', 'function saveNow()').includes("typeof save.engineVolume !== 'number'"));
const toneS = slice('tone(freq', 'noise(dur');
check('S8 tone 暂停冻结门控 + sfxVol 缩放', toneS.includes('this.paused') && toneS.includes('sfxVol()'));
check('S9 setPaused 存在且镜像 MusicSys.paused', slice('const AudioSys', '/* ===').includes('setPaused(on)') && html.includes('MusicSys.paused = on'));
check('S10 MusicSys 暂停静音(update 目标归零 + tick 冻结)', html.includes('(this.muted || this.paused) ? 0') && html.includes('if (this.paused) return;'));
check('S11 settings 两路音量 UI(drawSettings 绘制 + handleSettingsPress 命中)', (() => {
  const region = slice('function settingsLayout()', 'function handleCanvasPress');
  return region.includes('音效音量') && region.includes('引擎音量') && region.includes('volumeRowAt') && region.includes('sfxVolume');
})());
check('S12 消费方 hit 限频用 gameTime 与命名常量', slice('consumeHitQueue', 'setPaused(on)').includes('HIT_SFX_MIN_INTERVAL') && slice('consumeHitQueue', 'setPaused(on)').includes('gameTime'));

// ---------- CDP harness(真实 AudioContext) ----------
class Run {
  constructor(port) {
    this.port = port;
    this.profile = join(tmpdir(), `skyfire-p342-audio-${process.pid}-${port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      '--window-size=900,1000', 'file:///' + FILE],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', d => { const s = String(d); if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(s)) this.errors.push(s.trim()); });
    let target;
    for (let i = 0; i < 100; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json(); target = list.find(x => x.type === 'page'); if (target) break; } catch {}
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
    await this.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.reload', { ignoreCache: true }); await sleep(500);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalJS(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval exception');
    return r.result.value;
  }
  async stop() {
    try { this.chrome.kill(); } catch {}
    await sleep(300);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

const SETUP = `
  if (typeof AudioSys !== 'undefined') {
    if ('paused' in AudioSys) AudioSys.paused = false;
    if ('_lastHitSfxT' in AudioSys) AudioSys._lastHitSfxT = -999;
  }
  if (typeof HitFeedback !== 'undefined') HitFeedback.reset();
  GAME.state = 'title'; GAME.pendingTimer = 0; GAME.pendingState = null;
  input.keys = {}; input.touch = { active:false, mslId:null, swipeId:null, throttleBarId:null };
`;

let fatal = null;
const run = new Run(9531);
try {
  await run.start();
  const evalCheck = async (name, expr, predicate, fmt, awaitPromise = false) => {
    try {
      const v = await run.evalJS(expr, awaitPromise);
      check(name, predicate(v), fmt ? fmt(v) : JSON.stringify(v).slice(0, 170));
    } catch (e) { check(name, false, 'EXC: ' + String(e && e.message || e).slice(0, 160)); }
  };

  // D1 真实 AudioContext 初始化运行(锚: RED/GREEN 均绿)
  await evalCheck('D1 AudioContext 初始化并 running', `(() => {
    AudioSys.init(); AudioSys.resume();
    return { st: AudioSys.ctx ? AudioSys.ctx.state : 'none', eng: !!AudioSys.engineOsc, g: AudioSys.engineGain ? AudioSys.engineGain.gain.value : -1 };
  })()`, (o) => o.st === 'running' && o.eng === true);

  // D2 飞行增益上限 + 非飞行归零(冻结 rAF 背景干扰, 直接测 updateEngine 单元)
  await evalCheck('D2 飞行 gain≈0.053(≤上限) / 非飞行归零', `(async () => {
    const origUE = AudioSys.updateEngine;
    AudioSys.updateEngine = function () {};
    try {
      origUE.call(AudioSys, 1);
      await new Promise(r => setTimeout(r, 700));
      const g1 = AudioSys.engineGain.gain.value;
      origUE.call(AudioSys, 0);
      await new Promise(r => setTimeout(r, 700));
      const g0 = AudioSys.engineGain.gain.value;
      return { g1, g0 };
    } finally { AudioSys.updateEngine = origUE; }
  })()`, (o) => o.g1 > 0.04 && o.g1 <= 0.06 && o.g0 < 0.002, (o) => `g1=${o.g1}, g0=${o.g0}`, true);

  // D3 真实路径: title(菜单)下 rAF 每帧 updateEngine(0) → gain 趋近 0
  await evalCheck('D3 非飞行(菜单)引擎 gain 趋近 0(真实 update 路径)', `(async () => {
    ${SETUP}
    GAME.state = 'title';
    await new Promise(r => setTimeout(r, 700));
    return { g: AudioSys.engineGain.gain.value };
  })()`, (o) => o.g < 0.002, (o) => `g=${o.g}`, true);

  // D4 暂停: 真实 update 路径 → 引擎 gain 归零(RED≈0.018)
  await evalCheck('D4 暂停时引擎 gain 趋近 0(真实 update 路径)', `(async () => {
    ${SETUP}
    const m0 = mission;
    mission = { def: MISSION_DEFS[0], complete: false, failed: false, endless: false };
    GAME.state = 'paused';
    update(0.016);
    await new Promise(r => setTimeout(r, 700));
    const g = AudioSys.engineGain.gain.value;
    mission = m0;
    GAME.state = 'title';
    return { g };
  })()`, (o) => o.g < 0.002, (o) => `g=${o.g}`, true);

  // D5 暂停 SFX 冻结(RED: 暂停中 tone 仍可发声)
  await evalCheck('D5 暂停中 SFX 冻结(tone 不新建振荡器)', `(() => {
    ${SETUP}
    const has = typeof AudioSys.setPaused === 'function';
    GAME.state = 'paused';
    update(0.016);
    const qFrozen = HitFeedback.queue.length;
    const ctx = AudioSys.ctx;
    const origCO = ctx.createOscillator.bind(ctx); let created = 0;
    ctx.createOscillator = function () { created++; return origCO(); };
    AudioSys.tone(440, 0.1, 'sine', 0.2, 0);
    ctx.createOscillator = origCO;
    GAME.state = 'title';
    return { has, created, qFrozen };
  })()`, (o) => o.has && o.created === 0 && o.qFrozen === 0, (o) => `has=${o.has}, created=${o.created}, qFrozen=${o.qFrozen}`);

  // D6 引擎振荡器复用: startEngine 守卫, 重复调用不新建节点(锚: RED 也绿)
  await evalCheck('D6 引擎振荡器复用(重复 startEngine 零新建)', `(() => {
    ${SETUP}
    const e0 = AudioSys.engineOsc, g0 = AudioSys.engineGain;
    const ctx = AudioSys.ctx;
    const origCO = ctx.createOscillator.bind(ctx); let created = 0;
    ctx.createOscillator = function () { created++; return origCO(); };
    AudioSys.startEngine(); AudioSys.startEngine();
    ctx.createOscillator = origCO;
    return { created, sameOsc: AudioSys.engineOsc === e0, sameGain: AudioSys.engineGain === g0 };
  })()`, (o) => o.created === 0 && o.sameOsc && o.sameGain);

  // D7 泄漏断言: 240 次高频命中/击毁消费后, 新建振荡器全部已 stop(live=0, 不单调增长)
  await evalCheck('D7 高频命中 240 轮后振荡器 created-stop 平衡(live=0, 无泄漏)', `(() => {
    ${SETUP}
    const has = typeof AudioSys.consumeHitQueue === 'function';
    if (typeof MusicSys !== 'undefined') { MusicSys.paused = true; if (MusicSys.stop) MusicSys.stop(); }
    const ctx = AudioSys.ctx;
    const origCO = ctx.createOscillator.bind(ctx);
    let created = 0, stopped = 0;
    ctx.createOscillator = function () {
      const o = origCO(); created++;
      const os = o.stop.bind(o);
      o.stop = function () { stopped++; return os.apply(o, arguments); };
      return o;
    };
    gameTime = 1000;
    for (let i = 0; i < 240; i++) {
      HitFeedback.queue.push({ type: 'hit', count: 2, x: 0, y: 0, t: gameTime });
      HitFeedback.queue.push({ type: 'kill', count: 1, x: 0, y: 0, t: gameTime });
      if (has) AudioSys.consumeHitQueue(); else HitFeedback.reset();
      gameTime += 0.02;
    }
    ctx.createOscillator = origCO;
    if (typeof MusicSys !== 'undefined') MusicSys.paused = false;
    return { has, created, stopped, live: created - stopped };
  })()`, (o) => o.has && o.created > 100 && o.live === 0, (o) => `has=${o.has}, created=${o.created}, stopped=${o.stopped}, live=${o.live}`);

  // D8 hit 0.06s 限频: 同刻 3 连命中仅 1 声; +0.05s 仍限; +0.07s 再触发
  await evalCheck('D8 hit 事件 0.06s 最小触发间隔(同刻3连=1声)', `(() => {
    ${SETUP}
    const has = typeof AudioSys.consumeHitQueue === 'function';
    if (!has) return { has, n1: 0, n2: 0, n3: 0 };
    const origT = AudioSys.tone; const calls = [];
    AudioSys.tone = function (f) { calls.push(f); };
    gameTime = 100;
    for (let i = 0; i < 3; i++) HitFeedback.queue.push({ type: 'hit', count: 1, x: 0, y: 0, t: gameTime });
    AudioSys.consumeHitQueue();
    const n1 = calls.length;
    gameTime += 0.05;
    HitFeedback.queue.push({ type: 'hit', count: 1, x: 0, y: 0, t: gameTime });
    AudioSys.consumeHitQueue();
    const n2 = calls.length;
    gameTime += 0.02;
    HitFeedback.queue.push({ type: 'hit', count: 1, x: 0, y: 0, t: gameTime });
    AudioSys.consumeHitQueue();
    const n3 = calls.length;
    AudioSys.tone = origT;
    return { has, n1, n2, n3 };
  })()`, (o) => o.has && o.n1 === 1 && o.n2 === 1 && o.n3 === 2, (o) => `has=${o.has}, n1=${o.n1}, n2=${o.n2}, n3=${o.n3}`);

  // D9 kill 即时(不受 hit 限频) + 普通/击毁音色可区分
  await evalCheck('D9 kill 即时触发且与 hit 音色可区分(freq/波形)', `(() => {
    ${SETUP}
    const has = typeof AudioSys.consumeHitQueue === 'function';
    if (!has) return { has, hitN: 0, killN: 0 };
    const origT = AudioSys.tone; const hs = [], ks = [];
    AudioSys.tone = function (f, d, ty) { (ty === 'sawtooth' ? ks : hs).push({ f, ty }); };
    gameTime = 200;
    HitFeedback.queue.push({ type: 'hit', count: 1, x: 0, y: 0, t: gameTime });
    HitFeedback.queue.push({ type: 'kill', count: 1, x: 0, y: 0, t: gameTime });
    AudioSys.consumeHitQueue();
    AudioSys.tone = origT;
    return { has, hitN: hs.length, killN: ks.length, hf: hs[0] ? hs[0].f : 0, kf: ks[0] ? ks[0].f : 0, hty: hs[0] ? hs[0].ty : '', kty: ks[0] ? ks[0].ty : '' };
  })()`, (o) => o.has && o.hitN === 1 && o.killN === 1 && o.hf >= 1000 && o.kf <= 500 && o.hty === 'square' && o.kty === 'sawtooth', (o) => `hf=${o.hf}/${o.hty}, kf=${o.kf}/${o.kty}, hitN=${o.hitN}, killN=${o.killN}`);

  // D10 旧存档无音量字段 → 默认值, 不报错
  await evalCheck('D10 旧存档加载双路音量用默认值不报错', `(() => {
    const raw0 = localStorage.getItem(SAVE_KEY);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, unlockedMissions: 2, bestScore: { fighter: 10 } }));
    let err = null, out = null;
    try { loadSave(); out = { sfx: save.sfxVolume, eng: save.engineVolume }; } catch (e) { err = String(e); }
    if (raw0 === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, raw0);
    loadSave();
    return { err, sfx: out && out.sfx, eng: out && out.eng };
  })()`, (o) => o.err === null && typeof o.sfx === 'number' && typeof o.eng === 'number' && Math.abs(o.sfx - 1) < 1e-9 && Math.abs(o.eng - 1) < 1e-9, (o) => `err=${o.err}, sfx=${o.sfx}, eng=${o.eng}`);

  // D11 双路音量生效: sfxVolume=0.5 → tone 实际 gain 缩放; engineVolume=0.5 → 引擎 gain 减半; sfxVolume=0 → 不建节点
  await evalCheck('D11 双路音量生效(sfx 0.5/0, engine 0.5)', `(async () => {
    ${SETUP}
    const hasV = (typeof save !== 'undefined') && ('sfxVolume' in save);
    const ctx = AudioSys.ctx;
    const origCG = ctx.createGain.bind(ctx); let lastV = null;
    ctx.createGain = function () {
      const g = origCG();
      const sva = g.gain.setValueAtTime.bind(g.gain);
      g.gain.setValueAtTime = function (v, t) { lastV = v; return sva(v, t); };
      return g;
    };
    save.sfxVolume = 0.5;
    AudioSys.tone(440, 0.1, 'sine', 0.2, 0);
    const vHalf = lastV;
    const origCO = ctx.createOscillator.bind(ctx); let created0 = 0;
    ctx.createOscillator = function () { created0++; return origCO(); };
    save.sfxVolume = 0;
    AudioSys.tone(440, 0.1, 'sine', 0.2, 0);
    ctx.createOscillator = origCO;
    ctx.createGain = origCG;
    const origUE = AudioSys.updateEngine;
    AudioSys.updateEngine = function () {};
    save.engineVolume = 0.5;
    origUE.call(AudioSys, 1);
    await new Promise(r => setTimeout(r, 700));
    const g = AudioSys.engineGain.gain.value;
    AudioSys.updateEngine = origUE;
    save.sfxVolume = 1; save.engineVolume = 1;
    return { hasV, vHalf, created0, g, target: 0.5 * Math.min(0.06, 0.018 + 0.035) };
  })()`, (o) => o.hasV && Math.abs(o.vHalf - 0.1) < 1e-9 && o.created0 === 0 && Math.abs(o.g - o.target) < 0.004, (o) => `vHalf=${o.vHalf}, created0=${o.created0}, g=${o.g}, target=${o.target}`, true);

  // D12 音量平滑: setTargetAtTime 渐变, 无跳变(40ms 内降幅小), 终点归零
  await evalCheck('D12 引擎增益平滑下降无跳变(终点归零)', `(async () => {
    ${SETUP}
    const origUE = AudioSys.updateEngine;
    AudioSys.updateEngine = function () {};
    try {
      origUE.call(AudioSys, 1);
      await new Promise(r => setTimeout(r, 600));
      const start = AudioSys.engineGain.gain.value;
      origUE.call(AudioSys, 0);
      const v0 = AudioSys.engineGain.gain.value;
      await new Promise(r => setTimeout(r, 40));
      const v1 = AudioSys.engineGain.gain.value;
      await new Promise(r => setTimeout(r, 110));
      const v2 = AudioSys.engineGain.gain.value;
      await new Promise(r => setTimeout(r, 200));
      const v3 = AudioSys.engineGain.gain.value;
      return { start, v0, v1, v2, v3 };
    } finally { AudioSys.updateEngine = origUE; }
  })()`, (o) => o.start > 0.04 && o.v0 > o.v1 && o.v1 > o.v2 && o.v2 > o.v3 && (o.v0 - o.v1) < 0.6 * o.start && o.v3 < 0.002, (o) => `start=${o.start.toFixed(4)}, steps=${o.v0.toFixed(4)}>${o.v1.toFixed(4)}>${o.v2.toFixed(4)}>${o.v3.toFixed(4)}`, true);

  // D13 合同链: 聚合器发射 → 消费方读后清空
  await evalCheck('D13 聚合器→队列→消费方读后清空', `(() => {
    ${SETUP}
    const has = typeof AudioSys.consumeHitQueue === 'function';
    const origT = AudioSys.tone; let calls = 0;
    AudioSys.tone = function () { calls++; };
    GAME.state = 'playing';
    HitFeedback.noteHit(100, 100); HitFeedback.noteHit(120, 100);
    HitFeedback.update(0.06);
    const qLen = HitFeedback.queue.length;
    if (has) AudioSys.consumeHitQueue();
    const qAfter = HitFeedback.queue.length;
    AudioSys.tone = origT;
    GAME.state = 'title';
    return { has, qLen, calls, qAfter };
  })()`, (o) => o.has && o.qLen === 1 && o.calls === 1 && o.qAfter === 0, (o) => `has=${o.has}, qLen=${o.qLen}, calls=${o.calls}, qAfter=${o.qAfter}`);

  // R1 全程无 Runtime 异常
  check('R1 全程无未捕获异常/语法错', run.errors.length === 0, run.errors.slice(0, 2).join(' || '));

  await run.stop();
} catch (e) {
  fatal = e;
  console.log('FATAL', String(e && e.message || e));
  try { await run.stop(); } catch {}
}

// R2 主文件 hash 门禁(red: 未变 / green: 已变)
if (MODE === 'red') check('R2 主文件未改动(hash 不变)', hashNow === BASELINE_SHA, hashNow);
else check('R2 主文件已实现(hash 变更)', hashNow !== BASELINE_SHA, hashNow);

const passed = checks.filter(c => c.pass).length;
console.log(`RESULT ${passed}/${checks.length} checks passed (mode=${MODE})`);
process.exit(fatal ? 2 : (passed === checks.length ? 0 : 1));
