import test from 'node:test'
import assert from 'node:assert/strict'
import { aabb, clamp, lerp, trackCenter, worldX } from '../math.js'

test('clamp keeps values inside inclusive bounds', () => {
  assert.equal(clamp(-2, 0, 3), 0)
  assert.equal(clamp(2, 0, 3), 2)
  assert.equal(clamp(8, 0, 3), 3)
})

test('lerp interpolates between two numbers', () => {
  assert.equal(lerp(10, 20, 0), 10)
  assert.equal(lerp(10, 20, 0.25), 12.5)
  assert.equal(lerp(10, 20, 1), 20)
})

test('aabb detects overlapping boxes and rejects separated boxes', () => {
  assert.equal(aabb({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), true)
  assert.equal(aabb({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 10, height: 10 }), false)
  assert.equal(aabb({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 10, height: 10 }), false)
})

test('trackCenter returns the midpoint of the track width', () => {
  assert.equal(trackCenter(390), 195)
  assert.equal(trackCenter(500), 250)
})

test('worldX maps lane offsets to track positions', () => {
  assert.equal(worldX(-1, 400, [-1, 0, 1]), 100)
  assert.equal(worldX(0, 400, [-1, 0, 1]), 200)
  assert.equal(worldX(1, 400, [-1, 0, 1]), 300)
})
