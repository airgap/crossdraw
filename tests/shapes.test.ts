import { describe, it, expect } from 'bun:test'
import { generateRectangle, generateEllipse, generatePolygon, generateStar } from '@/tools/shapes'

describe('generateRectangle', () => {
  it('generates 5 segments (move, 3 lines, close)', () => {
    const segs = generateRectangle(0, 0, 100, 50)
    expect(segs).toHaveLength(5)
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('line')
    expect(segs[4]!.type).toBe('close')
  })

  it('has correct corners', () => {
    const segs = generateRectangle(10, 20, 100, 50)
    expect(segs[0]).toEqual({ type: 'move', x: 10, y: 20 })
    expect(segs[1]).toEqual({ type: 'line', x: 110, y: 20 })
    expect(segs[2]).toEqual({ type: 'line', x: 110, y: 70 })
    expect(segs[3]).toEqual({ type: 'line', x: 10, y: 70 })
  })

  it('generates rounded corners when radius > 0', () => {
    const segs = generateRectangle(0, 0, 100, 100, 10)
    // Rounded rect has: move + line + cubic (4 pairs) = 10 segments
    expect(segs.length).toBeGreaterThan(5)
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics).toHaveLength(4)
  })
})

describe('generateEllipse', () => {
  it('generates 6 segments (move, 4 cubics, close)', () => {
    const segs = generateEllipse(50, 50, 40, 30)
    expect(segs).toHaveLength(6)
    expect(segs[0]!.type).toBe('move')
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics).toHaveLength(4)
    expect(segs[5]!.type).toBe('close')
  })

  it('rightmost point is at cx+rx', () => {
    const segs = generateEllipse(50, 50, 40, 30)
    const move = segs[0]!
    expect('x' in move && move.x).toBe(90) // 50 + 40
    expect('y' in move && move.y).toBe(50)
  })
})

describe('generatePolygon', () => {
  it('generates triangle (3 sides)', () => {
    const segs = generatePolygon(0, 0, 50, 3)
    // move + 2 lines + close = 4
    expect(segs).toHaveLength(4)
    expect(segs[0]!.type).toBe('move')
    expect(segs[3]!.type).toBe('close')
  })

  it('generates hexagon (6 sides)', () => {
    const segs = generatePolygon(0, 0, 50, 6)
    // move + 5 lines + close = 7
    expect(segs).toHaveLength(7)
  })

  it('clamps sides to 3-12', () => {
    const tooFew = generatePolygon(0, 0, 50, 1)
    expect(tooFew).toHaveLength(4) // 3 sides minimum

    const tooMany = generatePolygon(0, 0, 50, 20)
    expect(tooMany).toHaveLength(13) // 12 sides maximum
  })
})

describe('generateStar', () => {
  it('generates 5-point star with 11 segments', () => {
    const segs = generateStar(0, 0, 50, 0.4, 5)
    // 5 * 2 = 10 points (alternating outer/inner) + close = 11
    // move + 9 lines + close = 11
    expect(segs).toHaveLength(11)
    expect(segs[0]!.type).toBe('move')
    expect(segs[10]!.type).toBe('close')
  })

  it('has alternating radii', () => {
    const segs = generateStar(0, 0, 100, 0.5, 5)
    const outerPts = segs.filter((_, i) => i % 2 === 0 && 'x' in segs[i]!)
    const innerPts = segs.filter((_, i) => i % 2 === 1 && 'x' in segs[i]!)

    // Outer points should be farther from center
    for (const seg of outerPts) {
      if ('x' in seg) {
        const dist = Math.hypot(seg.x, seg.y)
        expect(dist).toBeCloseTo(100, 0)
      }
    }
    for (const seg of innerPts) {
      if ('x' in seg) {
        const dist = Math.hypot(seg.x, seg.y)
        expect(dist).toBeCloseTo(50, 0)
      }
    }
  })
})
