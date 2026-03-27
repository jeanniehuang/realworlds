import { PackedSplats } from '@sparkjsdev/spark'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

const MODEL_PATH = '/models/van-gogh-bedroom/'
const MODEL_FILE = 'Enter a title.obj'
const MATERIAL_FILE = 'Enter a title.mtl'
const TARGET_SPLATS = 18000

type TextureSampler = {
  data: Uint8ClampedArray
  width: number
  height: number
}

const textureSamplers = new WeakMap<THREE.Texture, TextureSampler>()

function fract(value: number) {
  return value - Math.floor(value)
}

function getFirstMaterial(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material[0] : material
}

function loadImageData(texture: THREE.Texture | null | undefined) {
  if (!texture?.image) {
    return null
  }

  const cached = textureSamplers.get(texture)

  if (cached) {
    return cached
  }

  const image = texture.image as CanvasImageSource & {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
  }
  const width = image.width ?? image.naturalWidth
  const height = image.height ?? image.naturalHeight

  if (!width || !height) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return null
  }

  context.drawImage(image, 0, 0, width, height)
  const sampler = {
    data: context.getImageData(0, 0, width, height).data,
    width,
    height,
  }
  textureSamplers.set(texture, sampler)

  return sampler
}

function sampleMaterialColor(
  material: THREE.MeshPhongMaterial,
  uv: THREE.Vector2 | null,
) {
  const color = material.color.clone()
  let opacity = material.opacity
  const sampler = loadImageData(material.map)

  if (sampler && uv) {
    const u = fract(uv.x)
    const v = 1 - fract(uv.y)
    const x = Math.min(sampler.width - 1, Math.floor(u * sampler.width))
    const y = Math.min(sampler.height - 1, Math.floor(v * sampler.height))
    const index = (y * sampler.width + x) * 4
    const sampled = new THREE.Color().setRGB(
      sampler.data[index] / 255,
      sampler.data[index + 1] / 255,
      sampler.data[index + 2] / 255,
      THREE.SRGBColorSpace,
    )

    color.multiply(sampled)
    opacity *= sampler.data[index + 3] / 255
  }

  return {
    color,
    opacity: clamp(opacity, 0.05, 1),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function measureMeshArea(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')

  if (!position) {
    return 0
  }

  const index = geometry.getIndex()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  let area = 0

  const faces = index ? index.count / 3 : position.count / 3

  for (let face = 0; face < faces; face += 1) {
    const i0 = index ? index.getX(face * 3) : face * 3
    const i1 = index ? index.getX(face * 3 + 1) : face * 3 + 1
    const i2 = index ? index.getX(face * 3 + 2) : face * 3 + 2

    a.fromBufferAttribute(position, i0)
    b.fromBufferAttribute(position, i1)
    c.fromBufferAttribute(position, i2)

    area += new THREE.Triangle(a, b, c).getArea()
  }

  return area
}

async function loadBedroomObject() {
  const materialLoader = new MTLLoader()
  materialLoader.setPath(MODEL_PATH)
  materialLoader.setResourcePath(MODEL_PATH)
  const materials = await materialLoader.loadAsync(MATERIAL_FILE)
  materials.preload()

  const objectLoader = new OBJLoader()
  objectLoader.setMaterials(materials)
  objectLoader.setPath(MODEL_PATH)
  const object = await objectLoader.loadAsync(MODEL_FILE)

  object.rotation.y = Math.PI
  object.updateMatrixWorld(true)

  const initialBox = new THREE.Box3().setFromObject(object)
  const initialSize = initialBox.getSize(new THREE.Vector3())
  const longestEdge = Math.max(initialSize.x, initialSize.y, initialSize.z)
  const scale = 3.8 / longestEdge
  object.scale.setScalar(scale)
  object.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  object.position.x -= center.x
  object.position.y -= box.min.y + 1.18
  object.position.z -= box.max.z + 0.95
  object.updateMatrixWorld(true)

  return object
}

let bedroomSplatsPromise: Promise<PackedSplats> | null = null

export async function createBedroomSplats() {
  if (bedroomSplatsPromise) {
    return bedroomSplatsPromise
  }

  bedroomSplatsPromise = (async () => {
    const root = await loadBedroomObject()
    const meshEntries: {
      mesh: THREE.Mesh
      sampler: MeshSurfaceSampler
      area: number
      material: THREE.MeshPhongMaterial
    }[] = []

    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }

      const material = getFirstMaterial(object.material)

      if (!(material instanceof THREE.MeshPhongMaterial)) {
        return
      }

      const area = measureMeshArea(object.geometry) * object.scale.lengthSq() / 3

      if (area <= 0) {
        return
      }

      meshEntries.push({
        mesh: object,
        sampler: new MeshSurfaceSampler(object).build(),
        area,
        material,
      })
    })

    const totalArea = meshEntries.reduce((sum, entry) => sum + entry.area, 0)
    const splats = new PackedSplats({ maxSplats: TARGET_SPLATS })
    const position = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const uv = new THREE.Vector2()
    const quaternion = new THREE.Quaternion()
    const worldNormalMatrix = new THREE.Matrix3()

    meshEntries.forEach((entry, entryIndex) => {
      const allocated = Math.max(
        64,
        Math.round((entry.area / totalArea) * TARGET_SPLATS),
      )
      worldNormalMatrix.getNormalMatrix(entry.mesh.matrixWorld)

      for (let i = 0; i < allocated; i += 1) {
        entry.sampler.sample(position, normal, undefined, uv)
        position.applyMatrix4(entry.mesh.matrixWorld)
        normal.applyMatrix3(worldNormalMatrix).normalize()

        quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)

        const baseScale = 0.009 + (entry.area / totalArea) * 0.035
        const variance = 0.75 + ((i + entryIndex * 17) % 11) * 0.035
        const scales = new THREE.Vector3(
          baseScale * variance,
          baseScale * 0.75 * variance,
          baseScale * 0.16,
        )
        const sampled = sampleMaterialColor(entry.material, uv)

        splats.pushSplat(
          position,
          scales,
          quaternion,
          sampled.opacity,
          sampled.color,
        )
      }
    })

    splats.needsUpdate = true
    return splats
  })()

  return bedroomSplatsPromise
}
