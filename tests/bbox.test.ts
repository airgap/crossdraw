import { describe, it, expect } from 'vitest'
import { pathBBox, mergeBBox, expandBBox, bboxContainsPoint } from '@/math/bbox'
import type { Segment } from '@/types'

describe('pathBBox', () => {
  it('should compute bbox for a simple rectangle path', () => {
    const segments: Segment[] = [
      { type: 'move', x: 10, y: 20 },
      { type: 'line', x: 100, y: 20 },
      { type: 'line', x: 100, y: 80 },
      { type: 'line', x: 10, y: 80 },
      { type: 'close' },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(10)
    expect(bbox.minY).toBe(20)
    expect(bbox.maxX).toBe(100)
    expect(bbox.maxY).toBe(80)
  })

  it('should compute bbox for a cubic bezier that extends beyond endpoints', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: -50, cp2x: 100, cp2y: -50 },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(100)
    // The curve bows upward (negative y), so minY should be < 0
    expect(bbox.minY).toBeLessThan(0)
    expect(bbox.maxY).toBe(0)
  })

  it('should compute bbox for a quadratic bezier', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -80 },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(100)
    expect(bbox.minY).toBeLessThan(0)
    expect(bbox.minY).toBeCloseTo(-40, 0) // quadratic extremum at t=0.5
  })
})

describe('bbox utilities', () => {
  it('should merge two bboxes', () => {
    const a = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    const b = { minX: 25, minY: 25, maxX: 100, maxY: 75 }
    const merged = mergeBBox(a, b)
    expect(merged).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 75 })
  })

  it('should expand a bbox by a given amount', () => {
    const bbox = { minX: 10, minY: 10, maxX: 90, maxY: 90 }
    const expanded = expandBBox(bbox, 5)
    expect(expanded).toEqual({ minX: 5, minY: 5, maxX: 95, maxY: 95 })
  })

  it('should check point containment', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    expect(bboxContainsPoint(bbox, 50, 50)).toBe(true)
    expect(bboxContainsPoint(bbox, 0, 0)).toBe(true)
    expect(bboxContainsPoint(bbox, -1, 50)).toBe(false)
    expect(bboxContainsPoint(bbox, 50, 101)).toBe(false)
  })
})
