import { describe, test, expect } from 'bun:test'
import {
  getPointOnPolyline,
  polylineLength,
  flattenSegments,
  layoutTextOnPath,
  type TextOnPathConfig,
} from '@/tools/text-on-path'
import type { Segment } from '@/types'

// ── Tests covering lines 47-57 (getPointOnPolyline past-end fallback) ──

describe('getPointOnPolyline', () => {
  test('returns null for fewer than 2 points', () => {
    expect(getPointOnPolyline([], 0)).toBeNull()
    expect(getPointOnPolyline([{ x: 0, y: 0 }], 5)).toBeNull()
  })

  test('returns point at exact distance along line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const pt = getPointOnPolyline(points, 50)!
    expect(pt.x).toBeCloseTo(50, 5)
    expect(pt.y).toBeCloseTo(0, 5)
    expect(pt.angle).toBeCloseTo(0, 5) // horizontal
  })

  test('returns point at start (distance 0)', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ]
    const pt = getPointOnPolyline(points, 0)!
    expect(pt.x).toBeCloseTo(10, 5)
    expect(pt.y).toBeCloseTo(20, 5)
  })

  test('returns last point when distance exceeds path length (lines 52-58)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    const pt = getPointOnPolyline(points, 200)!
    expect(pt.x).toBe(100)
    expect(pt.y).toBe(0)
    expect(pt.angle).toBeCloseTo(0, 5)
  })

  test('handles multi-segment polyline past end', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]
    // Total length = 50 + 50 = 100, request 150
    const pt = getPointOnPolyline(points, 150)!
    expect(pt.x).toBe(50)
    expect(pt.y).toBe(50)
  })

  test('computes correct angle on diagonal segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]
    const pt = getPointOnPolyline(points, 50)!
    expect(pt.angle).toBeCloseTo(Math.PI / 4, 5)
  })

  test('computes angle at end segment when past end', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    const pt = getPointOnPolyline(points, 500)!
    // Last segment goes from (100,0) to (100,100), angle = PI/2
    expect(pt.angle).toBeCloseTo(Math.PI / 2, 5)
  })
})

// ── Tests covering lines 110-126 (flattenSegments quadratic and close) ──

describe('flattenSegments', () => {
  test('flattens line segments', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
    ]
    const points = flattenSegments(segs)
    expect(points.length).toBe(3)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1]).toEqual({ x: 100, y: 0 })
    expect(points[2]).toEqual({ x: 100, y: 100 })
  })

  test('flattens cubic bezier into multiple points', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
    ]
    const points = flattenSegments(segs, 10)
    // 1 move + 10 subdivisions
    expect(points.length).toBe(11)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 5)
    expect(points[points.length - 1]!.y).toBeCloseTo(0, 5)
  })

  test('flattens quadratic bezier into multiple points (lines 110-119)', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
    ]
    const points = flattenSegments(segs, 8)
    // 1 move + 8 subdivisions
    expect(points.length).toBe(9)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 5)
    expect(points[points.length - 1]!.y).toBeCloseTo(0, 5)
  })

  test('flattens close segment by returning to first point (lines 121-127)', () => {
    const segs: Segment[] = [
      { type: 'move', x: 10, y: 20 },
      { type: 'line', x: 110, y: 20 },
      { type: 'line', x: 110, y: 120 },
      { type: 'close' },
    ]
    const points = flattenSegments(segs)
    expect(points.length).toBe(4)
    // Last point should be the first point (close returns to start)
    expect(points[3]).toEqual({ x: 10, y: 20 })
  })

  test('close with empty path does not crash', () => {
    const segs: Segment[] = [{ type: 'close' }]
    const points = flattenSegments(segs)
    // No points before close, so nothing added
    expect(points.length).toBe(0)
  })

  test('custom resolution changes number of subdivisions', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
    ]
    const points5 = flattenSegments(segs, 5)
    const points20 = flattenSegments(segs, 20)
    expect(points5.length).toBe(6) // 1 + 5
    expect(points20.length).toBe(21) // 1 + 20
  })
})

describe('polylineLength', () => {
  test('returns 0 for empty or single point', () => {
    expect(polylineLength([])).toBe(0)
    expect(polylineLength([{ x: 0, y: 0 }])).toBe(0)
  })

  test('returns correct length for horizontal line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(polylineLength(points)).toBeCloseTo(100, 5)
  })

  test('returns correct length for multi-segment polyline', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(polylineLength(points)).toBeCloseTo(200, 5)
  })

  test('returns correct length for diagonal', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ]
    expect(polylineLength(points)).toBeCloseTo(5, 5) // 3-4-5 triangle
  })
})

// ── Tests covering lines 157-161 (layoutTextOnPath alignment) ──

describe('layoutTextOnPath', () => {
  const straightPath: Segment[] = [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: 1000, y: 0 },
  ]

  test('returns empty for zero-length path', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 0, y: 0 }, // zero length
    ]
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0.5,
      pathAlign: 'left',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('Hello', segs, config, 16)
    expect(result).toEqual([])
  })

  test('returns empty for insufficient points', () => {
    const segs: Segment[] = [{ type: 'move', x: 0, y: 0 }]
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0.5,
      pathAlign: 'left',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('Hello', segs, config, 16)
    expect(result).toEqual([])
  })

  test('left alignment positions text starting at offset', () => {
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0,
      pathAlign: 'left',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('AB', straightPath, config, 16)
    expect(result.length).toBe(2)
    expect(result[0]!.char).toBe('A')
    expect(result[1]!.char).toBe('B')
    // A should be near the start
    expect(result[0]!.x).toBeLessThan(result[1]!.x)
  })

  test('center alignment centers text on path (line 158)', () => {
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0.5,
      pathAlign: 'center',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('AB', straightPath, config, 16)
    expect(result.length).toBe(2)
    // Text should be centered around the midpoint (500)
    const avgX = (result[0]!.x + result[1]!.x) / 2
    expect(avgX).toBeCloseTo(500, -1)
  })

  test('right alignment positions text ending at offset (line 161)', () => {
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 1,
      pathAlign: 'right',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('AB', straightPath, config, 16)
    expect(result.length).toBe(2)
    // Last character should be near the end of the path
    expect(result[1]!.x).toBeLessThanOrEqual(1000)
  })

  test('flipSide inverts perpendicular offset and adds PI to angle', () => {
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0.5,
      pathAlign: 'left',
      flipSide: true,
      perpendicularOffset: 10,
    }
    const result = layoutTextOnPath('A', straightPath, config, 16)
    expect(result.length).toBe(1)
    // Flipped: angle should be offset by PI from normal
    expect(result[0]!.angle).toBeCloseTo(Math.PI, 3)
    // For horizontal path (angle=0), perpendicular offset with flipSide:
    // perpOffset = -10 (negated), ny = cos(0) * (-10) = -10
    // So y should be negative (above the path)
    expect(result[0]!.y).toBeLessThan(0)
  })

  test('perpendicular offset shifts text away from path', () => {
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0.5,
      pathAlign: 'left',
      flipSide: false,
      perpendicularOffset: 20,
    }
    const result = layoutTextOnPath('A', straightPath, config, 16)
    expect(result.length).toBe(1)
    // On a horizontal path (angle=0), ny = cos(0) * 20 = 20
    // So positive perpendicular offset pushes text downward (positive y in screen coords)
    expect(result[0]!.y).toBeGreaterThan(0)
  })

  test('layouts text along curved path', () => {
    const curvedPath: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 200, y: 0, cp1x: 50, cp1y: -100, cp2x: 150, cp2y: -100 },
    ]
    const config: TextOnPathConfig = {
      pathReference: 'p1',
      pathOffset: 0,
      pathAlign: 'left',
      flipSide: false,
      perpendicularOffset: 0,
    }
    const result = layoutTextOnPath('Hello', curvedPath, config, 14)
    expect(result.length).toBe(5)
    // Characters should follow the curve
    for (const ch of result) {
      expect(typeof ch.x).toBe('number')
      expect(typeof ch.y).toBe('number')
      expect(typeof ch.angle).toBe('number')
    }
  })
})
