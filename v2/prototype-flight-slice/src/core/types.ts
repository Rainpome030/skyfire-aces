export type AltitudeMode = 'LOW' | 'HIGH';
export type EnemyKind = 'interceptor' | 'ace' | 'aa' | 'radar';
export type MissionPhase = 'INFILTRATION' | 'INTERCEPT' | 'COMBINED' | 'COMPLETE' | 'FAILED';
export type MissionOutcome = 'ACTIVE' | 'SUCCESS' | 'TIMEOUT';

export interface Vec3State {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  position: Vec3State;
  heading: number;
  speed: number;
  bank: number;
  altitudeMode: AltitudeMode;
  hp: number;
  maxHp: number;
  gunCooldown: number;
  missileCooldown: number;
  alive: boolean;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  wave: number;
  position: Vec3State;
  heading: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  fireCooldown: number;
  telegraph: number;
  hitFlash: number;
}

export type CombatEventType =
  | 'gun'
  | 'missile'
  | 'hit'
  | 'kill'
  | 'playerHit'
  | 'heavyDamage'
  | 'graze'
  | 'warning'
  | 'altitude'
  | 'phase';

export interface CombatEvent {
  id: number;
  type: CombatEventType;
  from?: Vec3State;
  to?: Vec3State;
  color?: number;
  text?: string;
}

export interface MissionMetrics {
  altitudeSwitches: number;
  missilesFired: number;
  missileHits: number;
  damageTaken: number;
  recoveries: number;
}

export interface SliceState {
  elapsed: number;
  timeRemaining: number;
  score: number;
  kills: number;
  ended: boolean;
  outcome: MissionOutcome;
  phase: MissionPhase;
  phaseIndex: number;
  phaseLabel: string;
  objective: string;
  lockTargetId: number | null;
  threat: string;
  message: string;
  player: PlayerState;
  enemies: EnemyState[];
  metrics: MissionMetrics;
  events: CombatEvent[];
}

export interface ControlFrame {
  steer: number;
  toggleAltitude: boolean;
  fireMissile: boolean;
  reset: boolean;
}
