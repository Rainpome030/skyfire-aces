import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

interface RuntimeHarness {
  context: vm.Context;
  storage: Map<string, string>;
  drawCalls: { count: number };
  evaluate<T>(source: string): T;
}

function canvasContextStub(drawCalls: { count: number }): Record<string, unknown> {
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    measureText(text: string) { return { width: String(text).length * 8 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; }
  };
  return new Proxy(target, {
    get(object, property) {
      if (!(property in object)) object[property as string] = () => { drawCalls.count++; };
      return object[property as string];
    },
    set(object, property, value) {
      object[property as string] = value;
      return true;
    }
  });
}

function createRuntime(initialStorage: Record<string, string> = {}): RuntimeHarness {
  const storage = new Map(Object.entries(initialStorage));
  const drawCalls = { count: 0 };
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const ctx = canvasContextStub(drawCalls);
  const canvas = {
    width: 1280,
    height: 720,
    style: {},
    getContext: () => ctx,
    addEventListener(type: string, callback: (event: unknown) => void) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  };
  const documentStub = {
    hidden: false,
    documentElement: { style: {}, dataset: {} },
    body: { append() {}, appendChild() {} },
    getElementById: (id: string) => id === 'game' ? canvas : null,
    createElement: (tag: string) => tag === 'canvas' ? { ...canvas } : { style: {}, append() {} },
    addEventListener() {},
    querySelector: () => null
  };
  const windowStub: Record<string, unknown> = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener(type: string, callback: (event: unknown) => void) {
      const callbacks = listeners.get(`window:${type}`) || [];
      callbacks.push(callback);
      listeners.set(`window:${type}`, callbacks);
    }
  };
  const sandbox = {
    console,
    window: windowStub,
    document: documentStub,
    navigator: { maxTouchPoints: 0, userAgent: 'vitest' },
    localStorage: {
      getItem(key: string) { return storage.get(key) ?? null; },
      setItem(key: string, value: string) { storage.set(key, String(value)); },
      removeItem(key: string) { storage.delete(key); }
    },
    getComputedStyle: () => ({ getPropertyValue: () => '0px' }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    performance: { now: () => 1000 },
    setTimeout: () => 1,
    clearTimeout() {},
    Image: class Image {},
    Audio: class Audio {},
    Math,
    Date,
    Uint8ClampedArray
  };
  Object.assign(windowStub, sandbox);
  const context = vm.createContext(sandbox);
  const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');
  const gameRoot = path.join(repositoryRoot, 'src', 'game');
  const files = readdirSync(gameRoot)
    .filter((name) => /^\d{2}-.+\.js$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
  const source = files.map((name) => readFileSync(path.join(gameRoot, name), 'utf8')).join('\n\n');
  const bridge = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'legacy-bridge.js'), 'utf8');
  vm.runInContext(`${source}\n\n${bridge}`, context, { filename: 'legacy-game.js' });
  return {
    context,
    storage,
    drawCalls,
    evaluate<T>(expression: string): T {
      return vm.runInContext(expression, context) as T;
    }
  };
}

describe('formal v2 legacy runtime contract', () => {
  let runtime: RuntimeHarness;

  beforeEach(() => {
    runtime = createRuntime();
  });

  it('loads the complete ordered v1 runtime and exposes a genuinely read-only live snapshot', () => {
    const state = runtime.evaluate<string>('window.SkyfireLegacyBridge.getSnapshot().GAME.state');
    expect(state).toBe('title');
    expect(runtime.evaluate<number>('window.SkyfireLegacyBridge.getSnapshot().enemies.length')).toBe(0);
    expect(() => runtime.evaluate(`'use strict'; window.SkyfireLegacyBridge.getSnapshot().enemies.push({})`)).toThrow(/read-only/);
    expect(() => runtime.evaluate(`'use strict'; window.SkyfireLegacyBridge.getSnapshot().player.hp = 1`)).toThrow();
    runtime.evaluate('enemies.push(makeEnemy("fighter", 100, 200)); player.target = enemies[0]');
    expect(runtime.evaluate<number>('window.SkyfireLegacyBridge.getSnapshot().enemies.length')).toBe(1);
    expect(runtime.evaluate<boolean>(`(() => {
      const snapshot = window.SkyfireLegacyBridge.getSnapshot();
      return snapshot.enemies[0] === snapshot.player.target &&
        [...snapshot.enemies].map((enemy) => enemy.kind).includes('fighter');
    })()`)).toBe(true);
  });

  it('keeps weapon rarity synthesis and equips a newly acquired different weapon type', () => {
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      GAME.weapons = []; GAME.weaponCopies = {}; GAME.synth = {}; player.weapon = defaultWeapon();
      applyWeapon('scatter', 'rare');
      applyWeapon('scatter', 'common');
      applyWeapon('scatter', 'common');
      applyWeapon('scatter', 'common');
      const sameType = { id: player.weapon.id, quality: player.weapon.quality, bucket: { ...GAME.weaponCopies.scatter } };
      applyWeapon('heavy', 'common');
      return { sameType, switched: { id: player.weapon.id, quality: player.weapon.quality } };
    })()`);
    expect(result).toEqual({
      sameType: { id: 'scatter', quality: 'rare', bucket: { common: 0, good: 1, rare: 1 } },
      switched: { id: 'heavy', quality: 'common' }
    });
  });

  it('keeps temporary buffs and permanent run upgrades active', () => {
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      player.buffs = {}; GAME.upgrades = {}; player.maxHp = 100; player.hp = 70;
      applyBuff('rate');
      applyRunUpgrade(RUN_UPGRADE_POOL.find(u => u.id === 'maxHp'));
      applyRunUpgrade(RUN_UPGRADE_POOL.find(u => u.id === 'projectiles'));
      updateBuffs(1);
      return { buffTime: player.buffs.rate.t, hp: player.hp, maxHp: player.maxHp,
        maxHpStacks: GAME.upgrades.maxHp, projectileStacks: GAME.upgrades.projectiles };
    })()`);
    expect(result).toEqual({ buffTime: 11, hp: 85, maxHp: 115, maxHpStacks: 1, projectileStacks: 1 });
  });

  it('pauses endless progression for the boss weapon choice and advances when it is skipped', () => {
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      GAME.mode = 'endless'; GAME.pendingBuffChoices = 0; player.alive = true;
      const boss = { dead: true, hp: 0 };
      mission = { endless: true, waveIndex: 1, completedWaves: 0, wavePhase: 'boss', boss,
        bossKilled: true, aliveTotal: 0 };
      enemies = [boss]; upgradeChoice = null;
      updateEndlessWave(0.016);
      const offered = { phase: mission.wavePhase, kind: upgradeChoice.kind, count: upgradeChoice.options.length };
      upgradeChoiceSel = 3;
      confirmUpgradeChoiceSelection();
      return { offered, phase: mission.wavePhase, wave: mission.waveIndex, choice: upgradeChoice };
    })()`);
    expect(result).toEqual({
      offered: { phase: 'reward', kind: 'weapon', count: 3 },
      phase: 'intermission', wave: 2, choice: null
    });
  });

  it('selects one elite from each completed five-wave boss history group', () => {
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      const history = ['ace','eye','king','ace','eye','king','eye','ace','king','eye'];
      return {
        wave5: endlessBossHistoryGroups(5, history).length,
        wave6: endlessBossHistoryGroups(6, history).map(group => group.length),
        wave11: endlessBossHistoryGroups(11, history).map(group => group.length),
        elites6: selectEndlessEliteKinds(6, history).length,
        elites11: selectEndlessEliteKinds(11, history).length
      };
    })()`);
    expect(result).toEqual({ wave5: 0, wave6: [5], wave11: [5, 5], elites6: 1, elites11: 2 });
  });

  it('retains wingman summon, repair, and fire-rate boost behavior', () => {
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      allies = []; player.x = 1000; player.y = 1000; player.heading = 0; player.speed = 200;
      const first = summonWingman(); const second = summonWingman();
      allies[0].hp = 1; allies[1].hp = 2;
      const third = summonWingman();
      return { actions: [first.action, second.action, third.action], count: allies.length,
        repaired: allies.every(w => w.hp > 2), boosted: allies.every(w => w.rateBoostT > 0) };
    })()`);
    expect(result).toEqual({ actions: ['added', 'added', 'boosted'], count: 2, repaired: true, boosted: true });
  });

  it('keeps fighter movement aligned with its updated nose and target approach', () => {
    const result = runtime.evaluate<Record<string, number | boolean>>(`(() => {
      GAME.state = 'playing';
      world = { W: 5000, H: 5000, clouds: [], islands: [], seed: 1, theme: THEMES.day };
      player.x = 3500; player.y = 2500; player.alive = true; player.dead = false;
      mission = { escort: false, transport: null, complete: false, failed: false };
      allies = [];
      const enemy = makeEnemy('fighter', 1000, 2500);
      enemy.heading = 0;
      enemy.speed = 220;
      enemy.maxSpeed = 220;
      enemies = [enemy];
      const before = { x: enemy.x, y: enemy.y };
      let headingAligned = true;
      for (let frame = 0; frame < 20; frame += 1) {
        const x0 = enemy.x;
        const y0 = enemy.y;
        updateEnemy(enemy, 0.1);
        const dx = enemy.x - x0;
        const dy = enemy.y - y0;
        if (Math.hypot(dx, dy) > 1e-8) {
          headingAligned = headingAligned && Math.abs(angDiff(enemy.heading, Math.atan2(dy, dx))) < 1e-9;
        }
      }
      const targetDistanceBefore = Math.hypot(player.x - before.x, player.y - before.y);
      const targetDistanceAfter = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      return {
        headingAligned,
        moved: Math.hypot(enemy.x - before.x, enemy.y - before.y) > 0,
        approached: targetDistanceAfter < targetDistanceBefore,
        heading: enemy.heading,
        targetDistanceBefore,
        targetDistanceAfter
      };
    })()`);
    expect(result.headingAligned).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.approached).toBe(true);
  });

  it('dispatches special enemy behavior without reversing the movement contract', () => {
    const result = runtime.evaluate<Record<string, boolean | number>>(`(() => {
      GAME.state = 'playing';
      world = { W: 5000, H: 5000, clouds: [], islands: [], seed: 2, theme: THEMES.day };
      player.x = 2500; player.y = 2500; player.alive = true; player.dead = false;
      mission = { escort: false, transport: null, complete: false, failed: false };
      allies = [];
      const enemy = makeEnemy('interceptor', 1400, 2500);
      enemy.heading = Math.PI;
      enemy.speed = 240;
      enemy.maxSpeed = 240;
      enemies = [enemy];
      const before = { x: enemy.x, y: enemy.y, heading: enemy.heading };
      updateEnemy(enemy, 0.1);
      const dx = enemy.x - before.x;
      const dy = enemy.y - before.y;
      const movementLength = Math.hypot(dx, dy);
      const movedHeading = Math.atan2(dy, dx);
      return {
        dispatched: enemy.kind === 'interceptor',
        moved: movementLength > 0,
        headingAligned: Math.abs(angDiff(enemy.heading, movedHeading)) < 1e-9,
        headingChanged: Math.abs(angDiff(before.heading, enemy.heading)) > 1e-6,
        movementLength
      };
    })()`);
    expect(result.dispatched).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.headingAligned).toBe(true);
    expect(result.headingChanged).toBe(true);
  });

  it('loads and saves camera-compatible v1 storage and preserves mouse bindings', () => {
    runtime.storage.set('skyfire_save_v1', JSON.stringify({ cameraMode: 'world-up', selectedPlane: 'gale', difficulty: 'normal' }));
    runtime.storage.set('skyfire_keybinds', JSON.stringify({ gun: 'mouse3' }));
    const result = runtime.evaluate<Record<string, unknown>>(`(() => {
      loadSave(); keybinds = loadKeybinds();
      captureBind = 'missile'; completeBindCapture('mouse4');
      setMouseButtonState(3, true);
      const before = { camera: save.cameraMode, snapshotCamera: window.SkyfireLegacyBridge.getSnapshot().cameraMode,
        gun: bindFor('gun'), missile: bindFor('missile'), gunDown: isActionDown('gun') };
      save.cameraMode = CAMERA_HEADING_UP; saveNow();
      return { before, storedCamera: JSON.parse(localStorage.getItem(SAVE_KEY)).cameraMode,
        storedMissile: JSON.parse(localStorage.getItem('skyfire_keybinds')).missile };
    })()`);
    expect(result).toEqual({
      before: { camera: 'world-up', snapshotCamera: 'world-up', gun: 'mouse3', missile: 'mouse4', gunDown: true },
      storedCamera: 'heading-up', storedMissile: 'mouse4'
    });
  });

  it('falls back to legacy drawWorld when no renderer is ready or rendering fails', () => {
    const before = runtime.drawCalls.count;
    runtime.evaluate(`(() => {
      window.SkyfireLegacyBridge.clearWorldRenderer();
      drawWorld();
    })()`);
    const afterMissing = runtime.drawCalls.count;
    runtime.evaluate(`(() => {
      window.SkyfireLegacyBridge.setWorldRenderer({ isReady: () => false, render: () => { throw new Error('unreachable'); } });
      drawWorld();
    })()`);
    const afterNotReady = runtime.drawCalls.count;
    const errorReports = runtime.evaluate<number>(`(() => {
      let reports = 0;
      window.SkyfireLegacyBridge.setWorldRenderer({ render: () => { throw new Error('expected'); } });
      const oldError = console.error; console.error = () => { reports++; };
      drawWorld(); console.error = oldError;
      return reports;
    })()`);
    const afterFailure = runtime.drawCalls.count;
    expect(afterMissing).toBeGreaterThan(before);
    expect(afterNotReady).toBeGreaterThan(afterMissing);
    expect(afterFailure).toBeGreaterThan(afterNotReady);
    expect(errorReports).toBe(1);
  });
});
