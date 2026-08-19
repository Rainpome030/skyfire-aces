import type { LegacyEntitySnapshot, LegacySnapshot } from '../render/snapshot';
import type { SkyfireWorldRenderer } from '../render/world-renderer';

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
      tag.detail.textContent = `RNG ${Math.round(entry.range)}  SPD ${Math.round(finite(entry.enemy.speed))}`;
    });
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) return;
    this.playerTag.root.hidden = true;
    this.enemyTags.forEach((tag) => { tag.root.hidden = true; });
  }

  private updatePlayer(snapshot: LegacySnapshot, renderer: SkyfireWorldRenderer): void {
    this.place(this.playerTag, snapshot.player, renderer);
    this.playerTag.title.textContent = 'SKYFIRE / 自机';
    this.playerTag.detail.textContent = `ALT ${Math.round(snapshot.player.altitude)}  SPD ${Math.round(snapshot.player.speed)}`;
  }

  private place(tag: TagView, entity: LegacyEntitySnapshot, renderer: SkyfireWorldRenderer): void {
    const projected = renderer.projectEntity(entity);
    tag.root.hidden = !projected.visible;
    if (!projected.visible) return;
    tag.root.style.left = `${projected.x}px`;
    tag.root.style.top = `${projected.y}px`;
  }

  dispose(): void {
    this.root.replaceChildren();
  }
}
