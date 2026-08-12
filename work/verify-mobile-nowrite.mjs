// 任务书 21 冒烟:手机油门拖动条 + PC 键位优化(AD 转向/双击滚筒/空格开火/V 导弹)
// 端口 9369 / profile work/chrome-profile-mobile(参照 work/verify-altitude.mjs 样板)
// 用例:a.静态 b.追尾渲染像素 c.触屏自动开火 d.拖动条映射/松手保持 e.垂直滑动不激活
//       f.左右滑转向 g.双滑滚筒 h.PC 双击滚筒 i.评级忽略命中 j.截图含拖动条 + 像素探针
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';

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
check('a4.静态:SWIPE_THRESH=28 / SWIPE_DOUBLE_GAP=0.6 / SWIPE_CRUISE 已删', /SWIPE_THRESH = 28/.test(html) && /SWIPE_DOUBLE_GAP = 0\.6/.test(html) && !html.includes('SWIPE_CRUISE'));
check('a5.静态:THROTTLE_BAR 常量 + KEY_TAP_DOUBLE_GAP=0.6', /const THROTTLE_BAR = \{ x: 0, y: 0, w: 36, h: 0 \}/.test(html) && /KEY_TAP_DOUBLE_GAP = 0\.6/.test(html));
check('a6.静态:touchmove 只认水平主轴(|dx|>|dy| 且 |dx|>阈值)', /Math\.abs\(dx\) > SWIPE_THRESH && Math\.abs\(dx\) > Math\.abs\(dy\)/.test(html));
check('a7.静态:DEFAULT_BINDS turnLeft=KeyA/turnRight=KeyD/gun=Space/missile=KeyV', /turnLeft: 'KeyA'/.test(html) && /turnRight: 'KeyD'/.test(html) && /gun: 'Space'/.test(html) && /missile: 'KeyV'/.test(html));
check('a8.静态:keydown 双击滚筒检测(复用 player.lastDirTap)', html.includes('player.lastDirTap.dir === dir') && html.includes('now - player.lastDirTap.t < KEY_TAP_DOUBLE_GAP'));
check('a9.静态:触屏自动开火 input.fireHeld || input.isTouch', html.includes("input.fireHeld || input.isTouch"));
check('a10.静态:computeRating 权重 45/35/20 且无 accuracy 计算', html.includes('* 45') && html.includes('* 35') && html.includes('* 20') && !html.includes('accuracyScore'));
check('a11.静态:updateCamera 硬锁玩家', /cam\.x = player\.x; cam\.y = player\.y;/.test(html));
check('a12.静态:雷达 blip 套旋转(表达式出现 ≥3 处:drawWorld/箭头/雷达)', cnt(/-Math\.PI \/ 2 - player\.heading/g) >= 3, 'count=' + cnt(/-Math\.PI \/ 2 - player\.heading/g));
check('a13.静态:FIRE_RECT / ROLL_RECT 已删除', !html.includes('FIRE_RECT') && !html.includes('ROLL_RECT'));
check('a14.静态:触屏提示文案更新(左/右滑转向 · 右侧油门条)', html.includes('左/右滑转向 · 快速双滑滚筒 · 右侧油门条 · 右下导弹') && !html.includes('上滑加速'));
check('a15.静态:drawRatingPanel 无「命中」条', !html.includes("{ label: '命中'"));
check('a16.静态:drawComplete 无「命中率」行', !html.slice(html.indexOf('function drawComplete'), html.indexOf('function drawGameOver')).includes('命中率'));
check('a17.静态:触屏按钮区只画导弹键', cnt(/fillText\('导弹'/g) === 1 && !html.includes("fillText('机炮'"));
check('a18.静态:drawHUD 画油门条「油门」小字', html.includes("fillText('油门'"));

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

// 触屏事件注入样板:直接构造 Event + changedTouches(触摸 id / 坐标自定)
const TOUCH_HELPER = `
function fireTouch(type, id, x, y) {
  const ev = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(ev, 'changedTouches', { value: [{ identifier: id, clientX: x, clientY: y }] });
  canvas.dispatchEvent(ev);
}
`;

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

  // ===== c. 触屏自动开火(回归,任务书 20)=====
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

  // ===== d. 油门拖动条:条内 touchstart/touchmove 映射(顶=1/底=0/中≈0.5),松手保持 =====
  const d1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    input.isTouch = true;
    input.keys = {};
    input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null };
    touchSwipe.active = false; touchSwipe.dir = null;
    ${TOUCH_HELPER}
    const bx = THROTTLE_BAR.x + THROTTLE_BAR.w / 2;
    fireTouch('touchstart', 11, bx, THROTTLE_BAR.y);                        // 条顶
    const top = player.throttle;
    fireTouch('touchmove', 11, bx, THROTTLE_BAR.y + THROTTLE_BAR.h);        // 条底
    const bottom = player.throttle;
    fireTouch('touchmove', 11, bx, THROTTLE_BAR.y + THROTTLE_BAR.h * 0.5);  // 中部
    const mid = player.throttle;
    fireTouch('touchend', 11, bx, THROTTLE_BAR.y + THROTTLE_BAR.h * 0.5);
    const idAfter = input.touch.throttleBarId;
    for (let i = 0; i < 60; i++) updatePlayer(0.016);                      // 松手后推进:应保持
    return { top, bottom, mid, idAfter, held: player.throttle, bar: { x: THROTTLE_BAR.x, y: THROTTLE_BAR.y, w: THROTTLE_BAR.w, h: THROTTLE_BAR.h } };
  })()`);
  check('d1.拖动条条顶触点 → throttle=1', d1.top === 1, 'top=' + d1.top + ' bar=' + JSON.stringify(d1.bar));
  check('d2.拖动条条底触点 → throttle=0', d1.bottom === 0, 'bottom=' + d1.bottom);
  check('d3.拖动条中部触点 → throttle≈0.5', Math.abs(d1.mid - 0.5) < 0.03, 'mid=' + d1.mid);
  check('d4.松手后 throttleBarId 清空且油门保持(无巡航回落)', d1.idAfter === null && Math.abs(d1.held - d1.mid) < 0.001, 'held=' + d1.held);

  // ===== e. 垂直滑动:上滑/下滑位移 → 不激活任何动作,油门不变 =====
  const e1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    input.isTouch = true;
    input.keys = {};
    input.mouse.movedAt = -99;
    input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null };
    touchSwipe.active = false; touchSwipe.dir = null; touchSwipe.startX = 0; touchSwipe.startY = 0;
    player.throttle = 0.42;
    ${TOUCH_HELPER}
    fireTouch('touchstart', 12, W / 2, H / 2);
    fireTouch('touchmove', 12, W / 2 + 3, H / 2 - 90);   // 上滑(竖直为主)
    const upActive = touchSwipe.active, upDir = touchSwipe.dir;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    const upThrottle = player.throttle;
    fireTouch('touchmove', 12, W / 2 - 3, H / 2 + 90);   // 下滑(竖直为主)
    const downActive = touchSwipe.active, downDir = touchSwipe.dir;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    const downThrottle = player.throttle;
    return { upActive, upDir, upThrottle, downActive, downDir, downThrottle };
  })()`);
  check('e1.上滑 → 不激活滑动(touchSwipe.active=false, dir=null)', e1.upActive === false && e1.upDir === null, 'active=' + e1.upActive + ' dir=' + e1.upDir);
  check('e2.下滑 → 不激活滑动(touchSwipe.active=false, dir=null)', e1.downActive === false && e1.downDir === null, 'active=' + e1.downActive + ' dir=' + e1.downDir);
  check('e3.垂直滑动期间油门不变(无上滑/下滑油门)', Math.abs(e1.upThrottle - 0.42) < 1e-6 && Math.abs(e1.downThrottle - 0.42) < 1e-6, 'up=' + e1.upThrottle + ' down=' + e1.downThrottle);

  // ===== f. 左右滑转向:左滑 → 激活 dir=left 且转向生效(保留,任务书 20)=====
  const f1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    input.isTouch = true;
    input.keys = {};
    input.mouse.movedAt = -99;
    input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null };
    touchSwipe.active = false; touchSwipe.dir = null; touchSwipe.startX = 0; touchSwipe.startY = 0;
    player.heading = 0; player.speed = 200;
    ${TOUCH_HELPER}
    fireTouch('touchstart', 13, W / 2, H / 2);
    fireTouch('touchmove', 13, W / 2 - 100, H / 2 + 8);  // 左滑(水平为主)
    const act = touchSwipe.active, dir = touchSwipe.dir;
    for (let i = 0; i < 30; i++) updatePlayer(0.016);
    return { act, dir, h1: player.heading };
  })()`);
  check('f1.左滑 → 激活 dir=left', f1.act === true && f1.dir === 'left', 'active=' + f1.act + ' dir=' + f1.dir);
  check('f2.左滑按住 → 转向生效(heading 减小)', f1.h1 < -0.05, 'h1=' + f1.h1.toFixed(3));

  // ===== g. 双滑滚筒(保留,任务书 20)=====
  const g1 = await evalJs(`(() => {
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
  check('g1.单次滑动 → 不滚筒,记录 lastDir', g1.roll === false && g1.lastDir === 'left' && g1.rollCd === 0, JSON.stringify(g1));
  const g2 = await evalJs(`(() => {
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
  check('g2.同向双滑(间隔<0.6s)→ 滚筒 rollActive=true', g2.roll === true && g2.rollDir === 1 && g2.rollCd === 2.6, JSON.stringify(g2));
  check('g3.双滑后 lastDir 清空(防三连)', g2.lastDir === null, 'lastDir=' + g2.lastDir);

  // ===== h. PC 双击 A/D 滚筒(任务书 21)=====
  const h1 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    transition.active = false;
    player.alive = true; player.invuln = 9999;
    player.rollActive = false; player.rollCd = 0;
    player.lastDirTap = { dir: null, t: -99 };
    const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    key('KeyA');                                    // 单击
    const singleRoll = player.rollActive, singleTap = player.lastDirTap.dir;
    key('KeyA');                                    // 双击(间隔≈0 < 0.6s)
    const doubleRoll = player.rollActive, doubleCd = player.rollCd, afterDouble = player.lastDirTap.dir;
    key('KeyA');                                    // 三连
    const tripleRoll = player.rollActive, tripleCd = player.rollCd, afterTriple = player.lastDirTap.dir;
    return { singleRoll, singleTap, doubleRoll, doubleCd, afterDouble, tripleRoll, tripleCd, afterTriple };
  })()`);
  check('h1.单击 A → 不滚筒,记录 lastDirTap.dir=left', h1.singleRoll === false && h1.singleTap === 'left', JSON.stringify(h1));
  check('h2.同向双击(间隔<0.6s)→ 滚筒 rollActive=true,rollCd=2.6', h1.doubleRoll === true && h1.doubleCd === 2.6, JSON.stringify(h1));
  check('h3.滚筒后 lastDirTap 清空,三连不重复滚筒', h1.afterDouble === null && h1.tripleRoll === true && h1.tripleCd === 2.6, JSON.stringify(h1));
  const h2 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    transition.active = false;
    player.alive = true; player.invuln = 9999;
    player.rollActive = false; player.rollCd = 0;
    player.lastDirTap = { dir: null, t: -99 };
    const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    key('KeyD'); key('KeyD');
    return { roll: player.rollActive, rollDir: player.rollDir, rollCd: player.rollCd };
  })()`);
  check('h4.KeyD 同向双击 → 右滚筒 rollDir=1', h2.roll === true && h2.rollDir === 1 && h2.rollCd === 2.6, JSON.stringify(h2));

  // ===== i. 评级:去命中度(回归,任务书 20)=====
  const i1 = await evalJs(`(() => {
    const a = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 0 });
    const b = computeRating({ missionTime: 60, damageTaken: 0, maxCombo: 40, accuracy: 1 });
    const parts = a.parts || {};
    const sum = Math.round((parts.time || 0) + (parts.damage || 0) + (parts.combo || 0));
    return { a: a.total, b: b.total, rank: a.rank, parts, sum, hasAcc: 'accuracy' in parts };
  })()`);
  check('i1.accuracy=0 与 accuracy=1 总分一致(忽略命中)', i1.a === i1.b, 'a=' + i1.a + ' b=' + i1.b);
  check('i2.总分结构 = 时间+损伤+连击,parts 无 accuracy', i1.sum === i1.a && i1.hasAcc === false, JSON.stringify(i1.parts));
  const i2 = await evalJs(`(() => {
    const r = computeRating({ missionTime: 0, damageTaken: 0, maxCombo: 40 });
    return { total: r.total, rank: r.rank };
  })()`);
  check('i3.满分场景总分 ∈ [99,100] 且评级 SSS', i2.total >= 99 && i2.total <= 100 && i2.rank === 'SSS', JSON.stringify(i2));
  const i3 = await evalJs(`(() => {
    GAME.endStats = { rating: computeRating({ missionTime: 120, damageTaken: 30, maxCombo: 20, accuracy: 0.5 }) };
    let noThrow = true, err = '';
    try { drawRatingPanel(GAME.endStats); } catch (e) { noThrow = false; err = String(e && e.stack || e); }
    return { noThrow, err };
  })()`);
  check('i4.drawRatingPanel(3 条)不抛错', i3.noThrow === true, i3.err || 'ok');

  // ===== j. 截图 work/t21-mobile.png(含油门拖动条画面)+ 回喂像素探针 =====
  await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.invuln = 9999;
    player.alive = true; player.hp = player.maxHp; player.hitFlash = 0;
    player.throttle = 0.68; player.speed = 260; player.altitude = 3500;
    player.heading = -Math.PI / 2;
    player.afterburn = false;
    missiles.length = 0;
    input.isTouch = true;
    input.keys = {};
    input.touch = { active: false, mslId: null, swipeId: null, throttleBarId: null };
    touchSwipe.active = false; touchSwipe.dir = null;
  })()`);
  await sleep(300); // 让 rAF 画几帧(zoom lerp → 0.85 + HUD 油门条)
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const shotOk = await evalJs(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${data}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const dpr = c.width / W;
    // ① 飞机主色(中下区域)
    const cx = Math.round(W / 2 * dpr), cy = Math.round(H * 0.62 * dpr);
    const R = Math.round(150 * dpr);
    const d1 = x.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let planeHits = 0;
    for (let i = 0; i < d1.length; i += 4) {
      if (Math.abs(d1[i] - 157) <= 34 && Math.abs(d1[i + 1] - 184) <= 34 && Math.abs(d1[i + 2] - 201) <= 34) planeHits++;
    }
    // ② 油门拖动条填充区(#66d9ff,含 0.85 alpha 混色)
    const tb = THROTTLE_BAR;
    const fillH = Math.round(clamp(player.throttle, 0, 1) * tb.h);
    const px = Math.round((tb.x + tb.w / 2) * dpr);
    const y0 = Math.round((tb.y + tb.h - fillH + 4) * dpr);
    const y1 = Math.round((tb.y + tb.h - 4) * dpr);
    const d2 = x.getImageData(px - 2, y0, 5, y1 - y0).data;
    let barHits = 0;
    for (let i = 0; i < d2.length; i += 4) {
      if (Math.abs(d2[i] - 102) <= 40 && Math.abs(d2[i + 1] - 217) <= 40 && Math.abs(d2[i + 2] - 255) <= 40) barHits++;
    }
    return { planeHits, barHits, px, y0, y1, dpr, W, H, throttle: player.throttle, bar: { x: tb.x, y: tb.y, w: tb.w, h: tb.h } };
  })()`);
  check('j1.内存截图含追尾视角飞机(中下区域主色像素>150)', shotOk.planeHits > 150, 'hits=' + shotOk.planeHits + '（未落盘）');
  check('j2.截图右侧条区域含油门填充色 #66d9ff(像素>50)', shotOk.barHits > 50, 'barHits=' + shotOk.barHits + ' bar=' + JSON.stringify(shotOk.bar) + ' throttle=' + shotOk.throttle);

  // ===== k. PC 鼠标转向(任务书 22:相对转向 + 距离控速)=====
  // 静态:常量默认值 + 辅助函数 + 绝对角度 atan2 残留检查(文本层)
  check('k1.静态:MOUSE_STEER_* 常量默认值(40/0.35/1.5/0.2/2)', /MOUSE_STEER_DEADZONE = 40/.test(html) && /MOUSE_STEER_FULL = 0\.35/.test(html) && /MOUSE_STEER_RATE = 1\.5/.test(html) && /MOUSE_STEER_MIN = 0\.2/.test(html) && /MOUSE_STEER_TIMEOUT = 2/.test(html));
  check('k2.静态:updatePlayer 无 atan2(dy, dx) 绝对角度残留、mouseActive 已删', !html.includes('Math.atan2(dy, dx)') && !/\bmouseActive\b/.test(html));
  check('k3.静态:mouseSteerActive 辅助函数存在(now - input.mouse.movedAt) < MOUSE_STEER_TIMEOUT', /function mouseSteerActive\(now\) \{ return \(now - input\.mouse\.movedAt\) < MOUSE_STEER_TIMEOUT; \}/.test(html));
  const k4 = await evalJs(`(() => {
    const v = { D: MOUSE_STEER_DEADZONE, F: MOUSE_STEER_FULL, R: MOUSE_STEER_RATE, M: MOUSE_STEER_MIN, T: MOUSE_STEER_TIMEOUT, hasFn: typeof mouseSteerActive === 'function' };
    return v;
  })()`);
  check('k4.运行时:常量可读且 mouseSteerActive 为函数', k4.D === 40 && k4.F === 0.35 && k4.R === 1.5 && k4.M === 0.2 && k4.T === 2 && k4.hasFn === true, JSON.stringify(k4));

  // 右偏转向:鼠标偏右 → heading 增大(相对转向,持续右转)
  const k5 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    player.heading = 0.3; player.speed = 200; player.throttle = 0.5;
    input.isTouch = false; input.keys = {};
    touchSwipe.active = false; touchSwipe.dir = null;
    input.mouse.movedAt = performance.now() / 1000 - 0.1;   // 激活(< 2s)
    input.mouse.x = W / 2 + 200;                            // 偏右 200px
    const h0 = player.heading;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    return { h0, h1: player.heading, d: angDiff(h0, player.heading) };
  })()`);
  check('k5.右偏转向:mx=+200 推进 40 帧 → heading 增大(右转)', k5.d > 0.05, 'd=' + k5.d.toFixed(4));

  // 左偏转向:对称,heading 减小
  const k6 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    player.heading = 0.3; player.speed = 200; player.throttle = 0.5;
    input.isTouch = false; input.keys = {};
    touchSwipe.active = false; touchSwipe.dir = null;
    input.mouse.movedAt = performance.now() / 1000 - 0.1;
    input.mouse.x = W / 2 - 200;                            // 偏左 200px
    const h0 = player.heading;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    return { h0, h1: player.heading, d: angDiff(h0, player.heading) };
  })()`);
  check('k6.左偏转向:mx=-200 推进 40 帧 → heading 减小(左转)', k6.d < -0.05, 'd=' + k6.d.toFixed(4));

  // 距离控速:mx=300 与 mx=100 相同帧数 → 300 转角显著大于 100(>1.5 倍)
  const k7 = await evalJs(`(() => {
    function run(mx) {
      startMission(0, 'campaign'); ChapterCard.skip();
      GAME.state = 'playing';
      player.alive = true; player.invuln = 9999; player.altitude = 6000;
      player.heading = 0.7; player.speed = 200; player.throttle = 0.5;
      input.isTouch = false; input.keys = {};
      touchSwipe.active = false; touchSwipe.dir = null;
      input.mouse.movedAt = performance.now() / 1000 - 0.1;
      input.mouse.x = W / 2 + mx;
      const h0 = player.heading;
      for (let i = 0; i < 40; i++) updatePlayer(0.016);
      return angDiff(h0, player.heading);
    }
    const d300 = run(300), d100 = run(100);
    return { d300, d100, ratio: d300 / d100, W };
  })()`);
  check('k7.距离控速:mx=300 转角 > 1.5 倍于 mx=100', k7.ratio > 1.5, 'ratio=' + k7.ratio.toFixed(2) + ' d300=' + k7.d300.toFixed(4) + ' d100=' + k7.d100.toFixed(4) + ' W=' + k7.W);

  // 回中停止:mx 在死区内 → heading 不变
  const k8 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    player.heading = 0.3; player.speed = 200; player.throttle = 0.5;
    input.isTouch = false; input.keys = {};
    touchSwipe.active = false; touchSwipe.dir = null;
    input.mouse.movedAt = performance.now() / 1000 - 0.1;
    input.mouse.x = W / 2 + 20;                             // 死区(40)内
    const h0 = player.heading;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    return { d: angDiff(h0, player.heading) };
  })()`);
  check('k8.回中停止:mx=20 在死区内推进 40 帧 → heading 不变', Math.abs(k8.d) < 1e-9, 'd=' + k8.d);

  // 超时失效:movedAt 距今 3s(>2s)→ 不转向
  const k9 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    player.heading = 0.3; player.speed = 200; player.throttle = 0.5;
    input.isTouch = false; input.keys = {};
    touchSwipe.active = false; touchSwipe.dir = null;
    input.mouse.movedAt = performance.now() / 1000 - 3;     // 超时(3 > 2)
    input.mouse.x = W / 2 + 300;
    const h0 = player.heading;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    return { d: angDiff(h0, player.heading) };
  })()`);
  check('k9.超时失效:movedAt 距今 3s → heading 不变', Math.abs(k9.d) < 1e-9, 'd=' + k9.d);

  // 键盘优先:turnL 按下 + 鼠标偏右 → 按键盘逻辑左转(优先级链:手势>键盘>鼠标)
  const k10 = await evalJs(`(() => {
    startMission(0, 'campaign'); ChapterCard.skip();
    GAME.state = 'playing';
    player.alive = true; player.invuln = 9999; player.altitude = 6000;
    player.heading = 0.5; player.speed = 200; player.throttle = 0.5;
    input.isTouch = false; input.keys = {};
    touchSwipe.active = false; touchSwipe.dir = null;
    input.mouse.movedAt = performance.now() / 1000 - 0.1;
    input.mouse.x = W / 2 + 300;                            // 鼠标偏右(若鼠标优先会右转)
    input.keys[bindFor('turnLeft')] = true;                 // 键盘左转按下
    const h0 = player.heading;
    for (let i = 0; i < 40; i++) updatePlayer(0.016);
    input.keys = {};
    return { d: angDiff(h0, player.heading) };
  })()`);
  check('k10.键盘优先:turnL + 鼠标偏右 → heading 减小(左转)', k10.d < -0.05, 'd=' + k10.d.toFixed(4));

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
