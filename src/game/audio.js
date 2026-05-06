const NOTE_OFFSETS = Object.freeze({ C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2 })

export function noteToFrequency(note) {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note)
  if (!match) throw new Error(`Invalid note: ${note}`)

  const [, pitch, octaveText] = match
  const semitoneOffset = NOTE_OFFSETS[pitch]
  const octave = Number(octaveText)
  return 440 * 2 ** ((semitoneOffset + (octave - 4) * 12) / 12)
}

export function startAudio(AudioContextClass = window.AudioContext || window.webkitAudioContext, { muted = false, volume = 0.7 } = {}) {
  const context = new AudioContextClass()
  const masterGain = context.createGain()
  context.masterGain = masterGain
  setMasterVolume(context, { muted, volume })
  masterGain.connect(context.destination)
  if (context.state === 'suspended') context.resume()
  return context
}

export function setMasterVolume(context, { muted = false, volume = 0.7 } = {}) {
  const masterGain = context?.masterGain
  if (!masterGain) return

  const nextVolume = muted ? 0 : Math.min(Math.max(Number(volume), 0), 1)
  masterGain.gain.setValueAtTime(nextVolume, context.currentTime)
}

export function disposeAudioContext(audioRef) {
  const audioContext = audioRef.current
  if (!audioContext) return

  if (audioContext.state !== 'closed' && typeof audioContext.close === 'function') {
    const closeResult = audioContext.close()
    if (closeResult?.catch && typeof audioContext.suspend === 'function') {
      closeResult.catch(() => audioContext.suspend())
    }
  } else if (audioContext.state !== 'closed' && typeof audioContext.suspend === 'function') {
    audioContext.suspend()
  }

  audioRef.current = null
}

export function playTone(context, frequency, duration = 0.14, when = context.currentTime) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, when)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.12, when + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)

  oscillator.connect(gain)
  gain.connect(context.masterGain ?? context.destination)
  oscillator.start(when)
  oscillator.stop(when + duration + 0.02)

  return oscillator
}

export const JUNGLE_THEME = Object.freeze([
  ['C5', 0],
  ['E5', 0.18],
  ['G5', 0.36],
  ['A5', 0.54],
])

export function sequenceMusic(context, sequence = JUNGLE_THEME, startAt = context.currentTime) {
  return sequence.map(([note, offset]) => playTone(context, noteToFrequency(note), 0.13, startAt + offset))
}
