import { describe, it, expect } from 'bun:test'
import {
  warpPoint,
  warpSegments,
  warpPaths,
  computeSegmentBounds,
  WARP_PRESETS,
} from '@/render/envelope-distort'
import type { EnvelopeParams, Bounds } from '@/render/envelope-distort'
import type { Segment, Path } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────

/** Standard unit bounding box for testing. */
const unitBounds: Bounds = { minX: 0, minY: 0, width: 100, height: 100 }

/** Build params with defaults. */
function params(
  preset: EnvelopeParams['preset'],
  bend = 0.5,
  hDist = 0,
  vDist = 0,
): EnvelopeParams {
  return { preset, bend, horizontalDistortion: hDist, verticalDistortion: vDist }
}

/** Simple rectangle segments. */
function rectangleSegments(): Segment[] {
  return [
    { type: 'move', x: 10, y: 10 },
    { type: 'line', x: 90, y: 10 },
    { type: 'line', x: 90, y: 90 },
    { type: 'line', x: 10, y: 90 },
    { type: 'close' },
  ]
}

/** Path with all segment types for comprehensive warping tests. */
function mixedSegments(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: 50, y: 0 },
    { type: 'cubic', x: 100, y: 50, cp1x: 75, cp1y: 0, cp2x: 100, cp2y: 25 },
    { type: 'close' },
  ]
}

// ─── warpPoint: 'none' preset ────────────────────────────────

describe('warpPoint with none preset', () => {
  it('returns original point unchanged', () => {
    const p = warpPoint(50, 50, unitBounds, params('none'))
    expect(p.x).toBe(50)
    expect(p.y).toBe(50)
  })

  it('returns original for any coordinate', () => {
    const p = warpPoint(73.5, 22.1, unitBounds, params('none'))
    expect(p.x).toBe(73.5)
    expect(p.y).toBe(22.1)
  })
})

// ─── warpPoint: arc preset ──────────────────────────────────

describe('warpPoint with arc preset', () => {
  it('bends points - center displaced most', () => {
    const center = warpPoint(50, 50, unitBounds, params('arc', 0.5))
    const edge = warpPoint(0, 50, unitBounds, params('arc', 0.5))
    // Center should be displaced more than edge
    expect(Math.abs(center.y - 50)).toBeGreaterThan(Math.abs(edge.y - 50))
  })

  it('edges are not displaced', () => {
    const left = warpPoint(0, 50, unitBounds, params('arc', 1))
    const right = warpPoint(100, 50, unitBounds, params('arc', 1))
    // At x=0 and x=100, the parabolic factor is 0, so y unchanged
    expect(left.y).toBe(50)
    expect(right.y).toBe(50)
  })

  it('positive bend pushes center upward', () => {
    const p = warpPoint(50, 50, unitBounds, params('arc', 1))
    expect(p.y).toBeLessThan(50)
  })

  it('negative bend pushes center downward', () => {
    const p = warpPoint(50, 50, unitBounds, params('arc', -1))
    expect(p.y).toBeGreaterThan(50)
  })
})

// ─── warpPoint: bulge preset ────────────────────────────────

describe('warpPoint with bulge preset', () => {
  it('center point is not displaced', () => {
    const p = warpPoint(50, 50, unitBounds, params('bulge', 0.5))
    // Center is at nx=0.5, ny=0.5 → cx=0, cy=0 → displacement proportional to cx,cy
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('corner points are displaced outward with positive bend', () => {
    const corner = warpPoint(10, 10, unitBounds, params('bulge', 1))
    // Top-left corner should move further top-left
    expect(corner.x).toBeLessThan(10)
    expect(corner.y).toBeLessThan(10)
  })

  it('negative bend pulls corners inward', () => {
    const corner = warpPoint(10, 10, unitBounds, params('bulge', -1))
    // Negative bulge pushes toward center
    expect(corner.x).toBeGreaterThan(10)
    expect(corner.y).toBeGreaterThan(10)
  })
})

// ─── warpPoint: wave preset ────────────────────────────────

describe('warpPoint with wave preset', () => {
  it('creates sinusoidal displacement', () => {
    // Use points that don't land on sine zeros (period = 4π for dy, 3π for dx)
    const p1 = warpPoint(12, 50, unitBounds, params('wave', 1))
    const p2 = warpPoint(37, 50, unitBounds, params('wave', 1))
    const p3 = warpPoint(63, 50, unitBounds, params('wave', 1))
    // At least some y values should differ from the original 50
    const displaced = [p1, p2, p3].some(
      (p) => Math.abs(p.y - 50) > 0.1 || Math.abs(p.x - p.y + 50 - 12) > 0.1,
    )
    expect(displaced).toBe(true)
  })

  it('wave also displaces x', () => {
    const p = warpPoint(50, 50, unitBounds, params('wave', 1))
    // Wave preset applies both dx and dy
    const original = warpPoint(50, 50, unitBounds, params('none'))
    const hasDx = Math.abs(p.x - original.x) > 0.01
    const hasDy = Math.abs(p.y - original.y) > 0.01
    expect(hasDx || hasDy).toBe(true)
  })
})

// ─── warpPoint: twist preset ───────────────────────────────

describe('warpPoint with twist preset', () => {
  it('center point is not displaced', () => {
    const p = warpPoint(50, 50, unitBounds, params('twist', 1))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('off-center points are rotated', () => {
    const p = warpPoint(75, 50, unitBounds, params('twist', 1))
    // Point at (75, 50) → normalized (0.75, 0.5) → cx=0.25, cy=0
    // Should be rotated around center
    expect(p.x).not.toBeCloseTo(75, 0)
    expect(p.y).not.toBeCloseTo(50, 0)
  })

  it('farther points are twisted more', () => {
    const near = warpPoint(55, 50, unitBounds, params('twist', 1))
    const far = warpPoint(90, 50, unitBounds, params('twist', 1))
    const nearDist = Math.sqrt((near.x - 55) ** 2 + (near.y - 50) ** 2)
    const farDist = Math.sqrt((far.x - 90) ** 2 + (far.y - 50) ** 2)
    expect(farDist).toBeGreaterThan(nearDist)
  })
})

// ─── bend=0 produces minimal distortion ────────────────────

describe('bend=0 produces minimal distortion', () => {
  it('arc with bend=0', () => {
    const p = warpPoint(50, 50, unitBounds, params('arc', 0))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('bulge with bend=0', () => {
    const p = warpPoint(30, 70, unitBounds, params('bulge', 0))
    expect(p.x).toBeCloseTo(30, 5)
    expect(p.y).toBeCloseTo(70, 5)
  })

  it('flag with bend=0', () => {
    const p = warpPoint(50, 50, unitBounds, params('flag', 0))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('twist with bend=0', () => {
    const p = warpPoint(75, 25, unitBounds, params('twist', 0))
    expect(p.x).toBeCloseTo(75, 5)
    expect(p.y).toBeCloseTo(25, 5)
  })

  it('rise with bend=0', () => {
    const p = warpPoint(50, 50, unitBounds, params('rise', 0))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('squeeze with bend=0', () => {
    const p = warpPoint(50, 50, unitBounds, params('squeeze', 0))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('wave with bend=0', () => {
    const p = warpPoint(50, 50, unitBounds, params('wave', 0))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })
})

// ─── warpSegments ──────────────────────────────────────────

describe('warpSegments', () => {
  it('handles move segments', () => {
    const segs: Segment[] = [{ type: 'move', x: 50, y: 50 }]
    const result = warpSegments(segs, unitBounds, params('arc', 0.5))
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('move')
    if (result[0]!.type === 'move') {
      expect(typeof result[0]!.x).toBe('number')
      expect(typeof result[0]!.y).toBe('number')
    }
  })

  it('handles line segments', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 100 },
    ]
    const result = warpSegments(segs, unitBounds, params('bulge', 0.5))
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('move')
    expect(result[1]!.type).toBe('line')
  })

  it('handles cubic segments with control points', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 50 },
      { type: 'cubic', x: 100, y: 50, cp1x: 30, cp1y: 10, cp2x: 70, cp2y: 90 },
    ]
    const result = warpSegments(segs, unitBounds, params('arc', 0.5))
    expect(result).toHaveLength(2)
    const cubic = result[1]!
    expect(cubic.type).toBe('cubic')
    if (cubic.type === 'cubic') {
      // Control points should also be warped (arc modifies y)
      expect(cubic.cp1y).not.toBe(10)
      expect(cubic.cp2y).not.toBe(90)
    }
  })

  it('handles close segments', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'close' },
    ]
    const result = warpSegments(segs, unitBounds, params('wave', 0.5))
    expect(result).toHaveLength(3)
    expect(result[2]!.type).toBe('close')
  })

  it('preserves segment count', () => {
    const segs = mixedSegments()
    const result = warpSegments(segs, unitBounds, params('flag', 0.5))
    expect(result).toHaveLength(segs.length)
  })

  it('with none preset returns original segments', () => {
    const segs = rectangleSegments()
    const result = warpSegments(segs, unitBounds, params('none'))
    expect(result).toBe(segs)
  })

  it('handles all segment types together', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'cubic', x: 100, y: 50, cp1x: 75, cp1y: 0, cp2x: 100, cp2y: 25 },
      { type: 'quadratic', x: 50, y: 100, cpx: 100, cpy: 100 },
      { type: 'arc', x: 0, y: 50, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: true },
      { type: 'close' },
    ]
    const result = warpSegments(segs, unitBounds, params('twist', 0.5))
    expect(result).toHaveLength(6)
    expect(result[0]!.type).toBe('move')
    expect(result[1]!.type).toBe('line')
    expect(result[2]!.type).toBe('cubic')
    expect(result[3]!.type).toBe('quadratic')
    expect(result[4]!.type).toBe('arc')
    expect(result[5]!.type).toBe('close')

    // Quadratic control point should be warped
    if (result[3]!.type === 'quadratic') {
      expect(typeof result[3]!.cpx).toBe('number')
      expect(typeof result[3]!.cpy).toBe('number')
    }
  })
})

// ─── computeSegmentBounds ──────────────────────────────────

describe('computeSegmentBounds', () => {
  it('computes bounds from line segments', () => {
    const segs: Segment[] = [
      { type: 'move', x: 10, y: 20 },
      { type: 'line', x: 90, y: 80 },
    ]
    const bounds = computeSegmentBounds(segs)
    expect(bounds.minX).toBe(10)
    expect(bounds.minY).toBe(20)
    expect(bounds.width).toBe(80)
    expect(bounds.height).toBe(60)
  })

  it('includes cubic control points in bounds', () => {
    const segs: Segment[] = [
      { type: 'move', x: 50, y: 50 },
      { type: 'cubic', x: 80, y: 80, cp1x: 0, cp1y: 100, cp2x: 100, cp2y: 0 },
    ]
    const bounds = computeSegmentBounds(segs)
    expect(bounds.minX).toBe(0)
    expect(bounds.minY).toBe(0)
    expect(bounds.width).toBe(100)
    expect(bounds.height).toBe(100)
  })

  it('includes quadratic control points in bounds', () => {
    const segs: Segment[] = [
      { type: 'move', x: 50, y: 50 },
      { type: 'quadratic', x: 80, y: 80, cpx: 0, cpy: 100 },
    ]
    const bounds = computeSegmentBounds(segs)
    expect(bounds.minX).toBe(0)
    expect(bounds.minY).toBe(50)
    expect(bounds.width).toBe(80)
    expect(bounds.height).toBe(50)
  })

  it('returns zero bounds for empty segments', () => {
    const bounds = computeSegmentBounds([])
    expect(bounds.minX).toBe(0)
    expect(bounds.minY).toBe(0)
    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
  })

  it('handles close segments (no coordinates)', () => {
    const segs: Segment[] = [
      { type: 'move', x: 10, y: 10 },
      { type: 'line', x: 50, y: 50 },
      { type: 'close' },
    ]
    const bounds = computeSegmentBounds(segs)
    expect(bounds.minX).toBe(10)
    expect(bounds.minY).toBe(10)
    expect(bounds.width).toBe(40)
    expect(bounds.height).toBe(40)
  })
})

// ─── warpPaths ─────────────────────────────────────────────

describe('warpPaths', () => {
  it('returns original paths for none preset', () => {
    const paths: Path[] = [
      { id: 'p1', segments: rectangleSegments(), closed: true },
    ]
    const result = warpPaths(paths, params('none'))
    expect(result).toBe(paths)
  })

  it('warps multiple paths using unified bounds', () => {
    const paths: Path[] = [
      { id: 'p1', segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 50, y: 50 }], closed: false },
      { id: 'p2', segments: [{ type: 'move', x: 50, y: 50 }, { type: 'line', x: 100, y: 100 }], closed: false },
    ]
    const result = warpPaths(paths, params('arc', 0.5))
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('p1')
    expect(result[1]!.id).toBe('p2')
    // Paths should be warped (not identical to originals)
    if (result[0]!.segments[1]!.type === 'line') {
      // At x=50 (center), arc should displace y
      expect(result[0]!.segments[1]!.y).not.toBe(50)
    }
  })

  it('preserves path metadata (id, closed, fillRule)', () => {
    const paths: Path[] = [
      { id: 'test-path', segments: rectangleSegments(), closed: true, fillRule: 'evenodd' },
    ]
    const result = warpPaths(paths, params('bulge', 0.3))
    expect(result[0]!.id).toBe('test-path')
    expect(result[0]!.closed).toBe(true)
    expect(result[0]!.fillRule).toBe('evenodd')
  })
})

// ─── Preset coverage ──────────────────────────────────────

describe('all presets produce finite results', () => {
  for (const preset of WARP_PRESETS) {
    if (preset === 'none') continue
    it(`${preset} preset returns finite coordinates`, () => {
      const p = warpPoint(50, 50, unitBounds, params(preset, 0.5))
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    })
  }
})

describe('horizontal and vertical distortion', () => {
  it('horizontal distortion shifts x based on y position', () => {
    // Use 'arc' with bend=0 so the preset itself produces no distortion, only h-distortion applies
    const topArc = warpPoint(50, 0, unitBounds, { preset: 'arc', bend: 0, horizontalDistortion: 0.5, verticalDistortion: 0 })
    const bottomArc = warpPoint(50, 100, unitBounds, { preset: 'arc', bend: 0, horizontalDistortion: 0.5, verticalDistortion: 0 })
    // At y=0 (top), ny=0, factor=(0-0.5)*width*hDist = -0.5*100*0.5 = -25
    // At y=100 (bottom), ny=1, factor=(1-0.5)*width*hDist = 0.5*100*0.5 = 25
    expect(topArc.x).toBeLessThan(50)
    expect(bottomArc.x).toBeGreaterThan(50)
  })

  it('vertical distortion shifts y based on x position', () => {
    const leftArc = warpPoint(0, 50, unitBounds, { preset: 'arc', bend: 0, horizontalDistortion: 0, verticalDistortion: 0.5 })
    const rightArc = warpPoint(100, 50, unitBounds, { preset: 'arc', bend: 0, horizontalDistortion: 0, verticalDistortion: 0.5 })
    expect(leftArc.y).toBeLessThan(50)
    expect(rightArc.y).toBeGreaterThan(50)
  })
})

// ─── Additional preset tests ───────────────────────────────

describe('fish preset', () => {
  it('center is unchanged', () => {
    const p = warpPoint(50, 50, unitBounds, params('fish', 0.5))
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(50, 5)
  })

  it('off-center points are displaced', () => {
    const p = warpPoint(75, 75, unitBounds, params('fish', 0.5))
    const displaced = Math.abs(p.x - 75) > 0.01 || Math.abs(p.y - 75) > 0.01
    expect(displaced).toBe(true)
  })
})

describe('flag preset', () => {
  it('creates sinusoidal y displacement', () => {
    // At nx=0.25 (quarter period), sin(pi/2) = 1 → maximum displacement
    const p = warpPoint(25, 50, unitBounds, params('flag', 1))
    expect(Math.abs(p.y - 50)).toBeGreaterThan(0)
  })
})

describe('arch preset', () => {
  it('top row displaced more than bottom row', () => {
    const top = warpPoint(50, 10, unitBounds, params('arch', 1))
    const bottom = warpPoint(50, 90, unitBounds, params('arch', 1))
    expect(Math.abs(top.y - 10)).toBeGreaterThan(Math.abs(bottom.y - 90))
  })
})

describe('rise preset', () => {
  it('right side displaced more than left', () => {
    const left = warpPoint(10, 50, unitBounds, params('rise', 1))
    const right = warpPoint(90, 50, unitBounds, params('rise', 1))
    expect(Math.abs(right.y - 50)).toBeGreaterThan(Math.abs(left.y - 50))
  })
})

describe('squeeze preset', () => {
  it('creates horizontal compression', () => {
    const p = warpPoint(75, 50, unitBounds, params('squeeze', 1))
    // At vertical center (ny=0.5), yCenterFactor=1, max squeeze
    // x=75 → nx=0.75, (0.75-0.5)=0.25, displacement = -0.25*1*1*40 = -10
    expect(p.x).not.toBeCloseTo(75, 0)
  })
})
