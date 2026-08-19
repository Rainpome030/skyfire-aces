/**
 * Read-only view of the legacy simulation consumed by the Three.js renderer.
 *
 * Coordinate contract:
 * - `x` maps to Three.js +X.
 * - `y` maps to Three.js +Z (screen-down in the world-up camera).
 * - `altitude` maps to Three.js +Y.
 * - heading 0 points along +X; positive heading turns clockwise from above.
 */
export type LegacyEntityId = number | string;

export interface LegacyPointSnapshot {
  x: number;
  y: number;
}

export interface LegacyEntitySnapshot extends LegacyPointSnapshot {
  id?: LegacyEntityId;
  kind?: string;
  heading?: number;
  speed?: number;
  bank?: number;
  altitude?: number;
  r?: number;
  hp?: number;
  maxHp?: number;
  alive?: boolean;
  dead?: boolean;
  enemy?: boolean;
  color?: string;
}

export interface LegacyPlayerSnapshot extends LegacyEntitySnapshot {
  id?: LegacyEntityId;
  heading: number;
  speed: number;
  bank: number;
  altitude: number;
  alive: boolean;
  lock?: number;
  targetId?: LegacyEntityId | null;
  target?: LegacyEntitySnapshot | null;
}

export interface LegacyProjectileSnapshot extends LegacyPointSnapshot {
  id?: LegacyEntityId;
  heading?: number;
  altitude?: number;
  vx?: number;
  vy?: number;
  life?: number;
  fromPlayer?: boolean;
  enemy?: boolean;
  targetId?: LegacyEntityId | null;
}

export interface LegacyParticleSnapshot extends LegacyPointSnapshot {
  id?: LegacyEntityId;
  type?: string;
  altitude?: number;
  life?: number;
  maxLife?: number;
  size?: number;
  r?: number;
  alpha?: number;
  color?: string;
}

export interface LegacyIslandSnapshot {
  cx?: number;
  cy?: number;
  rad?: number;
  city?: boolean;
  pts?: LegacyPointSnapshot[];
}

export interface LegacyCloudSnapshot extends LegacyPointSnapshot {
  r?: number;
  alpha?: number;
  seed?: number;
}

export interface LegacyWorldThemeSnapshot {
  water?: string;
  sky?: string;
  haze?: string;
}

export interface LegacyWorldSnapshot {
  W: number;
  H: number;
  seed?: number;
  islands?: LegacyIslandSnapshot[];
  clouds?: LegacyCloudSnapshot[];
  theme?: LegacyWorldThemeSnapshot | null;
}

export interface LegacyCameraSnapshot {
  x: number;
  y: number;
  zoom?: number;
  shake?: number;
  shakeX?: number;
  shakeY?: number;
}

export interface LegacyTargetingSnapshot {
  lock: number;
  lockTime: number;
  lockRange: number;
  lockCone: number;
  gunRange: number;
  gunCone: number;
  altitudeWindow: number;
}

export interface LegacySnapshot {
  player: LegacyPlayerSnapshot;
  enemies: LegacyEntitySnapshot[];
  allies: LegacyEntitySnapshot[];
  bullets: LegacyProjectileSnapshot[];
  missiles: LegacyProjectileSnapshot[];
  particles: LegacyParticleSnapshot[];
  world: LegacyWorldSnapshot;
  camera: LegacyCameraSnapshot;
  cameraMode?: 'world-up' | 'heading-up';
  gameTime: number;
  lockTargetId?: LegacyEntityId | null;
  tacticalVisible?: boolean;
  combatMode?: 'auto-gun-active-missile' | 'manual-gun-active-missile';
  targeting?: LegacyTargetingSnapshot;
}

export interface RenderViewport {
  width: number;
  height: number;
  dpr?: number;
}
