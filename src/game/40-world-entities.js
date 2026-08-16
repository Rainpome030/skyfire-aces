// ---------- world generation ----------
function generateWorld(themeKey, seed) {
  const theme = THEMES[themeKey] || THEMES.day;
  world = { W: 7200, H: 5600, clouds: [], islands: [], seed: seed, theme: theme };
  const r = seeded(seed);
  for (let i = 0; i < 110; i++) {
    world.clouds.push({
      x: r() * world.W, y: r() * world.H,
      r: rand(60, 190), drift: rand(2, 7), alpha: rand(0.25, 0.8), seed: r()
    });
  }
  const n = randi(10, 16);
  for (let i = 0; i < n; i++) {
    const cx = 350 + r() * (world.W - 700);
    const cy = 350 + r() * (world.H - 700);
    const rad = rand(120, 430);
    const pts = [];
    const count = randi(8, 14);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU;
      const rr = rad * rand(0.72, 1.22);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    world.islands.push({ cx, cy, rad, pts, seed: r(), city: theme.city && r() > 0.55 });
  }
}

// ---------- spawn helpers ----------
function spawnPointAround(cx, cy, minD, maxD) {
  const a = rand(0, TAU);
  const d = rand(minD, maxD);
  return {
    x: clamp(cx + Math.cos(a) * d, 260, world.W - 260),
    y: clamp(cy + Math.sin(a) * d, 260, world.H - 260)
  };
}

// ============================================================
// 《苍穹之翼·单机空战》新敌机模块(4 种):drone / kamikaze / interceptor / gunship
// 文件:work/gen/enemies.js —— 纯 JS 代码片段(无 HTML 标签、无模块语句)
// 说明:本文件不修改主文件 outputs/skyfire-aces.html;
//       全部函数直接调用主文件已有的全局函数:
//       hurtPlayer / explode / burstDebris / killPlane / steerPlane / movePlane /
//       enemyFireGuns / enemyFireMissile / addParticle / burstSpark / addRing /
//       addFlash / dist / dist2 / angleTo / angDiff / rand / lerp / clamp / TAU 等。
// 集成方式(由总控负责):
//   1) 把 ENEMY_DEFS_EXT 合并进 makeEnemy 的 defs 表:
//      const defs = { fighter:..., gunner:..., bomber:..., ace:..., ...ENEMY_DEFS_EXT };
//   2) 在 updateEnemy 的 kind 分支中,为 4 种新敌机调用对应 updateXxx(e, dt);
//   3) 在 drawPlaneShape 的 kind 分发中,为 4 种新敌机调用对应 drawXxxJet(e);
//   4) 正面减伤挂接(二选一,详见 installFacingDamageHook 注释)。
// ============================================================

// ---------- 1. ENEMY_DEFS 扩展(键名风格与 makeEnemy 内 defs 表一致) ----------
const ENEMY_DEFS_EXT = {
  drone: { hp: 18, speed: rand(300, 340), turn: 3.4, r: 14, score: 60, exp: 60, fireCd: 999, mslCd: 999, color: '#9be3ff' },
  kamikaze: { hp: 30, speed: rand(330, 380), turn: 1.9, r: 16, score: 90, exp: 90, fireCd: 999, mslCd: 999, color: '#ff9f43' },
  interceptor: { hp: 140, speed: rand(230, 260), turn: 2.3, r: 24, score: 300, exp: 240, fireCd: rand(0.5, 1.2), mslCd: rand(5, 8), color: '#c084fc' },
  gunship: { hp: 520, speed: rand(60, 75), turn: 0.35, r: 42, score: 800, exp: 600, fireCd: rand(1.6, 2.4), mslCd: 999, color: '#6b7280' }
};

// ---------- 2. 行为函数 ----------

// 无人机:蛇形接近玩家(正弦摆动 + 转向玩家),不射击。
// 高速(300~340)+ 极灵活(turn 3.4),成群骚扰;fireCd/mslCd 恒为 999。
function updateDrone(e, dt) {
  if (e.dead) return;
  // 防御:无人机永不射击(防止总控在 updateEnemy 末尾统一调用敌火逻辑时被倒计时触发)
  e.fireCd = 999;
  e.mslCd = 999;
  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  const toT = angleTo(e.x, e.y, t.x, t.y);
  const d = dist(e.x, e.y, t.x, t.y);
  // 蛇形:朝向玩家的基础上叠加高频正弦摆动
  const sway = Math.sin(gameTime * 2.6 + e.seed * 7.3) * 0.55;
  steerPlane(e, toT + sway, dt, 1.2);
  e.speed = lerp(e.speed, e.maxSpeed * (d > 700 ? 1.08 : 0.9), dt * 1.5);
  movePlane(e, dt);
}

// 自爆机:高速直线冲向玩家,接近到 70 距离内自爆。
function updateKamikaze(e, dt) {
  if (e.dead) return;
  // 防御:自爆机永不射击
  e.fireCd = 999;
  e.mslCd = 999;
  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);

  // [核心逻辑·自爆判定] 距离玩家 < 70 → 自爆:对玩家造成 35 伤害,自身死亡
  if (d < 70 && player.alive) {
    hurtPlayer(35); // 自爆伤害(受主文件 hurtPlayer 的无敌/护盾/难度倍率机制约束)
    // 冲击波表现:爆环 + 闪光 + 火焰
    addRing(e.x, e.y, 110, 'rgba(255,159,67,0.9)', 0.5);
    addFlash(e.x, e.y, 90, 'rgba(255,210,130,0.9)', 0.25);
    burstFire(e.x, e.y, 26, 320, 1.6, false);
    // 自身死亡:killPlane 内部已调用 explode + burstDebris(爆炸/碎片/加分/掉落)
    killPlane(e);
    return;
  }

  // 未到自爆距离:直线加速冲向玩家
  steerPlane(e, toT, dt);
  e.speed = lerp(e.speed, e.maxSpeed * 1.35, dt * 2);
  movePlane(e, dt);
  // 高速冲刺尾焰粒子(简化 afterburn 拖尾)
  if (Math.random() < dt * 40) {
    addParticle({
      x: e.x - Math.cos(e.heading) * 14, y: e.y - Math.sin(e.heading) * 14,
      vx: rand(-14, 14) - Math.cos(e.heading) * e.speed * 0.35,
      vy: rand(-14, 14) - Math.sin(e.heading) * e.speed * 0.35,
      life: rand(0.25, 0.5), maxLife: 0.5, size: rand(3, 6),
      type: 'fire', color: '#ffb35c'
    });
  }
}

// 截击机:中距缠斗 + 正面机炮压制 + 偶尔发射导弹(复用主文件敌方机炮/导弹逻辑)。
function updateInterceptor(e, dt) {
  if (e.dead) return;
  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);
  // 战术:过近则侧拉脱离,过远则压向玩家,中距斜向切入保持机头对准
  let desired;
  if (d < 420) desired = toT + 1.25;
  else if (d > 780) desired = toT + 0.25;
  else desired = toT + 0.55;
  steerPlane(e, desired, dt, 1.1);
  e.speed = lerp(e.speed, e.maxSpeed * (d > 700 ? 1.08 : 0.94), dt * 0.8);
  movePlane(e, dt);
  // 正面朝玩家时射击:enemyFireGuns/enemyFireMissile 内部已校验
  // 距离(820 / 400~1250)与机头对准角(±0.5 / ±0.6 rad),只有机头对着玩家才会开火。
  // 注意:若总控在 updateEnemy 末尾已对 interceptor 统一调用过这两个函数,
  // 请二选一(去掉本处调用或去掉末尾调用),避免双倍射击。
  enemyFireGuns(e, dt);
  enemyFireMissile(e, dt);
}

// [核心逻辑·正面减伤] 伤害结算前的减伤判定函数:
// 以"弹道方向"与"机头方向"的夹角衡量受击面——
//   夹角 > 120°(2π/3)视为正面受击 → 伤害 ×0.5;
//   夹角小(背面/侧后)无减伤。
// 参数 shot 可为:弹道角度(弧度,数字)或子弹对象(取 atan2(vy, vx) 作为弹道方向)。
// 仅对 interceptor 生效,其他敌机原样返回。
function applyFacingDamageReduction(e, dmg, shot) {
  if (!e || e.kind !== 'interceptor' || e.dead) return dmg;
  let shotAngle;
  if (typeof shot === 'number') {
    shotAngle = shot;
  } else if (shot && typeof shot.vx === 'number') {
    shotAngle = Math.atan2(shot.vy, shot.vx);
  } else {
    return dmg; // 无法判定弹道方向 → 不减免
  }
  const ang = Math.abs(angDiff(e.heading, shotAngle)); // 夹角 ∈ [0, π]
  if (ang > Math.PI * 2 / 3) return dmg * 0.5;          // >120° 正面受击 → 减伤 50%
  return dmg;
}

// 可选挂接(方案 B):若总控不想改动 updateBullets,可调用一次本函数,
// 运行时包装 damagePlane,使 interceptor 正面减伤自动生效(不改主文件源码)。
// 注意:方案 A(在 updateBullets 中把 damagePlane(e, b.dmg) 替换为
//   damagePlane(e, applyFacingDamageReduction(e, b.dmg, b)))
// 与本方案 B 二选一,不可同时启用,否则伤害会被减免两次(0.5×0.5)。
function installFacingDamageHook() {
  if (window.__skyfireFacingHookInstalled) return;
  if (typeof damagePlane !== 'function' || typeof bullets === 'undefined') return;
  window.__skyfireFacingHookInstalled = true;
  const origDamagePlane = damagePlane;
  damagePlane = function (p, dmg) {
    if (p && p.kind === 'interceptor' && !p.dead) {
      // 取距离该敌机最近的玩家子弹,以子弹速度方向作为弹道方向
      let best = null, bestD = Infinity;
      for (const b of bullets) {
        if (!b.fromPlayer) continue;
        const dd = dist2(b.x, b.y, p.x, p.y);
        if (dd < bestD) { bestD = dd; best = b; }
      }
      if (best) dmg = applyFacingDamageReduction(p, dmg, best);
    }
    return origDamagePlane(p, dmg);
  };
}

// 炮艇:沿当前 heading 固定航线直线巡航,每 fireCd 发射一次扇形弹幕。
function updateGunship(e, dt) {
  if (e.dead) return;
  // 防御:炮艇不发射导弹
  e.mslCd = 999;
  if (typeof e.fireCd !== 'number') e.fireCd = rand(1.6, 2.4);
  // 固定航线:直线巡航(不主动转向玩家)
  movePlane(e, dt);
  // 边缘保护(偏离点:任务书仅要求直线巡航;此处避免炮艇被 movePlane 的
  // 边界 clamp 卡死在世界边缘,靠近边界 260 内时轻微回场)
  const m = 260;
  if (e.x < m || e.x > world.W - m || e.y < m || e.y > world.H - m) {
    steerPlane(e, angleTo(e.x, e.y, world.W / 2, world.H / 2), dt, 0.5);
  }

  // [核心逻辑·扇形弹幕] 每 fireCd 发射一次:5 发敌弹,
  // 角度 = heading + [-60°, -30°, 0°, +30°, +60°](间隔 30° 的 60° 扇形),
  // 子弹参数:速度约 420、伤害 12、寿命 2.2(结构同主文件现有敌弹)。
  if (e.fireCd > 0) { e.fireCd -= dt; return; }
  e.fireCd = rand(1.6, 2.4);
  const spread = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3];
  for (let i = 0; i < 5; i++) {
    const a = e.heading + spread[i];
    bullets.push({
      x: e.x + Math.cos(e.heading) * (e.r + 6),
      y: e.y + Math.sin(e.heading) * (e.r + 6),
      vx: Math.cos(a) * 420 + Math.cos(e.heading) * e.speed * 0.6,
      vy: Math.sin(a) * 420 + Math.sin(e.heading) * e.speed * 0.6,
      life: 2.2, r: 5, dmg: 12, enemy: true, fromPlayer: false
    });
  }
  // 炮口火花
  burstSpark(e.x + Math.cos(e.heading) * (e.r + 6), e.y + Math.sin(e.heading) * (e.r + 6), 6, 220, 0.3);
}

// ---------- 3. 绘制函数(由 drawPlaneShape 在 ctx.translate/rotate 之后调用,机头朝 +x) ----------

// 无人机:小三角机身 + 机头灯,浅蓝色
function drawDroneJet(e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-6, -11);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 11);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#174b6b';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // 机头指示灯
  ctx.fillStyle = '#1c4a63';
  ctx.beginPath();
  ctx.arc(3, 0, 3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#bfeaff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(3, 0, 1.8, 0, TAU);
  ctx.stroke();
}

// 自爆机:尖头小机身 + 尾焰(简化版 afterburn),橙色
function drawKamikazeJet(e) {
  // 尾焰:随时间 flicker 的火焰三角(参照 drawPlayerJet afterburn 的简化版)
  const flame = 15 + Math.sin(gameTime * 28 + e.seed * 9) * 5;
  const fg = ctx.createLinearGradient(-30, 0, -12, 0);
  fg.addColorStop(0, 'rgba(255,120,40,0)');
  fg.addColorStop(0.6, '#ff9f43');
  fg.addColorStop(1, '#fff2b0');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-13, -4);
  ctx.lineTo(-13 - flame, 0);
  ctx.lineTo(-13, 4);
  ctx.closePath();
  ctx.fill();
  // 尖头机身
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(2, -5);
  ctx.lineTo(-10, -4);
  ctx.lineTo(-14, -2);
  ctx.lineTo(-14, 2);
  ctx.lineTo(-10, 4);
  ctx.lineTo(2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a3c0d';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 座舱
  ctx.fillStyle = '#b35c1d';
  ctx.beginPath();
  ctx.arc(4, 0, 2.6, 0, TAU);
  ctx.fill();
}

// 截击机:细长机身 + 前掠双翼 + 双尾翼,紫色
function drawInterceptorJet(e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(30, 0);          // 机头
  ctx.lineTo(8, -4);
  ctx.lineTo(2, -22);         // 前翼(上)
  ctx.lineTo(-6, -24);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-20, -16);       // 尾翼(上)
  ctx.lineTo(-26, -8);
  ctx.lineTo(-18, -3);
  ctx.lineTo(-18, 3);
  ctx.lineTo(-26, 8);         // 尾翼(下)
  ctx.lineTo(-20, 16);
  ctx.lineTo(-10, 10);
  ctx.lineTo(-6, 24);         // 前翼(下)
  ctx.lineTo(2, 22);
  ctx.lineTo(8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4b2a73';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 细长座舱
  ctx.fillStyle = '#7a4fb8';
  ctx.beginPath();
  ctx.ellipse(8, 0, 6, 3, 0, 0, TAU);
  ctx.fill();
  // 尾标
  ctx.fillStyle = '#e6d5ff';
  ctx.fillRect(-16, -2.5, 5, 5);
}

// 炮艇:大型飞艇轮廓 + 前后炮塔凸起 + 舷窗,深灰色
function drawGunshipJet(e) {
  // 艇身(椭圆)
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 20, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2b2f33';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 中脊线
  ctx.strokeStyle = '#4a5158';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-38, 0);
  ctx.lineTo(38, 0);
  ctx.stroke();
  // 前炮塔凸起(上)
  ctx.fillStyle = '#565d64';
  ctx.beginPath();
  ctx.arc(30, -6, 7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#26292d';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#3a4046';
  ctx.beginPath();
  ctx.arc(32, -9, 2.6, 0, TAU);
  ctx.fill();
  // 后炮塔凸起(下)
  ctx.fillStyle = '#565d64';
  ctx.beginPath();
  ctx.arc(-30, 8, 6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a4046';
  ctx.beginPath();
  ctx.arc(-32, 6, 2.4, 0, TAU);
  ctx.fill();
  // 舷窗
  ctx.fillStyle = '#8fa0ad';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 12, -2, 2.6, 0, TAU);
    ctx.fill();
  }
  // 尾鳍(上下)
  ctx.fillStyle = '#4a5158';
  ctx.beginPath();
  ctx.moveTo(-40, -4);
  ctx.lineTo(-52, -16);
  ctx.lineTo(-46, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-40, 4);
  ctx.lineTo(-52, 16);
  ctx.lineTo(-46, 0);
  ctx.closePath();
  ctx.fill();
}


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


function makeEnemy(kind, x, y) {
  const defs = {
    fighter: { hp: 50, speed: rand(215, 250), turn: 2.1, r: 22, score: 120, exp: 100, fireCd: rand(0.8, 2), mslCd: rand(4, 8), color: '#e3554f' },
    gunner: { hp: 62, speed: rand(160, 185), turn: 1.7, r: 24, score: 160, exp: 130, fireCd: rand(0.4, 1), mslCd: rand(7, 11), color: '#e8913d' },
    bomber: { hp: 190, speed: rand(105, 125), turn: 0.7, r: 30, score: 320, exp: 260, fireCd: 2.2, mslCd: 999, color: '#9aa4a8' },
    ace: { hp: 720, speed: rand(235, 255), turn: 2.6, r: 26, score: 2500, exp: 1200, fireCd: 1, mslCd: 6, color: '#e04a3f' }
  };
  Object.assign(defs, ENEMY_DEFS_EXT);
  Object.assign(defs, BOSS_DEFS_EXT);
  const d = defs[kind];
  const diffMult = (DIFFICULTY_DEFS[save.difficulty] || DIFFICULTY_DEFS.normal).enemyHpMult;
  return {
    kind, x, y, heading: rand(0, TAU), speed: d.speed, maxSpeed: d.speed,
    hp: d.hp * diffMult, maxHp: d.hp * diffMult, turn: d.turn, r: d.r, score: d.score, exp: d.exp, color: d.color,
    fireCd: d.fireCd, mslCd: d.mslCd, bank: 0, seed: rand(0, 10),
    strafeT: 0, attackT: rand(2, 5), phase2: false, retreat: false, smokeT: 0,
    wreckT: 0, wreckDone: false
  };
}

function spawnWave(kinds) {
  const cx = mission.escort ? (mission.transport ? mission.transport.x : player.x) : player.x;
  const cy = mission.escort ? (mission.transport ? mission.transport.y : player.y) : player.y;
  for (const kind of kinds) {
    const p = spawnPointAround(cx, cy, 850, 1250);
    const e = makeEnemy(kind, p.x, p.y);
    e.heading = angleTo(p.x, p.y, cx, cy);
    if (kind === 'bomber') e.heading = rand(-0.6, 0.6);
    enemies.push(e);
  }
}

function spawnTransport() {
  const t = {
    kind: 'transport', x: 700, y: world.H / 2, heading: 0, speed: 128,
    hp: 320, maxHp: 320, r: 44, alive: true, dead: false, waypoints: [
      { x: 700, y: world.H / 2 },
      { x: 2100, y: world.H / 2 + 300 },
      { x: 3800, y: world.H / 2 - 220 },
      { x: 6100, y: world.H / 2 + 80 }
    ], wpIndex: 1, smokeT: 0, bank: 0
  };
  allies.push(t);
  mission.transport = t;
}

function spawnAce() {
  const p = spawnPointAround(player.x, player.y, 950, 1150);
  const e = makeEnemy('ace', p.x, p.y);
  e.attackT = 2.2;
  enemies.push(e);
  mission.boss = e;
  for (let i = 0; i < 4; i++) {
    const q = spawnPointAround(e.x, e.y, 300, 430);
    const f = makeEnemy('fighter', q.x, q.y);
    f.heading = angleTo(q.x, q.y, player.x, player.y);
    enemies.push(f);
  }
}
