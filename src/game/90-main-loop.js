// ---------- main ----------
function update(dt) {
  if (typeof MusicSys !== 'undefined' && MusicSys.update) MusicSys.update(dt);
  gameTime += dt;
  const flying = GAME.state === 'playing' && player.alive && mission && !mission.complete && !mission.failed;
  AudioSys.updateEngine(flying ? clamp(player.speed / (CFG.maxSpeed + CFG.abSpeed), 0, 1) : 0);
  AudioSys.setPaused(GAME.state === 'paused');   // P34.2: 暂停 → 全部游戏音频静音/冻结; 其他状态解除(幂等)
  updateTransition(dt);   // P36-R1: 过渡动画先于询问冻结推进——淡入完成后询问浮层可见, 不被黑屏盖住
  if (GAME.state === 'playing' && (upgradeChoice || controlSchemeAsk)) return;   // P36: 询问期间冻结 gameplay(与升级模态一致)
  updateWrecks(dt);
  updateCombo(dt);
  if (GAME.state === 'playing') {
    if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) {
      ChapterCard.update(dt);
      return;
    }
    if (!mission.complete && !mission.failed && !upgradeChoice) {
      updatePlayer(dt);
      updateBuffs(dt);
      acquireLock(dt);
      for (const e of enemies) if (!e.dead) updateEnemy(e, dt);
      for (const a of allies) {
        if (!a || a.kind !== 'wingman' || a.dead) continue;
        updateWingman(a, dt);
        if (wingmanHpRatio(a) <= WINGMAN_LAYOUT.smokeHpRatio) {
          a.smokeT = Math.max(0, (a.smokeT || 0) - dt);
          if (a.smokeT <= 0 && particles.length < PARTICLE_SOFT_LIMIT) {
            a.smokeT = 0.11;
            const ca = Math.cos(a.heading), sa = Math.sin(a.heading);
            for (const port of getWingmanSmokePorts(a)) addParticle({
              x: a.x + port.x * ca - port.y * sa, y: a.y + port.x * sa + port.y * ca,
              vx: rand(-12, 12) - ca * a.speed * 0.22, vy: rand(-12, 12) - sa * a.speed * 0.22,
              life: rand(0.35, 0.65), maxLife: 0.65, size: rand(4, 7), type: 'smoke', color: port.color
            });
          }
        }
      }
      separateEnemies();
      separatePlayerFromEnemies();
      updatePlayerContact(dt);
      updateWingmanCollisions(dt);
      updateBullets(dt);
      updateMissiles(dt);
      HitFeedback.update(dt);   // P32: 离散反馈聚合推进(游戏 dt, 禁 setTimeout)
      AudioSys.consumeHitQueue();   // P34.2: 每帧消费命中/击毁聚合事件(读后清空)
      updatePickups(dt);
      updateParticles(dt);
      updateCamera(dt);
      updateMission(dt);
      if (mission.endless && player.alive) GAME.score += dt * (2 + mission.waveIndex);
      updateMissionSpawn(dt);
    } else {
      updateParticles(dt);
      updateCamera(dt);
      updateMission(dt);
    }
  } else if (GAME.state === 'paused') {
    // keep world visible but frozen
    HitFeedback.reset();   // P32: 暂停清空未发出的聚合反馈(冻结且恢复不补喷)
  } else if (GAME.state === 'title' || GAME.state === 'briefing' || GAME.state === 'complete' || GAME.state === 'gameover' || GAME.state === 'hangar' || GAME.state === 'achievements' || GAME.state === 'select') {
    updateParticles(dt);
  }
  if (GAME.pendingTimer > 0 && GAME.state === 'playing') {   // P33: 暂停冻结结算倒计时(补口2)
    GAME.pendingTimer -= dt;
    if (GAME.pendingTimer <= 0 && GAME.pendingState) {
      const st = GAME.pendingState;
      GAME.pendingState = null;
      if (st === 'complete') finishMission(true);
      else if (st === 'gameover') finishMission(false);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (GAME.state === 'title') {
    drawTitle();
  } else if (GAME.state === 'briefing') {
    drawBriefing();
  } else if (GAME.state === 'playing' || GAME.state === 'paused') {
    drawWorld();
    drawHUD();
    if (GAME.state === 'paused') drawPaused();
  } else if (GAME.state === 'complete') {
    drawWorld();
    drawHUD();
    drawComplete();
  } else if (GAME.state === 'gameover') {
    drawWorld();
    drawHUD();
    drawGameOver();
  } else if (GAME.state === 'settings') {
    drawSettings();
  } else if (GAME.state === 'hangar') {
    drawHangar();
  } else if (GAME.state === 'achievements') {
    drawAchievements();
  } else if (GAME.state === 'select') {
    drawSelect();
  }
  if (GAME.state === 'playing' && upgradeChoice) drawUpgradeChoice();
  if (GAME.state === 'playing' && controlSchemeAsk && !upgradeChoice) drawControlSchemeAsk();   // P36: 首次操作方式询问
  drawTransition();
  if (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ChapterCard.draw();
}

function loop(t) {
  const rawDt = Math.min(0.05, (t - lastTime) / 1000);
  lastTime = t;
  if (typeof SlowMo !== 'undefined' && SlowMo.update) SlowMo.update(rawDt);
  update(rawDt * (SlowMo.getScale ? SlowMo.getScale() : 1));
  draw();
  requestAnimationFrame(loop);
}

// initial state
generateWorld('day', 1121);
player.x = world.W / 2; player.y = world.H / 2;
cam.x = player.x; cam.y = player.y;
transition = { active: true, alpha: 1, dir: -1, cb: null };
installFacingDamageHook();
setState('title');
requestAnimationFrame(loop);
