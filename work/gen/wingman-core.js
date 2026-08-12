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
  bulletSize: 4
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
    target: null,
    dead: false,
    alive: true,
    catchingUp: false,
    hitFlash: 0,
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
    if (!enemy || enemy.dead || enemy.hp <= 0 || enemy.kind === 'transport') continue;
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
  const dx = target.x - w.x;
  const dy = target.y - w.y;
  if (dx * dx + dy * dy > WINGMAN_CONFIG.targetRange * WINGMAN_CONFIG.targetRange) {
    w.target = null;
    return null;
  }
  const angle = Math.atan2(dy, dx);
  const weapon = player && player.weapon ? player.weapon : null;
  const baseDamage = wingmanFinite(weapon && weapon.dmg, 20);
  const speed = wingmanFinite(weapon && weapon.speed, WINGMAN_CONFIG.bulletSpeed);
  const boost = wingmanFinite(w.rateBoostT, 0) > 0 ? WINGMAN_CONFIG.boostRate : 1;
  w.fireCd = WINGMAN_CONFIG.fireCd / boost;
  w.heading = angle;
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
  if (typeof GAME !== 'undefined' && GAME) GAME.shotsFired = wingmanFinite(GAME.shotsFired, 0) + 1;
  return bullet;
}

function updateWingman(w, dt) {
  if (!w || w.kind !== 'wingman' || w.dead || typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
  if (typeof player === 'undefined' || !player || player.dead || player.alive === false) return;

  w.fireCd = Math.max(0, wingmanFinite(w.fireCd, 0) - dt);
  w.rateBoostT = Math.max(0, wingmanFinite(w.rateBoostT, 0) - dt);
  w.hitFlash = Math.max(0, wingmanFinite(w.hitFlash, 0) - dt);

  const formation = wingmanFormationPoint(w.slot);
  w.formationSide = formation.side;
  w.formationX = formation.x;
  w.formationY = formation.y;
  const dx = formation.x - w.x;
  const dy = formation.y - w.y;
  const distance = Math.hypot(dx, dy);
  w.catchingUp = distance > WINGMAN_CONFIG.breakDistance;
  const desiredHeading = distance > 2 ? Math.atan2(dy, dx) : wingmanFinite(player.heading, w.heading);
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

  if (!w.target || w.target.dead || w.target.hp <= 0 || Math.hypot(w.target.x - w.x, w.target.y - w.y) > WINGMAN_CONFIG.targetRange) {
    acquireWingmanTarget(w);
  }
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WINGMAN_CONFIG,
    makeWingman,
    summonWingman,
    updateWingman,
    acquireWingmanTarget,
    fireWingmanGun,
    damageWingman,
    removeWingman
  };
}
