// ---------- 竞速关检查点可视化(drawWorld 相机变换内调用,世界坐标) ----------
function drawCheckpoints() {
  if (!mission || !mission.def || mission.def.type !== 'race') return;
  const cps = mission.def.checkpoints || [];
  const n = cps.length;
  if (n === 0) return;
  const viewR = Math.hypot(W, H) / cam.zoom + 500;
  const idx = clamp(mission.raceIndex || 0, 0, n);
  const pulse = 0.5 + 0.5 * Math.sin(gameTime * 3.0);
  for (let i = 0; i < n; i++) {
    const cp = cps[i];
    // 视口裁剪(与 drawIslands 相同方式)
    if (Math.abs(cp.x - cam.x) > viewR || Math.abs(cp.y - cam.y) > viewR) continue;
    if (i < idx) {
      // 已通过:暗绿低透明度小标记
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#4ecb71';
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#4ecb71';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 18, 0, TAU);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    const next = i === idx;
    const col = next ? '#ffd166' : '#8fd0ff';
    const h = 240;
    // 垂直光柱:自检查点向上延伸 240px 的半透明渐变柱
    const g = ctx.createLinearGradient(0, cp.y, 0, cp.y - h);
    if (next) {
      g.addColorStop(0, 'rgba(255,209,102,0.62)');
      g.addColorStop(1, 'rgba(255,209,102,0.02)');
    } else {
      g.addColorStop(0, 'rgba(143,208,255,0.34)');
      g.addColorStop(1, 'rgba(143,208,255,0.02)');
    }
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(cp.x - (next ? 30 : 18), cp.y - h, next ? 60 : 36, h + 1);
    // 光柱亮芯
    ctx.fillStyle = col;
    ctx.globalAlpha = next ? 0.5 : 0.26;
    ctx.fillRect(cp.x - (next ? 10 : 5), cp.y - h, next ? 20 : 10, h + 1);
    ctx.globalAlpha = 1;
    // 底部定位圆盘(精确目标点,玩家需飞到此处)
    ctx.fillStyle = col;
    ctx.globalAlpha = next ? 0.5 : 0.28;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, next ? 22 : 14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 底部定位环(玩家需飞到此处)
    ctx.strokeStyle = col;
    ctx.globalAlpha = next ? 0.85 : 0.45;
    ctx.lineWidth = next ? 4 : 3;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, (next ? 40 : 26) + pulse * 6, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 顶部悬浮环标 + 菱形(脉动,gameTime 驱动)
    const topY = cp.y - h;
    ctx.strokeStyle = col;
    ctx.lineWidth = next ? 4 : 3;
    ctx.beginPath();
    ctx.arc(cp.x, topY, (next ? 24 : 16) + pulse * (next ? 9 : 5), 0, TAU);
    ctx.stroke();
    const dR = (next ? 9 : 6) * (1 + pulse * 0.4);
    ctx.fillStyle = col;
    ctx.translate(cp.x, topY);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-dR, -dR, dR * 2, dR * 2);
    ctx.restore();
  }
}

function drawWorld() {
  drawWater(world.theme);
  drawSun();
  ctx.save();
  // 追尾视角:飞机锁在屏幕 (W/2, H*0.62),机头朝上(世界旋转 -π/2 - heading)(任务书 20)
  ctx.translate(W / 2, H * CAM_ANCHOR_Y);
  ctx.rotate(-Math.PI / 2 - player.heading);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);
  drawIslands();
  drawClouds();
  for (const a of allies) if (inDrawView(a.x, a.y, 140)) drawPlaneShape(a);
  for (const e of enemies) {
    if (!inDrawView(e.x, e.y, e.dead ? 220 : 140)) continue;
    ctx.save();
    if (e.dead) {
      ctx.globalAlpha = e.wreckDone ? Math.max(0, 1 - e.wreckFade) : 0.9;
    }
    if (e.dead) drawWreckShape(e);
    else drawPlaneShape(e);
    ctx.restore();
  }
  drawPickups();
  drawBullets();
  drawMissiles();
  if (player.alive) drawPlaneShape(player);
  drawLockIndicator();
  drawCheckpoints();
  drawParticles();
  ctx.restore();
  ctx.fillStyle = world.theme.haze;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHudBar(x, y, w, h, ratio, fill, back, label, value) {
  ctx.fillStyle = back || 'rgba(8,14,22,0.72)';
  roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(x, y, Math.max(0, w * clamp(ratio, 0, 1)), h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, 4);
  ctx.stroke();
  if (label) {
    ctx.font = '600 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#dfe9f2';
    ctx.fillText(label, x + 7, y + h - 7);
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w - 7, y + h - 7);
  }
}
