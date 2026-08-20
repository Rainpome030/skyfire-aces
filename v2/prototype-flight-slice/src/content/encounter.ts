import type { EnemyKind, EnemyRole, MissionPhase, Vec3State } from '../core/types';

export const ENCOUNTER_DURATION = 210;
export const LOW_ALTITUDE = 8;
export const HIGH_ALTITUDE = 34;
export const CLOUD_ALTITUDE = 20;
export const AIR_COMBAT_MIN_ALTITUDE = 14;
export const AIR_COMBAT_MAX_ALTITUDE = 38;
export const ARENA_RADIUS = 138;

export const PLAYER_TUNING = {
  minSpeed: 27,
  cornerSpeed: 35,
  cruiseSpeed: 44,
  boostSpeed: 60,
  climbSpeed: 35,
  diveSpeed: 54,
  boostAcceleration: 18,
  brakeDeceleration: 28,
  neutralAcceleration: 8,
  turnDrag: 6.5,
  turnRate: 1.38,
  cornerTurnMultiplier: 1.27,
  highSpeedTurnMultiplier: 0.76,
  lowSpeedTurnMultiplier: 0.78,
  breakTurnMultiplier: 1.12,
  advantageSeconds: 2.6,
  advantageLockMultiplier: 0.7,
  advantageGunMultiplier: 1.45,
  altitudeRiseRate: 13,
  altitudeFallRate: 17,
  altitudeRiseAcceleration: 34,
  altitudeFallAcceleration: 44,
  altitudeBrakeAcceleration: 48,
  gunRange: 82,
  gunConeDegrees: 15,
  gunDamage: 5,
  gunInterval: 0.055,
  gunBurstSize: 5,
  gunBurstRecovery: 0.28,
  gunRakeSeconds: 0.35,
  gunRakeBonus: 8,
  gunRakeCooldown: 0.9,
  missileRange: 132,
  sensorRange: 154,
  softAcquireDegrees: 100,
  lockConeDegrees: 75,
  perfectConeDegrees: 25,
  lockCloseSeconds: 0.55,
  lockMediumSeconds: 0.8,
  lockWideSeconds: 1.2,
  perfectDwellSeconds: 0.45,
  targetRetentionSeconds: 0.45,
  fireBufferSeconds: 0.18,
  missileDamage: 72,
  missilePerfectDamage: 94,
  missileCooldown: 1.6,
  missileSpeed: 148,
  missileTurnRate: 3.4,
  missilePerfectTurnRate: 5.2,
  missileLife: 2.2,
  missileCapacity: 4,
  recoveryTokens: 1
} as const;

export const ENEMY_TUNING = {
  radarLinkedAaRange: 110,
  radarLinkedAaTelegraph: 0.78,
  isolatedAaRange: 88,
  isolatedAaTelegraph: 1.3,
  flakFlightSeconds: 0.72,
  interceptorTelegraph: 0.48,
  aceTelegraphPhaseOne: 0.42,
  aceTelegraphPhaseTwo: 0.3,
  tracerSpeed: 118,
  attackCommitmentSeconds: 0.82,
  aceAttackCommitmentSeconds: 0.68,
  committedTurnRate: 0.28,
  interceptorVerticalRate: 10,
  aceVerticalRate: 14,
  airWeaponAltitudeTolerance: 13,
  overshootRange: 44,
  overshootBreakSeconds: 0.18
} as const;

export interface EnemyPlacement {
  kind: EnemyKind;
  role?: EnemyRole;
  position: Vec3State;
  heading?: number;
}

export interface PhaseDefinition {
  id: Exclude<MissionPhase, 'COMPLETE' | 'FAILED'>;
  label: string;
  objective: string;
  arrival: string;
  enemies: readonly EnemyPlacement[];
}

export const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'INFILTRATION',
    label: '阶段 01 / 低空突入',
    objective: '切断雷达链路，或冒险强攻防空阵地',
    arrival: '雷达正为防空炮提供快速解算。可先爬升蓄能，再俯冲攻击并拉起。',
    enemies: [
      { kind: 'radar', role: 'stationary', position: { x: 34, y: 1.2, z: 44 } },
      { kind: 'aa', role: 'stationary', position: { x: -42, y: 1.2, z: 58 } }
    ]
  },
  {
    id: 'INTERCEPT',
    label: '阶段 02 / 错层拦截',
    objective: '拆开高低双机，用滚转、反转或抢先转弯夺取射击窗口',
    arrival: '长机占高位、僚机开始下沉。读攻击线，用能量与高度迫使一架冲前。',
    enemies: [
      { kind: 'interceptor', role: 'lead', position: { x: -64, y: 30, z: 76 }, heading: Math.PI },
      { kind: 'interceptor', role: 'wing', position: { x: 58, y: HIGH_ALTITUDE, z: 86 }, heading: Math.PI * 1.08 }
    ]
  },
  {
    id: 'COMBINED',
    label: '阶段 03 / 交叉猎场',
    objective: '在地空交叉火力间选择目标，用悠悠与剪刀机动击破王牌',
    arrival: '低空有防空炮，王牌会纵向追击。没有永久安全层，用三维航迹换取角度。',
    enemies: [
      { kind: 'aa', role: 'stationary', position: { x: 54, y: 1.2, z: 24 } },
      { kind: 'ace', role: 'ace', position: { x: -72, y: 30, z: -12 }, heading: 0.35 }
    ]
  }
] as const;
