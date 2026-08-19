import type { LegacyEntitySnapshot, LegacySnapshot } from '../render/snapshot';
import type { SkyfireWorldRenderer } from '../render/world-renderer';
import { normalizedLockProgress } from '../core/targeting';
import { visualAltitude } from '../core/altitude';

interface TagView {
  root: HTMLDivElement;
  title: HTMLElement;
  detail: HTMLElement;
}

function finite(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function createTag(parent: HTMLElement, player: boolean): TagView {
  const root = document.createElement('div');
  root.className = `tactical-tag${player ? ' player' : ''}`;
  root.hidden = true;
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  root.append(title, detail);
  parent.append(root);
  return { root, title, detail };
}

function enemyName(kind: string | undefined): string {
  const normalized = String(kind || 'fighter').toUpperCase();
  if (normalized === 'ACE') return 'ACE / 王牌';
  if (normalized === 'GUNNER') return 'GUNSHIP / 炮手';
  if (normalized === 'BOMBER') return 'BOMBER / 轰炸机';
  if (normalized === 'INTERCEPTOR') return 'INTERCEPTOR / 截击机';
  if (normalized === 'EYE' || normalized === 'KING') return `BOSS / ${normalized}`;
  return `${normalized} / 敌机`;
}

export class TacticalOverlay {
  private readonly playerTag: TagView;
  private readonly enemyTags: TagView[];

  constructor(private readonly root: HTMLElement, enemyCapacity = 3) {
    this.playerTag = createTag(root, true);
    this.enemyTags = Array.from({ length: enemyCapacity }, () => createTag(root, false));
  }

  update(snapshot: LegacySnapshot, renderer: SkyfireWorldRenderer): void {
    this.setVisible(snapshot.tacticalVisible === true);
    if (!snapshot.tacticalVisible) return;
    this.updatePlayer(snapshot, renderer);
    const placed: DOMRect[] = [];
    if (!this.playerTag.root.hidden) {
      this.avoidOverlap(this.playerTag, []);
      placed.push(this.playerTag.root.getBoundingClientRect());
    }
    const limit = window.innerWidth <= 520 ? 2 : this.enemyTags.length;
    const living = snapshot.enemies
      .filter((enemy) => enemy.dead !== true && enemy.alive !== false)
      .map((enemy) => ({
        enemy,
        range: Math.hypot(enemy.x - snapshot.player.x, enemy.y - snapshot.player.y)
      }))
      .sort((a, b) => a.range - b.range)
      .slice(0, limit);

    this.enemyTags.forEach((tag, index) => {
      const entry = living[index];
      if (!entry) {
        tag.root.hidden = true;
        return;
      }
      this.place(tag, entry.enemy, renderer);
      tag.title.textContent = enemyName(entry.enemy.kind);
      tag.detail.textContent = `RNG ${Math.round(entry.range)}  ALT ${Math.round(visualAltitude(entry.enemy))}  SPD ${Math.round(finite(entry.enemy.speed))}`;
      this.avoidOverlap(tag, placed);
      if (!tag.root.hidden) placed.push(tag.root.getBoundingClientRect());
    });
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) return;
    this.playerTag.root.hidden = true;
    this.enemyTags.forEach((tag) => { tag.root.hidden = true; });
  }

  private updatePlayer(snapshot: LegacySnapshot, renderer: SkyfireWorldRenderer): void {
    this.playerTag.title.textContent = 'SKYFIRE / 自机';
    const targeting = snapshot.targeting;
    const lock = targeting
      ? `${Math.round(normalizedLockProgress(targeting.lock, targeting.lockTime) * 100)}%`
      : '--';
    const mode = snapshot.combatMode === 'auto-gun-active-missile' ? ' AUTO' : '';
    this.playerTag.detail.textContent = `ALT ${Math.round(snapshot.player.altitude)}  SPD ${Math.round(snapshot.player.speed)}  LOCK ${lock}${mode}`;
    this.place(this.playerTag, snapshot.player, renderer);
  }

  private place(tag: TagView, entity: LegacyEntitySnapshot, renderer: SkyfireWorldRenderer): void {
    const projected = renderer.projectEntity(entity);
    tag.root.hidden = !projected.visible;
    if (!projected.visible) return;
    tag.root.style.left = `${projected.x}px`;
    tag.root.style.top = `${projected.y}px`;
  }

  private avoidOverlap(tag: TagView, placed: DOMRect[]): void {
    if (tag.root.hidden) return;
    let rect = tag.root.getBoundingClientRect();
    const edge = 4;
    if (rect.left < edge) {
      tag.root.style.left = `${parseFloat(tag.root.style.left || '0') + edge - rect.left}px`;
      rect = tag.root.getBoundingClientRect();
    } else if (rect.right > window.innerWidth - edge) {
      tag.root.style.left = `${parseFloat(tag.root.style.left || '0') - (rect.right - window.innerWidth + edge)}px`;
      rect = tag.root.getBoundingClientRect();
    }
    const safeTop = 76;
    const safeBottom = Math.max(safeTop, window.innerHeight - rect.height - (window.innerWidth <= 520 ? 170 : 96));
    if (rect.top < safeTop) {
      tag.root.style.top = `${safeTop + rect.height / 2}px`;
      rect = tag.root.getBoundingClientRect();
    } else if (rect.top > safeBottom) {
      tag.root.style.top = `${safeBottom + rect.height / 2}px`;
      rect = tag.root.getBoundingClientRect();
    }
    if (placed.length === 0) return;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const overlaps = placed.some((other) =>
        rect.left < other.right && rect.right > other.left &&
        rect.top < other.bottom && rect.bottom > other.top
      );
      if (!overlaps) return;
      tag.root.style.top = `${rect.top + rect.height + 6}px`;
      rect = tag.root.getBoundingClientRect();
    }
  }

  dispose(): void {
    this.root.replaceChildren();
  }
}
