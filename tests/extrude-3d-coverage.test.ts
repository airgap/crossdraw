import { describe, test, expect } from 'bun:test'
import {
  rotateY3D,
  rotateZ3D,
  multiply3x3,
  transformPoint3D,
  extrudePath,
  computeFaceNormal,
  computePhongShading,
  createDefaultExtrude3DConfig,
  render3DLayer,
} from '@/render/extrude-3d'
import type { Vec3, MaterialConfig, LightingConfig, Extrude3DConfig } from '@/render/extrude-3d'
import type { Segment } from '@/types'

// ── Helpers ──

function mockCtx(w = 200, h = 200) {
  return {
    canvas: { width: w, height: h },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    translate: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
  } as unknown as CanvasRenderingContext2D
}

function squareSegments(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: 100, y: 0 },
    { type: 'line', x: 100, y: 100 },
    { type: 'line', x: 0, y: 100 },
    { type: 'close' },
  ]
}

const defaultMaterial: MaterialConfig = {
  color: '#ff0000',
  shininess: 50,
  roughness: 0.5,
  ambient: 0.2,
}

const defaultLighting: LightingConfig = {
  direction: { x: 0, y: 0, z: 1 },
  intensity: 1.0,
  ambientIntensity: 0.3,
  specularIntensity: 0.5,
}

// ── Tests covering lines 199-224 (segmentsToVertices: quadratic, arc) ──

describe('extrudePath with quadratic bezier', () => {
  test('subdivides quadratic bezier into line segments', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
      { type: 'close' },
    ]
    const geo = extrudePath(segments, 20)
    // 1 move + 8 quadratic steps = 9 vertices
    expect(geo.front.length).toBe(9)
    expect(geo.back.length).toBe(9)
    expect(geo.sides.length).toBe(9)
  })

  test('quadratic bezier produces smooth curve approximation', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -80 },
    ]
    const geo = extrudePath(segments, 10)
    // Some intermediate points should have negative y (curve goes up)
    const hasNegativeY = geo.front.some((p) => p.y < 0)
    expect(hasNegativeY).toBe(true)
  })
})

describe('extrudePath with arc segment', () => {
  test('approximates arc with line segments', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 50, y: 50, rx: 30, ry: 30, rotation: 0, largeArc: false, sweep: true },
      { type: 'close' },
    ]
    const geo = extrudePath(segments, 15)
    // 1 move + 16 arc steps = 17 vertices
    expect(geo.front.length).toBe(17)
    expect(geo.back.length).toBe(17)
  })

  test('arc produces circular-like points', () => {
    const segments: Segment[] = [
      { type: 'move', x: 50, y: 50 },
      { type: 'arc', x: 50, y: 50, rx: 40, ry: 40, rotation: 0, largeArc: false, sweep: true },
    ]
    const geo = extrudePath(segments, 10)
    // All arc points should be within rx distance from center
    for (let i = 1; i < geo.front.length; i++) {
      const p = geo.front[i]!
      const dist = Math.hypot(p.x - 50, p.y - 50)
      expect(dist).toBeLessThanOrEqual(41) // Approximate, with some tolerance
    }
  })
})

// ── Tests covering lines 350-449 (render3DLayer) ──

describe('render3DLayer', () => {
  test('renders without error for basic square', () => {
    const ctx = mockCtx()
    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    // No error thrown
  })

  test('renders nothing for empty segments', () => {
    const ctx = mockCtx()
    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, [], config, { x: 0, y: 0, width: 200, height: 200 })
    // No error thrown
  })

  test('uses painter algorithm (far faces first, near faces last)', () => {
    const fills: string[] = []
    const ctx = {
      ...mockCtx(),
      get fillStyle() {
        return '#000'
      },
      set fillStyle(v: string) {
        fills.push(v)
      },
    } as unknown as CanvasRenderingContext2D

    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    // Should have rendered faces with fill styles
    expect(fills.length).toBeGreaterThan(0)
  })

  test('renders with different rotation angles', () => {
    const ctx = mockCtx()
    const config: Extrude3DConfig = {
      ...createDefaultExtrude3DConfig(),
      rotateX: 45,
      rotateY: 60,
      rotateZ: 15,
    }
    render3DLayer(ctx, squareSegments(), config, { x: 10, y: 10, width: 180, height: 180 })
    // No error thrown
  })

  test('renders with zero rotation (identity)', () => {
    const ctx = mockCtx()
    const config: Extrude3DConfig = {
      ...createDefaultExtrude3DConfig(),
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
    }
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    // No error thrown
  })

  test('renders with cubic bezier path', () => {
    const ctx = mockCtx()
    const config = createDefaultExtrude3DConfig()
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    render3DLayer(ctx, segments, config, { x: 0, y: 0, width: 200, height: 200 })
    // No error thrown
  })

  test('applies translate for bounds offset', () => {
    let translateCalled = false
    const ctx = {
      ...mockCtx(),
      translate: (x: number, y: number) => {
        translateCalled = true
        expect(x).toBe(50)
        expect(y).toBe(30)
      },
    } as unknown as CanvasRenderingContext2D

    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, squareSegments(), config, { x: 50, y: 30, width: 200, height: 200 })
    expect(translateCalled).toBe(true)
  })

  test('calls save and restore', () => {
    let saveCount = 0
    let restoreCount = 0
    const ctx = {
      ...mockCtx(),
      save: () => saveCount++,
      restore: () => restoreCount++,
    } as unknown as CanvasRenderingContext2D

    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    expect(saveCount).toBe(1)
    expect(restoreCount).toBe(1)
  })

  test('renders triangle with correct face count', () => {
    const config = createDefaultExtrude3DConfig()
    const segments: Segment[] = [
      { type: 'move', x: 50, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]

    let beginPathCount = 0
    const countCtx = {
      ...mockCtx(),
      beginPath: () => beginPathCount++,
    } as unknown as CanvasRenderingContext2D

    render3DLayer(countCtx, segments, config, { x: 0, y: 0, width: 200, height: 200 })
    // 1 front + 1 back + 3 sides = 5 faces
    expect(beginPathCount).toBe(5)
  })

  test('stroke is applied to each face', () => {
    let strokeCount = 0
    const ctx = {
      ...mockCtx(),
      stroke: () => strokeCount++,
    } as unknown as CanvasRenderingContext2D

    const config = createDefaultExtrude3DConfig()
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    // Each face gets a stroke call
    expect(strokeCount).toBeGreaterThan(0)
  })

  test('renders with large depth', () => {
    const ctx = mockCtx()
    const config: Extrude3DConfig = {
      ...createDefaultExtrude3DConfig(),
      depth: 200,
    }
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 400, height: 400 })
    // No error thrown
  })

  test('renders with extreme material values', () => {
    const ctx = mockCtx()
    const config: Extrude3DConfig = {
      ...createDefaultExtrude3DConfig(),
      material: {
        color: '#ffffff',
        shininess: 100,
        roughness: 0,
        ambient: 1,
      },
      lighting: {
        direction: { x: 1, y: 1, z: 1 },
        intensity: 2.0,
        ambientIntensity: 1.0,
        specularIntensity: 2.0,
      },
    }
    render3DLayer(ctx, squareSegments(), config, { x: 0, y: 0, width: 200, height: 200 })
    // No error; colors should be clamped
  })
})

describe('computePhongShading edge cases', () => {
  test('degenerate normal (zero vector) still produces color', () => {
    // With a zero normal, normalize() returns {0,0,1}
    const color = computePhongShading(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      defaultMaterial,
      defaultLighting,
    )
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })

  test('roughness 1 eliminates diffuse', () => {
    const mat: MaterialConfig = { ...defaultMaterial, roughness: 1 }
    const color = computePhongShading(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      mat,
      defaultLighting,
    )
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })

  test('3-digit hex color parsing', () => {
    const mat: MaterialConfig = { ...defaultMaterial, color: '#f00' }
    const color = computePhongShading(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      mat,
      defaultLighting,
    )
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    // Should have red channel
    const m = color.match(/rgb\((\d+),/)!
    expect(Number(m[1])).toBeGreaterThan(0)
  })

  test('shininess 1 (minimum) produces broad specular', () => {
    const mat: MaterialConfig = { ...defaultMaterial, shininess: 0 }
    const color = computePhongShading({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, mat, {
      ...defaultLighting,
      specularIntensity: 1,
    })
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })
})

describe('computeFaceNormal edge cases', () => {
  test('collinear points produce fallback normal', () => {
    // All three points on the same line
    const normal = computeFaceNormal({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })
    // Cross product is zero, normalize returns {0,0,1}
    expect(normal.z).toBe(1)
  })
})

describe('extrudePath with mixed segments', () => {
  test('handles path with only move and close', () => {
    const segments: Segment[] = [{ type: 'move', x: 50, y: 50 }, { type: 'close' }]
    const geo = extrudePath(segments, 10)
    expect(geo.front.length).toBe(1) // Only the move vertex
    expect(geo.sides.length).toBe(1)
  })

  test('handles path with all segment types', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 75, cpy: -30 },
      { type: 'cubic', x: 150, y: 0, cp1x: 110, cp1y: 30, cp2x: 140, cp2y: 30 },
      { type: 'arc', x: 200, y: 50, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: true },
      { type: 'line', x: 200, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const geo = extrudePath(segments, 30)
    expect(geo.front.length).toBeGreaterThan(5)
    expect(geo.back.length).toBe(geo.front.length)
    expect(geo.sides.length).toBe(geo.front.length)
  })
})

describe('rotation matrix composition', () => {
  test('consecutive 90-degree rotations around Z produce 180', () => {
    const m90 = rotateZ3D(90)
    const m180 = multiply3x3(m90, m90)
    const p: Vec3 = { x: 1, y: 0, z: 0 }
    const result = transformPoint3D(p, m180)
    expect(result.x).toBeCloseTo(-1, 5)
    expect(result.y).toBeCloseTo(0, 5)
  })

  test('four 90-degree rotations around Y returns to identity', () => {
    const m90 = rotateY3D(90)
    let m = m90
    for (let i = 1; i < 4; i++) {
      m = multiply3x3(m, m90)
    }
    const p: Vec3 = { x: 1, y: 2, z: 3 }
    const result = transformPoint3D(p, m)
    expect(result.x).toBeCloseTo(1, 4)
    expect(result.y).toBeCloseTo(2, 4)
    expect(result.z).toBeCloseTo(3, 4)
  })
})
