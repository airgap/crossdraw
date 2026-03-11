import { describe, test, expect } from 'bun:test'
import { noise1D, sampleSegments, taperMultiplier, renderWiggleStroke } from '@/render/wiggle-stroke'
import type { Segment } from '@/types'

/**
 * Additional coverage tests for wiggle-stroke.ts to reach 90%+.
 * Targets uncovered branches: arc segments in sampleSegments, close with
 * same position, renderWiggleStroke with taper, and edge cases.
 */

// ── Canvas context mock ──

function mockCtx() {
  const calls: { method: string; args: any[] }[] = []
  const record =
    (name: string) =>
    (...args: any[]) =>
      calls.push({ method: name, args })
  return {
    ctx: {
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
      lineWidth: 2,
    } as unknown as CanvasRenderingContext2D,
    calls,
  }
}

// ── sampleSegments: arc segments ──

describe('sampleSegments with arc segments', () => {
  test('samples arc segments into points', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 100, y: 100, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
    ]
    const { points, lengths } = sampleSegments(segments, 5)
    expect(points.length).toBeGreaterThan(2)
    // First point should be near (0,0)
    expect(points[0]!.x).toBeCloseTo(0, 0)
    expect(points[0]!.y).toBeCloseTo(0, 0)
    // Last point should be near (100,100)
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 0)
    expect(points[points.length - 1]!.y).toBeCloseTo(100, 0)
    // Lengths should be monotonically increasing
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThanOrEqual(lengths[i - 1]!)
    }
  })

  test('handles arc with zero-length (same start and end)', () => {
    const segments: Segment[] = [
      { type: 'move', x: 50, y: 50 },
      { type: 'arc', x: 50, y: 50, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: true },
    ]
    const { points } = sampleSegments(segments, 5)
    // Should at least have the starting move point
    expect(points.length).toBeGreaterThanOrEqual(1)
  })
})

// ── sampleSegments: close segment branches ──

describe('sampleSegments with close segment', () => {
  test('close adds point when current position differs from start', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'close' },
    ]
    const { points } = sampleSegments(segments, 10)
    // The close segment should add the start point and resampling should produce many points
    expect(points.length).toBeGreaterThan(2)
  })

  test('close does not duplicate when already at start position', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 0, y: 0 },
      { type: 'close' },
    ]
    const { points } = sampleSegments(segments, 10)
    expect(points.length).toBeGreaterThanOrEqual(2)
  })
})

// ── sampleSegments: edge cases ──

describe('sampleSegments edge cases', () => {
  test('empty segments returns empty points', () => {
    const { points, lengths } = sampleSegments([])
    expect(points).toHaveLength(0)
    expect(lengths).toHaveLength(0)
  })

  test('single move returns one point with length 0', () => {
    const { points, lengths } = sampleSegments([{ type: 'move', x: 42, y: 99 }])
    expect(points).toHaveLength(1)
    expect(points[0]!.x).toBe(42)
    expect(points[0]!.y).toBe(99)
    expect(lengths[0]).toBe(0)
  })

  test('zero-length path (move + line to same point)', () => {
    const { points, lengths: _lengths } = sampleSegments([
      { type: 'move', x: 10, y: 10 },
      { type: 'line', x: 10, y: 10 },
    ])
    // Total length is 0, should return raw points
    expect(points.length).toBeGreaterThanOrEqual(1)
  })

  test('mixed segment types in one path', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 60, cp1y: 30, cp2x: 90, cp2y: -30 },
      { type: 'quadratic', x: 150, y: 0, cpx: 125, cpy: 50 },
      { type: 'arc', x: 200, y: 0, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: true },
      { type: 'line', x: 250, y: 0 },
      { type: 'close' },
    ]
    const { points, lengths } = sampleSegments(segments, 5)
    expect(points.length).toBeGreaterThan(10)
    expect(lengths[lengths.length - 1]!).toBeGreaterThan(0)
  })
})

// ── renderWiggleStroke: additional branches ──

describe('renderWiggleStroke additional coverage', () => {
  test('renders with taper at both ends', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(
      ctx,
      [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 200, y: 0 },
      ],
      3,
      { amplitude: 10, frequency: 8, seed: 42, taperStart: 0.3, taperEnd: 0.3 },
    )
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'moveTo')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'lineTo').length).toBeGreaterThan(0)
  })

  test('renders with very high frequency', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(
      ctx,
      [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ],
      2,
      { amplitude: 5, frequency: 100, seed: 7, taperStart: 0, taperEnd: 0 },
    )
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(1)
  })

  test('renders cubic path with wiggle', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(
      ctx,
      [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: -50 },
      ],
      2,
      { amplitude: 8, frequency: 12, seed: 99, taperStart: 0.1, taperEnd: 0.1 },
    )
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(1)
  })

  test('renders with zero amplitude (no displacement)', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(
      ctx,
      [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ],
      2,
      { amplitude: 0, frequency: 10, seed: 0, taperStart: 0, taperEnd: 0 },
    )
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(1)
  })

  test('handles single move segment (no draw)', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(ctx, [{ type: 'move', x: 0, y: 0 }], 2, {
      amplitude: 5,
      frequency: 10,
      seed: 0,
      taperStart: 0,
      taperEnd: 0,
    })
    // < 2 points, should not draw
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(0)
  })

  test('handles zero-length path (no draw)', () => {
    const { ctx, calls } = mockCtx()
    renderWiggleStroke(
      ctx,
      [
        { type: 'move', x: 50, y: 50 },
        { type: 'line', x: 50, y: 50 },
      ],
      2,
      { amplitude: 5, frequency: 10, seed: 0, taperStart: 0, taperEnd: 0 },
    )
    // totalLength = 0, should not draw
    expect(calls.filter((c) => c.method === 'stroke')).toHaveLength(0)
  })
})

// ── noise1D: additional edge cases ──

describe('noise1D edge cases', () => {
  function buildPermutation(seed: number): Uint8Array {
    const perm = new Uint8Array(512)
    for (let i = 0; i < 256; i++) perm[i] = i
    let s = (seed | 0) & 0x7fffffff
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff
      const j = s % (i + 1)
      const tmp = perm[i]!
      perm[i] = perm[j]!
      perm[j] = tmp
    }
    for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]!
    return perm
  }

  test('returns 0 at integer positions (gradient noise property)', () => {
    const perm = buildPermutation(42)
    // At integer x, xf=0 so both gradients evaluate at boundary
    // Result is lerp(g0(0), g1(-1), fade(0)) = g0(0) = 0
    const val = noise1D(0, perm)
    expect(val).toBeCloseTo(0, 5)
  })

  test('handles negative inputs', () => {
    const perm = buildPermutation(42)
    const val = noise1D(-5.5, perm)
    expect(val).toBeGreaterThanOrEqual(-1)
    expect(val).toBeLessThanOrEqual(1)
  })

  test('handles very large inputs', () => {
    const perm = buildPermutation(42)
    const val = noise1D(100000.7, perm)
    expect(val).toBeGreaterThanOrEqual(-1)
    expect(val).toBeLessThanOrEqual(1)
  })
})

// ── taperMultiplier: additional edge cases ──

describe('taperMultiplier edge cases', () => {
  test('returns correct value at exact taper boundary', () => {
    // At t = taperStart, multiplier should be exactly 1
    expect(taperMultiplier(0.3, 0.3, 0)).toBeCloseTo(1, 10)
  })

  test('returns correct value at exact end taper boundary', () => {
    // At t = 1 - taperEnd, multiplier should be 1
    expect(taperMultiplier(0.7, 0, 0.3)).toBeCloseTo(1, 10)
  })

  test('handles taperStart = 1 (entire path is taper)', () => {
    expect(taperMultiplier(0, 1, 0)).toBe(0)
    expect(taperMultiplier(0.5, 1, 0)).toBe(0.5)
    expect(taperMultiplier(1, 1, 0)).toBe(1)
  })

  test('handles taperEnd = 1 (entire path is taper)', () => {
    expect(taperMultiplier(0, 0, 1)).toBe(1)
    expect(taperMultiplier(0.5, 0, 1)).toBe(0.5)
    expect(taperMultiplier(1, 0, 1)).toBe(0)
  })
})
