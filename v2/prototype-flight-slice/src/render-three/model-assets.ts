import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type ModelKey = 'player' | 'interceptor' | 'ace' | 'aa' | 'radar' | 'island' | 'patrol';

const MODEL_URLS: Record<ModelKey, string> = {
  player: '/assets/models/skyfire-player-f14.glb',
  interceptor: '/assets/models/skyfire-interceptor-rafale.glb',
  ace: '/assets/models/skyfire-ace-f15.glb',
  aa: '/assets/models/skyfire-aa-turret-pbr.glb',
  radar: '/assets/models/skyfire-radar.glb',
  island: '/assets/models/skyfire-military-island.glb',
  patrol: '/assets/models/skyfire-patrol-boat.glb'
};

const TARGET_SPANS: Record<ModelKey, number> = {
  player: 10.8,
  interceptor: 9.4,
  ace: 10.6,
  aa: 5.8,
  radar: 7.2,
  island: 46,
  patrol: 15
};

function makeMaterial(color: number, emissive = 0x000000, emissiveIntensity = 0, smooth = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.46,
    metalness: 0.42,
    flatShading: !smooth
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
      const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
      const mappedMaterials = sourceMaterials.map((sourceMaterial, materialIndex) => {
        if (key === 'island' && sourceMaterial instanceof THREE.MeshStandardMaterial) {
          const material = sourceMaterial.clone();
          material.color.multiply(new THREE.Color(0x7d8b83));
          material.roughness = 0.88;
          material.metalness = 0.08;
          material.emissive.setHex(0x000000);
          material.emissiveIntensity = 0;
          return material;
        }
        const color = palette[(meshIndex + materialIndex) % Math.max(1, palette.length)] ?? 0x7ea1aa;
        const hot = color === 0x70eaff || color === 0xffbc66 || color === 0xff556c;
        return makeMaterial(color, hot ? color : 0x000000, hot ? 0.24 : 0, key === 'aa' || key === 'patrol');
      });
      child.material = Array.isArray(child.material) ? mappedMaterials : mappedMaterials[0]!;
      child.castShadow = false;
      child.receiveShadow = false;
      meshIndex += sourceMaterials.length;
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
