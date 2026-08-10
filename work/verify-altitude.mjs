// 任务书 18 冒烟:速度驱动高度系统(端口 9367 / chrome-profile-altitude2)
// 用例:a.静态 b.开局重置 c.低速掉高 d.高速回涨 e.封顶 f.归零死亡→战役复活
//       g.无尽 4 连死耗尽 gameover h.drawHUD 不抛错+警告红像素 on/off i.截图含警告态
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9367;
const PROF = ROOT + '/work/chrome-profile-altitude2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

// ===== a. 静态检查(主文件文本)=====
const html = readFileSync(FILE, 'utf8');
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}
check('a1.静态:不再含假值 12000 - player.hp', !html.includes('12000 - player.hp'));
check('a2.静态:HUD 使用真实高度 Math.round(player.altitude)', html.includes("'高度 ' + Math.round(player.altitude) + ' m'"));
check('a3.静态:player 对象含 altitude 字段(9000)', /altitude:\s*9000/.test(html));
check('a4.静态:killPlane 复活分支重置 altitude=9000', /player\.hp = Math\.round\(player\.maxHp \* 0\.6\);\r?\n\s*player\.altitude = 9000;/.test(html));
check('a5.静态:startMission 开局重置 altitude=9000', /player\.throttle = 0\.68;\r?\n\s*player\.altitude = 9000;/.test(html));
check('a6.静态:startEndless 开局重置 altitude=9000', /player\.throttle = 0\.68; player\.altitude = 9000;/.test(html));
check('a7.静态:updatePlayer 含速度驱动高度计算', /const speedRatio = player\.speed \/ CFG\.maxSpeed;/.test(html));
check('a8.静态:低空警告「高度过低!」', html.includes('高度过低!'));

if (results.some((r) => !r.pass)) {
  console.log('\n=== 静态检查失败,中止 ===');
  process.exit(1);
}

mkdirSync(PROF, { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROF,
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
    } catch { }
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

// 低速死亡循环:推进 updatePlayer 直到 revivesUsed 变化(终止条件用计数,不数帧)
const LOOP_DIE_CAMPAIGN = `(() => {
  player.alive = true; player.dead = false;
  player.throttle = 0; player.speed = 100;
  player.altitude = 50;
  let frames = 0;
  const ru0 = GAME.revivesUsed;
  while (frames < 2000 && GAME.revivesUsed === ru0) { updatePlayer(0.016); frames++; }
  return { frames, alive: player.alive, altitude: player.altitude, ru: GAME.revivesUsed, rc: GAME.reviveCount, pending: GAME.pendingState };
})()`;

async function main() {
  await connect();
  await sleep(1200);

  // ===== b. 开局重置 =====
  const b1 = await evalJs(`(() => { startMission(0, 'campaign'); ChapterCard.skip(); return { alt: player.altitude, state: GAME.state }; })()`);
  check('b1.startMission 后 altitude === 9000', b1.alt === 9000, JSON.stringify(b1));
  const b2 = await evalJs(`(() => { startEndless(); player.invuln = 9999; return { alt: player.altitude, rc: GAME.reviveCount }; })()`);
  check('b2.startEndless 后 altitude === 9000', b2.alt === 9000, JSON.stringify(b2));

  // ===== c. 低速掉高:speed=100(throttle=0,速度稳定在 95~100)40 帧 ≈ 0.64s ≈ -24m =====
  const c1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    player.throttle = 0; player.speed = 100; player.altitude = 8500;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    return { alt: player.altitude, speed: player.speed };
  })()`);
  const cDrop = 8500 - c1.alt;
  check('c.低速掉高:40帧后高度下降(≈-24m)', cDrop > 10 && cDrop < 40, 'drop=' + cDrop.toFixed(2) + ' speed=' + c1.speed.toFixed(1));

  // ===== d. 高速回涨:speed=400(throttle=1,速度回落向370)30帧 ≈ +40m =====
  const d1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    player.throttle = 1; player.speed = 400; player.altitude = 8000;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    return { alt: player.altitude, speed: player.speed };
  })()`);
  const dRise = d1.alt - 8000;
  check('d.高速回涨:30帧后高度上升(≈+40m)', dRise > 15, 'rise=' + dRise.toFixed(2) + ' speed=' + d1.speed.toFixed(1));

  // ===== e. 封顶:8950 起步 200 帧,全程 ≤9000 且最终 =9000 =====
  const e1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    player.throttle = 1; player.speed = 400; player.altitude = 8950;
    let maxAlt = 0;
    for (let i = 0; i < 200; i++) { updatePlayer(0.016); maxAlt = Math.max(maxAlt, player.altitude); }
    return { alt: player.altitude, maxAlt };
  })()`);
  check('e.封顶:200帧内不超过 9000 且最终=9000', e1.maxAlt <= 9000 && e1.alt === 9000, JSON.stringify(e1));

  // ===== f. 归零死亡→战役复活 =====
  const f1 = await evalJs(`(() => { startMission(0, 'campaign'); ChapterCard.skip(); player.invuln = 9999; return GAME.revivesUsed; })()`);
  const f2 = await evalJs(LOOP_DIE_CAMPAIGN);
  check('f.归零死亡→战役复活:alive=true', f2.alive === true, JSON.stringify(f2));
  check('f.归零死亡→战役复活:altitude≈9000(复活重置)', f2.altitude === 9000, 'alt=' + f2.altitude);
  check('f.归零死亡→战役复活:revivesUsed=1', f2.ru === 1, 'ru=' + f2.ru);
  check('f.归零死亡→战役复活:pendingState=null', f2.pending === null, 'pending=' + f2.pending);

  // ===== g. 无尽 4 连死:前 3 次复活(3→2→1→0),第 4 次 gameover + altitude=0 =====
  const g0 = await evalJs(`(() => { startEndless(); player.invuln = 9999; return GAME.reviveCount; })()`);
  check('g0.无尽开局 reviveCount=3', g0 === 3, 'rc=' + g0);
  const g1 = await evalJs(`(() => {
    player.alive = true; player.dead = false;
    player.throttle = 0; player.speed = 100; player.altitude = 50;
    let frames = 0;
    const ru0 = GAME.revivesUsed;
    while (frames < 3000 && GAME.revivesUsed === ru0) { updatePlayer(0.016); frames++; }
    return { alive: player.alive, alt: player.altitude, rc: GAME.reviveCount, ru: GAME.revivesUsed, frames };
  })()`);
  check('g1.无尽第1次归零死亡→复活(rc=2,alt=9000)', g1.alive === true && g1.rc === 2 && g1.alt === 9000, JSON.stringify(g1));
  const g2 = await evalJs(`(() => {
    player.alive = true; player.dead = false;
    player.throttle = 0; player.speed = 100; player.altitude = 50;
    let frames = 0;
    const ru0 = GAME.revivesUsed;
    while (frames < 3000 && GAME.revivesUsed === ru0) { updatePlayer(0.016); frames++; }
    return { alive: player.alive, alt: player.altitude, rc: GAME.reviveCount, ru: GAME.revivesUsed };
  })()`);
  check('g2.无尽第2次归零死亡→复活(rc=1,alt=9000)', g2.alive === true && g2.rc === 1 && g2.alt === 9000, JSON.stringify(g2));
  const g3 = await evalJs(`(() => {
    player.alive = true; player.dead = false;
    player.throttle = 0; player.speed = 100; player.altitude = 50;
    let frames = 0;
    const ru0 = GAME.revivesUsed;
    while (frames < 3000 && GAME.revivesUsed === ru0) { updatePlayer(0.016); frames++; }
    return { alive: player.alive, alt: player.altitude, rc: GAME.reviveCount, ru: GAME.revivesUsed };
  })()`);
  check('g3.无尽第3次归零死亡→复活(rc=0,alt=9000)', g3.alive === true && g3.rc === 0 && g3.alt === 9000, JSON.stringify(g3));
  const g4 = await evalJs(`(() => {
    player.alive = true; player.dead = false;
    player.throttle = 0; player.speed = 100; player.altitude = 50;
    let frames = 0;
    while (frames < 3000 && player.alive) { updatePlayer(0.016); frames++; }
    return { alive: player.alive, alt: player.altitude, rc: GAME.reviveCount, ru: GAME.revivesUsed, pending: GAME.pendingState, frames };
  })()`);
  check('g4.无尽第4次归零死亡:alive=false', g4.alive === false, JSON.stringify(g4));
  check('g4.无尽第4次归零死亡:altitude=0', g4.alt === 0, 'alt=' + g4.alt);
  check('g4.无尽第4次归零死亡:pendingState=gameover', g4.pending === 'gameover', 'pending=' + g4.pending);

  // ===== h. drawHUD 不抛错 + 警告红像素 on(1500)/off(9000) =====
  const hud = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.hp = player.maxHp; player.hitFlash = 0;
    missiles.length = 0;
    const dpr = canvas.width / W;
    const cx = Math.round(W / 2 * dpr), cy = Math.round(H * 0.66 * dpr);
    const rx = Math.round(130 * dpr), ry = Math.round(22 * dpr);
    let noThrow = true, throwErr = '';
    try { drawHUD(); } catch (e) { noThrow = false; throwErr = String(e && e.stack || e); }
    // 警告 ON:altitude=1500,gameTime=0 → sin(0)=0 > -0.4 闪烁亮
    gameTime = 0;
    player.altitude = 1500;
    ctx.clearRect(cx - rx - 20, cy - ry - 20, (rx + 20) * 2, (ry + 20) * 2);
    drawHUD();
    const on = ctx.getImageData(cx - rx, cy - ry, rx * 2, ry * 2).data;
    let redOn = 0;
    for (let i = 0; i < on.length; i += 4) if (on[i] > 150 && on[i + 1] < 110 && on[i + 2] < 110) redOn++;
    // 警告 OFF:altitude=9000,同区域清空后再画,应无红像素
    player.altitude = 9000;
    ctx.clearRect(cx - rx - 20, cy - ry - 20, (rx + 20) * 2, (ry + 20) * 2);
    drawHUD();
    const off = ctx.getImageData(cx - rx, cy - ry, rx * 2, ry * 2).data;
    let redOff = 0;
    for (let i = 0; i < off.length; i += 4) if (off[i] > 150 && off[i + 1] < 110 && off[i + 2] < 110) redOff++;
    return { noThrow, throwErr, redOn, redOff, dpr, W, H };
  })()`);
  check('h1.drawHUD() 不抛错', hud.noThrow === true, hud.throwErr || 'ok');
  check('h2.altitude=1500 警告区红像素 > 50', hud.redOn > 50, 'redOn=' + hud.redOn);
  check('h3.altitude=9000 警告区红像素 = 0', hud.redOff === 0, 'redOff=' + hud.redOff);

  // ===== i. 截图 work/t18-altitude.png(警告态,altitude≈1200),回喂页面数红像素 =====
  let shotRed = 0, shotOk = false, shotData = '';
  for (let attempt = 1; attempt <= 8 && !shotOk; attempt++) {
    // 置 gameTime 到 sin 峰值附近(0.112 → x=1.57),之后 ~140ms 内闪烁保持亮
    await evalJs(`(() => {
      startMission(0, 'campaign'); ChapterCard.skip();
      GAME.state = 'playing';
      player.invuln = 9999;
      player.alive = true; player.hp = player.maxHp; player.hitFlash = 0;
      player.throttle = 0.5; player.speed = 200; player.altitude = 1200;
      missiles.length = 0;
      gameTime = 0.112;
    })()`);
    await sleep(60);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    shotData = data;
    shotRed = await evalJs(`(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${data}';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) n++;
      return n;
    })()`);
    console.log('  截图尝试 ' + attempt + ': 红像素=' + shotRed);
    if (shotRed > 50) shotOk = true;
  }
  if (shotData) writeFileSync(ROOT + '/work/t18-altitude.png', Buffer.from(shotData, 'base64'));
  check('i.截图 t18-altitude.png 含警告态(红像素 > 50)', shotOk, 'red=' + shotRed + ' → work/t18-altitude.png');

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== 结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过 ===');
  if (errors.length) { console.log('Chrome 错误:\n' + errors.join('\n')); process.exitCode = 1; }
  if (failed.length) {
    console.log('失败项:');
    failed.forEach((f) => console.log(' - ' + f.name));
    process.exitCode = 1;
  }
  chrome.kill();
  process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('FATAL:', e.message); chrome.kill(); process.exit(1); });
