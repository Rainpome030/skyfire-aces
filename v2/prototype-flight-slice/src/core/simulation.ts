import {
  AIR_COMBAT_MAX_ALTITUDE,
  AIR_COMBAT_MIN_ALTITUDE,
  ARENA_RADIUS,
  ENCOUNTER_DURATION,
  ENEMY_TUNING,
  HIGH_ALTITUDE,
  LOW_ALTITUDE,
  PHASES,
  PLAYER_TUNING
} from '../content/encounter';
import {
  advanceManeuverTracker,
  createManeuverTrackerState,
  type ManeuverTargetContext,
  type ManeuverTrackerState
} from './maneuvers';
import type {
  CombatEvent,
  ControlFrame,
  EnemyKind,
  EnemyProjectileState,
  EnemyRole,
  EnemyState,
  MissileQuality,
  MissionGrade,
  MissionOutcome,
  PlayerMissileState,
  SliceState,
  TacticalManeuver,
  Vec3State
} from './types';

const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function copyVec(value: Vec3State): Vec3State {
  return { x: value.x, y: value.y, z: value.z };
}

function distanceXZ(a: Vec3State, b: Vec3State): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function tacticalDistance(a: Vec3State, b: Vec3State): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) * 0.72, a.z - b.z);
}

function length3(value: Vec3State): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize3(value: Vec3State): Vec3State {
  const length = Math.max(0.0001, length3(value));
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function rotateToward(current: Vec3State, desired: Vec3State, maxAngle: number): Vec3State {
  const from = normalize3(current);
  const to = normalize3(desired);
  const dot = clamp(from.x * to.x + from.y * to.y + from.z * to.z, -1, 1);
  const angle = Math.acos(dot);
  if (angle <= maxAngle || angle < 0.0001) return to;
  const ratio = maxAngle / angle;
  return normalize3({
    x: lerp(from.x, to.x, ratio),
    y: lerp(from.y, to.y, ratio),
    z: lerp(from.z, to.z, ratio)
  });
}

function angleDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

function angleTo(from: Vec3State, to: Vec3State): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function forwardDot(heading: number, from: Vec3State, to: Vec3State): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  return (Math.sin(heading) * dx + Math.cos(heading) * dz) / length;
}

function enemyMaxHp(kind: EnemyKind): number {
  if (kind === 'radar') return 64;
  if (kind === 'aa') return 82;
  if (kind === 'ace') return 176;
  return 92;
}

function enemyScore(kind: EnemyKind): number {
  if (kind === 'radar') return 700;
  if (kind === 'aa') return 950;
  if (kind === 'ace') return 2200;
  return 1150;
}

function emptyManeuverCounts(): Record<TacticalManeuver, number> {
  return {
    NONE: 0,
    BOOM_ZOOM: 0,
    HIGH_YOYO: 0,
    LOW_YOYO: 0,
    DEFENSIVE_ROLL: 0,
    REVERSAL: 0,
    SCISSORS: 0,
    LEAD_TURN: 0
  };
}

export class FlightSliceSimulation {
  readonly state: SliceState;
  private eventId = 0;
  private enemyId = 0;
  private projectileId = 0;
  private volleyId = 0;
  private phaseStartedAt = 0;
  private targetLostTime = 0;
  private gunSide: -1 | 1 = -1;
  private missileSide: -1 | 1 = -1;
  private readonly grazedVolleys = new Set<number>();
  private maneuverTracker: ManeuverTrackerState = createManeuverTrackerState('LOW');
  private damagedKindThisFrame: EnemyKind | null = null;
  private overshootEnemyThisFrame: number | null = null;
  private lastTacticAt = -Infinity;

  constructor() {
    this.state = this.createState();
  }

  reset(): void {
    this.eventId = 0;
    this.enemyId = 0;
    this.projectileId = 0;
    this.volleyId = 0;
    this.phaseStartedAt = 0;
    this.targetLostTime = 0;
    this.gunSide = -1;
    this.missileSide = -1;
    this.grazedVolleys.clear();
    this.maneuverTracker = createManeuverTrackerState('LOW');
    this.damagedKindThisFrame = null;
    this.overshootEnemyThisFrame = null;
    this.lastTacticAt = -Infinity;
    Object.assign(this.state, this.createState());
  }

  step(dt: number, controls: ControlFrame): void {
    if (controls.reset) {
      this.reset();
      return;
    }

    this.state.events = [];
    if (this.state.ended) return;
    this.damagedKindThisFrame = null;
    this.overshootEnemyThisFrame = null;

    const safeDt = clamp(dt, 0, 0.05);
    this.state.elapsed += safeDt;
    this.state.timeRemaining = Math.max(0, ENCOUNTER_DURATION - this.state.elapsed);
    this.state.activeTacticTime = Math.max(0, this.state.activeTacticTime - safeDt);
    if (this.state.activeTacticTime <= 0) this.state.activeTactic = 'NONE';
    if (this.state.timeRemaining <= 0) {
      this.finishMission('TIMEOUT', '演习超时 · 威胁未全部解除');
      return;
    }

    this.updatePlayer(safeDt, controls);
    this.updateEnemies(safeDt);
    this.updateProjectiles(safeDt);
    this.updatePlayerMissiles(safeDt);
    this.updateTargetingAndWeapons(safeDt, controls);
    this.updateTacticalManeuvers(controls);
    this.updatePhaseTransition(safeDt);
    this.updateThreatLabel();
  }

  private createState(): SliceState {
    const firstPhase = PHASES[0];
    if (!firstPhase) throw new Error('Encounter requires at least one phase');
    return {
      elapsed: 0,
      timeRemaining: ENCOUNTER_DURATION,
      score: 0,
      kills: 0,
      ended: false,
      outcome: 'ACTIVE',
      grade: '—',
      phase: firstPhase.id,
      phaseIndex: 0,
      phaseLabel: firstPhase.label,
      objective: firstPhase.objective,
      phaseTransition: 0,
      gunTargetId: null,
      sensorTargetId: null,
      lockTargetId: null,
      lockProgress: 0,
      lockReady: false,
      perfectProgress: 0,
      lockPerfect: false,
      lockAngleDegrees: 180,
      targetLayerMatch: false,
      activeTactic: 'NONE',
      activeTacticTime: 0,
      lastTactic: 'NONE',
      tacticChain: 0,
      fireBuffer: 0,
      recoveryTokens: PLAYER_TUNING.recoveryTokens,
      threat: '雷达链路在线 · 防空炮快速解算',
      message: firstPhase.arrival,
      player: {
        position: { x: -26, y: LOW_ALTITUDE, z: -54 },
        heading: 0.15,
        speed: PLAYER_TUNING.cruiseSpeed,
        verticalSpeed: 0,
        bank: 0,
        maneuver: 'CRUISE',
        advantageTime: 0,
        altitudeMode: 'LOW',
        hp: 100,
        maxHp: 100,
        gunCooldown: 0,
        gunBurstRemaining: 0,
        gunTrackProgress: 0,
        gunRakeCooldown: 0,
        missileCooldown: 0,
        missilesRemaining: PLAYER_TUNING.missileCapacity,
        invulnerability: 0,
        alive: true
      },
      enemies: this.createWave(0),
      projectiles: [],
      playerMissiles: [],
      metrics: {
        altitudeSwitches: 0,
        missilesFired: 0,
        missileHits: 0,
        missileMisses: 0,
        perfectShots: 0,
        gunRakes: 0,
        damageTaken: 0,
        recoveries: 0,
        successfulEvasions: 0,
        overshoots: 0,
        maneuverCounts: emptyManeuverCounts(),
        phaseTimes: [],
        infiltrationRoute: 'UNSET'
      },
      events: []
    };
  }

  private createWave(index: number): EnemyState[] {
    const phase = PHASES[index];
    if (!phase) return [];
    return phase.enemies.map((placement) => this.createEnemy(
      placement.kind,
      placement.role ?? (placement.kind === 'ace' ? 'ace' : placement.kind === 'interceptor' ? 'lead' : 'stationary'),
      placement.position,
      index,
      placement.heading
    ));
  }

  private createEnemy(kind: EnemyKind, role: EnemyRole, position: Vec3State, wave: number, heading = 0): EnemyState {
    const hp = enemyMaxHp(kind);
    return {
      id: ++this.enemyId,
      kind,
      role,
      intent: 'PATROL',
      wave,
      position: copyVec(position),
      heading,
      verticalSpeed: 0,
      targetAltitude: position.y,
      bank: 0,
      hp,
      maxHp: hp,
      alive: true,
      fireCooldown: kind === 'aa' ? 1.4 : kind === 'ace' ? 1.15 : 1.7,
      telegraph: 0,
      hitFlash: 0,
      stagger: 0,
      acePhase: 1,
      attackTarget: null,
      attackHeading: heading,
      attackCommitment: 0,
      closestApproach: Number.POSITIVE_INFINITY,
      breakResponse: 0,
      overshootResolved: false
    };
  }

  private updatePlayer(dt: number, controls: ControlFrame): void {
    const player = this.state.player;
    player.invulnerability = Math.max(0, player.invulnerability - dt);
    player.advantageTime = Math.max(0, player.advantageTime - dt);
    const previousManeuver = player.maneuver;
    const energy = clamp(controls.energy, -1, 1);
    player.maneuver = energy > 0.16 ? 'EXTEND' : energy < -0.16 ? 'BREAK' : 'CRUISE';
    if (player.maneuver !== previousManeuver) {
      if (player.maneuver === 'EXTEND') this.state.message = '加力延伸 · 获得速度，转弯半径扩大';
      else if (player.maneuver === 'BREAK') this.state.message = '减速急转 · 抢角度，注意不要耗尽速度';
    }
    if (controls.toggleAltitude) {
      player.altitudeMode = player.altitudeMode === 'LOW' ? 'HIGH' : 'LOW';
      this.state.metrics.altitudeSwitches += 1;
      this.emit({
        type: 'altitude',
        from: copyVec(player.position),
        text: player.altitudeMode === 'HIGH' ? '拉升 · 脱离地面射界' : '俯冲 · 重返攻击窗口'
      });
      this.state.message = player.altitudeMode === 'HIGH' ? '拉升：速度换高度，防空解算失效' : '俯冲：获得速度，重新攻击地面目标';
    }

    const targetAltitude = player.altitudeMode === 'HIGH' ? HIGH_ALTITUDE : LOW_ALTITUDE;
    const altitudeDelta = targetAltitude - player.position.y;
    const altitudeDirection = Math.sign(altitudeDelta);
    const altitudeRate = altitudeDirection > 0 ? PLAYER_TUNING.altitudeRiseRate : PLAYER_TUNING.altitudeFallRate;
    const altitudeAcceleration = altitudeDirection > 0
      ? PLAYER_TUNING.altitudeRiseAcceleration
      : PLAYER_TUNING.altitudeFallAcceleration;
    const brakingRate = Math.sqrt(Math.max(0, 2 * PLAYER_TUNING.altitudeBrakeAcceleration * Math.abs(altitudeDelta)));
    const desiredVerticalSpeed = altitudeDirection * Math.min(altitudeRate, brakingRate);
    const reversing = altitudeDirection !== 0 && player.verticalSpeed * altitudeDirection < 0;
    player.verticalSpeed = moveToward(
      player.verticalSpeed,
      desiredVerticalSpeed,
      (reversing ? PLAYER_TUNING.altitudeBrakeAcceleration * 1.45 : altitudeAcceleration) * dt
    );
    const nextAltitude = player.position.y + player.verticalSpeed * dt;
    const reachedTarget = altitudeDirection === 0
      || (altitudeDirection > 0 && nextAltitude >= targetAltitude)
      || (altitudeDirection < 0 && nextAltitude <= targetAltitude);
    if (reachedTarget) {
      player.position.y = targetAltitude;
      player.verticalSpeed = 0;
    } else {
      player.position.y = nextAltitude;
    }

    const climbing = player.verticalSpeed > 0.5;
    const diving = player.verticalSpeed < -0.5;
    const altitudeSpeed = climbing
      ? PLAYER_TUNING.climbSpeed
      : diving
        ? PLAYER_TUNING.diveSpeed
        : PLAYER_TUNING.cruiseSpeed;

    const steer = clamp(controls.steer, -1, 1);
    const radius = Math.hypot(player.position.x, player.position.z);
    let steering = steer;
    const assistedTarget = this.state.lockTargetId === null
      ? null
      : this.state.enemies.find((enemy) => enemy.id === this.state.lockTargetId && enemy.alive) ?? null;
    if (assistedTarget && this.isLayerMatch(assistedTarget)) {
      const targetDelta = angleDelta(player.heading, angleTo(player.position, assistedTarget.position));
      const insideFriction = Math.abs(targetDelta) <= 15 * Math.PI / 180;
      const steeringTowardTarget = Math.sign(steering) === Math.sign(targetDelta);
      if (insideFriction && steeringTowardTarget && Math.abs(steering) < 0.92) steering *= 0.7;
    }
    if (radius > ARENA_RADIUS * 0.82) {
      const homeHeading = angleTo(player.position, { x: 0, y: player.position.y, z: 0 });
      steering += clamp(angleDelta(player.heading, homeHeading) * 0.75, -0.8, 0.8);
    }
    steering = clamp(steering, -1, 1);

    const commandedSpeed = player.maneuver === 'EXTEND'
      ? PLAYER_TUNING.boostSpeed + (diving ? 4 : climbing ? -8 : 0)
      : player.maneuver === 'BREAK'
        ? PLAYER_TUNING.minSpeed
        : altitudeSpeed;
    const acceleration = player.maneuver === 'EXTEND'
      ? PLAYER_TUNING.boostAcceleration
      : player.maneuver === 'BREAK'
        ? PLAYER_TUNING.brakeDeceleration
        : PLAYER_TUNING.neutralAcceleration;
    player.speed = moveToward(player.speed, commandedSpeed, acceleration * dt);
    const turnLoad = Math.max(0, Math.abs(steering) - 0.12) / 0.88;
    player.speed -= PLAYER_TUNING.turnDrag * turnLoad * (player.maneuver === 'BREAK' ? 1.15 : 1) * dt;
    player.speed = clamp(player.speed, PLAYER_TUNING.minSpeed, PLAYER_TUNING.boostSpeed + 4);

    const turnMultiplier = this.playerTurnMultiplier(player.speed)
      * (player.maneuver === 'BREAK' ? PLAYER_TUNING.breakTurnMultiplier : 1);
    player.heading = (player.heading + steering * PLAYER_TUNING.turnRate * turnMultiplier * dt + TAU) % TAU;
    const defensiveRollLoad = player.maneuver === 'BREAK' && Math.abs(altitudeDelta) > 1 && Math.abs(steering) > 0.4;
    const bankLimit = defensiveRollLoad ? 1.12 : player.maneuver === 'BREAK' ? 0.86 : player.maneuver === 'EXTEND' ? 0.58 : 0.68;
    player.bank = lerp(player.bank, -steering * bankLimit, dt * (player.maneuver === 'BREAK' ? 7.2 : 5.7));
    player.position.x += Math.sin(player.heading) * player.speed * dt;
    player.position.z += Math.cos(player.heading) * player.speed * dt;
    player.gunCooldown = Math.max(0, player.gunCooldown - dt);
    player.gunRakeCooldown = Math.max(0, player.gunRakeCooldown - dt);
    player.missileCooldown = Math.max(0, player.missileCooldown - dt);
  }

  private playerTurnMultiplier(speed: number): number {
    if (speed >= PLAYER_TUNING.cruiseSpeed) {
      const highSpeed = (speed - PLAYER_TUNING.cruiseSpeed) / (PLAYER_TUNING.boostSpeed - PLAYER_TUNING.cruiseSpeed);
      return lerp(1, PLAYER_TUNING.highSpeedTurnMultiplier, highSpeed);
    }
    if (speed >= PLAYER_TUNING.cornerSpeed) {
      const aboveCorner = (speed - PLAYER_TUNING.cornerSpeed) / (PLAYER_TUNING.cruiseSpeed - PLAYER_TUNING.cornerSpeed);
      return lerp(PLAYER_TUNING.cornerTurnMultiplier, 1, aboveCorner);
    }
    const belowCorner = (speed - PLAYER_TUNING.minSpeed) / (PLAYER_TUNING.cornerSpeed - PLAYER_TUNING.minSpeed);
    return lerp(PLAYER_TUNING.lowSpeedTurnMultiplier, PLAYER_TUNING.cornerTurnMultiplier, belowCorner);
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.state.enemies) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.stagger = Math.max(0, enemy.stagger - dt);
      if (!enemy.alive) continue;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      if (enemy.intent === 'RECOVERING' && enemy.fireCooldown <= 0.25) enemy.intent = 'PATROL';
      if (enemy.kind === 'interceptor' || enemy.kind === 'ace') this.updateAircraft(enemy, dt);
      else if (enemy.kind === 'aa') this.updateAirDefense(enemy, dt);
    }
  }

  private updateAircraft(enemy: EnemyState, dt: number): void {
    const player = this.state.player;
    const isAce = enemy.kind === 'ace';

    if (enemy.telegraph > 0) {
      enemy.telegraph -= dt;
      enemy.intent = 'TRACKING';
      enemy.attackTarget = this.predictPlayer(isAce ? 0.46 : 0.54);
      enemy.targetAltitude = clamp(enemy.attackTarget.y, AIR_COMBAT_MIN_ALTITUDE, AIR_COMBAT_MAX_ALTITUDE);
      if (enemy.telegraph <= 0) {
        this.launchAirBurst(enemy);
        enemy.attackHeading = angleTo(enemy.position, enemy.attackTarget ?? player.position);
        enemy.attackCommitment = isAce ? ENEMY_TUNING.aceAttackCommitmentSeconds : ENEMY_TUNING.attackCommitmentSeconds;
        enemy.closestApproach = tacticalDistance(enemy.position, player.position);
        enemy.breakResponse = 0;
        enemy.overshootResolved = false;
        enemy.intent = 'ATTACKING';
        enemy.fireCooldown = isAce ? (enemy.acePhase === 2 ? 0.82 : 1.12) : 1.42;
      }
    }

    if (enemy.attackCommitment > 0) {
      enemy.attackCommitment = Math.max(0, enemy.attackCommitment - dt);
      const committedDelta = angleDelta(enemy.heading, enemy.attackHeading);
      const committedTurn = clamp(
        committedDelta,
        -ENEMY_TUNING.committedTurnRate * dt,
        ENEMY_TUNING.committedTurnRate * dt
      );
      enemy.heading = (enemy.heading + committedTurn + TAU) % TAU;
      enemy.bank = lerp(enemy.bank, -Math.sign(committedDelta) * 0.34, dt * 3.2);
      const committedSpeed = (isAce ? (enemy.acePhase === 2 ? 57 : 52) : 49) * (enemy.stagger > 0 ? 0.78 : 1);
      enemy.position.x += Math.sin(enemy.heading) * committedSpeed * dt;
      enemy.position.z += Math.cos(enemy.heading) * committedSpeed * dt;
      const verticalRate = isAce ? ENEMY_TUNING.aceVerticalRate : ENEMY_TUNING.interceptorVerticalRate;
      const desiredVerticalSpeed = clamp((enemy.targetAltitude - enemy.position.y) * 1.9, -verticalRate, verticalRate);
      enemy.verticalSpeed = moveToward(enemy.verticalSpeed, desiredVerticalSpeed, 28 * dt);
      enemy.position.y = clamp(enemy.position.y + enemy.verticalSpeed * dt, AIR_COMBAT_MIN_ALTITUDE, AIR_COMBAT_MAX_ALTITUDE);
      enemy.closestApproach = Math.min(enemy.closestApproach, tacticalDistance(enemy.position, player.position));
      if (player.maneuver === 'BREAK' && Math.abs(player.bank) > 0.18) enemy.breakResponse += dt;

      if (enemy.attackCommitment <= 0) {
        if (
          enemy.closestApproach <= ENEMY_TUNING.overshootRange
          && enemy.breakResponse >= ENEMY_TUNING.overshootBreakSeconds
        ) this.resolveOvershoot(enemy);
        enemy.attackTarget = null;
        enemy.intent = 'RECOVERING';
      }
      return;
    }

    const playerForwardX = Math.sin(player.heading);
    const playerForwardZ = Math.cos(player.heading);
    const rightX = playerForwardZ;
    const rightZ = -playerForwardX;
    const lateral = enemy.role === 'wing' ? 28 : enemy.role === 'lead' ? -10 : 0;
    const followDistance = enemy.role === 'wing' ? -8 : 0;
    const patrolAltitude = isAce
      ? clamp(player.position.y + Math.sin(this.state.elapsed * 0.66 + enemy.id) * (enemy.acePhase === 2 ? 12 : 9), AIR_COMBAT_MIN_ALTITUDE, AIR_COMBAT_MAX_ALTITUDE)
      : enemy.role === 'wing'
        ? 20 + Math.sin(this.state.elapsed * 0.82 + enemy.id) * 5
        : 30 + Math.sin(this.state.elapsed * 0.58 + enemy.id) * 5;
    enemy.targetAltitude = patrolAltitude;
    const desiredPosition = {
      x: player.position.x + rightX * lateral + playerForwardX * followDistance,
      y: patrolAltitude,
      z: player.position.z + rightZ * lateral + playerForwardZ * followDistance
    };
    if (Math.hypot(enemy.position.x, enemy.position.z) > ARENA_RADIUS * 0.94) {
      desiredPosition.x = 0;
      desiredPosition.z = 0;
    }

    const desiredHeading = angleTo(enemy.position, desiredPosition);
    const turnDelta = angleDelta(enemy.heading, desiredHeading);
    const agility = isAce ? (enemy.acePhase === 2 ? 1.62 : 1.3) : enemy.role === 'wing' ? 1.08 : 0.94;
    const turn = clamp(turnDelta, -1, 1) * dt * agility;
    enemy.heading = (enemy.heading + turn + TAU) % TAU;
    enemy.bank = lerp(enemy.bank, -clamp(turnDelta, -0.8, 0.8) * 0.52, dt * 4.8);
    const baseSpeed = isAce ? (enemy.acePhase === 2 ? 45 : 39) : enemy.role === 'wing' ? 35 : 33;
    const speed = baseSpeed * (enemy.stagger > 0 ? 0.78 : 1);
    enemy.position.x += Math.sin(enemy.heading) * speed * dt;
    enemy.position.z += Math.cos(enemy.heading) * speed * dt;
    const verticalRate = isAce ? ENEMY_TUNING.aceVerticalRate : ENEMY_TUNING.interceptorVerticalRate;
    const desiredVerticalSpeed = clamp((enemy.targetAltitude - enemy.position.y) * 1.25, -verticalRate, verticalRate);
    enemy.verticalSpeed = moveToward(enemy.verticalSpeed, desiredVerticalSpeed, 20 * dt);
    enemy.position.y = clamp(enemy.position.y + enemy.verticalSpeed * dt, AIR_COMBAT_MIN_ALTITUDE, AIR_COMBAT_MAX_ALTITUDE);

    if (enemy.telegraph > 0) return;
    const separation = tacticalDistance(enemy.position, player.position);
    const verticalSeparation = Math.abs(enemy.position.y - player.position.y);
    const firingRange = isAce ? 82 : 70;
    const alignment = forwardDot(enemy.heading, enemy.position, player.position);
    const cone = Math.cos((isAce ? 27 : 22) * Math.PI / 180);
    if (
      verticalSeparation <= ENEMY_TUNING.airWeaponAltitudeTolerance + (isAce ? 3 : 0)
      && separation > 20
      && separation < firingRange
      && alignment > cone
      && enemy.fireCooldown <= 0
    ) {
      enemy.telegraph = isAce
        ? enemy.acePhase === 2 ? ENEMY_TUNING.aceTelegraphPhaseTwo : ENEMY_TUNING.aceTelegraphPhaseOne
        : ENEMY_TUNING.interceptorTelegraph;
      enemy.intent = 'TRACKING';
      enemy.closestApproach = Number.POSITIVE_INFINITY;
      enemy.breakResponse = 0;
      enemy.overshootResolved = false;
      enemy.attackTarget = this.predictPlayer(isAce ? 0.46 : 0.54);
      enemy.targetAltitude = clamp(enemy.attackTarget.y, AIR_COMBAT_MIN_ALTITUDE, AIR_COMBAT_MAX_ALTITUDE);
      this.emit({
        type: 'warning',
        from: copyVec(enemy.position),
        to: copyVec(enemy.attackTarget),
        color: isAce ? 0xffbc66 : 0xff6679,
        text: isAce ? '王牌建立射击航线' : `${enemy.role === 'wing' ? '僚机' : '长机'}进入攻击线`
      });
      this.state.message = isAce ? '王牌三维攻击线 · 改变能量、高度或方向' : '截击航线形成 · S + 转向；切高度可尝试防御滚转';
    } else if (enemy.intent !== 'RECOVERING') {
      enemy.intent = 'PATROL';
    }
  }

  private updateAirDefense(enemy: EnemyState, dt: number): void {
    const player = this.state.player;
    const radarLinked = this.state.enemies.some((candidate) => candidate.kind === 'radar' && candidate.alive);
    const range = radarLinked ? ENEMY_TUNING.radarLinkedAaRange : ENEMY_TUNING.isolatedAaRange;
    const eligible = player.position.y < 18 && distanceXZ(enemy.position, player.position) < range;

    if (enemy.telegraph > 0) {
      enemy.telegraph -= dt;
      enemy.intent = 'TRACKING';
      enemy.attackTarget = this.predictPlayer(ENEMY_TUNING.flakFlightSeconds);
      if (enemy.telegraph <= 0) {
        this.launchFlak(enemy);
        enemy.attackTarget = null;
        enemy.fireCooldown = radarLinked ? 2.25 : 3.05;
        enemy.intent = 'RECOVERING';
      }
      return;
    }

    if (eligible && enemy.fireCooldown <= 0) {
      enemy.telegraph = radarLinked ? ENEMY_TUNING.radarLinkedAaTelegraph : ENEMY_TUNING.isolatedAaTelegraph;
      enemy.attackTarget = this.predictPlayer(ENEMY_TUNING.flakFlightSeconds);
      enemy.intent = 'TRACKING';
      this.emit({
        type: 'warning',
        from: copyVec(enemy.position),
        to: copyVec(enemy.attackTarget),
        color: radarLinked ? 0xff334c : 0xff8a63,
        text: radarLinked ? '雷达链路 · 快速防空解算' : '孤立防空炮 · 慢速解算'
      });
      this.state.message = radarLinked ? '雷达链路锁定 · 立即转向或拉升' : '防空炮独立锁定 · 预告窗口延长';
    } else if (enemy.intent !== 'RECOVERING') {
      enemy.intent = 'PATROL';
    }
  }

  private predictPlayer(seconds: number): Vec3State {
    const player = this.state.player;
    return {
      x: player.position.x + Math.sin(player.heading) * player.speed * seconds,
      y: player.position.y,
      z: player.position.z + Math.cos(player.heading) * player.speed * seconds
    };
  }

  private launchFlak(enemy: EnemyState): void {
    const target = enemy.attackTarget ?? copyVec(this.state.player.position);
    const from = { x: enemy.position.x, y: enemy.position.y + 4.1, z: enemy.position.z };
    const duration = ENEMY_TUNING.flakFlightSeconds;
    const volleyId = ++this.volleyId;
    this.state.projectiles.push({
      id: ++this.projectileId,
      volleyId,
      ownerId: enemy.id,
      kind: 'flak',
      position: copyVec(from),
      previousPosition: copyVec(from),
      velocity: {
        x: (target.x - from.x) / duration,
        y: (target.y - from.y) / duration,
        z: (target.z - from.z) / duration
      },
      damage: 18,
      radius: 4.8,
      life: duration + 0.12,
      nearMiss: false,
      heavy: true
    });
    this.emit({ type: 'enemyShot', from: copyVec(from), to: copyVec(target), color: 0xff4c62, text: 'FLAK OUT' });
  }

  private launchAirBurst(enemy: EnemyState): void {
    const from = copyVec(enemy.position);
    const target = enemy.attackTarget ?? copyVec(this.state.player.position);
    const shots = enemy.kind === 'ace' && enemy.acePhase === 2 ? 5 : 3;
    const volleyId = ++this.volleyId;
    const baseX = target.x - from.x;
    const baseZ = target.z - from.z;
    const horizontalLength = Math.max(0.001, Math.hypot(baseX, baseZ));
    const perpendicularX = -baseZ / horizontalLength;
    const perpendicularZ = baseX / horizontalLength;

    for (let index = 0; index < shots; index += 1) {
      const spread = (index - (shots - 1) / 2) * 1.45;
      const aim = { x: target.x + perpendicularX * spread, y: target.y, z: target.z + perpendicularZ * spread };
      const dx = aim.x - from.x;
      const dy = aim.y - from.y;
      const dz = aim.z - from.z;
      const length = Math.max(0.001, Math.hypot(dx, dy, dz));
      const speed = ENEMY_TUNING.tracerSpeed;
      this.state.projectiles.push({
        id: ++this.projectileId,
        volleyId,
        ownerId: enemy.id,
        kind: 'tracer',
        position: copyVec(from),
        previousPosition: copyVec(from),
        velocity: { x: dx / length * speed, y: dy / length * speed, z: dz / length * speed },
        damage: enemy.kind === 'ace' ? 12 : 9,
        radius: 2.1,
        life: length / speed + 0.28,
        nearMiss: false,
        heavy: false
      });
    }
    this.emit({ type: 'enemyShot', from, to: copyVec(target), color: enemy.kind === 'ace' ? 0xffbc66 : 0xff6679, text: 'GUNS GUNS GUNS' });
  }

  private updateProjectiles(dt: number): void {
    const player = this.state.player;
    for (let index = this.state.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.state.projectiles[index];
      if (!projectile) continue;
      projectile.previousPosition = copyVec(projectile.position);
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
      projectile.position.z += projectile.velocity.z * dt;
      projectile.life -= dt;

      const separation = tacticalDistance(projectile.position, player.position);
      if (separation < projectile.radius + 1.6 && player.invulnerability <= 0) {
        this.damagePlayer(projectile.damage, projectile.position, projectile.heavy ? '防空炮弹命中' : '截击火力命中');
        this.state.projectiles.splice(index, 1);
        continue;
      }
      if (separation < projectile.radius + 8 || (projectile.kind === 'flak' && distanceXZ(projectile.position, player.position) < 13)) {
        projectile.nearMiss = true;
      }
      if (projectile.life > 0) continue;
      if (projectile.nearMiss) this.resolveGraze(projectile);
      this.state.projectiles.splice(index, 1);
    }
  }

  private resolveGraze(projectile: EnemyProjectileState): void {
    if (this.grazedVolleys.has(projectile.volleyId)) return;
    this.grazedVolleys.add(projectile.volleyId);
    this.state.metrics.successfulEvasions += 1;
    this.state.score += projectile.heavy ? 220 : 140;
    this.emit({
      type: 'graze',
      from: copyVec(projectile.position),
      to: copyVec(this.state.player.position),
      color: 0xb9f4ff,
      text: projectile.heavy ? '高度规避 · 防空擦身' : '航线规避 · 曳光擦身'
    });
    this.state.message = projectile.heavy ? '完美拉升 · 防空炮弹擦身而过' : '攻击线规避 · 保持机动';
  }

  private resolveOvershoot(enemy: EnemyState): void {
    if (enemy.overshootResolved) return;
    enemy.overshootResolved = true;
    this.overshootEnemyThisFrame = enemy.id;
    this.state.player.advantageTime = Math.max(this.state.player.advantageTime, PLAYER_TUNING.advantageSeconds);
    this.state.metrics.overshoots += 1;
    this.state.score += enemy.kind === 'ace' ? 320 : 240;
    this.emit({
      type: 'overshoot',
      from: copyVec(enemy.position),
      to: copyVec(this.state.player.position),
      color: 0x70eaff,
      text: 'OVERSHOOT · ADVANTAGE'
    });
    this.state.message = '敌机冲过头 · ADVANTAGE：锁定与机炮解算加速';
  }

  private updateTacticalManeuvers(controls: ControlFrame): void {
    const target = this.maneuverTargetContext();
    const result = advanceManeuverTracker(this.maneuverTracker, {
      time: this.state.elapsed,
      altitudeMode: this.state.player.altitudeMode,
      altitudeToggled: controls.toggleAltitude,
      playerAltitude: this.state.player.position.y,
      speed: this.state.player.speed,
      steer: clamp(controls.steer, -1, 1),
      energy: clamp(controls.energy, -1, 1),
      target,
      damagedKind: this.damagedKindThisFrame,
      overshootEnemyId: this.overshootEnemyThisFrame
    });
    this.maneuverTracker = result.state;
    for (const maneuver of result.recognized) this.registerTactic(maneuver);
  }

  private maneuverTargetContext(): ManeuverTargetContext | null {
    const trackedId = this.maneuverTracker.altitudeLeg?.targetId ?? null;
    const tracked = trackedId === null
      ? null
      : this.state.enemies.find((enemy) => enemy.id === trackedId && enemy.alive) ?? null;
    const preferredId = this.overshootEnemyThisFrame
      ?? this.state.lockTargetId
      ?? this.state.sensorTargetId;
    const preferred = preferredId === null
      ? null
      : this.state.enemies.find((enemy) => enemy.id === preferredId && enemy.alive) ?? null;
    const attacking = this.state.enemies
      .filter((enemy) => enemy.alive && (enemy.kind === 'interceptor' || enemy.kind === 'ace') && (enemy.intent === 'TRACKING' || enemy.intent === 'ATTACKING'))
      .sort((a, b) => this.combatDistance(a) - this.combatDistance(b))[0] ?? null;
    const nearest = [...this.state.enemies]
      .filter((enemy) => enemy.alive)
      .sort((a, b) => this.combatDistance(a) - this.combatDistance(b))[0] ?? null;
    const overshootEnemy = this.overshootEnemyThisFrame === null
      ? null
      : this.state.enemies.find((enemy) => enemy.id === this.overshootEnemyThisFrame && enemy.alive) ?? null;
    const enemy = overshootEnemy ?? tracked ?? attacking ?? preferred ?? nearest;
    if (!enemy || this.combatDistance(enemy) > PLAYER_TUNING.sensorRange) return null;
    return {
      id: enemy.id,
      kind: enemy.kind,
      intent: enemy.intent,
      distance: this.combatDistance(enemy),
      angleDegrees: Math.abs(angleDelta(this.state.player.heading, angleTo(this.state.player.position, enemy.position))) * 180 / Math.PI,
      altitude: enemy.position.y,
      noseOn: enemy.kind === 'aa' || enemy.kind === 'radar'
        ? 0
        : forwardDot(enemy.heading, enemy.position, this.state.player.position)
    };
  }

  private registerTactic(maneuver: TacticalManeuver): void {
    const chainContinues = this.state.elapsed - this.lastTacticAt <= 5.25;
    this.state.tacticChain = chainContinues ? Math.min(9, this.state.tacticChain + 1) : 1;
    this.lastTacticAt = this.state.elapsed;
    this.state.activeTactic = maneuver;
    this.state.activeTacticTime = 2.8;
    this.state.lastTactic = maneuver;
    this.state.metrics.maneuverCounts[maneuver] += 1;
    const baseScore = maneuver === 'BOOM_ZOOM' || maneuver === 'SCISSORS' ? 220 : 160;
    this.state.score += baseScore + Math.max(0, this.state.tacticChain - 1) * 40;
    if (maneuver !== 'BOOM_ZOOM') {
      this.state.player.advantageTime = Math.max(this.state.player.advantageTime, maneuver === 'SCISSORS' ? 2.2 : 1.45);
    }
    const label = this.tacticLabel(maneuver);
    this.emit({
      type: 'maneuver',
      from: copyVec(this.state.player.position),
      color: maneuver === 'BOOM_ZOOM' || maneuver.includes('YOYO') ? 0xffbc66 : 0x70eaff,
      text: `${label}${this.state.tacticChain > 1 ? ` · CHAIN ${this.state.tacticChain}` : ''}`
    });
    this.state.message = `${label}成立 · 交战几何已改善${this.state.tacticChain > 1 ? ` · 连锁 ${this.state.tacticChain}` : ''}`;
  }

  private tacticLabel(maneuver: TacticalManeuver): string {
    if (maneuver === 'BOOM_ZOOM') return '俯冲突击 / BOOM & ZOOM';
    if (maneuver === 'HIGH_YOYO') return '高悠悠 / HIGH YO-YO';
    if (maneuver === 'LOW_YOYO') return '低悠悠 / LOW YO-YO';
    if (maneuver === 'DEFENSIVE_ROLL') return '防御滚转 / DEFENSIVE ROLL';
    if (maneuver === 'REVERSAL') return '反转 / REVERSAL';
    if (maneuver === 'SCISSORS') return '剪刀机动 / SCISSORS';
    if (maneuver === 'LEAD_TURN') return '抢先转弯 / LEAD TURN';
    return '机动';
  }

  private updateTargetingAndWeapons(dt: number, controls: ControlFrame): void {
    if (this.state.phaseTransition > 0) return;
    const player = this.state.player;
    const previousGunTarget = this.state.gunTargetId;
    const gunTarget = this.pickWeaponTarget(PLAYER_TUNING.gunRange, PLAYER_TUNING.gunConeDegrees);
    this.state.gunTargetId = gunTarget?.id ?? null;
    if (previousGunTarget !== this.state.gunTargetId) {
      player.gunTrackProgress = 0;
      player.gunBurstRemaining = 0;
    }

    if (gunTarget) {
      const gunEngaged = player.gunCooldown <= PLAYER_TUNING.gunBurstRecovery || player.gunBurstRemaining > 0;
      const gunAdvantage = player.advantageTime > 0 ? PLAYER_TUNING.advantageGunMultiplier : 1;
      player.gunTrackProgress = gunEngaged
        ? clamp(player.gunTrackProgress + dt * gunAdvantage / PLAYER_TUNING.gunRakeSeconds, 0, 1)
        : Math.max(0, player.gunTrackProgress - dt * 3.5);
      if (player.gunCooldown <= 0) {
        if (player.gunBurstRemaining <= 0) player.gunBurstRemaining = PLAYER_TUNING.gunBurstSize;
        this.fireGun(gunTarget);
      }
      if (gunTarget.alive && player.gunTrackProgress >= 1 && player.gunRakeCooldown <= 0) {
        player.gunRakeCooldown = PLAYER_TUNING.gunRakeCooldown;
        gunTarget.stagger = Math.max(gunTarget.stagger, 0.2);
        this.state.metrics.gunRakes += 1;
        this.state.score += 90;
        this.emit({
          type: 'gunRake',
          from: copyVec(player.position),
          to: copyVec(gunTarget.position),
          color: 0xffd37a,
          text: 'GUN RAKE'
        });
        this.damageEnemy(gunTarget, PLAYER_TUNING.gunRakeBonus);
      }
    } else {
      player.gunTrackProgress = Math.max(0, player.gunTrackProgress - dt * 3.5);
      player.gunBurstRemaining = 0;
    }

    const missileTarget = this.updateMissileTargeting(dt);
    this.state.fireBuffer = Math.max(0, this.state.fireBuffer - dt);

    if (controls.fireMissile) {
      if (player.missilesRemaining <= 0) {
        this.state.message = '导弹耗尽 · 依靠机炮完成任务';
      } else if (player.missileCooldown > 0) {
        this.state.message = `导弹挂架冷却 · ${player.missileCooldown.toFixed(1)} 秒`;
      } else if (!missileTarget) {
        const sensor = this.findEnemy(this.state.sensorTargetId);
        this.state.message = sensor && !this.isLayerMatch(sensor) ? '目标位于另一高度层 · CHANGE ALT' : '雷达有接触 · 转向进入火控范围';
      } else if (!this.state.lockReady) {
        this.state.fireBuffer = PLAYER_TUNING.fireBufferSeconds;
        this.state.message = this.state.lockAngleDegrees > PLAYER_TUNING.lockConeDegrees
          ? '目标已捕获 · 继续转向进入锁定区'
          : `火控解算 · ${Math.round(this.state.lockProgress * 100)}%`;
      }
    }

    const wantsFire = controls.fireMissile || this.state.fireBuffer > 0;
    if (
      wantsFire
      && missileTarget
      && this.state.lockReady
      && this.isLayerMatch(missileTarget)
      && player.missileCooldown <= 0
      && player.missilesRemaining > 0
    ) {
      this.launchPlayerMissile(missileTarget, this.state.lockPerfect ? 'PERFECT' : 'LOCK');
    }
  }

  private fireGun(target: EnemyState): void {
    const player = this.state.player;
    const forwardX = Math.sin(player.heading);
    const forwardZ = Math.cos(player.heading);
    const rightX = Math.cos(player.heading);
    const rightZ = -Math.sin(player.heading);
    const from = {
      x: player.position.x + forwardX * 2.7 + rightX * this.gunSide * 0.82,
      y: player.position.y - 0.1,
      z: player.position.z + forwardZ * 2.7 + rightZ * this.gunSide * 0.82
    };
    this.gunSide = this.gunSide === -1 ? 1 : -1;
    player.gunBurstRemaining -= 1;
    player.gunCooldown = player.gunBurstRemaining > 0 ? PLAYER_TUNING.gunInterval : PLAYER_TUNING.gunBurstRecovery;
    this.emit({ type: 'gun', from, to: copyVec(target.position), color: 0xf4c66a });
    this.damageEnemy(target, PLAYER_TUNING.gunDamage);
  }

  private updateMissileTargeting(dt: number): EnemyState | null {
    const previousId = this.state.lockTargetId;
    const previous = this.findEnemy(previousId);
    let selected: EnemyState | null = previous;
    let retainedOutsideSoftAcquire = false;

    if (selected) {
      const distance = this.combatDistance(selected);
      const angle = Math.abs(angleDelta(this.state.player.heading, angleTo(this.state.player.position, selected.position))) * 180 / Math.PI;
      const insideSoftAcquire = this.isLayerMatch(selected)
        && distance <= PLAYER_TUNING.missileRange
        && angle <= PLAYER_TUNING.softAcquireDegrees;
      if (!insideSoftAcquire) {
        this.targetLostTime += dt;
        retainedOutsideSoftAcquire = true;
        if (this.targetLostTime > PLAYER_TUNING.targetRetentionSeconds) {
          selected = null;
          retainedOutsideSoftAcquire = false;
        }
      }
    }

    if (!selected) selected = this.pickWeaponTarget(PLAYER_TUNING.missileRange, PLAYER_TUNING.softAcquireDegrees);

    if ((selected?.id ?? null) !== previousId) {
      this.state.lockTargetId = selected?.id ?? null;
      this.state.lockProgress = 0;
      this.state.lockReady = false;
      this.state.perfectProgress = 0;
      this.state.lockPerfect = false;
      this.targetLostTime = 0;
    }

    const sensor = selected ?? this.pickSensorContact();
    this.state.sensorTargetId = sensor?.id ?? null;
    this.state.targetLayerMatch = sensor ? this.isLayerMatch(sensor) : false;
    this.state.lockAngleDegrees = selected
      ? Math.abs(angleDelta(this.state.player.heading, angleTo(this.state.player.position, selected.position))) * 180 / Math.PI
      : 180;

    if (!selected) {
      this.state.lockProgress = Math.max(0, this.state.lockProgress - dt * 2.4);
      this.state.lockReady = false;
      this.state.perfectProgress = 0;
      this.state.lockPerfect = false;
      return null;
    }

    const layerMatch = this.isLayerMatch(selected);
    const inRange = this.combatDistance(selected) <= PLAYER_TUNING.missileRange;
    const inLockCone = this.state.lockAngleDegrees <= PLAYER_TUNING.lockConeDegrees;
    const inSoftCone = this.state.lockAngleDegrees <= PLAYER_TUNING.softAcquireDegrees;
    if (layerMatch && inRange && inLockCone) {
      this.targetLostTime = 0;
      const angle = this.state.lockAngleDegrees;
      const lockSeconds = angle <= PLAYER_TUNING.perfectConeDegrees
        ? PLAYER_TUNING.lockCloseSeconds
        : angle <= 55
          ? PLAYER_TUNING.lockMediumSeconds
          : PLAYER_TUNING.lockWideSeconds;
      const effectiveLockSeconds = lockSeconds * (this.state.player.advantageTime > 0 ? PLAYER_TUNING.advantageLockMultiplier : 1);
      const wasReady = this.state.lockReady;
      this.state.lockProgress = clamp(this.state.lockProgress + dt / effectiveLockSeconds, 0, 1);
      this.state.lockReady = this.state.lockProgress >= 1;
      if (!wasReady && this.state.lockReady) {
        this.emit({ type: 'lock', from: copyVec(selected.position), color: 0x70eaff, text: 'MISSILE LOCK' });
        this.state.message = `LOCK · ${this.enemyLabel(selected.kind)} · 可发射`;
      }

      if (this.state.lockReady && angle <= PLAYER_TUNING.perfectConeDegrees) {
        const wasPerfect = this.state.lockPerfect;
        this.state.perfectProgress = clamp(this.state.perfectProgress + dt / PLAYER_TUNING.perfectDwellSeconds, 0, 1);
        this.state.lockPerfect = this.state.perfectProgress >= 1;
        if (!wasPerfect && this.state.lockPerfect) {
          this.emit({ type: 'perfect', from: copyVec(selected.position), color: 0xffd37a, text: 'PERFECT SOLUTION' });
          this.state.message = `PERFECT · ${this.enemyLabel(selected.kind)} · 高杀伤解算`;
        }
      } else if (!this.state.lockPerfect) {
        this.state.perfectProgress = Math.max(0, this.state.perfectProgress - dt * 1.4);
      }
    } else {
      if (!retainedOutsideSoftAcquire) this.targetLostTime += dt;
      if (this.targetLostTime > PLAYER_TUNING.targetRetentionSeconds) {
        this.state.lockProgress = Math.max(0, this.state.lockProgress - dt * (inSoftCone && layerMatch ? 1.05 : 2.4));
        this.state.lockReady = false;
        this.state.perfectProgress = Math.max(0, this.state.perfectProgress - dt * 2.4);
        this.state.lockPerfect = false;
      }
    }
    return selected;
  }

  private launchPlayerMissile(target: EnemyState, quality: MissileQuality): void {
    const player = this.state.player;
    const side = this.missileSide;
    this.missileSide = this.missileSide === -1 ? 1 : -1;
    const forwardX = Math.sin(player.heading);
    const forwardZ = Math.cos(player.heading);
    const rightX = Math.cos(player.heading);
    const rightZ = -Math.sin(player.heading);
    const from = {
      x: player.position.x + forwardX * 1.25 + rightX * side * 2.15,
      y: player.position.y - 0.55,
      z: player.position.z + forwardZ * 1.25 + rightZ * side * 2.15
    };
    const missile: PlayerMissileState = {
      id: ++this.projectileId,
      targetId: target.id,
      position: copyVec(from),
      previousPosition: copyVec(from),
      velocity: {
        x: forwardX * 30 + rightX * side * 11,
        y: -7,
        z: forwardZ * 30 + rightZ * side * 11
      },
      speed: 34,
      turnRate: quality === 'PERFECT' ? PLAYER_TUNING.missilePerfectTurnRate : PLAYER_TUNING.missileTurnRate,
      damage: quality === 'PERFECT' ? PLAYER_TUNING.missilePerfectDamage : PLAYER_TUNING.missileDamage,
      radius: quality === 'PERFECT' ? 1.4 : 1.05,
      life: PLAYER_TUNING.missileLife,
      age: 0,
      side,
      quality,
      stage: 'EJECT'
    };
    this.state.playerMissiles.push(missile);
    player.missileCooldown = PLAYER_TUNING.missileCooldown;
    player.missilesRemaining -= 1;
    this.state.metrics.missilesFired += 1;
    if (quality === 'PERFECT') this.state.metrics.perfectShots += 1;
    this.emit({
      type: 'missile',
      from: copyVec(from),
      to: copyVec(target.position),
      color: quality === 'PERFECT' ? 0xffd37a : 0x7ce8f2,
      text: quality === 'PERFECT' ? 'FOX TWO · PERFECT' : 'FOX TWO'
    });
    this.state.message = quality === 'PERFECT'
      ? `FOX TWO · PERFECT · ${this.enemyLabel(target.kind)}`
      : `FOX TWO · ${this.enemyLabel(target.kind)}`;
    this.state.fireBuffer = 0;
    this.state.lockProgress = 0;
    this.state.lockReady = false;
    this.state.perfectProgress = 0;
    this.state.lockPerfect = false;
  }

  private updatePlayerMissiles(dt: number): void {
    for (let index = this.state.playerMissiles.length - 1; index >= 0; index -= 1) {
      const missile = this.state.playerMissiles[index];
      if (!missile) continue;
      missile.previousPosition = copyVec(missile.position);
      missile.age += dt;
      missile.life -= dt;
      if (missile.stage === 'EJECT' && missile.age >= 0.09) missile.stage = 'POWERED';

      const target = this.findEnemy(missile.targetId);
      if (missile.stage === 'POWERED') {
        missile.speed = lerp(missile.speed, PLAYER_TUNING.missileSpeed, dt * 7.5);
        if (target) {
          const lead = this.estimateEnemyVelocity(target);
          const leadSeconds = missile.quality === 'PERFECT' ? 0.16 : 0.1;
          const desired = {
            x: target.position.x + lead.x * leadSeconds - missile.position.x,
            y: target.position.y + lead.y * leadSeconds - missile.position.y,
            z: target.position.z + lead.z * leadSeconds - missile.position.z
          };
          const direction = rotateToward(missile.velocity, desired, missile.turnRate * dt);
          missile.velocity = {
            x: direction.x * missile.speed,
            y: direction.y * missile.speed,
            z: direction.z * missile.speed
          };
        }
      }

      missile.position.x += missile.velocity.x * dt;
      missile.position.y += missile.velocity.y * dt;
      missile.position.z += missile.velocity.z * dt;

      if (target) {
        const targetRadius = target.kind === 'aa' || target.kind === 'radar' ? 5.8 : 3.8;
        if (tacticalDistance(missile.position, target.position) <= targetRadius + missile.radius) {
          this.state.playerMissiles.splice(index, 1);
          this.state.metrics.missileHits += 1;
          this.state.score += missile.quality === 'PERFECT' ? 180 : 90;
          this.emit({
            type: 'missileImpact',
            from: copyVec(missile.position),
            to: copyVec(target.position),
            color: missile.quality === 'PERFECT' ? 0xffd37a : 0x7ce8f2,
            text: missile.quality === 'PERFECT' ? 'PERFECT HIT' : 'MISSILE HIT'
          });
          this.damageEnemy(target, missile.damage);
          continue;
        }
      }

      if (missile.life > 0) continue;
      this.state.playerMissiles.splice(index, 1);
      this.state.metrics.missileMisses += 1;
      this.emit({ type: 'missileMiss', from: copyVec(missile.position), color: 0x7c9aa0, text: 'MISSILE LOST' });
      if (!this.state.ended) this.state.message = '导弹脱靶 · 重新建立射击解算';
    }
  }

  private estimateEnemyVelocity(enemy: EnemyState): Vec3State {
    if (enemy.kind === 'aa' || enemy.kind === 'radar') return { x: 0, y: 0, z: 0 };
    const speed = enemy.kind === 'ace' ? (enemy.acePhase === 2 ? 45 : 39) : enemy.role === 'wing' ? 35 : 33;
    return { x: Math.sin(enemy.heading) * speed, y: enemy.verticalSpeed, z: Math.cos(enemy.heading) * speed };
  }

  private findEnemy(id: number | null): EnemyState | null {
    if (id === null) return null;
    return this.state.enemies.find((enemy) => enemy.id === id && enemy.alive) ?? null;
  }

  private isLayerMatch(enemy: EnemyState): boolean {
    const ground = enemy.kind === 'aa' || enemy.kind === 'radar';
    return ground
      ? this.state.player.position.y < 18
      : Math.abs(this.state.player.position.y - enemy.position.y) <= ENEMY_TUNING.airWeaponAltitudeTolerance;
  }

  private combatDistance(enemy: EnemyState): number {
    return enemy.kind === 'aa' || enemy.kind === 'radar'
      ? distanceXZ(this.state.player.position, enemy.position)
      : tacticalDistance(this.state.player.position, enemy.position);
  }

  private pickSensorContact(): EnemyState | null {
    const player = this.state.player;
    let best: EnemyState | null = null;
    let bestScore = -Infinity;
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;
      const distance = this.combatDistance(enemy);
      if (distance > PLAYER_TUNING.sensorRange) continue;
      const alignment = forwardDot(player.heading, player.position, enemy.position);
      const layerBias = this.isLayerMatch(enemy) ? 1.25 : 0;
      const threatBias = enemy.intent === 'TRACKING' || enemy.intent === 'ATTACKING' ? 0.45 : 0;
      const score = layerBias + threatBias + alignment * 0.18 - distance / PLAYER_TUNING.sensorRange;
      if (score > bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best;
  }

  private pickWeaponTarget(range: number, coneDegrees: number): EnemyState | null {
    const player = this.state.player;
    let best: EnemyState | null = null;
    let bestScore = -Infinity;

    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;
      const distance = this.combatDistance(enemy);
      if (distance > range) continue;
      if (!this.isLayerMatch(enemy)) continue;
      const angle = Math.abs(angleDelta(player.heading, angleTo(player.position, enemy.position))) * 180 / Math.PI;
      if (angle > coneDegrees) continue;
      const intentBias = enemy.intent === 'TRACKING' || enemy.intent === 'ATTACKING' ? 0.28 : 0;
      const score = (1 - angle / Math.max(1, coneDegrees)) * 2.2 - distance / range + intentBias;
      if (score > bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best;
  }

  private damageEnemy(enemy: EnemyState, amount: number): void {
    this.damagedKindThisFrame = enemy.kind;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.hitFlash = 0.11;
    this.emit({ type: 'hit', from: copyVec(enemy.position), color: 0xffffff });

    if (enemy.kind === 'ace' && enemy.acePhase === 1 && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.5) {
      enemy.acePhase = 2;
      enemy.fireCooldown = 0.55;
      enemy.intent = 'RECOVERING';
      this.state.score += 500;
      this.state.message = '王牌第二阶段 · 攻击航线加速';
      this.emit({ type: 'phase', from: copyVec(enemy.position), color: 0xffbc66, text: 'ACE PHASE TWO' });
    }
    if (enemy.hp > 0) return;

    enemy.alive = false;
    this.state.kills += 1;
    this.state.score += enemyScore(enemy.kind);
    const routeMessage = this.applyInfiltrationRoute(enemy);
    this.state.message = routeMessage ?? `${this.enemyLabel(enemy.kind)}摧毁`;
    this.emit({ type: 'kill', from: copyVec(enemy.position), color: enemy.kind === 'ace' ? 0xffb35f : 0xff5a63, text: 'TARGET DOWN' });
    if (this.state.enemies.every((candidate) => !candidate.alive)) this.beginPhaseTransition();
  }

  private applyInfiltrationRoute(enemy: EnemyState): string | null {
    if (this.state.phaseIndex !== 0 || this.state.metrics.infiltrationRoute !== 'UNSET') return null;
    const counterpartAlive = this.state.enemies.some((candidate) => candidate.alive && candidate.kind !== enemy.kind);
    if (!counterpartAlive) return null;
    if (enemy.kind === 'radar') {
      this.state.metrics.infiltrationRoute = 'RADAR_FIRST';
      this.state.score += 260;
      const aa = this.state.enemies.find((candidate) => candidate.kind === 'aa' && candidate.alive);
      if (aa) aa.telegraph = Math.max(aa.telegraph, 0.9);
      return '雷达链路切断 · 防空炮锁定显著变慢';
    } else if (enemy.kind === 'aa') {
      this.state.metrics.infiltrationRoute = 'AA_FIRST';
      this.state.score += 520;
      return '高风险强攻成功 · 获得突击路线奖励';
    }
    return null;
  }

  private beginPhaseTransition(): void {
    if (this.state.phaseTransition > 0) return;
    this.state.metrics.phaseTimes.push(this.state.elapsed - this.phaseStartedAt);
    this.state.phaseTransition = 1.45;
    this.state.projectiles = [];
    this.state.playerMissiles = [];
    this.state.gunTargetId = null;
    this.state.sensorTargetId = null;
    this.state.lockTargetId = null;
    this.state.lockProgress = 0;
    this.state.lockReady = false;
    this.state.perfectProgress = 0;
    this.state.lockPerfect = false;
    this.state.lockAngleDegrees = 180;
    this.state.targetLayerMatch = false;
    this.state.fireBuffer = 0;
    this.targetLostTime = 0;
    this.state.threat = '空域暂时清空 · 数据链重构中';
    this.emit({ type: 'phase', from: copyVec(this.state.player.position), text: 'SECTOR CLEAR' });
  }

  private updatePhaseTransition(dt: number): void {
    if (this.state.phaseTransition <= 0) return;
    this.state.phaseTransition = Math.max(0, this.state.phaseTransition - dt);
    if (this.state.phaseTransition > 0) return;
    this.advancePhase();
  }

  private advancePhase(): void {
    const nextIndex = this.state.phaseIndex + 1;
    const phase = PHASES[nextIndex];
    if (!phase) {
      this.state.score += Math.ceil(this.state.timeRemaining) * 12;
      this.state.grade = this.calculateGrade();
      this.state.ended = true;
      this.state.outcome = 'SUCCESS';
      this.state.phase = 'COMPLETE';
      this.state.phaseLabel = '演习完成 / CLEAR';
      this.state.objective = '全部地空威胁已解除';
      this.state.threat = '空域安全';
      this.state.message = `空域清理完成 · 评级 ${this.state.grade}`;
      this.emit({ type: 'phase', from: copyVec(this.state.player.position), text: `MISSION ${this.state.grade}` });
      return;
    }

    this.state.phaseIndex = nextIndex;
    this.state.phase = phase.id;
    this.state.phaseLabel = phase.label;
    this.state.objective = phase.objective;
    this.state.enemies = this.createWave(nextIndex);
    this.phaseStartedAt = this.state.elapsed;
    this.state.message = phase.arrival;
    this.emit({ type: 'phase', from: copyVec(this.state.player.position), text: phase.label });
  }

  private damagePlayer(amount: number, from: Vec3State, label: string): void {
    const player = this.state.player;
    if (player.invulnerability > 0 || !player.alive) return;
    player.hp = Math.max(0, player.hp - amount);
    player.invulnerability = 0.38;
    this.state.metrics.damageTaken += amount;
    this.state.message = label;
    this.emit({ type: amount >= 15 ? 'heavyDamage' : 'playerHit', from: copyVec(from), to: copyVec(player.position), color: 0xff334c, text: label });
    if (player.hp > 0) return;

    if (this.state.recoveryTokens <= 0) {
      player.alive = false;
      this.finishMission('DEFEAT', '战机失去作战能力 · 演习失败');
      return;
    }

    this.state.recoveryTokens -= 1;
    this.state.metrics.recoveries += 1;
    this.state.score = Math.max(0, this.state.score - 850);
    player.hp = player.maxHp;
    player.position = { x: -26, y: HIGH_ALTITUDE, z: -54 };
    player.heading = 0.15;
    player.speed = PLAYER_TUNING.cruiseSpeed;
    player.verticalSpeed = 0;
    player.maneuver = 'CRUISE';
    player.advantageTime = 0;
    player.altitudeMode = 'HIGH';
    player.invulnerability = 2.2;
    this.state.projectiles = [];
    this.state.playerMissiles = [];
    this.state.message = '唯一救援已使用 · 高空重新接战';
    this.emit({ type: 'recovery', from: copyVec(player.position), color: 0x70eaff, text: 'RECOVERY 0' });
  }

  private finishMission(outcome: Exclude<MissionOutcome, 'ACTIVE' | 'SUCCESS'>, message: string): void {
    this.state.ended = true;
    this.state.outcome = outcome;
    this.state.grade = '—';
    this.state.phase = 'FAILED';
    this.state.phaseLabel = outcome === 'TIMEOUT' ? '演习终止 / TIMEOUT' : '演习失败 / AIRFRAME LOST';
    this.state.objective = outcome === 'TIMEOUT' ? '未在时限内解除全部威胁' : '战机失去作战能力';
    this.state.message = message;
    this.state.projectiles = [];
    this.state.playerMissiles = [];
  }

  private calculateGrade(): MissionGrade {
    const performance = this.state.score
      - this.state.metrics.damageTaken * 7
      - this.state.metrics.recoveries * 900
      + this.state.metrics.successfulEvasions * 180;
    if (performance >= 7900) return 'S';
    if (performance >= 6500) return 'A';
    if (performance >= 5000) return 'B';
    return 'C';
  }

  private updateThreatLabel(): void {
    if (this.state.ended || this.state.phaseTransition > 0) return;
    const player = this.state.player;
    const aa = this.state.enemies.find((enemy) => enemy.kind === 'aa' && enemy.alive);
    const radar = this.state.enemies.find((enemy) => enemy.kind === 'radar' && enemy.alive);
    const attackingAircraft = this.state.enemies.find((enemy) =>
      (enemy.kind === 'interceptor' || enemy.kind === 'ace') && enemy.alive && enemy.telegraph > 0
    );
    const incomingFlak = this.state.projectiles.some((projectile) => projectile.kind === 'flak');
    const incomingTracer = this.state.projectiles.some((projectile) => projectile.kind === 'tracer');
    if (incomingFlak) this.state.threat = '来袭 · 防空炮弹正在逼近预测点';
    else if (incomingTracer) this.state.threat = '来袭 · 截击火力穿越当前航线';
    else if (aa && aa.telegraph > 0) this.state.threat = radar ? '警告 · 雷达链路快速锁定' : '警告 · 孤立防空炮锁定';
    else if (attackingAircraft) this.state.threat = attackingAircraft.kind === 'ace' ? '警告 · 王牌攻击航线' : '警告 · 截击机攻击航线';
    else if (player.position.y < 18 && aa) this.state.threat = radar ? '低空暴露 · 雷达与防空炮联网' : '低空暴露 · 防空炮独立搜索';
    else if (player.position.y > 22 && this.state.enemies.some((enemy) => (enemy.kind === 'interceptor' || enemy.kind === 'ace') && enemy.alive)) this.state.threat = '高空接战 · 争夺尾后射击位置';
    else if (radar) this.state.threat = '雷达链路在线 · 优先切断可降低风险';
    else this.state.threat = '高度转换 · 重新评估威胁';
  }

  private enemyLabel(kind: EnemyKind): string {
    if (kind === 'radar') return '雷达站';
    if (kind === 'aa') return '防空阵地';
    if (kind === 'ace') return '王牌截击机';
    return '截击机';
  }

  private emit(event: Omit<CombatEvent, 'id'>): void {
    this.state.events.push({ id: ++this.eventId, ...event });
  }
}
