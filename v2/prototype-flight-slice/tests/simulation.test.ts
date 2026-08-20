import { describe, expect, it } from 'vitest';
import { ENEMY_TUNING, PLAYER_TUNING } from '../src/content/encounter';
import { FlightSliceSimulation } from '../src/core/simulation';
import type { ControlFrame, EnemyProjectileState } from '../src/core/types';

const idle: ControlFrame = { steer: 0, energy: 0, toggleAltitude: false, fireMissile: false, reset: false };

function runFrames(simulation: FlightSliceSimulation, frames: number, controls: ControlFrame = idle): string[] {
  const events: string[] = [];
  for (let index = 0; index < frames; index += 1) {
    simulation.step(1 / 60, controls);
    events.push(...simulation.state.events.map((event) => event.type));
  }
  return events;
}

function clearCurrentWave(simulation: FlightSliceSimulation): void {
  const ids = simulation.state.enemies.map((enemy) => enemy.id);
  for (const id of ids) {
    const enemy = simulation.state.enemies.find((candidate) => candidate.id === id);
    if (!enemy) throw new Error(`Missing enemy ${id}`);
    enemy.hp = 1;
    enemy.fireCooldown = 99;
    simulation.state.player.position.x = enemy.position.x;
    simulation.state.player.position.z = enemy.position.z - 7;
    simulation.state.player.position.y = enemy.kind === 'aa' || enemy.kind === 'radar' ? 8 : 34;
    simulation.state.player.altitudeMode = enemy.kind === 'aa' || enemy.kind === 'radar' ? 'LOW' : 'HIGH';
    simulation.state.player.heading = 0;
    simulation.state.player.gunCooldown = 0;
    simulation.step(1 / 60, idle);
  }
}

function finishTransition(simulation: FlightSliceSimulation): void {
  expect(simulation.state.phaseTransition).toBeGreaterThan(0);
  runFrames(simulation, 90);
}

function incomingProjectile(simulation: FlightSliceSimulation, id: number): EnemyProjectileState {
  const position = { ...simulation.state.player.position };
  return {
    id,
    volleyId: id,
    ownerId: 999,
    kind: 'flak',
    position,
    previousPosition: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    damage: 18,
    radius: 4.8,
    life: 1,
    nearMiss: false,
    heavy: true
  };
}

function isolateGroundTarget(simulation: FlightSliceSimulation, angleDegrees = 0, distance = 74) {
  const radar = simulation.state.enemies.find((enemy) => enemy.kind === 'radar');
  const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
  if (!radar || !aa) throw new Error('Missing infiltration targets');
  aa.alive = false;
  simulation.state.player.position = { x: 0, y: 8, z: 0 };
  simulation.state.player.altitudeMode = 'LOW';
  simulation.state.player.heading = 0;
  simulation.state.player.speed = 0;
  simulation.state.player.gunCooldown = 99;
  const angle = angleDegrees * Math.PI / 180;
  radar.position = { x: Math.sin(angle) * distance, y: 1.2, z: Math.cos(angle) * distance };
  radar.fireCooldown = 99;
  return radar;
}

function runHeldGeometry(simulation: FlightSliceSimulation, frames: number, controls: ControlFrame = idle): string[] {
  const events: string[] = [];
  for (let index = 0; index < frames; index += 1) {
    simulation.state.player.position = { x: 0, y: 8, z: 0 };
    simulation.state.player.heading = 0;
    simulation.state.player.speed = 0;
    simulation.step(1 / 60, controls);
    events.push(...simulation.state.events.map((event) => event.type));
  }
  return events;
}

describe('flight slice simulation', () => {
  it('trades turn authority for speed while extending with W', () => {
    const extend = new FlightSliceSimulation();
    const cruise = new FlightSliceSimulation();
    runFrames(extend, 90, { ...idle, steer: 1, energy: 1 });
    runFrames(cruise, 90, { ...idle, steer: 1 });

    expect(extend.state.player.maneuver).toBe('EXTEND');
    expect(extend.state.player.speed).toBeGreaterThan(cruise.state.player.speed + 8);
    expect(extend.state.player.heading).toBeLessThan(cruise.state.player.heading);
  });

  it('uses S to tighten the first break turn, then loses authority below corner speed', () => {
    const breakTurn = new FlightSliceSimulation();
    const cruiseTurn = new FlightSliceSimulation();
    runFrames(breakTurn, 22, { ...idle, steer: 1, energy: -1 });
    runFrames(cruiseTurn, 22, { ...idle, steer: 1 });

    expect(breakTurn.state.player.maneuver).toBe('BREAK');
    expect(breakTurn.state.player.speed).toBeLessThan(PLAYER_TUNING.cornerSpeed);
    expect(breakTurn.state.player.heading).toBeGreaterThan(cruiseTurn.state.player.heading);

    const headingBeforeLowSpeedTurn = breakTurn.state.player.heading;
    runFrames(breakTurn, 90, { ...idle, steer: 1, energy: -1 });
    expect(breakTurn.state.player.speed).toBe(PLAYER_TUNING.minSpeed);
    expect(breakTurn.state.player.heading - headingBeforeLowSpeedTurn).toBeLessThan(2.2);
  });

  it('returns toward auto-cruise when the energy command is released', () => {
    const simulation = new FlightSliceSimulation();
    runFrames(simulation, 80, { ...idle, energy: 1 });
    expect(simulation.state.player.speed).toBeGreaterThan(PLAYER_TUNING.cruiseSpeed + 10);
    runFrames(simulation, 120);

    expect(simulation.state.player.maneuver).toBe('CRUISE');
    expect(simulation.state.player.speed).toBeCloseTo(PLAYER_TUNING.cruiseSpeed, 0);
  });

  it('turns an altitude toggle into a real continuous climb with an energy cost', () => {
    const simulation = new FlightSliceSimulation();
    simulation.step(1 / 60, { ...idle, toggleAltitude: true });
    const startSpeed = simulation.state.player.speed;
    runFrames(simulation, 60);

    expect(simulation.state.player.altitudeMode).toBe('HIGH');
    expect(simulation.state.player.position.y).toBeGreaterThan(18);
    expect(simulation.state.player.speed).toBeLessThan(startSpeed);
  });

  it('keeps ground AA unable to damage a high-altitude player', () => {
    const simulation = new FlightSliceSimulation();
    simulation.state.player.position.y = 34;
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.state.player.position.x = 34;
    simulation.state.player.position.z = 45;
    const hp = simulation.state.player.hp;
    runFrames(simulation, 240);

    expect(simulation.state.player.hp).toBe(hp);
  });

  it('makes a radar-linked AA lock faster than an isolated battery', () => {
    const simulation = new FlightSliceSimulation();
    const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
    const radar = simulation.state.enemies.find((enemy) => enemy.kind === 'radar');
    if (!aa || !radar) throw new Error('Missing infiltration defenses');
    simulation.state.player.position = { x: aa.position.x, y: 8, z: aa.position.z - 34 };
    simulation.state.player.heading = Math.PI / 2;
    simulation.state.player.gunCooldown = 99;
    aa.fireCooldown = 0;
    simulation.step(1 / 60, idle);
    const linkedTelegraph = aa.telegraph;

    radar.alive = false;
    aa.telegraph = 0;
    aa.fireCooldown = 0;
    simulation.step(1 / 60, idle);

    expect(linkedTelegraph).toBeCloseTo(ENEMY_TUNING.radarLinkedAaTelegraph, 4);
    expect(aa.telegraph).toBeCloseTo(ENEMY_TUNING.isolatedAaTelegraph, 4);
    expect(aa.telegraph).toBeGreaterThan(linkedTelegraph);
  });

  it('distinguishes a low-altitude AA hit from a successful climb evade', () => {
    const heavyHit = new FlightSliceSimulation();
    const heavyAa = heavyHit.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!heavyAa) throw new Error('Missing AA');
    heavyHit.state.player.position = { x: heavyAa.position.x, y: 8, z: heavyAa.position.z - 38 };
    heavyHit.state.player.heading = Math.PI / 2;
    heavyHit.state.player.gunCooldown = 99;
    heavyAa.fireCooldown = 0;
    const heavyEvents = runFrames(heavyHit, 135);
    expect(heavyEvents).toContain('enemyShot');
    expect(heavyEvents).toContain('heavyDamage');

    const graze = new FlightSliceSimulation();
    const grazeAa = graze.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!grazeAa) throw new Error('Missing AA');
    graze.state.player.position = { x: grazeAa.position.x, y: 8, z: grazeAa.position.z - 38 };
    graze.state.player.heading = Math.PI / 2;
    graze.state.player.gunCooldown = 99;
    grazeAa.fireCooldown = 0;
    graze.step(1 / 60, idle);
    graze.step(1 / 60, { ...idle, toggleAltitude: true });
    const grazeEvents = runFrames(graze, 135);
    expect(grazeEvents).toContain('graze');
    expect(grazeEvents).not.toContain('heavyDamage');
    expect(graze.state.metrics.successfulEvasions).toBe(1);
  });

  it('requires a stable lock before a missile consumes ammunition', () => {
    const simulation = new FlightSliceSimulation();
    const radar = simulation.state.enemies.find((enemy) => enemy.kind === 'radar');
    const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!radar || !aa) throw new Error('Missing infiltration targets');
    aa.alive = false;
    simulation.state.player.position = { x: radar.position.x, y: 8, z: radar.position.z - 74 };
    simulation.state.player.heading = 0;
    simulation.state.player.gunCooldown = 99;
    const missiles = simulation.state.player.missilesRemaining;

    simulation.step(1 / 60, { ...idle, fireMissile: true });
    expect(simulation.state.player.missilesRemaining).toBe(missiles);
    runFrames(simulation, 58);
    expect(simulation.state.lockReady).toBe(true);

    simulation.step(1 / 60, { ...idle, fireMissile: true });
    expect(simulation.state.player.missilesRemaining).toBe(missiles - 1);
    expect(simulation.state.metrics.missilesFired).toBe(1);
    expect(simulation.state.metrics.missileHits).toBe(0);
    expect(simulation.state.playerMissiles).toHaveLength(1);
    expect(radar.hp).toBe(radar.maxHp);

    runFrames(simulation, 60);
    expect(simulation.state.metrics.missileHits).toBe(1);
    expect(radar.hp).toBe(0);
  });

  it('briefly retains a completed lock so a touch player can press fire', () => {
    const simulation = new FlightSliceSimulation();
    const radar = simulation.state.enemies.find((enemy) => enemy.kind === 'radar');
    const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!radar || !aa) throw new Error('Missing infiltration targets');
    aa.alive = false;
    simulation.state.player.position = { x: radar.position.x, y: 8, z: radar.position.z - 74 };
    simulation.state.player.heading = 0;
    simulation.state.player.gunCooldown = 99;
    runFrames(simulation, 58);
    expect(simulation.state.lockReady).toBe(true);

    simulation.state.player.heading = Math.PI;
    runFrames(simulation, 10);
    expect(simulation.state.lockReady).toBe(true);
    runFrames(simulation, 19);
    expect(simulation.state.lockReady).toBe(false);
  });

  it('keeps 360-degree radar contact on a target in the wrong altitude layer', () => {
    const simulation = new FlightSliceSimulation();
    const radar = isolateGroundTarget(simulation, 180, 48);
    simulation.state.player.position.y = 34;
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.step(1 / 60, idle);

    expect(simulation.state.sensorTargetId).toBe(radar.id);
    expect(simulation.state.targetLayerMatch).toBe(false);
    expect(simulation.state.lockTargetId).toBeNull();
  });

  it('separates soft acquisition from weapon lock and locks wide angles more slowly', () => {
    const soft = new FlightSliceSimulation();
    const softRadar = isolateGroundTarget(soft, 80, 64);
    soft.step(1 / 60, idle);
    expect(soft.state.sensorTargetId).toBe(softRadar.id);
    expect(soft.state.lockTargetId).toBe(softRadar.id);
    expect(soft.state.lockAngleDegrees).toBeGreaterThan(PLAYER_TUNING.lockConeDegrees);
    expect(soft.state.lockProgress).toBe(0);

    const close = new FlightSliceSimulation();
    isolateGroundTarget(close, 0, 64);
    runHeldGeometry(close, 34);
    expect(close.state.lockReady).toBe(true);

    const wide = new FlightSliceSimulation();
    isolateGroundTarget(wide, 68, 64);
    runHeldGeometry(wide, 34);
    expect(wide.state.lockReady).toBe(false);
    runHeldGeometry(wide, 40);
    expect(wide.state.lockReady).toBe(true);
  });

  it('sticks to a valid selected target instead of hopping to a marginally better contact', () => {
    const simulation = new FlightSliceSimulation();
    const radar = simulation.state.enemies.find((enemy) => enemy.kind === 'radar');
    const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!radar || !aa) throw new Error('Missing infiltration targets');
    simulation.state.player.position = { x: 0, y: 8, z: 0 };
    simulation.state.player.heading = 0;
    simulation.state.player.speed = 0;
    simulation.state.player.gunCooldown = 99;
    radar.position = { x: 5, y: 1.2, z: 60 };
    aa.position = { x: 12, y: 1.2, z: 60 };
    simulation.step(1 / 60, idle);
    const chosen = simulation.state.lockTargetId;
    expect(chosen).toBe(radar.id);

    aa.position = { x: 0.5, y: 1.2, z: 60 };
    runHeldGeometry(simulation, 12);
    expect(simulation.state.lockTargetId).toBe(chosen);
  });

  it('buffers a near-complete touch fire input until lock resolves', () => {
    const simulation = new FlightSliceSimulation();
    isolateGroundTarget(simulation, 0, 74);
    runHeldGeometry(simulation, 31);
    const missiles = simulation.state.player.missilesRemaining;
    runHeldGeometry(simulation, 1, { ...idle, fireMissile: true });
    expect(simulation.state.player.missilesRemaining).toBe(missiles);
    expect(simulation.state.fireBuffer).toBeGreaterThan(0);
    runHeldGeometry(simulation, 3);
    expect(simulation.state.player.missilesRemaining).toBe(missiles - 1);
  });

  it('earns a perfect missile only after holding the tighter solution', () => {
    const simulation = new FlightSliceSimulation();
    const radar = isolateGroundTarget(simulation, 0, 74);
    runHeldGeometry(simulation, 62);
    expect(simulation.state.lockPerfect).toBe(true);
    runHeldGeometry(simulation, 1, { ...idle, fireMissile: true });

    expect(simulation.state.playerMissiles[0]?.quality).toBe('PERFECT');
    expect(simulation.state.playerMissiles[0]?.damage).toBe(PLAYER_TUNING.missilePerfectDamage);
    expect(simulation.state.metrics.perfectShots).toBe(1);
    expect(radar.hp).toBe(radar.maxHp);
  });

  it('guides a normal lock missile into a moving high-altitude interceptor', () => {
    const simulation = new FlightSliceSimulation();
    clearCurrentWave(simulation);
    finishTransition(simulation);
    const target = simulation.state.enemies.find((enemy) => enemy.kind === 'interceptor');
    const wing = simulation.state.enemies.find((enemy) => enemy.kind === 'interceptor' && enemy.id !== target?.id);
    if (!target || !wing) throw new Error('Missing interceptor pair');
    wing.alive = false;
    target.position = { x: 0, y: 34, z: 82 };
    target.heading = Math.PI / 2;
    target.fireCooldown = 99;
    simulation.state.player.position = { x: 0, y: 34, z: 0 };
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.state.player.heading = 0;
    simulation.state.player.speed = 0;
    simulation.state.player.gunCooldown = 99;

    for (let index = 0; index < 50 && !simulation.state.lockReady; index += 1) {
      simulation.state.player.position = { x: 0, y: 34, z: 0 };
      simulation.state.player.heading = 0;
      simulation.state.player.speed = 0;
      simulation.step(1 / 60, idle);
    }
    expect(simulation.state.lockReady).toBe(true);
    simulation.step(1 / 60, { ...idle, fireMissile: true });
    expect(simulation.state.metrics.missileHits).toBe(0);
    runFrames(simulation, 120);
    expect(simulation.state.metrics.missileHits).toBe(1);
    expect(target.hp).toBe(target.maxHp - PLAYER_TUNING.missileDamage);
  });

  it('turns sustained gun alignment into five-shot bursts and a rake payoff', () => {
    const simulation = new FlightSliceSimulation();
    const radar = isolateGroundTarget(simulation, 0, 24);
    simulation.state.player.gunCooldown = 0;
    const events = runHeldGeometry(simulation, 24);

    expect(events.filter((event) => event === 'gun').length).toBeGreaterThanOrEqual(5);
    expect(events).toContain('gunRake');
    expect(simulation.state.metrics.gunRakes).toBe(1);
    expect(radar.hp).toBeLessThan(radar.maxHp - PLAYER_TUNING.gunBurstSize * PLAYER_TUNING.gunDamage);
  });

  it('turns a forced overshoot into a short faster firing solution', () => {
    const simulation = new FlightSliceSimulation();
    clearCurrentWave(simulation);
    finishTransition(simulation);
    const attacker = simulation.state.enemies.find((enemy) => enemy.kind === 'interceptor');
    const wing = simulation.state.enemies.find((enemy) => enemy.kind === 'interceptor' && enemy.id !== attacker?.id);
    if (!attacker || !wing) throw new Error('Missing interceptor pair');
    wing.alive = false;
    simulation.state.player.position = { x: 0, y: 34, z: 0 };
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.state.player.heading = 0;
    attacker.position = { x: 0, y: 34, z: -20 };
    attacker.heading = 0;
    attacker.attackHeading = 0;
    attacker.attackCommitment = 0.5;
    attacker.closestApproach = 20;
    attacker.breakResponse = 0;
    attacker.intent = 'ATTACKING';
    attacker.fireCooldown = 2;
    const events = runFrames(simulation, 32, { ...idle, steer: 1, energy: -1 });

    expect(events).toContain('overshoot');
    expect(simulation.state.metrics.overshoots).toBe(1);
    expect(simulation.state.player.advantageTime).toBeGreaterThan(2);

    const normalLock = new FlightSliceSimulation();
    isolateGroundTarget(normalLock, 0, 64);
    runHeldGeometry(normalLock, 24);
    expect(normalLock.state.lockReady).toBe(false);

    const advantageLock = new FlightSliceSimulation();
    isolateGroundTarget(advantageLock, 0, 64);
    advantageLock.state.player.advantageTime = PLAYER_TUNING.advantageSeconds;
    runHeldGeometry(advantageLock, 24);
    expect(advantageLock.state.lockReady).toBe(true);

    const normalGun = new FlightSliceSimulation();
    isolateGroundTarget(normalGun, 0, 24);
    normalGun.state.player.gunCooldown = 0;
    const normalGunEvents = runHeldGeometry(normalGun, 16);
    expect(normalGunEvents).not.toContain('gunRake');

    const advantageGun = new FlightSliceSimulation();
    isolateGroundTarget(advantageGun, 0, 24);
    advantageGun.state.player.gunCooldown = 0;
    advantageGun.state.player.advantageTime = PLAYER_TUNING.advantageSeconds;
    const advantageGunEvents = runHeldGeometry(advantageGun, 16);
    expect(advantageGunEvents).toContain('gunRake');
  });

  it('preserves the chosen infiltration route as a real score tradeoff', () => {
    const safe = new FlightSliceSimulation();
    const safeRadar = safe.state.enemies.find((enemy) => enemy.kind === 'radar');
    if (!safeRadar) throw new Error('Missing radar');
    safeRadar.hp = 1;
    safe.state.player.position = { x: safeRadar.position.x, y: 8, z: safeRadar.position.z - 7 };
    safe.state.player.heading = 0;
    safe.state.player.gunCooldown = 0;
    safe.step(1 / 60, idle);
    expect(safe.state.metrics.infiltrationRoute).toBe('RADAR_FIRST');
    expect(safe.state.message).toContain('链路切断');

    const risky = new FlightSliceSimulation();
    const riskyAa = risky.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!riskyAa) throw new Error('Missing AA');
    riskyAa.hp = 1;
    risky.state.player.position = { x: riskyAa.position.x, y: 8, z: riskyAa.position.z - 7 };
    risky.state.player.heading = 0;
    risky.state.player.gunCooldown = 0;
    risky.step(1 / 60, idle);
    expect(risky.state.metrics.infiltrationRoute).toBe('AA_FIRST');
    expect(risky.state.score - safe.state.score).toBe(510);
  });

  it('spends one recovery before a second lethal hit ends the sortie', () => {
    const simulation = new FlightSliceSimulation();
    simulation.state.player.hp = 10;
    simulation.state.projectiles.push(incomingProjectile(simulation, 1));
    simulation.step(1 / 60, idle);

    expect(simulation.state.outcome).toBe('ACTIVE');
    expect(simulation.state.recoveryTokens).toBe(0);
    expect(simulation.state.metrics.recoveries).toBe(1);
    expect(simulation.state.player.hp).toBe(100);

    simulation.state.player.hp = 10;
    simulation.state.player.invulnerability = 0;
    simulation.state.projectiles.push(incomingProjectile(simulation, 2));
    simulation.step(1 / 60, idle);
    expect(simulation.state.outcome).toBe('DEFEAT');
    expect(simulation.state.ended).toBe(true);
  });

  it('resets the encounter deterministically', () => {
    const simulation = new FlightSliceSimulation();
    runFrames(simulation, 90, { ...idle, steer: 1 });
    simulation.step(1 / 60, { ...idle, reset: true });

    expect(simulation.state.elapsed).toBe(0);
    expect(simulation.state.player.position).toEqual({ x: -26, y: 8, z: -54 });
    expect(simulation.state.player.maneuver).toBe('CRUISE');
    expect(simulation.state.player.advantageTime).toBe(0);
    expect(simulation.state.enemies).toHaveLength(2);
    expect(simulation.state.phase).toBe('INFILTRATION');
  });

  it('uses a readable sector-clear beat before spawning the next wave', () => {
    const simulation = new FlightSliceSimulation();
    clearCurrentWave(simulation);

    expect(simulation.state.phase).toBe('INFILTRATION');
    expect(simulation.state.phaseTransition).toBeGreaterThan(1);
    finishTransition(simulation);
    expect(simulation.state.phase).toBe('INTERCEPT');
    expect(simulation.state.enemies.every((enemy) => enemy.kind === 'interceptor')).toBe(true);
  });

  it('gives the ace a faster second phase at half health', () => {
    const simulation = new FlightSliceSimulation();
    clearCurrentWave(simulation);
    finishTransition(simulation);
    clearCurrentWave(simulation);
    finishTransition(simulation);
    const ace = simulation.state.enemies.find((enemy) => enemy.kind === 'ace');
    const aa = simulation.state.enemies.find((enemy) => enemy.kind === 'aa');
    if (!ace || !aa) throw new Error('Missing combined-arms wave');
    aa.alive = false;
    ace.hp = ace.maxHp / 2 + 4;
    ace.fireCooldown = 99;
    simulation.state.player.position = { x: ace.position.x, y: 34, z: ace.position.z - 7 };
    simulation.state.player.altitudeMode = 'HIGH';
    simulation.state.player.heading = 0;
    simulation.state.player.gunCooldown = 0;
    simulation.step(1 / 60, idle);

    expect(ace.acePhase).toBe(2);
    expect(simulation.state.events.some((event) => event.type === 'phase' && event.text === 'ACE PHASE TWO')).toBe(true);
  });

  it('runs one authored mission through all three altitude-focused phases', () => {
    const simulation = new FlightSliceSimulation();

    clearCurrentWave(simulation);
    finishTransition(simulation);
    expect(simulation.state.phase).toBe('INTERCEPT');

    clearCurrentWave(simulation);
    finishTransition(simulation);
    expect(simulation.state.phase).toBe('COMBINED');
    expect(simulation.state.enemies.map((enemy) => enemy.kind)).toEqual(['aa', 'ace']);

    clearCurrentWave(simulation);
    finishTransition(simulation);
    expect(simulation.state.outcome).toBe('SUCCESS');
    expect(simulation.state.grade).not.toBe('—');
    expect(simulation.state.ended).toBe(true);
    expect(simulation.state.kills).toBe(6);
  });

  it('ends in a timeout when the player does not clear the authored waves', () => {
    const simulation = new FlightSliceSimulation();
    for (let index = 0; index < 4300; index += 1) simulation.step(0.05, { ...idle, steer: 0.35 });

    expect(simulation.state.outcome).toBe('TIMEOUT');
    expect(simulation.state.phase).toBe('FAILED');
    expect(simulation.state.ended).toBe(true);
  });
});
