import { HIGH_ALTITUDE, LOW_ALTITUDE } from '../content/encounter';
import type { CombatEvent, SliceState } from '../core/types';

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
  private readonly hp = required<HTMLElement>('#hp');
  private readonly threat = required<HTMLElement>('#threat-banner');
  private readonly toast = required<HTMLElement>('#combat-toast');
  private readonly targetCue = required<HTMLElement>('#target-cue');
  private readonly targetArrow = required<HTMLElement>('#target-arrow');
  private readonly targetName = required<HTMLElement>('#target-name');
  private readonly targetRange = required<HTMLElement>('#target-range');
  private readonly altitudeControl = required<HTMLButtonElement>('#altitude-control');
  private readonly altitudeControlLabel = required<HTMLElement>('#altitude-control-label');
  private readonly missileControlLabel = required<HTMLElement>('#missile-control-label');
  private readonly damageFlash = required<HTMLElement>('#damage-flash');
  private readonly altitudeScan = required<HTMLElement>('#altitude-scan');
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
    this.hp.textContent = String(Math.round(state.player.hp)).padStart(3, '0');
    this.hp.classList.toggle('critical', state.player.hp <= 35);
    this.threat.textContent = state.ended ? (state.outcome === 'SUCCESS' ? '空域安全 · 演习完成' : '时限耗尽 · 演习终止') : state.threat;
    this.threat.classList.toggle('danger', state.threat.includes('警告') || state.threat.includes('暴露'));
    this.altitudeControlLabel.textContent = high ? '俯冲' : '拉升';
    this.altitudeControl.setAttribute('aria-label', high ? '俯冲至低空' : '拉升至高空');
    this.missileControlLabel.textContent = state.player.missileCooldown <= 0 ? '就绪' : state.player.missileCooldown.toFixed(1);
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
    if (events.some((event) => event.type === 'altitude' || event.type === 'phase')) this.retrigger(this.altitudeScan);
  }

  showSummary(state: SliceState): void {
    required<HTMLElement>('#summary-title').textContent = state.outcome === 'SUCCESS' ? '演习完成' : '演习超时';
    required<HTMLElement>('#summary-subtitle').textContent = state.outcome === 'SUCCESS' ? '地空威胁均已解除' : '仍有目标留在演习空域';
    required<HTMLElement>('#summary-score').textContent = String(state.score).padStart(5, '0');
    required<HTMLElement>('#summary-kills').textContent = String(state.kills);
    required<HTMLElement>('#summary-switches').textContent = String(state.metrics.altitudeSwitches);
    required<HTMLElement>('#summary-missiles').textContent = `${state.metrics.missileHits}/${state.metrics.missilesFired}`;
    required<HTMLElement>('#summary-damage').textContent = String(state.metrics.damageTaken);
    required<HTMLElement>('#summary-recoveries').textContent = String(state.metrics.recoveries);
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
    let nearest = null as SliceState['enemies'][number] | null;
    let nearestDistance = Infinity;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const distance = Math.hypot(enemy.position.x - state.player.position.x, enemy.position.z - state.player.position.z);
      if (distance >= nearestDistance) continue;
      nearest = enemy;
      nearestDistance = distance;
    }
    this.targetCue.classList.toggle('hidden', !nearest || state.ended);
    if (!nearest) return;
    const dx = nearest.position.x - state.player.position.x;
    const dz = nearest.position.z - state.player.position.z;
    // Camera A views the map from world -Z toward +Z, so world +X projects left.
    this.targetArrow.style.transform = `rotate(${Math.atan2(-dx, dz)}rad)`;
    this.targetName.textContent = nearest.kind === 'radar'
      ? '雷达站'
      : nearest.kind === 'aa'
        ? '防空阵地'
        : nearest.kind === 'ace'
          ? '王牌截击机'
          : '截击机';
    this.targetRange.textContent = String(Math.round(nearestDistance)).padStart(3, '0');
    this.targetCue.setAttribute('aria-label', `最近目标${this.targetName.textContent}，距离${Math.round(nearestDistance)}米`);
  }
}
