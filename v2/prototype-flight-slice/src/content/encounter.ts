import type { EnemyKind, MissionPhase, Vec3State } from '../core/types';

export const ENCOUNTER_DURATION = 210;
export const LOW_ALTITUDE = 8;
export const HIGH_ALTITUDE = 34;
export const CLOUD_ALTITUDE = 20;
export const ARENA_RADIUS = 138;

export const PLAYER_TUNING = {
  cruiseSpeed: 44,
  climbSpeed: 35,
  diveSpeed: 54,
  turnRate: 1.38,
  altitudeRiseRate: 13,
  altitudeFallRate: 17,
  gunRange: 82,
  gunConeDegrees: 17,
  gunDamage: 8,
  gunInterval: 0.115,
  missileRange: 132,
  missileConeDegrees: 50,
  missileDamage: 56,
  missileCooldown: 3.2
} as const;

export interface EnemyPlacement {
  kind: EnemyKind;
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
    objective: '低空摧毁海岛雷达与防空阵地',
    arrival: '贴近海面。先切断雷达，再处理防空阵地。',
    enemies: [
      { kind: 'radar', position: { x: 34, y: 1.2, z: 44 } },
      { kind: 'aa', position: { x: -42, y: 1.2, z: 58 } }
    ]
  },
  {
    id: 'INTERCEPT',
    label: '阶段 02 / 高空拦截',
    objective: '拉升进入截击窗口，击落双机编队',
    arrival: '敌方双机高速抵近。拉升，夺取同高度射击窗口。',
    enemies: [
      { kind: 'interceptor', position: { x: -64, y: HIGH_ALTITUDE, z: 76 }, heading: Math.PI },
      { kind: 'interceptor', position: { x: 58, y: HIGH_ALTITUDE, z: 86 }, heading: Math.PI * 1.08 }
    ]
  },
  {
    id: 'COMBINED',
    label: '阶段 03 / 交叉猎场',
    objective: '在地空威胁之间切换，摧毁王牌与最后阵地',
    arrival: '地面火控重启，王牌正在俯冲。自行选择接战顺序。',
    enemies: [
      { kind: 'aa', position: { x: 54, y: 1.2, z: 24 } },
      { kind: 'ace', position: { x: -72, y: HIGH_ALTITUDE + 2, z: -12 }, heading: 0.35 }
    ]
  }
] as const;
