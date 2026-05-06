import test from 'node:test'
import assert from 'node:assert/strict'
import { disposeSceneResources } from '../createScene.js'

function disposable(label, calls) {
  return {
    dispose() {
      calls.push(label)
    },
  }
}

function renderableObject(overrides = {}) {
  return {
    isMesh: true,
    isSprite: false,
    userData: {},
    ...overrides,
  }
}

function sceneWith(objects) {
  return {
    traverse(visitor) {
      objects.forEach(visitor)
    },
  }
}

test('disposeSceneResources disposes geometry, material arrays, and common material textures once', () => {
  const calls = []
  const sharedGeometry = disposable('geometry', calls)
  const sharedTexture = disposable('texture:map', calls)
  const alphaMap = disposable('texture:alphaMap', calls)
  const emissiveMap = disposable('texture:emissiveMap', calls)
  const normalMap = disposable('texture:normalMap', calls)
  const firstMaterial = {
    map: sharedTexture,
    alphaMap,
    dispose() {
      calls.push('material:first')
    },
  }
  const secondMaterial = {
    map: sharedTexture,
    emissiveMap,
    normalMap,
    dispose() {
      calls.push('material:second')
    },
  }

  const stats = disposeSceneResources(
    sceneWith([
      renderableObject({ geometry: sharedGeometry, material: [firstMaterial, secondMaterial] }),
      renderableObject({ geometry: sharedGeometry, material: firstMaterial }),
    ]),
  )

  assert.deepEqual(stats, { geometries: 1, materials: 2, textures: 4 })
  assert.equal(calls.filter((call) => call === 'geometry').length, 1)
  assert.equal(calls.filter((call) => call === 'material:first').length, 1)
  assert.equal(calls.filter((call) => call === 'material:second').length, 1)
  assert.equal(calls.filter((call) => call === 'texture:map').length, 1)
  assert.equal(calls.filter((call) => call.startsWith('texture:')).length, 4)
})

test('disposeSceneResources disposes generated canvas textures on meshes and sprites', () => {
  const calls = []
  const canvasTexture = disposable('canvasTexture', calls)
  const popTextTexture = disposable('popTextTexture', calls)
  const pickupTexture = disposable('pickupTexture', calls)
  const generatedTexture = disposable('generatedTexture', calls)

  const stats = disposeSceneResources(
    sceneWith([
      renderableObject({
        isMesh: false,
        isSprite: true,
        userData: {
          canvasTexture,
          popTextTexture,
          pickupTexture,
          generatedCanvasTextures: [generatedTexture, canvasTexture],
        },
      }),
      { userData: { canvasTexture: disposable('ignoredNonRenderableTexture', calls) } },
    ]),
  )

  assert.deepEqual(stats, { geometries: 0, materials: 0, textures: 4 })
  assert.deepEqual(calls, ['canvasTexture', 'popTextTexture', 'pickupTexture', 'generatedTexture'])
})


test('disposeSceneResources reports stable disposal counts across repeated scene teardown cycles', () => {
  const createDisposableScene = () => {
    const calls = []
    const geometry = disposable('geometry', calls)
    const pickupTexture = disposable('pickupTexture', calls)
    const popTextTexture = disposable('popTextTexture', calls)
    const material = {
      map: pickupTexture,
      dispose() {
        calls.push('material')
      },
    }

    return {
      calls,
      scene: sceneWith([
        renderableObject({ geometry, material, userData: { pickupTexture, popTextTexture } }),
      ]),
    }
  }

  const cycleStats = Array.from({ length: 5 }, () => {
    const { scene } = createDisposableScene()
    return disposeSceneResources(scene)
  })

  assert.deepEqual(cycleStats, [
    { geometries: 1, materials: 1, textures: 2 },
    { geometries: 1, materials: 1, textures: 2 },
    { geometries: 1, materials: 1, textures: 2 },
    { geometries: 1, materials: 1, textures: 2 },
    { geometries: 1, materials: 1, textures: 2 },
  ])
})
