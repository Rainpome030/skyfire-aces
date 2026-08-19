import * as THREE from 'three';

export interface TrailSample {
  x: number;
  y: number;
  z: number;
}

export class RibbonTrail {
  readonly object: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly samples: TrailSample[] = [];
  private lastSampleTime = Number.NEGATIVE_INFINITY;

  constructor(color: number, private readonly capacity = 52) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    const base = new THREE.Color(color);
    for (let index = 0; index < capacity; index += 1) {
      const fade = Math.pow(index / Math.max(1, capacity - 1), 1.45);
      this.colors[index * 3] = base.r * fade;
      this.colors[index * 3 + 1] = base.g * fade;
      this.colors[index * 3 + 2] = base.b * fade;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.object = new THREE.Line(geometry, trailMaterial);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  update(position: TrailSample, time: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && Math.hypot(last.x - position.x, last.y - position.y, last.z - position.z) > 9) this.clear();
    if (time - this.lastSampleTime < 0.055) return;
    this.lastSampleTime = time;
    this.samples.push({ ...position });
    if (this.samples.length > this.capacity) this.samples.shift();
    for (let index = 0; index < this.samples.length; index += 1) {
      const sample = this.samples[index];
      this.positions[index * 3] = sample.x;
      this.positions[index * 3 + 1] = sample.y;
      this.positions[index * 3 + 2] = sample.z;
    }
    const attribute = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    this.object.geometry.setDrawRange(0, this.samples.length);
  }

  clear(): void {
    this.samples.length = 0;
    this.lastSampleTime = Number.NEGATIVE_INFINITY;
    this.object.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

