// ---------- 成就界面 + 选关界面(任务书 13) ----------
const MISSION_TYPE_LABELS = { clear: '清场', escort: '护航', intercept: '拦截', survive: '坚守', race: '竞速', boss: 'BOSS' };
const SELECT_CHAPTERS = [
  { chapter: 1, name: '黎明防线' },
  { chapter: 2, name: '深海裂谷' },
  { chapter: 3, name: '风暴尽头' }
];

// 成就网格布局:宽屏 4 列 × 3 行,中屏 3 列 × 4 行,窄屏 2 列 × 6 行
function achievementsLayout() {
  const cols = W >= 1200 ? 4 : (W >= 700 ? 3 : 2);
  const rows = Math.ceil(ACHIEVEMENT_DEFS.length / cols);
  const cardW = cols === 4
    ? Math.min(300, (W * 0.9 - (cols - 1) * 14) / cols)
    : (cols === 3 ? Math.min(330, (W * 0.88 - (cols - 1) * 16) / cols)
                 : Math.min(340, (W * 0.92 - (cols - 1) * 16) / cols));
  const cardH = cols === 4 ? Math.min(130, H * 0.145)
    : (cols === 3 ? Math.min(120, H * 0.135) : Math.min(104, H * 0.115));
  const gapX = 16, gapY = 14;
  const gridW = cols * cardW + (cols - 1) * gapX;
  const gridH = rows * cardH + (rows - 1) * gapY;
  const startX = W / 2 - gridW / 2;
  const startY = H * 0.15;
  return { cols, rows, cardW, cardH, gapX, gapY, startX, startY, gridW, gridH };
}

function drawAchievements() {
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
  ctx.fillText('成就 · ' + ACHIEVEMENT_COUNT, W / 2, H * 0.08);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('已解锁 ' + (save.achievements ? save.achievements.length : 0) + ' / ' + ACHIEVEMENT_COUNT + ' 个成就', W / 2, H * 0.08 + 28);

  const L = achievementsLayout();
  const nameFont = Math.round(Math.min(17, L.cardW * 0.055));
  const smallFont = Math.round(Math.min(12, L.cardW * 0.042));
  const miniFont = Math.round(Math.min(11, L.cardW * 0.04));
  for (let i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
    const def = ACHIEVEMENT_DEFS[i];
    const col = i % L.cols, row = Math.floor(i / L.cols);
    const x = L.startX + col * (L.cardW + L.gapX);
    const y = L.startY + row * (L.cardH + L.gapY);
    const unlocked = isUnlocked(def.id);
    ctx.fillStyle = unlocked ? 'rgba(24,46,66,0.95)' : 'rgba(9,16,26,0.78)';
    ctx.strokeStyle = unlocked ? '#ffd166' : 'rgba(120,140,160,0.35)';
    ctx.lineWidth = unlocked ? 2 : 1.2;
    roundRect(x, y, L.cardW, L.cardH, 10);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    if (unlocked) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 ' + nameFont + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('✓', x + 16, y + 26);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(def.name, x + L.cardW / 2, y + 32);
    } else {
      ctx.fillStyle = 'rgba(170,185,200,0.55)';
      ctx.font = '800 ' + nameFont + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText(def.name, x + L.cardW / 2, y + 32);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText('🔒', x + L.cardW - 18, y + 24);
    }
    ctx.fillStyle = unlocked ? '#aebecd' : 'rgba(150,165,180,0.5)';
    ctx.font = '500 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(def.desc, x + L.cardW / 2, y + 58);
    ctx.fillStyle = unlocked ? 'rgba(125,255,176,0.85)' : 'rgba(150,165,180,0.5)';
    ctx.font = '600 ' + miniFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(unlocked ? '已解锁' : '未解锁', x + L.cardW / 2, y + L.cardH - 16);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

// 选关布局:3 个章节分组,每组 1 行 × 3 卡片
function selectLayout() {
  const cardW = Math.min(280, Math.max(150, W * 0.24));
  const cardH = Math.min(150, Math.max(104, H * 0.17));
  const gapX = Math.min(24, (W - cardW * 3) / 4);
  const gridW = cardW * 3 + gapX * 2;
  const startX = W / 2 - gridW / 2;
  const labelH = 30;
  const groupGap = Math.min(34, H * 0.045);
  const startY = H * 0.15;
  const groups = [];
  for (let i = 0; i < 3; i++) groups.push({ y: startY + i * (labelH + cardH + groupGap) });
  return { cardW, cardH, gapX, gridW, startX, labelH, groupGap, startY, groups };
}

// (x, y) → 关卡下标(0..8);未命中返回 -1
function selectCardAt(x, y) {
  const L = selectLayout();
  for (let g = 0; g < L.groups.length; g++) {
    const rowY = L.groups[g].y + L.labelH;
    if (y < rowY || y > rowY + L.cardH) continue;
    const col = Math.floor((x - L.startX) / (L.cardW + L.gapX));
    if (col < 0 || col > 2) return -1;
    const cx = L.startX + col * (L.cardW + L.gapX);
    if (x < cx || x > cx + L.cardW) return -1;
    return g * 3 + col;
  }
  return -1;
}

function drawSelect() {
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
  ctx.fillText('选择任务', W / 2, H * 0.08);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('战役共 ' + MISSION_DEFS.length + ' 关 · 已解锁 ' + save.unlockedMissions + ' 关', W / 2, H * 0.08 + 28);

  const L = selectLayout();
  const nameFont = Math.round(Math.min(17, L.cardW * 0.06));
  const smallFont = Math.round(Math.min(12, L.cardW * 0.045));
  for (let i = 0; i < MISSION_DEFS.length; i++) {
    const def = MISSION_DEFS[i];
    const gIdx = Math.floor(i / 3);
    const col = i % 3;
    const x = L.startX + col * (L.cardW + L.gapX);
    const y = L.groups[gIdx].y + L.labelH;
    const unlocked = def.index <= save.unlockedMissions;
    const rank = (save.bestRank && save.bestRank[def.index - 1]) || null;
    ctx.fillStyle = unlocked ? 'rgba(14,32,52,0.92)' : 'rgba(9,16,26,0.78)';
    ctx.strokeStyle = unlocked ? 'rgba(140,180,210,0.6)' : 'rgba(120,140,160,0.35)';
    ctx.lineWidth = 1.2;
    roundRect(x, y, L.cardW, L.cardH, 10);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = unlocked ? '#ffffff' : 'rgba(170,185,200,0.55)';
    ctx.font = '800 ' + nameFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(def.name, x + L.cardW / 2, y + 32);
    const tlabel = MISSION_TYPE_LABELS[def.type] || String(def.type);
    ctx.fillStyle = unlocked ? 'rgba(70,150,200,0.35)' : 'rgba(80,95,110,0.7)';
    ctx.strokeStyle = unlocked ? 'rgba(127,212,255,0.6)' : 'rgba(120,140,160,0.3)';
    ctx.lineWidth = 1;
    const tagW = Math.min(72, L.cardW - 24);
    roundRect(x + L.cardW / 2 - tagW / 2, y + 42, tagW, 20, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = unlocked ? '#7fd4ff' : 'rgba(150,165,180,0.55)';
    ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(tlabel, x + L.cardW / 2, y + 42 + 14);
    ctx.fillStyle = rank ? (RANK_COLORS[rank] || '#aebecd') : 'rgba(150,165,180,0.55)';
    ctx.font = '700 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('最佳评级 ' + (rank || '-'), x + L.cardW / 2, y + 86);
    ctx.fillStyle = unlocked ? 'rgba(125,255,176,0.85)' : 'rgba(255,255,255,0.45)';
    ctx.font = '600 ' + smallFont + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(unlocked ? '可出击' : '🔒 通关前一任务解锁', x + L.cardW / 2, y + L.cardH - 14);
  }
  for (let gIdx = 0; gIdx < SELECT_CHAPTERS.length; gIdx++) {
    const ch = SELECT_CHAPTERS[gIdx];
    ctx.fillStyle = '#dfe9f2';
    ctx.font = '700 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('第 ' + ch.chapter + ' 章 · ' + ch.name, W / 2 - L.gridW / 2, L.groups[gIdx].y + 18);
    ctx.fillStyle = 'rgba(120,180,220,0.4)';
    ctx.fillRect(W / 2 - L.gridW / 2, L.groups[gIdx].y + 24, L.gridW, 1);
  }
  ctx.textAlign = 'center';
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

// 标题页成就段点击热区(与 drawTitle 中的成就文案位置一致)
function titleAchRegion() {
  const achText = '成就 ' + (save.achievements ? save.achievements.length : 0) + '/' + ACHIEVEMENT_COUNT;
  const statsText = '击坠 ' + save.totalKills + ' · 通关 ' + save.missionsCleared + ' · 无尽最高 ' + save.bestKills;
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  const aW = ctx.measureText(achText).width;
  const gW = ctx.measureText('  ｜  ').width;
  const sW = ctx.measureText(statsText).width;
  const total = aW + gW + sW;
  let hintY = H * 0.78;
  for (const b of menuButtons) hintY = Math.max(hintY, b.y + b.h);
  hintY += 26;
  return { x: W / 2 - total / 2, y: hintY - 20, w: aW + gW, h: 34 };
}

function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a2540');
  g.addColorStop(0.55, '#124d6e');
  g.addColorStop(1, '#1a6a7d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const time = gameTime;
  for (let i = 0; i < 22; i++) {
    const x = ((i * 137 + time * (8 + i % 5)) % (W + 300)) - 150;
    const y = ((i * 211 + time * (4 + i % 3) * 0.4) % (H + 200)) - 100;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + (i % 3) * 0.03) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, 70 + i * 7 % 90, 24 + i * 5 % 30, 0, 0, TAU);
    ctx.fill();
  }
  const jx = W * 0.24, jy = H * 0.34;
  ctx.save();
  ctx.translate(jx, jy);
  ctx.rotate(-0.35 + Math.sin(time * 0.6) * 0.05);
  ctx.scale(2.2, 2.2);
  drawPlayerJet({ speed: 260, afterburn: true, hitFlash: 0 });
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = 'rgba(255,150,40,0.55)';
  ctx.shadowBlur = 26;
  ctx.font = '900 ' + Math.round(Math.min(76, W * 0.11)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('苍穹之翼', W / 2, H * 0.26);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#bde4f5';
  ctx.font = '600 ' + Math.round(Math.min(18, W * 0.03)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('SKYFIRE ACES  ·  仿皇牌空战风格单机空战', W / 2, H * 0.26 + 34);
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('摧毁敌机 · 锁定导弹 · 完成任务，夺得王牌评价', W / 2, H * 0.26 + 62);

  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);

  let hintY = H * 0.78;
  for (const b of menuButtons) hintY = Math.max(hintY, b.y + b.h);
  hintY += 26;
  // 成就计数并入战绩行(任务书 13:修复与按钮区重叠),成就段可点击进入成就界面
  const achText = '成就 ' + (save.achievements ? save.achievements.length : 0) + '/' + ACHIEVEMENT_COUNT;
  const statsText = '击坠 ' + save.totalKills + ' · 通关 ' + save.missionsCleared + ' · 无尽最高 ' + save.bestKills;
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  const gapText = '  ｜  ';
  const aW = ctx.measureText(achText).width;
  const gW = ctx.measureText(gapText).width;
  const sW = ctx.measureText(statsText).width;
  const segX = W / 2 - (aW + gW + sW) / 2;
  ctx.fillStyle = 'rgba(255,209,102,0.95)';
  ctx.fillText(achText, segX + aW / 2, hintY);
  ctx.fillStyle = 'rgba(210,230,240,0.75)';
  ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(statsText, segX + aW + gW + sW / 2, hintY);
  const lines = [
    '操作：鼠标瞄准 ｜ ' + prettyKey(bindFor('gun')) + ' 机炮 ｜ ' + prettyKey(bindFor('missile')) + ' 导弹 ｜ ' + prettyKey(bindFor('dash')) + ' 突进 ｜ ' + prettyKey(bindFor('rollLeft')) + '/' + prettyKey(bindFor('rollRight')) + ' 滚筒',
    prettyKey(bindFor('throttleUp')) + '/' + prettyKey(bindFor('throttleDown')) + ' 油门 ｜ ' + prettyKey(bindFor('afterburn')) + ' 加力 ｜ ' + prettyKey(bindFor('pause')) + ' 暂停 ｜ ' + prettyKey(bindFor('mute')) + ' 静音'
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, hintY + 24 + i * 24);
  }
  ctx.fillStyle = 'rgba(170,200,215,0.55)';
  ctx.font = '500 ' + Math.round(Math.min(12, W * 0.017)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('点击任意位置开始', W / 2, hintY + 24 + lines.length * 24 + 16);
}

function drawBriefing() {
  const def = MISSION_DEFS[GAME.missionIndex];
  ctx.fillStyle = 'rgba(5,12,22,0.86)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(620, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.12, bh = H * 0.58;
  ctx.fillStyle = 'rgba(10,24,40,0.92)';
  ctx.strokeStyle = 'rgba(120,190,230,0.45)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 ' + Math.round(Math.min(17, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务简报', W / 2, by + 40);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(def.code, W / 2, by + 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 ' + Math.round(Math.min(38, W * 0.055)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(def.name, W / 2, by + 122);
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '500 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  const words = def.brief;
  let line = '';
  let y = by + 168;
  for (const ch of words) {
    line += ch;
    const w = ctx.measureText(line).width;
    if (w > bw - 80 && ch !== '，') {
      ctx.fillText(line, W / 2, y);
      y += 28;
      line = '';
    }
  }
  ctx.fillText(line, W / 2, y);
  y += 44;
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 ' + Math.round(Math.min(16, W * 0.021)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务目标：' + def.objective, W / 2, y);
  y += 34;
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('机体：' + PLANE_DEFS[save.selectedPlane].name + ' ｜ 难度：' + DIFFICULTY_DEFS[save.difficulty].name, W / 2, y);
  y += 26;
  ctx.fillText('载弹：机炮 无限 ｜ 导弹 ×' + player.maxMissiles, W / 2, y);
  y += 26;
  ctx.fillText('空域：' + THEMES[def.theme].name, W / 2, y);
  y += 26;
  ctx.fillText('等级评价由时间、损伤与连击共同决定', W / 2, y);
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawComplete() {
  const s = GAME.endStats;
  if (!s) return;
  ctx.fillStyle = 'rgba(4,10,18,0.88)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(560, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.10, bh = H * 0.58;
  ctx.fillStyle = 'rgba(10,24,40,0.94)';
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(34, W * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('任务完成', W / 2, by + 52);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(s.code + '  ' + s.missionName, W / 2, by + 84);
  if (typeof drawRatingPanel === 'function' && s.rating) {
    drawRatingPanel(s);
  } else {
    const rankSize = Math.round(Math.min(86, W * 0.12));
    ctx.font = '900 ' + rankSize + 'px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = s.rank === 'S' ? '#ffd166' : (s.rank === 'A' ? '#ff9f43' : '#dfe9f2');
    ctx.shadowColor = 'rgba(255,180,60,0.6)';
    ctx.shadowBlur = 22;
    ctx.fillText('评级 ' + s.rank, W / 2, by + 150);
    ctx.shadowBlur = 0;
  }
  const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
  const rows = [
    ['任务用时', mm + ':' + (ss < 10 ? '0' : '') + ss],
    ['击坠数', s.kills],
    ['承受损伤', Math.round(s.damage) + '%'],
    ['时间奖励', '+' + fmt(s.timeBonus)],
    ['总得分', fmt(s.score)]
  ];
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  let y = by + 232;
  for (const [k, v] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aebecd';
    ctx.fillText(k, bx + 56, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(v), bx + bw - 56, y);
    y += 30;
  }
  if (GAME.missionIndex >= MISSION_DEFS.length - 1) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(Math.min(18, W * 0.023)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('战役通关！自由出击模式已解锁，挑战极限分数吧。', W / 2, y + 12);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawGameOver() {
  const s = GAME.endStats;
  if (!s) return;
  ctx.fillStyle = 'rgba(16,5,6,0.9)';
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(560, W * 0.86);
  const bx = W / 2 - bw / 2, by = H * 0.12, bh = H * 0.56;
  ctx.fillStyle = 'rgba(30,10,14,0.94)';
  ctx.strokeStyle = 'rgba(255,90,70,0.55)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6b5e';
  if (s.success) {
    ctx.font = '900 ' + Math.round(Math.min(36, W * 0.048)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('出击结束', W / 2, by + 54);
  } else {
    // P39: 失败标题改俏皮话(finishMission 已按波数/尝试次数分组随机选好, 长句自适应字号)
    const failLine = s.failLine || '任务结束';
    const flSize = Math.round(Math.min(20, W * 0.026, (bw * 0.92) / Math.max(1, failLine.length)));
    ctx.font = '900 ' + flSize + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(failLine, W / 2, by + 54);
  }
  ctx.fillStyle = '#f0b9b4';
  ctx.font = '600 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(s.code + '  ' + s.missionName, W / 2, by + 86);
  const rows = buildGameOverStats(s, GAME.mode === 'endless');
  ctx.font = '600 ' + Math.round(Math.min(15, W * 0.02)) + 'px "Microsoft YaHei", sans-serif';
  let y = by + 130;
  for (const [k, v] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8a7a2';
    ctx.fillText(k, bx + 56, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(v), bx + bw - 56, y);
    y += 32;
  }
  if (GAME.mode === 'endless') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 ' + Math.round(Math.min(17, W * 0.022)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('坚持到第 ' + (mission ? mission.waveIndex : 1) + ' 波', W / 2, y + 10);
  } else {
    ctx.fillStyle = '#d8a7a2';
    ctx.font = '500 ' + Math.round(Math.min(13, W * 0.018)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText('出击记录已统计，稍作休整后再次升空', W / 2, y + 10);
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawPaused() {
  ctx.fillStyle = 'rgba(4,10,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '900 ' + Math.round(Math.min(40, W * 0.05)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('已暂停', W / 2, H * 0.34);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(input.isTouch ? '点击「继续战斗」继续' : '按 P / Esc 继续战斗', W / 2, H * 0.34 + 34);
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function drawUpgradeChoice() {
  if (!upgradeChoice) return;
  const c = upgradeChoice;
  const L = upgradeChoiceLayout();
  const portraitTouch = input.isTouch && W < H;
  ctx.fillStyle = 'rgba(4,10,18,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,24,40,0.96)';
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  roundRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(30, W * 0.04)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('武器补给 · 三选一', W / 2, L.panel.y + 42);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('Lv.' + GAME.level + ' 选择一项武器，本局生效', W / 2, L.panel.y + 68);
  for (let i = 0; i < c.options.length; i++) {
    const o = c.options[i];
    const def = DROP_WEAPONS[o.id];
    const wName = QUALITY_NAME[o.quality] + ' ' + def.name;
    const wColor = QUALITY_COLOR[o.quality];
    const card = L.cards[i];
    const cardX = card.x, cardY = card.y, cardW = card.w, cardH = card.h;
    const hovered = hoverUpgradeCard(cardX, cardY, cardW, cardH);
    const selected = !input.isTouch && upgradeChoiceSel === i;
    const highlighted = input.isTouch ? hovered : selected;
    ctx.fillStyle = highlighted ? 'rgba(30,60,90,0.95)' : 'rgba(16,38,60,0.9)';
    ctx.strokeStyle = highlighted ? wColor : 'rgba(140,180,210,0.6)';
    ctx.lineWidth = highlighted ? 3 : 1.5;
    ctx.shadowColor = selected ? wColor : 'transparent';
    ctx.shadowBlur = selected ? 12 : 0;
    roundRect(cardX, cardY, cardW, cardH, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = wColor;
    const nameSize = portraitTouch ? 14 : Math.round(Math.min(19, W * 0.024));
    const descSize = portraitTouch ? 12 : Math.round(Math.min(13, W * 0.017));
    const metaSize = portraitTouch ? 11 : Math.round(Math.min(12, W * 0.016));
    ctx.font = '700 ' + nameSize + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wName, cardX + cardW / 2, cardY + (portraitTouch ? 40 : 34), cardW - 12);
    ctx.fillStyle = '#e8f1f7';
    ctx.font = '600 ' + descSize + 'px "Microsoft YaHei", sans-serif';
    if (portraitTouch) {
      const descLines = wrapCharacters(def.desc, cardW - 16, 2);
      for (let line = 0; line < descLines.length; line++) {
        ctx.fillText(descLines[line], cardX + cardW / 2, cardY + 78 + line * 18, cardW - 16);
      }
    } else {
      ctx.fillText(def.desc, cardX + cardW / 2, cardY + 66);
    }
    ctx.fillStyle = def.limited ? '#ff9f43' : '#7f97a8';
    ctx.font = '700 ' + metaSize + 'px "Microsoft YaHei", sans-serif';
    const ammo = Math.max(1, Math.round(def.per * QUALITY_MULT[o.quality]));
    const metaText = def.limited ? '弹药 ×' + ammo : '无限弹药 · 重复可升级';
    if (portraitTouch) {
      const metaLines = wrapCharacters(metaText, cardW - 16, 2);
      for (let line = 0; line < metaLines.length; line++) {
        ctx.fillText(metaLines[line], cardX + cardW / 2, cardY + 124 + line * 17, cardW - 16);
      }
    } else {
      ctx.fillText(metaText, cardX + cardW / 2, cardY + 92);
    }
  }
  const skipHovered = inRect(input.mouse.x, input.mouse.y, L.skip);
  const skipSelected = !input.isTouch && upgradeChoiceSel === 3;
  const skipHighlighted = input.isTouch ? skipHovered : skipSelected;
  ctx.fillStyle = skipHighlighted ? 'rgba(62,80,96,0.98)' : 'rgba(35,51,66,0.96)';
  ctx.strokeStyle = skipHighlighted ? '#ffd166' : 'rgba(174,190,205,0.72)';
  ctx.lineWidth = skipHighlighted ? 3 : 1.5;
  ctx.shadowColor = skipSelected ? '#ffd166' : 'transparent';
  ctx.shadowBlur = skipSelected ? 12 : 0;
  roundRect(L.skip.x, L.skip.y, L.skip.w, L.skip.h, 8);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '700 ' + (portraitTouch ? 14 : Math.round(Math.min(15, W * 0.02))) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('放弃并保留当前装备', L.skip.x + L.skip.w / 2, L.skip.y + L.skip.h / 2 + 5);
}

function upgradeChoiceLayout() {
  const margin = Math.max(8, Math.min(24, W * 0.03));
  const panelW = Math.min(720, W - margin * 2);
  const panelX = (W - panelW) / 2;
  const panelY = Math.max(8, Math.min(H * 0.16, 72));
  const panelH = Math.min(H - panelY - 8, H < 480 ? 352 : 430);
  const inner = Math.max(8, Math.min(16, panelW * 0.025));
  const gap = Math.max(6, Math.min(16, panelW * 0.02));
  const cardW = (panelW - inner * 2 - gap * 2) / 3;
  const cardY = panelY + (H < 480 ? 78 : 92);
  const skipH = Math.max(44, Math.min(52, H * 0.065));
  const skipY = panelY + panelH - skipH - inner;
  const cardH = Math.max(112, skipY - gap - cardY);
  const cards = [];
  for (let i = 0; i < 3; i++) cards.push({ x: panelX + inner + i * (cardW + gap), y: cardY, w: cardW, h: cardH });
  const skipW = Math.min(320, panelW - inner * 2);
  return {
    panel: { x: panelX, y: panelY, w: panelW, h: panelH },
    cards,
    skip: { x: W / 2 - skipW / 2, y: skipY, w: skipW, h: skipH }
  };
}

// ---------- P36 控制方案(键鼠/纯键盘)选择 ----------
// P36-R1: 首次询问触发收紧——只在真实 UI 出击/开始入口按钮(pointerdown/keydown 处理器)调用;
// startMission/startEndless 本体与 setState('playing') 均不弹询问(修复 hud-pause 58/61、hit-feedback 23/25 回归)
function maybeAskControlScheme() {
  if (input.isTouch) return;
  if (!controlSchemeChosen && !controlSchemeAsk) {
    controlSchemeAsk = true;
    controlSchemeAskSel = 0;
  }
}
function controlSchemeAskLayout() {
  const panelW = Math.min(660, W - 24);
  const panelX = (W - panelW) / 2;
  const panelH = Math.min(300, H * 0.40);
  const panelY = Math.max(8, Math.min(H * 0.30, (H - panelH) / 2));
  const gap = 14;
  const btnW = (panelW - 48 - gap) / 2;
  const btnH = Math.min(92, Math.max(64, panelH * 0.32));
  const btnY = panelY + panelH - btnH - 24;
  return {
    panel: { x: panelX, y: panelY, w: panelW, h: panelH },
    buttons: [
      { x: panelX + 24, y: btnY, w: btnW, h: btnH, scheme: 'keyboard+mouse', label: '键鼠', desc: '鼠标控制转向 + 键盘' },
      { x: panelX + 24 + btnW + gap, y: btnY, w: btnW, h: btnH, scheme: 'keyboard-only', label: '纯键盘', desc: '键盘控制, 鼠标仅界面点击' }
    ]
  };
}
function chooseControlScheme(scheme) {
  save.controlScheme = scheme === 'keyboard-only' ? 'keyboard-only' : 'keyboard+mouse';
  controlSchemeChosen = true;
  controlSchemeAsk = false;
  controlSchemeAskSel = 0;
  saveNow();
  AudioSys.click();
}
function drawControlSchemeAsk() {
  if (!controlSchemeAsk) return;
  const L = controlSchemeAskLayout();
  ctx.fillStyle = 'rgba(4,10,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,24,40,0.96)';
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  roundRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h, 12);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(30, W * 0.04)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('选择操作方式', W / 2, L.panel.y + 46);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + Math.round(Math.min(14, W * 0.019)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText('首次出击: 请选择自机控制方式, 之后可随时在「按键设置」中更改', W / 2, L.panel.y + 74);
  for (let i = 0; i < L.buttons.length; i++) {
    const b = L.buttons[i];
    const hovered = inRect(input.mouse.x, input.mouse.y, b) || controlSchemeAskSel === i;
    ctx.fillStyle = hovered ? 'rgba(30,60,90,0.95)' : 'rgba(16,38,60,0.9)';
    ctx.strokeStyle = hovered ? '#ffd166' : 'rgba(140,180,210,0.6)';
    ctx.lineWidth = hovered ? 3 : 1.5;
    roundRect(b.x, b.y, b.w, b.h, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = hovered ? '#ffd166' : '#dfe9f2';
    ctx.font = '700 ' + Math.round(Math.min(20, W * 0.026)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 40);
    ctx.fillStyle = '#aebecd';
    ctx.font = '500 ' + Math.round(Math.min(13, W * 0.017)) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(b.desc, b.x + b.w / 2, b.y + 66);
  }
}

function hoverUpgradeCard(x, y, w, h) {
  if (!upgradeChoice) return false;
  return input.mouse.x >= x && input.mouse.x <= x + w && input.mouse.y >= y && input.mouse.y <= y + h;
}

function hoverButton() {
  const mx = input.mouse.x, my = input.mouse.y;
  for (const b of menuButtons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b;
  }
  return null;
}

function drawTransition() {
  if (!transition.active) return;
  ctx.fillStyle = 'rgba(4,10,18,' + transition.alpha.toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
}
