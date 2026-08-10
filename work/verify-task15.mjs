// task-15 冒烟:检查点可见标记 + 屏幕边缘指引箭头
// 参照 work/verify-batch3.mjs 连接样板;端口 9362,profile work/chrome-profile-guide
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const PORT = 9362;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

mkdirSync(ROOT + '/work/chrome-profile-guide', { recursive: true });

const chrome = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + ROOT + '/work/chrome-profile-guide',
  '--window-size=1600,900', '--disable-features=Translate',
  '--hide-scrollbars',
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

// 进入竞速关并摆好相机/玩家(测试专用;不改任何游戏逻辑)
const SETUP_RACE = `(() => {
  save.chapterCleared = 3; saveNow();
  startMission(6, 'campaign');
  transition.active = false;
  cam.zoom = 1; cam.shake = 0; cam.shakeX = 0; cam.shakeY = 0;
  return mission.def.type + '|' + (mission.def.checkpoints || []).length;
})()`;

// 屏幕坐标采样(CSS px → 设备 px)
const PIX = `(x, y) => {
  const g = document.querySelector('canvas').getContext('2d');
  const d = g.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data;
  return [d[0], d[1], d[2]];
}`;

async function main() {
  await connect();
  await sleep(1200);
  await evalJs(`localStorage.clear(); location.reload();`);
  await sleep(1800);

  // ---- 0. 逻辑钩子存在性 ----
  const hook = await evalJs(`typeof drawCheckpoints === 'function' && typeof drawOffscreenArrow === 'function'`);
  check('drawCheckpoints / drawOffscreenArrow 已定义', hook === true);

  // ---- 1. 检查点可见标记(相机对准第一个检查点,采样非背景像素) ----
  const r1 = await evalJs(`(() => {
    ${SETUP_RACE};
    const cp = mission.def.checkpoints[0];
    player.x = cp.x; player.y = cp.y;
    cam.x = cp.x; cam.y = cp.y;
    const pix = ${PIX};
    const S = (cx, cy) => pix(cx, cy);
    // 背景参考:临时隐藏检查点绘制(仅测试钩子,draw 后立即恢复)
    const origType = mission.def.type;
    mission.def.type = 'x';
    draw();
    const bg = S(W / 2, H / 2);
    mission.def.type = origType;
    draw();
    const fg = S(W / 2, H / 2);            // 光柱底部(检查点位置)
    const fgMid = S(W / 2, H / 2 - 120);   // 光柱中部
    const fgTop = S(W / 2, H / 2 - 240);   // 顶部悬浮菱形
    const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    return { bg, fg, fgMid, fgTop, d1: diff(fg, bg), d2: diff(fgMid, bg), d3: diff(fgTop, bg), cp };
  })()`);
  check('检查点位置(光柱底部)非背景像素', r1.d1 > 25, JSON.stringify(r1));
  check('光柱中部非背景像素', r1.d2 > 15, 'd2=' + r1.d2);
  check('顶部悬浮菱形/环标非背景像素', r1.d3 > 40, 'd3=' + r1.d3);
  await shot('t15-race-checkpoint.png');

  // ---- 2. 屏幕边缘指引箭头(玩家远离检查点 → 边缘出现金色箭头) ----
  const r2 = await evalJs(`(() => {
    ${SETUP_RACE};
    player.x = 600; player.y = 1000;
    cam.x = 600; cam.y = 1000;
    mission.raceIndex = 0;
    draw();
    const g = document.querySelector('canvas').getContext('2d');
    // 箭头应位于右边缘内侧 24px,垂直居中(指向屏幕外右侧的检查点)
    const cx0 = W - 24, cy0 = H / 2;
    let gold = 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = g.getImageData(Math.round((cx0 + dx) * DPR), Math.round((cy0 + dy) * DPR), 1, 1).data;
        if (d[0] >= 250 && d[1] >= 195 && d[2] <= 125) gold++;
      }
    }
    // 目标在屏幕内时应无箭头:玩家移到检查点附近(视口内)但保持距离>380 防止自动推进
    player.x = 1500; player.y = 1400;
    cam.x = 1500; cam.y = 1400;
    mission.raceIndex = 0;
    draw();
    let goldIn = 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = g.getImageData(Math.round((cx0 + dx) * DPR), Math.round((cy0 + dy) * DPR), 1, 1).data;
        if (d[0] >= 250 && d[1] >= 195 && d[2] <= 125) goldIn++;
      }
    }
    return { gold, goldIn, W, H };
  })()`);
  check('目标在屏幕外 → 边缘箭头(#ffd166 像素)', r2.gold > 5, 'gold=' + r2.gold);
  check('目标在屏幕内 → 不画箭头', r2.goldIn < 3, 'goldIn=' + r2.goldIn);
  await shot('t15-guide-arrow.png');

  // ---- 3. 推进 raceIndex 后,已通过检查点变暗(光柱消失 → 暗绿小标记) ----
  const r3 = await evalJs(`(() => {
    ${SETUP_RACE};
    const cp = mission.def.checkpoints[0];
    player.x = cp.x; player.y = cp.y + 500;  // 距 cp0 500px,防止 updateRace 自动推进
    cam.x = cp.x; cam.y = cp.y;
    mission.raceIndex = 0;
    draw();
    const g = document.querySelector('canvas').getContext('2d');
    const sum = () => {
      const d = g.getImageData(Math.round((W / 2) * DPR), Math.round((H / 2) * DPR), 1, 1).data;
      return d[0] + d[1] + d[2];
    };
    const before = sum();
    mission.raceIndex = 1;   // 通过 cp0 → 光柱变暗绿小标记
    draw();
    const after = sum();
    return { before, after, drop: before - after };
  })()`);
  check('已通过检查点变暗(亮度下降)', r3.drop > 40, JSON.stringify(r3));

  // ---- 4. 护航关:屏幕边缘箭头指向运输机(绿色) ----
  const r4 = await evalJs(`(() => {
    save.chapterCleared = 3; saveNow();
    startMission(7, 'campaign');
    transition.active = false;
    cam.zoom = 1; cam.shake = 0; cam.shakeX = 0; cam.shakeY = 0;
    cam.x = player.x; cam.y = player.y;
    draw();
    const g = document.querySelector('canvas').getContext('2d');
    const cx0 = 24, cy0 = H / 2;  // 左边缘(运输机在玩家左侧)
    let green = 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const d = g.getImageData(Math.round((cx0 + dx) * DPR), Math.round((cy0 + dy) * DPR), 1, 1).data;
        if (d[1] >= 185 && d[0] <= 115 && d[2] <= 150) green++;
      }
    }
    const tp = mission.transport ? { x: mission.transport.x, y: mission.transport.y, dead: !!mission.transport.dead } : null;
    return { green, tp };
  })()`);
  check('护航关箭头指向运输机(绿色像素)', r4.green > 3 && r4.tp && !r4.tp.dead, JSON.stringify(r4));

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
