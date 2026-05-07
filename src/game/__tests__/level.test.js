import test from 'node:test'
import assert from 'node:assert/strict'
import { LANES, OBSTACLE_INTERVAL, POWER_UP_INTERVAL, START_SPEED } from '../config.js'
import { addFruitLine, buildLevel, LEVEL_START_Y, OBSTACLE_TYPES, POWER_UP_START_Y } from '../level.js'

test('buildLevel creates a deterministic starting level', () => {
  const level = buildLevel()

  assert.deepEqual(level.lanes, LANES)
  assert.equal(level.speed, START_SPEED)
  assert.equal(level.obstacleInterval, OBSTACLE_INTERVAL)
  assert.equal(level.powerUpInterval, POWER_UP_INTERVAL)
  assert.deepEqual(level.powerUps, [
    {
      id: 'peanut-1',
      lane: 0,
      y: POWER_UP_START_Y,
      size: 10,
      speed: START_SPEED * 0.9,
      type: 'peanut',
    },
  ])
  assert.deepEqual(level.obstacles, [
    {
      id: 'fruit-1',
      lane: -1,
      y: LEVEL_START_Y,
      size: 8,
      speed: START_SPEED,
      type: 'banana',
    },
    {
      id: 'fruit-2',
      lane: 1,
      y: LEVEL_START_Y + 11,
      size: 8,
      speed: START_SPEED,
      type: 'banana',
    },
  ])
})

test('buildLevel accepts timing and speed overrides', () => {
  const level = buildLevel({ speed: 5, obstacleInterval: 0.8, powerUpInterval: 3 })

  assert.equal(level.speed, 5)
  assert.equal(level.obstacleInterval, 0.8)
  assert.equal(level.powerUpInterval, 3)
  assert.equal(level.powerUps[0].speed, 4.5)
  assert.equal(level.obstacles[0].speed, 5)
})

test('addFruitLine returns a new level with configured fruit obstacles', () => {
  const level = { speed: 6, obstacles: [], powerUps: [] }
  const nextLevel = addFruitLine(level, { y: 20, lanes: [0, 1], spacing: 4 })

  assert.notEqual(nextLevel, level)
  assert.deepEqual(level.obstacles, [])
  assert.deepEqual(nextLevel.obstacles.map(({ lane, y, type, speed }) => ({ lane, y, type, speed })), [
    { lane: 0, y: 20, type: 'banana', speed: 6 },
    { lane: 1, y: 24, type: 'banana', speed: 6 },
  ])
})


test('obstacle type collider definitions cover hazards and keep rotated logs/branches oriented', () => {
  assert.equal(OBSTACLE_TYPES.log.collider.shape, 'obb')
  assert.equal(OBSTACLE_TYPES.branch.collider.shape, 'obb')
  assert.equal(OBSTACLE_TYPES.crate.collider.shape, 'aabb')
  assert.equal(OBSTACLE_TYPES.croc.collider.shape, 'aabb')
  assert.equal(OBSTACLE_TYPES.gate.collider.shape, 'aabb')
  assert.ok(OBSTACLE_TYPES.log.collider.padding < 0)
  assert.ok(OBSTACLE_TYPES.branch.collider.padding < 0)
})
