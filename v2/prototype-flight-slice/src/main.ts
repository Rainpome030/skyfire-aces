// PROTOTYPE QUESTION: can a world-stable top-down camera, real altitude, and
// three limited inputs produce readable tactical flight on desktop and mobile?
import './styles.css';
import { FlightSliceSimulation } from './core/simulation';
import type { ControlFrame } from './core/types';
import { InputController } from './input/input';
import { FlightRenderer } from './render-three/flight-renderer';
import { SliceHud } from './ui/hud';

declare global {
  interface Window {
    __skyfireSlice?: {
      getState: () => {
        assetsReady: boolean;
        started: boolean;
        timeRemaining: number;
        altitudeMode: string;
        altitude: number;
        heading: number;
        enemiesAlive: number;
        missilesFired: number;
        phase: string;
        outcome: string;
      };
    };
  }
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const root = required<HTMLDivElement>('#game-root');
const altitudeButton = required<HTMLButtonElement>('#altitude-control');
const missileButton = required<HTMLButtonElement>('#missile-control');
const startButton = required<HTMLButtonElement>('#start-button');
const restartButton = required<HTMLButtonElement>('#restart-button');
const briefingOverlay = required<HTMLElement>('#briefing-overlay');
const startStatus = required<HTMLElement>('#start-status');
const loadError = required<HTMLElement>('#load-error');

const simulation = new FlightSliceSimulation();
const renderer = new FlightRenderer(root);
const input = new InputController(renderer.canvas, altitudeButton, missileButton);
const hud = new SliceHud();

let assetsReady = false;
let started = false;
let summaryPresented = false;
let accumulator = 0;
let lastTime = performance.now() / 1000;
let pendingAltitudeToggle = false;
let pendingMissile = false;
let pendingReset = false;
const fixedStep = 1 / 60;

window.__skyfireSlice = {
  getState: () => ({
    assetsReady,
    started,
    timeRemaining: simulation.state.timeRemaining,
    altitudeMode: simulation.state.player.altitudeMode,
    altitude: simulation.state.player.position.y,
    heading: simulation.state.player.heading,
    enemiesAlive: simulation.state.enemies.filter((enemy) => enemy.alive).length,
    missilesFired: simulation.state.metrics.missilesFired,
    phase: simulation.state.phase,
    outcome: simulation.state.outcome
  })
};

function beginMission(reset: boolean): void {
  if (!assetsReady) return;
  if (reset) simulation.reset();
  started = true;
  summaryPresented = false;
  accumulator = 0;
  pendingAltitudeToggle = false;
  pendingMissile = false;
  pendingReset = false;
  lastTime = performance.now() / 1000;
  briefingOverlay.classList.add('hidden');
  hud.hideSummary();
  renderer.canvas.focus();
}

startButton.addEventListener('click', () => beginMission(true));
restartButton.addEventListener('click', () => beginMission(true));

void renderer.loadAssets().then(() => {
  assetsReady = true;
  startButton.disabled = false;
  startStatus.textContent = '模型就绪 · 约 3 分钟单关演习';
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  startStatus.textContent = '模型装载失败';
  loadError.textContent = `请刷新后重试：${message}`;
});

function frame(nowMs: number): void {
  const now = nowMs / 1000;
  const frameDelta = Math.min(0.05, Math.max(0, now - lastTime));
  lastTime = now;
  const firstControls = input.consumeFrame();

  if (started) {
    pendingAltitudeToggle ||= firstControls.toggleAltitude;
    pendingMissile ||= firstControls.fireMissile;
    pendingReset ||= firstControls.reset;
    accumulator = Math.min(0.15, accumulator + frameDelta);
    let processedReset = false;
    while (accumulator >= fixedStep) {
      const controls: ControlFrame = {
        steer: firstControls.steer,
        toggleAltitude: pendingAltitudeToggle,
        fireMissile: pendingMissile,
        reset: pendingReset
      };
      simulation.step(fixedStep, controls);
      renderer.handleEvents(simulation.state.events);
      hud.handleEvents(simulation.state.events);
      processedReset ||= pendingReset;
      pendingAltitudeToggle = false;
      pendingMissile = false;
      pendingReset = false;
      accumulator -= fixedStep;
    }
    if (processedReset && !simulation.state.ended) {
      summaryPresented = false;
      hud.hideSummary();
    }
    if (simulation.state.ended && !summaryPresented) {
      summaryPresented = true;
      hud.showSummary(simulation.state);
    }
  }

  renderer.update(simulation.state, frameDelta);
  hud.update(simulation.state, frameDelta);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  lastTime = performance.now() / 1000;
  accumulator = 0;
});

requestAnimationFrame(frame);
