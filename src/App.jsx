import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AUDIO_MUTED_KEY, BEST_SCORE_KEY, LANES, PLAYER_Y, START_SPEED } from './game/config.js'
import { disposeAudioContext, sequenceMusic, setMasterVolume, startAudio } from './game/audio.js'
import { createJungleStarsScene } from './game/createScene.js'
import { laneToPercent, clamp } from './game/math.js'
import { createRng, createRunSeed, seedFromSearch } from './game/random.js'
import { activeColliderBounds, collectPowerUp, createEntityCollider, findLaneContact, frameDelta, updatePhysics } from './game/updatePhysics.js'
import { OBSTACLE_TYPES, POWER_UP_TYPES } from './game/level.js'

export function createInitialPhysics() {
  return {
    laneIndex: 1,
    playerPosition: { lane: LANES[1], y: PLAYER_Y },
    speed: START_SPEED,
    shield: 0,
    pickups: [],
    colliders: [],
    timers: { lastTime: 0, spawnTimer: 0, peanutTimer: 0 },
  }
}

export function createInitialMilestones() {
  return {
    score: 0,
    cratesBroken: 0,
    lives: 3,
    health: 3,
    elapsedSeconds: 0,
    finalStats: null,
  }
}

function restoreEntityFlags(entities) {
  return entities.map((entity) => ({ ...entity, active: true, visible: true }))
}

const ENTITY_TYPES = { ...OBSTACLE_TYPES, ...POWER_UP_TYPES }

function entityEmoji(entity) {
  return ENTITY_TYPES[entity.type]?.emoji ?? '🪵'
}

function entityClassName(entity) {
  if (entity.type === 'peanut') return 'power-up'
  return `obstacle ${entity.type === 'banana' ? 'banana' : entity.type}`
}

function entityStyle(entity) {
  const collider = createEntityCollider(entity)
  return {
    left: `${laneToPercent(entity.lane)}%`,
    top: `${entity.y}%`,
    '--entity-rotation': `${collider.rotation}deg`,
  }
}

function debugColliderStyle(collider) {
  return {
    left: `${collider.x}%`,
    top: `${collider.y}%`,
    width: `${collider.width}%`,
    height: `${collider.height}%`,
    transform: `translate(-50%, -50%) rotate(${collider.rotation}deg)`,
  }
}

function debugColliderText(collider) {
  const rotation = collider.rotation ? ` r${Math.round(collider.rotation)}°` : ''
  return `${collider.type}:${Math.round(collider.left)},${Math.round(collider.top)} ${collider.width.toFixed(1)}×${collider.height.toFixed(1)}${rotation}`
}

const ALLOWED_KEY_CODES = new Set(['Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyG'])

function isAllowedKey(code) {
  return ALLOWED_KEY_CODES.has(code)
}

function useJungleStars(canvasRef, audioRef, seed) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const jungleScene = createJungleStarsScene(canvas, { seed: `${seed}:stars` })
    let frameId = 0

    const animate = () => {
      jungleScene.renderFrame()
      frameId = requestAnimationFrame(animate)
    }

    jungleScene.resize()
    window.addEventListener('resize', jungleScene.resize)
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', jungleScene.resize)
      jungleScene.dispose()
      disposeAudioContext(audioRef)
    }
  }, [audioRef, canvasRef, seed])
}

function useDebugPerformanceMetrics() {
  const [metrics, setMetrics] = useState({ fps: 0, dpr: 1 })

  useEffect(() => {
    let frameId = 0
    let frames = 0
    let lastSample = performance.now()

    const sample = (time) => {
      frames += 1
      if (time - lastSample >= 500) {
        const elapsedSeconds = (time - lastSample) / 1000
        setMetrics({
          fps: Math.round(frames / Math.max(elapsedSeconds, 0.001)),
          dpr: Number((window.devicePixelRatio || 1).toFixed(2)),
        })
        frames = 0
        lastSample = time
      }
      frameId = requestAnimationFrame(sample)
    }

    frameId = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return metrics
}

function setChanged(setter, nextValue) {
  setter((current) => (Object.is(current, nextValue) ? current : nextValue))
}

function App() {
  const physicsRef = useRef(createInitialPhysics())
  const initialMilestones = useMemo(() => createInitialMilestones(), [])
  const [laneIndex, setLaneIndex] = useState(physicsRef.current.laneIndex)
  const [obstacles, setObstacles] = useState(physicsRef.current.colliders)
  const [powerUps, setPowerUps] = useState(physicsRef.current.pickups)
  const [score, setScore] = useState(initialMilestones.score)
  const [cratesBroken, setCratesBroken] = useState(initialMilestones.cratesBroken)
  const [lives, setLives] = useState(initialMilestones.lives)
  const [health, setHealth] = useState(initialMilestones.health)
  const [elapsedSeconds, setElapsedSeconds] = useState(initialMilestones.elapsedSeconds)
  const [finalStats, setFinalStats] = useState(initialMilestones.finalStats)
  const [complete, setComplete] = useState(false)
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem(BEST_SCORE_KEY) || 0))
  const [muted, setMuted] = useState(() => localStorage.getItem(AUDIO_MUTED_KEY) === 'true')
  const [volume, setVolume] = useState(0.7)
  const [status, setStatus] = useState('ready')
  const [shieldActive, setShieldActive] = useState(physicsRef.current.shield > 0)
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [debug, setDebug] = useState(false)
  const [runSeed, setRunSeed] = useState(() => createRunSeed())
  const [message, setMessage] = useState('Tap Begin, then dodge vines and grab peanuts!')
  const performanceMetrics = useDebugPerformanceMetrics()
  const canvasRef = useRef(null)
  const audioRef = useRef(null)
  const nextId = useRef(1)
  const startedRef = useRef(false)
  const completeRef = useRef(false)
  const gameOverRef = useRef(false)
  const gameStartTimeRef = useRef(0)
  const scoreRef = useRef(initialMilestones.score)
  const cratesBrokenRef = useRef(initialMilestones.cratesBroken)
  const elapsedSecondsRef = useRef(initialMilestones.elapsedSeconds)
  const shieldActiveRef = useRef(physicsRef.current.shield > 0)
  const rngRef = useRef(createRng(runSeed))
  const requestedSeed = useMemo(() => seedFromSearch(globalThis.location?.search ?? ''), [])

  useJungleStars(canvasRef, audioRef, runSeed)

  useEffect(() => {
    localStorage.setItem(AUDIO_MUTED_KEY, String(muted))
  }, [muted])

  useEffect(() => {
    setMasterVolume(audioRef.current, { muted, volume })
  }, [muted, volume])

  const beginAudio = useCallback(() => {
    let audioContext = audioRef.current
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = startAudio(undefined, { muted, volume })
      audioRef.current = audioContext
    } else {
      setMasterVolume(audioContext, { muted, volume })
      if (audioContext.state === 'suspended') audioContext.resume()
    }

    sequenceMusic(audioContext)
  }, [muted, volume])

  const playerLane = LANES[laneIndex]
  const debugColliders = useMemo(() => activeColliderBounds([...obstacles, ...powerUps], playerLane), [obstacles, playerLane, powerUps])

  const completeRun = useCallback(({ fruit, cratesBroken }) => {
    const nextElapsedSeconds = gameStartTimeRef.current ? Math.max(0, Math.round((performance.now() - gameStartTimeRef.current) / 1000)) : 0
    completeRef.current = true
    elapsedSecondsRef.current = nextElapsedSeconds
    setChanged(setElapsedSeconds, nextElapsedSeconds)
    setFinalStats({ fruit, cratesBroken, elapsedSeconds: nextElapsedSeconds, seed: runSeed })
    setComplete(true)
  }, [runSeed])

  const resetGame = useCallback(({ startSound = false } = {}) => {
    if (startSound) beginAudio()

    const nextSeed = requestedSeed ?? createRunSeed()

    const nextPhysics = createInitialPhysics()
    const nextMilestones = createInitialMilestones()
    nextPhysics.pickups = restoreEntityFlags(nextPhysics.pickups)
    nextPhysics.colliders = restoreEntityFlags(nextPhysics.colliders)

    physicsRef.current = nextPhysics
    startedRef.current = true
    completeRef.current = false
    gameOverRef.current = false
    gameStartTimeRef.current = performance.now()
    rngRef.current = createRng(nextSeed)
    nextId.current = 1

    setRunSeed(nextSeed)
    setLaneIndex(nextPhysics.laneIndex)
    setObstacles(nextPhysics.colliders)
    setPowerUps(nextPhysics.pickups)
    setScore(nextMilestones.score)
    setCratesBroken(nextMilestones.cratesBroken)
    setElapsedSeconds(nextMilestones.elapsedSeconds)
    setFinalStats(nextMilestones.finalStats)
    setComplete(false)
    setGameOver(false)
    setStarted(true)
    setDebug(false)
    scoreRef.current = nextMilestones.score
    cratesBrokenRef.current = nextMilestones.cratesBroken
    elapsedSecondsRef.current = nextMilestones.elapsedSeconds
    shieldActiveRef.current = nextPhysics.shield > 0
    setShieldActive(nextPhysics.shield > 0)
    setHealth(nextMilestones.health)
    setLives(nextMilestones.lives)
    setStatus('playing')
    setMessage(`Use ←/A and →/D to steer, W to charge, and S to slide. Seed ${nextSeed}`)
    console.debug('FutureFit run seed', nextSeed)
  }, [beginAudio, requestedSeed])

  useEffect(() => {
    const keyDown = (e) => {
      if (!isAllowedKey(e.code)) return
      e.preventDefault()

      if (e.code === 'Enter' || e.code === 'Space') {
        if (status !== 'playing') resetGame()
        return
      }

      if (e.code === 'KeyG') {
        setDebug((current) => !current)
        return
      }

      if (status !== 'playing') return

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        setLaneIndex((current) => clamp(current - 1, 0, LANES.length - 1))
        return
      }

      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        setLaneIndex((current) => clamp(current + 1, 0, LANES.length - 1))
        return
      }

      if (e.code === 'KeyW') {
        setMessage('Charge forward! Keep dodging jungle hazards.')
        return
      }

      if (e.code === 'KeyS') {
        setMessage('Slide low! Watch for the next opening.')
      }
    }

    const keyUp = (e) => {
      if (!isAllowedKey(e.code)) return
      e.preventDefault()
    }

    const keyOptions = { passive: false }
    window.addEventListener('keydown', keyDown, keyOptions)
    window.addEventListener('keyup', keyUp, keyOptions)
    return () => {
      window.removeEventListener('keydown', keyDown, keyOptions)
      window.removeEventListener('keyup', keyUp, keyOptions)
    }
  }, [resetGame, status])

  useEffect(() => {
    if (status !== 'playing') return undefined

    let frameId = 0
    const tick = (time) => {
      const physics = physicsRef.current
      const delta = frameDelta(time, physics.timers.lastTime)
      physics.timers.lastTime = time
      physics.speed = START_SPEED + Math.min(scoreRef.current / 900, 3.8)
      physics.laneIndex = laneIndex
      physics.playerPosition = { lane: playerLane, y: PLAYER_Y }

      const currentScore = scoreRef.current
      const nextFrame = updatePhysics({
        obstacles: physics.colliders,
        powerUps: physics.pickups,
        score: currentScore,
        shield: physics.shield,
        speed: physics.speed,
        timers: physics.timers,
        delta,
        nextId: nextId.current,
        random: rngRef.current,
      })

      physics.timers = { lastTime: time, ...nextFrame.timers }
      const nextShieldActive = nextFrame.shield > 0
      const nextElapsedSeconds = gameStartTimeRef.current ? Math.max(0, Math.round((time - gameStartTimeRef.current) / 1000)) : elapsedSecondsRef.current
      physics.shield = nextFrame.shield
      physics.pickups = restoreEntityFlags(nextFrame.powerUps)
      physics.colliders = restoreEntityFlags(nextFrame.obstacles)
      scoreRef.current = nextFrame.score
      nextId.current = nextFrame.nextId

      setObstacles(physics.colliders)
      setPowerUps(physics.pickups)
      if (nextFrame.score !== currentScore) {
        setScore(nextFrame.score)
      }
      if (nextElapsedSeconds !== elapsedSecondsRef.current) {
        elapsedSecondsRef.current = nextElapsedSeconds
        setElapsedSeconds(nextElapsedSeconds)
      }
      if (nextShieldActive !== shieldActiveRef.current) {
        shieldActiveRef.current = nextShieldActive
        setShieldActive(nextShieldActive)
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [laneIndex, playerLane, status])

  useEffect(() => {
    if (status !== 'playing') return

    const hit = findLaneContact(obstacles, playerLane)
    if (!hit) return

    const physics = physicsRef.current
    if (physics.shield > 0) {
      const nextColliders = restoreEntityFlags(physics.colliders.filter((obstacle) => obstacle.id !== hit.id))
      const nextCratesBroken = cratesBrokenRef.current + 1
      physics.colliders = nextColliders
      physics.shield = 0
      cratesBrokenRef.current = nextCratesBroken
      setObstacles(nextColliders)
      setChanged(setCratesBroken, nextCratesBroken)
      shieldActiveRef.current = false
      setChanged(setShieldActive, false)
      setMessage('Peanut shield smashed through danger!')
      return
    }

    const finalScore = scoreRef.current
    const finalCratesBroken = cratesBrokenRef.current
    gameOverRef.current = true
    setChanged(setHealth, 0)
    setChanged(setLives, 0)
    setGameOver(true)
    setStarted(false)
    completeRun({ fruit: finalScore, cratesBroken: finalCratesBroken })
    setStatus('ended')
    setBestScore((current) => {
      const nextBest = Math.max(current, finalScore)
      localStorage.setItem(BEST_SCORE_KEY, String(nextBest))
      return nextBest
    })
    setMessage('Oof! The jungle got tangled. Press Enter to try again.')
  }, [completeRun, obstacles, playerLane, status])

  useEffect(() => {
    if (status !== 'playing') return

    const pickup = findLaneContact(powerUps, playerLane)
    if (!pickup) return

    const physics = physicsRef.current
    const collected = collectPowerUp(physics.pickups, pickup, scoreRef.current)
    const nextPickups = restoreEntityFlags(collected.powerUps)
    physics.pickups = nextPickups
    physics.shield = collected.shield
    scoreRef.current = collected.score
    shieldActiveRef.current = true
    setPowerUps(nextPickups)
    setChanged(setShieldActive, true)
    setChanged(setScore, collected.score)
    setMessage('Crunch! Peanut shield active for five seconds.')
  }, [playerLane, powerUps, status])


  return (
    <main className="h-screen bg-[#132516] text-white overflow-hidden flex items-center justify-center p-4" data-started={started} data-debug={debug}>
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
              <p className="text-xs text-lime-100/80">Time {elapsedSeconds}s</p>
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
                className={`absolute rounded-full ${entityClassName(obstacle)}`}
                style={entityStyle(obstacle)}
              >
                {entityEmoji(obstacle)}
              </div>
            ))}

            {powerUps.map((powerUp) => (
              <div key={powerUp.id} className="absolute rounded-full power-up" style={entityStyle(powerUp)}>
                {entityEmoji(powerUp)}
              </div>
            ))}

            {debug && (
              <div className="debug-collider-layer" aria-hidden="true">
                <div className="debug-collider debug-collider-player" style={debugColliderStyle(debugColliders.player)} />
                {debugColliders.entities.map((collider) => (
                  <div key={`${collider.id}-debug`} className="debug-collider" style={debugColliderStyle(collider)} />
                ))}
                <div className="debug-collider-text">
                  <p>FPS {performanceMetrics.fps} · DPR {performanceMetrics.dpr}</p>
                  <p>Colliders active: {debugColliders.entities.length + 1}</p>
                  <p>{debugColliderText(debugColliders.player)}</p>
                  {debugColliders.entities.slice(0, 6).map((collider) => (
                    <p key={`${collider.id}-debug-text`}>{debugColliderText(collider)}</p>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`absolute player ${shieldActive ? 'shielded' : ''}`}
              style={{ left: `${laneToPercent(playerLane)}%`, top: `${PLAYER_Y}%` }}
              aria-label={`Elephant health ${health}, lives ${lives}, crates broken ${cratesBroken}`}
            >
              <span className="shadow-bubble rounded-full">🐘</span>
            </div>

            {complete && finalStats && (
              <div className="absolute inset-0 complete-screen flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-lime-200">Run complete</p>
                <h2 className="text-3xl font-black leading-tight">Jungle dash stats</h2>
                <div className="complete-stats rounded-2xl px-4 py-3">
                  <p className="text-sm text-lime-50">Fruit {finalStats.fruit}</p>
                  <p className="text-sm text-lime-50">Crates broken {finalStats.cratesBroken}</p>
                  <p className="text-sm text-lime-50">Time {finalStats.elapsedSeconds}s</p>
                  <p className="text-sm text-lime-50">Seed {finalStats.seed}</p>
                </div>
              </div>
            )}
          </div>

          <footer className="space-y-4 text-center">
            <p className="min-h-6 text-sm text-lime-50">{message}</p>
            <div className="flex items-center justify-center gap-3">
              <button className="control rounded-full" onClick={() => setLaneIndex((current) => clamp(current - 1, 0, LANES.length - 1))} disabled={status !== 'playing'}>
                ←
              </button>
              <button className="start-button rounded-full px-7 py-3 font-black" onClick={() => resetGame({ startSound: true })}>
                {status === 'playing' ? 'Restart' : gameOver ? 'Try Again' : 'Begin dash'}
              </button>
              <button className="control rounded-full" onClick={() => setLaneIndex((current) => clamp(current + 1, 0, LANES.length - 1))} disabled={status !== 'playing'}>
                →
              </button>
            </div>
            <div className="audio-controls rounded-2xl px-4 py-3" aria-label="Audio controls">
              <button className="audio-toggle rounded-full px-4 py-3 font-black" type="button" onClick={() => setMuted((current) => !current)} aria-pressed={muted}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <label className="audio-volume text-xs text-lime-100">
                Volume
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label="Audio volume"
                />
              </label>
            </div>
            <p className="text-xs text-lime-100/80">Controls: ←/A and →/D steer • W charge • S slide • Enter/Space start • G debug.</p>
            <p className="text-[0.65rem] text-lime-100/60" data-debug-seed={runSeed}>Debug seed {runSeed}</p>
          </footer>
        </div>
      </section>
    </main>
  )
}

export default App
