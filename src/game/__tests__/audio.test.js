import test from 'node:test'
import assert from 'node:assert/strict'
import { disposeAudioContext } from '../audio.js'

test('disposeAudioContext closes active audio contexts and clears the ref', () => {
  const calls = []
  const audioRef = {
    current: {
      state: 'running',
      close() {
        calls.push('close')
      },
      suspend() {
        calls.push('suspend')
      },
    },
  }

  disposeAudioContext(audioRef)

  assert.deepEqual(calls, ['close'])
  assert.equal(audioRef.current, null)
})

test('disposeAudioContext suspends contexts that cannot be closed', () => {
  const calls = []
  const audioRef = {
    current: {
      state: 'running',
      suspend() {
        calls.push('suspend')
      },
    },
  }

  disposeAudioContext(audioRef)

  assert.deepEqual(calls, ['suspend'])
  assert.equal(audioRef.current, null)
})
