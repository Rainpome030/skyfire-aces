// ---------- particles ----------
const PARTICLE_LIMIT = 600;
const PARTICLE_SOFT_LIMIT = 480;
const IMPORTANT_PARTICLE_TYPES = new Set(['text', 'ring', 'flash']);
let particlePressureT = 0;

function particlePriority(p) {
  return IMPORTANT_PARTICLE_TYPES.has(p.type) ? 2 : (p.type === 'smoke' ? 0 : 1);
}

function addParticle(p) {
  // 进入高压后短暂抑制低优先级尾迹；这也让高压池清空后的观察窗口不被新尾迹污染。
  if (particles.length >= PARTICLE_SOFT_LIMIT) particlePressureT = Math.max(particlePressureT, 0.25);
  if (p.type === 'smoke' && (particles.length >= PARTICLE_SOFT_LIMIT || particlePressureT > 0)) return;
  if (particles.length >= PARTICLE_LIMIT) {
    // 批量清到软上限，优先淘汰 smoke/普通特效，保留文字、ring、flash 等关键反馈。
    const incomingPriority = particlePriority(p);
    const removeCount = particles.length - PARTICLE_SOFT_LIMIT + 1;
    const order = particles.map((item, index) => ({ index, priority: particlePriority(item) }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index);
    const removable = order.filter(item => item.priority <= incomingPriority).slice(0, removeCount);
    if (removable.length < removeCount && incomingPriority < 2) return;
    const remove = new Set((removable.length >= removeCount ? removable : order.slice(0, removeCount)).map(item => item.index));
    particles = particles.filter((_, index) => !remove.has(index));
  }
  if (!(p.maxLife > 0)) p.maxLife = Math.max(Number.EPSILON, p.life || 0);
  particles.push(p);
}

function burstFire(x, y, n, spread, speed, life, big) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(speed * 0.4, speed);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(life * 0.5, life), maxLife: life,
      size: rand(6, big ? 22 : 12), type: 'fire', color: pick(['#ffd166', '#ff9f43', '#f368e0', '#ee5253'])
    });
  }
}

function burstSmoke(x, y, n, big) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(15, big ? 130 : 70);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.7, big ? 2.2 : 1.4), maxLife: big ? 2.2 : 1.4,
      size: rand(8, big ? 30 : 16), type: 'smoke', color: 'rgba(70,72,76,0.8)'
    });
  }
}

function burstSpark(x, y, n, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const sp = rand(speed * 0.3, speed);
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.15, life), maxLife: life,
      size: rand(1.5, 3.5), type: 'spark', color: '#ffe08a'
    });
  }
}

function addRing(x, y, r, color, life) {
  addParticle({ x, y, vx: 0, vy: 0, life: life, maxLife: life, size: r, type: 'ring', color });
}

function addFlash(x, y, r, color, life) {
  addParticle({ x, y, vx: 0, vy: 0, life: life, maxLife: life, size: r, type: 'flash', color });
}

function burstDebris(x, y, count, big) {
  for (let i = 0; i < count; i++) {
    const chunk = i % 6 === 0;
    const a = rand(0, TAU);
    const sp = rand(110, big ? 520 : 390) * (chunk ? 0.82 : 1);
    const size = rand(6, big ? 20 : 13) * (chunk ? 1.4 : 1);
    const verts = [];
    const sides = randi(3, 6);
    for (let k = 0; k < sides; k++) {
      const rr = size * rand(0.55, 1);
      verts.push({ x: Math.cos((k / sides) * TAU) * rr, y: Math.sin((k / sides) * TAU) * rr });
    }
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(chunk ? 1.1 : 0.7, big ? 2.1 : 1.55), maxLife: big ? 2.1 : 1.55,
      size, verts, rot: rand(0, TAU), rotSpeed: rand(-9, 9),
      type: 'debris', color: pick(['#f2f6fb', '#c9d4df', '#94a3b2', '#5d6874', '#ffb84d', '#ff8a5c'])
    });
  }
}

function addText(x, y, text, color, size) {
  addParticle({ x, y, vx: 0, vy: -34, life: 1.1, maxLife: 1.1, size: size || 16, type: 'text', text, color });
}

function addToast(text, color, size) {
  addParticle({ x: W / 2, y: H * 0.62, vx: 0, vy: -30, life: 1.5, maxLife: 1.5, size: size || 17, type: 'text', text, color });
}

function explode(x, y, power, big) {
  burstFire(x, y, big ? 42 : 24, big ? 340 : 220, big ? 3.1 : 1.9, big);
  burstSmoke(x, y, big ? 16 : 9, big);
  burstSpark(x, y, big ? 26 : 14, big ? 520 : 340, 0.7);
  addRing(x, y, big ? 90 : 55, 'rgba(255,220,150,0.8)', 0.45);
  addFlash(x, y, big ? 70 : 42, 'rgba(255,240,200,0.85)', 0.18);
  cam.shake = Math.min(26, cam.shake + power);
  AudioSys.explosion(big);
}

// ---------- P32 普通敌机命中反馈(视觉闪白立即消费 + 离散反馈 50ms 聚合) ----------
// 视觉: 敌机绘制(drawPlaneShape)立即读取 hitFlash 闪白 ENEMY_HIT_FLASH 秒, 不等待聚合窗口, 按敌机独立维护。
// 离散: 粒子/命中标记/音频/震动进聚合窗口 HIT_AGG_WINDOW; 聚合器只用游戏内 dt(禁 setTimeout); 暂停冻结并清空。
// 聚合事件合同(稳定, 供 P34.2 音频直接消费, 不另建限频器):
//   HitFeedback.queue: [{ type:'hit'|'kill', count, x, y, t }]
//   - 'hit' : 窗口内普通命中聚合; count=次数(全局上限 HIT_AGG_MAX_COUNT, 多目标同帧不按目标数放大); (x,y)=最近命中点(世界坐标); t=发射时 gameTime。
//   - 'kill': 窗口内击毁聚合; count=击毁数。爆炸/得分等即时反馈不经本聚合(killPlane 原样保留)。
//   每 HIT_AGG_WINDOW 秒至多各发射一次; 消费方读 HitFeedback.queue 后自行清空(队列硬上限 8)。
const HIT_AGG_WINDOW = 0.05;    // 离散反馈聚合窗口(秒), 可调
const HIT_AGG_MAX_COUNT = 3;    // 单聚合事件计数上限(防事件风暴), 可调
const ENEMY_HIT_FLASH = 0.08;   // 普通敌机受击闪白时长(秒), 可调(玩家受击 0.12 保持不变)
const HitFeedback = {
  acc: 0,            // 距上次发射的窗口累计(游戏 dt 驱动)
  norm: 0,           // 窗口内普通命中次数
  kills: 0,          // 窗口内击毁数
  lx: 0, ly: 0,      // 最近一次命中点(世界坐标)
  queue: [],         // 待消费聚合事件队列(见顶部合同注释)
  markT: 0,          // 屏幕命中标记剩余时长(秒)
  markX: 0, markY: 0,
  noteHit: function (x, y) {          // 命中记账(视觉闪白已由 damagePlane 立即写入, 不经本聚合)
    if (GAME.state !== 'playing') return;
    this.norm++;
    this.lx = x; this.ly = y;
  },
  noteKill: function () {
    if (GAME.state !== 'playing') return;
    this.kills++;
  },
  update: function (dt) {             // 每帧由主循环在 playing 分支调用; 暂停时不被调用(冻结)
    if (this.markT > 0) this.markT = Math.max(0, this.markT - dt);
    this.acc += dt;
    if (this.acc < HIT_AGG_WINDOW) return;
    this.acc = 0;
    if (this.norm > 0) {
      const c = Math.min(this.norm, HIT_AGG_MAX_COUNT);
      this.queue.push({ type: 'hit', count: c, x: this.lx, y: this.ly, t: gameTime });
      if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 8);
      if (particles.length < PARTICLE_SOFT_LIMIT) burstSpark(this.lx, this.ly, 4 + c * 2, 150, 0.3);
      this.markT = 0.09; this.markX = this.lx; this.markY = this.ly;
      this.norm = 0;
    }
    if (this.kills > 0) {
      this.queue.push({ type: 'kill', count: this.kills, x: this.lx, y: this.ly, t: gameTime });
      if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 8);
      this.kills = 0;
    }
  },
  reset: function () {                // 暂停分支调用: 清空未发出的聚合反馈(冻结且恢复不补喷)
    this.acc = 0; this.norm = 0; this.kills = 0;
    this.queue.length = 0;
    this.markT = 0;
  }
};

// ---------- damage helpers ----------
function damagePlane(p, dmg) {
  if (p && p.kind === 'wingman') return damageWingman(p, dmg);
  dmg *= (p.takeDmgMult || 1);
  p.hp -= dmg;
  p.hitFlash = p.kind === 'player' ? 0.12 : ENEMY_HIT_FLASH;   // P32: 敌机闪白约 0.08s(立即消费, 重复命中重置不累加)
  if (p.kind === 'player') {
    GAME.damageTaken += Math.min(dmg, p.hp + dmg);
    AudioSys.hit();
  }
  if (p.hp <= 0 && !p.dead) killPlane(p);
}

/* ============================================================
 * 击杀慢镜模块 SlowMo(任务书 10)
 * 项目:《苍穹之翼·单机空战》 单文件 Canvas 2D 空战游戏
 * 文件:work/gen/slowmo.js(纯 JS 片段,IIFE 封装 var SlowMo,供总控集成)
 *
 * 职责:精英敌机(big 击杀)被击坠时短暂减速游戏时间,增强打击感。
 * 设计:
 *  - 慢镜只影响"游戏时间流速",不影响自身计时器:
 *    update(dt) 必须由总控传入【真实 dt】(未缩放),自身推进不受 scale 影响。
 *  - 无缓入缓出:0.35s 很短,硬切即可;结束后 getScale() 直接回到 1。
 *  - 幂等覆盖策略(见 trigger 注释):已激活时若新 duration 更长则重置计时,
 *    更短则保持原剩余时间,保证"多目标同时击坠"时取最长慢镜。
 *  - 仅暴露全局名 SlowMo,不定义 loop/update 等与主文件冲突的全局名。
 * ============================================================ */
(function (global) {
  'use strict';

  var SlowMo = {
    active: false, // 是否处于慢镜状态
    t: 0,          // 已推进的真实时间(秒)
    dur: 0.35,     // 慢镜持续时长(秒)
    scale: 0.3     // 时间缩放系数(0 < scale < 1)

    /**
     * 激活慢镜(幂等)。
     * @param {number} [duration=0.35] 持续秒数;<=0 或非数字时回退默认
     * @param {number} [scale=0.3]     时间缩放系数;非 (0,1) 区间时回退默认
     * 幂等规则:已激活时——
     *   - 新 duration > 当前剩余时间:重置 t=0、dur=新 duration(取更长覆盖);
     *   - 新 duration <= 当前剩余时间:保持原剩余时间(不缩短,防抖动);
     *   - scale 始终更新为新值。
     */
  };
  SlowMo.trigger = function (duration, scale) {
    var d = (typeof duration === 'number' && isFinite(duration) && duration > 0) ? duration : 0.35;
    var s = (typeof scale === 'number' && isFinite(scale) && scale > 0 && scale < 1) ? scale : 0.3;
    if (this.active) {
      // 已激活:取更长覆盖;更短则忽略,避免多目标连击时被反复缩短
      var remaining = this.dur - this.t;
      if (d > remaining) {
        this.t = 0;
        this.dur = d;
      }
      this.scale = s;
    } else {
      this.active = true;
      this.t = 0;
      this.dur = d;
      this.scale = s;
    }
  };

  /**
   * 用【真实 dt】(秒)推进计时;结束后 active=false。
   * 防御:负值 / NaN / 非数字 dt 一律忽略,防止状态卡死。
   */
  SlowMo.update = function (dt) {
    if (!this.active) return;
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) return;
    this.t += dt;
    if (this.t >= this.dur) {
      this.active = false;
      this.t = this.dur; // 钳制,便于断言
    }
  };

  /** 返回当前时间缩放:慢镜中返回 scale,否则 1。 */
  SlowMo.getScale = function () {
    return this.active ? this.scale : 1;
  };

  /** 是否处于慢镜状态。 */
  SlowMo.isActive = function () {
    return this.active;
  };

  // 仅暴露 SlowMo 一个全局名(浏览器挂 window,Node 测试挂 globalThis)
  global.SlowMo = SlowMo;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));


function killPlane(p) {
  if (p && p.kind === 'wingman') return damageWingman(p, Math.max(1, p.hp || WINGMAN_CONFIG.maxHp));
  p.dead = true;
  const big = p.kind === 'bomber' || p.kind === 'transport' || p.kind === 'ace' || p.kind === 'gunship' || p.kind === 'eye' || p.kind === 'king';
  explode(p.x, p.y, big ? 22 : 12, big);
  burstDebris(p.x, p.y, big ? 10 : 6, big);
  if (p.kind === 'player') {
    if (GAME.unlimitedRevive || GAME.reviveCount > 0) {
      if (!GAME.unlimitedRevive) GAME.reviveCount--;
      GAME.revivesUsed++;
      player.alive = true;
      player.dead = false;
      player.hp = Math.round(player.maxHp * 0.6);
      player.altitude = 3500;   // 复活重置高度(任务书 19)
      player.invuln = 1.2;   // 动画期无敌(留余量),动画结束后由 updatePlayer 重新计时 3 秒
      player.reviveAnim = { t: 0, dur: 1.0 };
      for (let bi = 0; bi < bullets.length; bi++) if (bullets[bi].enemy) bullets[bi].life = 0;
      for (let mi = 0; mi < missiles.length; mi++) if (missiles[mi].enemy) missiles[mi].life = 0;
      GAME.freezeTimer = 0.8;
      GAME.pendingState = null;
      GAME.pendingTimer = 0;
      addToast(GAME.unlimitedRevive ? '复活!' : '复活!剩余 ×' + GAME.reviveCount, '#7ee787', 18);
      addRing(player.x, player.y, 60, 'rgba(126,231,135,0.9)', 0.6);
      addFlash(player.x, player.y, 50, 'rgba(200,255,210,0.9)', 0.25);
      cam.shake = Math.min(14, cam.shake + 5);
      AudioSys.pickup();
      return;
    }
    player.alive = false;
    GAME.freezeTimer = 1.6;
    GAME.pendingState = 'gameover';
    GAME.pendingTimer = 2.2;
    return;
  }
  if (p.kind === 'transport') {
    mission.failed = true;
    GAME.freezeTimer = 1.2;
    GAME.pendingState = 'gameover';
    GAME.pendingTimer = 2.4;
    return;
  }
  GAME.kills++;
  HitFeedback.noteKill();   // P32: 击毁聚合事件(P34.2 音频直接消费)
  if (big && typeof SlowMo !== 'undefined' && SlowMo.trigger) SlowMo.trigger(0.35, 0.3);
  const pts = p.score || 100;
  const gainedPts = player.buffs.score ? pts * 2 : pts;
  GAME.score += gainedPts;
  addText(p.x, p.y - 24, '+' + gainedPts, '#ffd166', 17);
  AudioSys.score();
  if (p.kind !== 'transport' && GAME.mode === 'endless') {
    const gained = Math.round((p.exp || 100) * expMultiplier());
    addExp(gained);
    registerKillCombo();
  }
  if (p.kind === 'ace' || p.kind === 'eye' || p.kind === 'king') mission.bossKilled = true;
  grantAchievements();
  if (Math.random() < 0.32) {
    pickups.push({
      x: p.x, y: p.y, vx: rand(-30, 30), vy: rand(-30, 30),
      type: pick(GAME.mode === 'endless' ? ['repair', 'missiles', 'score', 'revive'] : ['repair', 'missiles', 'score', 'wingman']), life: 18, t: rand(0, 3)
    });
  }
  if (GAME.mode === 'endless') dropLoot(p.x, p.y);
  spawnEnemyFlame(p);
}

function expMultiplier() {
  return 1 + GAME.combo * 0.2;
}

function comboCountdown() {
  return Math.max(1.5, GAME.comboMax - GAME.combo * 0.2);
}

function registerKillCombo() {
  if (GAME.combo > 0 && GAME.comboTimer > 0) {
    GAME.combo++;
  } else {
    GAME.combo = 1;
  }
  GAME.comboTimer = comboCountdown();
  if (GAME.combo > (GAME.maxCombo || 0)) GAME.maxCombo = GAME.combo;
  if (GAME.combo >= 2) {
    addText(player.x, player.y - 58, '连杀 ×' + GAME.combo + ' 经验 x' + (1 + GAME.combo * 0.2).toFixed(1), '#ffd166', 16);
    AudioSys.score();
  }
}

function addExp(amount) {
  GAME.exp += amount;
  addText(player.x, player.y - 40, '+' + amount + ' EXP', '#9be3ff', 14);
  let leveled = false;
  while (GAME.level < 300 && GAME.exp >= expNeeded(GAME.level)) {
    GAME.exp -= expNeeded(GAME.level);
    GAME.level++;
    const heal = Math.round(player.maxHp * 0.1);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    addText(player.x, player.y - 76, '升级 Lv.' + GAME.level + ' 修复 +' + heal, '#7ee787', 17);
    AudioSys.pickup();
    leveled = true;
  }
  if (GAME.level >= 300) GAME.exp = 0;
  if (leveled) showUpgradeChoice();
}

function expNeeded(level) {
  return Math.round(120 * Math.pow(level, 1.18));
}

function spawnEnemyFlame(p) {
  for (let i = 0; i < 6; i++) {
    addParticle({
      x: p.x + rand(-12, 12), y: p.y + rand(-12, 12),
      vx: rand(-40, 40), vy: rand(-90, -30),
      life: rand(0.5, 1.1), maxLife: 1.1, size: rand(5, 11), type: 'fire', color: '#ffb35c'
    });
  }
}

function hurtPlayer(dmg) {
  dmg *= (DIFFICULTY_DEFS[save.difficulty] || DIFFICULTY_DEFS.normal).enemyDmgMult;
  if (player.invuln > 0 || !player.alive) return;
  const shield = player.buffs.shield;
  if (shield && shield.t > 0) {
    shield.n--;
    if (shield.n <= 0) {
      delete player.buffs.shield;
      addText(player.x, player.y - 58, '护盾破碎', '#54c7ff', 15);
    } else {
      addText(player.x, player.y - 58, '护盾抵挡 · 剩余 ×' + shield.n, '#54c7ff', 15);
    }
    AudioSys.hit();
    player.hitFlash = Math.max(player.hitFlash, 0.15);
    cam.shake = Math.min(10, cam.shake + 3);
    return;
  }
  const mitigated = dmg;
  damagePlane(player, mitigated);
  player.hitFlash = Math.max(player.hitFlash, 0.3);
  cam.shake = Math.min(24, cam.shake + 8);
}

// ---------- P26 僚机核心（吸收 P24，评级统计适配） ----------
/*
 * Wingman core AI fragment for Skyfire Aces.
 * Browser globals read: player, allies, enemies, bullets; optional GAME,
 * explode, burstDebris. No DOM, canvas, audio, storage, or mission dependency.
 * Integration-owned collision code may use bullet.fromPlayer === true for normal
 * enemy damage/score flow; bullet.source/owner/creditPlayer identify wingman kills.
 */

const WINGMAN_CONFIG = Object.freeze({
  maxCount: 2,
  maxHp: 60,
  damageRatio: 0.35,
  fireCd: 0.28,
  targetRange: 1100,
  followBehind: 95,
  followSide: 72,
  orbitRadius: 120,
  orbitSpeed: 1.25,
  orbitCenterBehind: 55,
  engageViewFactor: 0.9,
  engageConeHalf: 1.15,
  fireLineClear: 48,
  breakDistance: 520,
  cruiseSpeed: 260,
  catchupSpeed: 430,
  acceleration: 520,
  turnRate: 4.2,
  fullRepair: 30,
  boostDuration: 8,
  boostRate: 1.25,
  bulletSpeed: 900,
  bulletLife: 1.25,
  bulletSize: 4,
  collideDamage: 20,
  collideCooldown: 0.5
});

function wingmanFinite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function wingmanAngleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function wingmanLiveList() {
  return typeof allies !== 'undefined' && Array.isArray(allies) ? allies : null;
}

function wingmanFormationPoint(slot) {
  const heading = wingmanFinite(player && player.heading, 0);
  const side = slot === 1 ? 1 : -1;
  const forwardX = Math.cos(heading);
  const forwardY = Math.sin(heading);
  const leftX = -forwardY;
  const leftY = forwardX;
  return {
    side,
    x: wingmanFinite(player && player.x, 0) - forwardX * WINGMAN_CONFIG.followBehind + leftX * side * WINGMAN_CONFIG.followSide,
    y: wingmanFinite(player && player.y, 0) - forwardY * WINGMAN_CONFIG.followBehind + leftY * side * WINGMAN_CONFIG.followSide
  };
}

function wingmanViewRange() {
  const zoom = cam && cam.zoom > 0 ? cam.zoom : CAM_ZOOM;
  return Math.hypot(W / 2, H * CAM_ANCHOR_Y) / zoom;
}

function wingmanInView(target) {
  if (!target || target.dead || target.hp <= 0 || target.retreat) return false;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  if (Math.hypot(dx, dy) > WINGMAN_CONFIG.engageViewFactor * wingmanViewRange()) return false;
  return Math.abs(angDiff(player.heading, angleTo(player.x, player.y, target.x, target.y))) <= WINGMAN_CONFIG.engageConeHalf;
}

function wingmanOrbitPoint(w, t) {
  const heading = wingmanFinite(player && player.heading, 0);
  const cx = wingmanFinite(player && player.x, 0) - Math.cos(heading) * WINGMAN_CONFIG.orbitCenterBehind;
  const cy = wingmanFinite(player && player.y, 0) - Math.sin(heading) * WINGMAN_CONFIG.orbitCenterBehind;
  const phase = wingmanFinite(w && w.orbitPhase, 0) + wingmanFinite(t, 0) * WINGMAN_CONFIG.orbitSpeed;
  return {
    side: w && w.slot === 1 ? 1 : -1,
    x: cx + Math.cos(phase) * WINGMAN_CONFIG.orbitRadius,
    y: cy + Math.sin(phase) * WINGMAN_CONFIG.orbitRadius
  };
}

function wingmanFireLineClear(w, target) {
  const targetAngle = angleTo(player.x, player.y, target.x, target.y);
  if (Math.abs(angDiff(player.heading, targetAngle)) > WINGMAN_CONFIG.engageConeHalf) return true;
  const dx = w.x - player.x;
  const dy = w.y - player.y;
  const lateral = Math.abs(-dx * Math.sin(player.heading) + dy * Math.cos(player.heading));
  return lateral >= WINGMAN_CONFIG.fireLineClear;
}

function makeWingman(slot) {
  const normalizedSlot = slot === 1 ? 1 : 0;
  const formation = wingmanFormationPoint(normalizedSlot);
  return {
    kind: 'wingman',
    slot: normalizedSlot,
    formationSide: formation.side,
    x: formation.x,
    y: formation.y,
    formationX: formation.x,
    formationY: formation.y,
    heading: wingmanFinite(player && player.heading, 0),
    speed: wingmanFinite(player && player.speed, WINGMAN_CONFIG.cruiseSpeed),
    maxSpeed: WINGMAN_CONFIG.cruiseSpeed,
    hp: WINGMAN_CONFIG.maxHp,
    maxHp: WINGMAN_CONFIG.maxHp,
    r: 14,
    fireCd: 0,
    rateBoostT: 0,
    orbitPhase: normalizedSlot === 1 ? Math.PI : 0,
    target: null,
    dead: false,
    alive: true,
    catchingUp: false,
    hitFlash: 0,
    smokeT: 0,
    collideCd: 0,
    color: '#55e6c1',
    tipColor: '#ffd166'
  };
}

function summonWingman() {
  const list = wingmanLiveList();
  if (!list) return { action: 'unavailable', wingman: null };
  const formation = list.filter(a => a && a.kind === 'wingman' && !a.dead);
  if (formation.length < WINGMAN_CONFIG.maxCount) {
    const used = new Set(formation.map(w => w.slot));
    const slot = used.has(0) ? 1 : 0;
    const wingman = makeWingman(slot);
    list.push(wingman);
    return { action: 'added', wingman };
  }
  for (const wingman of formation) {
    wingman.maxHp = WINGMAN_CONFIG.maxHp;
    wingman.hp = Math.min(wingman.maxHp, Math.max(0, wingmanFinite(wingman.hp, 0)) + WINGMAN_CONFIG.fullRepair);
    wingman.rateBoostT = WINGMAN_CONFIG.boostDuration;
  }
  return { action: 'boosted', wingmen: formation };
}

function acquireWingmanTarget(w) {
  if (!w || w.kind !== 'wingman' || w.dead || typeof enemies === 'undefined' || !Array.isArray(enemies)) return null;
  let nearest = null;
  let nearestD2 = WINGMAN_CONFIG.targetRange * WINGMAN_CONFIG.targetRange;
  for (const enemy of enemies) {
    if (!enemy || enemy.dead || enemy.hp <= 0 || enemy.kind === 'transport' || enemy.retreat) continue;
    if (!wingmanInView(enemy)) continue;
    const dx = wingmanFinite(enemy.x, Infinity) - w.x;
    const dy = wingmanFinite(enemy.y, Infinity) - w.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= nearestD2) {
      nearestD2 = d2;
      nearest = enemy;
    }
  }
  w.target = nearest;
  return nearest;
}

function fireWingmanGun(w) {
  if (!w || w.kind !== 'wingman' || w.dead || wingmanFinite(w.fireCd, 0) > 0 || typeof bullets === 'undefined' || !Array.isArray(bullets)) return null;
  const target = w.target && !w.target.dead && w.target.hp > 0 ? w.target : acquireWingmanTarget(w);
  if (!target) return null;
  if (!wingmanInView(target) || !wingmanFireLineClear(w, target)) {
    w.target = null;
    return null;
  }
  const dx = target.x - w.x;
  const dy = target.y - w.y;
  if (dx * dx + dy * dy > WINGMAN_CONFIG.targetRange * WINGMAN_CONFIG.targetRange) {
    w.target = null;
    return null;
  }
  const angle = Math.atan2(dy,dx);
  const weapon = player && player.weapon ? player.weapon : null;
  const baseDamage = wingmanFinite(weapon && weapon.dmg, 20);
  const speed = wingmanFinite(weapon && weapon.speed, WINGMAN_CONFIG.bulletSpeed);
  const boost = wingmanFinite(w.rateBoostT, 0) > 0 ? WINGMAN_CONFIG.boostRate : 1;
  w.fireCd = WINGMAN_CONFIG.fireCd / boost;
  const bullet = {
    x: w.x + Math.cos(angle) * 22,
    y: w.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * speed + Math.cos(w.heading) * wingmanFinite(w.speed, 0) * 0.7,
    vy: Math.sin(angle) * speed + Math.sin(w.heading) * wingmanFinite(w.speed, 0) * 0.7,
    life: wingmanFinite(weapon && weapon.life, WINGMAN_CONFIG.bulletLife),
    r: wingmanFinite(weapon && weapon.size, WINGMAN_CONFIG.bulletSize),
    dmg: Math.max(1, Math.round(baseDamage * WINGMAN_CONFIG.damageRatio)),
    enemy: false,
    fromPlayer: true,
    source: 'wingman',
    owner: w,
    creditPlayer: true,
    pierce: 0,
    blast: 0
  };
  bullets.push(bullet);
  // 僚机射击不污染玩家评级/命中统计。
  return bullet;
}

function updateWingman(w, dt) {
  if (!w || w.kind !== 'wingman' || w.dead || typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
  if (typeof player === 'undefined' || !player || player.dead || player.alive === false) return;

  w.fireCd = Math.max(0, wingmanFinite(w.fireCd, 0) - dt);
  w.rateBoostT = Math.max(0, wingmanFinite(w.rateBoostT, 0) - dt);
  w.hitFlash = Math.max(0, wingmanFinite(w.hitFlash, 0) - dt);

  if (!w.target || w.target.dead || w.target.hp <= 0 || w.target.retreat || !wingmanInView(w.target)
      || Math.hypot(w.target.x - w.x, w.target.y - w.y) > WINGMAN_CONFIG.targetRange) {
    acquireWingmanTarget(w);
  }
  const formation = w.target ? wingmanFormationPoint(w.slot) : wingmanOrbitPoint(w, gameTime);
  w.formationSide = formation.side;
  w.formationX = formation.x;
  w.formationY = formation.y;
  const dx = formation.x - w.x;
  const dy = formation.y - w.y;
  const distance = Math.hypot(dx, dy);
  w.catchingUp = distance > WINGMAN_CONFIG.breakDistance;
  const desiredHeading = distance > 2 ? Math.atan2(dy,dx) : wingmanFinite(player.heading, w.heading);
  const turn = Math.max(-WINGMAN_CONFIG.turnRate * dt,
    Math.min(WINGMAN_CONFIG.turnRate * dt, wingmanAngleDiff(wingmanFinite(w.heading, 0), desiredHeading)));
  w.heading = wingmanFinite(w.heading, 0) + turn;

  const playerSpeed = wingmanFinite(player.speed, WINGMAN_CONFIG.cruiseSpeed);
  const desiredSpeed = w.catchingUp
    ? WINGMAN_CONFIG.catchupSpeed
    : Math.min(WINGMAN_CONFIG.cruiseSpeed, Math.max(120, playerSpeed + Math.min(distance, 140)));
  const currentSpeed = wingmanFinite(w.speed, playerSpeed);
  const speedStep = WINGMAN_CONFIG.acceleration * dt;
  w.speed = currentSpeed < desiredSpeed
    ? Math.min(desiredSpeed, currentSpeed + speedStep)
    : Math.max(desiredSpeed, currentSpeed - speedStep);
  w.x += Math.cos(w.heading) * w.speed * dt;
  w.y += Math.sin(w.heading) * w.speed * dt;

  if (w.target) fireWingmanGun(w);
}

function removeWingman(w) {
  if (!w || w.kind !== 'wingman') return false;
  const list = wingmanLiveList();
  if (!list) return false;
  const index = list.indexOf(w);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

function damageWingman(w, dmg) {
  if (!w || w.kind !== 'wingman' || w.dead || typeof dmg !== 'number' || !Number.isFinite(dmg) || dmg <= 0) return false;
  w.hp = Math.max(0, wingmanFinite(w.hp, WINGMAN_CONFIG.maxHp) - dmg);
  w.hitFlash = 0.12;
  if (w.hp > 0) return false;
  w.dead = true;
  w.alive = false;
  w.target = null;
  if (typeof explode === 'function') explode(w.x, w.y, 8, false);
  if (typeof burstDebris === 'function') burstDebris(w.x, w.y, 4, false);
  removeWingman(w);
  return true;
}

// 敌机实体碰撞伤害：只检测存活敌机 × 存活僚机(最多 2 架)；
// 伤害唯一入口为 damageWingman()，不进入玩家/运输机/敌机计分链。
// 接触锁为僚机上的有界标量 collideCd：命中后冷却期内不重复结算；
// 与所有存活敌机分离(不再重叠)时锁归零，死亡/移除后锁随对象消失。
function updateWingmanCollisions(dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
  if (typeof enemies === 'undefined' || !Array.isArray(enemies)) return;
  const list = wingmanLiveList();
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (!w || w.kind !== 'wingman' || w.dead) continue;
    w.collideCd = Math.max(0, wingmanFinite(w.collideCd, 0) - dt);
    let touching = false;
    for (const e of enemies) {
      if (!e || e.dead || e.hp <= 0) continue;
      const dx = e.x - w.x;
      const dy = e.y - w.y;
      const hitR = wingmanFinite(e.r, 22) + wingmanFinite(w.r, 14);
      const d2 = dx * dx + dy * dy;
      if (d2 < hitR * hitR) {
        touching = true;
        if (w.collideCd <= 0) {
          w.collideCd = WINGMAN_CONFIG.collideCooldown;
          if (damageWingman(w, WINGMAN_CONFIG.collideDamage)) break;
        }
      }
    }
    if (!touching) w.collideCd = 0;
  }
}

// ---------- updates ----------
function tryBarrelRoll(dir) {
  if (GAME.state !== 'playing' || !player.alive || transition.active) return false;
  if (player.rollActive || player.rollCd > 0) return false;
  player.rollActive = true;
  player.rollDir = dir === 'left' ? -1 : 1;
  player.rollT = 0;
  player.rollCd = 2.6;
  player.invuln = Math.max(player.invuln, 1);
  player.lastDirTap = { dir: null, t: -99 };
  AudioSys.roll();
  addText(player.x, player.y - 58, dir === 'left' ? '左滚筒' : '右滚筒', '#9be3ff', 16);
  return true;
}

function steerPlane(p, desired, dt, rateMult) {
  const diff = angDiff(p.heading, desired);
  let rate = p.turn * (rateMult || 1);
  if (p.speed > 1) rate *= (1 - 0.32 * clamp((p.speed - CFG.minSpeed) / (CFG.maxSpeed - CFG.minSpeed), 0, 1));
  const max = rate * dt;
  const turn = clamp(diff, -max, max);
  p.heading += turn;
  p.bank = lerp(p.bank, clamp(turn / (dt || 0.001) / 2.4, -1, 1), 1 - Math.exp(-dt * 9));
}

function movePlane(p, dt) {
  p.x += Math.cos(p.heading) * p.speed * dt;
  p.y += Math.sin(p.heading) * p.speed * dt;
  p.x = clamp(p.x, 120, world.W - 120);
  p.y = clamp(p.y, 120, world.H - 120);
}

// 任务书 22:鼠标转向激活判定——最后移动距今 < MOUSE_STEER_TIMEOUT 秒
function mouseSteerActive(now) { return (now - input.mouse.movedAt) < MOUSE_STEER_TIMEOUT; }

function updatePlayer(dt) {
  if (!player.alive) return;
  const now = performance.now() / 1000;
  const turnL = isActionDown('turnLeft');
  const turnR = isActionDown('turnRight');
  // 触屏手势(任务书 20):手势激活时优先级高于键盘/鼠标
  const swipeActive = input.isTouch && touchSwipe.active && touchSwipe.dir;
  if (swipeActive) {
    // 左/右滑按住 → 转向; P34.1 连续强度: rateMult = lerp(STEER_RATE_MIN, STEER_RATE_MAX, strength), 触屏倍率 1.5 与高速衰减 32% 保持现状; P34.1-R1: 整体 ×STEER_SPEED_SCALE(0.85, -15%)
    const rateMult = lerp(STEER_RATE_MIN, STEER_RATE_MAX, touchSwipe.strength) * STEER_SPEED_SCALE;
    if (touchSwipe.dir === 'left') steerPlane(player, player.heading - Math.PI / 2, dt, 1.5 * rateMult);
    else if (touchSwipe.dir === 'right') steerPlane(player, player.heading + Math.PI / 2, dt, 1.5 * rateMult);
    else player.bank = lerp(player.bank, 0, 1 - Math.exp(-dt * 8));
  } else if (turnL || turnR) {
    const dir = turnL ? -1 : 1;
    steerPlane(player, player.heading + dir * Math.PI / 2, dt, 1.5);
  } else if (save.controlScheme !== 'keyboard-only' && mouseSteerActive(now)) {
    // 追尾相对转向(任务书 22):鼠标偏右→持续右转,偏左→持续左转,越远越快,回中停
    // P36: 纯键盘模式下鼠标不参与自机转向(仅 UI 点击); 键鼠模式角速度乘 MOUSE_STEER_SPEED 系数(已选择操作方式后生效)
    const mx = input.mouse.x - W / 2;
    if (Math.abs(mx) > MOUSE_STEER_DEADZONE) {
      const rate = (MOUSE_STEER_RATE * clamp(Math.abs(mx) / (W * MOUSE_STEER_FULL), MOUSE_STEER_MIN, 1)) * (controlSchemeChosen ? MOUSE_STEER_SPEED : 1);
      steerPlane(player, player.heading + Math.sign(mx) * Math.PI / 2, dt, rate);
    }
  } else {
    player.bank = lerp(player.bank, 0, 1 - Math.exp(-dt * 8));
  }

  // 油门:W/S 增减;触屏由右侧拖动条直接设值,松手保持,无巡航回落(任务书 21)
  if (isActionDown('throttleUp')) player.throttle = clamp(player.throttle + dt * 0.65, 0, 1);
  if (isActionDown('throttleDown')) player.throttle = clamp(player.throttle - dt * 0.65, 0, 1);
  player.afterburn = isActionDown('afterburn');
  if (isActionDown('dash') && !player.dashPressed) {
    player.dashPressed = true;
    tryDash();
  }
  if (!isActionDown('dash')) player.dashPressed = false;
  const targetSpeed = CFG.minSpeed + player.throttle * (CFG.maxSpeed - CFG.minSpeed) + (player.afterburn ? CFG.abSpeed : 0);
  player.speed = lerp(player.speed, targetSpeed, 1 - Math.exp(-dt * (player.afterburn ? 2.2 : 1.4) * player.accelMult));
  movePlane(player, dt);

  player.rollCd = Math.max(0, player.rollCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  if (player.dashActive) {
    player.dashT += dt;
    if (player.dashT >= player.dashDur) {
      player.dashActive = false;
      player.dashT = 0;
    } else {
      player.x += Math.cos(player.heading) * player.dashSpeed * dt;
      player.y += Math.sin(player.heading) * player.dashSpeed * dt;
      player.x = clamp(player.x, 120, world.W - 120);
      player.y = clamp(player.y, 120, world.H - 120);
    }
  }
  if (player.rollActive) {
    player.rollT += dt;
    if (player.rollT >= player.rollDur) {
      player.rollActive = false;
      player.rollT = 0;
      player.rollDir = 0;
    } else {
      const phase = player.rollT / player.rollDur;
      const px = -Math.sin(player.heading), py = Math.cos(player.heading);
      const amp = 120 * Math.sin(phase * Math.PI) * player.rollDir;
      player.x += px * amp * dt;
      player.y += py * amp * dt;
      player.x = clamp(player.x, 120, world.W - 120);
      player.y = clamp(player.y, 120, world.H - 120);
      if (Math.random() < dt * 55) {
        const ox = Math.cos(player.heading), oy = Math.sin(player.heading);
        const wob = Math.sin(player.rollT * 16) * 24;
        addParticle({
          x: player.x + px * wob - ox * 34, y: player.y + py * wob - oy * 34,
          vx: -ox * 60 + rand(-14, 14), vy: -oy * 60 + rand(-14, 14),
          life: rand(0.5, 0.9), maxLife: 0.9, size: rand(6, 10),
          type: 'smoke', color: 'rgba(230,240,245,0.6)'
        });
      }
    }
  }

  player.fireCd -= dt;
  player.missileCd -= dt;
  player.invuln = Math.max(0, player.invuln - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  // 高度系统:速度驱动(任务书 19)
  // speedRatio = player.speed / CFG.maxSpeed(370);rate = (speedRatio - 0.5) * 1600 高度/秒
  // ratio=0.27(怠速95)→ 约 -389/s,ratio=0.5(185)→ 0,ratio=1(370)→ +800/s,ratio=1.3(加力480)→ +1276/s
  // 系数 1600 可调(任务书 19:原 160 ×10);高度为 0 → 直接死亡(走 killPlane 现有流程)
  const speedRatio = player.speed / CFG.maxSpeed;
  player.altitude = Math.max(0, Math.min(9000, player.altitude + (speedRatio - 0.5) * 1600 * dt));
  if (player.altitude <= 0) { killPlane(player); return; }
  // 复活动画推进:动画结束后才开始 3 秒无敌计时(动画期间 invuln=1.2 已保证无敌)
  if (player.reviveAnim) {
    player.reviveAnim.t += dt;
    if (player.reviveAnim.t >= player.reviveAnim.dur) {
      player.reviveAnim = null;
      player.invuln = 3;   // 动画结束,开始计算 3 秒无敌
      addRing(player.x, player.y, 90, 'rgba(126,231,135,0.7)', 0.5);
      addToast('无敌 3 秒', '#7ee787', 15);
    } else {
      // 动画期间:金色上升光粒子
      if (Math.random() < dt * 30) addParticle({ x: player.x + rand(-14, 14), y: player.y + rand(-14, 14), vx: rand(-20, 20), vy: rand(-80, -40), life: rand(0.3, 0.6), maxLife: 0.6, size: rand(3, 6), type: 'fire', color: '#ffe08a' });
    }
  }
  if (player.throttle > 0.15 && Math.random() < dt * 6) {
    addParticle({
      x: player.x - Math.cos(player.heading) * 46, y: player.y - Math.sin(player.heading) * 46,
      vx: rand(-12, 12) - Math.cos(player.heading) * 40, vy: rand(-12, 12) - Math.sin(player.heading) * 40,
      life: rand(0.35, 0.7), maxLife: 0.7, size: rand(5, 9), type: 'smoke', color: 'rgba(230,230,235,0.55)'
    });
  }

  const wantFire = isActionDown('gun') || input.fireHeld || input.isTouch; // 触屏自动机炮(任务书 20)
  const manualFire = isActionDown('gun') || input.fireHeld;
  const touchAutoFire = input.isTouch && !manualFire;
  const autoMissileReady = input.isTouch && input.missileAuto && canFirePlayerMissile();
  const wantMsl = isActionDown('missile') || input.mslHeld || autoMissileReady;
  if (wantFire && (!touchAutoFire || !player.weapon || !player.weapon.limited || hasTouchAutoFireTarget(player.weapon))) firePlayerGuns();
  if (wantMsl) firePlayerMissile();
}

function hasTouchAutoFireTarget(w) {
  const gateRange = TOUCH_AUTO_FIRE_RANGE_FACTOR * w.speed * w.life;
  const gateRange2 = gateRange * gateRange;
  return enemies.some(e => {
    if (!e || e.dead || e.retreat || e.hp <= 0) return false;
    if (dist2(player.x, player.y, e.x, e.y) > gateRange2) return false;
    const enemyAngle = angleTo(player.x, player.y, e.x, e.y);
    return Math.abs(angDiff(player.heading, enemyAngle)) <= TOUCH_AUTO_FIRE_CONE;
  });
}

function firePlayerGuns() {
  if (player.fireCd > 0 || !player.alive) return;
  const w = player.weapon;
  if (!w || w.ammo === 0) return;
  player.fireCd = w.cd / (1 + (player.buffs.rate ? 0.5 : 0)) / player.fireRateMult;
  player.gunSide = -player.gunSide;
  const ox = Math.cos(player.heading), oy = Math.sin(player.heading);
  const px = -oy, py = ox;
  const count = Math.max(1, Math.round(w.barrel || 2));
  const offs = [];
  if (count === 1) offs.push(0);
  else if (count === 2) offs.push(-8, 8);
  else if (count === 3) offs.push(-13, 0, 13);
  else if (count === 4) offs.push(-16, -6, 6, 16);
  for (const side of offs) {
    const spread = rand(-w.spread, w.spread);
    const a = player.heading + spread;
    const dmgMult = (1 + (player.buffs.damage ? 0.6 : 0)) * player.gunDmgMult;
    bullets.push({
      x: player.x + ox * 36 + px * side,
      y: player.y + oy * 36 + py * side,
      vx: Math.cos(a) * w.speed + Math.cos(player.heading) * player.speed * 0.7,
      vy: Math.sin(a) * w.speed + Math.sin(player.heading) * player.speed * 0.7,
      life: w.life, r: w.size, dmg: Math.round(w.dmg * dmgMult), enemy: false, fromPlayer: true,
      pierce: w.pierce || 0, blast: w.blast || 0
    });
  }
  GAME.shotsFired += offs.length;
  if (w.limited) w.ammo--;
  if (w.limited && w.ammo <= 0) switchWeaponBack();
  AudioSys.gun();
}

function switchWeaponBack() {
  const list = GAME.weapons;
  while (list.length > 1) {
    list.pop();
    const prev = list[list.length - 1];
    if (prev && (!prev.limited || prev.ammo > 0)) {
      player.weapon = prev;
      addToast(prev.name + ' 已接替', QUALITY_COLOR[prev.quality], 15);
      return;
    }
  }
  player.weapon = defaultWeapon();
  addToast('默认机炮 已接替', '#dfe9f2', 15);
}

function canFirePlayerMissile() {
  return player.missileCd <= 0 && player.missiles > 0 && player.alive &&
    player.target && !player.target.dead && player.lock >= CFG.lockTime;
}

function firePlayerMissile() {
  if (player.missileCd > 0 || player.missiles <= 0 || !player.alive) return;
  if (!player.target || player.target.dead || player.lock < CFG.lockTime) {
    if (GAME.freezeTimer <= 0) addText(player.x, player.y - 54, '未锁定', '#9ad0ff', 14);
    return;
  }
  player.missiles--;
  player.missileCd = player.buffs.missile ? 0.28 : 0.55;
  const t = player.target;
  launchMissile(player.x + Math.cos(player.heading) * 40, player.y + Math.sin(player.heading) * 40, player.heading, t, false, 0);
  AudioSys.missileLaunch();
}

function launchMissile(x, y, heading, target, enemySide, dmgBonus) {
  missiles.push({
    x, y, heading, speed: CFG.missileSpeed * (enemySide ? 0.82 : 1),
    turn: enemySide ? 1.9 : CFG.missileTurn, life: CFG.missileLife, target: target,
    enemy: !!enemySide, trail: 0, r: 5, damage: CFG.missileDamage * (enemySide ? 1 : player.gunDmgMult), dmgBonus: dmgBonus || 0
  });
}

function acquireLock(dt) {
  let best = null, bestScore = 1e9;
  for (const e of enemies) {
    if (e.dead || e.retreat) continue;
    const d = dist(player.x, player.y, e.x, e.y);
    const a = angDiff(player.heading, angleTo(player.x, player.y, e.x, e.y));
    if (d < CFG.lockRange && Math.abs(a) < CFG.lockCone) {
      const score = d * (1 + Math.abs(a) * 2);
      if (score < bestScore) { bestScore = score; best = e; }
    }
  }
  const previousTarget = player.target;
  player.target = best;
  if (best !== previousTarget) player.lock = 0;
  if (best) {
    const previousLock = player.lock;
    player.lock = Math.min(CFG.lockTime, player.lock + (player.buffs.missile ? 2 : 1) * dt);
    if ((previousLock < 0.4 && player.lock >= 0.4) || (previousLock < 0.75 && player.lock >= 0.75)) AudioSys.lockBeep();
  } else {
    player.lock = 0;
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (!b) { bullets.splice(i, 1); continue; }
    const sx = b.x, sy = b.y;   // 本帧起点(扫掠用, 标量无分配)
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    b.hitCount = b.hitCount || 0;
    let dead = b.life <= 0;
    if (b.fromPlayer) {
      // P31: 近距命中扫掠——整帧线段 vs 敌机命中圆, 命中轨迹上最近目标(t 最小);
      // 碰撞判定先于销毁(生命耗尽帧仍结算本帧扫掠); 爆炸/特效位于交点而非终点。
      let bestT = 2, bestE = null;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (!e || e.dead || e === b.lastHit) continue;   // 穿透弹不重复结算刚穿过的目标
        const hr = e.r + 8;
        const bx0 = sx < b.x ? sx : b.x, bx1 = sx < b.x ? b.x : sx;
        if (e.x < bx0 - hr || e.x > bx1 + hr) continue;   // 线段包围盒粗剪枝(两端点各扩 hr)
        const by0 = sy < b.y ? sy : b.y, by1 = sy < b.y ? b.y : sy;
        if (e.y < by0 - hr || e.y > by1 + hr) continue;
        const t = segmentCircleHitT(sx, sy, b.x, b.y, e.x, e.y, hr);
        if (t !== null && t < bestT) { bestT = t; bestE = e; }
      }
      if (bestE) {
        const hx = sx + (b.x - sx) * bestT, hy = sy + (b.y - sy) * bestT;
        damagePlane(bestE, b.dmg);
        if (b.blast) {
          for (const other of enemies) {
            if (other.dead || other === bestE) continue;
            if (dist(hx, hy, other.x, other.y) < b.blast + other.r) damagePlane(other, b.dmg * 0.55);
          }
        }
        HitFeedback.noteHit(hx, hy);   // P32: 离散命中反馈进 50ms 聚合窗口(视觉闪白由 damagePlane 立即写入)
        if (b.source !== 'wingman') GAME.shotsHit++;
        b.hitCount++;
        b.lastHit = bestE;
        if (b.pierce && b.hitCount <= b.pierce) { b.x = hx; b.y = hy; }   // 穿透弹自交点继续(每帧仍只结算最近 1 目标)
        else dead = true;
      }
    } else if (!dead) {
      for (const t of [player, ...allies]) {
        if (t.dead || !t.alive) continue;
        if (dist2(b.x, b.y, t.x, t.y) < (t.r + 8) * (t.r + 8)) {
          if (t === player) hurtPlayer(b.dmg);
          else if (t.kind === 'wingman') damageWingman(t, b.dmg);
          else damagePlane(t, b.dmg);
          burstSpark(b.x, b.y, 3, 130, 0.25);
          dead = true;
          break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (!m) { missiles.splice(i, 1); continue; }
    if (m.target && !m.target.dead) {
      const desired = angleTo(m.x, m.y, m.target.x, m.target.y);
      const diff = angDiff(m.heading, desired);
      let turnMult = 1;
      if (m.enemy && m.target === player && (player.rollActive || player.dashActive)) turnMult = 0.28;
      const max = m.turn * turnMult * dt;
      m.heading += clamp(diff, -max, max);
    }
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    m.life -= dt;
    m.trail -= dt;
    if (m.trail <= 0) {
      m.trail = 0.05;
      addParticle({
        x: m.x - Math.cos(m.heading) * 6, y: m.y - Math.sin(m.heading) * 6,
        vx: rand(-8, 8), vy: rand(-8, 8), life: rand(0.35, 0.6), maxLife: 0.6,
        size: rand(4, 7), type: 'smoke', color: 'rgba(220,220,225,0.7)'
      });
    }
    let dead = m.life <= 0;
    if (!dead && m.target && dist2(m.x, m.y, m.target.x, m.target.y) < (m.target.r + 9) * (m.target.r + 9)) {
      m.x = m.target.x; m.y = m.target.y;
      dead = true;
    }
    if (dead) {
      explode(m.x, m.y, 7, false);
      if (!m.enemy) {
        for (const e of enemies) {
          if (e.dead) continue;
          const d = dist(m.x, m.y, e.x, e.y);
          if (d < CFG.missileBlast + e.r) damagePlane(e, m.damage * (1 + (m.dmgBonus || 0)));
        }
      } else {
        const targets = [player, ...allies];
        for (const t of targets) {
          if (t.dead || !t.alive) continue;
          const d = dist(m.x, m.y, t.x, t.y);
          if (d < CFG.missileBlast + t.r) {
            if (t === player) hurtPlayer(m.damage * 0.8);
            else if (t.kind === 'wingman') damageWingman(t, m.damage);
            else damagePlane(t, m.damage);
          }
        }
      }
      missiles.splice(i, 1);
    }
  }
}

function enemyFireGuns(e, dt) {
  if (e.fireCd > 0) { e.fireCd -= dt; return; }
  const t = e.aiTarget || player;
  if (!t || t.dead || !t.alive) return;
  const d = dist(e.x, e.y, t.x, t.y);
  if (d > 820) return;
  const a = angDiff(e.heading, angleTo(e.x, e.y, t.x, t.y));
  if (Math.abs(a) > 0.5) return;
  e.fireCd = e.kind === 'gunner' ? 0.16 : rand(0.5, 0.9);
  const dir = e.heading + rand(-0.03, 0.03);
  for (let i = 0; i < (e.kind === 'gunner' ? 3 : 1); i++) {
    const off = (i - 1) * 8;
    bullets.push({
      x: e.x + Math.cos(e.heading) * 30 + -Math.sin(e.heading) * off,
      y: e.y + Math.sin(e.heading) * 30 + Math.cos(e.heading) * off,
      vx: Math.cos(dir) * 620 + Math.cos(e.heading) * e.speed * 0.6,
      vy: Math.sin(dir) * 620 + Math.sin(e.heading) * e.speed * 0.6,
      life: 1.6, r: 4, dmg: e.kind === 'gunner' ? 6 : 8, enemy: true, fromPlayer: false
    });
  }
}

function enemyFireMissile(e, dt) {
  if (e.mslCd > 0) { e.mslCd -= dt; return; }
  const t = e.aiTarget || player;
  if (!t || t.dead || !t.alive) return;
  const d = dist(e.x, e.y, t.x, t.y);
  if (d < 400 || d > 1250) return;
  const a = angDiff(e.heading, angleTo(e.x, e.y, t.x, t.y));
  if (Math.abs(a) > 0.6) return;
  e.mslCd = e.kind === 'ace' ? (e.phase2 ? 1.8 : 2.6) : rand(5, 8);
  if (e.kind === 'ace') {
    const count = e.phase2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      launchMissile(e.x, e.y, e.heading + (i - (count - 1) / 2) * 0.22, t, true);
    }
    AudioSys.warningLaunch();
  } else {
    launchMissile(e.x, e.y, e.heading, t, true);
    AudioSys.warningLaunch();
  }
}

function chooseEnemyTarget(e, dt) {
  if (!e || e.dead || ['ace', 'eye', 'king', 'bomber', 'gunship', 'kamikaze'].includes(e.kind)) return player;
  e.targetPickCd = Math.max(0, (e.targetPickCd || 0) - dt);
  if (e.aiTarget && !e.aiTarget.dead && e.aiTarget.alive !== false && e.targetPickCd > 0) return e.aiTarget;
  e.targetPickCd = rand(2.2, 4.2);
  const wingmen = allies.filter(a => a && a.kind === 'wingman' && !a.dead && a.alive !== false);
  e.aiTarget = wingmen.length && Math.random() < 0.15 ? pick(wingmen) : player;
  return e.aiTarget;
}

function updateEnemy(e, dt) {
  chooseEnemyTarget(e, dt);
  if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);   // P32: 敌机受击闪白递减(绘制立即消费)
  if (e.dead) return;
  if (e.kind === 'drone') return updateDrone(e, dt);
  if (e.kind === 'kamikaze') return updateKamikaze(e, dt);
  if (e.kind === 'interceptor') return updateInterceptor(e, dt);
  if (e.kind === 'gunship') return updateGunship(e, dt);
  if (e.kind === 'eye') return updateEyeBoss(e, dt);
  if (e.kind === 'king') return updateKingBoss(e, dt);
  if (e.retreat) {
    e.speed = Math.max(300, e.speed + dt * 120);
    movePlane(e, dt);
    return;
  }
  const t = e.aiTarget && !e.aiTarget.dead ? e.aiTarget : player;
  e.aiTarget = t;
  const d = dist(e.x, e.y, t.x, t.y);
  const toT = angleTo(e.x, e.y, t.x, t.y);

  if (e.kind === 'fighter') {
    const orbit = Math.sin(gameTime * 0.8 + e.seed) * 0.9;
    steerPlane(e, toT + orbit * 0.35 + (d > 1300 ? 0 : 0.4), dt);
    e.speed = lerp(e.speed, e.maxSpeed * (d > 900 ? 1.15 : 0.82), dt * 0.6);
    if (d > 1500) steerPlane(e, toT, dt);
    movePlane(e, dt);
  } else if (e.kind === 'gunner') {
    let desired;
    if (d < 470) desired = toT + Math.PI;
    else if (d > 800) desired = toT;
    else desired = toT + 1.15;
    steerPlane(e, desired, dt, 0.9);
    movePlane(e, dt);
  } else if (e.kind === 'bomber') {
    const wp = mission.transport && mission.escort ? mission.transport : t;
    const wx = wp.x + Math.cos(gameTime * 0.1) * 240;
    const wy = wp.y + Math.sin(gameTime * 0.1) * 160;
    steerPlane(e, angleTo(e.x, e.y, wx, wy), dt, 0.55);
    movePlane(e, dt);
  } else if (e.kind === 'ace') {
    e.attackT -= dt;
    const circleD = d < 430 ? 1.35 : (d > 780 ? -1.1 : 0.85);
    steerPlane(e, toT + circleD, dt, 1.05);
    e.speed = lerp(e.speed, e.maxSpeed * (d > 700 ? 1.1 : 0.9), dt * 0.8);
    if (e.attackT <= 0) {
      e.attackT = e.phase2 ? rand(3.4, 4.6) : rand(5, 7);
      e.mslCd = 0.15;
    }
    movePlane(e, dt);
  }

  enemyFireGuns(e, dt);
  enemyFireMissile(e, dt);

  if (e.hp < e.maxHp * 0.45) {
    e.smokeT -= dt;
    if (e.smokeT <= 0) {
      e.smokeT = 0.09;
      addParticle({
        x: e.x, y: e.y, vx: rand(-18, 18) - Math.cos(e.heading) * e.speed * 0.25,
        vy: rand(-18, 18) - Math.sin(e.heading) * e.speed * 0.25,
        life: rand(0.5, 1), maxLife: 1, size: rand(6, 11), type: 'smoke', color: 'rgba(50,52,55,0.85)'
      });
    }
  }
  if (e.kind === 'ace' && !e.phase2 && e.hp < e.maxHp * 0.4) {
    e.phase2 = true;
    addRing(e.x, e.y, 140, 'rgba(255,80,60,0.9)', 0.8);
    addText(e.x, e.y - 40, '绯红彗星 进入第二阶段', '#ff8a80', 17);
  }
}

function updateWrecks(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.dead) continue;
    if (GAME.state !== 'playing' && GAME.state !== 'paused' && GAME.state !== 'complete' && GAME.state !== 'gameover') continue;
    e.wreckT += dt;
    if (!e.wreckDone && e.wreckT > 5) {
      e.wreckDone = true;
      e.wreckFade = 0;
    }
    if (e.wreckDone) {
      e.wreckFade = Math.min(1, e.wreckFade + dt / 1.5);
      if (Math.random() < dt * 14) {
        addParticle({
          x: e.x + rand(-14, 14), y: e.y + rand(-14, 14),
          vx: rand(-18, 18), vy: rand(-30, -10),
          life: rand(0.4, 0.9), maxLife: 0.9, size: rand(4, 8),
          type: 'fire', color: '#ffb35c'
        });
      }
      if (e.wreckFade >= 1) enemies.splice(i, 1);
    }
  }
}

function updateCombo(dt) {
  if (GAME.state !== 'playing') return;   // P33: 暂停冻结连击计时(补口1)
  if (GAME.mode !== 'endless') return;
  if (GAME.combo > 0 && GAME.comboTimer > 0) {
    GAME.comboTimer -= dt;
    if (GAME.comboTimer <= 0) {
      GAME.combo = 0;
      GAME.comboTimer = 0;
    }
  }
}

function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 62;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

// ---------- P31 玩家-敌机柔和分离 + 接触伤害(发布默认零值) ----------
const SEP_MARGIN = 10;          // 分离触发间距(可调): 目标机心距 = player.r + e.r + SEP_MARGIN
const SEP_MAX_PUSH = 6;         // 玩家每 tick 累计推移上限(可调, 防瞬移; 不得按敌机分别推)
const SEP_ITER_MAX = 3;         // 每 tick 最多处理的敌机数(可调, 优先穿透最深者)
let CONTACT_DMG = 0;            // 接触伤害(可调; 发布默认 0 = 只分离不扣血不震动)
let CONTACT_COOLDOWN = 0.5;     // 玩家级全局接触冷却(可调, 非零伤害路径生效)
const CONTACT_MAX_RATIO = 0.03; // 单次接触伤害上限 = 玩家最大生命 3%(可调, 2-3%)

function separatePlayerFromEnemies() {
  if (GAME.state !== 'playing' || !player.alive || player.dead) return;
  if (!mission || mission.complete || mission.failed) return;
  let pushed = 0;
  for (let iter = 0; iter < SEP_ITER_MAX; iter++) {
    let worst = null, worstD2 = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.dead || e.hp <= 0) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      const min = player.r + e.r + SEP_MARGIN;
      if (d2 < min * min && d2 < worstD2) { worst = e; worstD2 = d2; }   // 优先穿透最深者
    }
    if (!worst) break;
    const min = player.r + worst.r + SEP_MARGIN;
    let d = Math.sqrt(worstD2);
    let nx, ny;
    if (d < 1e-6) {
      // 中心完全重合: 确定性备用法向量(玩家朝向, 禁 NaN/随机抖动)
      nx = Math.cos(player.heading); ny = Math.sin(player.heading);
    } else {
      nx = (worst.x - player.x) / d; ny = (worst.y - player.y) / d;
    }
    const need = min - d;
    const epush = need / 2;                                             // 敌机侧推力(每敌各半)
    const ppush = Math.min(need - epush, SEP_MAX_PUSH - pushed);        // 玩家侧受每 tick 累计上限
    if (ppush > 0) {
      player.x -= nx * ppush; player.y -= ny * ppush;
      pushed += ppush;
    }
    if (epush > 0) {
      worst.x += nx * epush; worst.y += ny * epush;
      worst.x = clamp(worst.x, 120, world.W - 120);
      worst.y = clamp(worst.y, 120, world.H - 120);
    }
  }
  // 分离后重新执行飞行边界约束
  player.x = clamp(player.x, 120, world.W - 120);
  player.y = clamp(player.y, 120, world.H - 120);
}

function updatePlayerContact(dt) {
  if (GAME.state !== 'playing' || !player.alive || player.dead) return;
  if (!mission || mission.complete || mission.failed) return;
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  if (CONTACT_DMG <= 0) return;                      // 发布默认零值: 只分离, 不扣血不震动(不跑检测)
  player.contactCd = Math.max(0, (player.contactCd || 0) - dt);
  let touching = false;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.dead || e.hp <= 0) continue;
    const dx = e.x - player.x, dy = e.y - player.y;
    const hr = player.r + e.r;
    if (dx * dx + dy * dy < hr * hr) { touching = true; break; }
  }
  if (!touching) { player.contactCd = 0; return; }   // 脱离接触 → 冷却归零(下次接触立即可伤)
  if (player.contactCd > 0) return;                  // 玩家级全局冷却内不重复结算
  if (player.invuln > 0) return;                     // 无敌期内不消耗冷却、无受击反馈
  player.contactCd = CONTACT_COOLDOWN;
  const dmg = Math.min(CONTACT_DMG, Math.max(1, Math.round(player.maxHp * CONTACT_MAX_RATIO)));
  hurtPlayer(dmg);   // 走既有 hurtPlayer 全链(难度倍率/护盾/受击反馈), 不新建扣血路径
}

function collectWingmanSupport() {
  const result = summonWingman();
  if (result.action === 'added') {
    addToast('僚机支援已加入编队', '#55e6c1', 17);
  } else if (result.action === 'boosted') {
    addToast('僚机满编：修复 +30 · 射速强化 8秒', '#ffd166', 16);
  }
  AudioSys.pickup();
  return result;
}

function updatePickups(dt) {
  if (GAME.state !== 'playing') return;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx = lerp(p.vx, 0, dt * 2); p.vy = lerp(p.vy, 0, dt * 2);
    p.life -= dt;
    p.t += dt;
    if (player.alive && dist2(p.x, p.y, player.x, player.y) < 56 * 56) {
      if (GAME.mode === 'endless') {
        collectLoot(p);
      } else {
        if (p.type === 'wingman') { collectWingmanSupport(); }
        else if (p.type === 'repair') { player.hp = Math.min(player.maxHp, player.hp + 38); addText(player.x, player.y - 44, '机身修复 +38', '#7ee787', 15); }
        else if (p.type === 'missiles') { player.missiles = Math.min(player.maxMissiles, player.missiles + 10); addText(player.x, player.y - 44, '导弹 +10', '#7fd4ff', 15); }
        else if (p.type === 'revive') {
          if (GAME.reviveCount < 9) { GAME.reviveCount++; addText(player.x, player.y - 44, '复活次数 +1', '#7ee787', 15); AudioSys.pickup(); }
          else { addText(player.x, player.y - 44, '复活次数已满', '#aebecd', 13); }
        }
        else { GAME.score += 500; addText(player.x, player.y - 44, '荣誉点数 +500', '#ffd166', 15); }
        AudioSys.pickup();
      }
      pickups.splice(i, 1);
      continue;
    }
    if (p.life <= 0) pickups.splice(i, 1);
  }
}

function defaultWeapon() {
  return {
    id: 'default', name: '默认机炮', limited: false, cd: CFG.gunRate, dmg: CFG.gunDamage,
    speed: CFG.gunSpeed, spread: CFG.gunSpread, life: 0.75, size: 4, barrel: 2,
    quality: 'common', ammo: Infinity
  };
}

function pickQuality() {
  const r = Math.random();
  if (r < 0.62) return 'common';
  if (r < 0.9) return 'good';
  return 'rare';
}

function makeWeapon(id, quality) {
  const t = DROP_WEAPONS[id];
  const q = QUALITY_MULT[quality] || 1;
  return {
    id, name: t.name, limited: !!t.limited,
    cd: Math.max(0.045, t.cd * (quality === 'common' ? 1 : quality === 'good' ? 0.94 : 0.88)),
    dmg: Math.max(1, Math.round(t.dmg * q)),
    speed: Math.round(t.speed * q),
    spread: t.spread * (quality === 'common' ? 1.12 : quality === 'good' ? 1 : 0.9),
    life: t.life, size: Math.max(3, Math.round(t.size * q)),
    barrel: t.barrel, pierce: t.pierce || 0, blast: t.blast || 0,
    ammo: t.limited ? Math.max(1, Math.round(t.per * q)) : Infinity,
    quality
  };
}

function dropLoot(x, y) {
  const r = Math.random();
  if (r < 0.1) return;
  if (r < 0.2) {
    pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'wingman', life: 18, t: rand(0, 3) });
    return;
  }
  if (r < 0.6) {
    const id = pick(Object.keys(BUFF_DEFS));
    pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'buff', id, life: 18, t: rand(0, 3) });
    return;
  }
  if (r < 0.75) {
    const id = pick(Object.keys(DROP_MOVES));
    const quality = pickQuality();
    pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'move', id, quality, life: 18, t: rand(0, 3) });
    return;
  }
  const supply = pick(Object.keys(DROP_SUPPLIES));
  pickups.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), type: 'supply', supply, life: 18, t: rand(0, 3) });
}

function collectLoot(p) {
  GAME.pickupsTaken++;
  if (p.type === 'wingman') {
    collectWingmanSupport();
  } else if (p.type === 'buff') {
    applyBuff(p.id);
  } else if (p.type === 'move') {
    const t = DROP_MOVES[p.id];
    const qi = QUALITY_ORDER.indexOf(p.quality);
    const q = QUALITY_MULT[p.quality] || 1;
    const newDash = {
      id: p.id, quality: p.quality, name: t.name,
      cd: t.cd[qi] * (p.quality === 'common' ? 1.05 : p.quality === 'good' ? 1 : 0.95),
      dur: t.dur[qi], speed: Math.round(t.speed[qi] * (p.quality === 'common' ? 0.9 : p.quality === 'good' ? 1 : 1.12)),
      invuln: t.invuln[qi]
    };
    const old = GAME.dash;
    GAME.dash = newDash;
    player.dashCd = 0;
    addToast(QUALITY_NAME[p.quality] + ' ' + t.name + ' 已获得', QUALITY_COLOR[p.quality], 16);
    AudioSys.pickup();
    void old;
  } else if (p.type === 'supply') {
    const s = DROP_SUPPLIES[p.supply];
    if (p.supply === 'repair') {
      player.hp = Math.min(player.maxHp, player.hp + s.amount);
      addToast(s.name + ' +' + s.amount, s.color, 16);
    } else if (p.supply === 'missiles') {
      player.missiles = Math.min(player.maxMissiles, player.missiles + s.amount);
      addToast(s.name + ' +' + s.amount, s.color, 16);
    } else {
      GAME.score += s.amount;
      addToast(s.name + ' +' + s.amount, s.color, 16);
    }
    AudioSys.pickup();
  } else if (p.type === 'revive') {
    if (GAME.reviveCount < 9) {
      GAME.reviveCount++;
      addText(player.x, player.y - 40, '复活次数 +1', '#7ee787', 15);
      AudioSys.pickup();
    } else {
      addText(player.x, player.y - 40, '复活次数已满', '#aebecd', 13);
    }
  }
}

function applyBuff(id) {
  const def = BUFF_DEFS[id];
  if (!def) return;
  player.buffs[id] = { t: def.dur, n: id === 'shield' ? 2 : 0 };
  addToast(def.name + ' 生效 · ' + def.dur + 's', def.color, 16);
  AudioSys.pickup();
}

function updateBuffs(dt) {
  for (const id of Object.keys(player.buffs)) {
    const b = player.buffs[id];
    b.t -= dt * (player.buffCdMult || 1);
    if (b.t <= 0) delete player.buffs[id];
  }
}

// [P30] 主动换型：立即装备本次选择的新武器对象；历史同 ID 对象保留供合成/回退，不做 count 合并
function equipIncomingWeapon(id, quality) {
  const def = DROP_WEAPONS[id];
  const w = makeWeapon(id, quality);
  if (w.limited) {
    GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
    GAME.weapons.push(w);
    player.weapon = w;
    addToast('已切换为 ' + w.name + '（弹药 ×' + w.ammo + '）', QUALITY_COLOR[quality], 16);
    AudioSys.pickup();
    return;
  }
  if (!w.limited) w.count = 1;
  GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
  GAME.weapons.push(w);
  player.weapon = w;
  addToast('已切换为 ' + QUALITY_NAME[quality] + ' ' + w.name, QUALITY_COLOR[quality], 16);
  AudioSys.pickup();
}

function applyWeapon(id, quality) {
  if (id === 'default') return;
  // [P30] 主动换型：任何历史同 ID 品质/合成判断之前先处理不同 ID 的立即装备
  const switchingType = player.weapon && player.weapon.id !== id;
  if (switchingType) {
    return equipIncomingWeapon(id, quality); // 立即装备本次选择
  }
  const def = DROP_WEAPONS[id];
  const qIdx = QUALITY_ORDER.indexOf(quality);
  const sameId = GAME.weapons.filter(w => w.id === id && (!w.limited || w.ammo > 0));
  let best = null, bestIdx = -1;
  for (const w of sameId) {
    const i = QUALITY_ORDER.indexOf(w.quality);
    if (i > bestIdx) { best = w; bestIdx = i; }
  }
  if (best && qIdx < bestIdx) {
    GAME.synth = GAME.synth || {};
    const key = id + ':' + quality;
    GAME.synth[key] = (GAME.synth[key] || 0) + 1;
    if (GAME.synth[key] >= 3 && qIdx < QUALITY_ORDER.length - 1) {
      GAME.synth[key] = 0;
      const nextQ = QUALITY_ORDER[qIdx + 1];
      const nextW = makeWeapon(id, nextQ);
      if (!nextW.limited) nextW.count = 1;
      GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
      GAME.weapons.push(nextW);
      const nextIdx = QUALITY_ORDER.indexOf(nextQ);
      if (!best || nextIdx >= bestIdx) player.weapon = nextW;
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' ×3 已合成 ' + QUALITY_NAME[nextQ] + ' ' + nextW.name, QUALITY_COLOR[nextQ], 17);
      AudioSys.score();
    } else {
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 合成进度 ' + (GAME.synth[key] || 0) + '/3', QUALITY_COLOR[quality], 15);
      AudioSys.pickup();
    }
    return;
  }
  const existing = GAME.weapons.find(w => w.id === id && w.quality === quality && !w.limited);
  if (existing && !def.limited) {
    existing.count = (existing.count || 0) + 1;
    const curIdx = QUALITY_ORDER.indexOf(quality);
    if (existing.count >= 3 && curIdx < QUALITY_ORDER.length - 1) {
      const upgraded = makeWeapon(id, QUALITY_ORDER[curIdx + 1]);
      upgraded.count = 1;
      const idx = GAME.weapons.indexOf(existing);
      if (idx >= 0) GAME.weapons[idx] = upgraded;
      player.weapon = upgraded;
      addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 已升级为 ' + QUALITY_NAME[upgraded.quality] + ' ' + upgraded.name, QUALITY_COLOR[upgraded.quality], 17);
      AudioSys.score();
      return;
    }
    addToast(QUALITY_NAME[quality] + ' ' + def.name + ' 合成进度 ' + (existing.count || 0) + '/3', QUALITY_COLOR[quality], 15);
    AudioSys.pickup();
    return;
  }
  const w = makeWeapon(id, quality);
  if (w.limited) {
    GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
    const sameLimited = GAME.weapons.find(x => x.id === id && x.quality === quality);
    if (sameLimited && sameLimited.ammo > 0) {
      const bonus = w.ammo;
      sameLimited.ammo = Math.min(999, sameLimited.ammo + bonus);
      player.weapon = sameLimited;
      addToast('已补充 ' + QUALITY_NAME[quality] + ' ' + w.name + ' +' + bonus, QUALITY_COLOR[quality], 16);
      AudioSys.pickup();
      return;
    }
    GAME.weapons.push(w);
    player.weapon = w;
    addToast('获得 ' + QUALITY_NAME[quality] + ' ' + w.name + ' 弹药 ×' + w.ammo, QUALITY_COLOR[quality], 16);
    AudioSys.pickup();
    return;
  }
  if (!w.limited) w.count = 1;
  GAME.weapons = GAME.weapons.filter(x => !x.limited || x.ammo > 0);
  GAME.weapons.push(w);
  player.weapon = w;
  addToast('获得 ' + QUALITY_NAME[quality] + ' ' + w.name, QUALITY_COLOR[quality], 16);
  AudioSys.pickup();
}

function tryDash() {
  const d = GAME.dash;
  if (!d || player.dashActive || player.dashCd > 0 || !player.alive) return false;
  player.dashActive = true;
  player.dashT = 0;
  player.dashDur = d.dur;
  player.dashSpeed = d.speed;
  player.dashCd = d.cd;
  player.invuln = Math.max(player.invuln, d.invuln);
  AudioSys.roll();
  addText(player.x, player.y - 58, '突进', '#9be3ff', 16);
  return true;
}

function showUpgradeChoice() {
  if (GAME.mode !== 'endless' || upgradeChoice || !player.alive) return;
  const bag = Object.keys(DROP_WEAPONS).slice();
  const chosen = [];
  for (let i = 0; i < 3 && bag.length; i++) {
    const idx = Math.floor(Math.random() * bag.length);
    chosen.push(bag.splice(idx, 1)[0]);
  }
  upgradeChoice = {
    options: chosen.map(id => ({ id, quality: pickQuality() })),
    index: -1,
    timer: 0
  };
  upgradeChoiceSel = 0;
}

function applyUpgrade(u) {
  if (!upgradeChoice) return;
  applyWeapon(u.id, u.quality);
  upgradeChoice = null;
  AudioSys.score();
}

function skipUpgradeChoice() {
  if (!upgradeChoice) return false;
  upgradeChoice = null;
  AudioSys.click();
  return true;
}

function confirmUpgradeChoiceSelection() {
  if (!upgradeChoice) return false;
  if (upgradeChoiceSel >= 0 && upgradeChoiceSel < upgradeChoice.options.length) {
    applyUpgrade(upgradeChoice.options[upgradeChoiceSel]);
    return true;
  }
  return skipUpgradeChoice();
}

function updateTransport(dt) {
  const t = mission.transport;
  if (!t || t.dead) return;
  const wp = t.waypoints[t.wpIndex];
  const desired = angleTo(t.x, t.y, wp.x, wp.y);
  const diff = angDiff(t.heading, desired);
  t.heading += clamp(diff, -1.2 * dt, 1.2 * dt);
  t.speed = lerp(t.speed, 128, dt * 0.4);
  movePlane(t, dt);
  if (dist2(t.x, t.y, wp.x, wp.y) < 160 * 160) {
    t.wpIndex++;
    if (t.wpIndex >= t.waypoints.length) {
      mission.escortDone = true;
    }
  }
  if (t.hp < t.maxHp * 0.55) {
    t.smokeT -= dt;
    if (t.smokeT <= 0) {
      t.smokeT = 0.12;
      addParticle({
        x: t.x + rand(-30, 30), y: t.y + rand(-10, 10),
        vx: rand(-20, 20) - Math.cos(t.heading) * 60, vy: rand(-20, 20) - Math.sin(t.heading) * 60,
        life: rand(0.6, 1.2), maxLife: 1.2, size: rand(7, 13), type: 'smoke', color: 'rgba(60,62,66,0.8)'
      });
    }
  }
}
