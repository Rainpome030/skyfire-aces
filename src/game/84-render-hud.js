// ---------- 屏幕边缘指引箭头(drawHUD 内调用,屏幕坐标) ----------
function drawOffscreenArrow(tx, ty, color) {
  if (!player || !cam) return;
  // 世界坐标 → 屏幕坐标(追尾相机,与 drawWorld 变换一致;任务书 20)
  const dx = tx - cam.x, dy = ty - cam.y;
  const camAng = -Math.PI / 2 - player.heading;
  const cosA = Math.cos(camAng), sinA = Math.sin(camAng);
  const sx = (dx * cosA - dy * sinA) * cam.zoom + W / 2;
  const sy = (dx * sinA + dy * cosA) * cam.zoom + H * CAM_ANCHOR_Y;
  // 目标在视口内:不画
  if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) return;
  const cx = W / 2, cy = H / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  // 射线与内缩 24px 的边缘矩形求交,箭头画在边缘内侧
  const hw = W / 2 - 24, hh = H / 2 - 24;
  const t = Math.min(
    Math.abs(hw / (Math.cos(ang) || 1e-6)),
    Math.abs(hh / (Math.sin(ang) || 1e-6))
  );
  const ex = cx + Math.cos(ang) * t;
  const ey = cy + Math.sin(ang) * t;
  // 三角形箭头(指向目标方向)
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-11, -10);
  ctx.lineTo(-11, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 距离文字(箭头内侧)
  const d = Math.round(dist(player.x, player.y, tx, ty));
  ctx.font = '700 13px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 5;
  ctx.fillText(d + ' m', ex - Math.cos(ang) * 32, ey - Math.sin(ang) * 32);
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';
}

function drawHUD() {
  if (GAME.state !== 'playing' && GAME.state !== 'paused') return;
  const m = mission;
  const t = world.theme;
  const hr = hudRects();   // P33: 单一布局源(绘制/命中/断言共用)
  const mt = hr.mt, mr = hr.mr;
  const hudScale = hr.hudScale;
  const mtt = typeof missionTimerText === 'function' && m.def ? missionTimerText() : null;
  if (mtt) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(mtt, W / 2, mt + 12);
  }
  const drawPersistentPanel = (r, radius = HUD_PANEL_RADIUS) => {
    ctx.fillStyle = HUD_PANEL_FILL;
    roundRect(r.x, r.y, r.w, r.h, radius);
    ctx.fill();
    ctx.strokeStyle = HUD_PANEL_STROKE;
    ctx.lineWidth = 1;
    roundRect(r.x, r.y, r.w, r.h, radius);
    ctx.stroke();
  };

  // top-left panel(P38: 删「endless sortie」模式标题; 仅任务时间+击杀数; 战役另加目标/进度)
  drawPersistentPanel(hr.missionPanel);
  ctx.save();
  roundRect(hr.missionPanel.x, hr.missionPanel.y, hr.missionPanel.w, hr.missionPanel.h, HUD_PANEL_RADIUS);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.font = '600 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#eef4f8';
  const mm = Math.floor(GAME.missionTime / 60);
  const ss = Math.floor(GAME.missionTime % 60);
  ctx.fillText('任务时间 ' + mm + ':' + (ss < 10 ? '0' : '') + ss, hr.missionPanel.x + 12, hr.missionPanel.y + 24 * hudScale);
  ctx.fillText('击杀 ' + GAME.kills, hr.missionPanel.x + 12, hr.missionPanel.y + 44 * hudScale);
  if (GAME.mode !== 'endless') {
    ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('目标：' + m.def.objective, hr.missionPanel.x + 12, hr.missionPanel.y + 62 * hudScale);
    let prog = 0;
    if (m.escort && m.transport) {
      const wp = m.transport.waypoints[m.transport.waypoints.length - 1];
      const start = m.transport.waypoints[0];
      const total = dist(start.x, start.y, wp.x, wp.y);
      const cur = dist(start.x, start.y, m.transport.x, m.transport.y);
      prog = clamp(cur / total, 0, 1);
    } else if (m.boss) {
      prog = m.boss && !m.boss.dead ? 1 - m.boss.hp / m.boss.maxHp : 1;
    } else {
      prog = m.spawned > 0 ? (m.spawned - enemies.filter(e => !e.dead).length) / m.total : 0;
    }
    drawHudBar(hr.missionPanel.x + 12, hr.missionPanel.y + 66 * hudScale, hr.missionPanel.w - 40, 10 * hudScale, prog, '#48c774', 'rgba(255,255,255,0.12)', '', '');
    ctx.font = '600 ' + Math.round(10 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#aebecd';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(prog * 100) + '%', hr.missionPanel.x + hr.missionPanel.w - 12, hr.missionPanel.y + 74 * hudScale);
  }
  ctx.restore();

  // top-right score(P38: 击杀数移入左上角面板, 此处仅保留分数+复活)
  ctx.textAlign = 'right';
  ctx.font = '700 ' + Math.round(22 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 6;
  ctx.fillText(fmt(GAME.score), hr.scoreRight, mt + 28 * hudScale);
  ctx.shadowBlur = 0;
  // revive counter (top-right, below score)
  ctx.font = '700 ' + Math.round(14 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(GAME.unlimitedRevive ? '复活 ∞' : '复活 ×' + GAME.reviveCount, hr.scoreRight, mt + 48 * hudScale);

  // transport hp when escorting
  if (m.escort && m.transport && !m.transport.dead) {
    const bw = 300 * hudScale;
    drawHudBar(W / 2 - bw / 2, mt + 34 * hudScale, bw, 14 * hudScale, m.transport.hp / m.transport.maxHp, '#4ecb71', 'rgba(8,14,22,0.72)', '铁鸟 机身', Math.round(m.transport.hp) + '/' + m.transport.maxHp);
  }

  drawWingmanHud(allies);

  // 手机血条跟随机体锚点；半透明填充按剩余比例从红连续过渡到绿。
  const hw = hr.hpWin;
  const hpRatio = clamp(player.hp / Math.max(1, player.maxHp), 0, 1);
  const hpHue = Math.round(hpRatio * 120);
  if (hr.portraitTouch) {
    ctx.fillStyle = 'rgba(5,12,20,0.42)';
    ctx.strokeStyle = 'rgba(220,235,245,0.46)';
    ctx.lineWidth = 1;
    roundRect(hw.x, hw.y, hw.w, hw.h, 5);
    ctx.fill(); ctx.stroke();
    const ix = hw.x + 4, iy = hw.y + 4, iw = hw.w - 8, ih = hw.h - 8;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(ix, iy, iw, ih, 3);
    ctx.fill();
    if (hpRatio > 0) {
      ctx.fillStyle = 'hsla(' + hpHue + ', 86%, 54%, 0.72)';
      roundRect(ix, iy, iw * hpRatio, ih, 3);
      ctx.fill();
    }
    ctx.fillStyle = '#eef4f8';
    ctx.font = '700 9px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('机体完整度', ix + 4, iy + 10);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(hpRatio * 100) + '%', ix + iw - 4, iy + 10);
  } else {
    drawPersistentPanel(hw);
    drawHudBar(hw.x + 12, hw.y + 4 * hudScale, hw.w - 24, 16 * hudScale, hpRatio,
      'hsl(' + hpHue + ', 86%, 54%)', 'rgba(255,255,255,0.12)', '机体完整度', Math.round(hpRatio * 100) + '%');
  }
  if (GAME.combo > 0) {
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + (hr.portraitTouch ? 10 : Math.round(13 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const comboText = '连杀 ×' + GAME.combo + '  ' + GAME.comboTimer.toFixed(1) + 's';
    const comboY = hw.y + hw.h + (hr.portraitTouch ? 13 : 16 * hudScale);
    if (hr.portraitTouch) ctx.fillText(comboText, hw.x + hw.w / 2, comboY, hw.w);
    else ctx.fillText(comboText, hw.x + hw.w / 2, comboY);
  }

  if (hr.portraitTouch) {
    const wp = hr.weaponPanel;
    const w = player.weapon || defaultWeapon();
    const wcol = QUALITY_COLOR[w.quality] || '#dfe9f2';
    drawPersistentPanel(wp);
    ctx.save();
    roundRect(wp.x, wp.y, wp.w, wp.h, HUD_PANEL_RADIUS);
    ctx.clip();
    ctx.textAlign = 'left';
    ctx.fillStyle = wcol;
    ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    ctx.fillText('武器 ' + QUALITY_NAME[w.quality] + ' ' + w.name, wp.x + 8, wp.y + 20, Math.max(44, wp.w - 58));
    ctx.textAlign = 'right';
    ctx.fillText(w.limited ? '×' + w.ammo : '无限', wp.x + wp.w - 8, wp.y + 20);
    ctx.restore();
  }

  // bottom-left status(P33: 抬入底部安全区; 矩形取 hudRects)
  const sp = hr.statusPanel;
  if (GAME.mode === 'endless' || !input.isTouch) {
    drawPersistentPanel(sp);
    if (GAME.mode === 'endless') {
      // 经验窗(P38: 移入左下): Lv + 经验条 + 当前武器(品质/名称, 武器文本保持)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 ' + (input.isTouch ? Math.max(13, HUD_CRITICAL_FONT_MIN) : Math.round(13 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('Lv.' + GAME.level, sp.x + 12, input.isTouch ? sp.y + 18 : sp.y + 16 * hudScale);
      drawHudBar(sp.x + 56, input.isTouch ? sp.y + 7 : sp.y + 8 * hudScale, sp.w - 68,
        input.isTouch ? Math.max(14, 12 * hudScale) : 12 * hudScale,
        GAME.exp / expNeeded(GAME.level), '#9be3ff', 'rgba(255,255,255,0.12)', '', Math.floor(GAME.exp / expNeeded(GAME.level) * 100) + '%');
      if (!hr.portraitTouch) {
        const w = player.weapon || defaultWeapon();
        const wcol = QUALITY_COLOR[w.quality] || '#dfe9f2';
        ctx.fillStyle = wcol;
        ctx.font = '600 ' + (input.isTouch ? Math.max(HUD_CRITICAL_FONT_MIN, Math.round(11 * hudScale)) : Math.round(11 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
        const weaponLineY = input.isTouch ? sp.y + 45 : sp.y + 34 * hudScale;
        ctx.fillText('武器 ' + QUALITY_NAME[w.quality] + ' ' + w.name, sp.x + 12, weaponLineY);
        ctx.textAlign = 'right';
        ctx.fillText(w.limited ? '弹药 ' + w.ammo : '无限', sp.x + sp.w - 12, weaponLineY);
      }
      if (!input.isTouch) {
        // 桌面保留: 导弹/速度/高度 + 油门表
        ctx.textAlign = 'left';
        ctx.fillStyle = '#7fd4ff';
        ctx.font = '700 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
        ctx.fillText('导弹 ' + player.missiles, sp.x + 12, sp.y + 54 * hudScale);
        ctx.fillStyle = '#dfe9f2';
        ctx.font = '600 ' + Math.round(11 * hudScale) + 'px "Microsoft YaHei", sans-serif';
        ctx.fillText('速度 ' + Math.round(player.speed) + ' km/h', sp.x + 12, sp.y + 70 * hudScale);
        ctx.textAlign = 'right';
        ctx.fillText('高度 ' + Math.round(player.altitude) + ' m', sp.x + sp.w - 12, sp.y + 70 * hudScale);
        ctx.save();
        ctx.translate(sp.x + 12, sp.y + 80 * hudScale);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        roundRect(0, 0, sp.w - 24, 5, 2);
        ctx.fill();
        const thrFill = player.afterburn ? '#ff9f43' : '#66d9ff';
        ctx.fillStyle = thrFill;
        roundRect(0, 0, (sp.w - 24) * clamp(player.throttle + (player.afterburn ? 0.3 : 0), 0, 1), 5, 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (!input.isTouch) {
      // 桌面战役: 导弹/速度/高度 + 油门表(血量已上移顶部中央)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7fd4ff';
      ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('导弹 ' + player.missiles, sp.x + 12, sp.y + 24 * hudScale);
      ctx.fillStyle = '#dfe9f2';
      ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('速度 ' + Math.round(player.speed) + ' km/h', sp.x + 12, sp.y + 46 * hudScale);
      ctx.textAlign = 'right';
      ctx.fillText('高度 ' + Math.round(player.altitude) + ' m', sp.x + sp.w - 12, sp.y + 46 * hudScale);
      ctx.save();
      ctx.translate(sp.x + 12, sp.y + 56 * hudScale);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(0, 0, sp.w - 24, 5, 2);
      ctx.fill();
      const thrFill2 = player.afterburn ? '#ff9f43' : '#66d9ff';
      ctx.fillStyle = thrFill2;
      roundRect(0, 0, (sp.w - 24) * clamp(player.throttle + (player.afterburn ? 0.3 : 0), 0, 1), 5, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // radar(P33: hudRects 单一布局源; 触屏避让暂停槽/油门条/僚机槽, 修复雷达x油门条重叠带)
  const radarR = hr.radar.r;
  const rx = hr.radar.x;
  const ry = hr.radar.y;
  ctx.fillStyle = HUD_PANEL_FILL;
  ctx.beginPath();
  ctx.arc(rx, ry, radarR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = HUD_PANEL_STROKE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(rx, ry, radarR, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rx, ry, radarR * 0.55, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx - radarR, ry); ctx.lineTo(rx + radarR, ry);
  ctx.moveTo(rx, ry - radarR); ctx.lineTo(rx, ry + radarR);
  ctx.stroke();
  const sweep = gameTime * 2.2;
  ctx.strokeStyle = 'rgba(102,217,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + Math.cos(sweep) * radarR * 0.96, ry + Math.sin(sweep) * radarR * 0.96);
  ctx.stroke();
  const scale = radarR * 0.85 / 1700;
  function blip(x, y, color, size, shape) {
    size = size * RADAR_MARKER_SCALE;   // P38: 指示标记缩小 50%(命名常量, 保留敌机/僚机标记语义)
    const dx = clamp((x - player.x) * scale, -radarR + 6, radarR - 6);
    const dy = clamp((y - player.y) * scale, -radarR + 6, radarR - 6);
    // 追尾雷达(任务书 20):相对偏移套同一旋转,机头恒朝屏幕上方
    const ang = -Math.PI / 2 - player.heading;
    const rx2 = dx * Math.cos(ang) - dy * Math.sin(ang);
    const ry2 = dx * Math.sin(ang) + dy * Math.cos(ang);
    ctx.fillStyle = color;
    if (shape === 'square') {
      ctx.fillRect(rx + rx2 - size / 2, ry + ry2 - size / 2, size, size);
    } else if (shape === 'wingman') {
      drawWingmanRadarBlip(rx + rx2, ry + ry2, size, 'wingman', -Math.PI / 2);
    } else {
      ctx.beginPath();
      ctx.arc(rx + rx2, ry + ry2, size, 0, TAU);
      ctx.fill();
    }
  }
  for (const a of allies) if (!a.dead) {
    if (a.kind === 'wingman') blip(a.x, a.y, '#55e6c1', 6, 'wingman');
    else blip(a.x, a.y, '#4ecb71', 5, 'square');
  }
  for (const e of enemies) if (!e.dead) blip(e.x, e.y, e === player.target ? '#ff4d4d' : '#ff8a5c', e.kind === 'bomber' || e.kind === 'ace' ? 6 : 4.5);
  for (const p of pickups) blip(p.x, p.y, '#54c7ff', 3.5);
  blip(player.x, player.y, '#ffffff', 4);
  ctx.font = '600 ' + Math.round(10 * hudScale) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#aebecd';
  ctx.fillText('雷达', rx, ry + radarR + 14 * hudScale);

  if (GAME.mode === 'endless') {
    // (P38: 经验窗/武器文本已移入左下窗口, 连杀计时已移血条下; 此处仅保留突进冷却与 Buff 图标)
    // dash cooldown
    if (GAME.dash && !hr.portraitTouch) {
      ctx.fillStyle = '#9be3ff';
      ctx.font = '600 ' + Math.round(12 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('突进 ' + (player.dashCd > 0 ? player.dashCd.toFixed(1) + 's' : '就绪'), W - mr, H - hr.mb - 30 * hudScale);
    }
    // active buffs
    const buffIds = Object.keys(player.buffs).filter(id => player.buffs[id].t > 0);
    if (buffIds.length) {
      const bs = hr.buffStack;
      const bw = hr.portraitTouch ? bs.w : 68 * hudScale;
      const bh = hr.portraitTouch ? bs.h : 24 * hudScale;
      const bgap = hr.portraitTouch ? bs.gap : 8 * hudScale;
      let bx = hr.portraitTouch ? bs.x : hr.scoreRight - bw;
      let by = hr.portraitTouch ? bs.y : mt + 64 * hudScale;
      ctx.textAlign = 'center';
      for (const id of buffIds) {
        const def = BUFF_DEFS[id];
        const st = player.buffs[id];
        const txt = id === 'shield' ? '盾 ×' + Math.max(0, st.n) : def.icon + ' ' + Math.ceil(st.t);
        const buffPanel = { x: bx, y: by, w: bw, h: bh };
        drawPersistentPanel(buffPanel);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1.5;
        roundRect(buffPanel.x, buffPanel.y, buffPanel.w, buffPanel.h, HUD_PANEL_RADIUS);
        ctx.stroke();
        ctx.fillStyle = def.color;
        ctx.font = '700 ' + (hr.portraitTouch ? 11 : Math.round(13 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
        ctx.fillText(txt, bx + bw / 2, by + bh / 2 + (hr.portraitTouch ? 4 : 4 * hudScale));
        if (hr.portraitTouch) by += bh + bgap;
        else bx -= bw + bgap;
      }
    }
  }

  // 桌面保留独立锁定文字；手机锁定进度收进导弹开关。
  if (!input.isTouch && player.target && !player.target.dead && player.lock > 0.05) {
    ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = player.lock >= CFG.lockTime ? '#ff4d4d' : '#7fd4ff';
    const lockPct = Math.round(player.lock / CFG.lockTime * 100);
    ctx.fillText('LOCK ' + Math.min(100, lockPct) + '%', W / 2, H - 60 * hudScale);
  }

  if (player.rollActive || player.rollCd > 0) {
    ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.round(13 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = player.rollActive ? '#9be3ff' : '#aebecd';
    const rollText = player.rollActive ? '滚筒中 · 导弹引导减弱' : '滚筒 ' + player.rollCd.toFixed(1) + 's';
    if (hr.portraitTouch) ctx.fillText(rollText, W / 2, hr.hpWin.y + hr.hpWin.h + 30, hr.hpWin.w);
    else ctx.fillText(rollText, W / 2, H - 40 * hudScale);
  }

  // incoming missile warning
  let closestMsl = null, cd = 1e9;
  for (const m of missiles) {
    if (!m.enemy) continue;
    const d = dist(m.x, m.y, player.x, player.y);
    if (d < cd) { cd = d; closestMsl = m; }
  }
  if (closestMsl && cd < 640 && player.alive) {
    const flash = Math.sin(gameTime * 14) > -0.4;
    if (flash) {
      if (hr.portraitTouch) {
        const wl = hr.warningLane;
        ctx.fillStyle = 'rgba(72,8,12,0.78)';
        ctx.strokeStyle = '#ff4545';
        ctx.lineWidth = 2;
        roundRect(wl.x, wl.y, wl.w, wl.h, 7);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '900 17px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('导弹来袭', wl.x + wl.w / 2, wl.y + 21);
      } else {
        ctx.fillStyle = 'rgba(255,45,45,0.9)';
        ctx.font = '900 ' + Math.round(26 * hudScale) + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 16;
        ctx.fillText('导弹来袭', W / 2, H * 0.3);
        ctx.shadowBlur = 0;
      }
    }
    if (hr.portraitTouch && hr.threatRing) {
      const tr = hr.threatRing;
      const relX = closestMsl.x - player.x, relY = closestMsl.y - player.y;
      const viewAng = -Math.PI / 2 - player.heading;
      const screenX = relX * Math.cos(viewAng) - relY * Math.sin(viewAng);
      const screenY = relX * Math.sin(viewAng) + relY * Math.cos(viewAng);
      const threatAng = Math.atan2(screenY, screenX);
      const pulse = 0.72 + 0.28 * Math.sin(gameTime * 18);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,64,64,' + pulse.toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, threatAng - 0.34, threatAng + 0.34);
      ctx.stroke();
      const ax = tr.x + Math.cos(threatAng) * tr.r;
      const ay = tr.y + Math.sin(threatAng) * tr.r;
      const ix = -Math.cos(threatAng), iy = -Math.sin(threatAng);
      const px = -iy, py = ix;
      ctx.fillStyle = '#ff4545';
      ctx.beginPath();
      ctx.moveTo(ax + ix * 10, ay + iy * 10);
      ctx.lineTo(ax - ix * 4 + px * 7, ay - iy * 4 + py * 7);
      ctx.lineTo(ax - ix * 4 - px * 7, ay - iy * 4 - py * 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 低空警告(任务书 18):高度 < 2000 红闪「高度过低!」,< 600 更急促(阈值 2000/600 可调)
  if (!hr.portraitTouch && player.alive && player.altitude < 2000) {
    const urgent = player.altitude < 600;
    const flash = Math.sin(gameTime * (urgent ? 26 : 14)) > -0.4;
    if (flash) {
      ctx.fillStyle = 'rgba(255,45,45,0.9)';
      ctx.font = '900 ' + Math.round(26 * hudScale) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 16;
      ctx.fillText('高度过低!', W / 2, H * 0.66);
      ctx.shadowBlur = 0;
    }
  }

  // 屏幕边缘指引箭头(竞速关 → 下一个未达成检查点;护航关 → 运输机)
  if (m.def && m.def.type === 'race') {
    const cps = m.def.checkpoints || [];
    const idx = m.raceIndex || 0;
    if (idx < cps.length) drawOffscreenArrow(cps[idx].x, cps[idx].y, '#ffd166');
  } else if (m.escort && m.transport && !m.transport.dead) {
    drawOffscreenArrow(m.transport.x, m.transport.y, '#4ecb71');
  }

  // P32 命中标记: 聚合命中后 ~90ms 在命中点画白色小十字(离散反馈通道, 随聚合窗口限频)
  if (HitFeedback.markT > 0 && player.alive) {
    const hth = -Math.PI / 2 - player.heading;
    const hrx = HitFeedback.markX - cam.x + cam.shakeX;
    const hry = HitFeedback.markY - cam.y + cam.shakeY;
    const hmx = W / 2 + (hrx * Math.cos(hth) - hry * Math.sin(hth)) * cam.zoom;
    const hmy = H * CAM_ANCHOR_Y + (hrx * Math.sin(hth) + hry * Math.cos(hth)) * cam.zoom;
    const hma = clamp(HitFeedback.markT / 0.09, 0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * hma).toFixed(3) + ')';
    ctx.lineWidth = 2;
    const hms = 6 + (1 - hma) * 4;
    ctx.beginPath();
    ctx.moveTo(hmx - hms, hmy); ctx.lineTo(hmx + hms, hmy);
    ctx.moveTo(hmx, hmy - hms); ctx.lineTo(hmx, hmy + hms);
    ctx.stroke();
  }

  // damage vignette
  const dmgAlpha = clamp((1 - hpRatio) * 0.55 + player.hitFlash * 0.7, 0, 0.75);
  if (dmgAlpha > 0.02) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(255,20,20,0)');
    g.addColorStop(1, 'rgba(255,20,20,' + dmgAlpha.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // controls hint
  if (GAME.hintTimer > 0 && GAME.state === 'playing') {
    GAME.hintTimer -= 1 / 60;
    const a = clamp(GAME.hintTimer, 0, 1);
    ctx.globalAlpha = a * 0.85;
    drawPersistentPanel(hr.hintBox);
    ctx.font = '600 ' + Math.max(11, Math.round(12 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f1f7';
    if (input.isTouch) {
      ctx.fillText('左右滑转向 · 双滑滚筒 · 机炮自动', hr.hintBox.x + hr.hintBox.w / 2,
        hr.hintBox.y + 19 * hudScale, hr.hintBox.w - 12);
      ctx.fillText('拖动油门 · 导弹开关' + (GAME.dash ? ' · 突进' : ''), hr.hintBox.x + hr.hintBox.w / 2,
        hr.hintBox.y + 37 * hudScale, hr.hintBox.w - 12);
    } else {
      ctx.fillText(GAME.mode === 'endless'
        ? '鼠标瞄准 · ' + prettyKey(bindFor('gun')) + ' 机炮 · ' + prettyKey(bindFor('missile')) + ' 导弹 · ' + prettyKey(bindFor('dash')) + ' 突进 · ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒 · ' + prettyKey(bindFor('pause')) + ' 暂停'
        : '鼠标瞄准 · ' + prettyKey(bindFor('gun')) + ' 机炮 · ' + prettyKey(bindFor('missile')) + ' 导弹 · ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒 · ' + prettyKey(bindFor('afterburn')) + ' 加力 · ' + prettyKey(bindFor('pause')) + ' 暂停', hr.hintBox.x + hr.hintBox.w / 2, hr.hintBox.y + hr.hintBox.h / 2 + 4 * hudScale, hr.hintBox.w - 16);
    }
    ctx.globalAlpha = 1;
  }
  if (input.isTouch && GAME.state === 'playing') {
    // 油门拖动条(任务书 21):深色底条 + 当前油门填充(#66d9ff,加力 #ff9f43)+ 游标线 + 顶部「油门」小字
    const tb = hr.throttle;
    ctx.fillStyle = 'rgba(20,34,48,0.75)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(tb.x, tb.y, tb.w, tb.h, 8);
    ctx.fill(); ctx.stroke();
    const fillH = Math.round(clamp(player.throttle, 0, 1) * tb.h);
    if (fillH > 2) {
      ctx.fillStyle = player.afterburn ? '#ff9f43' : '#66d9ff';
      ctx.globalAlpha = 0.85;
      roundRect(tb.x + 1, tb.y + tb.h - fillH, tb.w - 2, fillH - 1, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tb.x - 5, tb.y + tb.h - fillH); ctx.lineTo(tb.x + tb.w + 5, tb.y + tb.h - fillH);
    ctx.stroke();
    ctx.fillStyle = '#9be3ff';
    ctx.font = '600 ' + Math.round(11 * hudScale) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('油门', tb.x + tb.w / 2, tb.y - 8);
    // 速度/高度框同时承载手机低空警报，避免警报占用机体血条区域。
    const sab = hr.speedAltBox;
    const altitudeLow = player.alive && player.altitude < 2000;
    const altitudeUrgent = player.altitude < 600;
    const altitudeFlash = altitudeLow && Math.sin(gameTime * (altitudeUrgent ? 26 : 14)) > -0.4;
    if (altitudeFlash) {
      ctx.fillStyle = 'rgba(78,8,12,0.82)';
      ctx.strokeStyle = '#ff4545';
      ctx.lineWidth = 2;
      roundRect(sab.x, sab.y, sab.w, sab.h, HUD_PANEL_RADIUS);
      ctx.fill(); ctx.stroke();
    } else {
      drawPersistentPanel(sab);
    }
    ctx.fillStyle = altitudeFlash ? '#ff6b6b' : '#dfe9f2';
    ctx.font = '700 ' + Math.max(HUD_CRITICAL_FONT_MIN, Math.round(11 * hudScale)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const speedAltText = altitudeFlash
      ? (altitudeUrgent ? '高度危险 ↑ 拉升' : '高度过低 ↑ 拉升')
      : '速度 ' + Math.round(player.speed) + '  高度 ' + Math.round(player.altitude);
    ctx.fillText(speedAltText, sab.x + sab.w / 2, sab.y + 19, sab.w - 10);

    if (GAME.dash) {
      const db = hr.dash;
      const dashPressed = input.touch.dashId !== null;
      const dashReady = player.alive && !player.dashActive && player.dashCd <= 0;
      const dashOffset = dashPressed ? 2 : 0;
      ctx.fillStyle = dashReady ? 'rgba(18,82,76,0.88)' : 'rgba(24,35,48,0.84)';
      ctx.strokeStyle = dashReady ? '#55e6c1' : 'rgba(190,205,218,0.48)';
      ctx.lineWidth = dashReady ? 2.5 : 1.5;
      roundRect(db.x, db.y + dashOffset, db.w, db.h - dashOffset, 9);
      ctx.fill(); ctx.stroke();
      if (!dashPressed) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(db.x + 8, db.y + 6); ctx.lineTo(db.x + db.w - 8, db.y + 6);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = dashReady ? '#b9fff1' : '#b9c6d1';
      ctx.font = '800 13px "Microsoft YaHei", sans-serif';
      ctx.fillText('突进', db.x + db.w / 2, db.y + dashOffset + 22);
      ctx.font = '700 10px "Microsoft YaHei", sans-serif';
      const dashState = player.dashActive ? '执行' : (player.dashCd > 0 ? player.dashCd.toFixed(1) + 's' : '就绪');
      ctx.fillText(dashState, db.x + db.w / 2, db.y + dashOffset + 41);
    }

    // 导弹为 ON/OFF 自动发射开关；锁定读条始终独立推进。
    const mb = hr.msl;
    const missilePressed = input.touch.mslId !== null;
    const missileOffset = missilePressed ? 2 : 0;
    const lockRatio = clamp(player.lock / Math.max(0.001, CFG.lockTime), 0, 1);
    const lockPct = Math.round(lockRatio * 100);
    const lockHue = Math.round(lockRatio * 120);
    const lockColor = 'hsl(' + lockHue + ', 88%, 56%)';
    const lockAlphaBase = input.missileAuto ? 0.34 : (lockRatio >= 1 ? 0.22 : 0.12);
    const lockAlpha = Math.min(0.55, lockAlphaBase + (missilePressed ? 0.16 : 0));
    ctx.fillStyle = 'hsla(' + lockHue + ', 68%, 30%, ' + lockAlpha + ')';
    ctx.strokeStyle = lockColor;
    ctx.lineWidth = lockRatio >= 1 ? 3 : 2;
    roundRect(mb.x, mb.y + missileOffset, mb.w, mb.h - missileOffset, 10);
    ctx.fill(); ctx.stroke();
    if (!missilePressed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mb.x + 10, mb.y + 7); ctx.lineTo(mb.x + mb.w - 10, mb.y + 7);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dfe9f2';
    ctx.font = '700 12px "Microsoft YaHei", sans-serif';
    ctx.fillText('导弹 ×' + player.missiles, mb.x + mb.w / 2, mb.y + missileOffset + 19);
    ctx.fillStyle = input.missileAuto ? '#9be3ff' : '#aebecd';
    ctx.font = '900 18px "Microsoft YaHei", sans-serif';
    ctx.fillText(input.missileAuto ? 'ON' : 'OFF', mb.x + mb.w / 2, mb.y + missileOffset + 43);
    ctx.fillStyle = lockColor;
    ctx.font = '800 11px "Microsoft YaHei", sans-serif';
    ctx.fillText('LOCK ' + lockPct + '%', mb.x + mb.w / 2, mb.y + missileOffset + 63);
    const lockBarX = mb.x + 9, lockBarY = mb.y + mb.h - 14, lockBarW = mb.w - 18, lockBarH = 7;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(lockBarX, lockBarY, lockBarW, lockBarH, 3);
    ctx.fill();
    if (lockRatio > 0) {
      ctx.fillStyle = lockColor;
      roundRect(lockBarX, lockBarY, lockBarW * lockRatio, lockBarH, 3);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1;
    roundRect(lockBarX, lockBarY, lockBarW, lockBarH, 3);
    ctx.stroke();
    // P33 触屏暂停按钮: 双竖条图标(命中框=绘制框, 48x48, 上方安全区独立控制槽)
    const pb = hr.pauseBtn;
    ctx.fillStyle = 'rgba(20,34,48,0.75)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(pb.x, pb.y, pb.w, pb.h, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#dfe9f2';
    const pbx = pb.x + pb.w / 2, pby = pb.y + pb.h / 2;
    roundRect(pbx - 8, pby - 8, 5, 16, 2);
    ctx.fill();
    roundRect(pbx + 3, pby - 8, 5, 16, 2);
    ctx.fill();
  }
  void t;
}

function drawMenuButton(b, hover) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = b.primary ? 'rgba(255,170,60,0.95)' : 'rgba(16,32,50,0.88)';
  if (hover) ctx.fillStyle = b.primary ? 'rgba(255,190,90,1)' : 'rgba(26,48,72,0.95)';
  roundRect(b.x, b.y, b.w, b.h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = b.primary ? '#ffe1a0' : 'rgba(140,180,210,0.7)';
  ctx.lineWidth = 1.5;
  roundRect(b.x, b.y, b.w, b.h, 8);
  ctx.stroke();
  ctx.fillStyle = b.primary ? '#20242c' : '#eaf2f8';
  ctx.font = '700 ' + Math.round(Math.min(22, b.h * 0.42)) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.restore();
}

function hangarLayout() {
  const cardW = Math.min(200, Math.max(140, W * 0.16));
  const cardH = Math.min(216, H * 0.24);
  const gap = Math.min(20, (W - cardW * 4) / 5);
  const cardsY = H * 0.17;
  const cardsX = W / 2 - (cardW * 4 + gap * 3) / 2;
  const diffW = Math.min(150, W * 0.14);
  const diffH = 46;
  const diffGap = 26;
  const diffY = H * 0.60;
  const statW = Math.min(330, W * 0.24);
  const statH = Math.min(168, H * 0.19);
  const statX = 46;
  const statY = H * 0.72;
  return { cardW, cardH, gap, cardsY, cardsX, diffW, diffH, diffGap, diffY, statW, statH, statX, statY };
}

function hangarPct(v) {
  const p = Math.round((v - 1) * 100);
  return p > 0 ? '+' + p + '%' : (p < 0 ? p + '%' : '0%');
}

function wrapText(text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(t).width > maxW) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) return lines;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapCharacters(text, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const ch of Array.from(String(text))) {
    const next = cur + ch;
    if (cur && ctx.measureText(next).width > maxW && lines.length < maxLines - 1) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function drawHangar() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2540');
  g.addColorStop(1, '#0d3a4d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(255,150,40,0.5)';
  ctx.shadowBlur = 18;
  ctx.font = '900 ' + Math.round(Math.min(34, W * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('机库 · 出击准备', W / 2, H * 0.08);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('选择机体与难度，调整出击配置', W / 2, H * 0.08 + 28);

  const L = hangarLayout();
  const ids = Object.keys(PLANE_DEFS);
  const nameFont = Math.round(Math.min(20, L.cardW * 0.1));
  const smallFont = Math.round(Math.min(12, L.cardW * 0.065));
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const def = PLANE_DEFS[id];
    const x = L.cardsX + i * (L.cardW + L.gap);
    const locked = !isPlaneUnlocked(id);
    const selected = save.selectedPlane === id;
    ctx.fillStyle = locked ? 'rgba(9,16,26,0.78)' : (selected ? 'rgba(24,46,66,0.95)' : 'rgba(14,32,52,0.9)');
    ctx.strokeStyle = selected ? '#ffd166' : (locked ? 'rgba(120,140,160,0.35)' : 'rgba(140,180,210,0.5)');
    ctx.lineWidth = selected ? 2.5 : 1.2;
    roundRect(x, L.cardsY, L.cardW, L.cardH, 12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = selected ? '#ffd166' : (locked ? 'rgba(170,185,200,0.6)' : '#ffffff');
    ctx.font = '800 ' + nameFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(def.name, x + L.cardW / 2, L.cardsY + 40);
    ctx.fillStyle = locked ? 'rgba(80,95,110,0.7)' : 'rgba(70,150,200,0.35)';
    ctx.strokeStyle = locked ? 'rgba(120,140,160,0.3)' : 'rgba(127,212,255,0.6)';
    ctx.lineWidth = 1;
    const tagW = Math.min(84, L.cardW - 24);
    roundRect(x + L.cardW / 2 - tagW / 2, L.cardsY + 52, tagW, 22, 11);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = locked ? 'rgba(150,165,180,0.55)' : '#7fd4ff';
    ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(def.tag, x + L.cardW / 2, L.cardsY + 52 + 15);
    ctx.fillStyle = locked ? 'rgba(150,165,180,0.5)' : '#c8d8e4';
    ctx.font = '500 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    const dl = wrapText(def.desc, L.cardW - 26, 2);
    for (let li = 0; li < dl.length; li++) {
      ctx.fillText(dl[li], x + L.cardW / 2, L.cardsY + 96 + li * 22);
    }
    if (locked) {
      ctx.fillStyle = 'rgba(255,143,107,0.85)';
      ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('通关第二章解锁', x + L.cardW / 2, L.cardsY + L.cardH - 24);
    } else {
      ctx.fillStyle = 'rgba(125,255,176,0.85)';
      ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('初始可用', x + L.cardW / 2, L.cardsY + L.cardH - 24);
    }
  }

  // 难度行
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '700 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('难度', W / 2, L.diffY - 30);
  const diffKeys = Object.keys(DIFFICULTY_DEFS);
  const diffTotal = diffKeys.length * L.diffW + (diffKeys.length - 1) * L.diffGap;
  let dx = W / 2 - diffTotal / 2;
  for (const key of diffKeys) {
    const def = DIFFICULTY_DEFS[key];
    const locked = !isDifficultyUnlocked(key);
    const selected = save.difficulty === key;
    ctx.fillStyle = locked ? 'rgba(12,20,30,0.8)' : (selected ? 'rgba(255,170,60,0.95)' : 'rgba(16,32,50,0.88)');
    ctx.strokeStyle = selected ? '#ffe1a0' : (locked ? 'rgba(120,140,160,0.35)' : 'rgba(140,180,210,0.6)');
    ctx.lineWidth = selected ? 2 : 1.2;
    roundRect(dx, L.diffY, L.diffW, L.diffH, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = locked ? 'rgba(150,165,180,0.55)' : (selected ? '#20242c' : '#eaf2f8');
    ctx.font = '700 ' + Math.round(Math.min(17, L.diffH * 0.4)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, dx + L.diffW / 2, L.diffY + L.diffH / 2);
    ctx.textBaseline = 'alphabetic';
    if (locked) {
      ctx.fillStyle = 'rgba(170,185,200,0.6)';
      ctx.font = '500 ' + Math.round(Math.min(11, W * 0.015)) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('通关任意一章解锁', dx + L.diffW / 2, L.diffY + L.diffH + 18);
    }
    dx += L.diffW + L.diffGap;
  }

  // 左下角：选中机体数值对比（以「疾风」为基准）
  const sdef = PLANE_DEFS[save.selectedPlane];
  ctx.fillStyle = 'rgba(10,24,40,0.92)';
  ctx.strokeStyle = 'rgba(120,190,230,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(L.statX, L.statY, L.statW, L.statH, 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 ' + Math.round(Math.min(14, L.statW * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('机体属性 · ' + sdef.name, L.statX + 16, L.statY + 28);
  const rows = [
    ['血量', hangarPct(sdef.hpMult), sdef.hpMult - 1],
    ['机炮', hangarPct(sdef.gunDmgMult), sdef.gunDmgMult - 1],
    ['射速', hangarPct(sdef.fireRateMult), sdef.fireRateMult - 1],
    ['机动', hangarPct((sdef.turnMult + sdef.accelMult) / 2), (sdef.turnMult + sdef.accelMult) / 2 - 1],
    ['导弹', (sdef.missileBonus > 0 ? '+' : '') + sdef.missileBonus, sdef.missileBonus]
  ];
  let ry = L.statY + 56;
  ctx.font = '500 ' + Math.round(Math.min(12.5, L.statW * 0.04)) + 'px "Microsoft YaHei", sans-serif';
  for (const r of rows) {
    ctx.fillStyle = '#aebecd';
    ctx.textAlign = 'left';
    ctx.fillText(r[0], L.statX + 16, ry);
    ctx.textAlign = 'right';
    ctx.fillStyle = r[2] > 0 ? '#7dffb0' : (r[2] < 0 ? '#ff8f8f' : '#aebecd');
    ctx.fillText(r[1], L.statX + L.statW - 16, ry);
    ry += 24;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(170,200,215,0.55)';
  ctx.font = '500 ' + Math.round(Math.min(11, W * 0.015)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('以「疾风」为基准', L.statX + L.statW / 2, L.statY + L.statH - 12);

  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}
