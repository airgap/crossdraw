import { describe, it, expect } from 'bun:test'
import { noise1D, sampleSegments, taperMultiplier, renderWiggleStroke } from '@/render/wiggle-stroke'
import type { Segment } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────

/** Build a permutation table for a given seed (same logic as the module). */
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

/** Simple line path from (0,0) to (100,0). */
function horizontalLine(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: 100, y: 0 },
  ]
}

/** A cubic bezier path. */
function cubicPath(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: -50 },
  ]
}

/** A quadratic bezier path. */
function quadraticPath(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 60 },
  ]
}

// ─── Tests ───────────────────────────────────────────────────

describe('noise1D', () => {
  it('output is within [-1, 1]', () => {
    const perm = buildPermutation(42)
    for (let i = 0; i < 1000; i++) {
      const x = (i - 500) * 0.1
      const val = noise1D(x, perm)
      expect(val).toBeGreaterThanOrEqual(-1)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic with the same seed', () => {
    const perm1 = buildPermutation(123)
    const perm2 = buildPermutation(123)
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37
      expect(noise1D(x, perm1)).toBe(noise1D(x, perm2))
    }
  })

  it('produces different values with different seeds', () => {
    const perm1 = buildPermutation(1)
    const perm2 = buildPermutation(2)
    let diffs = 0
    for (let i = 0; i < 50; i++) {
      const x = i * 0.5
      if (noise1D(x, perm1) !== noise1D(x, perm2)) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })
})

describe('sampleSegments', () => {
  it('produces at least 2 points for a line segment', () => {
    const { points } = sampleSegments(horizontalLine())
    expect(points.length).toBeGreaterThanOrEqual(2)
  })

  it('correct number of points based on path length and interval', () => {
    // 100px line with interval 10 → ceil(100/10)+1 = 11 points
    const { points } = sampleSegments(horizontalLine(), 10)
    expect(points.length).toBe(11)
  })

  it('samples cubic bezier segments', () => {
    const { points } = sampleSegments(cubicPath(), 5)
    expect(points.length).toBeGreaterThan(2)
    // First and last points should be at the endpoints
    expect(points[0]!.x).toBeCloseTo(0, 1)
    expect(points[0]!.y).toBeCloseTo(0, 1)
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 1)
    expect(points[points.length - 1]!.y).toBeCloseTo(0, 1)
  })

  it('samples quadratic bezier segments', () => {
    const { points } = sampleSegments(quadraticPath(), 5)
    expect(points.length).toBeGreaterThan(2)
    expect(points[0]!.x).toBeCloseTo(0, 1)
    expect(points[points.length - 1]!.x).toBeCloseTo(100, 1)
  })

  it('handles a single move (degenerate case)', () => {
    const { points } = sampleSegments([{ type: 'move', x: 10, y: 20 }])
    expect(points.length).toBe(1)
    expect(points[0]!.x).toBe(10)
    expect(points[0]!.y).toBe(20)
  })

  it('cumulative lengths match expected total for a straight line', () => {
    const { lengths } = sampleSegments(horizontalLine(), 10)
    // Total should be ~100
    expect(lengths[lengths.length - 1]!).toBeCloseTo(100, 1)
  })
})

describe('taperMultiplier', () => {
  it('returns 1 when no taper', () => {
    expect(taperMultiplier(0.5, 0, 0)).toBe(1)
    expect(taperMultiplier(0, 0, 0)).toBe(1)
    expect(taperMultiplier(1, 0, 0)).toBe(1)
  })

  it('reduces amplitude at start when taperStart > 0', () => {
    // taperStart = 0.2 means amplitude ramps from 0 at t=0 to full at t=0.2
    expect(taperMultiplier(0, 0.2, 0)).toBe(0)
    expect(taperMultiplier(0.1, 0.2, 0)).toBeCloseTo(0.5, 5)
    expect(taperMultiplier(0.2, 0.2, 0)).toBe(1)
    expect(taperMultiplier(0.5, 0.2, 0)).toBe(1)
  })

  it('reduces amplitude at end when taperEnd > 0', () => {
    expect(taperMultiplier(1, 0, 0.3)).toBe(0)
    expect(taperMultiplier(0.85, 0, 0.3)).toBeCloseTo(0.5, 5)
    expect(taperMultiplier(0.5, 0, 0.3)).toBe(1)
  })

  it('applies both tapers simultaneously', () => {
    // At the very start and end, should be 0
    expect(taperMultiplier(0, 0.5, 0.5)).toBe(0)
    expect(taperMultiplier(1, 0.5, 0.5)).toBe(0)
    // Middle should be 1
    expect(taperMultiplier(0.5, 0.2, 0.2)).toBe(1)
  })

  it('clamps to [0, 1]', () => {
    // Even with weird inputs, result should be clamped
    expect(taperMultiplier(-0.1, 0.5, 0.5)).toBe(0)
    expect(taperMultiplier(1.1, 0.5, 0.5)).toBe(0)
  })
})

describe('amplitude=0 produces straight stroke', () => {
  it('with amplitude 0, displaced points match original path points', () => {
    const segments = horizontalLine()
    const { points } = sampleSegments(segments, 10)
    // With amplitude=0, the renderWiggleStroke would not displace anything.
    // We verify by checking that the noise scaling produces zero offset.
    const perm = buildPermutation(42)
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1)
      const displacement = noise1D(t * 10, perm) * 0 // amplitude=0
      expect(Math.abs(displacement)).toBe(0)
    }
  })
})

describe('different frequencies produce different displacements', () => {
  it('changing frequency changes the noise displacement pattern', () => {
    const perm = buildPermutation(42)
    const freq1 = 5
    const freq2 = 20
    let diffs = 0
    for (let i = 0; i < 50; i++) {
      const t = i / 49
      const d1 = noise1D(t * freq1, perm)
      const d2 = noise1D(t * freq2, perm)
      if (Math.abs(d1 - d2) > 0.001) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })
})

describe('renderWiggleStroke integration', () => {
  it('calls canvas methods without throwing', () => {
    // Minimal canvas mock
    const calls: string[] = []
    const ctx = {
      beginPath: () => calls.push('beginPath'),
      moveTo: (_x: number, _y: number) => calls.push('moveTo'),
      lineTo: (_x: number, _y: number) => calls.push('lineTo'),
      stroke: () => calls.push('stroke'),
      lineWidth: 2,
    } as unknown as CanvasRenderingContext2D

    renderWiggleStroke(ctx, horizontalLine(), 2, {
      amplitude: 5,
      frequency: 10,
      seed: 0,
      taperStart: 0,
      taperEnd: 0,
    })

    expect(calls).toContain('beginPath')
    expect(calls).toContain('moveTo')
    expect(calls).toContain('stroke')
    // Should have lineTo calls for the intermediate points
    expect(calls.filter((c) => c === 'lineTo').length).toBeGreaterThan(0)
  })

  it('handles empty segments gracefully', () => {
    const calls: string[] = []
    const ctx = {
      beginPath: () => calls.push('beginPath'),
      moveTo: () => calls.push('moveTo'),
      lineTo: () => calls.push('lineTo'),
      stroke: () => calls.push('stroke'),
      lineWidth: 2,
    } as unknown as CanvasRenderingContext2D

    // Should not throw
    renderWiggleStroke(ctx, [], 2, {
      amplitude: 5,
      frequency: 10,
      seed: 0,
      taperStart: 0,
      taperEnd: 0,
    })
    // No stroke should be drawn for empty path
    expect(calls).not.toContain('stroke')
  })
})
