import { HIGH_ALTITUDE, LOW_ALTITUDE } from '../content/encounter';
import type { CombatEvent, SliceState, TacticalManeuver } from '../core/types';

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export class SliceHud {
  private readonly timer = required<HTMLElement>('#timer');
  private readonly score = required<HTMLElement>('#score');
  private readonly phaseIndex = required<HTMLElement>('#phase-index');
  private readonly phaseLabel = required<HTMLElement>('#phase-label');
  private readonly objective = required<HTMLElement>('#objective');
  private readonly phasePips = [...document.querySelectorAll<HTMLElement>('.phase-pips i')];
  private readonly altitudeMode = required<HTMLElement>('#altitude-mode');
  private readonly altitudeFill = required<HTMLElement>('#altitude-fill');
  private readonly altitude = required<HTMLElement>('#altitude');
  private readonly speed = required<HTMLElement>('#speed');
  private readonly maneuverState = required<HTMLElement>('#maneuver-state');
  private readonly advantageStatus = required<HTMLElement>('#advantage-status');
  private readonly tacticStatus = required<HTMLElement>('#tactic-status');
  private readonly hp = required<HTMLElement>('#hp');
  private readonly recoveryStatus = required<HTMLElement>('#recovery-status');
  private readonly threat = required<HTMLElement>('#threat-banner');
  private readonly toast = required<HTMLElement>('#combat-toast');
  private readonly targetCue = required<HTMLElement>('#target-cue');
  private readonly targetArrow = required<HTMLElement>('#target-arrow');
  private readonly targetName = required<HTMLElement>('#target-name');
  private readonly targetRange = required<HTMLElement>('#target-range');
  private readonly targetLayer = required<HTMLElement>('#target-layer');
  private readonly altitudeControl = required<HTMLButtonElement>('#altitude-control');
  private readonly altitudeControlLabel = required<HTMLElement>('#altitude-control-label');
  private readonly missileControl = required<HTMLButtonElement>('#missile-control');
  private readonly missileControlLabel = required<HTMLElement>('#missile-control-label');
  private readonly missileControlMeta = required<HTMLElement>('#missile-control-meta');
  private readonly damageFlash = required<HTMLElement>('#damage-flash');
  private readonly summaryOverlay = required<HTMLElement>('#summary-overlay');
  private lastMessage = '';
  private toastTimer = 0;

  update(state: SliceState, dt: number): void {
    const seconds = Math.ceil(state.timeRemaining);
    this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.score.textContent = String(state.score).padStart(5, '0');
    this.phaseIndex.textContent = String(Math.min(3, state.phaseIndex + 1)).padStart(2, '0');
    this.phaseLabel.textContent = state.phaseLabel;
    this.objective.textContent = state.objective;
    for (const [index, pip] of this.phasePips.entries()) {
      pip.classList.toggle('active', index === state.phaseIndex && !state.ended);
      pip.classList.toggle('complete', index < state.phaseIndex || state.outcome === 'SUCCESS');
    }

    const high = state.player.altitudeMode === 'HIGH';
    this.altitudeMode.textContent = high ? '高空' : '低空';
    this.altitudeMode.dataset.mode = state.player.altitudeMode;
    const altitudeProgress = (state.player.position.y - LOW_ALTITUDE) / (HIGH_ALTITUDE - LOW_ALTITUDE);
    this.altitudeFill.style.width = `${Math.max(4, Math.min(100, altitudeProgress * 100))}%`;
    this.altitude.textContent = String(Math.round(state.player.position.y)).padStart(3, '0');
    this.speed.textContent = String(Math.round(state.player.speed)).padStart(3, '0');
    this.speed.dataset.maneuver = state.player.maneuver;
    this.maneuverState.dataset.maneuver = state.player.maneuver;
    this.maneuverState.textContent = state.player.maneuver === 'EXTEND'
      ? 'EXTEND · 加力'
      : state.player.maneuver === 'BREAK'
        ? 'BREAK · 急转'
        : 'CRUISE · 自动';
    this.advantageStatus.classList.toggle('hidden', state.player.advantageTime <= 0);
    this.advantageStatus.textContent = `ADVANTAGE ${state.player.advantageTime.toFixed(1)}`;
    this.tacticStatus.dataset.tactic = state.activeTactic;
    const tacticName = this.tacticLabel(state.activeTactic !== 'NONE' ? state.activeTactic : state.lastTactic);
    const tacticLabel = this.tacticStatus.querySelector<HTMLElement>('b');
    const tacticChain = this.tacticStatus.querySelector<HTMLElement>('em');
    if (tacticLabel) tacticLabel.textContent = state.activeTactic !== 'NONE'
      ? tacticName
      : state.lastTactic !== 'NONE'
        ? `LAST · ${tacticName}`
        : '等待有效机动';
    if (tacticChain) tacticChain.textContent = state.tacticChain > 1 ? `×${state.tacticChain}` : '';
    this.hp.textContent = String(Math.round(state.player.hp)).padStart(3, '0');
    this.hp.classList.toggle('critical', state.player.hp <= 35);
    this.recoveryStatus.textContent = `RCV ${state.recoveryTokens}`;
    this.recoveryStatus.classList.toggle('empty', state.recoveryTokens === 0);
    this.threat.textContent = state.ended
      ? state.outcome === 'SUCCESS' ? '空域安全 · 演习完成' : state.outcome === 'DEFEAT' ? '战机损失 · 演习失败' : '时限耗尽 · 演习终止'
      : state.threat;
    this.threat.classList.toggle('danger', state.threat.includes('警告') || state.threat.includes('暴露') || state.threat.includes('来袭'));
    this.altitudeControlLabel.textContent = high ? '俯冲' : '拉升';
    this.altitudeControl.setAttribute('aria-label', high ? '俯冲至低空' : '拉升至高空');
    const sensorTarget = state.sensorTargetId === null
      ? null
      : state.enemies.find((enemy) => enemy.id === state.sensorTargetId && enemy.alive) ?? null;
    const crossLayer = Boolean(sensorTarget && !state.targetLayerMatch && state.lockTargetId === null);
    const missileState = state.player.missilesRemaining <= 0
      ? 'empty'
      : state.player.missileCooldown > 0
        ? 'cooldown'
        : state.lockPerfect
          ? 'perfect'
          : state.lockReady
          ? 'ready'
          : state.lockTargetId !== null
            ? state.lockAngleDegrees > 75 ? 'soft' : 'tracking'
            : crossLayer
              ? 'cross-layer'
            : 'searching';
    this.missileControl.dataset.state = missileState;
    this.missileControl.disabled = state.player.missilesRemaining <= 0;
    this.missileControlLabel.textContent = missileState === 'empty'
      ? '耗尽'
      : missileState === 'cooldown'
        ? state.player.missileCooldown.toFixed(1)
        : missileState === 'perfect'
          ? '完美'
        : missileState === 'ready'
          ? 'LOCK'
          : missileState === 'soft'
            ? '捕获'
          : missileState === 'tracking'
            ? `${Math.round(state.lockProgress * 100)}%`
            : missileState === 'cross-layer'
              ? '换高度'
            : '搜索';
    const missileInstruction = state.lockPerfect
      ? 'PERFECT 高杀伤'
      : state.lockReady
        ? '可发射，继续对准可强化'
        : missileState === 'soft'
          ? '转入 ±75° 锁定区'
          : missileState === 'cross-layer'
            ? 'CHANGE ALT'
            : state.lockTargetId !== null
              ? '保持火控解算'
              : sensorTarget
                ? '转向雷达接触'
                : '360° 雷达搜索';
    this.missileControlMeta.textContent = `${state.player.missilesRemaining} 枚 · ${missileInstruction}`;
    this.missileControl.setAttribute('aria-label', `导弹${this.missileControlLabel.textContent}，剩余${state.player.missilesRemaining}枚`);
    this.updateTargetCue(state);

    if (state.message && state.message !== this.lastMessage) {
      this.lastMessage = state.message;
      this.toast.textContent = state.message;
      this.toast.classList.add('visible');
      this.toastTimer = state.message.includes('阶段') ? 2.8 : 2.15;
    }
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer <= 0) this.toast.classList.remove('visible');
  }

  handleEvents(events: CombatEvent[]): void {
    const heavy = events.some((event) => event.type === 'heavyDamage');
    if (heavy || events.some((event) => event.type === 'playerHit')) {
      this.damageFlash.classList.toggle('heavy', heavy);
      this.retrigger(this.damageFlash);
    }
  }

  showSummary(state: SliceState): void {
    required<HTMLElement>('#summary-title').textContent = state.outcome === 'SUCCESS' ? '演习完成' : state.outcome === 'DEFEAT' ? '战机损失' : '演习超时';
    required<HTMLElement>('#summary-subtitle').textContent = state.outcome === 'SUCCESS' ? '地空威胁均已解除' : state.outcome === 'DEFEAT' ? '救援机会耗尽，战机失去作战能力' : '仍有目标留在演习空域';
    required<HTMLElement>('#summary-grade').textContent = state.grade;
    required<HTMLElement>('#summary-score').textContent = String(state.score).padStart(5, '0');
    required<HTMLElement>('#summary-kills').textContent = String(state.kills);
    required<HTMLElement>('#summary-switches').textContent = String(state.metrics.altitudeSwitches);
    required<HTMLElement>('#summary-missiles').textContent = `${state.metrics.missileHits}/${state.metrics.missilesFired}`;
    required<HTMLElement>('#summary-damage').textContent = String(state.metrics.damageTaken);
    required<HTMLElement>('#summary-recoveries').textContent = String(state.metrics.recoveries);
    required<HTMLElement>('#summary-evasions').textContent = String(state.metrics.successfulEvasions);
    required<HTMLElement>('#summary-overshoots').textContent = String(state.metrics.overshoots);
    const tactics = (Object.entries(state.metrics.maneuverCounts) as Array<[TacticalManeuver, number]>)
      .filter(([maneuver, count]) => maneuver !== 'NONE' && count > 0)
      .map(([maneuver, count]) => `${this.tacticLabel(maneuver)} ×${count}`);
    required<HTMLElement>('#summary-tactics').textContent = tactics.length > 0 ? tactics.join(' · ') : '尚未形成有效机动';
    required<HTMLElement>('#summary-route').textContent = state.metrics.infiltrationRoute === 'RADAR_FIRST'
      ? '断网'
      : state.metrics.infiltrationRoute === 'AA_FIRST'
        ? '强攻'
        : '—';
    required<HTMLElement>('#summary-time').textContent = `${Math.ceil(state.timeRemaining)}s`;
    this.summaryOverlay.classList.remove('hidden');
  }

  hideSummary(): void {
    this.summaryOverlay.classList.add('hidden');
    this.lastMessage = '';
  }

  private retrigger(element: HTMLElement): void {
    element.classList.remove('active');
    void element.offsetWidth;
    element.classList.add('active');
  }

  private updateTargetCue(state: SliceState): void {
    const target = state.sensorTargetId === null
      ? null
      : state.enemies.find((enemy) => enemy.id === state.sensorTargetId && enemy.alive) ?? null;
    const distance = target
      ? Math.hypot(
        target.position.x - state.player.position.x,
        target.position.z - state.player.position.z,
        (target.position.y - state.player.position.y) * (target.kind === 'aa' || target.kind === 'radar' ? 0 : 0.72)
      )
      : Infinity;
    const weaponTarget = Boolean(target && target.id === state.lockTargetId);
    const crossLayer = Boolean(target && !state.targetLayerMatch);
    this.targetCue.classList.toggle('hidden', !target || state.ended);
    this.targetCue.classList.toggle('locked', weaponTarget && state.lockReady);
    this.targetCue.classList.toggle('perfect', weaponTarget && state.lockPerfect);
    this.targetCue.classList.toggle('contact', Boolean(target && !weaponTarget));
    this.targetCue.classList.toggle('cross-layer', crossLayer);
    if (!target) return;
    const dx = target.position.x - state.player.position.x;
    const dz = target.position.z - state.player.position.z;
    // Camera A views the map from world -Z toward +Z, so world +X projects left.
    this.targetArrow.style.transform = `rotate(${Math.atan2(-dx, dz)}rad)`;
    const name = target.kind === 'radar'
      ? '雷达站'
      : target.kind === 'aa'
        ? '防空阵地'
        : target.kind === 'ace'
          ? '王牌截击机'
          : '截击机';
    const altitudeDelta = target.position.y - state.player.position.y;
    this.targetName.textContent = crossLayer ? `${name} · ALT ${altitudeDelta > 0 ? '+' : ''}${Math.round(altitudeDelta)}` : name;
    this.targetRange.textContent = String(Math.round(distance)).padStart(3, '0');
    this.targetLayer.textContent = target.kind === 'aa' || target.kind === 'radar'
      ? 'GROUND'
      : altitudeDelta > 4
        ? `ABOVE ${Math.round(target.position.y)}`
        : altitudeDelta < -4
          ? `BELOW ${Math.round(target.position.y)}`
          : `LEVEL ${Math.round(target.position.y)}`;
    const status = state.lockPerfect ? '完美解算' : state.lockReady ? '锁定' : weaponTarget ? '火控捕获' : '雷达接触';
    this.targetCue.setAttribute('aria-label', `${status}目标${name}，距离${Math.round(distance)}米${crossLayer ? '，需要切换高度' : ''}`);
  }

  private tacticLabel(maneuver: TacticalManeuver): string {
    if (maneuver === 'BOOM_ZOOM') return '俯冲突击';
    if (maneuver === 'HIGH_YOYO') return '高悠悠';
    if (maneuver === 'LOW_YOYO') return '低悠悠';
    if (maneuver === 'DEFENSIVE_ROLL') return '防御滚转';
    if (maneuver === 'REVERSAL') return '反转';
    if (maneuver === 'SCISSORS') return '剪刀机动';
    if (maneuver === 'LEAD_TURN') return '抢先转弯';
    return '—';
  }
}
