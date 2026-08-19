import * as THREE from 'three';
import { isGroundTargetKind, visualAltitude } from '../core/altitude';
import {
  createAircraft,
  createAircraftShadow,
  createGroundTarget,
  createLockMarker
} from './procedural-assets';
import { RibbonTrail } from './ribbon-trail';
import {
  DEFAULT_TARGETING_CONFIG,
  evaluateTarget,
  normalizedLockProgress,
  type ShooterSnapshot,
  type TargetableSnapshot
} from '../core/targeting';
import type {
  LegacyEntityId,
  LegacyEntitySnapshot,
  LegacyParticleSnapshot,
  LegacyProjectileSnapshot,
  LegacySnapshot,
  LegacyWorldSnapshot,
  RenderViewport
} from './snapshot';

const WORLD_SCALE = 0.02;
const ALTITUDE_SCALE = 0.003;
const GROUND_Y = 0;
const MAX_PROJECTILES = 160;
const MAX_PARTICLES = 220;
const TAU = Math.PI * 2;

interface UnitView {
  root: THREE.Group;
  shadow: THREE.Mesh;
  trail?: RibbonTrail;
  kind: string;
  active: boolean;
}

interface ProjectileView {
  root: THREE.Group;
  beam: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  head: THREE.Mesh;
}

interface ParticleView {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

function finite(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function keyFor(value: LegacyEntityId | undefined, index: number, prefix: string): string {
  return `${prefix}:${value === undefined ? index : String(value)}`;
}

function worldPosition(x: number, y: number, altitude = 0): THREE.Vector3 {
  return new THREE.Vector3(x * WORLD_SCALE, Math.max(GROUND_Y + 0.15, altitude * ALTITUDE_SCALE), y * WORLD_SCALE);
}

function colorFrom(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entityKind(entity: LegacyEntitySnapshot): string {
  return String(entity.kind || 'fighter').toLowerCase();
}

function isAlive(entity: LegacyEntitySnapshot): boolean {
  return entity.alive !== false && entity.dead !== true;
}

function makeBeam(color: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  geometry.setDrawRange(0, 0);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
}

/**
 * Production world renderer for the migrated game.
 * It is intentionally renderer-only: gameplay, progression and HUD remain in
 * the legacy bridge until their v2 adapters are migrated.
 */
export class SkyfireWorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // Low-FOV tactical overview: aircraft stay small enough to read the merge,
  // while terrain and trails remain visible as the battle context.
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 900);
  private readonly player: UnitView;
  private readonly allies = new Map<string, UnitView>();
  private readonly enemies = new Map<string, UnitView>();
  private readonly projectilePool: ProjectileView[] = [];
  private readonly particlePool: ParticleView[] = [];
  private readonly lockMarker = createLockMarker(0xffd166);
  private readonly lockLine = makeBeam(0xffd166);
  private readonly playerTrail = new RibbonTrail(0x63dfff);
  private worldSeed: number | undefined;
  private worldGroup = new THREE.Group();
  private cameraReady = false;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x071923, 0);
    this.scene.fog = new THREE.FogExp2(0x071923, 0.0042);
    this.player = this.makeUnit('player', 'fighter', 'player');
    this.scene.add(this.worldGroup, this.player.root, this.player.shadow, this.playerTrail.object, this.lockMarker, this.lockLine);
    this.lockLine.visible = false;
    this.createLighting();
    for (let index = 0; index < MAX_PROJECTILES; index += 1) this.projectilePool.push(this.createProjectileView());
    for (let index = 0; index < MAX_PARTICLES; index += 1) this.particlePool.push(this.createParticleView());
    this.resize({ width: canvas.clientWidth || 1, height: canvas.clientHeight || 1, dpr: window.devicePixelRatio || 1 });
  }

  resize(viewport: RenderViewport): void {
    const dpr = Math.min(2, Math.max(1, finite(viewport.dpr, 1)));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, viewport.width), Math.max(1, viewport.height), false);
    this.camera.aspect = Math.max(0.1, viewport.width / Math.max(1, viewport.height));
    this.camera.updateProjectionMatrix();
  }

  render(snapshot: LegacySnapshot, dt = 1 / 60): void {
    const safeDt = Math.min(0.1, Math.max(0, finite(dt, 1 / 60)));
    this.elapsed = finite(snapshot.gameTime, this.elapsed + safeDt);
    this.syncWorld(snapshot.world);
    this.syncPlayer(snapshot);
    this.syncUnits(this.allies, snapshot.allies, 'ally');
    this.syncUnits(this.enemies, snapshot.enemies, 'enemy');
    this.syncProjectiles(snapshot.bullets, snapshot.missiles, snapshot.player.altitude);
    this.syncParticles(snapshot.particles);
    this.syncLock(snapshot);
    this.updateCamera(snapshot, safeDt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.playerTrail.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
  }

  projectEntity(entity: LegacyEntitySnapshot): { x: number; y: number; visible: boolean } {
    const point = worldPosition(finite(entity.x), finite(entity.y), visualAltitude(entity));
    point.project(this.camera);
    const width = Math.max(1, this.renderer.domElement.clientWidth);
    const height = Math.max(1, this.renderer.domElement.clientHeight);
    return {
      x: (point.x * 0.5 + 0.5) * width,
      y: (-point.y * 0.5 + 0.5) * height,
      visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1.08 && Math.abs(point.y) <= 1.08
    };
  }

  private createLighting(): void {
    const sun = new THREE.DirectionalLight(0xffe7bf, 3.1);
    sun.position.set(-40, 90, -28);
    this.scene.add(
      new THREE.HemisphereLight(0xb8eaff, 0x142a29, 2.6),
      sun
    );
  }

  private makeUnit(faction: 'player' | 'ally' | 'enemy', kind: string, role: 'player' | 'ally' | 'enemy'): UnitView {
    const ground = isGroundTargetKind(kind);
    const root = ground ? createGroundTarget(kind) : createAircraft(faction, kind);
    const shadow = createAircraftShadow();
    if (ground) shadow.scale.set(1.5, 1.1, 1);
    const trail = role === 'player' || role === 'ally' || (!ground && role === 'enemy')
      ? new RibbonTrail(role === 'enemy' ? 0xff5669 : role === 'ally' ? 0x6dffd0 : 0x63dfff)
      : undefined;
    if (trail) this.scene.add(trail.object);
    return { root, shadow, trail, kind, active: false };
  }

  private syncPlayer(snapshot: LegacySnapshot): void {
    const player = snapshot.player;
    const position = worldPosition(player.x, player.y, player.altitude);
    this.player.root.visible = player.alive !== false;
    this.player.shadow.visible = player.alive !== false;
    this.player.root.position.copy(position);
    // Three positive Y rotation maps +X toward -Z, hence the negative sign.
    this.player.root.rotation.set(0, -finite(player.heading), finite(player.bank) * 0.72, 'YXZ');
    this.player.shadow.position.set(position.x, GROUND_Y + 0.025, position.z);
    const altitude = Math.max(0, finite(player.altitude));
    const shadowScale = 1 + altitude / 4200;
    this.player.shadow.scale.set(shadowScale * 1.4, shadowScale * 0.9, shadowScale);
    (this.player.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.3 - altitude / 26000);
    this.playerTrail.update(position, this.elapsed);
  }

  private syncUnits(target: Map<string, UnitView>, entities: LegacyEntitySnapshot[], role: 'ally' | 'enemy'): void {
    const active = new Set<string>();
    entities.forEach((entity, index) => {
      const key = keyFor(entity.id, index, role);
      active.add(key);
      const kind = entityKind(entity);
      let view = target.get(key);
      if (!view || view.kind !== kind) {
        if (view) this.removeUnit(view);
        view = this.makeUnit(role, kind, role);
        target.set(key, view);
        this.scene.add(view.root, view.shadow);
      }
      view.active = isAlive(entity);
      view.root.visible = view.active;
      view.shadow.visible = view.active;
      if (!view.active) return;
      const position = worldPosition(finite(entity.x), finite(entity.y), visualAltitude(entity));
      view.root.position.copy(position);
      view.root.rotation.set(0, -finite(entity.heading), finite(entity.bank) * 0.7, 'YXZ');
      view.shadow.position.set(position.x, GROUND_Y + 0.022, position.z);
      const altitude = visualAltitude(entity);
      const ground = isGroundTargetKind(kind);
      const scale = ground ? 1 : 1 + altitude / 4000;
      view.shadow.scale.set(scale, scale * 0.78, scale);
      if (view.trail) view.trail.update(position, this.elapsed);
    });
    for (const [key, view] of target) {
      if (active.has(key)) continue;
      this.removeUnit(view);
      target.delete(key);
    }
  }

  private removeUnit(view: UnitView): void {
    this.scene.remove(view.root, view.shadow);
    if (view.trail) {
      this.scene.remove(view.trail.object);
      view.trail.clear();
    }
  }

  private syncWorld(world: LegacyWorldSnapshot): void {
    const seed = finite(world.seed, 0);
    if (this.worldSeed === seed) return;
    this.worldSeed = seed;
    this.disposeGroupChildren(this.worldGroup);
    this.worldGroup.clear();
    const ocean = new THREE.Mesh(
      // Extend the water beyond the legacy map bounds so the tactical camera
      // never reveals a hard rectangular edge while looking toward the horizon.
      new THREE.PlaneGeometry(Math.max(1000, world.W * WORLD_SCALE * 4), Math.max(1000, world.H * WORLD_SCALE * 4)),
      new THREE.MeshStandardMaterial({ color: colorFrom(world.theme?.water, 0x0a4e5c), roughness: 0.88, metalness: 0.08 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(world.W * WORLD_SCALE * 0.5, -0.08, world.H * WORLD_SCALE * 0.5);
    this.worldGroup.add(ocean);
    for (const island of world.islands || []) {
      const points = island.pts?.map((point) => new THREE.Vector2(point.x * WORLD_SCALE, point.y * WORLD_SCALE));
      const radius = Math.max(2, finite(island.rad, 120) * WORLD_SCALE);
      const shape = points && points.length >= 3 ? new THREE.Shape(points) : new THREE.Shape().absarc(0, 0, radius, 0, TAU, false);
      const islandMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: island.city ? 0x8a714f : 0x4c7857, roughness: 1, flatShading: true }));
      islandMesh.rotation.x = -Math.PI / 2;
      if (!points || points.length < 3) islandMesh.position.set(finite(island.cx) * WORLD_SCALE, 0.03, finite(island.cy) * WORLD_SCALE);
      else islandMesh.position.y = 0.03;
      this.worldGroup.add(islandMesh);
      if (island.city) {
        const city = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.75, 0.4, radius * 0.5), new THREE.MeshStandardMaterial({ color: 0x283d43, roughness: 0.8 }));
        city.position.set(finite(island.cx) * WORLD_SCALE, 0.28, finite(island.cy) * WORLD_SCALE);
        this.worldGroup.add(city);
      }
    }
    for (const cloud of (world.clouds || []).slice(0, 36)) {
      const radius = Math.max(0.55, finite(cloud.r, 120) * WORLD_SCALE * 0.22);
      const cluster = new THREE.Group();
      cluster.position.set(finite(cloud.x) * WORLD_SCALE, 30 + finite(cloud.r, 120) * ALTITUDE_SCALE * 2, finite(cloud.y) * WORLD_SCALE);
      const opacity = Math.max(0.08, Math.min(0.28, finite(cloud.alpha, 0.2) * 0.32));
      for (let index = 0; index < 3; index += 1) {
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius * (0.72 + index * 0.16), 1),
          new THREE.MeshStandardMaterial({ color: index === 1 ? 0xc6e7eb : 0xe1f4f4, transparent: true, opacity, roughness: 1, depthWrite: false, flatShading: true })
        );
        puff.position.set((index - 1) * radius * 0.72, (index % 2) * radius * 0.18, Math.sin(index * 1.7) * radius * 0.34);
        puff.scale.set(1.5, 0.42, 0.9);
        puff.renderOrder = 2;
        cluster.add(puff);
      }
      this.worldGroup.add(cluster);
    }
    const grid = new THREE.GridHelper(Math.max(100, Math.max(world.W, world.H) * WORLD_SCALE), 34, 0x3a9aa3, 0x16444c);
    grid.position.set(world.W * WORLD_SCALE * 0.5, 0.02, world.H * WORLD_SCALE * 0.5);
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
      material.transparent = true;
      material.opacity = 0.13;
      material.depthWrite = false;
    }
    this.worldGroup.add(grid);
  }

  private disposeGroupChildren(group: THREE.Group): void {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  private createProjectileView(): ProjectileView {
    const root = new THREE.Group();
    const beam = makeBeam(0xffffff);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending }));
    root.add(beam, head);
    root.visible = false;
    this.scene.add(root);
    return { root, beam, head };
  }

  private syncProjectiles(bullets: LegacyProjectileSnapshot[], missiles: LegacyProjectileSnapshot[], playerAltitude = 3500): void {
    const all = [...bullets.map((item) => ({ item, missile: false })), ...missiles.map((item) => ({ item, missile: true }))];
    for (let index = 0; index < this.projectilePool.length; index += 1) {
      const view = this.projectilePool[index];
      const entry = all[index];
      if (!entry) {
        view.root.visible = false;
        continue;
      }
      const item = entry.item;
      const fallbackAltitude = item.enemy ? 4200 : playerAltitude;
      const point = worldPosition(finite(item.x), finite(item.y), finite(item.altitude, fallbackAltitude));
      const heading = finite(item.heading, Math.atan2(finite(item.vy), finite(item.vx)));
      const length = entry.missile ? 1.2 : 0.72;
      const direction = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
      const start = point.clone().sub(direction.clone().multiplyScalar(length));
      const positions = view.beam.geometry.getAttribute('position') as THREE.BufferAttribute;
      positions.setXYZ(0, start.x, start.y, start.z);
      positions.setXYZ(1, point.x, point.y, point.z);
      positions.needsUpdate = true;
      view.beam.geometry.setDrawRange(0, 2);
      const color = entry.missile ? (item.enemy ? 0xff9a59 : 0x9ef6ff) : (item.enemy ? 0xff5d60 : 0xffed9a);
      (view.beam.material as THREE.LineBasicMaterial).color.setHex(color);
      (view.head.material as THREE.MeshBasicMaterial).color.setHex(color);
      view.head.position.copy(point);
      view.root.visible = finite(item.life, 1) > 0;
    }
  }

  private createParticleView(): ParticleView {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), material);
    mesh.visible = false;
    mesh.renderOrder = 7;
    this.scene.add(mesh);
    return { mesh, material };
  }

  private syncParticles(particles: LegacyParticleSnapshot[]): void {
    for (let index = 0; index < this.particlePool.length; index += 1) {
      const view = this.particlePool[index];
      const particle = particles[index];
      if (!particle || finite(particle.life, 1) <= 0) {
        view.mesh.visible = false;
        continue;
      }
      const position = worldPosition(finite(particle.x), finite(particle.y), finite(particle.altitude, 0));
      view.mesh.position.copy(position);
      const life = Math.max(0, finite(particle.life, 1));
      const maxLife = Math.max(life, finite(particle.maxLife, 1));
      view.material.opacity = Math.min(1, finite(particle.alpha, 1)) * Math.min(1, life / maxLife * 2);
      view.material.color.setHex(colorFrom(particle.color, particle.type === 'smoke' ? 0x93a8ad : particle.type === 'fire' ? 0xffa34f : 0x9eeeff));
      const size = Math.max(0.05, finite(particle.size, 6) * WORLD_SCALE * (particle.type === 'ring' ? 1.8 : 1));
      view.mesh.scale.setScalar(size * (1 + (1 - life / maxLife) * 2));
      view.mesh.visible = true;
    }
  }

  private syncLock(snapshot: LegacySnapshot): void {
    const targetId = snapshot.lockTargetId ?? snapshot.player.targetId;
    const target = snapshot.player.target || (targetId === undefined || targetId === null
      ? undefined
      : [...snapshot.enemies, ...snapshot.allies].find((entity) => entity.id !== undefined && String(entity.id) === String(targetId)));
    if (!target || !isAlive(target)) {
      this.lockMarker.visible = false;
      this.lockLine.visible = false;
      return;
    }
    const targetAltitude = visualAltitude(target);
    const targetPosition = worldPosition(finite(target.x), finite(target.y), targetAltitude);
    // Targeting thresholds are legacy gameplay units. Keep this calculation in
    // logical coordinates; `worldPosition` is a visual-only scale for Three.
    const shooter: ShooterSnapshot = {
      position: { x: finite(snapshot.player.x), y: finite(snapshot.player.altitude), z: finite(snapshot.player.y) },
      heading: finite(snapshot.player.heading)
    };
    const targetable: TargetableSnapshot = {
      id: target.id,
      position: { x: finite(target.x), y: targetAltitude, z: finite(target.y) },
      alive: target.alive,
      dead: target.dead,
      enemy: true,
      kind: target.kind
    };
    const config = snapshot.targeting || DEFAULT_TARGETING_CONFIG;
    const evaluation = evaluateTarget(shooter, targetable, config);
    const progress = normalizedLockProgress(snapshot.targeting?.lock, config.lockTime);
    const color = progress >= 0.999 && evaluation.gunSolution
      ? 0x72ff93
      : progress >= 0.5
        ? 0xffd166
        : 0xff6476;
    this.setLockColor(color);
    this.lockMarker.position.copy(targetPosition);
    const positions = this.lockLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const playerPosition = worldPosition(snapshot.player.x, snapshot.player.y, snapshot.player.altitude);
    positions.setXYZ(0, playerPosition.x, playerPosition.y + 0.12, playerPosition.z);
    positions.setXYZ(1, targetPosition.x, targetPosition.y + 0.12, targetPosition.z);
    positions.needsUpdate = true;
    this.lockLine.geometry.setDrawRange(0, 2);
    this.lockMarker.visible = true;
    this.lockMarker.scale.setScalar(0.78 + progress * 0.32 + 0.08 * Math.sin(this.elapsed * 8));
  }

  private setLockColor(color: number): void {
    (this.lockLine.material as THREE.LineBasicMaterial).color.setHex(color);
    this.lockMarker.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material instanceof THREE.MeshBasicMaterial) material.color.setHex(color);
    });
  }

  private updateCamera(snapshot: LegacySnapshot, dt: number): void {
    const playerPosition = worldPosition(snapshot.player.x, snapshot.player.y, snapshot.player.altitude);
    const focus = playerPosition.clone().setY(Math.max(0.5, playerPosition.y * 0.35));
    const altitude = Math.max(0, finite(snapshot.player.altitude));
    const cameraDistance = 40;
    const heading = finite(snapshot.player.heading);
    const headingUp = snapshot.cameraMode === 'heading-up';
    const offsetX = headingUp ? -Math.cos(heading) * cameraDistance : 0;
    const offsetZ = headingUp ? -Math.sin(heading) * cameraDistance : cameraDistance;
    const desired = new THREE.Vector3(
      playerPosition.x + offsetX,
      112 + altitude * ALTITUDE_SCALE * 0.2,
      playerPosition.z + offsetZ
    );
    if (!this.cameraReady) {
      this.camera.position.copy(desired);
      this.cameraReady = true;
    } else {
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4.5));
    }
    const shake = finite(snapshot.camera.shake, 0) * 0.002;
    if (shake > 0) {
      this.camera.position.x += Math.sin(this.elapsed * 47) * shake;
      this.camera.position.z += Math.cos(this.elapsed * 39) * shake;
    }
    this.camera.lookAt(focus);
  }
}

export function createSkyfireWorldRenderer(canvas: HTMLCanvasElement): SkyfireWorldRenderer {
  return new SkyfireWorldRenderer(canvas);
}
