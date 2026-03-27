declare module '@sparkjsdev/spark' {
  import * as THREE from 'three'

  export class PackedSplats {
    constructor(options?: { maxSplats?: number })
    numSplats: number
    needsUpdate: boolean
    dispose(): void
    pushSplat(
      center: THREE.Vector3,
      scales: THREE.Vector3,
      quaternion: THREE.Quaternion,
      opacity: number,
      color: THREE.Color,
    ): void
  }

  export class SplatMesh extends THREE.Object3D {
    constructor(options?: { packedSplats?: PackedSplats })
    initialized: Promise<SplatMesh>
    packedSplats?: PackedSplats
  }
}
