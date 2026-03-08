import { describe, it, expect } from 'bun:test'
import { rdpSimplify } from '@/tools/boolean-ops'

describe('rdpSimplify', () => {
  it('returns same points when <= 2', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(rdpSimplify(pts, 1)).toEqual(pts)
  })

  it('simplifies collinear points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]
    const result = rdpSimplify(pts, 1)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ x: 0, y: 0 })
    expect(result[1]).toEqual({ x: 10, y: 0 })
  })

  it('keeps significant deviation', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 10 }, // significant deviation
      { x: 10, y: 0 },
    ]
    const result = rdpSimplify(pts, 1)
    expect(result).toHaveLength(3)
  })

  it('removes noise below epsilon', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 0.1 },
      { x: 4, y: -0.1 },
      { x: 6, y: 0.05 },
      { x: 8, y: -0.05 },
      { x: 10, y: 0 },
    ]
    const result = rdpSimplify(pts, 1)
    expect(result).toHaveLength(2) // all noise is < 1
  })

  it('handles single point', () => {
    const pts = [{ x: 5, y: 5 }]
    expect(rdpSimplify(pts, 1)).toEqual(pts)
  })
})
