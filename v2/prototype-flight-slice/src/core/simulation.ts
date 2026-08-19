import {
  ARENA_RADIUS,
  ENCOUNTER_DURATION,
  HIGH_ALTITUDE,
  LOW_ALTITUDE,
  PHASES,
  PLAYER_TUNING
} from '../content/encounter';
import type { CombatEvent, ControlFrame, EnemyKind, EnemyState, SliceState, Vec3State } from './types';

const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function copyVec(value: Vec3State): Vec3State {
  return { x: value.x, y: value.y, z: value.z };
}

function distanceXZ(a: Vec3State, b: Vec3State): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
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
  if (kind === 'radar') return 58;
  if (kind === 'aa') return 74;
  if (kind === 'ace') return 132;
  return 82;
}

function enemyScore(kind: EnemyKind): number {
  if (kind === 'radar') return 700;
  if (kind === 'aa') return 900;
  if (kind === 'ace') return 1800;
  return 1100;
}

export class FlightSliceSimulation {
  readonly state: SliceState;
  private eventId = 0;
  private enemyId = 0;

  constructor() {
    this.state = this.createState();
  }

  reset(): void {
    this.eventId = 0;
    this.enemyId = 0;
    Object.assign(this.state, this.createState());
  }

  step(dt: number, controls: ControlFrame): void {
    if (controls.reset) {
      this.reset();
      return;
    }

    this.state.events = [];
    if (this.state.ended) return;

    const safeDt = clamp(dt, 0, 0.05);
    this.state.elapsed += safeDt;
    this.state.timeRemaining = Math.max(0, ENCOUNTER_DURATION - this.state.elapsed);
    if (this.state.timeRemaining <= 0) {
      this.state.ended = true;
      this.state.outcome = 'TIMEOUT';
      this.state.phase = 'FAILED';
      this.state.phaseLabel = '演习终止 / TIMEOUT';
      this.state.objective = '未在时限内解除全部威胁';
      this.state.message = `演习超时 · 已摧毁 ${this.state.kills} 个目标`;
      return;
    }

    this.updatePlayer(safeDt, controls);
    this.updateEnemies(safeDt);
    this.updateTargetingAndWeapons(controls);
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
      phase: firstPhase.id,
      phaseIndex: 0,
      phaseLabel: firstPhase.label,
      objective: firstPhase.objective,
      lockTargetId: null,
      threat: '低空航路开放 · 地面雷达搜索中',
      message: firstPhase.arrival,
      player: {
        position: { x: -26, y: LOW_ALTITUDE, z: -54 },
        heading: 0.15,
        speed: PLAYER_TUNING.cruiseSpeed,
        bank: 0,
        altitudeMode: 'LOW',
        hp: 100,
        maxHp: 100,
        gunCooldown: 0,
        missileCooldown: 0,
        alive: true
      },
      enemies: this.createWave(0),
      metrics: {
        altitudeSwitches: 0,
        missilesFired: 0,
        missileHits: 0,
        damageTaken: 0,
        recoveries: 0
      },
      events: []
    };
  }

  private createWave(index: number): EnemyState[] {
    const phase = PHASES[index];
    if (!phase) return [];
    return phase.enemies.map((placement) => this.createEnemy(placement.kind, placement.position, index, placement.heading));
  }

  private createEnemy(kind: EnemyKind, position: Vec3State, wave: number, heading = 0): EnemyState {
    const hp = enemyMaxHp(kind);
    return {
      id: ++this.enemyId,
      kind,
      wave,
      position: copyVec(position),
      heading,
      hp,
      maxHp: hp,
      alive: true,
      fireCooldown: kind === 'aa' ? 1.25 : kind === 'ace' ? 0.8 : 1.65,
      telegraph: 0,
      hitFlash: 0
    };
  }

  private updatePlayer(dt: number, controls: ControlFrame): void {
    const player = this.state.player;
    if (controls.toggleAltitude) {
      player.altitudeMode = player.altitudeMode === 'LOW' ? 'HIGH' : 'LOW';
      this.state.metrics.altitudeSwitches += 1;
      this.emit({
        type: 'altitude',
        from: copyVec(player.position),
        text: player.altitudeMode === 'HIGH' ? '拉升 · 速度换高度' : '俯冲 · 高度换速度'
      });
      this.state.message = player.altitudeMode === 'HIGH' ? '拉升：脱离地面火控' : '俯冲：进入对地攻击窗口';
    }

    const targetAltitude = player.altitudeMode === 'HIGH' ? HIGH_ALTITUDE : LOW_ALTITUDE;
    const altitudeDelta = targetAltitude - player.position.y;
    const altitudeRate = altitudeDelta > 0 ? PLAYER_TUNING.altitudeRiseRate : PLAYER_TUNING.altitudeFallRate;
    player.position.y += clamp(altitudeDelta, -altitudeRate * dt, altitudeRate * dt);

    const climbing = altitudeDelta > 1;
    const diving = altitudeDelta < -1;
    const targetSpeed = climbing
      ? PLAYER_TUNING.climbSpeed
      : diving
        ? PLAYER_TUNING.diveSpeed
        : PLAYER_TUNING.cruiseSpeed;
    player.speed = lerp(player.speed, targetSpeed, dt * 2.8);

    const steer = clamp(controls.steer, -1, 1);
    const radius = Math.hypot(player.position.x, player.position.z);
    let steering = steer;
    if (radius > ARENA_RADIUS * 0.82) {
      const homeHeading = angleTo(player.position, { x: 0, y: player.position.y, z: 0 });
      steering += clamp(angleDelta(player.heading, homeHeading) * 0.75, -0.8, 0.8);
    }
    steering = clamp(steering, -1, 1);
    player.heading = (player.heading + steering * PLAYER_TUNING.turnRate * dt + TAU) % TAU;
    player.bank = lerp(player.bank, -steering * 0.68, dt * 5.7);
    player.position.x += Math.sin(player.heading) * player.speed * dt;
    player.position.z += Math.cos(player.heading) * player.speed * dt;
    player.gunCooldown = Math.max(0, player.gunCooldown - dt);
    player.missileCooldown = Math.max(0, player.missileCooldown - dt);
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.state.enemies) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      if (!enemy.alive) continue;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      if (enemy.kind === 'interceptor' || enemy.kind === 'ace') this.updateInterceptor(enemy, dt);
      else if (enemy.kind === 'aa') this.updateAirDefense(enemy, dt);
    }
  }

  private updateInterceptor(enemy: EnemyState, dt: number): void {
    const player = this.state.player;
    const desiredHeading = angleTo(enemy.position, player.position);
    const separation = distanceXZ(enemy.position, player.position);
    const chaseWeight = separation > 26 ? 1 : -0.62;
    const agility = enemy.kind === 'ace' ? 1.28 : 0.96;
    const speed = enemy.kind === 'ace' ? 38 : 32;
    enemy.heading += clamp(angleDelta(enemy.heading, desiredHeading) * chaseWeight, -1, 1) * dt * agility;
    enemy.position.x += Math.sin(enemy.heading) * speed * dt;
    enemy.position.z += Math.cos(enemy.heading) * speed * dt;
    enemy.position.y = lerp(enemy.position.y, HIGH_ALTITUDE + Math.sin(this.state.elapsed * 0.8 + enemy.id) * 2, dt * 1.5);

    const playerIsHigh = player.position.y > 22;
    const firingRange = enemy.kind === 'ace' ? 72 : 62;
    if (playerIsHigh && separation < firingRange && enemy.fireCooldown <= 0) {
      enemy.fireCooldown = enemy.kind === 'ace' ? 0.95 : 1.35;
      this.damagePlayer(enemy.kind === 'ace' ? 13 : 9, enemy.position, enemy.kind === 'ace' ? '王牌截击命中' : '截击机命中');
    }
  }

  private updateAirDefense(enemy: EnemyState, dt: number): void {
    const player = this.state.player;
    const eligible = player.position.y < 18 && distanceXZ(enemy.position, player.position) < 102;

    if (enemy.telegraph > 0) {
      enemy.telegraph -= dt;
      if (enemy.telegraph <= 0) {
        enemy.fireCooldown = 2.65;
        if (eligible) this.damagePlayer(18, enemy.position, '防空火控命中');
        else {
          const nearMiss = { x: player.position.x + 5, y: player.position.y - 1, z: player.position.z - 3 };
          this.emit({ type: 'graze', from: copyVec(enemy.position), to: nearMiss, color: 0xb9f4ff, text: '锁定擦身而过' });
          this.state.message = '擦身规避 · 高度切换甩开火控';
        }
      }
      return;
    }

    if (eligible && enemy.fireCooldown <= 0) {
      enemy.telegraph = 0.9;
      this.emit({ type: 'warning', from: copyVec(enemy.position), to: copyVec(player.position), color: 0xff5a63, text: '地面锁定' });
    }
  }

  private updateTargetingAndWeapons(controls: ControlFrame): void {
    const player = this.state.player;
    const gunTarget = this.pickTarget(PLAYER_TUNING.gunRange, PLAYER_TUNING.gunConeDegrees, 16);
    this.state.lockTargetId = gunTarget?.id ?? null;

    if (gunTarget && player.gunCooldown <= 0) {
      player.gunCooldown = PLAYER_TUNING.gunInterval;
      this.emit({ type: 'gun', from: copyVec(player.position), to: copyVec(gunTarget.position), color: 0xf4c66a });
      this.damageEnemy(gunTarget, PLAYER_TUNING.gunDamage);
    }

    if (!controls.fireMissile || player.missileCooldown > 0) return;
    this.state.metrics.missilesFired += 1;
    const missileTarget = this.pickTarget(PLAYER_TUNING.missileRange, PLAYER_TUNING.missileConeDegrees, 28);
    if (!missileTarget) {
      player.missileCooldown = 0.55;
      this.state.message = '无有效锁定 · 将同高度目标保持在机头前方';
      return;
    }

    player.missileCooldown = PLAYER_TUNING.missileCooldown;
    this.state.metrics.missileHits += 1;
    this.emit({ type: 'missile', from: copyVec(player.position), to: copyVec(missileTarget.position), color: 0x7ce8f2, text: 'FOX TWO' });
    this.damageEnemy(missileTarget, PLAYER_TUNING.missileDamage);
    this.state.message = `导弹命中 · ${this.enemyLabel(missileTarget.kind)}`;
  }

  private pickTarget(range: number, coneDegrees: number, altitudeTolerance: number): EnemyState | null {
    const player = this.state.player;
    const coneDot = Math.cos((coneDegrees * Math.PI) / 180);
    let best: EnemyState | null = null;
    let bestScore = -Infinity;

    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;
      const distance = distanceXZ(player.position, enemy.position);
      if (distance > range) continue;
      const altitudeDifference = Math.abs(player.position.y - enemy.position.y);
      if (altitudeDifference > altitudeTolerance) continue;
      if ((enemy.kind === 'aa' || enemy.kind === 'radar') && player.position.y > 18) continue;
      const alignment = forwardDot(player.heading, player.position, enemy.position);
      if (alignment < coneDot) continue;
      const score = alignment * 2 - distance / range;
      if (score > bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best;
  }

  private damageEnemy(enemy: EnemyState, amount: number): void {
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.hitFlash = 0.11;
    this.emit({ type: 'hit', from: copyVec(enemy.position), color: 0xffffff });
    if (enemy.hp > 0) return;

    enemy.alive = false;
    this.state.kills += 1;
    this.state.score += enemyScore(enemy.kind);
    this.state.message = `${this.enemyLabel(enemy.kind)}摧毁`;
    this.emit({ type: 'kill', from: copyVec(enemy.position), color: enemy.kind === 'ace' ? 0xffb35f : 0xff5a63, text: 'TARGET DOWN' });
    if (this.state.enemies.every((candidate) => !candidate.alive)) this.advancePhase();
  }

  private advancePhase(): void {
    const nextIndex = this.state.phaseIndex + 1;
    const phase = PHASES[nextIndex];
    if (!phase) {
      this.state.ended = true;
      this.state.outcome = 'SUCCESS';
      this.state.phase = 'COMPLETE';
      this.state.phaseLabel = '演习完成 / CLEAR';
      this.state.objective = '全部地空威胁已解除';
      this.state.threat = '空域安全';
      this.state.message = `空域清理完成 · ${Math.ceil(this.state.timeRemaining)} 秒剩余`;
      this.emit({ type: 'phase', from: copyVec(this.state.player.position), text: 'MISSION CLEAR' });
      return;
    }

    this.state.phaseIndex = nextIndex;
    this.state.phase = phase.id;
    this.state.phaseLabel = phase.label;
    this.state.objective = phase.objective;
    this.state.enemies = this.createWave(nextIndex);
    this.state.lockTargetId = null;
    this.state.message = phase.arrival;
    this.emit({ type: 'phase', from: copyVec(this.state.player.position), text: phase.label });
  }

  private damagePlayer(amount: number, from: Vec3State, label: string): void {
    const player = this.state.player;
    player.hp = Math.max(0, player.hp - amount);
    this.state.metrics.damageTaken += amount;
    this.state.message = label;
    this.emit({ type: amount >= 15 ? 'heavyDamage' : 'playerHit', from: copyVec(from), to: copyVec(player.position), color: 0xff334c, text: label });
    if (player.hp > 0) return;

    this.state.metrics.recoveries += 1;
    this.state.score = Math.max(0, this.state.score - 600);
    player.hp = player.maxHp;
    player.position = { x: -26, y: HIGH_ALTITUDE, z: -54 };
    player.heading = 0.15;
    player.altitudeMode = 'HIGH';
    this.state.message = '救援复位 · 已在高空重新接战';
  }

  private updateThreatLabel(): void {
    if (this.state.ended) return;
    const player = this.state.player;
    const aa = this.state.enemies.find((enemy) => enemy.kind === 'aa' && enemy.alive);
    const airThreat = this.state.enemies.find((enemy) => (enemy.kind === 'interceptor' || enemy.kind === 'ace') && enemy.alive);
    if (aa && aa.telegraph > 0) this.state.threat = '警告 · 地面火控锁定';
    else if (player.position.y < 18 && aa) this.state.threat = '低空暴露 · 防空阵地射界';
    else if (player.position.y > 22 && airThreat) this.state.threat = airThreat.kind === 'ace' ? '高空接战 · 王牌逼近' : '高空接战 · 截击机逼近';
    else if (player.position.y < 18 && this.state.enemies.some((enemy) => enemy.kind === 'radar' && enemy.alive)) this.state.threat = '低空突入 · 雷达站进入射程';
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
