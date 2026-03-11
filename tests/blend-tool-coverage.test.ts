import { describe, test, expect } from 'bun:test'
import {
  interpolateTransform,
  interpolatePaths,
  generateBlend,
  createBlendGroup,
  subdivideSegments,
} from '@/tools/blend-tool'
import type { VectorLayer, Path, Segment, Transform } from '@/types'
import { v4 as uuid } from 'uuid'

// ── Helpers ──

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: uuid(),
    name: 'Test Layer',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function makeSquarePath(size: number): Path {
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: size, y: 0 },
      { type: 'line', x: size, y: size },
      { type: 'line', x: 0, y: size },
      { type: 'close' },
    ],
  }
}

// ── Tests covering lines 70-93 (promoteToCubic) ──

describe('promoteToCubic via interpolation (lines 70-93)', () => {
  test('interpolates line + cubic (type mismatch triggers promoteToCubic)', () => {
    const p1: Path = {
      id: uuid(),
      closed: true,
      segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }],
    }
    const p2: Path = {
      id: uuid(),
      closed: true,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
        { type: 'close' },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)
    // The interpolated segment should be a cubic (promoted from line)
    const segs = result[0]!.segments
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(segs[1]!.type).toBe('cubic')
  })

  test('interpolates quadratic + line (quadratic elevation to cubic)', () => {
    const p1: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
      ],
    }
    const p2: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)
    expect(result[0]!.segments[1]!.type).toBe('cubic')
  })

  test('interpolates arc + line (arc promotes to degenerate cubic)', () => {
    const p1: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'arc', x: 50, y: 50, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
      ],
    }
    const p2: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 50 },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)
    // Should not throw; both promoted to cubic
    expect(result[0]!.segments[1]!.type).toBe('cubic')
  })

  test('interpolates close + non-close triggers promoteToCubic for close', () => {
    const p1: Path = {
      id: uuid(),
      closed: true,
      segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }],
    }
    const p2: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
        { type: 'line', x: 50, y: 50 },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)
    expect(result[0]!.segments.length).toBeGreaterThanOrEqual(2)
  })

  test('interpolates move + non-move triggers promoteToCubic for move', () => {
    const p1: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'move', x: 50, y: 50 },
      ],
    }
    const p2: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 50 },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)
    // Move promoted to cubic when paired with line
    expect(result[0]!.segments[1]!.type).toBe('cubic')
  })
})

// ── Tests covering lines 119-144 (interpolateSegment same-type) ──

describe('interpolateSegment same-type cases (lines 119-144)', () => {
  test('interpolates two close segments', () => {
    const p1: Path = {
      id: uuid(),
      closed: true,
      segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }],
    }
    const p2: Path = {
      id: uuid(),
      closed: true,
      segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 200, y: 0 }, { type: 'close' }],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    // close + close => close
    const lastSeg = result[0]!.segments[result[0]!.segments.length - 1]!
    expect(lastSeg.type).toBe('close')
  })

  test('interpolates two cubic segments directly', () => {
    const p1: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
      ],
    }
    const p2: Path = {
      id: uuid(),
      closed: false,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 200, y: 0, cp1x: 60, cp1y: -100, cp2x: 140, cp2y: -100 },
      ],
    }
    const result = interpolatePaths([p1], [p2], 0.5)
    const seg = result[0]!.segments[1]!
    expect(seg.type).toBe('cubic')
    if (seg.type === 'cubic') {
      expect(seg.x).toBeCloseTo(150, 5)
      expect(seg.cp1x).toBeCloseTo(45, 5)
      expect(seg.cp2x).toBeCloseTo(105, 5)
    }
  })
})

// ── Tests covering lines 191-217 (subdivideSegments edge cases) ──

describe('subdivideSegments edge cases (lines 191-217)', () => {
  test('subdivides cubic segments via de Casteljau split', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
      { type: 'close' },
    ]
    // 2 drawable segments, target 4
    const result = subdivideSegments(segs, 4)
    const drawables = result.filter((s) => s.type !== 'close')
    expect(drawables.length).toBe(4)
    // The cubic should be split, creating more cubic segments
    const cubics = drawables.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBeGreaterThanOrEqual(2)
  })

  test('subdivides move-only segment by inserting lines', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'move', x: 100, y: 100 },
    ]
    const result = subdivideSegments(segs, 4)
    const drawables = result.filter((s) => s.type !== 'close')
    expect(drawables.length).toBe(4)
  })

  test('subdivides quadratic/arc as fallback (line-based split)', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
    ]
    const result = subdivideSegments(segs, 4)
    const drawables = result.filter((s) => s.type !== 'close')
    expect(drawables.length).toBe(4)
  })

  test('no close segment preserved when input has no close', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
    ]
    const result = subdivideSegments(segs, 4)
    const closes = result.filter((s) => s.type === 'close')
    expect(closes.length).toBe(0)
  })
})

// ── Tests covering null fill/stroke interpolation edge cases ──

describe('fill/stroke interpolation edge cases', () => {
  test('both fills null returns null fill in blend', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], fill: null })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(100)], fill: null })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even' })
    expect(result[0]!.fill).toBeNull()
  })

  test('both strokes null returns null stroke in blend', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke: null })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke: null })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even' })
    expect(result[0]!.stroke).toBeNull()
  })

  test('first fill null, second has fill uses second fill', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], fill: null })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even' })
    expect(result[0]!.fill).not.toBeNull()
    expect(result[0]!.fill!.color).toBe('#ff0000')
  })

  test('first stroke present, second null uses first stroke', () => {
    const stroke = {
      width: 4,
      color: '#00ff00',
      opacity: 1,
      position: 'center' as const,
      linecap: 'round' as const,
      linejoin: 'round' as const,
      miterLimit: 4,
    }
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke: null })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even' })
    expect(result[0]!.stroke).not.toBeNull()
    expect(result[0]!.stroke!.color).toBe('#00ff00')
  })

  test('stroke properties interpolated: position, linecap, linejoin change at midpoint', () => {
    const s1 = {
      width: 2,
      color: '#000000',
      opacity: 1,
      position: 'center' as const,
      linecap: 'butt' as const,
      linejoin: 'miter' as const,
      miterLimit: 4,
    }
    const s2 = {
      width: 8,
      color: '#ffffff',
      opacity: 1,
      position: 'inside' as const,
      linecap: 'round' as const,
      linejoin: 'round' as const,
      miterLimit: 10,
    }
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke: s1 })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(100)], stroke: s2 })

    // At t < 0.5, properties should come from s1
    const resultEarly = generateBlend(layer1, layer2, { steps: 3, spacing: 'even' })
    // step 1: t = 0.25 < 0.5 => s1 position
    expect(resultEarly[0]!.stroke!.position).toBe('center')
    expect(resultEarly[0]!.stroke!.linecap).toBe('butt')
    // step 3: t = 0.75 > 0.5 => s2 position
    expect(resultEarly[2]!.stroke!.position).toBe('inside')
    expect(resultEarly[2]!.stroke!.linecap).toBe('round')
  })

  test('fill with missing color defaults to #000000', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', opacity: 1 } as any,
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#ffffff', opacity: 1 },
    })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even' })
    expect(result[0]!.fill).not.toBeNull()
    // Interpolating #000000 with #ffffff at 0.5
    expect(result[0]!.fill!.color).toBe('#808080')
  })
})

// ── Tests for skew interpolation ──

describe('interpolateTransform skew defaults', () => {
  test('handles missing skew values (defaults to 0)', () => {
    const t1: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    const t2: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 20, skewY: 40 }
    const result = interpolateTransform(t1, t2, 0.5)
    expect(result.skewX).toBe(10) // (0 + 20) / 2
    expect(result.skewY).toBe(20) // (0 + 40) / 2
  })
})

// ── createBlendGroup additional tests ──

describe('createBlendGroup properties', () => {
  test('group has correct default properties', () => {
    const layer1 = makeVectorLayer()
    const layer2 = makeVectorLayer()
    const group = createBlendGroup(layer1, layer2, [], 'artboard-1')
    expect(group.opacity).toBe(1)
    expect(group.blendMode).toBe('normal')
    expect(group.visible).toBe(true)
    expect(group.locked).toBe(false)
    expect(group.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
  })
})
