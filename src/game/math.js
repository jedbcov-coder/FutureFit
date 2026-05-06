import { GAME_WIDTH, LANES, LANE_SPACING_PERCENT, TRACK_CENTER_PERCENT } from './config.js'

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount
}

export function aabb(first, second) {
  return (
    first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
  )
}

export function trackCenter(width = GAME_WIDTH) {
  return width / 2
}

export function worldX(lane, width = GAME_WIDTH, lanes = LANES) {
  const laneSpacing = width / Math.max(lanes.length + 1, 1)
  return trackCenter(width) + lane * laneSpacing
}

export function laneToPercent(lane) {
  return TRACK_CENTER_PERCENT + lane * LANE_SPACING_PERCENT
}
