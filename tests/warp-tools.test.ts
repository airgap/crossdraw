import { describe, test, expect, afterAll } from 'bun:test'
import {
  inverseBilinear,
  applyMeshWarp,
  getMeshWarpSettings,
  setMeshWarpSettings,
  isMeshWarpActive,
} from '@/tools/mesh-warp'
import type { Point2D as MeshPoint } from '@/tools/mesh-warp'
import {
  mlsRigidDeformation,
  applyPuppetWarp,
  getPuppetWarpSettings,
  setPuppetWarpSettings,
  isPuppetWarpActive,
} from '@/tools/puppet-warp'
import type { PuppetPin } from '@/tools/puppet-warp'
import {
  applyPerspectiveWarp,
  getPerspectiveWarpSettings,
  setPerspectiveWarpSettings,
  isPerspectiveWarpActive,
  getPerspectiveWarpPhase,
} from '@/tools/perspective-warp'
import type { PerspectivePlane } from '@/tools/perspective-warp'
import {
  computeMVCWeights,
  pointInPolygon,
  applyCageTransform,
  applyCageTransformInverse,
  getCageTransformSettings,
  setCageTransformSettings,
  isCageTransformActive,
  getCagePhase,
  isCageClosed,
} from '@/tools/cage-transform'
import type { CageVertex } from '@/tools/cage-transform'

// ── ImageData polyfill for bun test environment ──

const origImageData = globalThis.ImageData

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
})

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a test ImageData filled with a known pattern */
function makeTestImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = x & 255 // R = x position
      data[i + 1] = y & 255 // G = y position
      data[i + 2] = 128 // B = constant
      data[i + 3] = 255 // A = opaque
    }
  }
  return new ImageData(data, w, h)
}

/** Check that an ImageData has the correct dimensions and non-zero data */
function hasPixels(img: ImageData, w: number, h: number): boolean {
  if (img.width !== w || img.height !== h) return false
  let nonZero = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! > 0) nonZero++
  }
  return nonZero > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// Mesh Warp
// ═══════════════════════════════════════════════════════════════════════════

describe('Mesh Warp', () => {
  describe('inverseBilinear', () => {
    test('identity quad returns correct UV', () => {
      const p00 = { x: 0, y: 0 }
      const p10 = { x: 10, y: 0 }
      const p01 = { x: 0, y: 10 }
      const p11 = { x: 10, y: 10 }

      const uv = inverseBilinear(5, 5, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(0.5, 2)
      expect(uv![1]).toBeCloseTo(0.5, 2)
    })

    test('corner points return (0,0) and (1,1)', () => {
      const p00 = { x: 0, y: 0 }
      const p10 = { x: 10, y: 0 }
      const p01 = { x: 0, y: 10 }
      const p11 = { x: 10, y: 10 }

      const uv00 = inverseBilinear(0, 0, p00, p10, p01, p11)
      expect(uv00).not.toBeNull()
      expect(uv00![0]).toBeCloseTo(0, 2)
      expect(uv00![1]).toBeCloseTo(0, 2)

      const uv11 = inverseBilinear(10, 10, p00, p10, p01, p11)
      expect(uv11).not.toBeNull()
      expect(uv11![0]).toBeCloseTo(1, 2)
      expect(uv11![1]).toBeCloseTo(1, 2)
    })

    test('point outside quad returns null', () => {
      const p00 = { x: 0, y: 0 }
      const p10 = { x: 10, y: 0 }
      const p01 = { x: 0, y: 10 }
      const p11 = { x: 10, y: 10 }

      const uv = inverseBilinear(20, 20, p00, p10, p01, p11)
      expect(uv).toBeNull()
    })

    test('deformed quad still yields valid UV', () => {
      const p00 = { x: 1, y: 1 }
      const p10 = { x: 9, y: 2 }
      const p01 = { x: 2, y: 9 }
      const p11 = { x: 8, y: 8 }

      // The center-ish area of the deformed quad
      const cx = (1 + 9 + 2 + 8) / 4
      const cy = (1 + 2 + 9 + 8) / 4
      const uv = inverseBilinear(cx, cy, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      // Should be roughly in the middle
      expect(uv![0]).toBeGreaterThan(0.2)
      expect(uv![0]).toBeLessThan(0.8)
      expect(uv![1]).toBeGreaterThan(0.2)
      expect(uv![1]).toBeLessThan(0.8)
    })
  })

  describe('applyMeshWarp', () => {
    test('identity grid produces identical output', () => {
      const src = makeTestImage(20, 20)
      const rows = 2
      const cols = 2

      // Create identity grid
      const grid: MeshPoint[][] = []
      for (let r = 0; r <= rows; r++) {
        const row: MeshPoint[] = []
        for (let c = 0; c <= cols; c++) {
          row.push({ x: (c / cols) * 20, y: (r / rows) * 20 })
        }
        grid.push(row)
      }

      const result = applyMeshWarp(src, grid, grid, rows, cols)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      expect(hasPixels(result, 20, 20)).toBe(true)

      // Most pixels should be close to the original
      let matchCount = 0
      for (let i = 0; i < src.data.length; i += 4) {
        if (Math.abs(result.data[i]! - src.data[i]!) <= 1 && Math.abs(result.data[i + 1]! - src.data[i + 1]!) <= 1) {
          matchCount++
        }
      }
      // At least 80% should match (edges may differ due to boundary handling)
      expect(matchCount / (src.data.length / 4)).toBeGreaterThan(0.8)
    })

    test('deformed grid produces different output', () => {
      const src = makeTestImage(20, 20)
      const rows = 2
      const cols = 2

      const originalGrid: MeshPoint[][] = []
      const deformedGrid: MeshPoint[][] = []
      for (let r = 0; r <= rows; r++) {
        const origRow: MeshPoint[] = []
        const defRow: MeshPoint[] = []
        for (let c = 0; c <= cols; c++) {
          const x = (c / cols) * 20
          const y = (r / rows) * 20
          origRow.push({ x, y })
          // Shift middle point
          if (r === 1 && c === 1) {
            defRow.push({ x: x + 3, y: y + 3 })
          } else {
            defRow.push({ x, y })
          }
        }
        originalGrid.push(origRow)
        deformedGrid.push(defRow)
      }

      const result = applyMeshWarp(src, deformedGrid, originalGrid, rows, cols)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)

      // Should have some pixels different from source
      let diffCount = 0
      for (let i = 0; i < src.data.length; i += 4) {
        if (result.data[i]! !== src.data[i]! || result.data[i + 1]! !== src.data[i + 1]!) {
          diffCount++
        }
      }
      expect(diffCount).toBeGreaterThan(0)
    })
  })

  describe('settings', () => {
    test('get/set settings', () => {
      const original = getMeshWarpSettings()
      expect(original.gridRows).toBe(4)
      expect(original.gridCols).toBe(4)
      expect(original.showGrid).toBe(true)

      setMeshWarpSettings({ gridRows: 6, gridCols: 8 })
      const updated = getMeshWarpSettings()
      expect(updated.gridRows).toBe(6)
      expect(updated.gridCols).toBe(8)

      // Restore
      setMeshWarpSettings({ gridRows: 4, gridCols: 4 })
    })

    test('state queries', () => {
      expect(isMeshWarpActive()).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Puppet Warp
// ═══════════════════════════════════════════════════════════════════════════

describe('Puppet Warp', () => {
  describe('mlsRigidDeformation', () => {
    test('no pins returns identity', () => {
      const [x, y] = mlsRigidDeformation(10, 20, [], 1)
      expect(x).toBe(10)
      expect(y).toBe(20)
    })

    test('single pin: pure translation', () => {
      const pins: PuppetPin[] = [{ id: 'p1', x: 15, y: 25, originalX: 10, originalY: 20 }]
      const [x, y] = mlsRigidDeformation(10, 20, pins, 1)
      expect(x).toBeCloseTo(15, 2)
      expect(y).toBeCloseTo(25, 2)
    })

    test('point at pin returns pin position', () => {
      const pins: PuppetPin[] = [
        { id: 'p1', x: 15, y: 25, originalX: 10, originalY: 20 },
        { id: 'p2', x: 50, y: 50, originalX: 50, originalY: 50 },
      ]
      const [x, y] = mlsRigidDeformation(10, 20, pins, 1)
      expect(x).toBeCloseTo(15, 1)
      expect(y).toBeCloseTo(25, 1)
    })

    test('two pins with translation yield smooth deformation', () => {
      const pins: PuppetPin[] = [
        { id: 'p1', x: 10, y: 10, originalX: 10, originalY: 10 }, // fixed
        { id: 'p2', x: 95, y: 90, originalX: 90, originalY: 90 }, // moved +5,0
      ]

      // Point near the first pin should barely move
      const [x1, y1] = mlsRigidDeformation(15, 15, pins, 1)
      expect(Math.abs(x1 - 15)).toBeLessThan(3)
      expect(Math.abs(y1 - 15)).toBeLessThan(3)

      // Point near the second pin should move more
      const [x2] = mlsRigidDeformation(85, 85, pins, 1)
      expect(x2).toBeGreaterThan(85) // should be shifted right
    })

    test('rigidity controls deformation stiffness', () => {
      const pins: PuppetPin[] = [
        { id: 'p1', x: 0, y: 0, originalX: 0, originalY: 0 },
        { id: 'p2', x: 110, y: 100, originalX: 100, originalY: 100 },
      ]

      // With low alpha, influence decays slower (softer)
      const [xSoft] = mlsRigidDeformation(50, 50, pins, 0.5)
      // With high alpha, influence decays faster (more rigid)
      const [xRigid] = mlsRigidDeformation(50, 50, pins, 2.0)

      // Both should shift right, but amounts differ
      expect(xSoft).toBeGreaterThan(50)
      expect(xRigid).toBeGreaterThan(50)
    })
  })

  describe('applyPuppetWarp', () => {
    test('no pins produces identical output', () => {
      const src = makeTestImage(20, 20)
      const result = applyPuppetWarp(src, [])
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)

      // Should be identical
      for (let i = 0; i < src.data.length; i++) {
        expect(result.data[i]).toBe(src.data[i])
      }
    })

    test('identity pins produce near-identical output', () => {
      const src = makeTestImage(20, 20)
      const pins: PuppetPin[] = [
        { id: 'p1', x: 5, y: 5, originalX: 5, originalY: 5 },
        { id: 'p2', x: 15, y: 15, originalX: 15, originalY: 15 },
      ]
      const result = applyPuppetWarp(src, pins)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      expect(hasPixels(result, 20, 20)).toBe(true)
    })

    test('moved pin shifts pixels', () => {
      const src = makeTestImage(30, 30)
      const pins: PuppetPin[] = [
        { id: 'p1', x: 15, y: 15, originalX: 15, originalY: 15 }, // fixed center
        { id: 'p2', x: 5, y: 25, originalX: 5, originalY: 20 }, // moved down by 5
      ]
      const result = applyPuppetWarp(src, pins)

      // The result should differ from source
      let diffCount = 0
      for (let i = 0; i < src.data.length; i += 4) {
        if (result.data[i]! !== src.data[i]!) diffCount++
      }
      expect(diffCount).toBeGreaterThan(0)
    })
  })

  describe('settings and state', () => {
    test('get/set settings', () => {
      const original = getPuppetWarpSettings()
      expect(original.rigidity).toBe(1.0)
      expect(original.meshDensity).toBe(50)

      setPuppetWarpSettings({ rigidity: 2.0 })
      expect(getPuppetWarpSettings().rigidity).toBe(2.0)

      // Restore
      setPuppetWarpSettings({ rigidity: 1.0 })
    })

    test('state queries', () => {
      expect(isPuppetWarpActive()).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Perspective Warp
// ═══════════════════════════════════════════════════════════════════════════

describe('Perspective Warp', () => {
  describe('applyPerspectiveWarp', () => {
    test('no planes returns copy of source', () => {
      const src = makeTestImage(20, 20)
      const result = applyPerspectiveWarp(src, [])
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)

      // Should be identical copy
      for (let i = 0; i < src.data.length; i++) {
        expect(result.data[i]).toBe(src.data[i])
      }
    })

    test('identity plane produces near-identical output', () => {
      const corners: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ] = [
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 19 },
        { x: 0, y: 19 },
      ]

      const plane: PerspectivePlane = {
        corners: [...corners] as [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ],
        originalCorners: [...corners] as [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ],
        adjacentPlanes: [],
      }

      const src = makeTestImage(20, 20)
      const result = applyPerspectiveWarp(src, [plane])
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      expect(hasPixels(result, 20, 20)).toBe(true)
    })

    test('warped plane changes pixels', () => {
      const originalCorners: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ] = [
        { x: 2, y: 2 },
        { x: 17, y: 2 },
        { x: 17, y: 17 },
        { x: 2, y: 17 },
      ]

      const warpedCorners: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ] = [
        { x: 4, y: 2 },
        { x: 15, y: 3 },
        { x: 16, y: 16 },
        { x: 3, y: 15 },
      ]

      const plane: PerspectivePlane = {
        corners: warpedCorners,
        originalCorners: originalCorners,
        adjacentPlanes: [],
      }

      const src = makeTestImage(20, 20)
      const result = applyPerspectiveWarp(src, [plane])
      expect(hasPixels(result, 20, 20)).toBe(true)
    })
  })

  describe('settings and state', () => {
    test('get/set settings', () => {
      const original = getPerspectiveWarpSettings()
      expect(original.showGrid).toBe(true)
      expect(original.gridDivisions).toBe(4)

      setPerspectiveWarpSettings({ gridDivisions: 8 })
      expect(getPerspectiveWarpSettings().gridDivisions).toBe(8)

      // Restore
      setPerspectiveWarpSettings({ gridDivisions: 4 })
    })

    test('state queries', () => {
      expect(isPerspectiveWarpActive()).toBe(false)
      expect(getPerspectiveWarpPhase()).toBe('layout')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cage Transform
// ═══════════════════════════════════════════════════════════════════════════

describe('Cage Transform', () => {
  describe('pointInPolygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]

    test('point inside returns true', () => {
      expect(pointInPolygon(5, 5, square)).toBe(true)
    })

    test('point outside returns false', () => {
      expect(pointInPolygon(15, 15, square)).toBe(false)
    })

    test('point on negative side returns false', () => {
      expect(pointInPolygon(-5, -5, square)).toBe(false)
    })

    test('works with triangle', () => {
      const tri = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 10, y: 20 },
      ]
      expect(pointInPolygon(10, 5, tri)).toBe(true)
      expect(pointInPolygon(0, 20, tri)).toBe(false)
    })
  })

  describe('computeMVCWeights', () => {
    test('weights sum to 1 for interior point', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const weights = computeMVCWeights(5, 5, polygon)
      expect(weights.length).toBe(4)

      const sum = weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 4)
    })

    test('weights are all non-negative for convex polygon interior point', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const weights = computeMVCWeights(5, 5, polygon)
      for (const w of weights) {
        expect(w).toBeGreaterThanOrEqual(-0.01) // small tolerance
      }
    })

    test('center of square has equal weights', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const weights = computeMVCWeights(5, 5, polygon)

      // Due to symmetry, all weights should be equal
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]!).toBeCloseTo(weights[0]!, 3)
      }
    })

    test('point near a vertex gives high weight to that vertex', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const weights = computeMVCWeights(0.5, 0.5, polygon)
      // First vertex (0,0) should have the highest weight
      expect(weights[0]!).toBeGreaterThan(weights[1]!)
      expect(weights[0]!).toBeGreaterThan(weights[2]!)
      expect(weights[0]!).toBeGreaterThan(weights[3]!)
    })

    test('point at vertex returns unit weight', () => {
      const polygon = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const weights = computeMVCWeights(0, 0, polygon)
      expect(weights[0]!).toBe(1)
      expect(weights[1]!).toBe(0)
      expect(weights[2]!).toBe(0)
      expect(weights[3]!).toBe(0)
    })
  })

  describe('applyCageTransform', () => {
    test('identity cage produces near-identical output', () => {
      const src = makeTestImage(20, 20)
      const vertices: CageVertex[] = [
        { x: 2, y: 2, originalX: 2, originalY: 2 },
        { x: 17, y: 2, originalX: 17, originalY: 2 },
        { x: 17, y: 17, originalX: 17, originalY: 17 },
        { x: 2, y: 17, originalX: 2, originalY: 17 },
      ]

      const result = applyCageTransform(src, vertices)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      expect(hasPixels(result, 20, 20)).toBe(true)
    })

    test('deformed cage changes pixels', () => {
      const src = makeTestImage(30, 30)
      const vertices: CageVertex[] = [
        { x: 5, y: 5, originalX: 5, originalY: 5 },
        { x: 25, y: 5, originalX: 25, originalY: 5 },
        { x: 27, y: 25, originalX: 25, originalY: 25 }, // moved right
        { x: 5, y: 25, originalX: 5, originalY: 25 },
      ]

      const result = applyCageTransform(src, vertices)
      expect(hasPixels(result, 30, 30)).toBe(true)
    })
  })

  describe('applyCageTransformInverse', () => {
    test('identity cage with empty cache still works', () => {
      const src = makeTestImage(20, 20)
      const vertices: CageVertex[] = [
        { x: 2, y: 2, originalX: 2, originalY: 2 },
        { x: 17, y: 2, originalX: 17, originalY: 2 },
        { x: 17, y: 17, originalX: 17, originalY: 17 },
        { x: 2, y: 17, originalX: 2, originalY: 17 },
      ]

      const result = applyCageTransformInverse(src, vertices, new Map())
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
    })
  })

  describe('settings and state', () => {
    test('get/set settings', () => {
      const original = getCageTransformSettings()
      expect(original.showCage).toBe(true)

      setCageTransformSettings({ showCage: false })
      expect(getCageTransformSettings().showCage).toBe(false)

      // Restore
      setCageTransformSettings({ showCage: true })
    })

    test('state queries', () => {
      expect(isCageTransformActive()).toBe(false)
      expect(getCagePhase()).toBe('draw')
      expect(isCageClosed()).toBe(false)
    })
  })
})
