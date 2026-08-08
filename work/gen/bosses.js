// ============================================================
// 《苍穹之翼·单机空战》新 BOSS 模块 ×2:深渊之眼(eye)/ 终焉之王(king)
// 任务:batch1/task-06(任务书:.orchestra/tasks/batch1/task-06/brief.md)
// 文件:work/gen/bosses.js —— 纯 JS 片段(无 <script>/HTML/import/export)
//
// 说明:本文件不修改主文件 outputs/skyfire-aces.html。
// 全部函数只调用主文件已有全局:
//   hurtPlayer / explode / burstDebris / spawnPointAround / addToast / addText /
//   addRing / addFlash / addParticle / launchMissile / enemyFireGuns /
//   steerPlane / movePlane / dist / dist2 / angleTo / angDiff / rand / lerp /
//   clamp / TAU / gameTime / enemies / bullets / player / mission / AudioSys 等。
// 子弹对象格式与 enemyFireGuns 的 push 完全一致(enemy: true, fromPlayer: false)。
//
// 总控集成点(详见报告 .orchestra/tasks/batch1/task-06/result.md):
//   1) makeEnemy defs 合并 BOSS_DEFS_EXT(eye/king 两条);
//   2) updateEnemy 顶部 dispatch:
//        if (e.kind === 'eye') return updateEyeBoss(e, dt);
//        if (e.kind === 'king') return updateKingBoss(e, dt);
//      (放在 retreat 判断之后、其余 kind 分支之前即可;函数内也自带 retreat 处理,双重保险)
//   3) drawPlaneShape / drawWreckShape 的 kind 分发加:
//        else if (p.kind === 'eye') drawEyeJet(p);
//        else if (p.kind === 'king') drawKingJet(p);
//   4) killPlane:big 判定加 'eye'/'king';bossKilled 判定加
//        if (p.kind === 'eye' || p.kind === 'king') mission.bossKilled = true;
//      (击坠台词也建议在此处按 kind 分发,见报告)
//   5) damagePlane 受击加深:减法前乘 e.takeDmgMult:
//        p.hp -= dmg * (p.takeDmgMult || 1);
//      (深渊之眼阶段3 由函数内设置 e.takeDmgMult = 1.5)
// ============================================================

// ---------- 1. makeEnemy defs 扩展(键名风格与 makeEnemy 内 defs 表一致) ----------
const BOSS_DEFS_EXT = {
  eye: { hp: 1600, speed: rand(70, 85), turn: 0.5, r: 60, score: 5000, exp: 3000, fireCd: 999, mslCd: 999, color: '#7c5cff' },
  king: { hp: 2400, speed: rand(250, 280), turn: 2.8, r: 30, score: 8000, exp: 5000, fireCd: 1, mslCd: 999, color: '#ff5e5e' }
};

// ---------- 2. 共享小工具(统一 boss 前缀,避免与主文件/其他 gen 文件命名冲突) ----------

// 按 makeEnemy 的对象结构生成小兵(drone / interceptor),直接 push 进 enemies。
// 数值与 work/gen/enemies.js 的 ENEMY_DEFS_EXT 保持一致。
// 注意:小兵的行为 AI 由 enemies.js 的 updateDrone / updateInterceptor 提供,
//       总控须确保该文件已随 ENEMY_DEFS_EXT 一并挂接(否则无人机将静止不动)。
function bossMakeMinion(kind, x, y) {
  const stats = {
    drone: { hp: 18, speed: rand(300, 340), turn: 3.4, r: 14, score: 60, exp: 60, fireCd: 999, mslCd: 999, color: '#9be3ff' },
    interceptor: { hp: 140, speed: rand(230, 260), turn: 2.3, r: 24, score: 300, exp: 240, fireCd: rand(0.5, 1.2), mslCd: rand(5, 8), color: '#c084fc' }
  }[kind] || { hp: 50, speed: rand(200, 240), turn: 2, r: 20, score: 100, exp: 80, fireCd: 999, mslCd: 999, color: '#cfd8dc' };
  return {
    kind: kind, x: x, y: y, heading: rand(0, TAU), speed: stats.speed, maxSpeed: stats.speed,
    hp: stats.hp, maxHp: stats.hp, turn: stats.turn, r: stats.r, score: stats.score, exp: stats.exp,
    color: stats.color, fireCd: stats.fireCd, mslCd: stats.mslCd, bank: 0, seed: rand(0, 10),
    strafeT: 0, attackT: rand(2, 5), phase2: false, retreat: false, smokeT: 0,
    wreckT: 0, wreckDone: false, aiTarget: player
  };
}

// 敌弹扇形弹幕:从 e 前方沿 dir 方向扇形发射 count 发,覆盖 span 弧度。
// 子弹字段与 enemyFireGuns 的 push 完全一致(enemy: true, fromPlayer: false)。
function bossFireFan(e, dir, count, span, speed, dmg, r, life) {
  const start = dir - span / 2;
  const step = count > 1 ? span / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const a = start + step * i;
    bullets.push({
      x: e.x + Math.cos(a) * (e.r + 18),
      y: e.y + Math.sin(a) * (e.r + 18),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: life, r: r, dmg: dmg, enemy: true, fromPlayer: false
    });
  }
}

// 低血量冒烟(血线 45% 以下),复刻主文件 updateEnemy 尾部的通用冒烟逻辑。
// 因总控在 updateEnemy 顶部 dispatch 并 return,通用冒烟不会执行到,故在此自带。
function bossEmitSmoke(e, dt) {
  if (e.hp >= e.maxHp * 0.45) return;
  e.smokeT = (e.smokeT || 0) - dt;
  if (e.smokeT <= 0) {
    e.smokeT = 0.09;
    addParticle({
      x: e.x + rand(-16, 16), y: e.y + rand(-16, 16),
      vx: rand(-18, 18) - Math.cos(e.heading) * e.speed * 0.25,
      vy: rand(-18, 18) - Math.sin(e.heading) * e.speed * 0.25,
      life: rand(0.5, 1), maxLife: 1, size: rand(6, 11),
      type: 'smoke', color: 'rgba(50,52,55,0.85)'
    });
  }
}

// ============================================================
// BOSS 1 · 深渊之眼(kind 'eye',空中母舰)
// 血线:66% → 阶段2,33% → 阶段3(狂暴)
// ============================================================
function updateEyeBoss(e, dt) {
  if (e.dead) return;
  // 任务结算后全员撤退(与主文件 retreat 分支一致,双保险)
  if (e.retreat) {
    e.speed = Math.max(300, e.speed + dt * 120);
    movePlane(e, dt);
    return;
  }
  // ---- 字段安全初始化 ----
  e.phase = e.phase || 1;
  e.entered = e.entered || false;
  e.sideCd = e.sideCd == null ? 1.8 : e.sideCd;        // 阶段1 侧舷机炮间隔
  e.droneCd = e.droneCd == null ? 9 : e.droneCd;       // 召唤无人机间隔
  e.barrageCd = e.barrageCd == null ? 2.4 : e.barrageCd; // 阶段2 扇形弹幕间隔
  e.diveCd = e.diveCd == null ? 6 : e.diveCd;          // 俯冲突袭间隔
  e.diveT = e.diveT || 0;                               // 俯冲/脱离计时字段
  e.diving = e.diving || false;
  e.takeDmgMult = e.takeDmgMult || 1;

  // ---- 登场台词(仅一次)----
  if (!e.entered) {
    e.entered = true;
    addToast('深渊之眼:入侵者,此处便是你的坟场。', '#ffffff', 18);
  }

  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  e.aiTarget = t;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);
  const seed = e.seed || 0;

  // ---- 阶段切换 ----
  // 血线 66% → 阶段2:入场台词 + 冲击波
  if (e.phase === 1 && e.hp < e.maxHp * 0.66) {
    e.phase = 2;
    addToast('深渊之眼:引擎过载——展开歼灭弹幕!', '#ffffff', 18);
    addRing(e.x, e.y, 180, 'rgba(124,92,255,0.9)', 0.9);
    addFlash(e.x, e.y, 130, 'rgba(160,130,255,0.8)', 0.3);
  }
  // 血线 33% → 阶段3(狂暴):受击加深 ×1.5、速度提到 110、弹幕/俯冲间隔减半
  if (e.phase === 2 && e.hp < e.maxHp * 0.33) {
    e.phase = 3;
    e.takeDmgMult = 1.5; // 总控在 damagePlane 前乘此字段实现受击加深(见文件头注释)
    e.maxSpeed = 110;
    addToast('深渊之眼:核心暴露!拦截所有炮火!', '#ff6b6b', 18);
    addRing(e.x, e.y, 220, 'rgba(255,80,90,0.9)', 1);
    addFlash(e.x, e.y, 150, 'rgba(255,120,120,0.85)', 0.35);
  }

  // ---- 移动 ----
  if (e.diving) {
    // 俯冲突袭:直线加速冲向玩家当前位置
    e.speed = lerp(e.speed, 430, dt * 2.5);
    steerPlane(e, toT, dt, 1.2);
    movePlane(e, dt);
    if (d < 250) {
      // 到达(距离<250):转向脱离 2s(diveT 计时)
      e.diving = false;
      e.diveT = 2;
    }
  } else if (e.diveT > 0) {
    // 脱离阶段:背向玩家高速拉开
    e.diveT -= dt;
    e.speed = lerp(e.speed, 320, dt * 2);
    steerPlane(e, toT + Math.PI, dt, 1.2);
    movePlane(e, dt);
  } else {
    // 阶段1/常态:绕玩家大圈巡航(距离约 600),附轻微正弦摆动
    const err = clamp((d - 600) / 600, -1, 1);
    const sway = Math.sin(gameTime * 0.5 + seed * 5) * 0.3;
    steerPlane(e, toT + Math.PI / 2 + err * 1.2 + sway, dt, 1);
    e.speed = lerp(e.speed, e.maxSpeed, dt * 0.8);
    movePlane(e, dt);
  }

  // ---- 阶段1:侧舷机炮(每 1.8s 扇形 3 发,间隔 0.14rad,速度 500,伤害 10)----
  if (e.phase === 1) {
    e.sideCd -= dt;
    if (e.sideCd <= 0) {
      e.sideCd = 1.8;
      bossFireFan(e, toT, 3, 0.28, 500, 10, 5, 2.4);
    }
  }

  // ---- 阶段2/3:扇形弹幕(12 发覆盖 2.6rad,以玩家方向为中心;阶段3 间隔减半为 1.2s)----
  if (e.phase >= 2) {
    e.barrageCd -= dt;
    if (e.barrageCd <= 0) {
      e.barrageCd = e.phase === 3 ? 1.2 : 2.4;
      bossFireFan(e, toT, 12, 2.6, 420, 10, 5, 3);
    }
  }

  // ---- 召唤无人机(每 9s 2 架;软上限:场上存活 ≤ 4,防止无限堆积)----
  e.droneCd -= dt;
  if (e.droneCd <= 0) {
    e.droneCd = 9;
    let aliveDrones = 0;
    for (const x of enemies) if (x.kind === 'drone' && !x.dead) aliveDrones++;
    if (aliveDrones < 4) {
      for (let i = 0; i < 2; i++) {
        const p = spawnPointAround(e.x, e.y, 300, 420);
        const mn = bossMakeMinion('drone', p.x, p.y);
        mn.heading = angleTo(p.x, p.y, player.x, player.y);
        mn.aiTarget = player;
        enemies.push(mn);
      }
    }
  }

  // ---- 俯冲突袭触发(阶段2/3;阶段3 间隔减半为 3s)----
  if (e.phase >= 2 && !e.diving && e.diveT <= 0) {
    e.diveCd -= dt;
    if (e.diveCd <= 0 && d > 300) {
      e.diveCd = e.phase === 3 ? 3 : 6;
      e.diving = true;
      addRing(e.x, e.y, 100, 'rgba(124,92,255,0.8)', 0.5); // 俯冲预警
    }
  }

  // 低血量冒烟
  bossEmitSmoke(e, dt);
}

// ============================================================
// BOSS 1 绘制 · 深渊之眼(大型飞艇)
// 椭圆船体 + 中央圆顶核心(阶段3 高亮红色)+ 两侧短粗机翼,深紫配色
// 调用时 ctx 已由 drawPlaneShape translate/rotate 到机身局部坐标
// ============================================================
function drawEyeJet(e) {
  const p3 = e.phase === 3;
  const base = p3 ? '#6a4fd8' : '#7c5cff';
  const dark = '#2b1a5e';

  // 尾喷引擎光焰(深紫)
  const eg = ctx.createLinearGradient(-56, 0, -86, 0);
  eg.addColorStop(0, 'rgba(180,150,255,0.9)');
  eg.addColorStop(1, 'rgba(124,92,255,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.moveTo(-54, -8);
  ctx.lineTo(-88, 0);
  ctx.lineTo(-54, 8);
  ctx.closePath();
  ctx.fill();

  // 两侧短粗机翼
  ctx.fillStyle = '#5a3fd0';
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -12);
  ctx.lineTo(-30, -34);
  ctx.lineTo(-54, -28);
  ctx.lineTo(-48, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 12);
  ctx.lineTo(-30, 34);
  ctx.lineTo(-54, 28);
  ctx.lineTo(-48, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 船体:椭圆
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(0, 0, 56, 18, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // 船体装饰线
  ctx.strokeStyle = 'rgba(200,180,255,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-50, -7); ctx.lineTo(-4, -7);
  ctx.moveTo(-50, 7); ctx.lineTo(-4, 7);
  ctx.stroke();

  // 引擎短舱(船尾两具)
  ctx.fillStyle = '#4a33a8';
  ctx.fillRect(-58, -9, 10, 7);
  ctx.fillRect(-58, 2, 10, 7);

  // 舷窗
  ctx.fillStyle = 'rgba(220,210,255,0.75)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-6 - i * 12, -3, 2.2, 0, TAU);
    ctx.fill();
  }

  // 中央圆顶核心(发光圆;阶段3 高亮红色并脉冲)
  const coreR = p3 ? 14 : 11;
  const coreGlow = p3 ? 34 : 26;
  const cg = ctx.createRadialGradient(16, 0, 0, 16, 0, coreGlow);
  if (p3) {
    cg.addColorStop(0, 'rgba(255,90,90,0.95)');
    cg.addColorStop(0.6, 'rgba(255,60,60,0.4)');
    cg.addColorStop(1, 'rgba(255,60,60,0)');
  } else {
    cg.addColorStop(0, 'rgba(216,204,255,0.95)');
    cg.addColorStop(0.6, 'rgba(160,130,255,0.4)');
    cg.addColorStop(1, 'rgba(160,130,255,0)');
  }
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(16, 0, coreGlow, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p3 ? '#ff6b6b' : '#d8ccff';
  ctx.strokeStyle = p3 ? '#ffd166' : '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(16, 0, coreR, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (p3) {
    // 狂暴脉冲环
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 0, coreR + 5 + Math.sin(gameTime * 10) * 2.5, 0, TAU);
    ctx.stroke();
  }
}

// ============================================================
// BOSS 2 · 终焉之王(kind 'king',王牌机)
// 血线:60% → 阶段2,30% → 阶段3(残血狂暴)
// ============================================================
function updateKingBoss(e, dt) {
  if (e.dead) return;
  // 任务结算后全员撤退(与主文件 retreat 分支一致,双保险)
  if (e.retreat) {
    e.speed = Math.max(300, e.speed + dt * 120);
    movePlane(e, dt);
    return;
  }
  // ---- 字段安全初始化 ----
  e.phase = e.phase || 1;
  e.entered = e.entered || false;
  e.attackT = e.attackT == null ? rand(3.5, 4.5) : e.attackT; // 导弹连发周期(阶段1 3.5~4.5s)
  e.volleyCd = e.volleyCd == null ? 1.4 : e.volleyCd;          // 阶段2 扇形机炮间隔
  e.wingCd = e.wingCd == null ? 11 : e.wingCd;                 // 召唤僚机间隔
  e.wingCount = e.wingCount || 0;                              // 存活僚机计数(≤2)
  e.strikeCd = e.strikeCd == null ? 8 : e.strikeCd;            // 阶段3 突袭间隔
  e.strikeT = e.strikeT || 0;                                  // 突袭持续计时
  e.striking = e.striking || false;
  e.strikeFlip = e.strikeFlip || false;

  // ---- 登场台词(仅一次)----
  if (!e.entered) {
    e.entered = true;
    addToast('终焉之王:苍穹的尽头,没有你的席位。', '#ffffff', 18);
  }

  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  e.aiTarget = t;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);

  // ---- 阶段切换 ----
  // 血线 60% → 阶段2:召唤僚机 + 自身弹幕强化
  if (e.phase === 1 && e.hp < e.maxHp * 0.6) {
    e.phase = 2;
    addToast('终焉之王:僚机!绞杀它!', '#ffffff', 18);
    addRing(e.x, e.y, 130, 'rgba(255,94,94,0.9)', 0.8);
    addFlash(e.x, e.y, 90, 'rgba(255,140,120,0.8)', 0.3);
  }
  // 血线 30% → 阶段3(残血狂暴):超高速突袭模式
  if (e.phase === 2 && e.hp < e.maxHp * 0.3) {
    e.phase = 3;
    e.maxSpeed = 420;
    addToast('终焉之王:最后一击!', '#ff6b6b', 18);
    addRing(e.x, e.y, 160, 'rgba(255,60,60,0.95)', 1);
    addFlash(e.x, e.y, 110, 'rgba(255,140,120,0.85)', 0.3);
  }

  // ---- 移动 ----
  if (e.phase === 3 && e.striking) {
    // 超高速突袭:直线穿越玩家;越过 300 距离后 toT 反向,配合转向率 ×3 自然完成 180° 掉头再冲
    e.strikeT -= dt;
    e.speed = lerp(e.speed, 420, dt * 2.5);
    steerPlane(e, toT, dt, 3); // 转向率 ×3,难以被瞄准
    movePlane(e, dt);
    if (d < 240) e.strikeFlip = true;
    if (e.strikeFlip && d > 300) e.strikeFlip = false; // 已越过 300 → 掉头再冲
    // 突袭尾焰粒子
    if (Math.random() < dt * 30) {
      addParticle({
        x: e.x - Math.cos(e.heading) * 34, y: e.y - Math.sin(e.heading) * 34,
        vx: rand(-16, 16) - Math.cos(e.heading) * e.speed * 0.4,
        vy: rand(-16, 16) - Math.sin(e.heading) * e.speed * 0.4,
        life: rand(0.2, 0.45), maxLife: 0.45, size: rand(3, 7),
        type: 'fire', color: '#ff9f43'
      });
    }
    if (e.strikeT <= 0) {
      e.striking = false;
      e.strikeCd = 8; // 每 8s 一次突袭
    }
  } else if (e.phase === 3 && e.strikeCd <= 0 && !e.striking && d > 260) {
    // 突袭启动
    e.striking = true;
    e.strikeT = 2.6;
    e.strikeFlip = false;
    addFlash(e.x, e.y, 60, 'rgba(255,80,60,0.7)', 0.25);
  } else {
    // 阶段1/2 与阶段3 间隙:高速缠斗(参照主文件 ace 分支:环绕 + attackT 周期爆发)
    e.strikeCd -= dt;
    const circleD = d < 430 ? 1.35 : (d > 780 ? -1.1 : 0.85);
    steerPlane(e, toT + circleD, dt, 1.05);
    e.speed = lerp(e.speed, e.maxSpeed * (d > 700 ? 1.1 : 0.9), dt * 0.8);
    movePlane(e, dt);
  }

  // ---- 导弹 3 连发(attackT 3.5~4.5s,比 ace 更频繁)----
  e.attackT -= dt;
  if (e.attackT <= 0) {
    e.attackT = rand(3.5, 4.5);
    for (let i = 0; i < 3; i++) {
      launchMissile(e.x, e.y, e.heading + (i - 1) * 0.22, t, true);
    }
    AudioSys.warningLaunch();
  }

  // ---- 机炮(同 ace:enemyFireGuns 内部自校验距离/机头对准)----
  enemyFireGuns(e, dt);

  // ---- 阶段2/3:自身弹幕强化(扇形 5 发机炮)----
  if (e.phase >= 2) {
    e.volleyCd -= dt;
    if (e.volleyCd <= 0) {
      e.volleyCd = 1.4;
      bossFireFan(e, toT, 5, 0.6, 560, 8, 4, 1.8);
    }
  }

  // ---- 阶段2/3:召唤僚机(每 11s 2 架 interceptor,最多同时 2 架在场)----
  if (e.phase >= 2) {
    e.wingCd -= dt;
    // 统计存活僚机(僚机死亡时计数自然减少)
    let live = 0;
    for (const x of enemies) if (x.wingOwner === e && !x.dead) live++;
    e.wingCount = live;
    if (e.wingCd <= 0 && live < 2) {
      e.wingCd = 11;
      for (let i = 0; i < 2 - live; i++) {
        const p = spawnPointAround(e.x, e.y, 260, 380);
        const mn = bossMakeMinion('interceptor', p.x, p.y);
        mn.heading = angleTo(p.x, p.y, player.x, player.y);
        mn.aiTarget = player;
        mn.wingOwner = e;
        enemies.push(mn);
        e.wingCount++;
      }
    }
  }

  // 低血量冒烟
  bossEmitSmoke(e, dt);
}

// ============================================================
// BOSS 2 绘制 · 终焉之王(细长流线王牌机)
// 双垂尾 + 红色涂装 + 尾焰(参照 drawPlayerJet 的 afterburn 简化);
// 阶段3 时尾焰加长(突袭态最长)
// ============================================================
function drawKingJet(e) {
  const p3 = e.phase === 3;
  const speedRatio = clamp((e.speed - 200) / 250, 0, 1);
  const flameLen = p3 ? (e.striking ? 46 : 30) : 16 + speedRatio * 14;

  // 尾焰(简化 afterburn,阶段3 加长)
  const fg = ctx.createLinearGradient(-38, 0, -38 - flameLen, 0);
  fg.addColorStop(0, '#fff7c0');
  fg.addColorStop(0.5, '#ff9f43');
  fg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-36, -4.5);
  ctx.lineTo(-36 - flameLen, 0);
  ctx.lineTo(-36, 4.5);
  ctx.closePath();
  ctx.fill();

  // 双垂尾(上下)
  ctx.fillStyle = '#d84a4a';
  ctx.strokeStyle = '#4a0f0f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-24, -4);
  ctx.lineTo(-30, -21);
  ctx.lineTo(-39, -19);
  ctx.lineTo(-34, -3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-24, 4);
  ctx.lineTo(-30, 21);
  ctx.lineTo(-39, 19);
  ctx.lineTo(-34, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 机身(细长流线)
  ctx.fillStyle = e.color || '#ff5e5e';
  ctx.strokeStyle = '#4a0f0f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(38, 0);
  ctx.lineTo(10, -4.5);
  ctx.lineTo(-8, -5.5);
  ctx.lineTo(-24, -4);
  ctx.lineTo(-34, -2.5);
  ctx.lineTo(-36, -1);
  ctx.lineTo(-36, 1);
  ctx.lineTo(-34, 2.5);
  ctx.lineTo(-24, 4);
  ctx.lineTo(-8, 5.5);
  ctx.lineTo(10, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 机头点缀
  ctx.fillStyle = '#c24040';
  ctx.beginPath();
  ctx.moveTo(30, -3);
  ctx.lineTo(38, 0);
  ctx.lineTo(30, 3);
  ctx.closePath();
  ctx.fill();

  // 座舱
  ctx.fillStyle = '#2b1212';
  ctx.beginPath();
  ctx.ellipse(12, 0, 8.5, 3.2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,160,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, -2);
  ctx.lineTo(8, -2.4);
  ctx.stroke();

  // 阶段3 狂暴高亮描边
  if (p3) {
    ctx.strokeStyle = 'rgba(255,80,60,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + Math.sin(gameTime * 12) * 2, 0, TAU);
    ctx.stroke();
  }
}
