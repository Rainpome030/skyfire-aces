import * as THREE from 'three';
import { CLOUD_ALTITUDE } from '../content/encounter';
import type { CombatEvent, EnemyProjectileState, EnemyState, PlayerMissileState, SliceState, Vec3State } from '../core/types';
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

interface PlayerMissileVisual {
  group: THREE.Group;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  points: THREE.Vector3[];
}

interface EnemyProjectileVisual {
  group: THREE.Group;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
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

function setLinePoints(geometry: THREE.BufferGeometry, points: readonly THREE.Vector3[]): void {
  const positions = points.flatMap((point) => [point.x, point.y, point.z]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
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
  private readonly headColor: THREE.Color;
  private readonly tailColor: THREE.Color;

  constructor(
    scene: THREE.Scene,
    private readonly maxPoints = 34,
    headColor = 0x70eaff,
    tailColor = 0x0b4657,
    opacity = 0.55
  ) {
    this.headColor = new THREE.Color(headColor);
    this.tailColor = new THREE.Color(tailColor);
    this.material.opacity = opacity;
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
    if (this.points.length > this.maxPoints) this.points.shift();
    this.rebuild();
  }

  clear(): void {
    if (this.points.length === 0) return;
    this.points.length = 0;
    this.sampleTimer = 0;
    this.geometry.setDrawRange(0, 0);
  }

  private rebuild(): void {
    if (this.points.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
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
      const color = this.tailColor.clone().lerp(this.headColor, Math.pow(age, 1.6));
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
  private readonly playerAfterburner: THREE.Group;
  private readonly playerBrakeVapor: THREE.Group;
  private readonly enemyVisuals = new Map<number, UnitVisual>();
  private readonly enemyProjectileVisuals = new Map<number, EnemyProjectileVisual>();
  private readonly playerMissileVisuals = new Map<number, PlayerMissileVisual>();
  private readonly trail: RibbonTrail;
  private readonly focusTrail: RibbonTrail;
  private readonly effects: TimedEffect[] = [];
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraFocus = new THREE.Vector3();
  private readonly lockMarker: THREE.Group;
  private readonly sensorMarker: THREE.Group;
  private readonly threatBearing: THREE.Group;
  private readonly cloudMaterials: THREE.MeshBasicMaterial[] = [];
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
    this.renderer.toneMappingExposure = 1.04;
    root.append(this.canvas);

    this.scene.background = new THREE.Color(0x0d1a1e);
    this.scene.fog = new THREE.FogExp2(0x0d1a1e, 0.0046);
    this.buildEnvironment();
    this.playerVisual = this.emptyVisual();
    this.playerAfterburner = this.createPlayerManeuverJets(0x70eaff, 0.72, 2.8);
    this.playerBrakeVapor = this.createPlayerManeuverJets(0xdafaff, 2.15, 3.8);
    this.playerAfterburner.visible = false;
    this.playerBrakeVapor.visible = false;
    this.playerVisual.group.add(this.playerAfterburner, this.playerBrakeVapor);
    this.scene.add(this.playerVisual.group, this.playerVisual.shadow);
    this.trail = new RibbonTrail(this.scene, 34, 0x70eaff, 0x0b4657, 0.48);
    this.focusTrail = new RibbonTrail(this.scene, 24, 0xffbc66, 0x551d2a, 0.38);
    this.lockMarker = this.createLockMarker();
    this.sensorMarker = this.createSensorMarker();
    this.threatBearing = this.createThreatBearing();
    this.scene.add(this.lockMarker, this.sensorMarker, this.threatBearing);
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
    this.syncThreatBearing(state);
    if (this.loaded) this.syncEnemies(state);
    this.syncEnemyProjectiles(state);
    this.syncPlayerMissiles(state);
    this.updateCamera(state, dt);
    this.updateEffects(dt);
    this.updateClouds(state, dt);
    const maneuverTrail = state.player.maneuver === 'EXTEND' ? 0.2 : state.player.maneuver === 'BREAK' ? Math.abs(state.player.bank) * 0.22 : 0;
    const tacticalTrail = state.activeTactic === 'NONE' ? 0 : 0.28 + Math.min(0.18, state.tacticChain * 0.035);
    this.trail.update(state.player.position, 0.22 + Math.abs(state.player.bank) * 0.52 + state.player.speed / 320 + maneuverTrail + tacticalTrail, dt);
    const focusAircraft = state.enemies.find((enemy) => enemy.kind === 'ace' && enemy.alive)
      ?? state.enemies.find((enemy) => enemy.id === state.lockTargetId && enemy.alive && enemy.kind === 'interceptor');
    if (focusAircraft) this.focusTrail.update(focusAircraft.position, 0.18 + Math.abs(focusAircraft.bank) * 0.5, dt);
    else this.focusTrail.clear();
    this.renderer.render(this.scene, this.camera);
  }

  handleEvents(events: CombatEvent[]): void {
    const missileTargets = new Set(events
      .filter((event) => event.type === 'missileImpact' && (event.to || event.from))
      .map((event) => positionKey(event.to ?? event.from!)));
    for (const event of events) {
      if ((event.type === 'gun' || event.type === 'gunRake' || event.type === 'playerHit' || event.type === 'heavyDamage' || event.type === 'graze' || event.type === 'warning' || event.type === 'overshoot') && event.from && event.to) {
        const heavy = event.type === 'heavyDamage';
        const warning = event.type === 'warning';
        const graze = event.type === 'graze';
        const rake = event.type === 'gunRake';
        const overshoot = event.type === 'overshoot';
        this.createBeam(event.from, event.to, event.color ?? 0xffffff, heavy ? 0.16 : warning ? 0.11 : rake ? 0.14 : graze ? 0.045 : overshoot ? 0.055 : 0.075, heavy ? 0.24 : warning ? 0.3 : rake ? 0.2 : graze ? 0.34 : overshoot ? 0.42 : 0.11);
        if (heavy) this.createBurst(event.to, 0xff334c, 1.6, 0.3);
        if (rake) this.createBurst(event.to, 0xffd37a, 1.45, 0.28);
        if (graze) this.createAltitudeRing(event.to, 0xb9f4ff, 0.36);
        if (overshoot) {
          this.createAltitudeRing(event.from, 0x70eaff, 0.48);
          this.createAltitudeRing(event.to, 0x70eaff, 0.62);
        }
      }
      if (event.type === 'missileImpact' && (event.to || event.from)) {
        const impact = event.to ?? event.from!;
        this.createBurst(impact, event.color ?? 0x7ce8f2, 2.35, 0.44);
        this.createAltitudeRing(impact, event.color ?? 0x7ce8f2, 0.38);
      }
      if (event.type === 'missileMiss' && event.from) this.createBurst(event.from, 0x7c9aa0, 0.72, 0.18);
      if ((event.type === 'hit' || event.type === 'kill') && event.from) {
        const missileHit = missileTargets.has(positionKey(event.from));
        if (!missileHit || event.type === 'kill') {
          this.createBurst(event.from, event.color ?? 0xffffff, event.type === 'kill' ? (missileHit ? 4.1 : 3.3) : 1.15, event.type === 'kill' ? 0.65 : 0.22);
        }
      }
      if (event.type === 'altitude' && event.from) this.createAltitudeRing(event.from, 0x70eaff, 0.62);
      if (event.type === 'lock' && event.from) this.createAltitudeRing(event.from, 0x70eaff, 0.42);
      if (event.type === 'perfect' && event.from) this.createAltitudeRing(event.from, 0xffd37a, 0.58);
      if (event.type === 'recovery' && event.from) this.createAltitudeRing(event.from, 0x70eaff, 1.25);
      if (event.type === 'maneuver' && event.from) {
        this.createAltitudeRing(event.from, event.color ?? 0x70eaff, 0.95);
        this.createBurst(event.from, event.color ?? 0x70eaff, 0.9, 0.24);
      }
      if (event.type === 'phase' && event.from) this.createAltitudeRing(event.from, 0xffbc66, 1.05);
    }
  }

  private emptyVisual(): UnitVisual {
    return { group: new THREE.Group(), shadow: new THREE.Group(), materials: [], warningRing: null };
  }

  private buildEnvironment(): void {
    const hemisphere = new THREE.HemisphereLight(0xa7bbc1, 0x111b1a, 2.35);
    const sun = new THREE.DirectionalLight(0xffd5a0, 3.15);
    sun.position.set(-92, 104, -62);
    this.scene.add(hemisphere, sun);

    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader: `
        uniform float time;
        varying vec2 vPosition;
        varying float vWave;
        void main() {
          vec3 p = position;
          float longWave = sin(p.x * 0.075 + p.y * 0.035 + time * 0.46) * 0.34;
          float crossWave = cos(p.x * 0.025 - p.y * 0.11 - time * 0.31) * 0.18;
          float wave = longWave + crossWave;
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
          float swell = sin(vPosition.x * 0.11 + vPosition.y * 0.055 + time * 0.24) * 0.5 + 0.5;
          float chop = sin(vPosition.x * 0.31 - vPosition.y * 0.18 - time * 0.42) * 0.5 + 0.5;
          float glintBand = smoothstep(0.91, 1.0, sin(vPosition.x * 0.035 + vPosition.y * 0.021));
          vec3 abyss = vec3(0.022, 0.078, 0.092);
          vec3 slate = vec3(0.09, 0.18, 0.20);
          vec3 dawn = vec3(0.34, 0.31, 0.24);
          float surface = clamp(0.14 + swell * 0.16 + chop * 0.05 + vWave * 0.08, 0.0, 0.36);
          vec3 color = mix(abyss, slate, surface);
          color = mix(color, dawn, glintBand * (0.02 + chop * 0.035));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(460, 460, 72, 72), oceanMaterial);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.45;
    this.scene.add(ocean);

    const landMaterial = new THREE.MeshStandardMaterial({ color: 0x36453f, roughness: 0.98, metalness: 0.02, flatShading: true });
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x2b3332, roughness: 0.96, metalness: 0.04, flatShading: true });
    const islands = [
      [-74, -12, 16, 0.5], [66, -54, 12, 1.1], [78, 78, 20, 0.1], [-88, 76, 14, 0.8], [34, 44, 11, 0.2], [-42, 58, 10, 0.7]
    ] as const;
    for (const [x, z, radius, rotation] of islands) {
      const geometry = new THREE.CylinderGeometry(radius * 0.82, radius, 4.4, 17, 2);
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const px = positions.getX(index);
        const pz = positions.getZ(index);
        const angle = Math.atan2(pz, px);
        const irregularity = 1 + Math.sin(angle * 3.1 + rotation * 4.0) * 0.055 + Math.cos(angle * 7.0 - rotation) * 0.035;
        positions.setXYZ(index, px * irregularity, positions.getY(index), pz * irregularity);
      }
      geometry.computeVertexNormals();
      const island = new THREE.Mesh(geometry, [rockMaterial, landMaterial, rockMaterial]);
      island.position.set(x, 1.65, z);
      island.rotation.y = rotation;
      this.scene.add(island);

      const wash = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.91, radius * 1.05, 36),
        new THREE.MeshBasicMaterial({ color: 0xb7c6c3, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
      );
      wash.rotation.x = -Math.PI / 2;
      wash.position.set(x, -0.2, z);
      this.scene.add(wash);
    }

    this.buildClouds();
  }

  private buildClouds(): void {
    const texture = new THREE.TextureLoader().load('/assets/textures/skyfire-cloud-512.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    const cloudClusters = [
      [-42, -12, 1.1], [18, 20, 0.85], [65, -5, 1.25], [-78, 52, 0.92], [35, 83, 1.15], [-5, -77, 1]
    ] as const;
    for (const [x, z, scale] of cloudClusters) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xb8c2c0,
        transparent: true,
        opacity: 0.18,
        alphaTest: 0.018,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(25 * scale, 25 * scale), material);
      cloud.position.set(x, CLOUD_ALTITUDE, z);
      cloud.rotation.set(-Math.PI / 2, 0, scale * 1.73);
      cloud.renderOrder = 2;
      this.cloudMaterials.push(material);
      this.scene.add(cloud);
    }
  }

  private installSetDressing(): void {
    const base = this.assets.clone('island', [0x55625b, 0x2c3534, 0x69736b]);
    base.position.set(78, -5.8, 78);
    base.rotation.y = -0.32;
    this.scene.add(base);

    const boats = [
      [-64, -0.3, 24, -0.7, 0.82], [59, -0.3, 13, 1.05, 0.58]
    ] as const;
    for (const [x, y, z, rotation, scale] of boats) {
      const patrol = this.assets.clone('patrol', [0x29383b, 0x59635f, 0x151e21, 0x8f9b94]);
      patrol.position.set(x, y, z);
      patrol.rotation.y = rotation;
      patrol.scale.setScalar(scale);
      this.scene.add(patrol);
    }
  }

  private addAircraftAccents(root: THREE.Group, accent: number, player: boolean): void {
    const glow = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.18 });
    const spacing = player ? 0.82 : 0.64;
    for (const side of [-1, 1]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.43, 1.15, 8), glow);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(side * spacing, 0.36, -3.58);
      root.add(engine);
    }
  }

  private createPlayerManeuverJets(color: number, spacing: number, length: number): THREE.Group {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const jet = new THREE.Mesh(new THREE.ConeGeometry(spacing > 1 ? 0.16 : 0.28, length, 8), material);
      jet.rotation.x = -Math.PI / 2;
      jet.position.set(side * spacing, spacing > 1 ? 0.15 : 0.34, spacing > 1 ? -2.2 : -4.75);
      group.add(jet);
    }
    return group;
  }

  private createUnitVisual(key: ModelKey, palette: readonly number[], accent: number, ground: boolean): UnitVisual {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const model = this.assets.clone(key, palette);
    if (!ground) this.addAircraftAccents(model, accent, false);
    group.add(model);

    if (ground) {
      const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x293231, roughness: 0.9, metalness: 0.12 });
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.65, 0.55, 12), platformMaterial);
      platform.position.y = -0.28;
      group.add(platform);

      const serviceMark = new THREE.Mesh(
        new THREE.RingGeometry(3.75, 4.08, 32, 1, 0.16, Math.PI * 1.28),
        new THREE.MeshBasicMaterial({ color: 0xc4a55d, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
      );
      serviceMark.rotation.x = -Math.PI / 2;
      serviceMark.position.y = 0.015;
      group.add(serviceMark);
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
          new THREE.RingGeometry(5.15, 5.42, 40),
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
    if (enemy.kind === 'aa') return this.createUnitVisual('aa', [0x323b38, 0x59625a, 0x1b2424, 0xff5a5f], 0xff5a5f, true);
    if (enemy.kind === 'radar') return this.createUnitVisual('radar', [0x4b5550, 0x242d2c, 0xf5b84b], 0xf5b84b, true);
    if (enemy.kind === 'ace') return this.createUnitVisual('ace', [0x85283a, 0x261820, 0xffbc66, 0xd6aa6c], 0xffbc66, false);
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

  private createSensorMarker(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0x8aaab0, transparent: true, opacity: 0.48, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.075, 4, 24), material);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.7), material);
      bracket.position.x = side * 5.1;
      bracket.rotation.y = Math.PI / 2;
      group.add(bracket);
    }
    group.visible = false;
    group.renderOrder = 3;
    return group;
  }

  private createThreatBearing(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: 0xf5b84b,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const arc = new THREE.Mesh(new THREE.RingGeometry(4.7, 5.0, 30, 1, -Math.PI / 2 - 0.42, 0.84), material);
    arc.rotation.x = -Math.PI / 2;
    group.add(arc);
    for (const side of [-1, 1]) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.82), material);
      tick.position.set(side * 2.12, 0.03, 4.25);
      tick.rotation.y = side * -0.46;
      group.add(tick);
    }
    group.visible = false;
    group.renderOrder = 7;
    return group;
  }

  private syncThreatBearing(state: SliceState): void {
    const projectile = state.projectiles
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.position.x - state.player.position.x, candidate.position.z - state.player.position.z) }))
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    const telegraph = state.enemies
      .filter((enemy) => enemy.alive && enemy.telegraph > 0)
      .sort((a, b) => b.telegraph - a.telegraph)[0];
    const threat = projectile?.position ?? telegraph?.position;
    this.threatBearing.visible = Boolean(threat) && !state.ended;
    if (!threat) return;

    const dx = threat.x - state.player.position.x;
    const dz = threat.z - state.player.position.z;
    this.threatBearing.position.set(state.player.position.x, state.player.position.y + 0.16, state.player.position.z);
    this.threatBearing.rotation.y = Math.atan2(dx, dz);
    this.threatBearing.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
      child.material.color.setHex(projectile ? 0xff5a5f : 0xf5b84b);
      child.material.opacity = projectile ? 0.9 : 0.68;
    });
  }

  private syncPlayer(state: SliceState): void {
    const player = state.player;
    this.playerVisual.group.position.set(player.position.x, player.position.y, player.position.z);
    const pitch = THREE.MathUtils.clamp(-player.verticalSpeed * 0.018, -0.3, 0.3);
    this.playerVisual.group.rotation.set(pitch, player.heading, player.bank, 'YXZ');
    this.playerVisual.shadow.position.set(player.position.x, 0.08, player.position.z);
    this.playerVisual.shadow.rotation.y = player.heading;
    const scale = 1 + player.position.y * 0.036;
    this.playerVisual.shadow.scale.set(scale, 0.035, scale);
    setShadowOpacity(this.playerVisual.shadow, Math.max(0.1, 0.48 - player.position.y * 0.009));
    this.playerAfterburner.visible = player.maneuver === 'EXTEND';
    if (this.playerAfterburner.visible) {
      const thrust = 0.82 + (player.speed - 44) / 34 + Math.sin(state.elapsed * 38) * 0.08;
      this.playerAfterburner.scale.set(1, 1, Math.max(0.72, thrust));
    }
    this.playerBrakeVapor.visible = player.maneuver === 'BREAK' && Math.abs(player.bank) > 0.14;
    if (this.playerBrakeVapor.visible) {
      const load = 0.75 + Math.abs(player.bank) * 0.65 + Math.sin(state.elapsed * 31) * 0.06;
      this.playerBrakeVapor.scale.set(1, 1, load);
    }
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

      const isAircraft = enemy.kind === 'interceptor' || enemy.kind === 'ace';
      visual.group.position.set(enemy.position.x, enemy.position.y + (isAircraft ? 0 : 2.8), enemy.position.z);
      const pitch = isAircraft ? THREE.MathUtils.clamp(-enemy.verticalSpeed * 0.02, -0.28, 0.28) : 0;
      visual.group.rotation.set(pitch, enemy.heading, isAircraft ? enemy.bank : 0, 'YXZ');
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
      const lockPulse = state.lockReady ? Math.sin(state.elapsed * 16) * 0.09 : 0;
      this.lockMarker.scale.setScalar(1.28 - state.lockProgress * 0.34 + lockPulse);
      this.lockMarker.rotation.y = state.elapsed * (state.lockReady ? 1.8 : 0.65);
      this.lockMarker.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
        child.material.color.setHex(state.lockPerfect ? 0xffd37a : state.lockReady ? 0x70eaff : 0xffce75);
        child.material.opacity = 0.42 + state.lockProgress * 0.5;
      });
    }

    const sensorTarget = state.sensorTargetId === null || state.sensorTargetId === state.lockTargetId
      ? null
      : state.enemies.find((enemy) => enemy.id === state.sensorTargetId && enemy.alive);
    this.sensorMarker.visible = Boolean(sensorTarget);
    if (sensorTarget) {
      const ground = sensorTarget.kind === 'aa' || sensorTarget.kind === 'radar';
      this.sensorMarker.position.set(sensorTarget.position.x, sensorTarget.position.y + (ground ? 4.4 : 0.4), sensorTarget.position.z);
      this.sensorMarker.rotation.y = -state.elapsed * 0.35;
      this.sensorMarker.scale.setScalar(1 + Math.sin(state.elapsed * 4) * 0.04);
      this.sensorMarker.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
        child.material.color.setHex(state.targetLayerMatch ? 0x8aaab0 : 0x6c7d91);
        child.material.opacity = state.targetLayerMatch ? 0.5 : 0.32;
      });
    }
  }

  private syncEnemyProjectiles(state: SliceState): void {
    const activeIds = new Set(state.projectiles.map((projectile) => projectile.id));
    for (const [id, visual] of this.enemyProjectileVisuals) {
      if (activeIds.has(id)) continue;
      this.scene.remove(visual.group, visual.trail);
      visual.group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material.dispose();
      });
      visual.trail.geometry.dispose();
      visual.trail.material.dispose();
      this.enemyProjectileVisuals.delete(id);
    }

    for (const projectile of state.projectiles) {
      let visual = this.enemyProjectileVisuals.get(projectile.id);
      if (!visual) {
        visual = this.createEnemyProjectileVisual(projectile);
        this.enemyProjectileVisuals.set(projectile.id, visual);
        this.scene.add(visual.group, visual.trail);
      }
      visual.group.position.copy(toVector3(projectile.position));
      const velocity = toVector3(projectile.velocity);
      if (velocity.lengthSq() > 0.001) {
        const direction = velocity.normalize();
        visual.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        const tail = toVector3(projectile.position).addScaledVector(direction, projectile.kind === 'flak' ? -4.2 : -7.2);
        setLinePoints(visual.trail.geometry, [tail, toVector3(projectile.position)]);
      }
    }
  }

  private createEnemyProjectileVisual(projectile: EnemyProjectileState): EnemyProjectileVisual {
    const flak = projectile.kind === 'flak';
    const color = flak ? 0xff704f : 0xffbc66;
    const group = new THREE.Group();
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: flak ? 0xffe0a3 : 0xfff2cf,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(
      flak ? new THREE.IcosahedronGeometry(0.62, 1) : new THREE.CylinderGeometry(0.12, 0.24, 1.7, 6),
      coreMaterial
    );
    group.add(core);
    if (flak) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 10, 7),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, wireframe: true, depthWrite: false })
      );
      group.add(shell);
    }
    group.renderOrder = 6;
    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: flak ? 0.7 : 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    trail.frustumCulled = false;
    trail.renderOrder = 5;
    return { group, trail };
  }

  private syncPlayerMissiles(state: SliceState): void {
    const activeIds = new Set(state.playerMissiles.map((missile) => missile.id));
    for (const [id, visual] of this.playerMissileVisuals) {
      if (activeIds.has(id)) continue;
      this.scene.remove(visual.group, visual.trail);
      visual.group.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material.dispose();
      });
      visual.trail.geometry.dispose();
      visual.trail.material.dispose();
      this.playerMissileVisuals.delete(id);
    }

    for (const missile of state.playerMissiles) {
      let visual = this.playerMissileVisuals.get(missile.id);
      if (!visual) {
        visual = this.createPlayerMissileVisual(missile);
        this.playerMissileVisuals.set(missile.id, visual);
        this.scene.add(visual.group, visual.trail);
      }
      const position = toVector3(missile.position);
      visual.group.position.copy(position);
      const velocity = toVector3(missile.velocity);
      if (velocity.lengthSq() > 0.001) visual.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.normalize());
      const last = visual.points.at(-1);
      if (!last || last.distanceTo(position) > 0.55) {
        if (last && last.distanceTo(position) > 28) visual.points.length = 0;
        visual.points.push(position.clone());
        if (visual.points.length > 16) visual.points.shift();
        setLinePoints(visual.trail.geometry, visual.points);
      }
      visual.trail.material.opacity = missile.stage === 'POWERED' ? 0.88 : 0.24;
      visual.group.scale.setScalar(missile.quality === 'PERFECT' ? 1.16 : 1);
    }
  }

  private createPlayerMissileVisual(missile: PlayerMissileState): PlayerMissileVisual {
    const color = missile.quality === 'PERFECT' ? 0xffd37a : 0x70eaff;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 1.55, 7),
      new THREE.MeshStandardMaterial({ color: 0xeef8f8, emissive: color, emissiveIntensity: 1.35, roughness: 0.26, metalness: 0.3 })
    );
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.52, 7),
      new THREE.MeshStandardMaterial({ color: 0xf8ffff, emissive: color, emissiveIntensity: 0.8, roughness: 0.2 })
    );
    nose.position.y = 1.02;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.2, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    flame.position.y = -1.28;
    flame.rotation.z = Math.PI;
    group.add(body, nose, flame);
    group.renderOrder = 7;
    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    trail.frustumCulled = false;
    trail.renderOrder = 6;
    return { group, trail, points: [] };
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

  private updateClouds(state: SliceState, dt: number): void {
    const altitudeBlend = THREE.MathUtils.smoothstep(state.player.position.y, CLOUD_ALTITUDE - 5, CLOUD_ALTITUDE + 5);
    const opacity = THREE.MathUtils.lerp(0.20, 0.09, altitudeBlend);
    for (const material of this.cloudMaterials) material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, expLerp(3.4, dt));
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
