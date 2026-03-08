import { describe, test, expect } from 'bun:test'

// Test snap math directly without store dependencies

const SNAP_THRESHOLD = 5

interface BBox {
  minX: number; minY: number; maxX: number; maxY: number
}

function snapPointToTargets(
  docX: number,
  docY: number,
  targetsX: number[],
  targetsY: number[],
  threshold: number,
) {
  let bestX: number | null = null
  let bestDistX = threshold
  for (const cx of targetsX) {
    const dist = Math.abs(docX - cx)
    if (dist < bestDistX) {
      bestDistX = dist
      bestX = cx
    }
  }

  let bestY: number | null = null
  let bestDistY = threshold
  for (const cy of targetsY) {
    const dist = Math.abs(docY - cy)
    if (dist < bestDistY) {
      bestDistY = dist
      bestY = cy
    }
  }

  return { x: bestX, y: bestY }
}

function snapBBoxToTargets(
  bbox: BBox,
  dx: number,
  dy: number,
  targetsX: number[],
  targetsY: number[],
  threshold: number,
) {
  const newMinX = bbox.minX + dx
  const newMaxX = bbox.maxX + dx
  const newCx = (newMinX + newMaxX) / 2
  const newMinY = bbox.minY + dy
  const newMaxY = bbox.maxY + dy
  const newCy = (newMinY + newMaxY) / 2

  let bestSnapDx = 0
  let bestDistX = threshold
  for (const refX of [newMinX, newCx, newMaxX]) {
    for (const tx of targetsX) {
      const dist = Math.abs(refX - tx)
      if (dist < bestDistX) {
        bestDistX = dist
        bestSnapDx = tx - refX
      }
    }
  }

  let bestSnapDy = 0
  let bestDistY = threshold
  for (const refY of [newMinY, newCy, newMaxY]) {
    for (const ty of targetsY) {
      const dist = Math.abs(refY - ty)
      if (dist < bestDistY) {
        bestDistY = dist
        bestSnapDy = ty - refY
      }
    }
  }

  return { dx: dx + bestSnapDx, dy: dy + bestSnapDy }
}

describe('snap - point snapping', () => {
  test('snaps to nearest target within threshold', () => {
    const result = snapPointToTargets(103, 50, [100, 200], [48, 200], SNAP_THRESHOLD)
    expect(result.x).toBe(100)
    expect(result.y).toBe(48)
  })

  test('does not snap when outside threshold', () => {
    const result = snapPointToTargets(110, 60, [100, 200], [48, 200], SNAP_THRESHOLD)
    expect(result.x).toBe(null)
    expect(result.y).toBe(null)
  })

  test('snaps to closest target when multiple are within threshold', () => {
    const result = snapPointToTargets(52, 0, [50, 54], [0], SNAP_THRESHOLD)
    // 52-50=2, 52-54=2, both at same distance. First one wins in loop order.
    expect(result.x).toBe(50)
  })

  test('snaps to exact position when on target', () => {
    const result = snapPointToTargets(100, 200, [100], [200], SNAP_THRESHOLD)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })
})

describe('snap - bbox snapping', () => {
  test('snaps left edge to target', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    // Moving bbox by dx=97 puts left edge at 97, close to target 100
    const result = snapBBoxToTargets(bbox, 97, 0, [100], [], SNAP_THRESHOLD)
    expect(result.dx).toBe(100) // 97 + 3 snap correction
  })

  test('snaps center to target', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    // Moving by dx=148 puts center at 198, close to target 200
    const result = snapBBoxToTargets(bbox, 148, 0, [200], [], SNAP_THRESHOLD)
    expect(result.dx).toBe(150) // center at 200
  })

  test('snaps right edge to target', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    // Moving by dx=52 puts right edge at 102, close to target 100
    const result = snapBBoxToTargets(bbox, 52, 0, [100], [], SNAP_THRESHOLD)
    expect(result.dx).toBe(50) // right edge at 100
  })

  test('does not snap when outside threshold', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    const result = snapBBoxToTargets(bbox, 80, 0, [100], [], SNAP_THRESHOLD)
    // Left=80 (20 away), center=105 (5 away => snaps!), right=130 (30 away)
    // Actually center 105 is within threshold of 100... wait:
    // center = (80 + 130) / 2 = 105, target=100, dist=5, threshold=5. Not less than threshold.
    expect(result.dx).toBe(80) // no snap
  })
})

describe('snap - grid snapping', () => {
  test('nearest grid point calculation', () => {
    const gridSize = 8
    const docX = 53
    const nearest = Math.round(docX / gridSize) * gridSize
    expect(nearest).toBe(56) // 53/8 = 6.625, round = 7, 7*8 = 56
  })

  test('exact grid alignment', () => {
    const gridSize = 10
    const docX = 50
    const nearest = Math.round(docX / gridSize) * gridSize
    expect(nearest).toBe(50)
  })
})
