import type { AltitudeMode, EnemyIntent, EnemyKind, TacticalManeuver } from './types';

export interface ManeuverTargetContext {
  id: number;
  kind: EnemyKind;
  intent: EnemyIntent;
  distance: number;
  angleDegrees: number;
  altitude: number;
  noseOn: number;
}

export interface ManeuverObservation {
  time: number;
  altitudeMode: AltitudeMode;
  altitudeToggled: boolean;
  playerAltitude: number;
  speed: number;
  steer: number;
  energy: number;
  target: ManeuverTargetContext | null;
  damagedKind: EnemyKind | null;
  overshootEnemyId: number | null;
}

export interface AltitudeLeg {
  from: AltitudeMode;
  to: AltitudeMode;
  startedAt: number;
  targetId: number | null;
  targetKind: EnemyKind | null;
  startAngle: number;
  startDistance: number;
  startAltitudeDelta: number;
  minAngle: number;
  minDistance: number;
  maxSpeed: number;
  groundDamage: boolean;
}

interface LeadTurnWindow {
  targetId: number;
  startedAt: number;
  closestDistance: number;
}

export interface ManeuverTrackerState {
  lastAltitudeMode: AltitudeMode;
  altitudeLeg: AltitudeLeg | null;
  lastSteerSign: -1 | 0 | 1;
  steeringReversals: number[];
  overshootAt: number;
  overshootEnemyId: number | null;
  defensiveRollArmedAt: number;
  leadTurn: LeadTurnWindow | null;
  lastRecognizedAt: Partial<Record<TacticalManeuver, number>>;
}

export interface ManeuverTrackerResult {
  state: ManeuverTrackerState;
  recognized: TacticalManeuver[];
}

const GROUND_KINDS = new Set<EnemyKind>(['aa', 'radar']);

export function createManeuverTrackerState(altitudeMode: AltitudeMode): ManeuverTrackerState {
  return {
    lastAltitudeMode: altitudeMode,
    altitudeLeg: null,
    lastSteerSign: 0,
    steeringReversals: [],
    overshootAt: -Infinity,
    overshootEnemyId: null,
    defensiveRollArmedAt: -Infinity,
    leadTurn: null,
    lastRecognizedAt: {}
  };
}

function canRecognize(state: ManeuverTrackerState, maneuver: TacticalManeuver, time: number): boolean {
  return time - (state.lastRecognizedAt[maneuver] ?? -Infinity) >= 3.2;
}

function markRecognized(
  state: ManeuverTrackerState,
  recognized: TacticalManeuver[],
  maneuver: TacticalManeuver,
  time: number
): void {
  if (!canRecognize(state, maneuver, time)) return;
  state.lastRecognizedAt[maneuver] = time;
  recognized.push(maneuver);
}

function startAltitudeLeg(observation: ManeuverObservation, from: AltitudeMode): AltitudeLeg {
  const target = observation.target;
  return {
    from,
    to: observation.altitudeMode,
    startedAt: observation.time,
    targetId: target?.id ?? null,
    targetKind: target?.kind ?? null,
    startAngle: target?.angleDegrees ?? 180,
    startDistance: target?.distance ?? Infinity,
    startAltitudeDelta: target ? target.altitude - observation.playerAltitude : 0,
    minAngle: target?.angleDegrees ?? 180,
    minDistance: target?.distance ?? Infinity,
    maxSpeed: observation.speed,
    groundDamage: false
  };
}

function finishAltitudeLeg(
  state: ManeuverTrackerState,
  observation: ManeuverObservation,
  recognized: TacticalManeuver[]
): void {
  const leg = state.altitudeLeg;
  if (!leg || observation.time - leg.startedAt > 7.2) return;
  const target = observation.target;
  const sameTarget = target?.id === leg.targetId;
  const geometryImproved = Boolean(target && sameTarget && (
    target.angleDegrees <= Math.min(38, leg.startAngle - 7)
    || target.distance <= leg.startDistance - 10
    || leg.minAngle <= 24
  ));

  if (leg.to === 'LOW' && leg.groundDamage && leg.maxSpeed >= 46) {
    markRecognized(state, recognized, 'BOOM_ZOOM', observation.time);
    return;
  }
  if (!sameTarget || !target || GROUND_KINDS.has(target.kind) || !geometryImproved) return;
  if (leg.to === 'HIGH' && leg.startAltitudeDelta > 3) {
    markRecognized(state, recognized, 'HIGH_YOYO', observation.time);
  } else if (leg.to === 'LOW' && leg.startAltitudeDelta < -3) {
    markRecognized(state, recognized, 'LOW_YOYO', observation.time);
  }
}

export function advanceManeuverTracker(
  previous: ManeuverTrackerState,
  observation: ManeuverObservation
): ManeuverTrackerResult {
  const state: ManeuverTrackerState = {
    ...previous,
    altitudeLeg: previous.altitudeLeg ? { ...previous.altitudeLeg } : null,
    steeringReversals: [...previous.steeringReversals],
    leadTurn: previous.leadTurn ? { ...previous.leadTurn } : null,
    lastRecognizedAt: { ...previous.lastRecognizedAt }
  };
  const recognized: TacticalManeuver[] = [];
  const target = observation.target;

  if (state.altitudeLeg) {
    state.altitudeLeg.maxSpeed = Math.max(state.altitudeLeg.maxSpeed, observation.speed);
    if (target?.id === state.altitudeLeg.targetId) {
      state.altitudeLeg.minAngle = Math.min(state.altitudeLeg.minAngle, target.angleDegrees);
      state.altitudeLeg.minDistance = Math.min(state.altitudeLeg.minDistance, target.distance);
    }
    if (observation.damagedKind && GROUND_KINDS.has(observation.damagedKind)) state.altitudeLeg.groundDamage = true;
    if (observation.time - state.altitudeLeg.startedAt > 7.2) state.altitudeLeg = null;
  }

  if (observation.altitudeToggled) {
    finishAltitudeLeg(state, observation, recognized);
    const from = state.lastAltitudeMode;
    state.altitudeLeg = startAltitudeLeg(observation, from);
    if (
      target
      && !GROUND_KINDS.has(target.kind)
      && (target.intent === 'TRACKING' || target.intent === 'ATTACKING')
      && observation.energy < -0.16
      && Math.abs(observation.steer) >= 0.42
    ) state.defensiveRollArmedAt = observation.time;
    state.lastAltitudeMode = observation.altitudeMode;
  }

  if (observation.overshootEnemyId !== null) {
    state.overshootAt = observation.time;
    state.overshootEnemyId = observation.overshootEnemyId;
    state.steeringReversals = [];
    if (observation.time - state.defensiveRollArmedAt <= 2.8) {
      markRecognized(state, recognized, 'DEFENSIVE_ROLL', observation.time);
    }
  }

  const steerSign: -1 | 0 | 1 = Math.abs(observation.steer) < 0.38 ? 0 : observation.steer > 0 ? 1 : -1;
  if (steerSign !== 0 && state.lastSteerSign !== 0 && steerSign !== state.lastSteerSign) {
    state.steeringReversals.push(observation.time);
    state.steeringReversals = state.steeringReversals.filter((time) => observation.time - time <= 5.4);
    if (observation.time - state.overshootAt <= 2.2) {
      markRecognized(state, recognized, 'REVERSAL', observation.time);
    }
    const postOvershootReversals = state.steeringReversals.filter((time) => time >= state.overshootAt);
    if (
      observation.time - state.overshootAt <= 5.4
      && postOvershootReversals.length >= 2
      && target
      && !GROUND_KINDS.has(target.kind)
      && target.distance <= 76
    ) markRecognized(state, recognized, 'SCISSORS', observation.time);
  }
  if (steerSign !== 0) state.lastSteerSign = steerSign;

  const leadCandidate = target
    && !GROUND_KINDS.has(target.kind)
    && target.distance >= 32
    && target.distance <= 92
    && target.noseOn >= 0.42
    && Math.abs(observation.steer) >= 0.4;
  if (leadCandidate && (!state.leadTurn || state.leadTurn.targetId !== target.id)) {
    state.leadTurn = { targetId: target.id, startedAt: observation.time, closestDistance: target.distance };
  }
  if (state.leadTurn) {
    if (!target || target.id !== state.leadTurn.targetId || observation.time - state.leadTurn.startedAt > 5) {
      state.leadTurn = null;
    } else {
      state.leadTurn.closestDistance = Math.min(state.leadTurn.closestDistance, target.distance);
      if (
        state.leadTurn.closestDistance <= 34
        && target.distance >= state.leadTurn.closestDistance + 4
        && target.angleDegrees <= 52
      ) {
        markRecognized(state, recognized, 'LEAD_TURN', observation.time);
        state.leadTurn = null;
      }
    }
  }

  return { state, recognized };
}
