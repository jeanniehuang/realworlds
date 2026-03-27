declare module '@sparkjsdev/spark' {
  import * as THREE from 'three';

  export class PackedSplats {
    dispose(): void;
  }

  export class SplatMesh extends THREE.Object3D {
    constructor(options?: { url?: string; packedSplats?: PackedSplats });
    initialized: Promise<SplatMesh>;
    packedSplats?: PackedSplats;
  }
}
