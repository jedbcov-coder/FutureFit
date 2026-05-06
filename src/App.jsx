import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BEST_SCORE_KEY, LANES, PLAYER_Y, START_SPEED } from './game/config.js'
import { disposeAudioContext } from './game/audio.js'
import { createJungleStarsScene } from './game/createScene.js'
import { laneToPercent, clamp } from './game/math.js'
import { createRng, createRunSeed, seedFromSearch } from './game/random.js'
import { collectPowerUp, findLaneContact, frameDelta, updatePhysics } from './game/updatePhysics.js'

export function createInitialBody() {
  return {
    laneIndex: 1,
    playerPosition: { lane: LANES[1], y: PLAYER_Y },
    health: 3,
    lives: 3,
    score: 0,
    crates: 0,
    shield: 0,
    pickups: [],
    colliders: [],
    timers: { lastTime: 0, spawnTimer: 0, peanutTimer: 0 },
  }
}

function restoreEntityFlags(entities) {
  return entities.map((entity) => ({ ...entity, active: true, visible: true }))
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

function App() {
  const bodyRef = useRef(createInitialBody())
  const [laneIndex, setLaneIndex] = useState(bodyRef.current.laneIndex)
  const [obstacles, setObstacles] = useState(bodyRef.current.colliders)
  const [powerUps, setPowerUps] = useState(bodyRef.current.pickups)
  const [score, setScore] = useState(bodyRef.current.score)
  const [finalStats, setFinalStats] = useState(null)
  const [complete, setComplete] = useState(false)
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem(BEST_SCORE_KEY) || 0))
  const [status, setStatus] = useState('ready')
  const [shield, setShield] = useState(bodyRef.current.shield)
  const [health, setHealth] = useState(bodyRef.current.health)
  const [lives, setLives] = useState(bodyRef.current.lives)
  const [crates, setCrates] = useState(bodyRef.current.crates)
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [debug, setDebug] = useState(false)
  const [runSeed, setRunSeed] = useState(() => createRunSeed())
  const [message, setMessage] = useState('Tap Start, then dodge vines and grab peanuts!')
  const canvasRef = useRef(null)
  const audioRef = useRef(null)
  const nextId = useRef(1)
  const startedRef = useRef(false)
  const completeRef = useRef(false)
  const gameOverRef = useRef(false)
  const gameStartTimeRef = useRef(0)
  const activeHudStatsRef = useRef({ fruit: bodyRef.current.score, crates: bodyRef.current.crates })
  const gameState = useRef(bodyRef.current.timers)
  const rngRef = useRef(createRng(runSeed))
  const requestedSeed = useMemo(() => seedFromSearch(globalThis.location?.search ?? ''), [])

  useJungleStars(canvasRef, audioRef, runSeed)

  const speed = useMemo(() => START_SPEED + Math.min(score / 900, 3.8), [score])
  const playerLane = LANES[laneIndex]

  const completeRun = useCallback(({ fruit, crates }) => {
    const elapsedSeconds = gameStartTimeRef.current ? Math.max(0, Math.round((performance.now() - gameStartTimeRef.current) / 1000)) : 0
    completeRef.current = true
    setFinalStats({ fruit, crates, elapsedSeconds, seed: runSeed })
    setComplete(true)
  }, [runSeed])

  const resetGame = useCallback(() => {
    const nextSeed = requestedSeed ?? createRunSeed()

    const nextBody = createInitialBody()
    nextBody.pickups = restoreEntityFlags(nextBody.pickups)
    nextBody.colliders = restoreEntityFlags(nextBody.colliders)

    bodyRef.current = nextBody
    startedRef.current = true
    completeRef.current = false
    gameOverRef.current = false
    gameStartTimeRef.current = performance.now()
    gameState.current = { ...nextBody.timers }
    rngRef.current = createRng(nextSeed)
    activeHudStatsRef.current = { fruit: nextBody.score, crates: nextBody.crates }
    nextId.current = 1

    setRunSeed(nextSeed)
    setLaneIndex(nextBody.laneIndex)
    setObstacles(nextBody.colliders)
    setPowerUps(nextBody.pickups)
    setScore(nextBody.score)
    setCrates(nextBody.crates)
    setFinalStats(null)
    setComplete(false)
    setGameOver(false)
    setStarted(true)
    setDebug(false)
    setShield(nextBody.shield)
    setHealth(nextBody.health)
    setLives(nextBody.lives)
    setStatus('playing')
    setMessage(`Use ← → or A/D to dash through the jungle! Seed ${nextSeed}`)
    console.debug('FutureFit run seed', nextSeed)
  }, [requestedSeed])

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
  }, [resetGame, status])

  useEffect(() => {
    if (status !== 'playing') return undefined

    let frameId = 0
    const tick = (time) => {
      const state = gameState.current
      const delta = frameDelta(time, state.lastTime)
      state.lastTime = time

      const nextFrame = updatePhysics({
        obstacles,
        powerUps,
        score,
        shield,
        speed,
        timers: state,
        delta,
        nextId: nextId.current,
        random: rngRef.current,
      })

      state.spawnTimer = nextFrame.timers.spawnTimer
      state.peanutTimer = nextFrame.timers.peanutTimer
      nextId.current = nextFrame.nextId
      const nextCrates = nextFrame.obstacles.length
      bodyRef.current = {
        ...bodyRef.current,
        laneIndex,
        playerPosition: { lane: playerLane, y: PLAYER_Y },
        score: nextFrame.score,
        crates: nextCrates,
        shield: nextFrame.shield,
        pickups: restoreEntityFlags(nextFrame.powerUps),
        colliders: restoreEntityFlags(nextFrame.obstacles),
        timers: { ...nextFrame.timers },
      }
      activeHudStatsRef.current = { fruit: nextFrame.score, crates: nextCrates }
      setObstacles(bodyRef.current.colliders)
      setPowerUps(bodyRef.current.pickups)
      setScore(nextFrame.score)
      setCrates(nextCrates)
      setShield(nextFrame.shield)

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [laneIndex, obstacles, playerLane, powerUps, score, shield, speed, status])

  useEffect(() => {
    if (status !== 'playing') return

    const hit = findLaneContact(obstacles, playerLane)
    if (!hit) return

    if (shield > 0) {
      setObstacles((current) => {
        const nextColliders = restoreEntityFlags(current.filter((obstacle) => obstacle.id !== hit.id))
        bodyRef.current = { ...bodyRef.current, colliders: nextColliders, crates: nextColliders.length, shield: 0 }
        activeHudStatsRef.current = { ...activeHudStatsRef.current, crates: nextColliders.length }
        setCrates(nextColliders.length)
        return nextColliders
      })
      setShield(0)
      setMessage('Peanut shield smashed through danger!')
      return
    }

    const body = activeHudStatsRef.current
    gameOverRef.current = true
    bodyRef.current = { ...bodyRef.current, health: 0, lives: 0 }
    setHealth(0)
    setLives(0)
    setGameOver(true)
    setStarted(false)
    completeRun({ fruit: body.fruit, crates: body.crates })
    setStatus('ended')
    setBestScore((current) => {
      const nextBest = Math.max(current, body.fruit)
      localStorage.setItem(BEST_SCORE_KEY, String(nextBest))
      return nextBest
    })
    setMessage('Oof! The jungle got tangled. Press Enter to try again.')
  }, [completeRun, obstacles, playerLane, shield, status])

  useEffect(() => {
    if (status !== 'playing') return

    const pickup = findLaneContact(powerUps, playerLane)
    if (!pickup) return

    const collected = collectPowerUp(powerUps, pickup, score)
    const nextPickups = restoreEntityFlags(collected.powerUps)
    bodyRef.current = {
      ...bodyRef.current,
      pickups: nextPickups,
      score: collected.score,
      shield: collected.shield,
    }
    activeHudStatsRef.current = { ...activeHudStatsRef.current, fruit: collected.score }
    setPowerUps(nextPickups)
    setShield(collected.shield)
    setScore(collected.score)
    setMessage('Crunch! Peanut shield active for five seconds.')
  }, [playerLane, powerUps, score, status])

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
                style={{ left: `${laneToPercent(obstacle.lane)}%`, top: `${obstacle.y}%` }}
              >
                {obstacle.type === 'banana' ? '🍌' : '🪵'}
              </div>
            ))}

            {powerUps.map((powerUp) => (
              <div key={powerUp.id} className="absolute power-up rounded-full" style={{ left: `${laneToPercent(powerUp.lane)}%`, top: `${powerUp.y}%` }}>
                🥜
              </div>
            ))}

            <div
              className={`absolute player ${shield > 0 ? 'shielded' : ''}`}
              style={{ left: `${laneToPercent(playerLane)}%`, top: `${PLAYER_Y}%` }}
              aria-label={`Elephant health ${health}, lives ${lives}, crates ${crates}`}
            >
              <span className="shadow-bubble rounded-full">🐘</span>
            </div>

            {complete && finalStats && (
              <div className="absolute inset-0 complete-screen flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-lime-200">Run complete</p>
                <h2 className="text-3xl font-black leading-tight">Jungle dash stats</h2>
                <div className="complete-stats rounded-2xl px-4 py-3">
                  <p className="text-sm text-lime-50">Fruit {finalStats.fruit}</p>
                  <p className="text-sm text-lime-50">Crates {finalStats.crates}</p>
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
              <button className="start-button rounded-full px-7 py-3 font-black" onClick={resetGame}>
                {status === 'playing' ? 'Restart' : gameOver ? 'Try Again' : 'Start dash'}
              </button>
              <button className="control rounded-full" onClick={() => setLaneIndex((current) => clamp(current + 1, 0, LANES.length - 1))} disabled={status !== 'playing'}>
                →
              </button>
            </div>
            <p className="text-xs text-lime-100/80">Dodge logs and bananas. Peanuts give one shield hit.</p>
            <p className="text-[0.65rem] text-lime-100/60" data-debug-seed={runSeed}>Debug seed {runSeed}</p>
          </footer>
        </div>
      </section>
    </main>
  )
}

export default App
