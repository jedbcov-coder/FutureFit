import { LANES, OBSTACLE_INTERVAL, POWER_UP_INTERVAL, START_SPEED } from './config.js'
import { unseededRandom } from './random.js'

export const LEVEL_START_Y = -14
export const POWER_UP_START_Y = -18
export const OBSTACLE_TYPES = Object.freeze({
  banana: { size: 8, emoji: '🍌' },
  log: { size: 12, emoji: '🪵' },
})
export const POWER_UP_TYPES = Object.freeze({
  peanut: { size: 10, emoji: '🥜' },
})

export function addFruitLine(level, { y, lanes = LANES, type = 'banana', spacing = 9 } = {}) {
  const nextLevel = { ...level, obstacles: [...(level.obstacles ?? [])], powerUps: [...(level.powerUps ?? [])] }

  lanes.forEach((lane, index) => {
    nextLevel.obstacles.push({
      id: `fruit-${nextLevel.obstacles.length + 1}`,
      lane,
      y: y + index * spacing,
      size: OBSTACLE_TYPES[type]?.size ?? OBSTACLE_TYPES.banana.size,
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
  return {
    id,
    lane: LANES[Math.floor(random() * LANES.length)],
    y: LEVEL_START_Y,
    size: OBSTACLE_TYPES[type]?.size ?? OBSTACLE_TYPES.log.size,
    speed,
    type,
  }
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
