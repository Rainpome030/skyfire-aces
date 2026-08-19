import './three.css';
import { createSkyfireWorldRenderer, type SkyfireWorldRenderer } from './render/world-renderer';
import type { LegacySnapshot, RenderViewport } from './render/snapshot';

interface LegacyBridge {
  getSnapshot(): LegacySnapshot;
  getViewport(): RenderViewport;
  setWorldRenderer(renderer: { render(snapshot: LegacySnapshot): void }): () => void;
}

declare global {
  interface Window {
    SkyfireLegacyBridge?: LegacyBridge;
  }
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const bridge = window.SkyfireLegacyBridge;
if (!bridge) {
  throw new Error('SkyfireLegacyBridge must be installed before the Three.js entry.');
}

const root = required<HTMLDivElement>('#three-root');
const canvas = document.createElement('canvas');
canvas.className = 'skyfire-three-canvas';
canvas.setAttribute('aria-hidden', 'true');
root.append(canvas);

let renderer: SkyfireWorldRenderer | null = null;
let lastGameTime = 0;

try {
  renderer = createSkyfireWorldRenderer(canvas);
  renderer.resize(bridge.getViewport());
  bridge.setWorldRenderer({
    render(snapshot: LegacySnapshot): void {
      const gameTime = Number.isFinite(snapshot.gameTime) ? snapshot.gameTime : lastGameTime;
      const delta = Math.min(0.1, Math.max(0, gameTime - lastGameTime));
      lastGameTime = gameTime;
      renderer?.render(snapshot, delta || 1 / 60);
    }
  });
  document.documentElement.dataset.skyfireThree = 'ready';
} catch (error) {
  document.documentElement.dataset.skyfireThree = 'fallback';
  console.error('[SkyfireThree] WebGL renderer unavailable; keeping Canvas fallback.', error);
  renderer = null;
}

window.addEventListener('resize', () => {
  renderer?.resize(bridge.getViewport());
});

window.addEventListener('beforeunload', () => {
  renderer?.dispose();
});
