
'use strict';

// ---------- canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

// 触屏 UI 几何容器:声明须在 resize() 首次调用前(updateTouchRects 由 resize 触发,任务书 21)
const MSL_RECT = { x: 0, y: 0, w: 0, h: 0 };
const THROTTLE_BAR = { x: 0, y: 0, w: 36, h: 0 };
const DASH_RECT = { x: 0, y: 0, w: 0, h: 0 };
// ---------- P33 安全区 + 触屏暂停常量 ----------
const SAFE = { top: 0, right: 0, bottom: 0, left: 0 };
const PAUSE_BTN_SIZE = 48;   // 触屏暂停按钮命中框(硬下限 44, 推荐 48; 可调)
const PAUSE_BTN = { x: 0, y: 0, w: PAUSE_BTN_SIZE, h: PAUSE_BTN_SIZE };
const HUD_CONTROL_GAP = 8;   // 可触控件最小间隔(>=8 CSS px; 可调)
const HUD_MARGIN_MIN = 16;   // 安全区边距下限(无安全区设备保持历史 16px)
const HUD_WINGMAN_ROWS = 2;  // 僚机 HUD 布局预留行(= WINGMAN_LAYOUT.hudMaxRows)
// ---------- P38 HUD 重整常量 ----------
const RADAR_AREA_SCALE = 0.5;   // 雷达面积缩放(可调; 0.5=面积减半→半径×√0.5)
const RADAR_MARKER_SCALE = 0.75; // P40: 雷达缩小后提高标记可读性
const HUD_PANEL_FILL = 'rgba(6,14,24,0.80)';
const HUD_PANEL_STROKE = 'rgba(180,210,230,0.32)';
const HUD_PANEL_RADIUS = 8;
const HUD_MISSION_WIDTH = 0.48;
const HUD_RADAR_SCALE_P40 = 0.75;
const HUD_CRITICAL_FONT_MIN = 12;
function safeInsets() {
  return SAFE;   // 缓存值: 仅在 resize/orientationchange/visualViewport 变化时刷新(禁逐帧 getComputedStyle)
}
function refreshSafeInsets() {
  const cs = getComputedStyle(document.documentElement);
  const px = (name) => { const n = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(n) && n > 0 ? n : 0; };
  SAFE.top = px('--sat'); SAFE.right = px('--sar'); SAFE.bottom = px('--sab'); SAFE.left = px('--sal');
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  refreshSafeInsets(); // P33: 安全区缓存刷新(读 CSS env(safe-area-inset-*), 禁逐帧 getComputedStyle)
  updateTouchRects(); // 触屏按钮/油门条/暂停按钮几何跟随屏幕(任务书 21/33)
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
if (window.visualViewport) {
  visualViewport.addEventListener('resize', resize);
  visualViewport.addEventListener('scroll', refreshSafeInsets); // 仅刷新安全区缓存, 避免滚动触发全量画布重排
}
resize();

// ---------- utils ----------
const TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
// ---------- P31 近距命中扫掠(几何纯函数, 无对象分配) ----------
// 线段(x0,y0)->(x1,y1)与圆(cx,cy,r): 返回最近命中比例 t∈[0,1], 无交返回 null。
// 起点在圆内(含边界)返回 0; 零长度线段退化为点测试; 擦边(disc=0)仍返回有效 t。
function segmentCircleHitT(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (a === 0) return c <= 0 ? 0 : null;   // 零长度线段: 点测试
  if (c <= 0) return 0;                    // 起点在圆内/圆上
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;               // 无交
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);             // 最近交点
  if (t < 0) t = (-b + sq) / (2 * a);      // 起点圆外且线段整体位于圆前 → 远交点(必 <0 → null)
  return (t >= 0 && t <= 1) ? t : null;
}
function segmentHitsCircle(x0, y0, x1, y1, cx, cy, r) {
  return segmentCircleHitT(x0, y0, x1, y1, cx, cy, r) !== null;
}
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
