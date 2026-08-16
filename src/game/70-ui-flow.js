// ---------- state ----------
function setState(s) {
  const previousState = GAME.state;
  GAME.state = s;
  // P36-R1: 首次询问不再于 setState 触发——任何直接置 state='playing' 的路径绝不出现询问浮层;
  // 询问仅由真实 UI 出击/开始入口按钮(pointerdown/keydown 处理器)经 maybeAskControlScheme() 触发
  if (s === 'title') player.contactCd = 0;   // 返回标题重置接触冷却(任务书 31)
  if (s === 'settings' && previousState !== 'settings') {
    settingsScrollY = 0;
    settingsDrag.id = null;
    if (input.isTouch) captureBind = null;
  }
  menuButtons = [];
  if (s === 'title' || s === 'briefing' || s === 'complete' || s === 'gameover' || s === 'paused' || s === 'settings' || s === 'hangar' || s === 'achievements' || s === 'select') {
    buildMenuButtons(s);
  }
  if (typeof MusicSys !== 'undefined' && MusicSys.play) {
    MusicSys.play(s === 'playing' ? (mission && mission.boss ? 'boss' : 'combat') : 'title');
  }
}

// ---------- P33 暂停状态机(统一入口: 键盘 Esc/P / 触屏按钮 / 后台事件共用) ----------
function requestPause(source) {
  if (GAME.state !== 'playing') return false;
  if (transition.active) return false;
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) return false;
  // 升级模态下键盘 P 保持历史语义: 暂停且模态保留(Esc 才放弃, 见 keydown 分支); 触屏按钮在该模态下由 combatTouchControlsActive() 屏蔽
  setState('paused');
  // 进入暂停清理触控/持续开火/转向状态(防恢复粘键)
  input.touch.pauseId = null;
  input.touch.mslId = null;
  input.touch.dashId = null;
  input.touch.throttleBarId = null;
  input.touch.swipeId = null;
  input.fireHeld = false; input.mslHeld = false;
  input.mouse.down = false;
  touchSwipe.active = false; touchSwipe.dir = null;
  lastTime = performance.now();   // 恢复首帧 dt 钳制(与 loop 的 min(0.05) 双保险)
  return true;
}
function requestResume() {
  if (GAME.state !== 'paused') return false;
  lastTime = performance.now();   // 重置上一帧时间戳, 防大跨度 dt 弹体/计时清零/转向突跳
  setState('playing');
  return true;
}

function buildMenuButtons(state) {
  const cx = W / 2;
  const bw = Math.min(360, W * 0.72);
  function stack(items, preferredTop) {
    const count = items.length;
    const margin = 8;
    const bh = Math.min(54, Math.max(44, Math.floor((H - margin * 2 - Math.max(0, count - 1) * 8) / count)));
    const maxGap = count > 1 ? (H - margin * 2 - count * bh) / (count - 1) : 14;
    const gap = count > 1 ? Math.max(8, Math.min(14, maxGap)) : 0;
    const totalH = count * bh + Math.max(0, count - 1) * gap;
    const top = clamp(preferredTop, margin, H - margin - totalH);
    return items.map((it, i) => ({ x: cx - bw / 2, y: top + (bh + gap) * i, w: bw, h: bh, label: it.label, action: it.action, primary: !!it.primary }));
  }
  function footerPair(items, preferredTop) {
    const bh = Math.min(54, Math.max(44, H - 16));
    const y = clamp(preferredTop, 8, H - 8 - bh);
    return [
      { x: cx - bw / 2, y, w: bw * 0.48, h: bh, label: items[0].label, action: items[0].action, primary: !!items[0].primary },
      { x: cx + 18, y, w: bw * 0.48 - 18, h: bh, label: items[1].label, action: items[1].action, primary: !!items[1].primary }
    ];
  }
  if (state === 'title') {
    const titleItems = [
      { label: '战役模式', primary: true, action: () => { AudioSys.click(); GAME.mode = 'campaign'; setState('select'); } },
      { label: '自由出击', primary: false, action: () => { AudioSys.click(); maybeAskControlScheme(); GAME.mode = 'endless'; startTransition(() => startEndless()); } },
      { label: '机库', primary: false, action: () => { AudioSys.click(); setState('hangar'); } },
      { label: input.isTouch ? '设置' : '按键设置', primary: false, action: () => { AudioSys.click(); settingsReturn = 'title'; setState('settings'); } }
    ];
    menuButtons = stack(titleItems, H * 0.60);
  } else if (state === 'briefing') {
    menuButtons = stack([
      { label: '出击', action: () => { AudioSys.click(); maybeAskControlScheme(); startTransition(() => startMission(GAME.missionIndex, GAME.mode)); }, primary: true },
      { label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { GAME.mode = 'campaign'; setState('title'); }); } },
      { label: '选择任务', action: () => { AudioSys.click(); setState('select'); } }
    ], H * 0.72);
  } else if (state === 'complete') {
    const isLast = GAME.missionIndex >= Math.min(save.unlockedMissions, MISSION_DEFS.length) - 1;
    if (isLast) {
      menuButtons = stack([
        { label: '自由出击', action: () => { AudioSys.click(); maybeAskControlScheme(); startTransition(() => startEndless()); }, primary: true },
        { label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
      ], H * 0.78);
    } else {
      menuButtons = stack([
        { label: '下一任务 (解锁进度 ' + save.unlockedMissions + '/' + MISSION_DEFS.length + ')', action: () => { AudioSys.click(); startTransition(() => { GAME.missionIndex++; setState('briefing'); }); }, primary: true },
        { label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
      ], H * 0.78);
    }
  } else if (state === 'gameover') {
    const retryLabel = GAME.mode === 'endless' ? '再战一轮' : '重新出击';
    menuButtons = stack([
      { label: retryLabel, action: () => { AudioSys.click(); maybeAskControlScheme(); if (GAME.mode === 'endless') startTransition(() => startEndless()); else startTransition(() => startMission(GAME.missionIndex, 'campaign')); }, primary: true },
      { label: '返回标题', action: () => { AudioSys.click(); startTransition(() => { setState('title'); }); } }
    ], H * 0.78);
  } else if (state === 'paused') {
    menuButtons = stack([
      { label: '继续战斗', action: () => { AudioSys.click(); requestResume(); }, primary: true },
      { label: '重新开始任务', action: () => { AudioSys.click(); maybeAskControlScheme(); startTransition(() => { if (GAME.mode === 'endless') startEndless(); else startMission(GAME.missionIndex, 'campaign'); }); } },
      { label: input.isTouch ? '设置' : '按键设置', action: () => { AudioSys.click(); settingsReturn = 'paused'; setState('settings'); } },
      { label: '返回标题', action: () => { AudioSys.click(); GAME.pendingTimer = 0; GAME.pendingState = null; startTransition(() => { setState('title'); }); } }
    ], H * 0.52);
  } else if (state === 'settings') {
    menuButtons = footerPair([
      { label: '恢复默认', action: () => {
        AudioSys.click();
        keybinds = Object.assign({}, DEFAULT_BINDS);
        saveKeybinds();
        save.sfxVolume = SFX_VOLUME_DEFAULT;
        save.engineVolume = ENGINE_VOLUME_DEFAULT;
        if (!input.isTouch) {
          save.controlScheme = 'keyboard+mouse';
          controlSchemeChosen = true;
        }
        saveNow();
      } },
      { label: '返回', action: () => { AudioSys.click(); setState(settingsReturn || 'title'); } }
    ], H * 0.88);
  } else if (state === 'hangar') {
    menuButtons = footerPair([
      { label: '返回', action: () => { AudioSys.click(); setState('title'); } },
      { label: '成就', action: () => { AudioSys.click(); achievementsReturn = 'hangar'; setState('achievements'); } }
    ], H * 0.86);
  } else if (state === 'achievements') {
    menuButtons = stack([{ label: achievementsReturn === 'hangar' ? '返回机库' : '返回标题', action: () => { AudioSys.click(); setState(achievementsReturn || 'title'); } }], H * 0.88);
  } else if (state === 'select') {
    menuButtons = stack([{ label: '返回标题', action: () => { AudioSys.click(); setState('title'); } }], H * 0.90);
  }
}

function settingsMetrics() {
  const touchPortrait = input.isTouch && W < H;
  const rowW = Math.min(touchPortrait ? W - 28 : 560, W * 0.9);
  const rowX = W / 2 - rowW / 2;
  const viewportTop = Math.max(72, H * 0.115);
  const footerTop = menuButtons.length ? Math.min.apply(null, menuButtons.map(b => b.y)) : H * 0.88;
  const viewportBottom = Math.max(viewportTop + 120, footerTop - 12);
  const rowH = touchPortrait ? 48 : 46;
  const volumeRowH = touchPortrait ? 44 : 38;
  const controlH = touchPortrait ? 44 : 38;
  const contentH = SETTINGS_ACTIONS.length * rowH + 14 + volumeRowH * 2 + 16 + controlH + 18;
  return { touchPortrait, rowW, rowX, rowH, volumeRowH, controlH, viewportTop, viewportBottom,
    viewportH: viewportBottom - viewportTop, contentH };
}

function settingsMaxScroll() {
  const M = settingsMetrics();
  return Math.max(0, M.contentH - M.viewportH);
}

function settingsLayout() {
  const M = settingsMetrics();
  settingsScrollY = clamp(settingsScrollY, 0, settingsMaxScroll());
  return Object.assign({}, M, { startY: M.viewportTop + 4 - settingsScrollY });
}

function settingsRowAt(x, y) {
  const L = settingsLayout();
  if (y < L.viewportTop || y > L.viewportBottom) return null;
  if (x < L.rowX || x > L.rowX + L.rowW) return null;
  const idx = Math.floor((y - L.startY) / L.rowH);
  if (idx < 0 || idx >= SETTINGS_ACTIONS.length) return null;
  const rowY = L.startY + idx * L.rowH;
  if (y < rowY || y > rowY + L.rowH) return null;
  return SETTINGS_ACTIONS[idx];
}

// ---------- P34.2 音量设置(settings 屏: 音效/引擎两路, 0~1 步进 0.1, 存 save) ----------
function volumeRowsLayout() {
  const L = settingsLayout();
  const rowH = L.volumeRowH;
  const y0 = L.startY + SETTINGS_ACTIONS.length * L.rowH + 14;
  return { x: L.rowX, w: L.rowW, rowH, y0, rows: [
    { y: y0, key: 'sfxVolume', label: '音效音量' },
    { y: y0 + rowH + 8, key: 'engineVolume', label: '引擎音量' }
  ] };
}
function volumeRowAt(x, y) {
  const VL = volumeRowsLayout();
  const L = settingsLayout();
  if (y < L.viewportTop || y > L.viewportBottom) return null;
  for (const r of VL.rows) {
    if (y < r.y || y > r.y + VL.rowH || x < VL.x || x > VL.x + VL.w) continue;
    const bw = L.touchPortrait ? 54 : 64, minusX = VL.x + VL.w * 0.52, plusX = VL.x + VL.w * 0.78;
    if (x >= minusX && x <= minusX + bw) return { key: r.key, dir: -1 };
    if (x >= plusX && x <= plusX + bw) return { key: r.key, dir: 1 };
    return null;
  }
  return null;
}
// ---------- P36 操作方式设置行(键鼠/纯键盘 随时切换, 即改即存) ----------
function controlSchemeRowLayout() {
  const VL = volumeRowsLayout();
  const L = settingsLayout();
  const y = VL.y0 + VL.rows.length * (VL.rowH + 8) + 4;
  const h = L.controlH;
  return { x: L.rowX, w: L.rowW, y, h };
}
function controlSchemeRowAt(x, y) {
  if (input.isTouch) return false;
  const L = settingsLayout();
  if (y < L.viewportTop || y > L.viewportBottom) return false;
  const R = controlSchemeRowLayout();
  return (x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) ? true : false;
}

function startBindCapture(action) {
  captureBind = action;
  AudioSys.click();
}

function completeBindCapture(code) {
  if (!captureBind) return;
  keybinds[captureBind] = code;
  captureBind = null;
  saveKeybinds();
  AudioSys.click();
}

function handleSettingsPress(x, y) {
  for (const b of menuButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.action();
      return true;
    }
  }
  const row = settingsRowAt(x, y);
  if (row) {
    if (input.isTouch) return true;
    startBindCapture(row.action);
    return true;
  }
  const vr = volumeRowAt(x, y);
  if (vr) {
    const cur = typeof save[vr.key] === 'number' ? save[vr.key] : 1;
    save[vr.key] = Math.round(clamp(cur + vr.dir * 0.1, 0, 1) * 10) / 10;
    saveNow();
    AudioSys.click();
    return true;
  }
  if (controlSchemeRowAt(x, y)) {
    // P36: 「操作方式」行随时切换, 即改即存; 设置中切换同样视为已选择, 不再弹首次询问
    save.controlScheme = save.controlScheme === 'keyboard-only' ? 'keyboard+mouse' : 'keyboard-only';
    controlSchemeChosen = true;
    saveNow();
    AudioSys.click();
    return true;
  }
  return false;
}

function drawSettings() {
  ctx.fillStyle = 'rgba(4,10,18,0.94)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '900 ' + Math.round(Math.min(34, W * 0.045)) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(input.isTouch ? '设置' : '按键设置', W / 2, H * 0.065);
  ctx.fillStyle = '#aebecd';
  ctx.font = '500 ' + (input.isTouch ? 12 : Math.round(Math.min(13, W * 0.018))) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(input.isTouch ? 'PC 按键只读' : '点击动作后按下新按键；支持键盘、鼠标左/中/右键；Esc 取消本次修改', W / 2, H * 0.095);
  const L = settingsLayout();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, L.viewportTop, W, L.viewportH);
  ctx.clip();
  for (let i = 0; i < SETTINGS_ACTIONS.length; i++) {
    const row = SETTINGS_ACTIONS[i];
    const y = L.startY + i * L.rowH;
    const active = captureBind === row.action;
    ctx.globalAlpha = input.isTouch ? 0.58 : 1;
    ctx.fillStyle = active ? 'rgba(35,70,105,0.95)' : 'rgba(14,32,52,0.85)';
    ctx.strokeStyle = active ? '#ffd166' : 'rgba(140,180,210,0.5)';
    ctx.lineWidth = active ? 2.5 : 1.2;
    roundRect(L.rowX, y, L.rowW, L.rowH - 6, 7);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = active ? '#ffd166' : '#dfe9f2';
    ctx.font = '600 ' + (L.touchPortrait ? 13 : Math.round(Math.min(15, W * 0.02))) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(row.label, L.rowX + 18, y + L.rowH * 0.62);
    ctx.textAlign = 'right';
    ctx.fillStyle = active ? '#9be3ff' : '#7fd4ff';
    ctx.fillText(active ? '请按键...' : prettyKey(bindFor(row.action)), L.rowX + L.rowW - 18, y + L.rowH * 0.62);
    ctx.globalAlpha = 1;
  }
  const VL = volumeRowsLayout();
  for (const r of VL.rows) {
    ctx.fillStyle = 'rgba(14,32,52,0.85)';
    ctx.strokeStyle = 'rgba(140,180,210,0.5)';
    ctx.lineWidth = 1.2;
    roundRect(VL.x, r.y, VL.w, VL.rowH - 6, 7);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#dfe9f2';
    ctx.font = '600 ' + (L.touchPortrait ? 13 : Math.round(Math.min(15, W * 0.02))) + 'px "Microsoft YaHei", sans-serif';
    ctx.fillText(r.label, VL.x + 18, r.y + VL.rowH * 0.62);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(Math.round(((typeof save[r.key] === 'number' ? save[r.key] : 1)) * 100) + '%', VL.x + VL.w * 0.5 - 30, r.y + VL.rowH * 0.62);
    const buttonW = L.touchPortrait ? 54 : 64;
    const btns = [[VL.x + VL.w * 0.52, '−'], [VL.x + VL.w * 0.78, '+']];
    for (const [bx, bl] of btns) {
      ctx.fillStyle = 'rgba(35,70,105,0.95)';
      ctx.strokeStyle = '#ffd166';
      roundRect(bx, r.y + 4, buttonW, Math.max(14, VL.rowH - 12), 6);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9be3ff';
      ctx.font = '700 ' + Math.round(Math.min(16, W * 0.021)) + 'px "Microsoft YaHei", sans-serif';
      ctx.fillText(bl, bx + buttonW / 2, r.y + VL.rowH * 0.62);
    }
  }
  const CR = controlSchemeRowLayout();
  ctx.globalAlpha = input.isTouch ? 0.58 : 1;
  ctx.fillStyle = 'rgba(14,32,52,0.85)';
  ctx.strokeStyle = 'rgba(140,180,210,0.5)';
  ctx.lineWidth = 1.2;
  roundRect(CR.x, CR.y, CR.w, CR.h - 4, 7);
  ctx.fill(); ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#dfe9f2';
  ctx.font = '600 ' + (L.touchPortrait ? 13 : Math.round(Math.min(15, W * 0.02))) + 'px "Microsoft YaHei", sans-serif';
  ctx.fillText(input.isTouch ? 'PC 操作方式' : '操作方式', CR.x + 18, CR.y + CR.h * 0.62);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(save.controlScheme === 'keyboard-only' ? '纯键盘(鼠标仅界面点击)' : '键鼠(鼠标转向)', CR.x + CR.w - 18, CR.y + CR.h * 0.62);
  ctx.globalAlpha = 1;
  ctx.restore();

  const maxScroll = settingsMaxScroll();
  if (maxScroll > 0) {
    const trackH = L.viewportH - 12;
    const thumbH = Math.max(42, trackH * (L.viewportH / L.contentH));
    const thumbY = L.viewportTop + 6 + (trackH - thumbH) * (settingsScrollY / maxScroll);
    ctx.fillStyle = 'rgba(127,212,255,0.18)';
    roundRect(W - 8, L.viewportTop + 6, 3, trackH, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(127,212,255,0.75)';
    roundRect(W - 9, thumbY, 5, thumbH, 3);
    ctx.fill();
  }
  const hovered = hoverButton();
  for (const b of menuButtons) drawMenuButton(b, b === hovered);
}

function handleCanvasPress(x, y) {
  if (transition.active) return false;
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) { ChapterCard.skip(); return true; }
  if (GAME.state === 'settings') return handleSettingsPress(x, y);
  if (upgradeChoice && GAME.state === 'playing') {
    const c = upgradeChoice;
    const L = upgradeChoiceLayout();
    for (let i = 0; i < c.options.length; i++) {
      if (inRect(x, y, L.cards[i])) {
        applyUpgrade(c.options[i]);
        return true;
      }
    }
    if (inRect(x, y, L.skip)) return skipUpgradeChoice();
    return false;
  }
  if (controlSchemeAsk && GAME.state === 'playing') {
    // P36: 首次操作方式询问(鼠标/触屏点击二选一)
    const L = controlSchemeAskLayout();
    for (const b of L.buttons) {
      if (inRect(x, y, b)) { chooseControlScheme(b.scheme); return true; }
    }
    return false;
  }
  if (GAME.state === 'playing') return false;
  for (const b of menuButtons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.action();
      return true;
    }
  }
  if (GAME.state === 'hangar') {
    const L = hangarLayout();
    const ids = Object.keys(PLANE_DEFS);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const cx0 = L.cardsX + i * (L.cardW + L.gap);
      if (x >= cx0 && x <= cx0 + L.cardW && y >= L.cardsY && y <= L.cardsY + L.cardH) {
        if (isPlaneUnlocked(id)) {
          if (save.selectedPlane !== id) { save.selectedPlane = id; saveNow(); }
          AudioSys.click();
        } else {
          addToast('通关第二章解锁', '#ff9f43', 16);
        }
        return true;
      }
    }
    const diffKeys = Object.keys(DIFFICULTY_DEFS);
    const diffTotal = diffKeys.length * L.diffW + (diffKeys.length - 1) * L.diffGap;
    let dx = W / 2 - diffTotal / 2;
    for (const key of diffKeys) {
      if (x >= dx && x <= dx + L.diffW && y >= L.diffY && y <= L.diffY + L.diffH) {
        if (isDifficultyUnlocked(key)) {
          if (save.difficulty !== key) { save.difficulty = key; saveNow(); }
          AudioSys.click();
        } else {
          addToast('通关任意一章解锁', '#ff9f43', 16);
        }
        return true;
      }
      dx += L.diffW + L.diffGap;
    }
  }
  if (GAME.state === 'title') {
    const ar = titleAchRegion();
    if (x >= ar.x && x <= ar.x + ar.w && y >= ar.y && y <= ar.y + ar.h) {
      AudioSys.click();
      achievementsReturn = 'title';
      setState('achievements');
      return true;
    }
  }
  if (GAME.state === 'select') {
    const idx = selectCardAt(x, y);
    if (idx >= 0) {
      const def = MISSION_DEFS[idx];
      if (def.index <= save.unlockedMissions) {
        AudioSys.click();
        GAME.missionIndex = idx;
        setState('briefing');
      } else {
        addToast('通关前一任务解锁', '#ff9f43', 16);
      }
      return true;
    }
  }
  if (GAME.state === 'title') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  } else if (GAME.state === 'briefing' || GAME.state === 'complete' || GAME.state === 'gameover') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  } else if (GAME.state === 'paused') {
    if (menuButtons.length) menuButtons[0].action();
    return true;
  }
  return false;
}

function handleConfirmKey() {
  if (transition.active) return;
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) { ChapterCard.skip(); return; }
  if (GAME.state === 'playing') return;
  if (GAME.state === 'settings') return;
  if (menuButtons.length) menuButtons[0].action();
}

function startTransition(cb) {
  transition = { active: true, alpha: 0, dir: 1, cb: cb };
}

function updateTransition(dt) {
  if (!transition.active) return;
  transition.alpha += transition.dir * dt * 1.7;
  if (transition.alpha >= 1) {
    transition.alpha = 1;
    transition.dir = -1;
    if (transition.cb) { const cb = transition.cb; transition.cb = null; cb(); }
  } else if (transition.alpha <= 0) {
    transition.active = false;
    transition.alpha = 0;
  }
}
