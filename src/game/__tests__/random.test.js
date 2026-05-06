import test from 'node:test'
import assert from 'node:assert/strict'
import { createRng, createRunSeed, hashSeed, seedFromSearch } from '../random.js'

test('createRng returns a deterministic sequence for the same seed', () => {
  const first = createRng('12345')
  const second = createRng('12345')

  assert.deepEqual(
    Array.from({ length: 5 }, () => first()),
    Array.from({ length: 5 }, () => second()),
  )
})

test('createRng returns different sequences for different seeds', () => {
  const first = createRng('12345')
  const second = createRng('jungle')

  assert.notDeepEqual(
    Array.from({ length: 3 }, () => first()),
    Array.from({ length: 3 }, () => second()),
  )
})

test('seedFromSearch reads non-empty seed query parameter', () => {
  assert.equal(seedFromSearch('?seed=12345'), '12345')
  assert.equal(seedFromSearch('?level=1&seed=jungle'), 'jungle')
  assert.equal(seedFromSearch('?seed='), null)
  assert.equal(seedFromSearch(''), null)
})

test('createRunSeed prefers URL seed and has deterministic fallback with no crypto', () => {
  assert.equal(createRunSeed({ search: '?seed=12345' }), '12345')
  assert.equal(createRunSeed({ search: '', crypto: null, now: () => 99 }), `99-${hashSeed(99)}`)
})
