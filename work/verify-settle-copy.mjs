// verify-settle-copy.mjs — P39 结算文案改造 专项(RED-first)
// 覆盖: 自由模式结算统计删「命中率」行(战役保留); 失败标题「任务失败」→ 俏皮话分组随机;
//       自由模式按波数 1-5/6-10/11-15/16+ 分组, 战役按尝试次数 1/2-3/4+ 分组;
//       33 条命名常量数组; pickFailLine 单次消费 Math.random()(组内 3 选 1 不越组, 15 条池全可达);
//       存档/结算流程/奖励不回归; drawGameOver 绘制冒烟(截 fillText 断言标题)。
// 运行: node work/verify-settle-copy.mjs  (未改主文件先跑记录 RED 签名)
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
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
const slice = (a, b) => { const i = html.indexOf(a); const j = html.indexOf(b, i + 1); return (i < 0 || j < 0) ? '' : html.slice(i, j); };
const cnt = (re) => (html.match(re) || []).length;
const GAMEOVER = () => slice('function drawGameOver', 'function drawPaused');

// ---------- S 静态 ----------
check('S1 「任务失败」原文案已从主文件移除', !html.includes('任务失败'));
check('S2 7 个命名常量数组齐全(FAIL_LINES_*)', ['FAIL_LINES_ENDLESS_1_5', 'FAIL_LINES_ENDLESS_6_10', 'FAIL_LINES_ENDLESS_11_15', 'FAIL_LINES_ENDLESS_OVER15', 'FAIL_LINES_CAMPAIGN_1', 'FAIL_LINES_CAMPAIGN_2_3', 'FAIL_LINES_CAMPAIGN_4PLUS'].every(n => html.includes('const ' + n + ' = [')));
check('S3 「命中率」仅存 1 处且被 !isEndless 守卫(自由模式统计无此条目)', cnt(/'命中率'/g) === 1 && html.includes("if (!isEndless) rows.push(['命中率'"));
check('S4 旧无条件「命中率」统计行已删除', !html.includes("['命中率', Math.round(s.accuracy * 100) + '%'],"));
check('S5 分组/挑选/统计行辅助函数在场', ['function failLineGroupEndless', 'function failLineGroupCampaign', 'function pickFailLine', 'function buildGameOverStats'].every(n => html.includes(n)));
check('S6 失败标题走 failLine(「出击结束」保留)', GAMEOVER().includes("'出击结束'") && GAMEOVER().includes("s.failLine || '任务结束'"));
check('S7 战役失败脚注与得分统计行保持', GAMEOVER().includes('出击记录已统计，稍作休整后再次升空') && html.includes("['得分', fmt(s.score)]"));

// ---------- CDP harness ----------
class Run {
  constructor(port) {
    this.port = port;
    this.profile = join(tmpdir(), `skyfire-p39-sc-${process.pid}-${port}`);
    this.pending = new Map(); this.id = 0; this.errors = [];
  }
  async start() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      `--window-size=900,1000`, 'file:///' + FILE],
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
    await sleep(400);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval exception');
    return r.result.value;
  }
  async stop() {
    try { this.chrome.kill(); } catch {}
    await sleep(300);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

const R = new Run(9339);
const guarded = (expr) => `(() => { if (typeof failLineGroupEndless !== 'function' || typeof pickFailLine !== 'function' || typeof buildGameOverStats !== 'function') return { __absent: true }; return ${expr}; })()`;

try {
  await R.start();

  // ---------- D1 分组边界 ----------
  let v = await R.evalJS(guarded(`(() => {
    const r = {};
    r.e5 = failLineGroupEndless(5) === FAIL_LINES_ENDLESS_1_5;
    r.e6 = failLineGroupEndless(6) === FAIL_LINES_ENDLESS_6_10;
    r.e10 = failLineGroupEndless(10) === FAIL_LINES_ENDLESS_6_10;
    r.e11 = failLineGroupEndless(11) === FAIL_LINES_ENDLESS_11_15;
    r.e15 = failLineGroupEndless(15) === FAIL_LINES_ENDLESS_11_15;
    r.e16 = failLineGroupEndless(16) === FAIL_LINES_ENDLESS_OVER15;
    r.e40 = failLineGroupEndless(40) === FAIL_LINES_ENDLESS_OVER15;
    r.c1 = failLineGroupCampaign(1) === FAIL_LINES_CAMPAIGN_1;
    r.c2 = failLineGroupCampaign(2) === FAIL_LINES_CAMPAIGN_2_3;
    r.c3 = failLineGroupCampaign(3) === FAIL_LINES_CAMPAIGN_2_3;
    r.c4 = failLineGroupCampaign(4) === FAIL_LINES_CAMPAIGN_4PLUS;
    r.c9 = failLineGroupCampaign(9) === FAIL_LINES_CAMPAIGN_4PLUS;
    return r;
  })()`));
  check('D1 波数边界 5/6/10/11/15/16(+40) 与战役尝试 1/2/3/4/9 命中正确组', v && !v.__absent && Object.values(v).every(Boolean), v ? JSON.stringify(v) : 'absent');

  // ---------- D2 33 条池形状 ----------
  v = await R.evalJS(guarded(`(() => {
    const pools = [FAIL_LINES_ENDLESS_1_5, FAIL_LINES_ENDLESS_6_10, FAIL_LINES_ENDLESS_11_15, FAIL_LINES_ENDLESS_OVER15, FAIL_LINES_CAMPAIGN_1, FAIL_LINES_CAMPAIGN_2_3, FAIL_LINES_CAMPAIGN_4PLUS];
    const lens = pools.map(p => p.length);
    const all = pools.flat();
    const uniq = new Set(all).size;
    const clean = all.every(t => typeof t === 'string' && t.length > 0 && t.indexOf('任务失败') < 0 && t.indexOf('失败') < 0);
    return { lens, uniq, clean, total: all.length };
  })()`));
  check('D2 池形状 3/3/3/15/3/3/3=33 条, 全唯一且不含负面词', v && !v.__absent && v.total === 33 && v.uniq === 33 && v.clean && String(v.lens) === '3,3,3,15,3,3,3', v ? JSON.stringify(v) : 'absent');

  // ---------- D3 组内随机 3 选 1 不越组 + 15 池全可达 ----------
  v = await R.evalJS(guarded(`(() => {
    const out = {};
    const orig = Math.random;
    const pool3 = FAIL_LINES_ENDLESS_1_5;
    out.idx = [0, 1, 2].map(k => { Math.random = () => (k === 0 ? 0 : k === 1 ? 0.49 : 0.999); return pool3.indexOf(pickFailLine(pool3)); });
    Math.random = () => 0.999; out.over15hi = FAIL_LINES_ENDLESS_OVER15.indexOf(pickFailLine(FAIL_LINES_ENDLESS_OVER15));
    Math.random = () => 0; out.over15lo = FAIL_LINES_ENDLESS_OVER15.indexOf(pickFailLine(FAIL_LINES_ENDLESS_OVER15));
    const reach = [];
    for (let k = 0; k < 15; k++) { Math.random = () => (k + 0.5) / 15; reach.push(FAIL_LINES_ENDLESS_OVER15.indexOf(pickFailLine(FAIL_LINES_ENDLESS_OVER15))); }
    out.reach15 = [...new Set(reach)].length;
    let calls = 0; const mr = Math.random;
    Math.random = () => { calls++; return mr(); };
    pickFailLine(FAIL_LINES_ENDLESS_6_10);
    Math.random = mr; out.calls = calls;
    Math.random = orig;
    return out;
  })()`));
  check('D3 stub 随机: 组内 3 选 1 不越组(idx 0/1/2), 15 条池 0→首条 0.999→末条 且 15 条全可达', v && !v.__absent && String(v.idx) === '0,1,2' && v.over15hi === 14 && v.over15lo === 0 && v.reach15 === 15, v ? JSON.stringify(v) : 'absent');
  check('D4 pickFailLine 单次消费 Math.random()(随机源语义隔离)', v && !v.__absent && v.calls === 1, v ? `calls=${v.calls}` : 'absent');

  // ---------- D5 自由模式失败集成 ----------
  v = await R.evalJS(guarded(`(() => {
    const out = {};
    const orig = Math.random;
    try {
      startEndless();
      mission.waveIndex = 5;
      GAME.missionTime = 77; GAME.kills = 12; GAME.score = 3456; GAME.shotsFired = 40; GAME.shotsHit = 10; GAME.damageTaken = 20;
      const s0 = { bestKills: save.bestKills, totalKills: save.totalKills, totalScore: save.totalScore };
      Math.random = () => 0.49;
      finishMission(false);
      out.state = GAME.state;
      out.inPool = FAIL_LINES_ENDLESS_1_5.indexOf(GAME.endStats.failLine) >= 0;
      out.expectIdx1 = GAME.endStats.failLine === FAIL_LINES_ENDLESS_1_5[1];
      out.waves = GAME.endStats.waves;
      out.attempts = GAME.endStats.attempts;
      out.kills = GAME.endStats.kills;
      out.score = GAME.endStats.score;
      out.acc = Math.abs(GAME.endStats.accuracy - 0.25) < 1e-9;
      out.bestKillsUpd = save.bestKills === Math.max(s0.bestKills, 12);
      out.totalKillsUpd = save.totalKills === s0.totalKills + 12;
      out.totalScoreUpd = save.totalScore === s0.totalScore + 3456;
    } catch (e) { out.exc = String(e); }
    Math.random = orig;
    return out;
  })()`));
  check('D5 自由模式失败: wave=5 命中组1 随机 idx1, waves/attempts/统计/存档加分全链路正确', v && !v.__absent && !v.exc && v.state === 'gameover' && v.inPool && v.expectIdx1 && v.waves === 5 && v.attempts === 0 && v.kills === 12 && v.score === 3456 && v.acc && v.bestKillsUpd && v.totalKillsUpd && v.totalScoreUpd, v ? JSON.stringify(v) : 'absent');

  // ---------- D6 自由模式成功: 标题保持「出击结束」 ----------
  v = await R.evalJS(guarded(`(() => {
    const out = {};
    const orig = Math.random;
    try {
      startEndless();
      GAME.missionTime = 50; GAME.kills = 8; GAME.score = 900;
      finishMission(true);
      out.failLineUndef = GAME.endStats.failLine === undefined;
      out.state = GAME.state;
      const calls = [];
      const of = ctx.fillText;
      ctx.fillText = function (t, x, y) { calls.push(String(t)); return of.call(ctx, t, x, y); };
      try { drawGameOver(); out.exc = null; } catch (e) { out.exc = String(e); }
      ctx.fillText = of;
      out.hasOver = calls.some(c => c === '出击结束');
      out.hasOld = calls.some(c => c === '任务失败');
      out.calls = calls.slice(0, 3);
    } catch (e) { out.exc = String(e); }
    Math.random = orig;
    return out;
  })()`));
  check('D6 自由模式成功: failLine 不设、标题「出击结束」、原文案不出现', v && !v.__absent && !v.exc && v.failLineUndef && v.state === 'gameover' && v.hasOver && !v.hasOld, v ? JSON.stringify(v) : 'absent');

  // ---------- D7 战役失败按尝试次数分组 + 成功清零 ----------
  v = await R.evalJS(guarded(`(() => {
    const out = {};
    const orig = Math.random;
    const cc0 = save.chapterCleared;
    try {
      save.chapterCleared = 9;
      GAME.missionAttempts = {};
      startMission(0, 'campaign');
      out.a1 = GAME.missionAttempts[0] === 1;
      startMission(0, 'campaign');
      out.a2 = GAME.missionAttempts[0] === 2;
      GAME.kills = 3; GAME.score = 100; GAME.shotsFired = 10; GAME.shotsHit = 2;
      const u0 = save.unlockedMissions;
      Math.random = () => 0.999;
      finishMission(false);
      out.inPool2_3 = FAIL_LINES_CAMPAIGN_2_3.indexOf(GAME.endStats.failLine) >= 0;
      out.expectIdx2 = GAME.endStats.failLine === FAIL_LINES_CAMPAIGN_2_3[2];
      out.attempts = GAME.endStats.attempts;
      out.unlockedAfterFail = save.unlockedMissions === u0;
      out.stateAfterFail = GAME.state;
      GAME.missionAttempts[0] = 4;
      Math.random = () => 0;
      finishMission(false);
      out.group4plus = GAME.endStats.failLine === FAIL_LINES_CAMPAIGN_4PLUS[0];
      out.attempts4 = GAME.endStats.attempts === 4;
      GAME.missionAttempts[0] = 2;
      finishMission(true);
      out.attemptsAfterWin = GAME.missionAttempts[0] === undefined;
      out.failLineAfterWin = GAME.endStats.failLine === undefined;
      out.stateAfterWin = GAME.state;
    } catch (e) { out.exc = String(e); }
    save.chapterCleared = cc0; saveNow();
    Math.random = orig;
    return out;
  })()`));
  check('D7 战役失败分组: 第2次→组2-3 idx2、第4次→组4+、失败不解锁、成功清零且不设 failLine', v && !v.__absent && !v.exc && v.a1 && v.a2 && v.inPool2_3 && v.expectIdx2 && v.attempts === 2 && v.unlockedAfterFail && v.stateAfterFail === 'gameover' && v.group4plus && v.attempts4 && v.attemptsAfterWin && v.failLineAfterWin && v.stateAfterWin === 'complete', v ? JSON.stringify(v) : 'absent');

  // ---------- D8 结算统计行 ----------
  v = await R.evalJS(guarded(`(() => {
    const s = { time: 75, kills: 4, accuracy: 0.5, score: 1234 };
    const keys = r => r.map(x => x[0]);
    const endless = buildGameOverStats(s, true);
    const campaign = buildGameOverStats(s, false);
    return {
      eKeys: keys(endless),
      cKeys: keys(campaign),
      eHasAcc: endless.some(x => x[0] === '命中率'),
      cAcc: campaign.find(x => x[0] === '命中率'),
      eScore: endless.find(x => x[0] === '得分')
    };
  })()`));
  check('D8 统计行: 自由模式无「命中率」(其余保持), 战役保留 4 行且命中率=50%', v && !v.__absent && String(v.eKeys) === '存活时间,击坠数,得分' && String(v.cKeys) === '存活时间,击坠数,命中率,得分' && !v.eHasAcc && v.cAcc && String(v.cAcc[1]) === '50%', v ? JSON.stringify(v) : 'absent');

  await R.stop();
} catch (e) {
  console.log('HARNESS_ERROR ' + e.message);
  try { await R.stop(); } catch {}
}

const pass = checks.filter(c => c.pass).length;
console.log(`RESULT ${pass}/${checks.length} checks passed  (sha256 html=${hashBefore})`);
console.log('=== RED 签名(未实现: 任务失败 present / 无条件命中率行 present / 常量与辅助 absent) ===');
console.log(`任务失败 present: ${html.includes('任务失败')}`);
console.log(`无条件命中率行 present: ${html.includes("['命中率', Math.round(s.accuracy * 100) + '%'],")}`);
console.log(`FAIL_LINES 常量 present: ${html.includes('const FAIL_LINES_ENDLESS_1_5 = [')}`);
console.log(`failLineGroupEndless present: ${html.includes('function failLineGroupEndless')}`);
console.log(`buildGameOverStats present: ${html.includes('function buildGameOverStats')}`);
process.exit(pass === checks.length ? 0 : 1);
