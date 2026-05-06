import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const LANES = [-1, 0, 1]
const START_SPEED = 3.8
const PLAYER_Y = 78
const GAME_WIDTH = 390
const OBSTACLE_INTERVAL = 1.05
const POWER_UP_INTERVAL = 4.8

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function makeObstacle(id, speed, type = 'log') {
  return {
    id,
    lane: LANES[Math.floor(Math.random() * LANES.length)],
    y: -14,
    size: type === 'banana' ? 8 : 12,
    speed,
    type,
  }
}

function makePowerUp(id, speed) {
  return {
    id,
    lane: LANES[Math.floor(Math.random() * LANES.length)],
    y: -18,
    size: 10,
    speed: speed * 0.9,
    type: 'peanut',
  }
}

function useJungleStars(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

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

    let frameId = 0
    const resize = () => {
      const { clientWidth, clientHeight } = canvas
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(clientHeight, 1)
      camera.updateProjectionMatrix()
    }

    const animate = () => {
      group.rotation.z += 0.0009
      group.children.forEach((star) => {
        star.position.y -= star.userData.floatSpeed
        if (star.position.y < -7.5) star.position.y = 7.5
      })
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      geometry.dispose()
      materials.forEach((material) => material.dispose())
      renderer.dispose()
    }
  }, [canvasRef])
}

function App() {
  const [laneIndex, setLaneIndex] = useState(1)
  const [obstacles, setObstacles] = useState([])
  const [powerUps, setPowerUps] = useState([])
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('jungleDashBest') || 0))
  const [status, setStatus] = useState('ready')
  const [shield, setShield] = useState(0)
  const [message, setMessage] = useState('Tap Start, then dodge vines and grab peanuts!')
  const canvasRef = useRef(null)
  const nextId = useRef(1)
  const gameState = useRef({ lastTime: 0, spawnTimer: 0, peanutTimer: 0 })

  useJungleStars(canvasRef)

  const speed = useMemo(() => START_SPEED + Math.min(score / 900, 3.8), [score])
  const playerLane = LANES[laneIndex]

  const resetGame = () => {
    setLaneIndex(1)
    setObstacles([])
    setPowerUps([])
    setScore(0)
    setShield(0)
    setStatus('playing')
    setMessage('Use ← → or A/D to dash through the jungle!')
    gameState.current = { lastTime: 0, spawnTimer: 0, peanutTimer: 0 }
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (status !== 'playing') resetGame()
        return
      }

      if (status !== 'playing') return

      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        setLaneIndex((current) => clamp(current - 1, 0, LANES.length - 1))
      }

      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        setLaneIndex((current) => clamp(current + 1, 0, LANES.length - 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status])

  useEffect(() => {
    if (status !== 'playing') return undefined

    let frameId = 0
    const tick = (time) => {
      const state = gameState.current
      const delta = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.033) : 0
      state.lastTime = time
      state.spawnTimer += delta
      state.peanutTimer += delta

      setScore((current) => current + Math.round(delta * 75))
      setShield((current) => Math.max(0, current - delta))

      if (state.spawnTimer > Math.max(0.58, OBSTACLE_INTERVAL - score / 4000)) {
        state.spawnTimer = 0
        setObstacles((current) => [...current, makeObstacle(nextId.current += 1, speed, Math.random() > 0.7 ? 'banana' : 'log')])
      }

      if (state.peanutTimer > POWER_UP_INTERVAL) {
        state.peanutTimer = 0
        setPowerUps((current) => [...current, makePowerUp(nextId.current += 1, speed)])
      }

      setObstacles((current) => current.map((obstacle) => ({ ...obstacle, y: obstacle.y + obstacle.speed * delta * 22 })).filter((obstacle) => obstacle.y < 112))
      setPowerUps((current) => current.map((powerUp) => ({ ...powerUp, y: powerUp.y + powerUp.speed * delta * 22 })).filter((powerUp) => powerUp.y < 112))

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [score, speed, status])

  useEffect(() => {
    if (status !== 'playing') return

    const hit = obstacles.find((obstacle) => obstacle.lane === playerLane && Math.abs(obstacle.y - PLAYER_Y) < obstacle.size)
    if (!hit) return

    if (shield > 0) {
      setObstacles((current) => current.filter((obstacle) => obstacle.id !== hit.id))
      setShield(0)
      setMessage('Peanut shield smashed through danger!')
      return
    }

    setStatus('ended')
    setBestScore((current) => {
      const nextBest = Math.max(current, score)
      localStorage.setItem('jungleDashBest', String(nextBest))
      return nextBest
    })
    setMessage('Oof! The jungle got tangled. Press Enter to try again.')
  }, [obstacles, playerLane, score, shield, status])

  useEffect(() => {
    if (status !== 'playing') return

    const pickup = powerUps.find((powerUp) => powerUp.lane === playerLane && Math.abs(powerUp.y - PLAYER_Y) < powerUp.size)
    if (!pickup) return

    setPowerUps((current) => current.filter((powerUp) => powerUp.id !== pickup.id))
    setShield(5)
    setScore((current) => current + 150)
    setMessage('Crunch! Peanut shield active for five seconds.')
  }, [playerLane, powerUps, status])

  return (
    <main className="h-screen bg-[#132516] text-white overflow-hidden flex items-center justify-center p-4">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-70" aria-hidden="true" />
      <section className="relative game-shell rounded-[2rem] border border-white/20 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 jungle-gradient" />
        <div className="relative z-10 flex h-full flex-col justify-between p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-lime-200">FutureFit presents</p>
              <h1 className="text-3xl font-black leading-tight">Pink Elephant Jungle Dash</h1>
            </div>
            <div className="score-card rounded-2xl px-4 py-3 text-right">
              <p className="text-xs text-lime-100">Score</p>
              <p className="text-2xl font-black">{score}</p>
              <p className="text-xs text-pink-100">Best {bestScore}</p>
            </div>
          </header>

          <div className="relative mx-auto my-5 h-[62vh] min-h-[430px] max-h-[620px] w-full max-w-[390px] overflow-hidden rounded-[1.75rem] border border-lime-200/30 bg-black/20">
            <div className="absolute inset-0 lane left-[16.66%]" />
            <div className="absolute inset-0 lane left-1/2" />
            <div className="absolute inset-0 lane left-[83.33%]" />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#132516] to-transparent" />

            {obstacles.map((obstacle) => (
              <div
                key={obstacle.id}
                className={`absolute obstacle rounded-full ${obstacle.type === 'banana' ? 'banana' : 'log'}`}
                style={{ left: `${50 + obstacle.lane * 27}%`, top: `${obstacle.y}%` }}
              >
                {obstacle.type === 'banana' ? '🍌' : '🪵'}
              </div>
            ))}

            {powerUps.map((powerUp) => (
              <div key={powerUp.id} className="absolute power-up rounded-full" style={{ left: `${50 + powerUp.lane * 27}%`, top: `${powerUp.y}%` }}>
                🥜
              </div>
            ))}

            <div className={`absolute player ${shield > 0 ? 'shielded' : ''}`} style={{ left: `${50 + playerLane * 27}%`, top: `${PLAYER_Y}%` }}>
              <span className="shadow-bubble rounded-full">🐘</span>
            </div>
          </div>

          <footer className="space-y-4 text-center">
            <p className="min-h-6 text-sm text-lime-50">{message}</p>
            <div className="flex items-center justify-center gap-3">
              <button className="control rounded-full" onClick={() => setLaneIndex((current) => clamp(current - 1, 0, LANES.length - 1))} disabled={status !== 'playing'}>
                ←
              </button>
              <button className="start-button rounded-full px-7 py-3 font-black" onClick={resetGame}>
                {status === 'playing' ? 'Restart' : 'Start dash'}
              </button>
              <button className="control rounded-full" onClick={() => setLaneIndex((current) => clamp(current + 1, 0, LANES.length - 1))} disabled={status !== 'playing'}>
                →
              </button>
            </div>
            <p className="text-xs text-lime-100/80">Dodge logs and bananas. Peanuts give one shield hit.</p>
          </footer>
        </div>
      </section>
    </main>
  )
}

export default App
