import test from 'node:test'
import assert from 'node:assert/strict'
import { PLAYER_Y } from '../config.js'
import { activeColliderBounds, createEntityCollider, findLaneContact } from '../updatePhysics.js'

test('findLaneContact uses rotated local collider dimensions for branches', () => {
  const branch = { id: 'branch-1', lane: 0, y: PLAYER_Y, size: 12, speed: 0, type: 'branch' }
  const nearVisualCorner = { id: 'branch-2', lane: 0, y: PLAYER_Y - 10, size: 12, speed: 0, type: 'branch' }

  assert.equal(findLaneContact([branch], 0)?.id, 'branch-1')
  assert.equal(findLaneContact([nearVisualCorner], 0), undefined)
})

test('activeColliderBounds exposes debug-ready player and entity bounds', () => {
  const crate = { id: 'crate-1', lane: -1, y: PLAYER_Y, size: 11, speed: 0, type: 'crate' }
  const bounds = activeColliderBounds([crate], -1)
  const crateCollider = createEntityCollider(crate)

  assert.equal(bounds.player.type, 'player')
  assert.deepEqual(bounds.entities, [crateCollider])
  assert.equal(crateCollider.rotation, 0)
  assert.ok(crateCollider.width < 10)
})
