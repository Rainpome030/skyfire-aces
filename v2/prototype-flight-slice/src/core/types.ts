export type AltitudeMode = 'LOW' | 'HIGH';
export type EnemyKind = 'interceptor' | 'ace' | 'aa' | 'radar';
export type EnemyRole = 'stationary' | 'lead' | 'wing' | 'ace';
export type EnemyIntent = 'PATROL' | 'TRACKING' | 'ATTACKING' | 'RECOVERING';
export type MissionPhase = 'INFILTRATION' | 'INTERCEPT' | 'COMBINED' | 'COMPLETE' | 'FAILED';
export type MissionOutcome = 'ACTIVE' | 'SUCCESS' | 'TIMEOUT' | 'DEFEAT';
export type MissionGrade = 'S' | 'A' | 'B' | 'C' | '—';
export type ProjectileKind = 'tracer' | 'flak';
export type MissileQuality = 'LOCK' | 'PERFECT';
export type MissileStage = 'EJECT' | 'POWERED';
export type PlayerManeuver = 'CRUISE' | 'EXTEND' | 'BREAK';
export type TacticalManeuver =
  | 'NONE'
  | 'BOOM_ZOOM'
  | 'HIGH_YOYO'
  | 'LOW_YOYO'
  | 'DEFENSIVE_ROLL'
  | 'REVERSAL'
  | 'SCISSORS'
  | 'LEAD_TURN';

export interface Vec3State {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  position: Vec3State;
  heading: number;
  speed: number;
  verticalSpeed: number;
  bank: number;
  maneuver: PlayerManeuver;
  advantageTime: number;
  altitudeMode: AltitudeMode;
  hp: number;
  maxHp: number;
  gunCooldown: number;
  gunBurstRemaining: number;
  gunTrackProgress: number;
  gunRakeCooldown: number;
  missileCooldown: number;
  missilesRemaining: number;
  invulnerability: number;
  alive: boolean;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  role: EnemyRole;
  intent: EnemyIntent;
  wave: number;
  position: Vec3State;
  heading: number;
  verticalSpeed: number;
  targetAltitude: number;
  bank: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  fireCooldown: number;
  telegraph: number;
  hitFlash: number;
  stagger: number;
  acePhase: 1 | 2;
  attackTarget: Vec3State | null;
  attackHeading: number;
  attackCommitment: number;
  closestApproach: number;
  breakResponse: number;
  overshootResolved: boolean;
}

export interface EnemyProjectileState {
  id: number;
  volleyId: number;
  ownerId: number;
  kind: ProjectileKind;
  position: Vec3State;
  previousPosition: Vec3State;
  velocity: Vec3State;
  damage: number;
  radius: number;
  life: number;
  nearMiss: boolean;
  heavy: boolean;
}

export interface PlayerMissileState {
  id: number;
  targetId: number;
  position: Vec3State;
  previousPosition: Vec3State;
  velocity: Vec3State;
  speed: number;
  turnRate: number;
  damage: number;
  radius: number;
  life: number;
  age: number;
  side: -1 | 1;
  quality: MissileQuality;
  stage: MissileStage;
}

export type CombatEventType =
  | 'gun'
  | 'missile'
  | 'missileImpact'
  | 'missileMiss'
  | 'perfect'
  | 'gunRake'
  | 'hit'
  | 'kill'
  | 'playerHit'
  | 'heavyDamage'
  | 'graze'
  | 'warning'
  | 'altitude'
  | 'phase'
  | 'lock'
  | 'enemyShot'
  | 'recovery'
  | 'overshoot'
  | 'maneuver';

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
  missileMisses: number;
  perfectShots: number;
  gunRakes: number;
  damageTaken: number;
  recoveries: number;
  successfulEvasions: number;
  overshoots: number;
  maneuverCounts: Record<TacticalManeuver, number>;
  phaseTimes: number[];
  infiltrationRoute: 'UNSET' | 'RADAR_FIRST' | 'AA_FIRST';
}

export interface SliceState {
  elapsed: number;
  timeRemaining: number;
  score: number;
  kills: number;
  ended: boolean;
  outcome: MissionOutcome;
  grade: MissionGrade;
  phase: MissionPhase;
  phaseIndex: number;
  phaseLabel: string;
  objective: string;
  phaseTransition: number;
  gunTargetId: number | null;
  sensorTargetId: number | null;
  lockTargetId: number | null;
  lockProgress: number;
  lockReady: boolean;
  perfectProgress: number;
  lockPerfect: boolean;
  lockAngleDegrees: number;
  targetLayerMatch: boolean;
  activeTactic: TacticalManeuver;
  activeTacticTime: number;
  lastTactic: TacticalManeuver;
  tacticChain: number;
  fireBuffer: number;
  recoveryTokens: number;
  threat: string;
  message: string;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: EnemyProjectileState[];
  playerMissiles: PlayerMissileState[];
  metrics: MissionMetrics;
  events: CombatEvent[];
}

export interface ControlFrame {
  steer: number;
  energy: number;
  toggleAltitude: boolean;
  fireMissile: boolean;
  reset: boolean;
}
