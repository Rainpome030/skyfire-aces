// ---------- P26 僚机视觉（吸收 P25，HUD 安全区适配） ----------
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
    ? allies.filter(function (a) { return a && !a.dead && a.kind === 'wingman'; }).slice(0, WINGMAN_LAYOUT.hudMaxRows)
    : [];
  if (!list.length) return 0;

  const width = WINGMAN_LAYOUT.hudWidth;
  const barH = WINGMAN_LAYOUT.hudBarHeight;
  const rowH = 28;
  const hr = hudRects();   // P33: 僚机 HUD 位置取单一布局源(x=18, y=mt+96 桌面 / max(mt+96,H*0.18) 触屏, P26 语义不变)
  const x = hr.wingmanPanel.x + 8;
  const y = hr.wingmanPanel.y + 8;

  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = HUD_PANEL_FILL;
    wingmanRoundRect(x - 8, y - 8, width + 16, list.length * rowH + 10, HUD_PANEL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = HUD_PANEL_STROKE;
    ctx.lineWidth = 1;
    wingmanRoundRect(x - 8, y - 8, width + 16, list.length * rowH + 10, HUD_PANEL_RADIUS);
    ctx.stroke();

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

function drawPlaneShape(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  if (p.kind === 'player' && p.rollActive) {
    const wing = Math.cos((p.rollT / p.rollDur) * TAU * p.rollDir);
    ctx.scale(1, Math.abs(wing) > 0.03 ? wing : 0.03);
  }
  ctx.scale(p.kind === 'transport' ? 1.25 : 1, 1);
  if (p.kind === 'player') {
    drawPlayerJet(p);
  } else if (p.kind === 'wingman') {
    drawWingmanJet(p);
  } else if (p.kind === 'transport') {
    drawTransportJet(p);
  } else if (p.kind === 'bomber') {
    drawBomberJet(p);
  } else if (p.kind === 'ace') {
    drawAceJet(p);
  } else if (p.kind === 'drone') {
    drawDroneJet(p);
  } else if (p.kind === 'kamikaze') {
    drawKamikazeJet(p);
  } else if (p.kind === 'interceptor') {
    drawInterceptorJet(p);
  } else if (p.kind === 'gunship') {
    drawGunshipJet(p);
  } else if (p.kind === 'eye') {
    drawEyeJet(p);
  } else if (p.kind === 'king') {
    drawKingJet(p);
  } else {
    drawFighterJet(p);
  }
  if (p.hitFlash > 0 && p.kind !== 'player' && p.kind !== 'wingman') {
    // P32: 敌机受击闪白立即消费(不等待聚合窗口); 白色圆光叠加, 强度随剩余时长衰减
    const ratio = clamp(p.hitFlash / ENEMY_HIT_FLASH, 0, 1);
    ctx.globalAlpha = 0.85 * ratio;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawWreckShape(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.heading);
  ctx.scale(p.kind === 'transport' ? 1.25 : 1, 1);
  if (p.kind === 'transport') drawTransportJet(p);
  else if (p.kind === 'bomber') drawBomberJet(p);
  else if (p.kind === 'ace') drawAceJet(p);
  else if (p.kind === 'gunship') drawGunshipJet(p);
  else if (p.kind === 'eye') drawEyeJet(p);
  else if (p.kind === 'king') drawKingJet(p);
  else drawFighterJet(p);

  const rnd = (salt) => {
    const x = Math.sin((p.seed + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const chunk = (cx, cy, radius, rot, salt) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + (rnd(salt) - 0.5) * 0.8);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const pts = 5 + Math.floor(rnd(salt + 9) * 3);
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const rr = radius * (0.55 + rnd(salt + i) * 0.75);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  ctx.globalCompositeOperation = 'destination-out';
  chunk(-13, -19, 13, 0.18, 1);
  chunk(-10, 20, 12, -0.22, 2);
  chunk(-2, 0, 8, 0.55, 3);
  if (rnd(4) > 0.35) chunk(25, 0, 8, -0.35, 4);
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(12,14,17,0.55)';
  ctx.beginPath();
  ctx.ellipse(-4, -2, 13, 3.5, 0.05, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(24,28,33,0.45)';
  ctx.beginPath();
  ctx.ellipse(10, 0, 8, 4, -0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,8,10,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-20, -10); ctx.lineTo(-8, -6); ctx.lineTo(2, -9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-14, 14); ctx.lineTo(-4, 8); ctx.lineTo(8, 12);
  ctx.stroke();
  ctx.restore();
}

// ============================================================
// 《苍穹之翼·单机空战》玩家战机造型 —— 初始机身 + 主题徽标
// 方案(v1.3 改版):三个新战机(重锤/迅雷/凤凰)不再使用独立造型,统一复用
// 初始战机(疾风 gale)的机身 drawGaleBody(p),仅在机身上叠加主题徽标区分:
//   重锤 hammer  → 盾牌徽标(橙 #ff9f43,重装感)
//   迅雷 bolt    → 闪电徽标(天蓝 #66d9ff,速度感)
//   凤凰 phoenix → 鹰头徽标(金 #f5c94c + 深红点缀 #d84a4a,王牌感)
// 机身主体与 gale 完全一致(灰蓝配色、线条),不整体变色。
//
// 对外全局(与主文件无冲突):
//   drawGaleBody(p)       —— 初始机身(由 drawPlayerJet 的 gale 分支原样抽取)
//   drawHammerJet(p)      —— drawGaleBody + drawShieldBadge
//   drawBoltJet(p)        —— drawGaleBody + drawLightningBadge
//   drawPhoenixJet(p)     —— drawGaleBody + drawEagleBadge
//
// 调用约定(由总控在 drawPlayerJet(p) 内分发):
//   被调用时 ctx 已 translate(p.x, p.y) + rotate(p.heading) 到机身局部坐标,
//   机头朝 +x,原点 = 机身中心;机身尺寸约 x ∈ [-44, 36], y ∈ [-26, 26]。
//   只画机身本体:尾焰、受击红闪、复活动画光晕均由总控通用层在分发前统一
//   处理(与 gale 共用),本文件不处理;徽标函数各自包在 save/restore 中,
//   不污染调用方渲染状态。函数签名 drawXxxJet(p),无返回值。
// ============================================================

'use strict';

// ---------- 初始机身(疾风 gale 机身,四战机共用) ----------
// 从 drawPlayerJet 的 gale 分支原样抽取(行为完全不变):灰蓝机身多边形 + 深色
// 描边 + 座舱 + 天蓝引擎环 + 尾翼红条;afterburn 时机身提亮为 #bfe3ff。
function drawGaleBody(p) {
  ctx.fillStyle = p.afterburn ? '#bfe3ff' : '#9db8c9';
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.lineTo(10, -5);
  ctx.lineTo(2, -8);
  ctx.lineTo(-10, -24);
  ctx.lineTo(-20, -26);
  ctx.lineTo(-28, -14);
  ctx.lineTo(-26, -4);
  ctx.lineTo(-38, -10);
  ctx.lineTo(-42, -17);
  ctx.lineTo(-44, -4);
  ctx.lineTo(-44, 4);
  ctx.lineTo(-42, 17);
  ctx.lineTo(-38, 10);
  ctx.lineTo(-26, 4);
  ctx.lineTo(-28, 14);
  ctx.lineTo(-20, 26);
  ctx.lineTo(-10, 24);
  ctx.lineTo(2, 8);
  ctx.lineTo(10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1d2b38';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#2c4356';
  ctx.beginPath();
  ctx.ellipse(11, 0, 9, 4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#66d9ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(18, 0, 3, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#e63e3e';
  ctx.fillRect(-6, -18, 3, 8);
  ctx.fillRect(-6, 10, 3, 8);
}

// ---------- 重锤:初始机身 + 盾牌徽标 ----------
function drawHammerJet(p) {
  drawGaleBody(p);
  drawShieldBadge(p);
}

// 盾牌徽标:画在机身背部中央(x≈-4,y≈0),小盾形轮廓(上沿平、两侧弧、底部尖)+
// 盾内深色十字。主色 #ff9f43(橙),描边深橙棕 #7a3d0a;半宽 5.5、高 10。
function drawShieldBadge(p) {
  ctx.save();
  ctx.translate(-4, 0);
  ctx.fillStyle = '#ff9f43';
  ctx.beginPath();
  ctx.moveTo(-5.5, -5);
  ctx.lineTo(5.5, -5);
  ctx.quadraticCurveTo(6.6, 0.5, 0, 5);
  ctx.quadraticCurveTo(-6.6, 0.5, -5.5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a3d0a';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#7a3d0a';
  ctx.fillRect(-1.3, -3.4, 2.6, 6.8);
  ctx.fillRect(-3.2, -1.3, 6.4, 2.6);
  ctx.restore();
}

// ---------- 迅雷:初始机身 + 闪电徽标 ----------
function drawBoltJet(p) {
  drawGaleBody(p);
  drawLightningBadge(p);
}

// 闪电徽标:画在机身背部(x≈-2,y≈0),折线闪电(3 段锯齿,宽 4.5 高 10.5),
// 主色 #66d9ff(天蓝),无描边(保持像素纯净)。
function drawLightningBadge(p) {
  ctx.save();
  ctx.translate(-2, 0);
  ctx.fillStyle = '#66d9ff';
  ctx.beginPath();
  ctx.moveTo(1.5, -5.2);
  ctx.lineTo(-2, 1.2);
  ctx.lineTo(0.3, 1.2);
  ctx.lineTo(-0.7, 5.2);
  ctx.lineTo(2.4, -1);
  ctx.lineTo(-0.1, -1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------- 凤凰:初始机身 + 鹰头徽标 ----------
function drawPhoenixJet(p) {
  drawGaleBody(p);
  drawEagleBadge(p);
}

// 鹰头徽标:画在机身背部 / 座舱后(x≈-6,y≈0),简化鹰头轮廓(三角头部 + 钩状喙 +
// 眼睛点,机头朝 +x)。主色 #f5c94c(金),深红 #d84a4a 描边与眼睛点缀。
function drawEagleBadge(p) {
  ctx.save();
  ctx.translate(-6, 0);
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.moveTo(-4.5, -3.2);
  ctx.lineTo(1.2, -3.2);
  ctx.lineTo(2.6, -1.2);
  ctx.lineTo(4.8, -0.3);
  ctx.lineTo(2.6, 1.1);
  ctx.lineTo(1.6, 0.9);
  ctx.lineTo(0.4, 2.9);
  ctx.lineTo(-3.2, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d84a4a';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#d84a4a';
  ctx.beginPath();
  ctx.arc(0.4, -1.3, 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayerJet(p) {
  // 复活动画态:机体半透明 + 金色光晕脉动(正常绘制逻辑不变,仅叠加 shadow/alpha,末尾恢复)
  if (p.reviveAnim) {
    const prog = p.reviveAnim.t / p.reviveAnim.dur;
    const pulse = 0.5 + 0.5 * Math.sin(prog * Math.PI * 3);
    ctx.globalAlpha = 0.45 + 0.4 * prog;
    ctx.shadowColor = 'rgba(255,220,120,0.9)';
    ctx.shadowBlur = 18 + pulse * 14;
  }
  if (p.hitFlash > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(gameTime * 40) * 0.3;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const speedRatio = (p.speed - CFG.minSpeed) / (CFG.maxSpeed + CFG.abSpeed - CFG.minSpeed);
  const flame = p.afterburn ? 34 : 14 + speedRatio * 22;
  const fg = ctx.createLinearGradient(-46, 0, -14, 0);
  fg.addColorStop(0, 'rgba(255,120,40,0)');
  fg.addColorStop(0.55, '#ff9f43');
  fg.addColorStop(1, '#fff7c0');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-42, -5);
  ctx.lineTo(-42 - flame, 0);
  ctx.lineTo(-42, 5);
  ctx.closePath();
  ctx.fill();
  // 机身造型分发:重锤/迅雷/凤凰 = 初始机身(drawGaleBody)+ 主题徽标(gale 保持原逻辑)
  const planeId = p.planeId || (p === player ? (save.selectedPlane || 'gale') : 'gale');
  if (planeId === 'hammer' || planeId === 'bolt' || planeId === 'phoenix') {
    if (planeId === 'hammer') drawHammerJet(p);
    else if (planeId === 'bolt') drawBoltJet(p);
    else drawPhoenixJet(p);
    if (p.reviveAnim) { ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    return;
  }
  drawGaleBody(p);
  // 复活动画态:恢复渲染状态
  if (p.reviveAnim) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function drawFighterJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(4, -6);
  ctx.lineTo(-6, -17);
  ctx.lineTo(-15, -19);
  ctx.lineTo(-19, -9);
  ctx.lineTo(-15, -4);
  ctx.lineTo(-27, -8);
  ctx.lineTo(-31, -12);
  ctx.lineTo(-31, 12);
  ctx.lineTo(-27, 8);
  ctx.lineTo(-15, 4);
  ctx.lineTo(-19, 9);
  ctx.lineTo(-15, 19);
  ctx.lineTo(-6, 17);
  ctx.lineTo(4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a1518';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#8f2f2c';
  ctx.beginPath();
  ctx.arc(8, 0, 4, 0, TAU);
  ctx.fill();
}

function drawGunnerJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(4, -7);
  ctx.lineTo(-8, -22);
  ctx.lineTo(-18, -24);
  ctx.lineTo(-20, -10);
  ctx.lineTo(-16, -4);
  ctx.lineTo(-26, -7);
  ctx.lineTo(-28, -12);
  ctx.lineTo(-28, 12);
  ctx.lineTo(-26, 7);
  ctx.lineTo(-16, 4);
  ctx.lineTo(-20, 10);
  ctx.lineTo(-18, 24);
  ctx.lineTo(-8, 22);
  ctx.lineTo(4, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4a2a12';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawBomberJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(8, -8);
  ctx.lineTo(-14, -10);
  ctx.lineTo(-22, -26);
  ctx.lineTo(-38, -30);
  ctx.lineTo(-40, -14);
  ctx.lineTo(-30, -9);
  ctx.lineTo(-30, 9);
  ctx.lineTo(-40, 14);
  ctx.lineTo(-38, 30);
  ctx.lineTo(-22, 26);
  ctx.lineTo(-14, 10);
  ctx.lineTo(8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2c3338';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#5b6368';
  ctx.fillRect(-38, -3, 8, 6);
  ctx.fillStyle = '#394248';
  ctx.beginPath();
  ctx.arc(10, 0, 5, 0, TAU);
  ctx.fill();
}

function drawAceJet(p) {
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(10, -5);
  ctx.lineTo(4, -9);
  ctx.lineTo(-12, -24);
  ctx.lineTo(-22, -25);
  ctx.lineTo(-28, -12);
  ctx.lineTo(-24, -4);
  ctx.lineTo(-36, -8);
  ctx.lineTo(-40, -15);
  ctx.lineTo(-42, -3);
  ctx.lineTo(-42, 3);
  ctx.lineTo(-40, 15);
  ctx.lineTo(-36, 8);
  ctx.lineTo(-24, 4);
  ctx.lineTo(-28, 12);
  ctx.lineTo(-22, 25);
  ctx.lineTo(-12, 24);
  ctx.lineTo(4, 9);
  ctx.lineTo(10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a0f0c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(-16, -4); ctx.lineTo(-16, 4); ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(12, 0, 3.5, 0, TAU);
  ctx.fill();
}

function drawTransportJet(p) {
  ctx.fillStyle = '#8fa3ad';
  ctx.beginPath();
  ctx.moveTo(52, 0);
  ctx.lineTo(20, -9);
  ctx.lineTo(-18, -11);
  ctx.lineTo(-30, -30);
  ctx.lineTo(-52, -33);
  ctx.lineTo(-56, -16);
  ctx.lineTo(-42, -12);
  ctx.lineTo(-42, 12);
  ctx.lineTo(-56, 16);
  ctx.lineTo(-52, 33);
  ctx.lineTo(-30, 30);
  ctx.lineTo(-18, 11);
  ctx.lineTo(20, 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#283238';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#5f727c';
  ctx.fillRect(-44, -5, 10, 10);
  ctx.fillStyle = '#d8e8ef';
  ctx.beginPath();
  ctx.arc(16, 0, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#48d06b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 26, -0.6, 0.6);
  ctx.stroke();
  ctx.strokeStyle = '#48d06b';
  ctx.beginPath();
  ctx.arc(0, 0, 26, Math.PI - 0.6, Math.PI + 0.6);
  ctx.stroke();
}

function drawLockIndicator() {
  const t = player.target;
  if (!t || t.dead || !player.alive) return;
  const d = dist(player.x, player.y, t.x, t.y);
  if (d > CFG.lockRange + 150) return;
  const s = 30 + (t.r || 20) * 0.6;
  ctx.strokeStyle = player.lock >= CFG.lockTime ? '#ff4d4d' : '#7fd4ff';
  ctx.lineWidth = 2;
  const blink = player.lock >= CFG.lockTime ? 1 : 0.75 + Math.sin(gameTime * 18) * 0.25;
  ctx.globalAlpha = blink;
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.moveTo(t.x + cx * s, t.y + cy * s);
    ctx.lineTo(t.x + cx * s - cx * 9, t.y + cy * s);
    ctx.lineTo(t.x + cx * s, t.y + cy * s - cy * 9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (player.lock < CFG.lockTime) {
    ctx.strokeStyle = '#7fd4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, s + 10, -Math.PI / 2, -Math.PI / 2 + (player.lock / CFG.lockTime) * TAU);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(t.x, t.y, s + 10, 0, TAU);
    ctx.stroke();
  }
}

function inDrawView(x, y, margin) {
  const viewR = Math.hypot(W, H) / cam.zoom * 0.58 + (margin || 0);
  return Math.abs(x - cam.x) <= viewR && Math.abs(y - cam.y) <= viewR;
}

function drawParticles() {
  for (const p of particles) {
    if (!inDrawView(p.x, p.y, (p.size || 0) * 2 + 80)) continue;
    const lifeRatio = p.life / p.maxLife;
    if (p.type === 'fire') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = lifeRatio * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.4 - lifeRatio * 0.4), 0, TAU);
      ctx.fill();
    } else if (p.type === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'ring') {
      const rr = p.size * (1.6 - lifeRatio);
      ctx.globalAlpha = lifeRatio;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.stroke();
    } else if (p.type === 'flash') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.5 - lifeRatio * 0.5), 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'text') {
      ctx.globalAlpha = Math.min(1, lifeRatio * 2);
      ctx.font = '700 ' + p.size + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.type === 'debris') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 0.3 + 0.7 * lifeRatio;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(8,12,18,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < p.verts.length; i++) {
        if (i === 0) ctx.moveTo(p.verts[i].x, p.verts[i].y);
        else ctx.lineTo(p.verts[i].x, p.verts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function updateParticles(dt) {
  particlePressureT = Math.max(0, particlePressureT - dt);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'fire' || p.type === 'smoke') {
      p.vx *= 1 - dt * 1.6;
      p.vy *= 1 - dt * 1.6;
    }
    if (p.type === 'debris') {
      p.rot += p.rotSpeed * dt;
      p.vy += 130 * dt;
      p.vx *= 1 - dt * 0.7;
      p.vy *= 1 - dt * 0.35;
    }
    p.life -= dt;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
    }
  }
}

function drawBullets() {
  for (const b of bullets) {
    if (b.life <= 0) continue; // 已失效(复活清弹标记)不再绘制,下帧由 updateBullets 清除
    if (!inDrawView(b.x, b.y, 80)) continue;
    ctx.strokeStyle = b.fromPlayer ? '#ffe9a0' : '#ff6b5e';
    ctx.lineWidth = 3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawMissiles() {
  for (const m of missiles) {
    if (m.life <= 0) continue; // 已失效(复活清弹标记)不再绘制
    if (!inDrawView(m.x, m.y, 100)) continue;
    const dirx = Math.cos(m.heading), diry = Math.sin(m.heading);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.heading);
    ctx.fillStyle = m.enemy ? '#ffb066' : '#d8e9ff';
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    void dirx; void diry;
  }
}

function drawPickups() {
  for (const p of pickups) {
    if (!inDrawView(p.x, p.y, 80)) continue;
    const bob = Math.sin(p.t * 4) * 4;
    let color, label, size = 14;
    if (p.type === 'buff') {
      color = BUFF_DEFS[p.id] ? BUFF_DEFS[p.id].color : '#ffffff';
      label = BUFF_DEFS[p.id] ? BUFF_DEFS[p.id].icon : '?';
    } else if (p.type === 'move') {
      color = '#9be3ff';
      label = '突';
    } else if (p.type === 'supply') {
      color = DROP_SUPPLIES[p.supply] ? DROP_SUPPLIES[p.supply].color : '#ffffff';
      label = p.supply === 'repair' ? '修' : p.supply === 'missiles' ? '弹' : '分';
    } else if (p.type === 'revive') {
      color = '#7ee787';
      label = '复';
    } else if (p.type === 'wingman') {
      color = '#55e6c1';
      label = '援';
    } else {
      color = '#dfe9f2';
      label = '?';
    }
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.t * 0.8);
    ctx.fillStyle = color;
    ctx.strokeStyle = p.type === 'wingman' ? '#ffd166' : '#1c2430';
    ctx.lineWidth = p.type === 'wingman' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-p.t * 0.8);
    ctx.fillStyle = '#101820';
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}
