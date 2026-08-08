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
