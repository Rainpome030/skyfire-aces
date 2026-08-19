import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type ModelKey = 'player' | 'interceptor' | 'aa' | 'radar' | 'hangar';

const MODEL_URLS: Record<ModelKey, string> = {
  player: '/assets/models/skyfire-player-fighter.glb',
  interceptor: '/assets/models/skyfire-interceptor.glb',
  aa: '/assets/models/skyfire-aa-turret.glb',
  radar: '/assets/models/skyfire-radar.glb',
  hangar: '/assets/models/skyfire-hangar.glb'
};

const TARGET_SPANS: Record<ModelKey, number> = {
  player: 9.2,
  interceptor: 8.1,
  aa: 5.8,
  radar: 7.2,
  hangar: 11.5
};

function makeMaterial(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.46,
    metalness: 0.42,
    flatShading: true
  });
}

export class ModelAssets {
  private readonly sources = new Map<ModelKey, THREE.Group>();

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const entries = Object.entries(MODEL_URLS) as [ModelKey, string][];
    const loaded = await Promise.all(entries.map(async ([key, url]) => {
      const gltf = await loader.loadAsync(url);
      return [key, gltf.scene] as const;
    }));
    for (const [key, scene] of loaded) this.sources.set(key, scene);
  }

  clone(key: ModelKey, palette: readonly number[]): THREE.Group {
    const source = this.sources.get(key);
    if (!source) throw new Error(`Model asset is not loaded: ${key}`);

    const model = source.clone(true);
    let meshIndex = 0;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const color = palette[meshIndex % Math.max(1, palette.length)] ?? 0x7ea1aa;
      const hot = color === 0x70eaff || color === 0xffbc66 || color === 0xff556c;
      child.material = makeMaterial(color, hot ? color : 0x000000, hot ? 0.24 : 0);
      child.castShadow = false;
      child.receiveShadow = false;
      meshIndex += 1;
    });

    const initialBox = new THREE.Box3().setFromObject(model);
    const size = initialBox.getSize(new THREE.Vector3());
    const horizontalSpan = Math.max(0.001, size.x, size.z);
    model.scale.setScalar(TARGET_SPANS[key] / horizontalSpan);
    model.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(model);
    const center = scaledBox.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaledBox.min.y;

    const pivot = new THREE.Group();
    pivot.add(model);
    return pivot;
  }

  silhouette(source: THREE.Object3D): THREE.Group {
    const clone = source.clone(true);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = new THREE.MeshBasicMaterial({
        color: 0x010608,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      });
    });
    const group = new THREE.Group();
    group.add(clone);
    return group;
  }
}
