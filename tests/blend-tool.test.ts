import { describe, it, expect } from 'bun:test'
import {
  interpolateColor,
  interpolateTransform,
  interpolatePaths,
  generateBlend,
  createBlendGroup,
  subdivideSegments,
  type BlendConfig,
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

function makeTrianglePath(): Path {
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: 50, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ],
  }
}

// ── Tests ──

describe('interpolateColor', () => {
  it('interpolates black to white at t=0.5 → gray', () => {
    const result = interpolateColor('#000000', '#ffffff', 0.5)
    expect(result).toBe('#808080')
  })

  it('returns first color at t=0', () => {
    const result = interpolateColor('#ff0000', '#0000ff', 0)
    expect(result).toBe('#ff0000')
  })

  it('returns second color at t=1', () => {
    const result = interpolateColor('#ff0000', '#0000ff', 1)
    expect(result).toBe('#0000ff')
  })

  it('interpolates red to blue at t=0.5', () => {
    const result = interpolateColor('#ff0000', '#0000ff', 0.5)
    expect(result).toBe('#800080')
  })

  it('handles 3-digit hex', () => {
    const result = interpolateColor('#f00', '#00f', 0.5)
    expect(result).toBe('#800080')
  })
})

describe('interpolateTransform', () => {
  it('interpolates position', () => {
    const t1: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    const t2: Transform = { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 }
    const result = interpolateTransform(t1, t2, 0.5)
    expect(result.x).toBe(50)
    expect(result.y).toBe(100)
  })

  it('interpolates scale', () => {
    const t1: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    const t2: Transform = { x: 0, y: 0, scaleX: 2, scaleY: 3, rotation: 0 }
    const result = interpolateTransform(t1, t2, 0.5)
    expect(result.scaleX).toBe(1.5)
    expect(result.scaleY).toBe(2)
  })

  it('interpolates rotation', () => {
    const t1: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    const t2: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 }
    const result = interpolateTransform(t1, t2, 0.5)
    expect(result.rotation).toBe(45)
  })

  it('returns first transform at t=0', () => {
    const t1: Transform = { x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 45 }
    const t2: Transform = { x: 100, y: 200, scaleX: 4, scaleY: 5, rotation: 180 }
    const result = interpolateTransform(t1, t2, 0)
    expect(result.x).toBe(10)
    expect(result.y).toBe(20)
    expect(result.scaleX).toBe(2)
    expect(result.scaleY).toBe(3)
    expect(result.rotation).toBe(45)
  })

  it('interpolates skew', () => {
    const t1: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 10, skewY: 0 }
    const t2: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 30, skewY: 20 }
    const result = interpolateTransform(t1, t2, 0.5)
    expect(result.skewX).toBe(20)
    expect(result.skewY).toBe(10)
  })
})

describe('interpolatePaths – matching segment counts', () => {
  it('interpolates two squares of different sizes at t=0.5', () => {
    const p1 = makeSquarePath(100)
    const p2 = makeSquarePath(200)

    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result).toHaveLength(1)

    const segs = result[0]!.segments
    // First segment should be a move to the midpoint
    expect(segs[0]!.type).toBe('move')
    const move = segs[0] as { type: 'move'; x: number; y: number }
    expect(move.x).toBe(0) // both start at 0
    expect(move.y).toBe(0)

    // Second segment should be interpolated line endpoint
    expect(segs[1]!.type).toBe('line')
    const line1 = segs[1] as { type: 'line'; x: number; y: number }
    expect(line1.x).toBe(150) // midpoint of 100 and 200
    expect(line1.y).toBe(0)
  })

  it('preserves closed flag', () => {
    const p1 = makeSquarePath(50)
    const p2 = makeSquarePath(150)
    const result = interpolatePaths([p1], [p2], 0.5)
    expect(result[0]!.closed).toBe(true)
  })
})

describe('interpolatePaths – mismatched segment counts (subdivision)', () => {
  it('subdivides the shorter path to match the longer', () => {
    const square = makeSquarePath(100) // 4 drawable segments + close = 5
    const triangle = makeTrianglePath() // 3 drawable segments + close = 4

    const result = interpolatePaths([square], [triangle], 0.5)
    expect(result).toHaveLength(1)

    // Result should have segments — the key test is it doesn't crash and produces output
    expect(result[0]!.segments.length).toBeGreaterThanOrEqual(4)
  })

  it('handles different path list lengths', () => {
    const p1 = makeSquarePath(100)
    const p2a = makeSquarePath(200)
    const p2b = makeTrianglePath()

    // paths1 has 1 path, paths2 has 2 paths
    const result = interpolatePaths([p1], [p2a, p2b], 0.5)
    expect(result).toHaveLength(2)
  })
})

describe('subdivideSegments', () => {
  it('adds segments to reach target count', () => {
    const segs: Segment[] = [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }]
    // 2 drawable segments, target 4
    const result = subdivideSegments(segs, 4)
    const drawables = result.filter((s) => s.type !== 'close')
    expect(drawables.length).toBe(4)
  })

  it('preserves close segment', () => {
    const segs: Segment[] = [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }]
    const result = subdivideSegments(segs, 4)
    expect(result[result.length - 1]!.type).toBe('close')
  })

  it('does not modify when already at target', () => {
    const segs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'close' },
    ]
    const result = subdivideSegments(segs, 3)
    const drawables = result.filter((s) => s.type !== 'close')
    expect(drawables.length).toBe(3)
  })
})

describe('generateBlend', () => {
  it('produces correct number of intermediate layers', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(50)] })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(150)] })
    const config: BlendConfig = { steps: 3, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result).toHaveLength(3)
  })

  it('produces correct number for 1 step', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(50)] })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(150)] })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result).toHaveLength(1)
  })

  it('produces correct number for 10 steps', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(50)] })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(150)] })
    const config: BlendConfig = { steps: 10, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result).toHaveLength(10)
  })

  it('all intermediates are vector layers', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(50)] })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(150)] })
    const config: BlendConfig = { steps: 5, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    for (const layer of result) {
      expect(layer.type).toBe('vector')
    }
  })
})

describe('fill color interpolation across blend', () => {
  it('interpolates solid fill colors', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#000000', opacity: 1 },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#ffffff', opacity: 1 },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result).toHaveLength(1)
    expect(result[0]!.fill).not.toBeNull()
    expect(result[0]!.fill!.color).toBe('#808080')
  })

  it('interpolates fill opacity', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#000000', opacity: 0 },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#000000', opacity: 1 },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result[0]!.fill!.opacity).toBe(0.5)
  })

  it('handles null fill on one side', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: null,
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    // When one fill is null and other is not, the non-null fill is used
    expect(result[0]!.fill).not.toBeNull()
  })
})

describe('opacity interpolation', () => {
  it('interpolates layer opacity', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      opacity: 0.2,
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      opacity: 0.8,
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    // t = 0.5, so opacity = 0.2 + (0.8 - 0.2) * 0.5 = 0.5
    expect(result[0]!.opacity).toBe(0.5)
  })

  it('interpolates gradually across multiple steps', () => {
    const layer1 = makeVectorLayer({ paths: [makeSquarePath(100)], opacity: 0 })
    const layer2 = makeVectorLayer({ paths: [makeSquarePath(100)], opacity: 1 })
    const config: BlendConfig = { steps: 3, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    // t values: 0.25, 0.5, 0.75
    expect(result[0]!.opacity).toBeCloseTo(0.25, 5)
    expect(result[1]!.opacity).toBeCloseTo(0.5, 5)
    expect(result[2]!.opacity).toBeCloseTo(0.75, 5)
  })
})

describe('stroke width interpolation', () => {
  it('interpolates stroke width', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: {
        width: 10,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result[0]!.stroke).not.toBeNull()
    expect(result[0]!.stroke!.width).toBe(6) // midpoint of 2 and 10
  })

  it('interpolates stroke color', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: {
        width: 2,
        color: '#ffffff',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result[0]!.stroke!.color).toBe('#808080')
  })

  it('handles null stroke on one side', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: null,
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      stroke: {
        width: 4,
        color: '#ff0000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      },
    })
    const config: BlendConfig = { steps: 1, spacing: 'even' }
    const result = generateBlend(layer1, layer2, config)
    expect(result[0]!.stroke).not.toBeNull()
  })
})

describe('createBlendGroup', () => {
  it('wraps endpoints and intermediates in a group', () => {
    const layer1 = makeVectorLayer({ name: 'Start' })
    const layer2 = makeVectorLayer({ name: 'End' })
    const mid = makeVectorLayer({ name: 'Mid' })
    const group = createBlendGroup(layer1, layer2, [mid], 'artboard-1')
    expect(group.type).toBe('group')
    expect(group.children).toHaveLength(3)
    expect(group.children[0]!.id).toBe(layer1.id)
    expect(group.children[1]!.id).toBe(mid.id)
    expect(group.children[2]!.id).toBe(layer2.id)
    expect(group.name).toBe('Blend Group')
  })

  it('works with zero intermediates', () => {
    const layer1 = makeVectorLayer({ name: 'A' })
    const layer2 = makeVectorLayer({ name: 'B' })
    const group = createBlendGroup(layer1, layer2, [], 'artboard-1')
    expect(group.children).toHaveLength(2)
  })

  it('works with many intermediates', () => {
    const layer1 = makeVectorLayer()
    const layer2 = makeVectorLayer()
    const intermediates = Array.from({ length: 10 }, () => makeVectorLayer())
    const group = createBlendGroup(layer1, layer2, intermediates, 'artboard-1')
    expect(group.children).toHaveLength(12) // 10 + 2 endpoints
  })
})
