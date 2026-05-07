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

// Conflict 1: keep codex touch-input helpers
const createInitialInputState = () => ({
  left: false,
  right: false,
  charge: false,
  space: false,
  jumpSlide: false,
  smash: false,
})

const SPACE_HOLD_THRESHOLD_MS = 240

// Conflict 2: keep main entity helpers
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
  const keyRef = useRef(createInitialInputState())
  const touchPointersRef = useRef(new Map())
  const jumpSlideHoldTimerRef = useRef(0)
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
    keyRef.current = createInitialInputState()
    touchPointersRef.current.clear()
    window.clearTimeout(jumpSlideHoldTimerRef.current)

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
    // Conflict 3: codex message (touch controls context)
    setMessage(`Use ← →, A/D, or the touch controls to dash through the jungle! Seed ${nextSeed}`)
    console.debug('FutureFit run seed', nextSeed)
  }, [beginAudio, requestedSeed])

  const moveLane = useCallback((direction) => {
    setLaneIndex((current) => clamp(current + direction, 0, LANES.length - 1))
  }, [])

  const setInputState = useCallback((input, active) => {
    keyRef.current[input] = active

    if (input === 'jumpSlide') {
      keyRef.current.space = active
    }
  }, [])

  const pulseInput = useCallback((input) => {
    setInputState(input, true)
    window.setTimeout(() => setInputState(input, false), 140)
  }, [setInputState])

  const startJumpSlideInput = useCallback(() => {
    setInputState('jumpSlide', true)
    window.clearTimeout(jumpSlideHoldTimerRef.current)
    jumpSlideHoldTimerRef.current = window.setTimeout(() => {
      if (keyRef.current.jumpSlide) {
        setMessage('Holding jump/slide: elephant keeps low and ready, just like holding Space.')
      }
    }, SPACE_HOLD_THRESHOLD_MS)
  }, [setInputState])

  const endJumpSlideInput = useCallback(() => {
    const wasHolding = keyRef.current.jumpSlide
    setInputState('jumpSlide', false)
    window.clearTimeout(jumpSlideHoldTimerRef.current)

    if (wasHolding && status === 'playing') {
      setMessage('Jump/slide tapped: Space action released.')
    }
  }, [setInputState, status])

  const clearPointerInput = useCallback((pointerId) => {
    const input = touchPointersRef.current.get(pointerId)
    if (!input) return

    touchPointersRef.current.delete(pointerId)

    if (input === 'jumpSlide') {
      endJumpSlideInput()
      return
    }

    setInputState(input, false)
  }, [endJumpSlideInput, setInputState])

  const startTouchInput = useCallback((input, event) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    touchPointersRef.current.set(event.pointerId, input)

    if (input === 'jumpSlide') {
      startJumpSlideInput()
      return
    }

    setInputState(input, true)

    if (status !== 'playing') return

    if (input === 'left') moveLane(-1)
    if (input === 'right') moveLane(1)
    if (input === 'charge') setMessage('Charge primed! Keep holding while you line up the lane.')
    if (input === 'smash') setMessage('Smash tapped! Peanut shields still auto-smash obstacles.')
  }, [moveLane, setInputState, startJumpSlideInput, status])

  const endTouchInput = useCallback((event) => {
    event.preventDefault()
    clearPointerInput(event.pointerId)
  }, [clearPointerInput])

  useEffect(() => {
    return () => {
      window.clearTimeout(jumpSlideHoldTimerRef.current)
    }
  }, [])

  // Conflict 4: merged keyDown — codex event.key logic + main KeyG debug toggle + isAllowedKey guard
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isAllowedKey(event.code)) return
      event.preventDefault()

      const normalizedKey = event.key.toLowerCase()

      if (event.code === 'KeyG') {
        setDebug((current) => !current)
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        if (status !== 'playing') resetGame()
      }

      if (event.key === ' ') {
        if (!keyRef.current.jumpSlide) startJumpSlideInput()
        return
      }

      if (event.repeat || status !== 'playing') return

      if (event.key === 'ArrowLeft' || normalizedKey === 'a') {
        pulseInput('left')
        moveLane(-1)
      }

      if (event.key === 'ArrowRight' || normalizedKey === 'd') {
        pulseInput('right')
        moveLane(1)
      }

      if (normalizedKey === 'shift') setInputState('charge', true)
      if (normalizedKey === 's') setInputState('smash', true)
    }

    const handleKeyUp = (event) => {
      if (!isAllowedKey(event.code)) return
      event.preventDefault()

      const normalizedKey = event.key.toLowerCase()

      if (event.key === ' ') endJumpSlideInput()
      if (normalizedKey === 'shift') setInputState('charge', false)
      if (normalizedKey === 's') setInputState('smash', false)
    }

    const keyOptions = { passive: false }
    window.addEventListener('keydown', handleKeyDown, keyOptions)
    window.addEventListener('keyup', handleKeyUp, keyOptions)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, keyOptions)
      window.removeEventListener('keyup', handleKeyUp, keyOptions)
    }
  }, [endJumpSlideInput, moveLane, pulseInput, resetGame, setInputState, startJumpSlideInput, status])

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
            {status !== 'playing' && (
              <div className="mobile-controls-note rounded-2xl">
                <p className="text-xs uppercase tracking-[0.35em] text-lime-200">Mobile controls</p>
                <p className="text-xs text-lime-100/80">Use the bottom touch pad: steer left/right, hold Charge, tap or hold Jump/Slide like Space, and tap Smash.</p>
              </div>
            )}
            <p className="min-h-6 text-sm text-lime-50">{message}</p>
            <div className="flex items-center justify-center gap-3">
              <button className="control rounded-full" onClick={() => moveLane(-1)} disabled={status !== 'playing'}>
                ←
              </button>
              <button className="start-button rounded-full px-7 py-3 font-black" onClick={() => resetGame({ startSound: true })}>
                {status === 'playing' ? 'Restart' : gameOver ? 'Try Again' : 'Begin dash'}
              </button>
              <button className="control rounded-full" onClick={() => moveLane(1)} disabled={status !== 'playing'}>
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

        <div className="touch-controls" aria-label="Touch game controls">
          <div className="touch-steer" aria-label="Steering controls">
            <button
              className="touch-control touch-steer-button"
              type="button"
              aria-label="Steer left"
              disabled={status !== 'playing'}
              onPointerDown={(event) => startTouchInput('left', event)}
              onPointerUp={endTouchInput}
              onPointerCancel={endTouchInput}
              onLostPointerCapture={endTouchInput}
            >
              ←
            </button>
            <button
              className="touch-control touch-steer-button"
              type="button"
              aria-label="Steer right"
              disabled={status !== 'playing'}
              onPointerDown={(event) => startTouchInput('right', event)}
              onPointerUp={endTouchInput}
              onPointerCancel={endTouchInput}
              onLostPointerCapture={endTouchInput}
            >
              →
            </button>
          </div>
          <div className="touch-actions" aria-label="Action controls">
            <button
              className="touch-control touch-action-button"
              type="button"
              aria-label="Charge"
              disabled={status !== 'playing'}
              onPointerDown={(event) => startTouchInput('charge', event)}
              onPointerUp={endTouchInput}
              onPointerCancel={endTouchInput}
              onLostPointerCapture={endTouchInput}
            >
              Charge
            </button>
            <button
              className="touch-control touch-action-button touch-action-primary"
              type="button"
              aria-label="Jump or slide"
              disabled={status !== 'playing'}
              onPointerDown={(event) => startTouchInput('jumpSlide', event)}
              onPointerUp={endTouchInput}
              onPointerCancel={endTouchInput}
              onLostPointerCapture={endTouchInput}
            >
              Jump/Slide
            </button>
            <button
              className="touch-control touch-action-button"
              type="button"
              aria-label="Smash"
              disabled={status !== 'playing'}
              onPointerDown={(event) => startTouchInput('smash', event)}
              onPointerUp={endTouchInput}
              onPointerCancel={endTouchInput}
              onLostPointerCapture={endTouchInput}
            >
              Smash
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App