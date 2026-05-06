import { LANES, OBSTACLE_INTERVAL, POWER_UP_INTERVAL, START_SPEED } from './config.js'
import { unseededRandom } from './random.js'

export const LEVEL_START_Y = -14
export const POWER_UP_START_Y = -18
export const OBSTACLE_TYPES = Object.freeze({
  banana: { size: 8, emoji: '🍌', collider: { shape: 'aabb', width: 7, height: 8, padding: 2 } },
  log: { size: 12, emoji: '🪵', collider: { shape: 'obb', width: 17, height: 6, rotation: -14, padding: -1.2 } },
  branch: { size: 12, emoji: '🌿', collider: { shape: 'obb', width: 16, height: 5, rotation: 18, padding: -1.4 } },
  crate: { size: 11, emoji: '📦', collider: { shape: 'aabb', width: 10, height: 10, padding: -0.9 } },
  croc: { size: 13, emoji: '🐊', collider: { shape: 'aabb', width: 18, height: 7, padding: -1.2 } },
  gate: { size: 14, emoji: '🚧', collider: { shape: 'aabb', width: 21, height: 8, padding: -1 } },
})
export const POWER_UP_TYPES = Object.freeze({
  peanut: { size: 10, emoji: '🥜', collider: { shape: 'aabb', width: 11, height: 11, padding: 2.5 } },
})

const HAZARD_TYPES = ['log', 'branch', 'crate', 'croc', 'gate']

export function getEntityTypeDefinition(entity) {
  return POWER_UP_TYPES[entity.type] ?? OBSTACLE_TYPES[entity.type] ?? OBSTACLE_TYPES.log
}

export function addFruitLine(level, { y, lanes = LANES, type = 'banana', spacing = 9 } = {}) {
  const nextLevel = { ...level, obstacles: [...(level.obstacles ?? [])], powerUps: [...(level.powerUps ?? [])] }

  lanes.forEach((lane, index) => {
    const definition = OBSTACLE_TYPES[type] ?? OBSTACLE_TYPES.banana
    nextLevel.obstacles.push({
      id: `fruit-${nextLevel.obstacles.length + 1}`,
      lane,
      y: y + index * spacing,
      size: definition.size,
      speed: level.speed ?? START_SPEED,
      type,
    })
  })

  return nextLevel
}

export function buildLevel({ speed = START_SPEED, obstacleInterval = OBSTACLE_INTERVAL, powerUpInterval = POWER_UP_INTERVAL } = {}) {
  const baseLevel = {
    lanes: [...LANES],
    speed,
    obstacleInterval,
    powerUpInterval,
    obstacles: [],
    powerUps: [
      {
        id: 'peanut-1',
        lane: 0,
        y: POWER_UP_START_Y,
        size: POWER_UP_TYPES.peanut.size,
        speed: speed * 0.9,
        type: 'peanut',
      },
    ],
  }

  return addFruitLine(baseLevel, { y: LEVEL_START_Y, lanes: [LANES[0], LANES[2]], type: 'banana', spacing: 11 })
}

export function makeObstacle(id, speed, type = 'log', random = unseededRandom) {
  const obstacleType = OBSTACLE_TYPES[type] ? type : 'log'
  const definition = OBSTACLE_TYPES[obstacleType]

  return {
    id,
    lane: LANES[Math.floor(random() * LANES.length)],
    y: LEVEL_START_Y,
    size: definition.size,
    speed,
    type: obstacleType,
  }
}

export function makeRandomHazard(id, speed, random = unseededRandom) {
  const type = HAZARD_TYPES[Math.floor(random() * HAZARD_TYPES.length)]
  return makeObstacle(id, speed, type, random)
}

export function makePowerUp(id, speed, random = unseededRandom) {
  return {
    id,
    lane: LANES[Math.floor(random() * LANES.length)],
    y: POWER_UP_START_Y,
    size: POWER_UP_TYPES.peanut.size,
    speed: speed * 0.9,
    type: 'peanut',
  }
}
