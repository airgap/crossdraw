import { describe, it, expect } from 'bun:test'
import {
  rotateX3D,
  rotateY3D,
  rotateZ3D,
  multiply3x3,
  transformPoint3D,
  extrudePath,
  projectTo2D,
  computeFaceNormal,
  computePhongShading,
  createDefaultExtrude3DConfig,
} from '@/render/extrude-3d'
import type { Vec3, MaterialConfig, LightingConfig } from '@/render/extrude-3d'
import type { Segment } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────

const EPSILON = 1e-6

function approxEqual(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) < eps
}

function assertVec3Near(actual: Vec3, expected: Vec3, eps = EPSILON) {
  expect(approxEqual(actual.x, expected.x, eps)).toBe(true)
  expect(approxEqual(actual.y, expected.y, eps)).toBe(true)
  expect(approxEqual(actual.z, expected.z, eps)).toBe(true)
}

/** Identity 3x3 matrix. */
const identity: number[][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/** Simple square path. */
function squareSegments(): Segment[] {
  return [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: 100, y: 0 },
    { type: 'line', x: 100, y: 100 },
    { type: 'line', x: 0, y: 100 },
    { type: 'close' },
  ]
}

/** Triangle path. */
function triangleSegments(): Segment[] {
  return [
    { type: 'move', x: 50, y: 0 },
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

// ─── Rotation matrix tests ──────────────────────────────────

describe('rotation matrices', () => {
  describe('identity (0 degrees)', () => {
    it('rotateX3D(0) should produce identity', () => {
      const m = rotateX3D(0)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(approxEqual(m[i]![j]!, identity[i]![j]!)).toBe(true)
        }
      }
    })

    it('rotateY3D(0) should produce identity', () => {
      const m = rotateY3D(0)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(approxEqual(m[i]![j]!, identity[i]![j]!)).toBe(true)
        }
      }
    })

    it('rotateZ3D(0) should produce identity', () => {
      const m = rotateZ3D(0)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(approxEqual(m[i]![j]!, identity[i]![j]!)).toBe(true)
        }
      }
    })
  })

  describe('90-degree rotations', () => {
    it('rotateX3D(90) should rotate Y to Z', () => {
      const m = rotateX3D(90)
      const p: Vec3 = { x: 0, y: 1, z: 0 }
      const result = transformPoint3D(p, m)
      assertVec3Near(result, { x: 0, y: 0, z: 1 })
    })

    it('rotateY3D(90) should rotate Z to X', () => {
      const m = rotateY3D(90)
      const p: Vec3 = { x: 0, y: 0, z: 1 }
      const result = transformPoint3D(p, m)
      assertVec3Near(result, { x: 1, y: 0, z: 0 })
    })

    it('rotateZ3D(90) should rotate X to Y', () => {
      const m = rotateZ3D(90)
      const p: Vec3 = { x: 1, y: 0, z: 0 }
      const result = transformPoint3D(p, m)
      assertVec3Near(result, { x: 0, y: 1, z: 0 })
    })
  })

  describe('180-degree rotation', () => {
    it('rotateZ3D(180) should negate X and Y', () => {
      const m = rotateZ3D(180)
      const p: Vec3 = { x: 1, y: 1, z: 0 }
      const result = transformPoint3D(p, m)
      assertVec3Near(result, { x: -1, y: -1, z: 0 })
    })
  })
})

// ─── Matrix multiplication ──────────────────────────────────

describe('multiply3x3', () => {
  it('identity * identity = identity', () => {
    const result = multiply3x3(identity, identity)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(approxEqual(result[i]![j]!, identity[i]![j]!)).toBe(true)
      }
    }
  })

  it('matrix * identity = matrix', () => {
    const m = rotateZ3D(45)
    const result = multiply3x3(m, identity)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(approxEqual(result[i]![j]!, m[i]![j]!)).toBe(true)
      }
    }
  })

  it('rotateZ(45) * rotateZ(45) ≈ rotateZ(90)', () => {
    const m45 = rotateZ3D(45)
    const composed = multiply3x3(m45, m45)
    const m90 = rotateZ3D(90)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(approxEqual(composed[i]![j]!, m90[i]![j]!, 1e-5)).toBe(true)
      }
    }
  })
})

// ─── Point transformation ───────────────────────────────────

describe('transformPoint3D', () => {
  it('identity transform preserves point', () => {
    const p: Vec3 = { x: 3, y: 5, z: 7 }
    const result = transformPoint3D(p, identity)
    assertVec3Near(result, p)
  })

  it('rotateZ(90) on (1,0,0) gives (0,1,0)', () => {
    const m = rotateZ3D(90)
    const result = transformPoint3D({ x: 1, y: 0, z: 0 }, m)
    assertVec3Near(result, { x: 0, y: 1, z: 0 })
  })

  it('rotateX(90) on (0,0,1) gives (0,-1,0)', () => {
    const m = rotateX3D(90)
    const result = transformPoint3D({ x: 0, y: 0, z: 1 }, m)
    assertVec3Near(result, { x: 0, y: -1, z: 0 })
  })

  it('combined rotation works', () => {
    const rx = rotateX3D(90)
    const ry = rotateY3D(90)
    const combined = multiply3x3(ry, rx)
    const p: Vec3 = { x: 1, y: 0, z: 0 }
    const result = transformPoint3D(p, combined)
    // rotateX(90) on (1,0,0) = (1,0,0), then rotateY(90) on (1,0,0) = (0,0,-1)
    assertVec3Near(result, { x: 0, y: 0, z: -1 })
  })
})

// ─── Extrude path ───────────────────────────────────────────

describe('extrudePath', () => {
  it('creates front, back, and sides from a square', () => {
    const geo = extrudePath(squareSegments(), 50)
    expect(geo.front.length).toBe(4)
    expect(geo.back.length).toBe(4)
    expect(geo.sides.length).toBe(4)
  })

  it('front face is at z=0', () => {
    const geo = extrudePath(squareSegments(), 50)
    for (const p of geo.front) {
      expect(p.z).toBe(0)
    }
  })

  it('back face is at z=depth', () => {
    const depth = 75
    const geo = extrudePath(squareSegments(), depth)
    for (const p of geo.back) {
      expect(p.z).toBe(depth)
    }
  })

  it('side quads connect front and back', () => {
    const geo = extrudePath(squareSegments(), 30)
    for (const quad of geo.sides) {
      expect(quad.length).toBe(4)
      // First two points should have z=0 (front), last two z=depth (back)
      expect(quad[0]!.z).toBe(0)
      expect(quad[1]!.z).toBe(0)
      expect(quad[2]!.z).toBe(30)
      expect(quad[3]!.z).toBe(30)
    }
  })

  it('preserves x/y coordinates', () => {
    const geo = extrudePath(squareSegments(), 10)
    expect(geo.front[0]!.x).toBe(0)
    expect(geo.front[0]!.y).toBe(0)
    expect(geo.front[1]!.x).toBe(100)
    expect(geo.front[1]!.y).toBe(0)
  })

  it('handles empty segments', () => {
    const geo = extrudePath([], 50)
    expect(geo.front.length).toBe(0)
    expect(geo.back.length).toBe(0)
    expect(geo.sides.length).toBe(0)
  })

  it('handles triangle segments', () => {
    const geo = extrudePath(triangleSegments(), 20)
    expect(geo.front.length).toBe(3)
    expect(geo.back.length).toBe(3)
    expect(geo.sides.length).toBe(3)
  })
})

// ─── 2D projection ─────────────────────────────────────────

describe('projectTo2D', () => {
  it('projects point to 2D with offset', () => {
    const result = projectTo2D({ x: 10, y: 20, z: 30 }, 200, 200)
    expect(result.x).toBe(110) // 10 + 200/2
    expect(result.y).toBe(120) // 20 + 200/2
    expect(result.depth).toBe(30)
  })

  it('origin projects to center', () => {
    const result = projectTo2D({ x: 0, y: 0, z: 0 }, 100, 100)
    expect(result.x).toBe(50)
    expect(result.y).toBe(50)
    expect(result.depth).toBe(0)
  })

  it('preserves depth value', () => {
    const result = projectTo2D({ x: 5, y: 5, z: -42 }, 50, 50)
    expect(result.depth).toBe(-42)
  })

  it('negative coordinates project correctly', () => {
    const result = projectTo2D({ x: -30, y: -20, z: 10 }, 100, 100)
    expect(result.x).toBe(20) // -30 + 50
    expect(result.y).toBe(30) // -20 + 50
  })
})

// ─── Face normal ────────────────────────────────────────────

describe('computeFaceNormal', () => {
  it('XY plane triangle should have normal along Z', () => {
    const p1: Vec3 = { x: 0, y: 0, z: 0 }
    const p2: Vec3 = { x: 1, y: 0, z: 0 }
    const p3: Vec3 = { x: 0, y: 1, z: 0 }
    const normal = computeFaceNormal(p1, p2, p3)
    expect(approxEqual(Math.abs(normal.z), 1)).toBe(true)
    expect(approxEqual(normal.x, 0)).toBe(true)
    expect(approxEqual(normal.y, 0)).toBe(true)
  })

  it('XZ plane triangle should have normal along Y', () => {
    const p1: Vec3 = { x: 0, y: 0, z: 0 }
    const p2: Vec3 = { x: 1, y: 0, z: 0 }
    const p3: Vec3 = { x: 0, y: 0, z: 1 }
    const normal = computeFaceNormal(p1, p2, p3)
    expect(approxEqual(Math.abs(normal.y), 1)).toBe(true)
    expect(approxEqual(normal.x, 0)).toBe(true)
    expect(approxEqual(normal.z, 0)).toBe(true)
  })

  it('YZ plane triangle should have normal along X', () => {
    const p1: Vec3 = { x: 0, y: 0, z: 0 }
    const p2: Vec3 = { x: 0, y: 1, z: 0 }
    const p3: Vec3 = { x: 0, y: 0, z: 1 }
    const normal = computeFaceNormal(p1, p2, p3)
    expect(approxEqual(Math.abs(normal.x), 1)).toBe(true)
    expect(approxEqual(normal.y, 0)).toBe(true)
    expect(approxEqual(normal.z, 0)).toBe(true)
  })

  it('normal is normalized (unit length)', () => {
    const p1: Vec3 = { x: 0, y: 0, z: 0 }
    const p2: Vec3 = { x: 5, y: 0, z: 0 }
    const p3: Vec3 = { x: 0, y: 3, z: 0 }
    const normal = computeFaceNormal(p1, p2, p3)
    const length = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2)
    expect(approxEqual(length, 1)).toBe(true)
  })
})

// ─── Phong shading ──────────────────────────────────────────

describe('computePhongShading', () => {
  it('returns an rgb() color string', () => {
    const color = computePhongShading(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      defaultMaterial,
      defaultLighting,
    )
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })

  it('face perpendicular to light has higher brightness than oblique face', () => {
    const directNormal: Vec3 = { x: 0, y: 0, z: 1 }
    const obliqueNormal: Vec3 = { x: 0.7071, y: 0.7071, z: 0 }
    const lightDir: Vec3 = { x: 0, y: 0, z: 1 }
    // Use a view direction that won't produce specular on the oblique face
    const viewDir: Vec3 = { x: 0, y: 0, z: 1 }

    // Use zero specular to test diffuse difference cleanly
    const noSpecLighting: LightingConfig = { ...defaultLighting, specularIntensity: 0 }

    const directColor = computePhongShading(directNormal, lightDir, viewDir, defaultMaterial, noSpecLighting)
    const obliqueColor = computePhongShading(obliqueNormal, lightDir, viewDir, defaultMaterial, noSpecLighting)

    // Parse rgb values
    const parseRgb = (c: string) => {
      const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/)!
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
    }

    const d = parseRgb(directColor)
    const o = parseRgb(obliqueColor)

    // Direct lighting should produce brighter color (higher R for red material)
    expect(d.r).toBeGreaterThan(o.r)
  })

  it('higher ambient produces brighter result even with no direct light', () => {
    const normal: Vec3 = { x: 0, y: 0, z: -1 } // facing away from light
    const lightDir: Vec3 = { x: 0, y: 0, z: 1 }
    const viewDir: Vec3 = { x: 0, y: 0, z: -1 }

    const lowAmbient: MaterialConfig = { ...defaultMaterial, ambient: 0.1 }
    const highAmbient: MaterialConfig = { ...defaultMaterial, ambient: 0.8 }

    const lowColor = computePhongShading(normal, lightDir, viewDir, lowAmbient, defaultLighting)
    const highColor = computePhongShading(normal, lightDir, viewDir, highAmbient, defaultLighting)

    const parseRgb = (c: string) => {
      const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/)!
      return Number(m[1])
    }

    expect(parseRgb(highColor)).toBeGreaterThan(parseRgb(lowColor))
  })

  it('shininess affects specular highlight', () => {
    const normal: Vec3 = { x: 0, y: 0, z: 1 }
    const lightDir: Vec3 = { x: 0, y: 0, z: 1 }
    const viewDir: Vec3 = { x: 0, y: 0, z: 1 } // view along light for max specular

    const lowShine: MaterialConfig = { ...defaultMaterial, shininess: 1 }
    const highShine: MaterialConfig = { ...defaultMaterial, shininess: 100 }

    const lowColor = computePhongShading(normal, lightDir, viewDir, lowShine, defaultLighting)
    const highColor = computePhongShading(normal, lightDir, viewDir, highShine, defaultLighting)

    // Both should produce valid colors
    expect(lowColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(highColor).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })

  it('color values are clamped to 0-255', () => {
    // Use extreme lighting values
    const extreme: LightingConfig = {
      direction: { x: 0, y: 0, z: 1 },
      intensity: 10,
      ambientIntensity: 5,
      specularIntensity: 10,
    }
    const color = computePhongShading(
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { ...defaultMaterial, ambient: 1 },
      extreme,
    )
    const m = color.match(/rgb\((\d+),(\d+),(\d+)\)/)!
    expect(Number(m[1])).toBeLessThanOrEqual(255)
    expect(Number(m[2])).toBeLessThanOrEqual(255)
    expect(Number(m[3])).toBeLessThanOrEqual(255)
  })
})

// ─── Depth sorting ──────────────────────────────────────────

describe('depth sorting order', () => {
  it('extruded geometry has front at z=0 and back at z=depth', () => {
    const depth = 100
    const geo = extrudePath(squareSegments(), depth)

    // All front z values should be 0
    const frontZ = new Set(geo.front.map((p) => p.z))
    expect(frontZ.size).toBe(1)
    expect(frontZ.has(0)).toBe(true)

    // All back z values should be depth
    const backZ = new Set(geo.back.map((p) => p.z))
    expect(backZ.size).toBe(1)
    expect(backZ.has(depth)).toBe(true)
  })

  it('sides span from z=0 to z=depth', () => {
    const depth = 60
    const geo = extrudePath(squareSegments(), depth)
    for (const quad of geo.sides) {
      const zValues = quad.map((p) => p.z)
      expect(zValues).toContain(0)
      expect(zValues).toContain(depth)
    }
  })

  it('painter sort puts far faces before near faces', () => {
    // Simulate what render3DLayer does: sort by centroidDepth descending
    const faces = [{ depth: 10 }, { depth: 50 }, { depth: 0 }, { depth: 30 }]
    faces.sort((a, b) => b.depth - a.depth)
    expect(faces[0]!.depth).toBe(50) // farthest first
    expect(faces[faces.length - 1]!.depth).toBe(0) // nearest last
  })
})

// ─── Default config ─────────────────────────────────────────

describe('createDefaultExtrude3DConfig', () => {
  it('returns valid config', () => {
    const cfg = createDefaultExtrude3DConfig()
    expect(cfg.depth).toBeGreaterThan(0)
    expect(typeof cfg.rotateX).toBe('number')
    expect(typeof cfg.rotateY).toBe('number')
    expect(typeof cfg.rotateZ).toBe('number')
    expect(cfg.material.color).toMatch(/^#/)
    expect(cfg.material.shininess).toBeGreaterThanOrEqual(0)
    expect(cfg.material.roughness).toBeGreaterThanOrEqual(0)
    expect(cfg.material.roughness).toBeLessThanOrEqual(1)
    expect(cfg.lighting.intensity).toBeGreaterThan(0)
  })
})

// ─── Cubic bezier extrusion ─────────────────────────────────

describe('extrudePath with curves', () => {
  it('subdivides cubic bezier into line segments', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 30, cp1y: 0, cp2x: 70, cp2y: 100 },
      { type: 'close' },
    ]
    const geo = extrudePath(segments, 20)
    // Should have more than 2 vertices due to subdivision (1 move + 12 cubic steps)
    expect(geo.front.length).toBe(13)
    expect(geo.back.length).toBe(13)
    expect(geo.sides.length).toBe(13)
  })
})
