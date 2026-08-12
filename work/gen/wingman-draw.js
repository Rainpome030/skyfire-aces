'use strict';

// P25 僚机视觉纯片段。浏览器集成时依赖主文件已有全局 ctx / W / H。
// drawWingmanJet 在调用方已 translate/rotate 后的局部坐标中绘制，机头朝 +x。
const WINGMAN_COLORS = Object.freeze({
  teal: '#55e6c1',
  gold: '#ffd166',
  dark: '#123c3a',
  canopy: '#163a55',
  transport: '#4ecb71',
  danger: '#ff6b6b',
  panel: 'rgba(6,20,24,0.72)'
});

const WINGMAN_LAYOUT = Object.freeze({
  jetNoseX: 31,
  jetTailX: -25,
  jetHalfSpan: 23,
  radarSize: 6,
  hudWidth: 184,
  hudBarHeight: 10,
  hudGap: 7,
  hudMaxRows: 2,
  smokeHpRatio: 0.35
});

function wingmanClamp01(value) {
  value = Number(value);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function wingmanHpRatio(w) {
  if (!w || !(Number(w.maxHp) > 0)) return 0;
  return wingmanClamp01(Number(w.hp) / Number(w.maxHp));
}

// 低血量烟迹接口：更新/粒子系统可读取两个局部喷口并转换到世界坐标。
function getWingmanSmokePorts(w) {
  if (wingmanHpRatio(w) > WINGMAN_LAYOUT.smokeHpRatio) return [];
  return [
    { x: -22, y: -5, color: 'rgba(64,82,78,0.72)' },
    { x: -22, y: 5, color: 'rgba(64,82,78,0.72)' }
  ];
}

function drawWingmanJet(w) {
  w = w || {};
  const hpRatio = wingmanHpRatio(w);
  const flash = wingmanClamp01(w.hitFlash);

  ctx.save();
  try {
    ctx.globalAlpha = Number.isFinite(Number(w.alpha)) ? wingmanClamp01(w.alpha) : 1;
    ctx.shadowBlur = 0;

    // 短后掠翼：刻意区别于自机的长翼轮廓。
    ctx.fillStyle = WINGMAN_COLORS.teal;
    ctx.strokeStyle = WINGMAN_COLORS.dark;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(8, -5);
    ctx.lineTo(-2, -20);
    ctx.lineTo(-15, -23);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-22, -10);
    ctx.lineTo(-18, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 5);
    ctx.lineTo(-2, 20);
    ctx.lineTo(-15, 23);
    ctx.lineTo(-11, 8);
    ctx.lineTo(-22, 10);
    ctx.lineTo(-18, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 金色菱形翼尖。
    ctx.fillStyle = WINGMAN_COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(-2, -20); ctx.lineTo(-9, -25); ctx.lineTo(-15, -23); ctx.lineTo(-9, -18);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, 20); ctx.lineTo(-9, 25); ctx.lineTo(-15, 23); ctx.lineTo(-9, 18);
    ctx.closePath(); ctx.fill();

    // 细长六边形机身。
    ctx.fillStyle = WINGMAN_COLORS.teal;
    ctx.strokeStyle = WINGMAN_COLORS.dark;
    ctx.beginPath();
    ctx.moveTo(31, 0);
    ctx.lineTo(10, -6);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-25, -3);
    ctx.lineTo(-25, 3);
    ctx.lineTo(-18, 6);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 双垂尾（俯视投影为两片独立梯形）。
    ctx.fillStyle = WINGMAN_COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(-10, -5); ctx.lineTo(-18, -13); ctx.lineTo(-23, -11); ctx.lineTo(-19, -4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, 5); ctx.lineTo(-18, 13); ctx.lineTo(-23, 11); ctx.lineTo(-19, 4);
    ctx.closePath(); ctx.fill();

    // 座舱与中轴金线。
    ctx.fillStyle = WINGMAN_COLORS.canopy;
    ctx.beginPath();
    ctx.ellipse(8, 0, 8, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = WINGMAN_COLORS.gold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(25, 0); ctx.lineTo(-17, 0);
    ctx.stroke();

    // 受击闪烁：由 hitFlash(0..1) 驱动，不依赖时间全局。
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.72;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(31, 0); ctx.lineTo(7, -8); ctx.lineTo(-18, -6);
      ctx.lineTo(-25, 0); ctx.lineTo(-18, 6); ctx.lineTo(7, 8);
      ctx.closePath(); ctx.fill();
    }

    // 低血量状态灯；烟粒子位置由 getWingmanSmokePorts 提供。
    if (hpRatio <= WINGMAN_LAYOUT.smokeHpRatio) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = WINGMAN_COLORS.danger;
      ctx.beginPath(); ctx.arc(-15, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  } finally {
    ctx.restore();
  }
}

// 在已换算好的雷达屏幕坐标绘制标记。
// kind='transport' 保持旧版绿色方块；其余僚机为青绿菱形，heading 可选。
function drawWingmanRadarBlip(x, y, size, kind, heading) {
  if (x && typeof x === 'object') {
    const o = x;
    x = o.x; y = o.y; size = o.size; kind = o.kind; heading = o.heading;
  }
  x = Number(x) || 0;
  y = Number(y) || 0;
  size = Math.max(3, Number(size) || WINGMAN_LAYOUT.radarSize);

  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (kind === 'transport') {
      ctx.fillStyle = WINGMAN_COLORS.transport;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      return;
    }
    ctx.translate(x, y);
    if (Number.isFinite(Number(heading))) ctx.rotate(Number(heading));
    ctx.fillStyle = WINGMAN_COLORS.teal;
    ctx.strokeStyle = WINGMAN_COLORS.gold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(0, -size * 0.72);
    ctx.lineTo(-size, 0);
    ctx.lineTo(0, size * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } finally {
    ctx.restore();
  }
}

function wingmanRoundRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 右上角最多两条紧凑僚机血条；运输机仍由主 HUD 负责。
function drawWingmanHud(allies) {
  const list = Array.isArray(allies)
    ? allies.filter(function (a) { return a && !a.dead && a.kind !== 'transport'; }).slice(0, WINGMAN_LAYOUT.hudMaxRows)
    : [];
  if (!list.length) return 0;

  const width = WINGMAN_LAYOUT.hudWidth;
  const barH = WINGMAN_LAYOUT.hudBarHeight;
  const rowH = 28;
  const x = Math.max(12, (Number(W) || 0) - width - 18);
  const y = 18;

  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = WINGMAN_COLORS.panel;
    wingmanRoundRect(x - 8, y - 8, width + 16, list.length * rowH + 10, 7);
    ctx.fill();

    list.forEach(function (a, index) {
      const yy = y + index * rowH;
      const ratio = wingmanHpRatio(a);
      const label = String(a.name || ('僚机 ' + (index + 1))).slice(0, 12);
      ctx.font = '600 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = WINGMAN_COLORS.teal;
      ctx.fillText(label, x, yy + 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = ratio <= WINGMAN_LAYOUT.smokeHpRatio ? WINGMAN_COLORS.danger : WINGMAN_COLORS.gold;
      ctx.fillText(Math.round(ratio * 100) + '%', x + width, yy + 9);

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      wingmanRoundRect(x, yy + 13, width, barH, 3);
      ctx.fill();
      ctx.fillStyle = ratio <= WINGMAN_LAYOUT.smokeHpRatio ? WINGMAN_COLORS.danger : WINGMAN_COLORS.teal;
      wingmanRoundRect(x, yy + 13, width * ratio, barH, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.5)';
      ctx.lineWidth = 1;
      wingmanRoundRect(x, yy + 13, width, barH, 3);
      ctx.stroke();
    });
  } finally {
    ctx.restore();
  }
  return list.length;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WINGMAN_COLORS,
    WINGMAN_LAYOUT,
    wingmanHpRatio,
    getWingmanSmokePorts,
    drawWingmanJet,
    drawWingmanRadarBlip,
    drawWingmanHud
  };
}
