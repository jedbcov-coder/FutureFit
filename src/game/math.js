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

export function centeredRect({ x, y, width, height, rotation = 0, id, type, label }) {
  return {
    id,
    type,
    label,
    x,
    y,
    width,
    height,
    rotation,
    left: x - width / 2,
    top: y - height / 2,
  }
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180)
}

function rotatePoint(point, center, radians) {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - center.x
  const dy = point.y - center.y

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

export function rectCorners(rect) {
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const center = { x: rect.x, y: rect.y }
  const corners = [
    { x: rect.x - halfWidth, y: rect.y - halfHeight },
    { x: rect.x + halfWidth, y: rect.y - halfHeight },
    { x: rect.x + halfWidth, y: rect.y + halfHeight },
    { x: rect.x - halfWidth, y: rect.y + halfHeight },
  ]

  if (!rect.rotation) return corners

  const radians = degreesToRadians(rect.rotation)
  return corners.map((corner) => rotatePoint(corner, center, radians))
}

function normalized(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1
  return { x: vector.x / length, y: vector.y / length }
}

function projection(points, axis) {
  let min = points[0].x * axis.x + points[0].y * axis.y
  let max = min

  points.slice(1).forEach((point) => {
    const value = point.x * axis.x + point.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  })

  return { min, max }
}

function overlaps(first, second) {
  return first.min < second.max && first.max > second.min
}

function separatingAxesFor(corners) {
  return [
    normalized({ x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y }),
    normalized({ x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y }),
  ]
}

export function obb(first, second) {
  const firstCorners = rectCorners(first)
  const secondCorners = rectCorners(second)
  const axes = [...separatingAxesFor(firstCorners), ...separatingAxesFor(secondCorners)]

  return axes.every((axis) => overlaps(projection(firstCorners, axis), projection(secondCorners, axis)))
}

export function playerIntersectsCollider(playerCollider, obstacleCollider) {
  if (!obstacleCollider.rotation) {
    return aabb(
      { x: playerCollider.left, y: playerCollider.top, width: playerCollider.width, height: playerCollider.height },
      { x: obstacleCollider.left, y: obstacleCollider.top, width: obstacleCollider.width, height: obstacleCollider.height },
    )
  }

  return obb(playerCollider, obstacleCollider)
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
