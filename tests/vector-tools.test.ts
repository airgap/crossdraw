import { describe, it, expect, beforeEach } from 'bun:test'
import { generateBlend, smoothEase, getBlendSettings, setBlendSettings } from '@/tools/blend-tool'
import {
  applyVectorBrush,
  samplePath,
  getVectorBrushSettings,
  setVectorBrushSettings,
  makeCircleShape,
  makeSquareShape,
  makeTriangleShape,
  makeArrowShape,
  type VectorBrushSettings,
} from '@/tools/vector-brushes'
import type { VectorLayer, Path } from '@/types'
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

function makeLinePath(x1: number, y1: number, x2: number, y2: number): Path {
  return {
    id: uuid(),
    closed: false,
    segments: [
      { type: 'move', x: x1, y: y1 },
      { type: 'line', x: x2, y: y2 },
    ],
  }
}

function makeCubicPath(): Path {
  return {
    id: uuid(),
    closed: false,
    segments: [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 25, cp1y: -50, cp2x: 75, cp2y: -50 },
    ],
  }
}

function makeQuadraticPath(): Path {
  return {
    id: uuid(),
    closed: false,
    segments: [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
    ],
  }
}

function makeArcPath(): Path {
  return {
    id: uuid(),
    closed: false,
    segments: [
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 100, y: 0, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
    ],
  }
}

// =============================================
// BLEND TOOL TESTS
// =============================================

describe('Blend Tool - smoothEase', () => {
  it('returns 0 at t=0', () => {
    expect(smoothEase(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(smoothEase(1)).toBe(1)
  })

  it('returns 0.5 at t=0.5', () => {
    expect(smoothEase(0.5)).toBe(0.5)
  })

  it('is less than linear at t=0.25', () => {
    // Smooth ease starts slower
    expect(smoothEase(0.25)).toBeLessThan(0.25)
  })

  it('is greater than linear at t=0.75', () => {
    // Smooth ease ends slower (appears to be ahead in middle)
    expect(smoothEase(0.75)).toBeGreaterThan(0.75)
  })

  it('is monotonically increasing', () => {
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const t = i / 100
      const val = smoothEase(t)
      expect(val).toBeGreaterThanOrEqual(prev)
      prev = val
    }
  })
})

describe('Blend Tool - getBlendSettings / setBlendSettings', () => {
  beforeEach(() => {
    setBlendSettings({ steps: 5, method: 'linear' })
  })

  it('returns default settings', () => {
    const settings = getBlendSettings()
    expect(settings.steps).toBe(5)
    expect(settings.method).toBe('linear')
  })

  it('updates steps', () => {
    setBlendSettings({ steps: 10 })
    expect(getBlendSettings().steps).toBe(10)
  })

  it('updates method', () => {
    setBlendSettings({ method: 'smooth' })
    expect(getBlendSettings().method).toBe('smooth')
  })

  it('clamps steps to minimum of 1', () => {
    setBlendSettings({ steps: 0 })
    expect(getBlendSettings().steps).toBe(1)
    setBlendSettings({ steps: -5 })
    expect(getBlendSettings().steps).toBe(1)
  })

  it('rounds fractional steps', () => {
    setBlendSettings({ steps: 3.7 })
    expect(getBlendSettings().steps).toBe(4)
  })

  it('returns a copy (not the same object)', () => {
    const s1 = getBlendSettings()
    const s2 = getBlendSettings()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })
})

describe('Blend Tool - generateBlend with smooth method', () => {
  it('produces intermediate layers with smooth easing', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(50)],
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(150)],
      transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    })

    const linearResult = generateBlend(layer1, layer2, { steps: 3, spacing: 'even', method: 'linear' })
    const smoothResult = generateBlend(layer1, layer2, { steps: 3, spacing: 'even', method: 'smooth' })

    expect(linearResult).toHaveLength(3)
    expect(smoothResult).toHaveLength(3)

    // With smooth easing, transforms should differ from linear
    // The first step (t ~= 0.25) should be closer to layer1 with smooth than linear
    const linearX1 = linearResult[0]!.transform.x
    const smoothX1 = smoothResult[0]!.transform.x

    // Smooth easing at t=0.25 produces a smaller t value, so position should be closer to start
    expect(smoothX1).toBeLessThan(linearX1)
  })

  it('smooth method with 1 step produces midpoint (eased)', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      opacity: 0,
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(100)],
      opacity: 1,
    })
    const result = generateBlend(layer1, layer2, { steps: 1, spacing: 'even', method: 'smooth' })
    expect(result).toHaveLength(1)
    // At t=0.5, smoothEase(0.5) = 0.5, so this is same as linear
    expect(result[0]!.opacity).toBeCloseTo(0.5, 5)
  })
})

describe('Blend Tool - method defaults to linear', () => {
  it('without method field, behaves as linear', () => {
    const layer1 = makeVectorLayer({
      paths: [makeSquarePath(50)],
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    })
    const layer2 = makeVectorLayer({
      paths: [makeSquarePath(150)],
      transform: { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    })

    const noMethod = generateBlend(layer1, layer2, { steps: 3, spacing: 'even' })
    const explicit = generateBlend(layer1, layer2, { steps: 3, spacing: 'even', method: 'linear' })

    // Should produce identical transforms
    for (let i = 0; i < 3; i++) {
      expect(noMethod[i]!.transform.x).toBeCloseTo(explicit[i]!.transform.x, 10)
    }
  })
})

// =============================================
// VECTOR BRUSHES TESTS
// =============================================

describe('Vector Brushes - getVectorBrushSettings / setVectorBrushSettings', () => {
  beforeEach(() => {
    setVectorBrushSettings({
      type: 'pattern',
      patternShape: 'circle',
      patternSpacing: 20,
      scatterAmount: 10,
      scatterRotation: 30,
      scatterScale: 0.3,
      nibAngle: 45,
      nibRoundness: 50,
      nibSize: 10,
      artWidth: 8,
      artVariation: 0.5,
    })
  })

  it('returns default settings', () => {
    const settings = getVectorBrushSettings()
    expect(settings.type).toBe('pattern')
    expect(settings.patternShape).toBe('circle')
    expect(settings.patternSpacing).toBe(20)
  })

  it('updates brush type', () => {
    setVectorBrushSettings({ type: 'scatter' })
    expect(getVectorBrushSettings().type).toBe('scatter')
  })

  it('updates scatter settings', () => {
    setVectorBrushSettings({ scatterAmount: 25, scatterRotation: 60 })
    const s = getVectorBrushSettings()
    expect(s.scatterAmount).toBe(25)
    expect(s.scatterRotation).toBe(60)
  })

  it('updates calligraphic settings', () => {
    setVectorBrushSettings({ nibAngle: 90, nibRoundness: 75, nibSize: 20 })
    const s = getVectorBrushSettings()
    expect(s.nibAngle).toBe(90)
    expect(s.nibRoundness).toBe(75)
    expect(s.nibSize).toBe(20)
  })

  it('updates art brush settings', () => {
    setVectorBrushSettings({ artWidth: 16, artVariation: 0.8 })
    const s = getVectorBrushSettings()
    expect(s.artWidth).toBe(16)
    expect(s.artVariation).toBe(0.8)
  })

  it('returns a copy', () => {
    const s1 = getVectorBrushSettings()
    const s2 = getVectorBrushSettings()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })
})

describe('Vector Brushes - Shape generators', () => {
  it('makeCircleShape creates a closed path with cubic segments', () => {
    const shape = makeCircleShape(10)
    expect(shape.closed).toBe(true)
    expect(shape.segments.length).toBeGreaterThan(3)
    const cubics = shape.segments.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBe(4)
  })

  it('makeSquareShape creates a square with 4 line segments', () => {
    const shape = makeSquareShape(10)
    expect(shape.closed).toBe(true)
    const lines = shape.segments.filter((s) => s.type === 'line')
    expect(lines.length).toBe(3) // move + 3 lines + close
  })

  it('makeTriangleShape creates a triangle with 3 vertices', () => {
    const shape = makeTriangleShape(10)
    expect(shape.closed).toBe(true)
    const drawable = shape.segments.filter((s) => s.type !== 'close')
    expect(drawable.length).toBe(3) // move + 2 lines
  })

  it('makeArrowShape creates a closed arrow', () => {
    const shape = makeArrowShape(10)
    expect(shape.closed).toBe(true)
    const drawable = shape.segments.filter((s) => s.type !== 'close')
    expect(drawable.length).toBeGreaterThan(4)
  })
})

describe('Vector Brushes - samplePath', () => {
  it('samples a straight line path', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const samples = samplePath(path, 25)
    expect(samples.length).toBeGreaterThanOrEqual(4) // 0, 25, 50, 75, potentially 100
    // All points should be on the X axis
    for (const s of samples) {
      expect(s.point.y).toBeCloseTo(0, 5)
    }
  })

  it('returns empty for zero spacing', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const samples = samplePath(path, 0)
    expect(samples).toHaveLength(0)
  })

  it('returns empty for negative spacing', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const samples = samplePath(path, -10)
    expect(samples).toHaveLength(0)
  })

  it('samples a cubic path', () => {
    const path = makeCubicPath()
    const samples = samplePath(path, 10)
    expect(samples.length).toBeGreaterThan(2)
  })

  it('samples a quadratic path', () => {
    const path = makeQuadraticPath()
    const samples = samplePath(path, 10)
    expect(samples.length).toBeGreaterThan(2)
  })

  it('samples an arc path', () => {
    const path = makeArcPath()
    const samples = samplePath(path, 10)
    expect(samples.length).toBeGreaterThan(2)
  })

  it('samples a closed square path', () => {
    const path = makeSquarePath(100)
    const samples = samplePath(path, 25)
    expect(samples.length).toBeGreaterThanOrEqual(12) // ~400 perimeter / 25
  })

  it('first sample is at the start of the path', () => {
    const path = makeLinePath(10, 20, 110, 20)
    const samples = samplePath(path, 25)
    expect(samples.length).toBeGreaterThan(0)
    expect(samples[0]!.point.x).toBeCloseTo(10, 5)
    expect(samples[0]!.point.y).toBeCloseTo(20, 5)
  })

  it('sample distances increase monotonically', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const samples = samplePath(path, 15)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.distance).toBeGreaterThanOrEqual(samples[i - 1]!.distance)
    }
  })

  it('tangent angle is 0 for a horizontal line going right', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const samples = samplePath(path, 25)
    for (const s of samples) {
      expect(s.angle).toBeCloseTo(0, 2)
    }
  })

  it('tangent angle is PI/2 for a vertical line going down', () => {
    const path = makeLinePath(0, 0, 0, 100)
    const samples = samplePath(path, 25)
    // Skip the first sample (at the move point, angle defaults to 0)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.angle).toBeCloseTo(Math.PI / 2, 2)
    }
  })
})

describe('Vector Brushes - applyVectorBrush pattern', () => {
  it('creates vector layers along a straight path', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternShape: 'circle',
      patternSpacing: 40,
    })
    expect(layers.length).toBeGreaterThanOrEqual(4)
    for (const l of layers) {
      expect(l.type).toBe('vector')
      expect(l.paths.length).toBe(1)
      expect(l.fill).not.toBeNull()
    }
  })

  it('pattern with square shape', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternShape: 'square',
      patternSpacing: 30,
    })
    expect(layers.length).toBeGreaterThan(0)
    for (const l of layers) {
      expect(l.type).toBe('vector')
    }
  })

  it('pattern with triangle shape', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternShape: 'triangle',
      patternSpacing: 30,
    })
    expect(layers.length).toBeGreaterThan(0)
  })

  it('pattern with arrow shape', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternShape: 'arrow',
      patternSpacing: 30,
    })
    expect(layers.length).toBeGreaterThan(0)
  })

  it('pattern with custom shape (falls back to circle)', () => {
    const path = makeLinePath(0, 0, 100, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternShape: 'custom',
      patternSpacing: 30,
    })
    expect(layers.length).toBeGreaterThan(0)
  })
})

describe('Vector Brushes - applyVectorBrush scatter', () => {
  it('creates scattered vector layers along a path', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'scatter',
      patternSpacing: 40,
      scatterAmount: 20,
      scatterRotation: 45,
      scatterScale: 0.5,
    })
    expect(layers.length).toBeGreaterThanOrEqual(4)
    for (const l of layers) {
      expect(l.type).toBe('vector')
      expect(l.name).toMatch(/^Scatter/)
    }
  })

  it('scatter produces varied positions (not all on line)', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'scatter',
      patternSpacing: 40,
      scatterAmount: 50, // large scatter amount
      scatterRotation: 0,
      scatterScale: 0,
    })
    // With scatter, some layers should have paths not exactly on y=0
    const yValues = layers.map((l) => {
      const firstSeg = l.paths[0]?.segments[0]
      return firstSeg && 'y' in firstSeg ? firstSeg.y : 0
    })
    const allZero = yValues.every((y) => Math.abs(y) < 0.01)
    expect(allZero).toBe(false) // scatter should offset some points
  })
})

describe('Vector Brushes - applyVectorBrush calligraphic', () => {
  it('creates a single calligraphic stroke layer', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'calligraphic',
      nibAngle: 45,
      nibRoundness: 50,
      nibSize: 10,
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('vector')
    expect(layers[0]!.name).toBe('Calligraphic stroke')
    expect(layers[0]!.paths.length).toBe(1)
    expect(layers[0]!.paths[0]!.closed).toBe(true)
  })

  it('calligraphic stroke has segments (not empty)', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'calligraphic',
      nibSize: 10,
    })
    expect(layers[0]!.paths[0]!.segments.length).toBeGreaterThan(4)
  })

  it('returns empty layer for very short path', () => {
    const path: Path = {
      id: uuid(),
      closed: false,
      segments: [{ type: 'move', x: 0, y: 0 }],
    }
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'calligraphic',
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.paths).toHaveLength(0) // empty because not enough samples
  })

  it('calligraphic with different nib angles produces different outlines', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const settings = getVectorBrushSettings()

    const layers45 = applyVectorBrush(path, {
      ...settings,
      type: 'calligraphic',
      nibAngle: 45,
      nibSize: 20,
    })
    const layers90 = applyVectorBrush(path, {
      ...settings,
      type: 'calligraphic',
      nibAngle: 90,
      nibSize: 20,
    })

    // Different nib angles should produce different segment coordinates
    const segs45 = layers45[0]!.paths[0]!.segments
    const segs90 = layers90[0]!.paths[0]!.segments

    // At least one segment should differ (they won't be identical due to different nib angle)
    let foundDiff = false
    for (let i = 0; i < Math.min(segs45.length, segs90.length); i++) {
      const s45 = segs45[i]!
      const s90 = segs90[i]!
      if ('x' in s45 && 'x' in s90) {
        if (Math.abs(s45.x - s90.x) > 0.01 || Math.abs(s45.y - s90.y) > 0.01) {
          foundDiff = true
          break
        }
      }
    }
    expect(foundDiff).toBe(true)
  })
})

describe('Vector Brushes - applyVectorBrush art', () => {
  it('creates a single art stroke layer', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'art',
      artWidth: 10,
      artVariation: 0.5,
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('vector')
    expect(layers[0]!.name).toBe('Art stroke')
    expect(layers[0]!.paths[0]!.closed).toBe(true)
  })

  it('art brush has tapered width (narrower at endpoints)', () => {
    const path = makeLinePath(0, 0, 200, 0)
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'art',
      artWidth: 20,
      artVariation: 0,
    })
    const segments = layers[0]!.paths[0]!.segments

    // The first segments (near start, tapered) should be near y=0
    // Middle segments should be further from y=0
    const firstSeg = segments[1] // second segment (after move)
    const midIdx = Math.floor(segments.length / 4) // about 1/4 through left edge
    const midSeg = segments[midIdx]

    if (firstSeg && 'y' in firstSeg && midSeg && 'y' in midSeg) {
      // The mid-path segment should have larger Y offset (wider taper)
      expect(Math.abs(midSeg.y)).toBeGreaterThan(Math.abs(firstSeg.y))
    }
  })

  it('returns empty layer for very short path', () => {
    const path: Path = {
      id: uuid(),
      closed: false,
      segments: [{ type: 'move', x: 0, y: 0 }],
    }
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'art',
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.paths).toHaveLength(0)
  })
})

describe('Vector Brushes - applyVectorBrush on curved paths', () => {
  it('pattern brush works on cubic bezier path', () => {
    const path = makeCubicPath()
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'pattern',
      patternSpacing: 20,
    })
    expect(layers.length).toBeGreaterThan(2)
  })

  it('calligraphic brush works on cubic bezier path', () => {
    const path = makeCubicPath()
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'calligraphic',
      nibSize: 10,
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.paths[0]!.segments.length).toBeGreaterThan(4)
  })

  it('art brush works on quadratic bezier path', () => {
    const path = makeQuadraticPath()
    const layers = applyVectorBrush(path, {
      ...getVectorBrushSettings(),
      type: 'art',
      artWidth: 12,
    })
    expect(layers).toHaveLength(1)
    expect(layers[0]!.paths[0]!.segments.length).toBeGreaterThan(4)
  })
})

describe('Vector Brushes - samplePath with closed path', () => {
  it('handles close segment without crashing', () => {
    const path: Path = {
      id: uuid(),
      closed: true,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
        { type: 'line', x: 100, y: 100 },
        { type: 'close' },
      ],
    }
    const samples = samplePath(path, 25)
    expect(samples.length).toBeGreaterThan(2)
  })
})

describe('Vector Brushes - all layer outputs have valid structure', () => {
  const brushTypes: Array<VectorBrushSettings['type']> = ['pattern', 'scatter', 'calligraphic', 'art']
  const path = makeLinePath(0, 0, 200, 0)

  for (const brushType of brushTypes) {
    it(`${brushType} brush layers have required fields`, () => {
      const layers = applyVectorBrush(path, {
        ...getVectorBrushSettings(),
        type: brushType,
        patternSpacing: 40,
        nibSize: 10,
        artWidth: 10,
      })

      for (const layer of layers) {
        expect(layer.id).toBeDefined()
        expect(layer.type).toBe('vector')
        expect(layer.visible).toBe(true)
        expect(layer.locked).toBe(false)
        expect(layer.opacity).toBe(1)
        expect(layer.blendMode).toBe('normal')
        expect(layer.transform).toBeDefined()
        expect(layer.fill).not.toBeNull()
        expect(layer.stroke).toBeNull()
      }
    })
  }
})
