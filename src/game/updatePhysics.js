import { ENTITY_SPEED_SCALE, MAX_FRAME_DELTA, OBSTACLE_INTERVAL, PLAYER_Y, POWER_UP_INTERVAL, POWER_UP_SCORE, SCORE_RATE, SHIELD_DURATION } from './config.js'
import { getEntityTypeDefinition, makeObstacle, makePowerUp, makeRandomHazard } from './level.js'
import { centeredRect, laneToPercent, playerIntersectsCollider } from './math.js'
import { unseededRandom } from './random.js'

const PLAYER_COLLIDER = Object.freeze({ width: 12, height: 11, padding: -1 })

function applyPadding(value, padding = 0) {
  return Math.max(1, value + padding * 2)
}

export function frameDelta(time, lastTime) {
  return lastTime ? Math.min((time - lastTime) / 1000, MAX_FRAME_DELTA) : 0
}

export function advanceEntities(entities, delta) {
  return entities
    .map((entity) => ({ ...entity, y: entity.y + entity.speed * delta * ENTITY_SPEED_SCALE }))
    .filter((entity) => entity.y < 112)
}

export function createPlayerCollider(playerLane) {
  return centeredRect({
    id: 'player',
    type: 'player',
    label: 'player',
    x: laneToPercent(playerLane),
    y: PLAYER_Y,
    width: applyPadding(PLAYER_COLLIDER.width, PLAYER_COLLIDER.padding),
    height: applyPadding(PLAYER_COLLIDER.height, PLAYER_COLLIDER.padding),
  })
}

export function createEntityCollider(entity) {
  const definition = getEntityTypeDefinition(entity)
  const collider = definition.collider ?? { width: entity.size, height: entity.size, padding: 0 }
  const rotation = collider.shape === 'obb' ? collider.rotation ?? entity.rotation ?? 0 : 0

  return centeredRect({
    id: entity.id,
    type: entity.type,
    label: definition.emoji ?? entity.type,
    x: laneToPercent(entity.lane),
    y: entity.y,
    width: applyPadding(collider.width ?? entity.size, collider.padding),
    height: applyPadding(collider.height ?? entity.size, collider.padding),
    rotation,
  })
}

export function activeColliderBounds(entities, playerLane) {
  const player = createPlayerCollider(playerLane)
  return {
    player,
    entities: entities.map((entity) => createEntityCollider(entity)),
  }
}

export function findLaneContact(entities, playerLane) {
  const playerCollider = createPlayerCollider(playerLane)
  return entities.find((entity) => playerIntersectsCollider(playerCollider, createEntityCollider(entity)))
}

export function nextObstacleInterval(score) {
  return Math.max(0.58, OBSTACLE_INTERVAL - score / 4000)
}

export function updatePhysics({ obstacles, powerUps, score, shield, speed, timers, delta, nextId, random = unseededRandom }) {
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
    spawnedObstacles.push(random() > 0.78 ? makeObstacle(currentNextId, speed, 'banana', random) : makeRandomHazard(currentNextId, speed, random))
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
