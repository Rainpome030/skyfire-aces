import * as THREE from 'three';

export type AircraftFaction = 'player' | 'ally' | 'enemy' | 'boss';

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function material(color: number, emissive = 0, intensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}:${emissive}:${intensity}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const created = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0.38,
    flatShading: true
  });
  materialCache.set(key, created);
  return created;
}

function flatMesh(vertices: number[], indices: number[], surface: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, surface);
}

/** Creates an inexpensive aircraft whose nose points along local +X. */
export function createAircraft(faction: AircraftFaction, kind = 'fighter'): THREE.Group {
  const boss = faction === 'boss' || /ace|boss|gunship|carrier/i.test(kind);
  const palette = faction === 'player'
    ? { body: 0x438dbd, dark: 0x17374d, glow: 0x6fe8ff }
    : faction === 'ally'
      ? { body: 0x3aa98e, dark: 0x163f39, glow: 0x74ffcf }
      : boss
        ? { body: 0x9c3041, dark: 0x351821, glow: 0xffbb68 }
        : { body: 0xb53a4d, dark: 0x3a1820, glow: 0xff6476 };
  const scale = boss ? 1.28 : 1;
  const root = new THREE.Group();

  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.22, 1.65, 7),
    material(palette.body)
  );
  fuselage.rotation.z = Math.PI / 2;
  root.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 7), material(palette.body));
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.12;
  root.add(nose);

  const wing = flatMesh(
    [
      0.58, 0, 0, -0.34, 0, 1.06, -0.12, 0.045, 0,
      0.58, 0, 0, -0.34, 0, -1.06, -0.12, 0.045, 0,
      -0.48, 0.02, 0, -0.8, 0.02, 0.5, -0.72, 0.08, 0,
      -0.48, 0.02, 0, -0.8, 0.02, -0.5, -0.72, 0.08, 0
    ],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    material(palette.body)
  );
  root.add(wing);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), material(0x102c3c, palette.glow, 0.12));
  canopy.scale.set(1.55, 0.58, 0.72);
  canopy.position.set(0.36, 0.18, 0);
  root.add(canopy);

  const engine = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), material(palette.glow, palette.glow, 1.4));
  engine.rotation.y = -Math.PI / 2;
  engine.position.x = -0.86;
  root.add(engine);

  if (boss) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 2.02), material(palette.glow, palette.glow, 0.45));
    stripe.position.set(-0.1, 0.06, 0);
    root.add(stripe);
  }
  root.scale.setScalar(scale);
  return root;
}

export function createGroundTarget(kind: string): THREE.Group {
  const root = new THREE.Group();
  const hostile = material(0x78313d);
  const dark = material(0x252c2d);
  const hot = material(0xff6a72, 0xff3f51, 0.8);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.18, 8), dark);
  base.position.y = 0.09;
  root.add(base);
  if (/radar/i.test(kind)) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.65, 6), hostile);
    mast.position.y = 0.48;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hot);
    dish.rotation.z = -0.4;
    dish.position.y = 0.82;
    root.add(mast, dish);
  } else {
    const turret = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.5), hostile);
    turret.position.y = 0.34;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.68, 6), hot);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.47, 0.5, 0);
    root.add(turret, barrel);
  }
  return root;
}

export function createAircraftShadow(): THREE.Mesh {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.22),
    new THREE.MeshBasicMaterial({
      color: 0x010708,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  return shadow;
}

export function createLockMarker(color = 0x74efff): THREE.Group {
  const root = new THREE.Group();
  const markerMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.045, 4, 32), markerMaterial);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  for (let index = 0; index < 4; index += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.055), markerMaterial);
    const angle = index * Math.PI / 2;
    tick.position.set(Math.cos(angle) * 1.44, 0, Math.sin(angle) * 1.44);
    tick.rotation.y = -angle;
    root.add(tick);
  }
  root.renderOrder = 8;
  root.visible = false;
  return root;
}

