import { forwardFromHeading, shortestHeadingDelta } from './coordinates';
import type { WorldPoint3D } from './contracts';

export interface TargetingConfig {
  lockRange: number;
  lockCone: number;
  lockTime: number;
  gunRange: number;
  gunCone: number;
  altitudeWindow: number;
}

export const DEFAULT_TARGETING_CONFIG: Readonly<TargetingConfig> = Object.freeze({
  lockRange: 1000,
  lockCone: 0.75,
  lockTime: 0.85,
  gunRange: 820,
  gunCone: 0.5,
  altitudeWindow: Number.POSITIVE_INFINITY
});

export interface TargetableSnapshot {
  id?: number | string;
  position: WorldPoint3D;
  alive?: boolean;
  dead?: boolean;
  retreat?: boolean;
  enemy?: boolean;
  kind?: string;
}

export interface ShooterSnapshot {
  position: WorldPoint3D;
  heading: number;
}

export interface TargetEvaluation {
  target: TargetableSnapshot;
  range: number;
  angle: number;
  altitudeDelta: number;
  lockEligible: boolean;
  gunSolution: boolean;
  score: number;
}

function finite(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function active(target: TargetableSnapshot): boolean {
  return target.alive !== false && target.dead !== true && target.retreat !== true;
}

function altitudeWindow(config: TargetingConfig): number {
  return Math.max(0, finite(config.altitudeWindow, Number.POSITIVE_INFINITY));
}

/** Evaluate one target without mutating the shooter or target state. */
export function evaluateTarget(
  shooter: ShooterSnapshot,
  target: TargetableSnapshot,
  config: TargetingConfig = DEFAULT_TARGETING_CONFIG
): TargetEvaluation {
  const dx = target.position.x - shooter.position.x;
  const dz = target.position.z - shooter.position.z;
  const range = Math.hypot(dx, dz);
  const desired = range > Number.EPSILON ? Math.atan2(dz, dx) : shooter.heading;
  const angle = shortestHeadingDelta(shooter.heading, desired);
  const altitudeDelta = Math.abs(finite(target.position.y) - finite(shooter.position.y));
  const inAltitudeWindow = altitudeDelta <= altitudeWindow(config);
  const lockEligible = active(target) && range < Math.max(0, finite(config.lockRange)) &&
    Math.abs(angle) < Math.max(0, finite(config.lockCone)) && inAltitudeWindow;
  const gunSolution = active(target) && range <= Math.max(0, finite(config.gunRange)) &&
    Math.abs(angle) <= Math.max(0, finite(config.gunCone)) && inAltitudeWindow;
  return {
    target,
    range,
    angle,
    altitudeDelta,
    lockEligible,
    gunSolution,
    score: range * (1 + Math.abs(angle) * 2)
  };
}

/** Select the closest, most forward lockable target with deterministic ties. */
export function selectBestTarget(
  shooter: ShooterSnapshot,
  targets: readonly TargetableSnapshot[],
  config: TargetingConfig = DEFAULT_TARGETING_CONFIG
): TargetEvaluation | null {
  const eligible = targets
    .map((target) => evaluateTarget(shooter, target, config))
    .filter((evaluation) => evaluation.lockEligible)
    .sort((left, right) => {
      const scoreDelta = left.score - right.score;
      if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
      return String(left.target.id ?? '').localeCompare(String(right.target.id ?? ''));
    });
  return eligible[0] || null;
}

export function normalizedLockProgress(lock: number | undefined, lockTime: number): number {
  const duration = Math.max(Number.EPSILON, finite(lockTime, DEFAULT_TARGETING_CONFIG.lockTime));
  return Math.max(0, Math.min(1, finite(lock) / duration));
}

export function forwardAlignment(shooter: ShooterSnapshot, target: TargetableSnapshot): number {
  const forward = forwardFromHeading(shooter.heading);
  const dx = target.position.x - shooter.position.x;
  const dz = target.position.z - shooter.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= Number.EPSILON) return 1;
  return forward.x * (dx / distance) + forward.z * (dz / distance);
}
