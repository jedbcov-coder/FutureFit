import * as THREE from 'three'
import { createRng } from './random.js'

const DISPOSABLE_TEXTURE_SLOTS = Object.freeze(['map', 'alphaMap', 'emissiveMap', 'normalMap'])
const GENERATED_TEXTURE_KEYS = Object.freeze(['canvasTexture', 'popTextTexture', 'pickupTexture'])
const MAX_PARTICLES = 95
const PATH_SEGMENT_COUNT = 28
const TREE_COUNT = 34
const FRUIT_COUNT = 42
const TWO_PI = Math.PI * 2
const DUMMY = new THREE.Object3D()

function disposeTexture(texture, disposedTextures) {
  if (!texture?.dispose || disposedTextures.has(texture)) return

  texture.dispose()
  disposedTextures.add(texture)
}

function disposeMaterialTextures(material, disposedTextures) {
  DISPOSABLE_TEXTURE_SLOTS.forEach((textureSlot) => {
    disposeTexture(material?.[textureSlot], disposedTextures)
  })
}

function disposeMaterial(material, disposedMaterials, disposedTextures) {
  if (!material) return

  disposeMaterialTextures(material, disposedTextures)

  if (material.dispose && !disposedMaterials.has(material)) {
    material.dispose()
    disposedMaterials.add(material)
  }
}

function disposeGeneratedCanvasTextures(object, disposedTextures) {
  const generatedTextures = object.userData?.generatedCanvasTextures ?? []

  GENERATED_TEXTURE_KEYS.forEach((textureKey) => {
    disposeTexture(object.userData?.[textureKey], disposedTextures)
  })

  generatedTextures.forEach((texture) => disposeTexture(texture, disposedTextures))
}

export function disposeSceneResources(scene) {
  const disposedGeometries = new Set()
  const disposedMaterials = new Set()
  const disposedTextures = new Set()

  scene.traverse((object) => {
    const isRenderableObject = object.isMesh || object.isSprite
    if (!isRenderableObject) return

    if (object.geometry?.dispose && !disposedGeometries.has(object.geometry)) {
      object.geometry.dispose()
      disposedGeometries.add(object.geometry)
    }

    if (Array.isArray(object.material)) {
      object.material.forEach((material) => disposeMaterial(material, disposedMaterials, disposedTextures))
    } else {
      disposeMaterial(object.material, disposedMaterials, disposedTextures)
    }

    disposeGeneratedCanvasTextures(object, disposedTextures)
  })

  return {
    geometries: disposedGeometries.size,
    materials: disposedMaterials.size,
    textures: disposedTextures.size,
  }
}

function createSharedSceneAssets() {
  return {
    geometries: {
      pathSegment: new THREE.BoxGeometry(2.55, 0.08, 1.05),
      pathBank: new THREE.BoxGeometry(0.34, 0.12, 1.15),
      trunk: new THREE.CylinderGeometry(0.055, 0.075, 0.92, 7),
      leaves: new THREE.ConeGeometry(0.38, 0.82, 8),
      fruit: new THREE.SphereGeometry(0.05, 8, 8),
      particle: new THREE.SphereGeometry(0.035, 8, 8),
    },
    materials: {
      pathSegment: new THREE.MeshBasicMaterial({ color: 0x2f6b32, transparent: true, opacity: 0.34 }),
      pathBank: new THREE.MeshBasicMaterial({ color: 0x173f1f, transparent: true, opacity: 0.74 }),
      trunk: new THREE.MeshBasicMaterial({ color: 0x6b3f1d }),
      leaves: new THREE.MeshBasicMaterial({ color: 0x2f8f3c, transparent: true, opacity: 0.8 }),
      fruit: new THREE.MeshBasicMaterial({ color: 0xffd166 }),
      particles: [
        new THREE.MeshBasicMaterial({ color: 0x7ade83 }),
        new THREE.MeshBasicMaterial({ color: 0xffd166 }),
        new THREE.MeshBasicMaterial({ color: 0xff8cc6 }),
      ],
    },
  }
}

function setInstance(mesh, index, { position, rotation = [0, 0, 0], scale = [1, 1, 1] }) {
  DUMMY.position.set(...position)
  DUMMY.rotation.set(...rotation)
  DUMMY.scale.set(...scale)
  DUMMY.updateMatrix()
  mesh.setMatrixAt(index, DUMMY.matrix)
}

function createInstancedMesh(geometry, material, count, name, { dynamic = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  mesh.name = name
  if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  return mesh
}

function addPathInstances(group, assets) {
  const path = createInstancedMesh(assets.geometries.pathSegment, assets.materials.pathSegment, PATH_SEGMENT_COUNT, 'path-segments')
  const banks = createInstancedMesh(assets.geometries.pathBank, assets.materials.pathBank, PATH_SEGMENT_COUNT * 2, 'path-banks')

  for (let index = 0; index < PATH_SEGMENT_COUNT; index += 1) {
    const z = 3.5 - index * 0.44
    const widthScale = 1 + index * 0.018
    setInstance(path, index, { position: [0, -2.35, z], rotation: [-0.09, 0, 0], scale: [widthScale, 1, 1] })
    setInstance(banks, index * 2, { position: [-1.42 * widthScale, -2.28, z], rotation: [-0.09, 0, 0.05], scale: [1, 1, 1] })
    setInstance(banks, index * 2 + 1, { position: [1.42 * widthScale, -2.28, z], rotation: [-0.09, 0, -0.05], scale: [1, 1, 1] })
  }

  path.instanceMatrix.needsUpdate = true
  banks.instanceMatrix.needsUpdate = true
  group.add(path, banks)
}

function addTreeInstances(group, assets, rng) {
  const trunks = createInstancedMesh(assets.geometries.trunk, assets.materials.trunk, TREE_COUNT, 'tree-trunks')
  const leaves = createInstancedMesh(assets.geometries.leaves, assets.materials.leaves, TREE_COUNT, 'tree-leaves')

  for (let index = 0; index < TREE_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const depth = -rng() * 9.5
    const x = side * (2.55 + rng() * 2.15)
    const y = -1.72 + rng() * 0.65
    const scale = 0.72 + rng() * 0.66
    const sway = (rng() - 0.5) * 0.18
    setInstance(trunks, index, { position: [x, y, depth], rotation: [sway, 0, sway * side], scale: [scale, scale, scale] })
    setInstance(leaves, index, { position: [x, y + 0.58 * scale, depth], rotation: [0, rng() * TWO_PI, sway * side], scale: [scale, scale, scale] })
  }

  trunks.instanceMatrix.needsUpdate = true
  leaves.instanceMatrix.needsUpdate = true
  group.add(trunks, leaves)
}

function addFruitInstances(group, assets, rng) {
  const fruits = createInstancedMesh(assets.geometries.fruit, assets.materials.fruit, FRUIT_COUNT, 'shared-material-fruits')

  for (let index = 0; index < FRUIT_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const scale = 0.8 + rng() * 0.9
    setInstance(fruits, index, {
      position: [side * (1.9 + rng() * 2.2), -0.55 + rng() * 2.6, -rng() * 8.5],
      scale: [scale, scale, scale],
    })
  }

  fruits.instanceMatrix.needsUpdate = true
  group.add(fruits)
}

function createParticlePool(assets, rng) {
  const meshes = assets.materials.particles.map((material, materialIndex) => {
    const count = Math.ceil((MAX_PARTICLES - materialIndex) / assets.materials.particles.length)
    return createInstancedMesh(assets.geometries.particle, material, count, `particle-pool-${materialIndex}`, { dynamic: true })
  })
  const particles = Array.from({ length: MAX_PARTICLES }, (_, index) => ({
    meshIndex: index % meshes.length,
    instanceIndex: Math.floor(index / meshes.length),
    position: new THREE.Vector3((rng() - 0.5) * 11, (rng() - 0.5) * 15, -rng() * 9),
    floatSpeed: 0.004 + rng() * 0.008,
    scale: 0.75 + rng() * 0.75,
  }))

  particles.forEach((particle) => {
    setInstance(meshes[particle.meshIndex], particle.instanceIndex, {
      position: particle.position.toArray(),
      scale: [particle.scale, particle.scale, particle.scale],
    })
  })
  meshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true
  })

  return { meshes, particles }
}

function updateParticlePool(pool) {
  pool.particles.forEach((particle) => {
    particle.position.y -= particle.floatSpeed
    if (particle.position.y < -7.5) particle.position.y = 7.5
    setInstance(pool.meshes[particle.meshIndex], particle.instanceIndex, {
      position: particle.position.toArray(),
      scale: [particle.scale, particle.scale, particle.scale],
    })
  })
  pool.meshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true
  })
}

export function createJungleStarsScene(canvas, { seed = 'jungle-stars', rng = createRng(seed) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.z = 8

  const group = new THREE.Group()
  const assets = createSharedSceneAssets()
  addPathInstances(group, assets)
  addTreeInstances(group, assets, rng)
  addFruitInstances(group, assets, rng)
  const particlePool = createParticlePool(assets, rng)
  particlePool.meshes.forEach((mesh) => group.add(mesh))

  scene.add(group)

  const resize = () => {
    const { clientWidth, clientHeight } = canvas
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(clientWidth, clientHeight, false)
    camera.aspect = clientWidth / Math.max(clientHeight, 1)
    camera.updateProjectionMatrix()
  }

  const renderFrame = () => {
    group.rotation.z += 0.0009
    updateParticlePool(particlePool)
    renderer.render(scene, camera)
  }

  const dispose = () => {
    disposeSceneResources(scene)
    renderer.dispose()
  }

  return { resize, renderFrame, dispose }
}
