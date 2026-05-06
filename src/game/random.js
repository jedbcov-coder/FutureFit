const UINT32_MAX_PLUS_ONE = 0x100000000
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function hashSeed(seed) {
  const seedText = String(seed ?? '')
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return hash >>> 0
}

export function unseededRandom() {
  return Math.random()
}

export function createRng(seed) {
  let state = hashSeed(seed)

  return function rng() {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE
  }
}

export function seedFromSearch(search = '') {
  const params = new URLSearchParams(search)
  const seed = params.get('seed')
  return seed === null || seed.trim() === '' ? null : seed
}

export function createRunSeed({ search = globalThis.location?.search ?? '', crypto = globalThis.crypto, now = Date.now } = {}) {
  const requestedSeed = seedFromSearch(search)
  if (requestedSeed !== null) return requestedSeed

  if (crypto?.getRandomValues) {
    const values = new Uint32Array(2)
    crypto.getRandomValues(values)
    return values.join('-')
  }

  return `${now()}-${hashSeed(now())}`
}
