import * as THREE from 'three';
import { CLOUD_ALTITUDE } from '../content/encounter';
import type { CombatEvent, EnemyState, SliceState, Vec3State } from '../core/types';
import { ModelAssets, type ModelKey } from './model-assets';

interface UnitVisual {
  group: THREE.Group;
  shadow: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  warningRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null;
}

interface TimedEffect {
  object: THREE.Object3D;
  materials: Array<THREE.Material & { opacity: number }>;
  life: number;
  maxLife: number;
  growth: number;
  spin: number;
}

interface ProjectileEffect {
  object: THREE.Group;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  start: THREE.Vector3;
  end: THREE.Vector3;
  life: number;
  maxLife: number;
  impactColor: number;
  impactScale: number;
}

interface RibbonPoint {
  position: THREE.Vector3;
  width: number;
}

function toVector3(value: Vec3State): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function expLerp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

function positionKey(value: Vec3State): string {
  return `${value.x.toFixed(2)}:${value.y.toFixed(2)}:${value.z.toFixed(2)}`;
}

function standardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const entries = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of entries) {
      if (material instanceof THREE.MeshStandardMaterial && !materials.includes(material)) materials.push(material);
    }
  });
  return materials;
}

function setShadowOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const entries = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of entries) {
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = opacity;
    }
  });
}

class RibbonTrail {
  private readonly points: RibbonPoint[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  private readonly mesh = new THREE.Mesh(this.geometry, this.material);
  private sampleTimer = 0;

  constructor(scene: THREE.Scene) {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  update(position: Vec3State, width: number, dt: number): void {
    this.sampleTimer -= dt;
    const next = toVector3(position);
    const last = this.points.at(-1);
    if (last && last.position.distanceTo(next) > 26) this.points.length = 0;
    if (this.sampleTimer > 0) return;
    this.sampleTimer = 0.045;
    this.points.push({ position: next, width });
    if (this.points.length > 54) this.points.shift();
    this.rebuild();
  }

  private rebuild(): void {
    if (this.points.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const cyan = new THREE.Color(0x70eaff);
    const teal = new THREE.Color(0x0b4657);
    for (let index = 0; index < this.points.length; index += 1) {
      const point = this.points[index];
      if (!point) continue;
      const previous = this.points[Math.max(0, index - 1)] ?? point;
      const next = this.points[Math.min(this.points.length - 1, index + 1)] ?? point;
      const dx = next.position.x - previous.position.x;
      const dz = next.position.z - previous.position.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const px = -dz / length;
      const pz = dx / length;
      const age = index / Math.max(1, this.points.length - 1);
      const widthAtPoint = point.width * (0.15 + age * 0.85);
      positions.push(
        point.position.x + px * widthAtPoint, point.position.y + 0.03, point.position.z + pz * widthAtPoint,
        point.position.x - px * widthAtPoint, point.position.y + 0.03, point.position.z - pz * widthAtPoint
      );
      const color = teal.clone().lerp(cyan, Math.pow(age, 1.6));
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      if (index < this.points.length - 1) {
        const base = index * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setIndex(indices);
    this.geometry.computeBoundingSphere();
    this.geometry.setDrawRange(0, indices.length);
  }
}

export class FlightRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 800);
  private readonly assets = new ModelAssets();
  private readonly playerVisual: UnitVisual;
  private readonly enemyVisuals = new Map<number, UnitVisual>();
  private readonly trail: RibbonTrail;
  private readonly effects: TimedEffect[] = [];
  private readonly projectiles: ProjectileEffect[] = [];
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraFocus = new THREE.Vector3();
  private readonly lockMarker: THREE.Group;
  private readonly cloudMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly oceanUniforms = { time: { value: 0 } };
  private cameraReady = false;
  private width = 0;
  private height = 0;
  private loaded = false;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.renderer.setPixelRatio(Math.min(window.matchMedia('(pointer: coarse)').matches ? 1.6 : 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    root.append(this.canvas);

    this.scene.background = new THREE.Color(0x061923);
    this.scene.fog = new THREE.FogExp2(0x061923, 0.0037);
    this.buildEnvironment();
    this.playerVisual = this.emptyVisual();
    this.scene.add(this.playerVisual.group, this.playerVisual.shadow);
    this.trail = new RibbonTrail(this.scene);
    this.lockMarker = this.createLockMarker();
    this.scene.add(this.lockMarker);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  async loadAssets(): Promise<void> {
    await this.assets.load();
    const model = this.assets.clone('player', [0x63c8dc, 0x193d4b]);
    this.addAircraftAccents(model, 0x70eaff, true);
    this.playerVisual.group.add(model);
    this.playerVisual.shadow.add(this.assets.silhouette(model));
    this.playerVisual.materials.push(...standardMaterials(model));
    this.installSetDressing();
    this.loaded = true;
  }

  update(state: SliceState, dt: number): void {
    this.resizeIfNeeded();
    this.oceanUniforms.time.value += dt;
    this.syncPlayer(state);
    if (this.loaded) this.syncEnemies(state);
    this.updateCamera(state, dt);
    this.updateEffects(dt);
    this.updateProjectiles(dt);
    this.updateClouds(state);
    this.trail.update(state.player.position, 0.46 + Math.abs(state.player.bank) * 0.85 + state.player.speed / 150, dt);
    this.renderer.render(this.scene, this.camera);
  }

  handleEvents(events: CombatEvent[]): void {
    const missileTargets = new Map<string, number>();
    for (const missile of events.filter((event) => event.type === 'missile' && event.from && event.to)) {
      const key = positionKey(missile.to!);
      const killed = events.some((event) => event.type === 'kill' && event.from && positionKey(event.from) === key);
      missileTargets.set(key, killed ? 3.3 : 1.25);
      this.createMissile(missile.from!, missile.to!, missile.color ?? 0x70eaff, killed ? 3.3 : 1.25);
    }
    for (const event of events) {
      if ((event.type === 'gun' || event.type === 'playerHit' || event.type === 'heavyDamage' || event.type === 'graze' || event.type === 'warning') && event.from && event.to) {
        const heavy = event.type === 'heavyDamage';
        const warning = event.type === 'warning';
        const graze = event.type === 'graze';
        this.createBeam(event.from, event.to, event.color ?? 0xffffff, heavy ? 0.16 : warning ? 0.11 : graze ? 0.045 : 0.075, heavy ? 0.24 : warning ? 0.3 : graze ? 0.34 : 0.11);
        if (heavy) this.createBurst(event.to, 0xff334c, 1.6, 0.3);
        if (graze) this.createAltitudeRing(event.to, 0xb9f4ff, 0.36);
      }
      if ((event.type === 'hit' || event.type === 'kill') && event.from && !missileTargets.has(positionKey(event.from))) {
        this.createBurst(event.from, event.color ?? 0xffffff, event.type === 'kill' ? 3.3 : 1.15, event.type === 'kill' ? 0.65 : 0.22);
      }
      if (event.type === 'altitude' && event.from) this.createAltitudeRing(event.from, 0x70eaff, 0.62);
      if (event.type === 'phase' && event.from) this.createAltitudeRing(event.from, 0xffbc66, 1.05);
    }
  }

  private emptyVisual(): UnitVisual {
    return { group: new THREE.Group(), shadow: new THREE.Group(), materials: [], warningRing: null };
  }

  private buildEnvironment(): void {
    const hemisphere = new THREE.HemisphereLight(0xbceeff, 0x162b27, 2.7);
    const sun = new THREE.DirectionalLight(0xffe8bd, 3.5);
    sun.position.set(-70, 120, -48);
    this.scene.add(hemisphere, sun);

    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader: `
        uniform float time;
        varying vec2 vPosition;
        varying float vWave;
        void main() {
          vec3 p = position;
          float wave = sin(p.x * 0.12 + time * 0.7) * 0.28 + cos(p.y * 0.09 - time * 0.52) * 0.22;
          p.z += wave;
          vPosition = p.xy;
          vWave = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vPosition;
        varying float vWave;
        void main() {
          float lanes = sin((vPosition.x + vPosition.y) * 0.18 + time * 0.35) * 0.5 + 0.5;
          float fine = sin(vPosition.x * 0.42 - vPosition.y * 0.24 - time * 0.6) * 0.5 + 0.5;
          vec3 deep = vec3(0.025, 0.17, 0.22);
          vec3 crest = vec3(0.055, 0.34, 0.39);
          float light = clamp(lanes * 0.16 + fine * 0.07 + vWave * 0.18, 0.0, 0.3);
          gl_FragColor = vec4(mix(deep, crest, light), 1.0);
        }
      `
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(440, 440, 64, 64), oceanMaterial);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.2;
    this.scene.add(ocean);

    const grid = new THREE.GridHelper(320, 32, 0x2e8290, 0x174754);
    grid.position.y = 0.04;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.16;
      material.depthWrite = false;
    }
    this.scene.add(grid);

    const sandMaterial = new THREE.MeshStandardMaterial({ color: 0x927a54, roughness: 1, flatShading: true });
    const landMaterial = new THREE.MeshStandardMaterial({ color: 0x496c52, roughness: 0.96, flatShading: true });
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5147, roughness: 1, flatShading: true });
    const islands = [
      [-74, -12, 16, 0.5], [66, -54, 12, 1.1], [78, 78, 20, 0.1], [-88, 76, 14, 0.8], [34, 44, 11, 0.2], [-42, 58, 10, 0.7]
    ] as const;
    for (const [x, z, radius, rotation] of islands) {
      const shelf = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius * 1.08, 1.4, 9), sandMaterial);
      shelf.position.set(x, 0.5, z);
      shelf.rotation.y = rotation;
      const rock = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.92, 3.2, 9), rockMaterial);
      rock.position.set(x, 2, z);
      rock.rotation.y = rotation + 0.12;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.75, 1.1, 9), landMaterial);
      top.position.set(x, 4.1, z);
      top.rotation.y = rotation;
      this.scene.add(shelf, rock, top);
    }

    this.buildClouds();
    const arenaRing = new THREE.Mesh(
      new THREE.RingGeometry(137, 138, 112),
      new THREE.MeshBasicMaterial({ color: 0x65d9e6, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    );
    arenaRing.rotation.x = -Math.PI / 2;
    arenaRing.position.y = 0.06;
    this.scene.add(arenaRing);
  }

  private buildClouds(): void {
    const cloudClusters = [
      [-42, -12, 1.1], [18, 20, 0.85], [65, -5, 1.25], [-78, 52, 0.92], [35, 83, 1.15], [-5, -77, 1]
    ] as const;
    for (const [x, z, scale] of cloudClusters) {
      const group = new THREE.Group();
      group.position.set(x, CLOUD_ALTITUDE, z);
      for (let index = 0; index < 5; index += 1) {
        const material = new THREE.MeshStandardMaterial({
          color: index % 2 ? 0xc3e7ed : 0xe0f5f6,
          transparent: true,
          opacity: 0.22,
          roughness: 1,
          depthWrite: false,
          flatShading: true
        });
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2 + (index % 3), 1), material);
        const angle = (index / 5) * Math.PI * 2;
        puff.position.set(Math.cos(angle) * 5.2, (index % 2) * 0.8, Math.sin(angle) * 3.2);
        puff.scale.set(1.6 * scale, 0.42 * scale, 1.05 * scale);
        puff.renderOrder = 2;
        this.cloudMaterials.push(material);
        group.add(puff);
      }
      this.scene.add(group);
    }
  }

  private installSetDressing(): void {
    const placements = [
      [-74, 4.4, -12, 0.5], [78, 4.4, 78, -0.4], [66, 4.4, -54, 1.1]
    ] as const;
    for (const [x, y, z, rotation] of placements) {
      const hangar = this.assets.clone('hangar', [0x38545a, 0x8c7a59, 0x23363b]);
      hangar.position.set(x, y, z);
      hangar.rotation.y = rotation;
      this.scene.add(hangar);
    }
  }

  private addAircraftAccents(root: THREE.Group, accent: number, player: boolean): void {
    const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.18 });
    const canopy = new THREE.MeshStandardMaterial({ color: player ? 0x102c3c : 0x291923, roughness: 0.2, metalness: 0.78 });
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(player ? 0.78 : 0.68, 0.45, 1.75), canopy);
    cockpit.position.set(0, 0.72, 0.65);
    cockpit.rotation.x = -0.08;
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 1.25, 8), glow);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, 0.52, -3.55);
    root.add(cockpit, engine);
  }

  private createUnitVisual(key: ModelKey, palette: readonly number[], accent: number, ground: boolean): UnitVisual {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const model = this.assets.clone(key, palette);
    if (!ground) this.addAircraftAccents(model, accent, false);
    group.add(model);

    if (ground) {
      const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x25383b, roughness: 0.72, metalness: 0.35 });
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.1, 1.25, 10), platformMaterial);
      platform.position.y = -0.05;
      group.add(platform);
    }

    const shadow = new THREE.Group();
    if (ground) {
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(4.5, 24),
        new THREE.MeshBasicMaterial({ color: 0x010608, transparent: true, opacity: 0.36, depthWrite: false })
      );
      disk.rotation.x = -Math.PI / 2;
      shadow.add(disk);
    } else {
      shadow.add(this.assets.silhouette(model));
    }

    const warningRing = ground
      ? new THREE.Mesh(
          new THREE.RingGeometry(5.2, 5.85, 40),
          new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false })
        )
      : null;
    if (warningRing) {
      warningRing.rotation.x = -Math.PI / 2;
      warningRing.position.y = 0.14;
      group.add(warningRing);
    }
    return { group, shadow, warningRing, materials: standardMaterials(group) };
  }

  private createEnemyVisual(enemy: EnemyState): UnitVisual {
    if (enemy.kind === 'aa') return this.createUnitVisual('aa', [0x7c3847, 0x332d33, 0xff556c], 0xff556c, true);
    if (enemy.kind === 'radar') return this.createUnitVisual('radar', [0x927344, 0x343633, 0xffbc66], 0xffbc66, true);
    if (enemy.kind === 'ace') return this.createUnitVisual('interceptor', [0x8f2638, 0x2d1720, 0xffbc66], 0xffbc66, false);
    return this.createUnitVisual('interceptor', [0xbe3d50, 0x321a22, 0xff6679], 0xff556c, false);
  }

  private createLockMarker(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xffce75, transparent: true, opacity: 0.92, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.1, 5, 28), material);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (let index = 0; index < 4; index += 1) {
      const pip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 1.2), material);
      const angle = (index / 4) * Math.PI * 2;
      pip.position.set(Math.cos(angle) * 4.2, 0, Math.sin(angle) * 4.2);
      pip.rotation.y = -angle;
      group.add(pip);
    }
    group.visible = false;
    group.renderOrder = 4;
    return group;
  }

  private syncPlayer(state: SliceState): void {
    const player = state.player;
    this.playerVisual.group.position.set(player.position.x, player.position.y, player.position.z);
    this.playerVisual.group.rotation.set(0, player.heading, player.bank, 'YXZ');
    this.playerVisual.shadow.position.set(player.position.x, 0.08, player.position.z);
    this.playerVisual.shadow.rotation.y = player.heading;
    const scale = 1 + player.position.y * 0.036;
    this.playerVisual.shadow.scale.set(scale, 0.035, scale);
    setShadowOpacity(this.playerVisual.shadow, Math.max(0.1, 0.48 - player.position.y * 0.009));
  }

  private syncEnemies(state: SliceState): void {
    const activeIds = new Set(state.enemies.map((enemy) => enemy.id));
    for (const [id, visual] of this.enemyVisuals) {
      if (activeIds.has(id)) continue;
      this.scene.remove(visual.group, visual.shadow);
      this.enemyVisuals.delete(id);
    }
    for (const enemy of state.enemies) {
      let visual = this.enemyVisuals.get(enemy.id);
      if (!visual) {
        visual = this.createEnemyVisual(enemy);
        this.enemyVisuals.set(enemy.id, visual);
        this.scene.add(visual.group, visual.shadow);
      }
      visual.group.visible = enemy.alive;
      visual.shadow.visible = enemy.alive;
      if (!enemy.alive) continue;

      visual.group.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      const isAircraft = enemy.kind === 'interceptor' || enemy.kind === 'ace';
      visual.group.rotation.set(0, enemy.heading, isAircraft ? Math.sin(state.elapsed * 1.7 + enemy.id) * 0.18 : 0, 'YXZ');
      visual.shadow.position.set(enemy.position.x, 0.075, enemy.position.z);
      visual.shadow.rotation.y = enemy.heading;
      const shadowScale = isAircraft ? 1 + enemy.position.y * 0.032 : 1;
      visual.shadow.scale.set(shadowScale, isAircraft ? 0.035 : 1, shadowScale);
      setShadowOpacity(visual.shadow, isAircraft ? Math.max(0.09, 0.44 - enemy.position.y * 0.008) : 0.34);

      for (const material of visual.materials) {
        if (enemy.hitFlash > 0) {
          material.emissive.setHex(0xffffff);
          material.emissiveIntensity = 1.8;
        } else {
          material.emissive.copy(material.color);
          material.emissiveIntensity = material.color.getHex() === 0xff556c || material.color.getHex() === 0xffbc66 ? 0.34 : 0.08;
        }
      }
      if (visual.warningRing) {
        const radarSweep = enemy.kind === 'radar';
        visual.warningRing.visible = radarSweep || enemy.telegraph > 0;
        const cycle = (state.elapsed * 0.55) % 1;
        const pulse = radarSweep ? 1.05 + cycle * 1.9 : 1 + Math.sin(state.elapsed * 20) * 0.12;
        visual.warningRing.scale.setScalar(pulse);
        visual.warningRing.material.opacity = radarSweep ? 0.42 * (1 - cycle) : 0.48 + Math.sin(state.elapsed * 20) * 0.22;
      }
    }

    const target = state.lockTargetId === null ? null : state.enemies.find((enemy) => enemy.id === state.lockTargetId && enemy.alive);
    this.lockMarker.visible = Boolean(target);
    if (target) {
      const ground = target.kind === 'aa' || target.kind === 'radar';
      this.lockMarker.position.set(target.position.x, target.position.y + (ground ? 4.4 : 0.4), target.position.z);
      this.lockMarker.scale.setScalar(0.9 + Math.sin(state.elapsed * 11) * 0.08);
    }
  }

  private updateCamera(state: SliceState, dt: number): void {
    const player = state.player;
    const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const playerPosition = toVector3(player.position);
    const portrait = this.width / Math.max(1, this.height) < 0.72;
    const desiredPosition = playerPosition.clone().add(new THREE.Vector3(0, portrait ? 106 : 88, portrait ? -62 : -74));
    const desiredFocus = playerPosition.clone().addScaledVector(forward, portrait ? 7 : 10).add(new THREE.Vector3(0, -3.5, 0));
    if (!this.cameraReady) {
      this.cameraPosition.copy(desiredPosition);
      this.cameraFocus.copy(desiredFocus);
      this.cameraReady = true;
    } else {
      this.cameraPosition.lerp(desiredPosition, expLerp(3.8, dt));
      this.cameraFocus.lerp(desiredFocus, expLerp(4.2, dt));
    }
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraFocus);
  }

  private updateClouds(state: SliceState): void {
    const opacity = state.player.position.y < CLOUD_ALTITUDE ? 0.31 : 0.13;
    for (const material of this.cloudMaterials) material.opacity = opacity;
  }

  private createBeam(from: Vec3State, to: Vec3State, color: number, width: number, life: number): void {
    const start = toVector3(from);
    const end = toVector3(to);
    const direction = end.clone().sub(start);
    const length = Math.max(0.01, direction.length());
    const geometry = new THREE.CylinderGeometry(width, width * 0.45, length, 6, 1, true);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(geometry, material);
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    beam.renderOrder = 5;
    this.scene.add(beam);
    this.effects.push({ object: beam, materials: [material], life, maxLife: life, growth: 0, spin: 0 });
  }

  private createMissile(from: Vec3State, to: Vec3State, color: number, impactScale: number): void {
    const start = toVector3(from);
    const end = toVector3(to);
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xeaf8f8, emissive: color, emissiveIntensity: 1.8, roughness: 0.28 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 7), bodyMaterial);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    group.position.copy(start);
    group.renderOrder = 6;
    const trailMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending });
    const trailGeometry = new THREE.BufferGeometry().setFromPoints([start, start]);
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(group, trail);
    this.projectiles.push({ object: group, trail, start, end, life: 0.34, maxLife: 0.34, impactColor: color, impactScale });
  }

  private createBurst(position: Vec3State, color: number, radius: number, life: number): void {
    const group = new THREE.Group();
    group.position.copy(toVector3(position));
    const materials: Array<THREE.Material & { opacity: number }> = [];
    for (let index = 0; index < 11; index += 1) {
      const hot = index % 3 === 0 ? 0xffd37a : color;
      const material = new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(radius * (0.13 + (index % 4) * 0.04)), material);
      const angle = (index / 11) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * radius * 0.24, ((index % 3) - 1) * radius * 0.1, Math.sin(angle) * radius * 0.24);
      shard.scale.set(1.8, 0.7, 0.7);
      group.add(shard);
      materials.push(material);
    }
    this.scene.add(group);
    this.effects.push({ object: group, materials, life, maxLife: life, growth: 4.8, spin: 5.2 });
  }

  private createAltitudeRing(position: Vec3State, color: number, life: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.62, 40), material);
    ring.position.copy(toVector3(position));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    this.scene.add(ring);
    this.effects.push({ object: ring, materials: [material], life, maxLife: life, growth: 3.1, spin: 0 });
  }

  private updateEffects(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (!effect) continue;
      effect.life -= dt;
      const opacity = Math.max(0, effect.life / effect.maxLife);
      for (const material of effect.materials) material.opacity = opacity;
      if (effect.growth > 0) effect.object.scale.addScalar(effect.growth * dt);
      if (effect.spin > 0) effect.object.rotation.y += effect.spin * dt;
      if (effect.life > 0) continue;
      this.scene.remove(effect.object);
      effect.object.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      for (const material of effect.materials) material.dispose();
      this.effects.splice(index, 1);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
      projectile.life -= dt;
      const progress = THREE.MathUtils.clamp(1 - projectile.life / projectile.maxLife, 0, 1);
      const curved = 1 - Math.pow(1 - progress, 2.4);
      projectile.object.position.lerpVectors(projectile.start, projectile.end, curved);
      projectile.object.position.y += Math.sin(progress * Math.PI) * 3.2;
      projectile.object.lookAt(projectile.end);
      const trailStart = projectile.object.position.clone().lerp(projectile.start, 0.24);
      projectile.trail.geometry.setFromPoints([trailStart, projectile.object.position]);
      projectile.trail.material.opacity = Math.max(0.18, 1 - progress * 0.55);
      if (projectile.life > 0) continue;
      this.scene.remove(projectile.object, projectile.trail);
      projectile.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      projectile.trail.geometry.dispose();
      projectile.trail.material.dispose();
      this.createBurst({ x: projectile.end.x, y: projectile.end.y, z: projectile.end.z }, projectile.impactColor, projectile.impactScale, projectile.impactScale > 2 ? 0.68 : 0.24);
      this.projectiles.splice(index, 1);
    }
  }

  private resizeIfNeeded(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width !== this.width || height !== this.height) this.resize();
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.parentElement?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, this.canvas.parentElement?.clientHeight ?? window.innerHeight);
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width / height < 0.72 ? 30 : 28;
    this.camera.updateProjectionMatrix();
  }
}
