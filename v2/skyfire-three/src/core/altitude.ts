/**
 * Visual altitude adapter for legacy entities that predate the 3D renderer.
 * The legacy player already stores altitude, while most enemy records only
 * contain a 2D combat-plane position. Stable profiles provide vertical
 * separation without changing legacy damage, movement, or progression.
 */
export interface AltitudeEntity {
  id?: number | string;
  kind?: string;
  altitude?: number;
}

const AIR_ALTITUDE: Readonly<Record<string, number>> = Object.freeze({
  fighter: 3400,
  gunner: 3700,
  bomber: 2850,
  interceptor: 4700,
  ace: 5400,
  gunship: 4200,
  kamikaze: 3900,
  drone: 5000,
  eye: 6100,
  king: 5700,
  transport: 2500,
  wingman: 3500
});

function finite(value: number | undefined): value is number {
  return Number.isFinite(value);
}

export function isGroundTargetKind(kind: string | undefined): boolean {
  return /aa|turret|radar|sam|bunker|ground|base|tower/i.test(String(kind || ''));
}

function stableOffset(id: number | string | undefined): number {
  if (typeof id === 'number' && Number.isFinite(id)) return ((Math.abs(id) % 5) - 2) * 120;
  if (typeof id !== 'string' || id.length === 0) return 0;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 5) - 2) * 120;
}

/** Return the altitude used by the 3D renderer and target marker. */
export function visualAltitude(entity: AltitudeEntity): number {
  if (finite(entity.altitude)) return Math.max(0, entity.altitude);
  if (isGroundTargetKind(entity.kind)) return 0;
  const kind = String(entity.kind || 'fighter').toLowerCase();
  return Math.max(0, (AIR_ALTITUDE[kind] ?? AIR_ALTITUDE.fighter) + stableOffset(entity.id));
}

