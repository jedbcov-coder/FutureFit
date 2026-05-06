import * as THREE from 'three'
import { createRng } from './random.js'

const DISPOSABLE_TEXTURE_SLOTS = Object.freeze(['map', 'alphaMap', 'emissiveMap', 'normalMap'])
const GENERATED_TEXTURE_KEYS = Object.freeze(['canvasTexture', 'popTextTexture', 'pickupTexture'])

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

export function createJungleStarsScene(canvas, { seed = 'jungle-stars', rng = createRng(seed) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.z = 8

  const group = new THREE.Group()
  const geometry = new THREE.SphereGeometry(0.035, 8, 8)
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0x7ade83 }),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    new THREE.MeshBasicMaterial({ color: 0xff8cc6 }),
  ]

  for (let index = 0; index < 95; index += 1) {
    const star = new THREE.Mesh(geometry, materials[index % materials.length])
    star.position.set((rng() - 0.5) * 11, (rng() - 0.5) * 15, -rng() * 9)
    star.userData.floatSpeed = 0.004 + rng() * 0.008
    group.add(star)
  }

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
    group.children.forEach((star) => {
      star.position.y -= star.userData.floatSpeed
      if (star.position.y < -7.5) star.position.y = 7.5
    })
    renderer.render(scene, camera)
  }

  const dispose = () => {
    disposeSceneResources(scene)
    renderer.dispose()
  }

  return { resize, renderFrame, dispose }
}
