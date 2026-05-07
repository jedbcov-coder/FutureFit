import test from 'node:test'
import assert from 'node:assert/strict'
import { disposeAudioContext, playTone, setMasterVolume, startAudio } from '../audio.js'

class MockAudioNode {
  constructor(name) {
    this.name = name
    this.connections = []
  }

  connect(target) {
    this.connections.push(target)
  }
}

class MockAudioParam {
  constructor() {
    this.values = []
  }

  setValueAtTime(value, when) {
    this.values.push(['set', value, when])
  }

  exponentialRampToValueAtTime(value, when) {
    this.values.push(['ramp', value, when])
  }
}

class MockGain extends MockAudioNode {
  constructor(name = 'gain') {
    super(name)
    this.gain = new MockAudioParam()
  }
}

class MockOscillator extends MockAudioNode {
  constructor() {
    super('oscillator')
    this.frequency = new MockAudioParam()
    this.startedAt = null
    this.stoppedAt = null
    this.type = null
  }

  start(when) {
    this.startedAt = when
  }

  stop(when) {
    this.stoppedAt = when
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 2
    this.destination = new MockAudioNode('destination')
    this.gains = []
    this.oscillators = []
    this.state = 'running'
  }

  createGain() {
    const gain = new MockGain(`gain-${this.gains.length}`)
    this.gains.push(gain)
    return gain
  }

  createOscillator() {
    const oscillator = new MockOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }

  resume() {
    this.state = 'running'
  }
}

test('startAudio creates a master gain and connects it to the destination', () => {
  const context = startAudio(MockAudioContext, { muted: false, volume: 0.35 })

  assert.equal(context.masterGain, context.gains[0])
  assert.deepEqual(context.masterGain.connections, [context.destination])
  assert.deepEqual(context.masterGain.gain.values, [['set', 0.35, 2]])
})

test('setMasterVolume clamps volume and honors mute', () => {
  const context = startAudio(MockAudioContext, { muted: false, volume: 0.5 })

  setMasterVolume(context, { muted: false, volume: 2 })
  setMasterVolume(context, { muted: true, volume: 0.8 })

  assert.deepEqual(context.masterGain.gain.values.slice(-2), [
    ['set', 1, 2],
    ['set', 0, 2],
  ])
})

test('playTone connects note gains to master gain when available', () => {
  const context = startAudio(MockAudioContext)
  const oscillator = playTone(context, 440, 0.25, 3)
  const noteGain = context.gains[1]

  assert.equal(oscillator, context.oscillators[0])
  assert.deepEqual(oscillator.connections, [noteGain])
  assert.deepEqual(noteGain.connections, [context.masterGain])
  assert.deepEqual(context.destination.connections, [])
})

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
