// 任务书 20 冒烟:手机操作改版(追尾视角 + 滑动操控 + 自动开火 + 评级去命中度)
// 端口 9369 / profile work/chrome-profile-mobile(参照 work/verify-altitude.mjs 样板)
// 用例:a.静态 b.追尾渲染像素 c.触屏自动开火 d.滑动油门 e.双滑滚筒 f.评级忽略命中 g.截图回喂探针
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9369;
const PROF = ROOT + '/work/chrome-profile-mobile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

// ===== a. 静态检查(主文件文本)=====
const html = readFileSync(FILE, 'utf8');
const cnt = (re) => (html.match(re) || []).length;
check('a1.静态:drawWorld 追尾旋转 rotate(-Math.PI/2 - player.heading)', html.includes('ctx.rotate(-Math.PI / 2 - player.heading)'));
check('a2.静态:飞机锚点 H*CAM_ANCHOR_Y(0.62) 与 CAM_ZOOM 0.85', /CAM_ANCHOR_Y = 0\.62/.test(html) && /CAM_ZOOM = 0\.85/.test(html));
check('a3.静态:touchSwipe 手势对象', /const touchSwipe = \{ dir: null, active: false/.test(html));
check('a4.静态:SWIPE_THRESH=28 / SWIPE_DOUBLE_GAP=0.6 / SWIPE_CRUISE=0.68', /SWIPE_THRESH = 28/.test(html) && /SWIPE_DOUBLE_GAP = 0\.6/.test(html) && /SWIPE_CRUISE = 0\.68/.test(html));
check('a5.静态:触屏自动开火 input.fireHeld || input.isTouch', html.includes("input.fireHeld || input.isTouch"));
check('a6.静态:computeRating 权重 45/35/20 且无 accuracy 计算', html.includes('* 45') && html.includes('* 35') && html.includes('* 20') && !html.includes('accuracyScore'));
check('a7.静态:updateCamera 硬锁玩家', /cam\.x = player\.x; cam\.y = player\.y;/.test(html));
check('a8.静态:雷达 blip 套旋转(表达式出现 ≥3 处:drawWorld/箭头/雷达)', cnt(/-Math\.PI \/ 2 - player\.heading/g) >= 3, 'count=' + cnt(/-Math\.PI \/ 2 - player\.heading/g));
check('a9.静态:FIRE_RECT / ROLL_RECT 已删除', !html.includes('FIRE_RECT') && !html.includes('ROLL_RECT'));
check('a10.静态:触屏提示文案更新', html.includes('上滑加速 · 下滑减速 · 左/右滑转向 · 快速双滑滚筒 · 右下导弹'));
check('a11.静态:drawRatingPanel 无「命中」条', !html.includes("{ label: '命中'"));
check('a12.静态:drawComplete 无「命中率」行', !html.slice(html.indexOf('function drawComplete'), html.indexOf('function drawGameOver')).includes('命中率'));
check('a13.静态:触屏按钮区只画导弹键', cnt(/fillText\('导弹'/g) === 1 && !html.includes("fillText('机炮'"));

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

async function main() {
  await connect();
  await sleep(1200);

  // ===== b. 追尾渲染:drawWorld 不抛错 + 飞机主色 #9db8c9 在 (W/2, H*0.62) ±80px =====
  const b = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.hp = player.maxHp;
    player.heading = -Math.PI / 2;
    input.isTouch = false; input.fireHeld = false; input.mouse.down = false;
    cam.zoom = 1; cam.shake = 0; cam.shakeX = 0; cam.shakeY = 0;
    cam.x = player.x; cam.y = player.y;
    let noThrow = true, throwErr = '';
    try { drawWorld(); } catch (e) { noThrow = false; throwErr = String(e && e.stack || e); }
    const dpr = canvas.width / W;
    const cx = Math.round(W / 2 * dpr), cy = Math.round(H * 0.62 * dpr);
    const R = Math.round(80 * dpr);
    const img = ctx.getImageData(cx - R, cy - R, R * 2, R * 2);
    let hits = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const r = img.data[i], g = img.data[i + 1], bl = img.data[i + 2];
      if (Math.abs(r - 157) <= 34 && Math.abs(g - 184) <= 34 && Math.abs(bl - 201) <= 34) hits++;
    }
    return { noThrow, throwErr, hits, W, H, dpr };
  })()`);
  check('b1.drawWorld() 追尾相机不抛错', b.noThrow === true, b.throwErr || 'ok');
  check('b2.飞机主色(#9db8c9)像素出现在 (W/2, H*0.62) ±80px', b.hits > 20, 'hits=' + b.hits + ' W=' + b.W + ' H=' + b.H);

  // ===== c. 触屏自动开火 =====
  const c1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    bullets.length = 0; player.fireCd = 0;
    input.isTouch = true; input.fireHeld = false; input.mouse.down = false;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    return { n: bullets.length, shotsFired: GAME.shotsFired };
  })()`);
  check('c1.触屏自动开火:isTouch=true 30 帧生成子弹', c1.n > 0, 'bullets=' + c1.n);
  const c2 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    bullets.length = 0; player.fireCd = 0;
    input.isTouch = false; input.fireHeld = false; input.mouse.down = false;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    return { n: bullets.length, shotsFired: GAME.shotsFired };
  })()`);
  check('c2.非触屏:isTouch=false 无按键 → 不开火', c2.n === 0, 'bullets=' + c2.n);

  // ===== d. 滑动油门:上滑→升 / 下滑→降 / 松手→回巡航 0.68 =====
  const d1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    input.isTouch = true;
    touchSwipe.active = true; touchSwipe.dir = 'up';
    player.throttle = 0.1;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    const up = player.throttle;
    touchSwipe.dir = 'down';
    for (let i = 0; i < 60; i++) updatePlayer(0.016);
    const down = player.throttle;
    touchSwipe.active = false; touchSwipe.dir = null;
    for (let i = 0; i < 400; i++) updatePlayer(0.016);
    return { up, down, cruise: player.throttle };
  })()`);
  check('d1.上滑按住 → 油门上升', d1.up > 0.5, 'up=' + d1.up.toFixed(3));
  check('d2.下滑按住 → 油门下降', d1.down < d1.up, 'down=' + d1.down.toFixed(3));
  check('d3.松手 → 回巡航 0.68', Math.abs(d1.cruise - 0.68) < 0.05, 'cruise=' + d1.cruise.toFixed(3));

  // ===== e. 双滑滚筒 =====
  const e1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    transition.active = false;
    player.alive = true; player.invuln = 9999;
    player.rollActive = false; player.rollCd = 0;
    touchSwipe.lastDir = null; touchSwipe.lastT = -99;
    touchSwipe.active = true; touchSwipe.dir = 'left';
    completeSwipe();
    return { roll: player.rollActive, rollCd: player.rollCd, lastDir: touchSwipe.lastDir };
  })()`);
  check('e1.单次滑动 → 不滚筒,记录 lastDir', e1.roll === false && e1.lastDir === 'left' && e1.rollCd === 0, JSON.stringify(e1));
  const e2 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    transition.active = false;
    player.alive = true; player.invuln = 9999;
    player.rollActive = false; player.rollCd = 0;
    touchSwipe.lastDir = null; touchSwipe.lastT = -99;
    touchSwipe.active = true; touchSwipe.dir = 'right'; completeSwipe();
    touchSwipe.active = true; touchSwipe.dir = 'right'; completeSwipe();
    return { roll: player.rollActive, rollDir: player.rollDir, rollCd: player.rollCd, lastDir: touchSwipe.lastDir };
  })()`);
  check('e2.同向双滑(间隔<0.6s)→ 滚筒 rollActive=true', e2.roll === true && e2.rollDir === 1 && e2.rollCd === 2.6, JSON.stringify(e2));
  check('e3.双滑后 lastDir 清空(防三连)', e2.lastDir === null, 'lastDir=' + e2.lastDir);

  // ===== f. 评级:去命中度 =====
  const f1 = await evalJs(`(() => {
    const a = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 0 });
    const b = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 1 });
    const parts = a.parts || {};
    const sum = Math.round((parts.time || 0) + (parts.damage || 0) + (parts.combo || 0));
    return { a: a.total, b: b.total, rank: a.rank, parts, sum, hasAcc: 'accuracy' in parts };
  })()`);
  check('f1.accuracy=0 与 accuracy=1 总分一致(忽略命中)', f1.a === f1.b, 'a=' + f1.a + ' b=' + f1.b);
  check('f2.总分结构 = 时间+损伤+连击,parts 无 accuracy', f1.sum === f1.a && f1.hasAcc === false, JSON.stringify(f1.parts));
  const f2 = await evalJs(`(() => {
    const r = computeRating({ missionTime: 0, damageTaken: 0, maxCombo: 40 });
    return { total: r.total, rank: r.rank };
  })()`);
  check('f3.满分场景总分 ∈ [99,100] 且评级 SSS', f2.total >= 99 && f2.total <= 100 && f2.rank === 'SSS', JSON.stringify(f2));
  const f3 = await evalJs(`(() => {
    GAME.endStats = { rating: computeRating({ missionTime: 120, damageTaken: 30, maxCombo: 20, accuracy: 0.5 }) };
    let noThrow = true, err = '';
    try { drawRatingPanel(GAME.endStats); } catch (e) { noThrow = false; err = String(e && e.stack || e); }
    return { noThrow, err };
  })()`);
  check('f4.drawRatingPanel(3 条)不抛错', f3.noThrow === true, f3.err || 'ok');

  // ===== g. 截图 work/t20-mobile.png(追尾视角,飞机在屏幕下中)+ 回喂探针 =====
  await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.invuln = 9999;
    player.alive = true; player.hp = player.maxHp; player.hitFlash = 0;
    player.throttle = 0.68; player.speed = 260; player.altitude = 3500;
    player.heading = -Math.PI / 2;
    missiles.length = 0;
    input.isTouch = true;
  })()`);
  await sleep(300); // 让 rAF 画几帧(zoom lerp → 0.85)
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(ROOT + '/work/t20-mobile.png', Buffer.from(data, 'base64'));
  const shotOk = await evalJs(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const dpr = c.width / W;
    const cx = Math.round(W / 2 * dpr), cy = Math.round(H * 0.62 * dpr);
    const R = Math.round(150 * dpr);
    const d = x.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let hits = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 157) <= 34 && Math.abs(d[i + 1] - 184) <= 34 && Math.abs(d[i + 2] - 201) <= 34) hits++;
    }
    return hits;
  })()`);
  check('g.截图 t20-mobile.png 含追尾视角飞机(中下区域主色像素>150)', shotOk > 150, 'hits=' + shotOk + ' → work/t20-mobile.png');

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
