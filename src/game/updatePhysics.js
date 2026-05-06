import { ENTITY_SPEED_SCALE, MAX_FRAME_DELTA, OBSTACLE_INTERVAL, PLAYER_Y, POWER_UP_INTERVAL, POWER_UP_SCORE, SCORE_RATE, SHIELD_DURATION } from './config.js'
import { makeObstacle, makePowerUp } from './level.js'

export function frameDelta(time, lastTime) {
  return lastTime ? Math.min((time - lastTime) / 1000, MAX_FRAME_DELTA) : 0
}

export function advanceEntities(entities, delta) {
  return entities
    .map((entity) => ({ ...entity, y: entity.y + entity.speed * delta * ENTITY_SPEED_SCALE }))
    .filter((entity) => entity.y < 112)
}

export function findLaneContact(entities, playerLane) {
  return entities.find((entity) => entity.lane === playerLane && Math.abs(entity.y - PLAYER_Y) < entity.size)
}

export function nextObstacleInterval(score) {
  return Math.max(0.58, OBSTACLE_INTERVAL - score / 4000)
}

export function updatePhysics({ obstacles, powerUps, score, shield, speed, timers, delta, nextId, random = Math.random }) {
  const nextTimers = {
    spawnTimer: timers.spawnTimer + delta,
    peanutTimer: timers.peanutTimer + delta,
  }
  const spawnedObstacles = [...obstacles]
  const spawnedPowerUps = [...powerUps]
  let currentNextId = nextId

  if (nextTimers.spawnTimer > nextObstacleInterval(score)) {
    nextTimers.spawnTimer = 0
    currentNextId += 1
    spawnedObstacles.push(makeObstacle(currentNextId, speed, random() > 0.7 ? 'banana' : 'log', random))
  }

  if (nextTimers.peanutTimer > POWER_UP_INTERVAL) {
    nextTimers.peanutTimer = 0
    currentNextId += 1
    spawnedPowerUps.push(makePowerUp(currentNextId, speed, random))
  }

  return {
    obstacles: advanceEntities(spawnedObstacles, delta),
    powerUps: advanceEntities(spawnedPowerUps, delta),
    score: score + Math.round(delta * SCORE_RATE),
    shield: Math.max(0, shield - delta),
    timers: nextTimers,
    nextId: currentNextId,
  }
}

export function collectPowerUp(powerUps, pickup, score) {
  return {
    powerUps: powerUps.filter((powerUp) => powerUp.id !== pickup.id),
    shield: SHIELD_DURATION,
    score: score + POWER_UP_SCORE,
  }
}
