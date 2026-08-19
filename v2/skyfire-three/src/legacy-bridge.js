// This file is appended to the ordered legacy sources so it can read their
// top-level lexical state without changing the production v1 modules.
(function installSkyfireLegacyBridge() {
  const originalDrawWorld = drawWorld;
  const readonlyCache = new WeakMap();
  let worldRenderer = null;
  let rendererFailureReported = false;
  const V2_AUTO_GUN = true;

  function angleDelta(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function autoGunTarget() {
    const range = 820;
    const cone = 0.5;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || enemy.retreat || enemy.hp <= 0) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const angle = angleDelta(player.heading, Math.atan2(dy, dx));
      if (Math.abs(angle) > cone) continue;
      const score = distance * (1 + Math.abs(angle) * 2);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  function runV2AutoGun() {
    if (!V2_AUTO_GUN || GAME.state !== 'playing' || upgradeChoice ||
      (typeof ChapterCard !== 'undefined' && ChapterCard.isActive()) ||
      !player.alive || player.fireCd > 0 || typeof firePlayerGuns !== 'function') return;
    if (autoGunTarget()) firePlayerGuns();
  }

  function readonly(value) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return value;
    // Native arrays expose non-configurable prototype invariants that a
    // recursive Proxy cannot safely virtualize. The renderer only consumes
    // these arrays, so keep their native methods and never mutate them here.
    if (Array.isArray(value)) return value;
    const cached = readonlyCache.get(value);
    if (cached) return cached;

    const view = new Proxy(value, {
      get(target, property, receiver) {
        return readonly(Reflect.get(target, property, receiver));
      },
      set() {
        return false;
      },
      deleteProperty() {
        return false;
      },
      defineProperty() {
        return false;
      },
      setPrototypeOf() {
        return false;
      }
    });
    readonlyCache.set(value, view);
    return view;
  }

  function getSnapshot() {
    const tacticalVisible = GAME.state === 'playing' &&
      !upgradeChoice &&
      !(typeof controlSchemeAsk !== 'undefined' && controlSchemeAsk) &&
      !(typeof ChapterCard !== 'undefined' && ChapterCard.isActive());
    return Object.freeze({
      GAME: readonly(GAME),
      player: readonly(player),
      enemies: readonly(enemies),
      allies: readonly(allies),
      bullets: readonly(bullets),
      missiles: readonly(missiles),
      particles: readonly(particles),
      pickups: readonly(pickups),
      world: readonly(world),
      mission: readonly(mission),
      cam: readonly(cam),
      camera: readonly(cam),
      cameraMode: save && save.cameraMode === CAMERA_WORLD_UP ? 'world-up' : 'heading-up',
      lockTargetId: player.target && player.target.id !== undefined ? player.target.id : null,
      tacticalVisible,
      combatMode: V2_AUTO_GUN ? 'auto-gun-active-missile' : 'manual-gun-active-missile',
      targeting: Object.freeze({
        lock: Number.isFinite(player.lock) ? player.lock : 0,
        lockTime: Number.isFinite(CFG.lockTime) ? CFG.lockTime : 0.85,
        lockRange: Number.isFinite(CFG.lockRange) ? CFG.lockRange : 1000,
        lockCone: Number.isFinite(CFG.lockCone) ? CFG.lockCone : 0.75,
        gunRange: 820,
        gunCone: 0.5,
        altitudeWindow: Number.POSITIVE_INFINITY
      }),
      gameTime
    });
  }

  function isRendererReady(renderer) {
    if (!renderer) return false;
    return typeof renderer === 'function' || !renderer.isReady || renderer.isReady();
  }

  function renderExternalWorld(renderer, snapshot) {
    if (typeof renderer === 'function') return renderer(snapshot);
    return renderer.render(snapshot);
  }

  function drawBridgedWorld() {
    runV2AutoGun();
    const renderer = worldRenderer;
    if (isRendererReady(renderer)) {
      try {
        // Returning false means "not handled" and deliberately requests v1 2D fallback.
        if (renderExternalWorld(renderer, getSnapshot()) !== false) return;
      } catch (error) {
        if (!rendererFailureReported) {
          rendererFailureReported = true;
          console.error('[SkyfireLegacyBridge] Three world renderer failed; using legacy 2D.', error);
        }
      }
    }
    originalDrawWorld();
  }

  function setWorldRenderer(renderer) {
    const validFunction = typeof renderer === 'function';
    const validObject = renderer && typeof renderer.render === 'function';
    if (!validFunction && !validObject) {
      throw new TypeError('World renderer must be a function or an object with render(snapshot).');
    }
    worldRenderer = renderer;
    rendererFailureReported = false;
    return function releaseWorldRenderer() {
      if (worldRenderer === renderer) worldRenderer = null;
    };
  }

  function clearWorldRenderer() {
    worldRenderer = null;
    rendererFailureReported = false;
  }

  drawWorld = drawBridgedWorld;
  window.SkyfireLegacyBridge = Object.freeze({
    getSnapshot,
    setWorldRenderer,
    clearWorldRenderer,
    drawLegacyWorld: originalDrawWorld,
    getViewport() {
      return Object.freeze({ width: W, height: H, dpr: DPR });
    }
  });
})();
