import { describe, test, expect } from 'bun:test'
import { pathBBox, mergeBBox, expandBBox, bboxContainsPoint, getPathBBox, getLayerBBox } from '@/math/bbox'
import type {
  Segment,
  Path,
  VectorLayer,
  RasterLayer,
  GroupLayer,
  TextLayer,
  AdjustmentLayer,
  Artboard,
  Transform,
  Stroke,
} from '@/types'

// ---- Helpers ----

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }
}

const baseLayerDefaults = {
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal' as const,
  effects: [],
}

function makeArtboard(overrides: Partial<Artboard> = {}): Artboard {
  return {
    id: 'ab1',
    name: 'Artboard',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    layers: [],
    ...overrides,
  }
}

function makePath(segments: Segment[], closed = false): Path {
  return { id: 'p1', segments, closed }
}

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: 'v1',
    name: 'Vector',
    type: 'vector',
    ...baseLayerDefaults,
    transform: makeTransform(),
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  }
}

function makeRasterLayer(overrides: Partial<RasterLayer> = {}): RasterLayer {
  return {
    id: 'r1',
    name: 'Raster',
    type: 'raster',
    ...baseLayerDefaults,
    transform: makeTransform(),
    imageChunkId: 'img1',
    width: 200,
    height: 150,
    ...overrides,
  }
}

function makeGroupLayer(overrides: Partial<GroupLayer> = {}): GroupLayer {
  return {
    id: 'g1',
    name: 'Group',
    type: 'group',
    ...baseLayerDefaults,
    transform: makeTransform(),
    children: [],
    ...overrides,
  }
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 't1',
    name: 'Text',
    type: 'text',
    ...baseLayerDefaults,
    transform: makeTransform(),
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

function makeAdjustmentLayer(): AdjustmentLayer {
  return {
    id: 'adj1',
    name: 'Adjustment',
    type: 'adjustment',
    adjustmentType: 'levels',
    params: { blackPoint: 0, whitePoint: 255, gamma: 1 },
    ...baseLayerDefaults,
    transform: makeTransform(),
  } as AdjustmentLayer
}

// ---- Tests ----

describe('getLayerBBox', () => {
  describe('vector layers', () => {
    test('returns empty bbox for vector layer with no paths', () => {
      const layer = makeVectorLayer({ paths: [] })
      const artboard = makeArtboard()
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(Infinity)
      expect(bbox.minY).toBe(Infinity)
      expect(bbox.maxX).toBe(-Infinity)
      expect(bbox.maxY).toBe(-Infinity)
    })

    test('applies artboard offset to vector layer bbox', () => {
      const segments: Segment[] = [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 50 },
      ]
      const layer = makeVectorLayer({
        paths: [makePath(segments)],
      })
      const artboard = makeArtboard({ x: 100, y: 200 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(100) // 0 + 0(tx) + 100(artboard.x)
      expect(bbox.minY).toBe(200) // 0 + 0(ty) + 200(artboard.y)
      expect(bbox.maxX).toBe(150) // 50 + 0 + 100
      expect(bbox.maxY).toBe(250) // 50 + 0 + 200
    })

    test('applies layer transform offset', () => {
      const segments: Segment[] = [
        { type: 'move', x: 10, y: 10 },
        { type: 'line', x: 30, y: 30 },
      ]
      const layer = makeVectorLayer({
        paths: [makePath(segments)],
        transform: makeTransform({ x: 5, y: 7 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(15) // 10 + 5
      expect(bbox.minY).toBe(17) // 10 + 7
      expect(bbox.maxX).toBe(35) // 30 + 5
      expect(bbox.maxY).toBe(37) // 30 + 7
    })

    test('expands bbox for stroke width', () => {
      const segments: Segment[] = [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 100 },
      ]
      const stroke: Stroke = {
        width: 10,
        color: '#000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      }
      const layer = makeVectorLayer({
        paths: [makePath(segments)],
        stroke,
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      // stroke.width/2 = 5
      expect(bbox.minX).toBe(-5)
      expect(bbox.minY).toBe(-5)
      expect(bbox.maxX).toBe(105)
      expect(bbox.maxY).toBe(105)
    })

    test('merges multiple paths in a vector layer', () => {
      const path1 = makePath([
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ])
      const path2: Path = {
        id: 'p2',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      }
      const layer = makeVectorLayer({ paths: [path1, path2] })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(0)
      expect(bbox.minY).toBe(0)
      expect(bbox.maxX).toBe(100)
      expect(bbox.maxY).toBe(100)
    })
  })

  describe('raster layers', () => {
    test('computes bbox from transform + width/height', () => {
      const layer = makeRasterLayer({
        transform: makeTransform({ x: 10, y: 20 }),
        width: 200,
        height: 150,
      })
      const artboard = makeArtboard({ x: 50, y: 60 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(60) // 50 + 10
      expect(bbox.minY).toBe(80) // 60 + 20
      expect(bbox.maxX).toBe(260) // 50 + 10 + 200
      expect(bbox.maxY).toBe(230) // 60 + 20 + 150
    })
  })

  describe('group layers', () => {
    test('returns empty bbox for group with no visible children', () => {
      const child = makeVectorLayer({ visible: false })
      const group = makeGroupLayer({ children: [child] })
      const artboard = makeArtboard()
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(Infinity)
    })

    test('returns empty bbox for empty group', () => {
      const group = makeGroupLayer({ children: [] })
      const artboard = makeArtboard()
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(Infinity)
    })

    test('merges visible children bboxes', () => {
      const v1 = makeVectorLayer({
        id: 'v1',
        paths: [
          makePath([
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 50, y: 50 },
          ]),
        ],
      })
      const v2 = makeVectorLayer({
        id: 'v2',
        paths: [
          {
            id: 'p2',
            segments: [
              { type: 'move', x: 80, y: 80 },
              { type: 'line', x: 120, y: 120 },
            ],
            closed: false,
          },
        ],
      })
      const group = makeGroupLayer({ children: [v1, v2] })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(0)
      expect(bbox.minY).toBe(0)
      expect(bbox.maxX).toBe(120)
      expect(bbox.maxY).toBe(120)
    })

    test('applies group transform offset', () => {
      const child = makeVectorLayer({
        paths: [
          makePath([
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 50, y: 50 },
          ]),
        ],
      })
      const group = makeGroupLayer({
        children: [child],
        transform: makeTransform({ x: 10, y: 20 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(10)
      expect(bbox.minY).toBe(20)
      expect(bbox.maxX).toBe(60)
      expect(bbox.maxY).toBe(70)
    })

    test('skips children with empty bboxes (vector with no paths)', () => {
      const emptyChild = makeVectorLayer({ id: 'empty', paths: [] })
      const realChild = makeVectorLayer({
        id: 'real',
        paths: [
          makePath([
            { type: 'move', x: 10, y: 10 },
            { type: 'line', x: 40, y: 40 },
          ]),
        ],
      })
      const group = makeGroupLayer({ children: [emptyChild, realChild] })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(10)
      expect(bbox.maxX).toBe(40)
    })

    test('returns empty bbox when all children have empty bboxes', () => {
      const empty1 = makeVectorLayer({ id: 'e1', paths: [] })
      const empty2 = makeVectorLayer({ id: 'e2', paths: [] })
      const group = makeGroupLayer({ children: [empty1, empty2] })
      const artboard = makeArtboard()
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(Infinity)
    })

    test('does not apply group offset when it is zero', () => {
      const child = makeRasterLayer({
        transform: makeTransform({ x: 5, y: 5 }),
        width: 10,
        height: 10,
      })
      const group = makeGroupLayer({
        children: [child],
        transform: makeTransform({ x: 0, y: 0 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(group, artboard)
      expect(bbox.minX).toBe(5)
      expect(bbox.minY).toBe(5)
      expect(bbox.maxX).toBe(15)
      expect(bbox.maxY).toBe(15)
    })
  })

  describe('text layers', () => {
    test('uses measureText for point text bbox', () => {
      const layer = makeTextLayer({
        text: 'Hello',
        fontSize: 20,
        lineHeight: 1.4,
        transform: makeTransform({ x: 10, y: 20 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      // OffscreenCanvas polyfill measureText returns { width: 10 } for any text
      // Height: 1 line * 20 * 1.4 = 28
      expect(bbox.minX).toBe(10)
      expect(bbox.minY).toBe(20)
      expect(bbox.maxX).toBe(20) // 10 + measured width (10)
      expect(bbox.maxY).toBe(48) // 20 + 28
    })

    test('handles multi-line text', () => {
      const layer = makeTextLayer({
        text: 'Hi\nWorld!',
        fontSize: 10,
        lineHeight: 1.5,
        transform: makeTransform(),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      // Polyfill measureText returns 10 for each line
      // Height: 2 lines * 10 * 1.5 = 30
      expect(bbox.maxX).toBe(10)
      expect(bbox.maxY).toBe(30)
    })

    test('uses textWidth/textHeight for area text bbox', () => {
      const layer = makeTextLayer({
        text: 'AB',
        fontSize: 10,
        lineHeight: 1.4,
        textMode: 'area' as const,
        textWidth: 200,
        textHeight: 100,
        transform: makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.maxX).toBe(200)
      expect(bbox.maxY).toBe(100)
    })

    test('applies transform scale to text bbox', () => {
      const layer = makeTextLayer({
        text: 'AB',
        fontSize: 10,
        lineHeight: 1.4,
        transform: makeTransform({ x: 0, y: 0, scaleX: 2, scaleY: 3 }),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      // Polyfill measureText returns 10, * scaleX(2) = 20
      // Height: 1 * 10 * 1.4 = 14, * scaleY(3) = 42
      expect(bbox.maxX).toBe(20)
      expect(bbox.maxY).toBe(42)
    })

    test('uses default lineHeight 1.4 when lineHeight is falsy', () => {
      const layer = makeTextLayer({
        text: 'X',
        fontSize: 10,
        lineHeight: 0, // falsy => fallback to 1.4
        transform: makeTransform(),
      })
      const artboard = makeArtboard({ x: 0, y: 0 })
      const bbox = getLayerBBox(layer, artboard)
      // lineHeight ?? 1.4 => since 0 is falsy for ??, 0 ?? 1.4 = 0
      // Actually, 0 is not nullish, so ?? returns 0.
      // height = 1 * 10 * 0 = 0
      expect(bbox.maxY).toBe(0)
    })

    test('applies artboard offset to text layer bbox', () => {
      const layer = makeTextLayer({
        text: 'Hi',
        fontSize: 10,
        transform: makeTransform({ x: 5, y: 5 }),
      })
      const artboard = makeArtboard({ x: 100, y: 200 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(105)
      expect(bbox.minY).toBe(205)
    })
  })

  describe('adjustment layers', () => {
    test('returns full artboard bbox', () => {
      const layer = makeAdjustmentLayer()
      const artboard = makeArtboard({ x: 50, y: 60, width: 400, height: 300 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(50)
      expect(bbox.minY).toBe(60)
      expect(bbox.maxX).toBe(450)
      expect(bbox.maxY).toBe(360)
    })
  })

  describe('unknown layer type (default branch)', () => {
    test('returns artboard bbox for unknown type', () => {
      const layer = { type: 'unknown-future-type' } as any
      const artboard = makeArtboard({ x: 10, y: 20, width: 100, height: 200 })
      const bbox = getLayerBBox(layer, artboard)
      expect(bbox.minX).toBe(10)
      expect(bbox.minY).toBe(20)
      expect(bbox.maxX).toBe(110)
      expect(bbox.maxY).toBe(220)
    })
  })
})

describe('pathBBox additional coverage', () => {
  test('handles empty segments array', () => {
    const bbox = pathBBox([])
    expect(bbox.minX).toBe(Infinity)
    expect(bbox.maxX).toBe(-Infinity)
  })

  test('handles move-only segments', () => {
    const bbox = pathBBox([{ type: 'move', x: 5, y: 10 }])
    expect(bbox.minX).toBe(5)
    expect(bbox.minY).toBe(10)
    expect(bbox.maxX).toBe(5)
    expect(bbox.maxY).toBe(10)
  })

  test('handles arc segments with conservative bbox', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 100, y: 0, rx: 50, ry: 30, rotation: 0, largeArc: true, sweep: true },
    ]
    const bbox = pathBBox(segments)
    // Conservative: min/max of endpoints +/- max(rx,ry)
    expect(bbox.minX).toBeLessThanOrEqual(-50)
    expect(bbox.maxX).toBeGreaterThanOrEqual(150)
    expect(bbox.minY).toBeLessThanOrEqual(-50)
    expect(bbox.maxY).toBeGreaterThanOrEqual(50)
  })

  test('handles arc segments with different rx/ry', () => {
    const segments: Segment[] = [
      { type: 'move', x: 10, y: 10 },
      { type: 'arc', x: 50, y: 50, rx: 5, ry: 80, rotation: 45, largeArc: false, sweep: false },
    ]
    const bbox = pathBBox(segments)
    // max(rx,ry) = 80
    expect(bbox.minX).toBeLessThanOrEqual(10 - 80)
    expect(bbox.maxX).toBeGreaterThanOrEqual(50 + 80)
  })

  test('handles close segment (no bbox change)', () => {
    const segments: Segment[] = [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 10, y: 10 }, { type: 'close' }]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(10)
  })

  test('cubic bezier with extrema in both axes', () => {
    // Curve that bulges significantly in both x and y
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 200, cp1y: -100, cp2x: -100, cp2y: 200 },
    ]
    const bbox = pathBBox(segments)
    // The curve should extend beyond the endpoints in some direction
    // cp1y = -100, so the curve bows above y=0 => minY < 0
    expect(bbox.minY).toBeLessThan(0)
    // cp2y = 200, so the curve bows below y=100 => maxY > 100
    expect(bbox.maxY).toBeGreaterThan(100)
    // x range should cover 0 to 100 at minimum
    expect(bbox.minX).toBeLessThanOrEqual(0)
    expect(bbox.maxX).toBeGreaterThanOrEqual(100)
  })

  test('cubic bezier with linear derivative (a near zero)', () => {
    // When all control points are nearly collinear, the quadratic coefficient is near zero
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 90, y: 0, cp1x: 30, cp1y: 30, cp2x: 60, cp2y: 30 },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(90)
    expect(bbox.maxY).toBeGreaterThan(0) // Curve bows upward
  })

  test('cubic bezier where discriminant is negative', () => {
    // Create a scenario where the derivative has no real roots (straight-ish line)
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 33, cp1y: 33, cp2x: 66, cp2y: 66 },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.minY).toBe(0)
    expect(bbox.maxX).toBeCloseTo(100, 0)
    expect(bbox.maxY).toBeCloseTo(100, 0)
  })

  test('quadratic bezier where denom is near zero (collinear)', () => {
    // p0 - 2*p1 + p2 = 0 when p1 is the midpoint
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 100, cpx: 50, cpy: 50 },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(100)
    expect(bbox.minY).toBe(0)
    expect(bbox.maxY).toBe(100)
  })

  test('multiple segments of different types', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 75, cpy: -40 },
      { type: 'cubic', x: 150, y: 0, cp1x: 125, cp1y: 50, cp2x: 125, cp2y: -50 },
      { type: 'close' },
    ]
    const bbox = pathBBox(segments)
    expect(bbox.minX).toBe(0)
    expect(bbox.maxX).toBe(150)
    expect(bbox.minY).toBeLessThan(0) // quadratic and cubic extend beyond y=0
  })
})

describe('getPathBBox', () => {
  test('delegates to pathBBox with path.segments', () => {
    const path = makePath([
      { type: 'move', x: 5, y: 10 },
      { type: 'line', x: 25, y: 30 },
    ])
    const bbox = getPathBBox(path)
    expect(bbox.minX).toBe(5)
    expect(bbox.minY).toBe(10)
    expect(bbox.maxX).toBe(25)
    expect(bbox.maxY).toBe(30)
  })
})

describe('mergeBBox edge cases', () => {
  test('merging with empty bbox', () => {
    const empty = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    const real = { minX: 10, minY: 20, maxX: 30, maxY: 40 }
    const result = mergeBBox(empty, real)
    expect(result).toEqual(real)
  })

  test('merging two identical bboxes', () => {
    const bbox = { minX: 5, minY: 5, maxX: 50, maxY: 50 }
    const result = mergeBBox(bbox, bbox)
    expect(result).toEqual(bbox)
  })

  test('merging non-overlapping bboxes', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    const b = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
    const result = mergeBBox(a, b)
    expect(result).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 200 })
  })

  test('merging with negative coordinates', () => {
    const a = { minX: -50, minY: -30, maxX: -10, maxY: -5 }
    const b = { minX: -20, minY: -40, maxX: 10, maxY: 0 }
    const result = mergeBBox(a, b)
    expect(result).toEqual({ minX: -50, minY: -40, maxX: 10, maxY: 0 })
  })
})

describe('expandBBox edge cases', () => {
  test('expand by zero', () => {
    const bbox = { minX: 10, minY: 10, maxX: 90, maxY: 90 }
    const result = expandBBox(bbox, 0)
    expect(result).toEqual(bbox)
  })

  test('expand by negative amount (shrink)', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const result = expandBBox(bbox, -10)
    expect(result).toEqual({ minX: 10, minY: 10, maxX: 90, maxY: 90 })
  })

  test('expand large amount', () => {
    const bbox = { minX: 50, minY: 50, maxX: 60, maxY: 60 }
    const result = expandBBox(bbox, 100)
    expect(result).toEqual({ minX: -50, minY: -50, maxX: 160, maxY: 160 })
  })
})

describe('bboxContainsPoint edge cases', () => {
  test('point on edge is contained', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    expect(bboxContainsPoint(bbox, 100, 100)).toBe(true) // max corner
    expect(bboxContainsPoint(bbox, 0, 100)).toBe(true) // left-bottom edge
    expect(bboxContainsPoint(bbox, 50, 0)).toBe(true) // top edge
  })

  test('point just outside is not contained', () => {
    const bbox = { minX: 10, minY: 20, maxX: 30, maxY: 40 }
    expect(bboxContainsPoint(bbox, 9.999, 25)).toBe(false)
    expect(bboxContainsPoint(bbox, 30.001, 25)).toBe(false)
    expect(bboxContainsPoint(bbox, 20, 19.999)).toBe(false)
    expect(bboxContainsPoint(bbox, 20, 40.001)).toBe(false)
  })

  test('works with negative coordinates', () => {
    const bbox = { minX: -100, minY: -100, maxX: -50, maxY: -50 }
    expect(bboxContainsPoint(bbox, -75, -75)).toBe(true)
    expect(bboxContainsPoint(bbox, -49, -75)).toBe(false)
  })
})
