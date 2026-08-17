// ---------- input ----------
const input = {
  keys: {},
  mouse: { x: 0, y: 0, down: false, rdown: false, mid: false, buttons: {}, movedAt: -99 },
  touch: { active: false, mslId: null, mslStartX: 0, mslStartY: 0, dashId: null, swipeId: null, throttleBarId: null, pauseId: null },
  fireHeld: false,
  mslHeld: false,
  missileAuto: false,
  isTouch: false
};

// 触屏滑动手势状态(任务书 20):dir 只认水平 'left'|'right'(任务书 21)
const touchSwipe = { dir: null, active: false, startX: 0, startY: 0, lastDir: null, lastT: -99, strength: 0 };
const SWIPE_THRESH = 28;      // px,水平滑动激活阈值,可调(任务书 20)
const SWIPE_DOUBLE_GAP = 0.6; // 秒,双滑判定间隔,可调(任务书 20)
const KEY_TAP_DOUBLE_GAP = 0.6; // 秒,PC 双击 A/D 滚筒判定间隔,可调(任务书 21)
// ---------- P34.1 触屏滑动转向连续强度映射(候选A, 真机签收门) ----------
// 死区保留 SWIPE_THRESH(|dx|>28px 激活, 任务书 21 契约); 强度锚点: 28px→0.35、W_eff*0.30→1.0、中间线性、钳制[0,1]
const STEER_STRENGTH_MIN_PX = 28;       // px(CSS 逻辑像素): 低于此距离 strength=0
const STEER_STRENGTH_FULL_RATIO = 0.30; // 有效可玩宽度占比 → strength=1.0
const STEER_RATE_MIN = 0.8;             // strength=0 端点转向倍率
const STEER_RATE_MAX = 1.8;             // strength=1 端点转向倍率
const STEER_SPEED_SCALE = 0.85;        // P34.1-R1: 触屏转向整体速率系数(可调, 1.0=候选A原速; 0.85=整体-15%)
// 有效可玩宽度 = 视口宽 − 左右安全区 − 右侧固定控制带(复用 P33 safeInsets()/hudRects()); CSS 逻辑像素口径
function steerEffectiveWidth() {
  const hr = hudRects();
  const controlBand = W - hr.throttle.x + HUD_CONTROL_GAP; // 油门条左缘到右视口缘 + 控制带间距
  return Math.max(1, W - hr.ml - hr.mr - controlBand);
}
// 滑动距离 → 归一化强度: 28px→0.35、W_eff*0.30→1.0、中间线性、钳制[0,1](纯函数, 可测)
function steerStrengthFromPx(px) {
  if (px < STEER_STRENGTH_MIN_PX) return 0;
  const full = steerEffectiveWidth() * STEER_STRENGTH_FULL_RATIO;
  const s = 0.35 + (px - STEER_STRENGTH_MIN_PX) / Math.max(1, full - STEER_STRENGTH_MIN_PX) * 0.65;
  return clamp(s, 0, 1);
}

const DEFAULT_BINDS = {
  throttleUp: 'KeyW',
  throttleDown: 'KeyS',
  turnLeft: 'KeyA',      // 原 ArrowLeft(任务书 21)
  turnRight: 'KeyD',     // 原 ArrowRight(任务书 21)
  rollLeft: 'KeyA',
  rollRight: 'KeyD',
  dash: 'KeyE',
  afterburn: 'ShiftLeft',
  gun: 'Space',          // 原 mouse0(任务书 21)
  missile: 'KeyV',       // 原 mouse2(任务书 21)
  pause: 'KeyP',
  mute: 'KeyM',
  confirm: 'Enter',
  menu: 'Escape'
};

let keybinds = loadKeybinds();
let captureBind = null;
let settingsScrollY = 0;
const settingsDrag = { id: null, startX: 0, startY: 0, lastY: 0, moved: false };

function loadKeybinds() {
  const base = Object.assign({}, DEFAULT_BINDS);
  try {
    const raw = localStorage.getItem('skyfire_keybinds');
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch (err) { /* storage unavailable */ }
  return base;
}

function saveKeybinds() {
  try { localStorage.setItem('skyfire_keybinds', JSON.stringify(keybinds)); } catch (err) { /* storage unavailable */ }
}

function bindFor(action) {
  return keybinds[action] || DEFAULT_BINDS[action];
}

function codeFromEvent(e) {
  return e.code || (e.key ? e.key.toUpperCase() : '');
}

const MOUSE_BUTTON_LABELS = ['左键', '中键', '右键', '侧键1', '侧键2'];

function mouseCodeFromButton(button) {
  return Number.isInteger(button) && button >= 0 && button < MOUSE_BUTTON_LABELS.length ? 'mouse' + button : '';
}

function mouseButtonFromCode(code) {
  const match = /^mouse(\d+)$/.exec(code || '');
  if (!match) return -1;
  const button = Number(match[1]);
  return button >= 0 && button < MOUSE_BUTTON_LABELS.length ? button : -1;
}

function setMouseButtonState(button, down) {
  if (!mouseCodeFromButton(button)) return false;
  input.mouse.buttons = input.mouse.buttons || {};
  input.mouse.buttons[button] = !!down;
  if (button === 0) input.mouse.down = !!down;
  if (button === 1) input.mouse.mid = !!down;
  if (button === 2) input.mouse.rdown = !!down;
  return true;
}

function clearMouseButtonState() {
  input.mouse.down = false;
  input.mouse.mid = false;
  input.mouse.rdown = false;
  input.mouse.buttons = {};
}

function prettyKey(code) {
  const mouseButton = mouseButtonFromCode(code);
  if (mouseButton >= 0) return MOUSE_BUTTON_LABELS[mouseButton];
  if (!code) return '未设置';
  const map = {
    KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyP: 'P', KeyM: 'M',
    Enter: 'Enter', Escape: 'Esc', Space: '空格', ShiftLeft: 'Shift', ShiftRight: '右Shift',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
  };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

function isActionDown(action) {
  const code = bindFor(action);
  const mouseButton = mouseButtonFromCode(code);
  if (mouseButton === 0) return input.mouse.down;
  if (mouseButton === 1) return input.mouse.mid;
  if (mouseButton === 2) return input.mouse.rdown;
  if (mouseButton >= 3) return !!input.mouse.buttons[mouseButton];
  return !!input.keys[code];
}

function isBound(code, action) {
  return bindFor(action) === code;
}

function updateTouchRects() {
  // P33 单一布局源: 命中缓存全部取自 hudRects()(与绘制/断言同源, 禁两套坐标)
  const hr = hudRects();
  MSL_RECT.x = hr.msl.x; MSL_RECT.y = hr.msl.y; MSL_RECT.w = hr.msl.w; MSL_RECT.h = hr.msl.h;
  THROTTLE_BAR.x = hr.throttle.x; THROTTLE_BAR.y = hr.throttle.y; THROTTLE_BAR.w = hr.throttle.w; THROTTLE_BAR.h = hr.throttle.h;
  DASH_RECT.x = hr.dash.x; DASH_RECT.y = hr.dash.y; DASH_RECT.w = hr.dash.w; DASH_RECT.h = hr.dash.h;
  PAUSE_BTN.x = hr.pauseBtn.x; PAUSE_BTN.y = hr.pauseBtn.y; PAUSE_BTN.w = hr.pauseBtn.w; PAUSE_BTN.h = hr.pauseBtn.h;
}
updateTouchRects();

// P33 单一布局源 hudRects(): 绘制(drawHUD/drawWingmanHud)、命中(updateTouchRects 缓存)、布局断言三方共用同一套矩形。
// 安全区边距 mt/mr/mb/ml = max(16, CSS env(safe-area-inset-*)), 无安全区设备与历史 16px 布局逐像素一致。
function hudRects() {
  // 加载期 resize() 早于 const input 声明, TDZ 下 typeof 亦抛错 → try/catch 兜底为桌面布局(load 时仅缓存油门/导弹/暂停, 三者与 isTouch 无关)
  let isTouch = false;
  try { isTouch = !!(typeof input !== 'undefined' && input.isTouch); } catch (err) { isTouch = false; }
  const portraitTouch = isTouch && W < H;
  const s = Math.min(W, H);
  const hudScale = Math.min(1, Math.max(0.8, s / 900));
  const mt = Math.max(HUD_MARGIN_MIN, SAFE.top);
  const mr = Math.max(HUD_MARGIN_MIN, SAFE.right);
  const mb = Math.max(HUD_MARGIN_MIN, SAFE.bottom);
  const ml = Math.max(HUD_MARGIN_MIN, SAFE.left);
  const R = (x, y, w, h) => ({ x, y, w, h });
  // 左上任务面板(P38: 删模式标题行, 高度收窄; 内容=任务时间+击杀数, 战役另加目标/进度)
  const missionPanel = R(ml, mt,
    portraitTouch ? Math.min(154, W * 0.43) : (isTouch ? Math.min(288 * hudScale, W * HUD_MISSION_WIDTH) : 288 * hudScale),
    80 * hudScale);
  // 僚机 HUD 面板(预留 2 行槽位, 实际行数由 drawWingmanHud 决定; P26 位置语义不变, 位置公式旧门禁锁定)
  const wingY = portraitTouch ? H - mb - 116 : (isTouch ? Math.max(mt + 96, H * 0.18) : mt + 96);
  const wingmanPanel = R(portraitTouch ? ml - 6 : 18 - 8, wingY - 8, 184 + 16, HUD_WINGMAN_ROWS * 28 + 10);
  // 触屏控件: 油门条(右缘竖条)、导弹键(右下)、暂停按钮(上方安全区独立控制槽, 优先右上)
  const tbW = portraitTouch ? 36 : Math.max(28, Math.min(44, Math.round(W * 0.0225)));
  const tbH = portraitTouch ? Math.round(H * 0.34) : Math.round(H * 0.34);
  const throttle = portraitTouch
    ? R(W - mr - tbW - 12, Math.round(H * 0.32), tbW, tbH)
    : R(W - mr - tbW - 18, Math.round(H * 0.30), tbW, tbH);
  const mslW = portraitTouch ? 104 : Math.max(90, s * 0.24);
  const mslH = portraitTouch ? 92 : Math.max(70, s * 0.18);
  const speedAltBox = portraitTouch
    ? R(W - mr - 132, throttle.y + throttle.h + HUD_CONTROL_GAP, 132, 28)
    : (isTouch
        ? R(Math.min(throttle.x + throttle.w, W - mr) - Math.max(128, 132 * hudScale),
            throttle.y + throttle.h + HUD_CONTROL_GAP, Math.max(128, 132 * hudScale), Math.max(28, 22 * hudScale))
        : null);
  const msl = portraitTouch
    ? R(W - mr - mslW, speedAltBox.y + speedAltBox.h + 10, mslW, mslH)
    : R(W - mr - mslW - 10, H - mb - mslH - 14, mslW, mslH);
  const pauseSize = portraitTouch ? 52 : PAUSE_BTN_SIZE;
  const pauseBtn = R(W - mr - pauseSize, mt, pauseSize, pauseSize);
  const dashSize = portraitTouch ? 54 : 48;
  const dash = portraitTouch
    ? R(Math.max(ml, throttle.x - dashSize - 10), throttle.y - dashSize - 12, dashSize, dashSize)
    : R(throttle.x + throttle.w / 2 - dashSize / 2, throttle.y - dashSize - 10, dashSize, dashSize);
  // 右上分数/击坠/复活文字右缘: 触屏让出暂停槽
  const scoreRight = isTouch ? W - mr - pauseSize - HUD_CONTROL_GAP : W - mr;
  // 左下窗口: 无尽=经验窗(Lv/经验/武器); 桌面战役=导弹/速度/高度+油门表; 触屏战役不画
  const touchStatusH = portraitTouch ? 42 : Math.max(64, 64 * hudScale);
  const statusPanel = portraitTouch
    ? R(ml, H - mb - touchStatusH, Math.min(228, W * 0.58), touchStatusH)
    : R(ml, isTouch ? H - mb - 44 * hudScale - touchStatusH : H - mb - 108 * hudScale,
        262 * hudScale, isTouch ? touchStatusH : 96 * hudScale);
  // 雷达(P38: 面积-50%命名常量; 桌面保留右下, 触屏移左上: 竖屏=僚机槽下, 横屏=任务面板下僚机槽右侧)
  const radarR = Math.max(92, s * 0.145) * Math.sqrt(RADAR_AREA_SCALE) * (isTouch ? HUD_RADAR_SCALE_P40 : 1);
  let rx, ry;
  if (!isTouch) {
    rx = W - mr - radarR;
    ry = H - mb - radarR;
  } else if (W >= H) {
    rx = wingmanPanel.x + wingmanPanel.w + HUD_CONTROL_GAP + radarR;
    ry = missionPanel.y + missionPanel.h + HUD_CONTROL_GAP + radarR;
  } else {
    rx = ml + radarR;
    ry = portraitTouch
      ? missionPanel.y + missionPanel.h + HUD_CONTROL_GAP + radarR
      : wingmanPanel.y + wingmanPanel.h + HUD_CONTROL_GAP + radarR;
  }
  const radar = { x: rx, y: ry, r: radarR };
  // 血量窗口(P38: 移到顶部中央; 桌面=任务面板下, 触屏=僚机槽下/雷达右侧)
  const hwW = Math.min(360, W * 0.5) + 16;
  const portraitHpW = Math.min(150, Math.max(96, 2 * (msl.x - HUD_CONTROL_GAP - W / 2)));
  const portraitHpY = portraitTouch
    ? Math.max(H * CAM_ANCHOR_Y + 64, speedAltBox.y + speedAltBox.h + HUD_CONTROL_GAP)
    : 0;
  const hpWin = portraitTouch
    ? R(W / 2 - portraitHpW / 2, portraitHpY, portraitHpW, 22)
    : isTouch
    ? R(radar.x + radar.r + HUD_CONTROL_GAP, wingmanPanel.y + wingmanPanel.h + HUD_CONTROL_GAP,
        Math.min(360, throttle.x - HUD_CONTROL_GAP - (radar.x + radar.r + HUD_CONTROL_GAP)), 24 * hudScale)
    : R(W / 2 - hwW / 2, missionPanel.y + missionPanel.h + 16 * hudScale, hwW, 24 * hudScale);
  const weaponX = portraitTouch ? radar.x + radar.r + HUD_CONTROL_GAP : statusPanel.x;
  const weaponRight = portraitTouch ? throttle.x - HUD_CONTROL_GAP : statusPanel.x + statusPanel.w;
  const weaponY = portraitTouch ? Math.max(radar.y + radar.r + 24, dash.y + dash.h + 12) : statusPanel.y;
  const weaponPanel = portraitTouch
    ? R(weaponX, weaponY, Math.max(112, weaponRight - weaponX), 30)
    : R(statusPanel.x, statusPanel.y, statusPanel.w, 30);
  const buffStack = portraitTouch
    ? { x: pauseBtn.x, y: pauseBtn.y + pauseBtn.h + 8, w: pauseBtn.w, h: 22, gap: 5 }
    : { x: scoreRight - 68 * hudScale, y: mt + 64 * hudScale, w: 68 * hudScale, h: 24 * hudScale, gap: 8 * hudScale };
  const warningLane = portraitTouch
    ? R(Math.max(ml, W / 2 - 82), weaponPanel.y + weaponPanel.h + 16, 164, 30)
    : R(W / 2 - 100, H * 0.27, 200, 34);
  const threatRing = portraitTouch ? { x: W / 2, y: H * CAM_ANCHOR_Y, r: 52 } : null;
  // 限时操作提示: 优先使用左下状态窗与导弹键之间的横向空间; 窄屏回退到两者上方。
  const hintH = 48 * hudScale;
  const hintSideX = statusPanel.x + statusPanel.w + HUD_CONTROL_GAP;
  const hintSideRight = msl.x - HUD_CONTROL_GAP;
  const hintSideW = hintSideRight - hintSideX;
  let hintBox;
  if (portraitTouch) {
    const hintW = Math.min(264, throttle.x - HUD_CONTROL_GAP - ml);
    hintBox = R(ml, warningLane.y + warningLane.h + 10, hintW, hintH);
  } else if (isTouch && hintSideW >= 150) {
    const hintW = Math.min(330 * hudScale, hintSideW);
    hintBox = R(hintSideX, H - mb - hintH, hintW, hintH);
  } else if (isTouch) {
    const hintW = Math.min(330 * hudScale, W - ml - mr);
    const hintX = clamp(W / 2 - hintW / 2, ml, W - mr - hintW);
    const hintBottom = Math.min(msl.y, statusPanel.y) - HUD_CONTROL_GAP;
    hintBox = R(hintX, hintBottom - hintH, hintW, hintH);
  } else {
    const radarLeft = radar.x - radar.r;
    const hintLeft = statusPanel.x + statusPanel.w + HUD_CONTROL_GAP;
    const hintRight = radarLeft - HUD_CONTROL_GAP;
    const hintW = Math.min(420 * hudScale, Math.max(150, hintRight - hintLeft));
    hintBox = R(clamp(W / 2 - hintW / 2, ml, W - mr - hintW), H - mb - hintH, hintW, hintH);
  }
  return { mt, mr, mb, ml, hudScale, portraitTouch, missionPanel, wingmanPanel, throttle, msl, dash, pauseBtn, scoreRight, statusPanel, radar, hpWin, speedAltBox, weaponPanel, buffStack, warningLane, threatRing, hintBox };
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * W / rect.width,
    y: (clientY - rect.top) * H / rect.height
  };
}

function screenPosFromEvent(e) {
  return canvasPointFromClient(e.clientX, e.clientY);
}

function combatTouchControlsActive() {
  return GAME.state === 'playing' && !upgradeChoice &&
    !(typeof ChapterCard !== 'undefined' && ChapterCard.isActive());
}

canvas.addEventListener('mousemove', (e) => {
  const p = screenPosFromEvent(e);
  input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.movedAt = performance.now() / 1000;
  if (input.isTouch) {
    input.isTouch = false;
    updateTouchRects();
  }
  if (upgradeChoice && GAME.state === 'playing') {
    const layout = upgradeChoiceLayout();
    for (let i = 0; i < layout.cards.length; i++) {
      if (inRect(p.x, p.y, layout.cards[i])) upgradeChoiceSel = i;
    }
    if (inRect(p.x, p.y, layout.skip)) upgradeChoiceSel = 3;
  }
});
canvas.addEventListener('mousedown', (e) => {
  AudioSys.init(); AudioSys.resume();
  const p = screenPosFromEvent(e);
  const mouseCode = mouseCodeFromButton(e.button);
  if (mouseCode) e.preventDefault();
  input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.movedAt = performance.now() / 1000;
  if (captureBind && GAME.state === 'settings' && mouseCode) {
    completeBindCapture(mouseCode);
    return;
  }
  const consumed = handleCanvasPress(p.x, p.y);
  if (!consumed && mouseCode) {
    setMouseButtonState(e.button, true);
    handleBoundPress(mouseCode, false, 'mouse');
  }
});
window.addEventListener('mouseup', (e) => {
  setMouseButtonState(e.button, false);
  input.fireHeld = false; input.mslHeld = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('auxclick', (e) => e.preventDefault());

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  AudioSys.init(); AudioSys.resume();
  if (!input.isTouch) {
    input.isTouch = true;
    updateTouchRects();
  }
  const combatControls = combatTouchControlsActive();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const p = canvasPointFromClient(t.clientX, t.clientY);
    const x = p.x, y = p.y;
    if (GAME.state === 'settings') {
      if (settingsDrag.id === null) {
        captureBind = null;
        settingsDrag.id = t.identifier;
        settingsDrag.startX = x;
        settingsDrag.startY = y;
        settingsDrag.lastY = y;
        settingsDrag.moved = false;
      }
    } else if (combatControls && !input.touch.pauseId && inRect(x, y, PAUSE_BTN)) {
      // 触屏暂停按钮(P33): 上方安全区独立控制槽; 触点被消费, 不透传开火/导弹/转向
      input.touch.pauseId = t.identifier;
    } else if (combatControls && !input.touch.throttleBarId && inRect(x, y, THROTTLE_BAR)) {
      // 油门拖动条(任务书 21):独立手指,按触点 Y 直接映射(条顶=1、条底=0)
      input.touch.throttleBarId = t.identifier;
      player.throttle = clamp(1 - (y - THROTTLE_BAR.y) / THROTTLE_BAR.h, 0, 1);
    } else if (combatControls && GAME.dash && !input.touch.dashId && inRect(x, y, DASH_RECT)) {
      input.touch.dashId = t.identifier;
      tryDash();
    } else if (combatControls && !input.touch.mslId && inRect(x, y, MSL_RECT)) {
      // 手机导弹键为自动发射开关；锁定进度始终独立计算。
      input.touch.mslId = t.identifier;
      input.touch.mslStartX = x;
      input.touch.mslStartY = y;
      input.mslHeld = false;
    } else if (!input.touch.swipeId) {
      // 手势指:记录起点,不再模拟鼠标(任务书 20)
      input.touch.swipeId = t.identifier;
      touchSwipe.startX = x; touchSwipe.startY = y;
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const p = canvasPointFromClient(t.clientX, t.clientY);
    if (t.identifier === settingsDrag.id && GAME.state === 'settings') {
      const dy = p.y - settingsDrag.lastY;
      if (Math.abs(p.y - settingsDrag.startY) > 8) settingsDrag.moved = true;
      settingsScrollY = clamp(settingsScrollY - dy, 0, settingsMaxScroll());
      settingsDrag.lastY = p.y;
    } else if (t.identifier === input.touch.throttleBarId) {
      // 油门拖动条:持续按触点 Y 映射(条顶=1、条底=0,任务书 21)
      const y = p.y;
      player.throttle = clamp(1 - (y - THROTTLE_BAR.y) / THROTTLE_BAR.h, 0, 1);
    } else if (t.identifier === input.touch.swipeId) {
      const x = p.x, y = p.y;
      const dx = x - touchSwipe.startX, dy = y - touchSwipe.startY;
      // 只认水平主轴:|dx|>|dy| 且 |dx|>阈值 才激活转向;垂直滑动不激活任何动作(任务书 21)
      if (Math.abs(dx) > SWIPE_THRESH && Math.abs(dx) > Math.abs(dy)) {
        touchSwipe.dir = dx < 0 ? 'left' : 'right';
        touchSwipe.active = true;
        touchSwipe.strength = steerStrengthFromPx(Math.abs(dx)); // P34.1: 连续强度(实时跟随滑动距离)
      } else if (touchSwipe.active) {
        // 位移回到阈值内 → 取消激活
        touchSwipe.active = false;
        touchSwipe.dir = null;
        touchSwipe.strength = 0;
      }
    }
  }
}, { passive: false });

// 完成一次手势(任务书 20):同向双滑(间隔 < SWIPE_DOUBLE_GAP)→ 滚筒;否则记录 lastDir
function completeSwipe() {
  const now = performance.now() / 1000;
  const dir = touchSwipe.dir;
  if (touchSwipe.active && dir) {
    if (dir === touchSwipe.lastDir && now - touchSwipe.lastT < SWIPE_DOUBLE_GAP) {
      tryBarrelRoll(dir === 'left' ? 'left' : 'right');
      touchSwipe.lastDir = null; // 防三连
    } else {
      touchSwipe.lastDir = dir;
      touchSwipe.lastT = now;
    }
  } else {
    // 轻点(未达滑动阈值):菜单/界面交互;playing 内 handleCanvasPress 为 no-op
    handleCanvasPress(touchSwipe.startX, touchSwipe.startY);
  }
  touchSwipe.active = false;
  touchSwipe.dir = null;
  touchSwipe.strength = 0;
}

function endTouch(e) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const id = t.identifier;
    if (id === settingsDrag.id) {
      const p = canvasPointFromClient(t.clientX, t.clientY);
      if (!settingsDrag.moved && e.type !== 'touchcancel' && GAME.state === 'settings') handleSettingsPress(p.x, p.y);
      settingsDrag.id = null;
      settingsDrag.moved = false;
      continue;
    }
    if (id === input.touch.pauseId) { input.touch.pauseId = null; requestPause('touch'); }
    if (id === input.touch.mslId) {
      const p = canvasPointFromClient(t.clientX, t.clientY);
      const moved = Math.hypot(p.x - input.touch.mslStartX, p.y - input.touch.mslStartY);
      if (e.type !== 'touchcancel' && moved <= 18 && inRect(p.x, p.y, MSL_RECT)) {
        input.missileAuto = !input.missileAuto;
        AudioSys.click();
      }
      input.touch.mslId = null;
      input.mslHeld = false;
    }
    if (id === input.touch.dashId) { input.touch.dashId = null; }
    if (id === input.touch.throttleBarId) { input.touch.throttleBarId = null; } // 松手保持当前油门(任务书 21)
    if (id === input.touch.swipeId) {
      input.touch.swipeId = null;
      completeSwipe();
    }
  }
}
canvas.addEventListener('touchend', endTouch, { passive: false });
canvas.addEventListener('touchcancel', endTouch, { passive: false });
canvas.addEventListener('wheel', (e) => {
  if (GAME.state !== 'settings') return;
  e.preventDefault();
  settingsScrollY = clamp(settingsScrollY + e.deltaY, 0, settingsMaxScroll());
}, { passive: false });

function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function handleBoundPress(code, repeat, source) {
  if (isBound(code, 'mute') && !repeat) {
    AudioSys.toggleMute();
    if (typeof MusicSys !== 'undefined' && MusicSys.toggleMute) MusicSys.toggleMute();
  }
  const menuHit = isBound(code, 'menu');
  const pauseHit = isBound(code, 'pause');
  if (menuHit && !repeat && GAME.state === 'playing' && upgradeChoice) {
    skipUpgradeChoice();
  } else if ((pauseHit || menuHit) && !repeat) {
    if (GAME.state === 'playing') requestPause(source);
    else if (GAME.state === 'paused') requestResume();
  }
  if (isBound(code, 'confirm') && !repeat) handleConfirmKey();
  if (!repeat && GAME.state === 'playing' && (isBound(code, 'turnLeft') || isBound(code, 'turnRight'))) {
    const now = performance.now() / 1000;
    const dir = isBound(code, 'turnLeft') ? 'left' : 'right';
    if (player.lastDirTap && player.lastDirTap.dir === dir && now - player.lastDirTap.t < KEY_TAP_DOUBLE_GAP) {
      tryBarrelRoll(dir);
      player.lastDirTap = { dir: null, t: -99 };
    } else {
      player.lastDirTap = { dir, t: now };
    }
  }
}

window.addEventListener('keydown', (e) => {
  AudioSys.init(); AudioSys.resume();
  const code = codeFromEvent(e);
  if (captureBind && GAME.state === 'settings') {
    e.preventDefault();
    if (code === 'Escape') {
      captureBind = null;
      return;
    }
    completeBindCapture(code);
    return;
  }
  if (controlSchemeAsk && GAME.state === 'playing') {
    // P36: 询问期间键盘导航(左右箭头移动高亮, 回车/空格确认; 其余键不响应, 防误触暂停/滚筒)
    e.preventDefault();
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      controlSchemeAskSel = code === 'ArrowLeft' ? 0 : 1;
      AudioSys.click();
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      chooseControlScheme(controlSchemeAskSel === 0 ? 'keyboard+mouse' : 'keyboard-only');
    }
    return;
  }
  if (upgradeChoice && GAME.state === 'playing' && !input.isTouch) {
    const moveLeft = code === 'KeyA' || code === 'ArrowLeft';
    const moveRight = code === 'KeyD' || code === 'ArrowRight';
    if (moveLeft || moveRight) {
      e.preventDefault();
      if (!e.repeat) {
        upgradeChoiceSel = (upgradeChoiceSel + (moveLeft ? 3 : 1)) % 4;
        AudioSys.click();
      }
      return;
    }
    if (code === 'Space') {
      e.preventDefault();
      if (!e.repeat) confirmUpgradeChoiceSelection();
      return;
    }
  }
  input.keys[code] = true;
  input.keys[e.key.toLowerCase()] = true;
  if (code === 'Space') e.preventDefault();
  handleBoundPress(code, e.repeat, 'keyboard');
});
window.addEventListener('keyup', (e) => {
  const code = codeFromEvent(e);
  input.keys[code] = false;
  input.keys[e.key.toLowerCase()] = false;
});
window.addEventListener('blur', () => { requestPause('blur'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) requestPause('visibility');
});
