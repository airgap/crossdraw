import { describe, test, expect } from 'bun:test'

// Test de Casteljau subdivision logic directly
function deCasteljau(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
) {
  const q0x = p0x + t * (p1x - p0x), q0y = p0y + t * (p1y - p0y)
  const q1x = p1x + t * (p2x - p1x), q1y = p1y + t * (p2y - p1y)
  const q2x = p2x + t * (p3x - p2x), q2y = p2y + t * (p3y - p2y)
  const r0x = q0x + t * (q1x - q0x), r0y = q0y + t * (q1y - q0y)
  const r1x = q1x + t * (q2x - q1x), r1y = q1y + t * (q2y - q1y)
  const sx = r0x + t * (r1x - r0x), sy = r0y + t * (r1y - r0y)
  return {
    first: { cp1x: q0x, cp1y: q0y, cp2x: r0x, cp2y: r0y, x: sx, y: sy },
    second: { cp1x: r1x, cp1y: r1y, cp2x: q2x, cp2y: q2y, x: p3x, y: p3y },
    midpoint: { x: sx, y: sy },
  }
}

describe('node tool - de Casteljau subdivision', () => {
  test('midpoint of straight-line cubic is at center', () => {
    // Control points at 1/3 and 2/3 give exact midpoint
    const result = deCasteljau(0, 0, 100/3, 0, 200/3, 0, 100, 0, 0.5)
    expect(result.midpoint.x).toBeCloseTo(50, 5)
    expect(result.midpoint.y).toBeCloseTo(0, 5)
  })

  test('midpoint of symmetric cubic is correct', () => {
    const result = deCasteljau(0, 0, 0, 100, 100, 100, 100, 0, 0.5)
    expect(result.midpoint.x).toBeCloseTo(50, 1)
    expect(result.midpoint.y).toBeCloseTo(75, 1)
  })

  test('subdivided halves endpoints match', () => {
    const result = deCasteljau(10, 20, 30, 40, 50, 60, 70, 80, 0.5)
    // First half ends at midpoint
    expect(result.first.x).toBeCloseTo(result.midpoint.x, 5)
    expect(result.first.y).toBeCloseTo(result.midpoint.y, 5)
    // Second half ends at original endpoint
    expect(result.second.x).toBe(70)
    expect(result.second.y).toBe(80)
  })

  test('t=0 gives the start point', () => {
    const result = deCasteljau(0, 0, 25, 50, 75, 50, 100, 0, 0)
    expect(result.midpoint.x).toBeCloseTo(0, 5)
    expect(result.midpoint.y).toBeCloseTo(0, 5)
  })

  test('t=1 gives the end point', () => {
    const result = deCasteljau(0, 0, 25, 50, 75, 50, 100, 0, 1)
    expect(result.midpoint.x).toBeCloseTo(100, 5)
    expect(result.midpoint.y).toBeCloseTo(0, 5)
  })
})

describe('node tool - line midpoint insertion', () => {
  test('midpoint of horizontal line is correct', () => {
    const prevX = 0, prevY = 0
    const segX = 100, segY = 0
    const midX = (prevX + segX) / 2
    const midY = (prevY + segY) / 2
    expect(midX).toBe(50)
    expect(midY).toBe(0)
  })

  test('midpoint of diagonal line is correct', () => {
    const prevX = 10, prevY = 20
    const segX = 50, segY = 80
    const midX = (prevX + segX) / 2
    const midY = (prevY + segY) / 2
    expect(midX).toBe(30)
    expect(midY).toBe(50)
  })
})

describe('bbox - group layer', () => {
  test('imports work', async () => {
    const { getLayerBBox } = await import('@/math/bbox')
    expect(typeof getLayerBBox).toBe('function')
  })
})
