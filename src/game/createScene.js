import * as THREE from 'three'

export function createJungleStarsScene(canvas) {
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
    star.position.set((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 15, -Math.random() * 9)
    star.userData.floatSpeed = 0.004 + Math.random() * 0.008
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
    geometry.dispose()
    materials.forEach((material) => material.dispose())
    renderer.dispose()
  }

  return { resize, renderFrame, dispose }
}
