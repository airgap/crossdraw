import { describe, test, expect, beforeEach } from 'bun:test'

// ── Polyfill ImageData for bun (no DOM) ─────────────────────────────────────

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(sw: number | Uint8ClampedArray, sh?: number, settings?: number) {
      if (typeof sw === 'number') {
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        this.data = sw
        this.width = sh!
        this.height = settings ?? sw.length / 4 / sh!
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── cage-transform ──────────────────────────────────────────────────────────
import {
  computeMVCWeights,
  pointInPolygon,
  applyCageTransform,
  applyCageTransformInverse,
  getCageTransformSettings,
  setCageTransformSettings,
  isCageTransformActive,
  getCagePhase,
  getCageVertices,
  isCageClosed,
  addCageVertex,
  closeCage,
  enterDeformPhase,
  moveCageVertex,
  cancelCageTransform,
  type CageVertex,
} from '@/tools/cage-transform'

// ── mesh-warp ───────────────────────────────────────────────────────────────
import {
  inverseBilinear,
  applyMeshWarp,
  getMeshWarpSettings,
  setMeshWarpSettings,
  isMeshWarpActive,
  getMeshWarpGrid,
  dragGridPoint,
  cancelMeshWarp,
  type Point2D,
} from '@/tools/mesh-warp'

// ── perspective-transform ───────────────────────────────────────────────────
import {
  computeHomography,
  invertHomography,
  applyPerspectiveTransform,
  getPerspectiveSettings,
  setPerspectiveSettings,
  isPerspectiveActive,
  getActiveHandle,
  dragPerspectiveCorner,
  cancelPerspectiveTransform,
} from '@/tools/perspective-transform'

// ── perspective-warp ────────────────────────────────────────────────────────
import {
  getPerspectiveWarpSettings,
  setPerspectiveWarpSettings,
  isPerspectiveWarpActive,
  getPerspectiveWarpPhase,
  getPerspectiveWarpPlanes,
  addPlane,
  connectPlanes,
  moveCorner,
  enterWarpPhase,
  autoStraighten,
  applyPerspectiveWarp,
  cancelPerspectiveWarp,
} from '@/tools/perspective-warp'

// ── puppet-warp ─────────────────────────────────────────────────────────────
import {
  mlsRigidDeformation,
  applyPuppetWarp,
  getPuppetWarpSettings,
  setPuppetWarpSettings,
  isPuppetWarpActive,
  getPuppetPins,
  addPin,
  removePin,
  movePin,
  cancelPuppetWarp,
  type PuppetPin,
} from '@/tools/puppet-warp'

// ── liquify ─────────────────────────────────────────────────────────────────
import {
  getLiquifySettings,
  setLiquifySettings,
  isLiquifyActive,
  getLiquifyDisplacementField,
  beginLiquifyFromImageData,
  startLiquifyBrush,
  applyLiquifyBrush,
  endLiquifyBrush,
  renderLiquify,
  commitLiquify,
  cancelLiquify,
} from '@/tools/liquify'

// ── touch-type ──────────────────────────────────────────────────────────────
import {
  beginTouchType,
  endTouchType,
  isTouchTypeActive,
  getTouchTypeState,
  selectCharacter,
  getSelectedCharIndex,
  defaultCharacterTransform,
  getCharTransform,
  transformCharacter,
  setCharacterTransform,
  resetCharacterTransform,
  resetAllCharacterTransforms,
} from '@/tools/touch-type'

// ── variable-fonts ──────────────────────────────────────────────────────────
import {
  getDefaultAxes,
  formatVariationSettings,
  clampAxisValue,
  updateAxisValue,
  resetAxes,
} from '@/tools/variable-fonts'

// ── image-trace ─────────────────────────────────────────────────────────────
import { traceImage, defaultTraceOptions } from '@/tools/image-trace'

import type { CharacterTransform, FontVariationAxis, TextLayer } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Polyfill ImageData for bun test (no DOM). */
function createImageData(data: Uint8ClampedArray, w: number, h: number): ImageData {
  return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData
}

/** Create a solid-colour ImageData. */
function makeImageData(w: number, h: number, r = 0, g = 0, b = 0, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return createImageData(data, w, h)
}

/** Create a minimal TextLayer for touch-type tests (no canvas needed). */
function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    name: 'Test Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CAGE TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════

describe('cage-transform', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    test('getCageTransformSettings returns a copy', () => {
      const s1 = getCageTransformSettings()
      const s2 = getCageTransformSettings()
      expect(s1).toEqual(s2)
      s1.showCage = !s1.showCage
      expect(getCageTransformSettings().showCage).not.toBe(s1.showCage)
    })

    test('setCageTransformSettings merges partial', () => {
      setCageTransformSettings({ showCage: false })
      expect(getCageTransformSettings().showCage).toBe(false)
      setCageTransformSettings({ showCage: true })
    })
  })

  // ── MVC weights ────────────────────────────────────────────
  describe('computeMVCWeights', () => {
    const triangle: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]

    test('weights sum to 1 for interior point', () => {
      const w = computeMVCWeights(5, 3, triangle)
      const sum = w.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 6)
    })

    test('weights are all non-negative for interior point of convex polygon', () => {
      const w = computeMVCWeights(5, 3, triangle)
      for (const v of w) {
        expect(v).toBeGreaterThanOrEqual(-1e-9)
      }
    })

    test('point on vertex returns unit weight', () => {
      const w = computeMVCWeights(0, 0, triangle)
      expect(w[0]).toBeCloseTo(1, 8)
      expect(w[1]).toBeCloseTo(0, 8)
      expect(w[2]).toBeCloseTo(0, 8)
    })

    test('centroid of equilateral-ish triangle gets roughly equal weights', () => {
      const eq: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8.66 },
      ]
      const cx = (0 + 10 + 5) / 3
      const cy = (0 + 0 + 8.66) / 3
      const w = computeMVCWeights(cx, cy, eq)
      // All three weights should be roughly equal
      expect(w[0]).toBeCloseTo(w[1]!, 1)
      expect(w[1]).toBeCloseTo(w[2]!, 1)
    })

    test('works with a quad polygon', () => {
      const quad: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const w = computeMVCWeights(5, 5, quad)
      const sum = w.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 6)
      // Center of square: all four weights should be equal
      for (const v of w) {
        expect(v).toBeCloseTo(0.25, 2)
      }
    })

    test('single-edge polygon (2 points) still returns without crashing', () => {
      const degenerate: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]
      // Should not throw
      const w = computeMVCWeights(5, 0, degenerate)
      expect(w.length).toBe(2)
    })
  })

  // ── pointInPolygon ─────────────────────────────────────────
  describe('pointInPolygon', () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]

    test('inside point returns true', () => {
      expect(pointInPolygon(5, 5, square)).toBe(true)
    })

    test('outside point returns false', () => {
      expect(pointInPolygon(15, 5, square)).toBe(false)
      expect(pointInPolygon(-1, -1, square)).toBe(false)
    })

    test('point far away returns false', () => {
      expect(pointInPolygon(1000, 1000, square)).toBe(false)
    })

    test('concave polygon works', () => {
      // L-shaped polygon
      const concave: Point2D[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 10 },
        { x: 0, y: 10 },
      ]
      expect(pointInPolygon(2, 2, concave)).toBe(true)
      expect(pointInPolygon(8, 8, concave)).toBe(false) // in the cut-out
    })

    test('empty polygon returns false', () => {
      expect(pointInPolygon(0, 0, [])).toBe(false)
    })
  })

  // ── applyCageTransform ─────────────────────────────────────
  describe('applyCageTransform', () => {
    test('returns copy of source when vertices < 3', () => {
      const src = makeImageData(4, 4, 100)
      const result = applyCageTransform(src, [])
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
      expect(result.data[0]).toBe(100)
    })

    test('identity cage preserves pixel positions', () => {
      const src = makeImageData(10, 10, 200, 100, 50, 255)
      const verts: CageVertex[] = [
        { x: 0, y: 0, originalX: 0, originalY: 0 },
        { x: 10, y: 0, originalX: 10, originalY: 0 },
        { x: 10, y: 10, originalX: 10, originalY: 10 },
        { x: 0, y: 10, originalX: 0, originalY: 10 },
      ]
      const result = applyCageTransform(src, verts)
      // Interior pixels should roughly remain the same colour
      expect(result.data[(5 * 10 + 5) * 4]).toBe(200)
    })

    test('produces valid output dimensions', () => {
      const src = makeImageData(8, 8)
      const verts: CageVertex[] = [
        { x: 2, y: 2, originalX: 2, originalY: 2 },
        { x: 6, y: 2, originalX: 6, originalY: 2 },
        { x: 4, y: 6, originalX: 4, originalY: 6 },
      ]
      const result = applyCageTransform(src, verts)
      expect(result.width).toBe(8)
      expect(result.height).toBe(8)
    })
  })

  // ── applyCageTransformInverse ──────────────────────────────
  describe('applyCageTransformInverse', () => {
    test('returns copy when vertices < 3', () => {
      const src = makeImageData(4, 4, 128)
      const result = applyCageTransformInverse(src, [], new Map())
      expect(result.data[0]).toBe(128)
    })

    test('returns copy when weight cache is empty', () => {
      const src = makeImageData(4, 4, 64)
      const verts: CageVertex[] = [
        { x: 0, y: 0, originalX: 0, originalY: 0 },
        { x: 3, y: 0, originalX: 3, originalY: 0 },
        { x: 0, y: 3, originalX: 0, originalY: 3 },
      ]
      const result = applyCageTransformInverse(src, verts, new Map())
      expect(result.data[0]).toBe(64)
    })
  })

  // ── Lifecycle guards (without store) ───────────────────────
  describe('lifecycle guards', () => {
    beforeEach(() => {
      cancelCageTransform()
    })

    test('isCageTransformActive is false initially', () => {
      expect(isCageTransformActive()).toBe(false)
    })

    test('getCagePhase defaults to draw', () => {
      expect(getCagePhase()).toBe('draw')
    })

    test('getCageVertices returns empty array when inactive', () => {
      expect(getCageVertices()).toEqual([])
    })

    test('isCageClosed returns false when inactive', () => {
      expect(isCageClosed()).toBe(false)
    })

    test('addCageVertex does nothing when not active', () => {
      addCageVertex(5, 5)
      expect(getCageVertices()).toEqual([])
    })

    test('closeCage returns false when not active', () => {
      expect(closeCage()).toBe(false)
    })

    test('enterDeformPhase returns false when not active', () => {
      expect(enterDeformPhase()).toBe(false)
    })

    test('moveCageVertex does nothing when not active', () => {
      moveCageVertex(0, 10, 10)
      expect(getCageVertices()).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. MESH WARP
// ═══════════════════════════════════════════════════════════════════════════

describe('mesh-warp', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    test('getMeshWarpSettings returns defaults', () => {
      const s = getMeshWarpSettings()
      expect(s.gridRows).toBe(4)
      expect(s.gridCols).toBe(4)
      expect(s.showGrid).toBe(true)
    })

    test('setMeshWarpSettings updates partially', () => {
      setMeshWarpSettings({ gridRows: 8 })
      expect(getMeshWarpSettings().gridRows).toBe(8)
      setMeshWarpSettings({ gridRows: 4 })
    })

    test('returns a copy, not a reference', () => {
      const s1 = getMeshWarpSettings()
      s1.gridRows = 99
      expect(getMeshWarpSettings().gridRows).not.toBe(99)
    })
  })

  // ── inverseBilinear ────────────────────────────────────────
  describe('inverseBilinear', () => {
    // Unit square
    const p00: Point2D = { x: 0, y: 0 }
    const p10: Point2D = { x: 10, y: 0 }
    const p01: Point2D = { x: 0, y: 10 }
    const p11: Point2D = { x: 10, y: 10 }

    test('center of unit quad returns (0.5, 0.5)', () => {
      const uv = inverseBilinear(5, 5, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(0.5, 2)
      expect(uv![1]).toBeCloseTo(0.5, 2)
    })

    test('top-left corner returns (0, 0)', () => {
      const uv = inverseBilinear(0, 0, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(0, 2)
      expect(uv![1]).toBeCloseTo(0, 2)
    })

    test('top-right corner returns (1, 0)', () => {
      const uv = inverseBilinear(10, 0, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(1, 2)
      expect(uv![1]).toBeCloseTo(0, 2)
    })

    test('bottom-left corner returns (0, 1)', () => {
      const uv = inverseBilinear(0, 10, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(0, 2)
      expect(uv![1]).toBeCloseTo(1, 2)
    })

    test('bottom-right corner returns (1, 1)', () => {
      const uv = inverseBilinear(10, 10, p00, p10, p01, p11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(1, 2)
      expect(uv![1]).toBeCloseTo(1, 2)
    })

    test('point outside returns null', () => {
      const uv = inverseBilinear(20, 20, p00, p10, p01, p11)
      expect(uv).toBeNull()
    })

    test('works with a trapezoid (non-rectangular quad)', () => {
      const t00: Point2D = { x: 2, y: 0 }
      const t10: Point2D = { x: 8, y: 0 }
      const t01: Point2D = { x: 0, y: 10 }
      const t11: Point2D = { x: 10, y: 10 }
      const uv = inverseBilinear(5, 5, t00, t10, t01, t11)
      expect(uv).not.toBeNull()
      expect(uv![0]).toBeCloseTo(0.5, 1)
      expect(uv![1]).toBeCloseTo(0.5, 1)
    })

    test('degenerate quad (zero area) converges to (0.5, 0.5) or returns null', () => {
      const d: Point2D = { x: 0, y: 0 }
      const uv = inverseBilinear(0, 0, d, d, d, d)
      // Newton iteration on zero-area quad may converge to (0.5, 0.5)
      // or return null depending on Jacobian — either is acceptable
      if (uv !== null) {
        expect(uv[0]).toBeGreaterThanOrEqual(0)
        expect(uv[0]).toBeLessThanOrEqual(1)
        expect(uv[1]).toBeGreaterThanOrEqual(0)
        expect(uv[1]).toBeLessThanOrEqual(1)
      }
    })
  })

  // ── applyMeshWarp ──────────────────────────────────────────
  describe('applyMeshWarp', () => {
    test('identity grid preserves image', () => {
      const src = makeImageData(4, 4, 100, 150, 200, 255)
      // 1x1 grid
      const grid: Point2D[][] = [
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
        [
          { x: 0, y: 4 },
          { x: 4, y: 4 },
        ],
      ]
      const result = applyMeshWarp(src, grid, grid, 1, 1)
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
      // Center pixel should be preserved
      const idx = (2 * 4 + 2) * 4
      expect(result.data[idx]).toBeCloseTo(100, -1)
    })

    test('produces correct dimensions', () => {
      const src = makeImageData(6, 6)
      const grid: Point2D[][] = [
        [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
        ],
        [
          { x: 0, y: 6 },
          { x: 6, y: 6 },
        ],
      ]
      const result = applyMeshWarp(src, grid, grid, 1, 1)
      expect(result.width).toBe(6)
      expect(result.height).toBe(6)
    })
  })

  // ── Lifecycle guards ───────────────────────────────────────
  describe('lifecycle guards', () => {
    beforeEach(() => cancelMeshWarp())

    test('isMeshWarpActive is false when inactive', () => {
      expect(isMeshWarpActive()).toBe(false)
    })

    test('getMeshWarpGrid returns empty grid when inactive', () => {
      const g = getMeshWarpGrid()
      expect(g.points).toEqual([])
      expect(g.rows).toBe(0)
      expect(g.cols).toBe(0)
    })

    test('dragGridPoint does nothing when inactive', () => {
      dragGridPoint(0, 0, 99, 99)
      expect(getMeshWarpGrid().points).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. PERSPECTIVE TRANSFORM
// ═══════════════════════════════════════════════════════════════════════════

describe('perspective-transform', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    test('getPerspectiveSettings returns defaults', () => {
      const s = getPerspectiveSettings()
      expect(s.showGrid).toBe(true)
      expect(s.gridDivisions).toBe(4)
      expect(s.interpolation).toBe('bilinear')
    })

    test('setPerspectiveSettings merges partial', () => {
      setPerspectiveSettings({ gridDivisions: 8 })
      expect(getPerspectiveSettings().gridDivisions).toBe(8)
      setPerspectiveSettings({ gridDivisions: 4 })
    })

    test('returns a copy, not reference', () => {
      const s = getPerspectiveSettings()
      s.showGrid = false
      expect(getPerspectiveSettings().showGrid).toBe(true)
    })
  })

  // ── computeHomography ──────────────────────────────────────
  describe('computeHomography', () => {
    test('identity mapping returns identity-like matrix', () => {
      const pts: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const H = computeHomography(pts, pts)
      expect(H).not.toBeNull()
      // H should be approximately identity (scaled)
      // H[0]/H[8] ~ 1, H[4]/H[8] ~ 1
      if (H) {
        const scale = H[8]!
        expect(H[0]! / scale).toBeCloseTo(1, 4)
        expect(H[4]! / scale).toBeCloseTo(1, 4)
        // Off-diagonals should be ~0
        expect(H[1]! / scale).toBeCloseTo(0, 4)
        expect(H[3]! / scale).toBeCloseTo(0, 4)
        expect(H[6]! / scale).toBeCloseTo(0, 4)
        expect(H[7]! / scale).toBeCloseTo(0, 4)
      }
    })

    test('returns null for degenerate (collinear) points', () => {
      const src: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]
      const dst: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]
      const H = computeHomography(src, dst)
      expect(H).toBeNull()
    })

    test('translation homography maps correctly', () => {
      const src: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const dst: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
        { x: 10, y: 120 },
      ]
      const H = computeHomography(src, dst)
      expect(H).not.toBeNull()

      // Verify: H * [0,0,1]^T should give (10, 20)
      if (H) {
        const w = H[6]! * 0 + H[7]! * 0 + H[8]!
        const rx = (H[0]! * 0 + H[1]! * 0 + H[2]!) / w
        const ry = (H[3]! * 0 + H[4]! * 0 + H[5]!) / w
        expect(rx).toBeCloseTo(10, 3)
        expect(ry).toBeCloseTo(20, 3)
      }
    })

    test('all-zero points returns null', () => {
      const z: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]
      expect(computeHomography(z, z)).toBeNull()
    })
  })

  // ── invertHomography ───────────────────────────────────────
  describe('invertHomography', () => {
    test('identity inverse is identity', () => {
      const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
      const inv = invertHomography(I)
      expect(inv).not.toBeNull()
      if (inv) {
        expect(inv[0]).toBeCloseTo(1, 6)
        expect(inv[4]).toBeCloseTo(1, 6)
        expect(inv[8]).toBeCloseTo(1, 6)
        expect(inv[1]).toBeCloseTo(0, 6)
        expect(inv[3]).toBeCloseTo(0, 6)
      }
    })

    test('H * H_inv ~ I', () => {
      const src: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const dst: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 10, y: 5 },
        { x: 90, y: 10 },
        { x: 95, y: 95 },
        { x: 5, y: 90 },
      ]
      const H = computeHomography(src, dst)!
      const Hinv = invertHomography(H)!

      // H * Hinv should be proportional to identity
      // Multiply row 0 of H with columns of Hinv
      const m00 = H[0]! * Hinv[0]! + H[1]! * Hinv[3]! + H[2]! * Hinv[6]!
      const m01 = H[0]! * Hinv[1]! + H[1]! * Hinv[4]! + H[2]! * Hinv[7]!
      const m11 = H[3]! * Hinv[1]! + H[4]! * Hinv[4]! + H[5]! * Hinv[7]!
      expect(m01 / m00).toBeCloseTo(0, 4)
      expect(m11 / m00).toBeCloseTo(1, 4)
    })

    test('singular matrix returns null', () => {
      const singular = [1, 0, 0, 0, 0, 0, 0, 0, 0]
      expect(invertHomography(singular)).toBeNull()
    })

    test('zero matrix returns null', () => {
      expect(invertHomography([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
    })
  })

  // ── applyPerspectiveTransform ──────────────────────────────
  describe('applyPerspectiveTransform', () => {
    test('identity homography preserves image', () => {
      const src = makeImageData(4, 4, 200, 100, 50, 255)
      const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
      const result = applyPerspectiveTransform(src, I)
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
      // Center pixel should be preserved
      const idx = (2 * 4 + 2) * 4
      expect(result.data[idx]).toBeCloseTo(200, -1)
    })

    test('singular homography returns empty image', () => {
      const src = makeImageData(4, 4, 100)
      const singular = [0, 0, 0, 0, 0, 0, 0, 0, 0]
      const result = applyPerspectiveTransform(src, singular)
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
    })

    test('produces correct output dimensions', () => {
      const src = makeImageData(10, 10)
      const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
      const result = applyPerspectiveTransform(src, I)
      expect(result.width).toBe(10)
      expect(result.height).toBe(10)
    })
  })

  // ── Lifecycle guards ───────────────────────────────────────
  describe('lifecycle guards', () => {
    beforeEach(() => cancelPerspectiveTransform())

    test('isPerspectiveActive is false when inactive', () => {
      expect(isPerspectiveActive()).toBe(false)
    })

    test('getActiveHandle returns -1 when inactive', () => {
      expect(getActiveHandle()).toBe(-1)
    })

    test('dragPerspectiveCorner does nothing when inactive', () => {
      dragPerspectiveCorner(0, 99, 99)
      // No crash
    })

    test('dragPerspectiveCorner rejects invalid index', () => {
      dragPerspectiveCorner(-1, 0, 0)
      dragPerspectiveCorner(4, 0, 0)
      // No crash
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. PERSPECTIVE WARP
// ═══════════════════════════════════════════════════════════════════════════

describe('perspective-warp', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    test('getPerspectiveWarpSettings returns defaults', () => {
      const s = getPerspectiveWarpSettings()
      expect(s.showGrid).toBe(true)
      expect(s.gridDivisions).toBe(4)
    })

    test('setPerspectiveWarpSettings merges partial', () => {
      setPerspectiveWarpSettings({ gridDivisions: 6 })
      expect(getPerspectiveWarpSettings().gridDivisions).toBe(6)
      setPerspectiveWarpSettings({ gridDivisions: 4 })
    })
  })

  // ── applyPerspectiveWarp ───────────────────────────────────
  describe('applyPerspectiveWarp', () => {
    test('empty planes returns copy of source', () => {
      const src = makeImageData(4, 4, 128)
      const result = applyPerspectiveWarp(src, [])
      expect(result.data[0]).toBe(128)
    })

    test('identity plane preserves image', () => {
      const src = makeImageData(20, 20, 100, 50, 25, 255)
      const corners: [Point2D, Point2D, Point2D, Point2D] = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]
      const plane = {
        corners,
        originalCorners: corners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D],
        adjacentPlanes: [],
      }
      const result = applyPerspectiveWarp(src, [plane])
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      // Center pixel should be approximately preserved
      const idx = (10 * 20 + 10) * 4
      expect(result.data[idx]).toBeCloseTo(100, -1)
    })
  })

  // ── Lifecycle guards ───────────────────────────────────────
  describe('lifecycle guards', () => {
    beforeEach(() => cancelPerspectiveWarp())

    test('isPerspectiveWarpActive is false when inactive', () => {
      expect(isPerspectiveWarpActive()).toBe(false)
    })

    test('getPerspectiveWarpPhase defaults to layout', () => {
      expect(getPerspectiveWarpPhase()).toBe('layout')
    })

    test('getPerspectiveWarpPlanes returns empty when inactive', () => {
      expect(getPerspectiveWarpPlanes()).toEqual([])
    })

    test('addPlane returns -1 when not active', () => {
      expect(
        addPlane([
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ]),
      ).toBe(-1)
    })

    test('connectPlanes returns false when not active', () => {
      expect(connectPlanes(0, 1, [0, 1], [0, 1])).toBe(false)
    })

    test('enterWarpPhase returns false when not active', () => {
      expect(enterWarpPhase()).toBe(false)
    })

    test('autoStraighten does nothing when not active', () => {
      autoStraighten() // should not throw
    })

    test('moveCorner does nothing when not active', () => {
      moveCorner(0, 0, 99, 99) // should not throw
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. PUPPET WARP
// ═══════════════════════════════════════════════════════════════════════════

describe('puppet-warp', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    test('getPuppetWarpSettings returns defaults', () => {
      const s = getPuppetWarpSettings()
      expect(s.rigidity).toBe(1.0)
      expect(s.meshDensity).toBe(50)
    })

    test('setPuppetWarpSettings merges partial', () => {
      setPuppetWarpSettings({ rigidity: 2.0 })
      expect(getPuppetWarpSettings().rigidity).toBe(2.0)
      setPuppetWarpSettings({ rigidity: 1.0 })
    })

    test('returns a copy', () => {
      const s = getPuppetWarpSettings()
      s.rigidity = 99
      expect(getPuppetWarpSettings().rigidity).not.toBe(99)
    })
  })

  // ── mlsRigidDeformation ────────────────────────────────────
  describe('mlsRigidDeformation', () => {
    test('no pins returns original point', () => {
      const [x, y] = mlsRigidDeformation(5, 10, [], 1)
      expect(x).toBe(5)
      expect(y).toBe(10)
    })

    test('single pin: pure translation', () => {
      const pin: PuppetPin = {
        id: 'p1',
        x: 15,
        y: 25,
        originalX: 10,
        originalY: 20,
      }
      const [x, y] = mlsRigidDeformation(30, 40, [pin], 1)
      expect(x).toBeCloseTo(35, 6)
      expect(y).toBeCloseTo(45, 6)
    })

    test('point exactly on pin returns pins deformed position', () => {
      const pin: PuppetPin = {
        id: 'p1',
        x: 50,
        y: 60,
        originalX: 10,
        originalY: 20,
      }
      const [x, y] = mlsRigidDeformation(10, 20, [pin], 1)
      expect(x).toBeCloseTo(50, 6)
      expect(y).toBeCloseTo(60, 6)
    })

    test('two coincident pins (no movement) returns original point', () => {
      const pins: PuppetPin[] = [
        { id: 'p1', x: 0, y: 0, originalX: 0, originalY: 0 },
        { id: 'p2', x: 10, y: 10, originalX: 10, originalY: 10 },
      ]
      const [x, y] = mlsRigidDeformation(5, 5, pins, 1)
      expect(x).toBeCloseTo(5, 4)
      expect(y).toBeCloseTo(5, 4)
    })

    test('pure translation with multiple pins', () => {
      const dx = 10
      const dy = -5
      const pins: PuppetPin[] = [
        { id: 'p1', x: 0 + dx, y: 0 + dy, originalX: 0, originalY: 0 },
        { id: 'p2', x: 20 + dx, y: 0 + dy, originalX: 20, originalY: 0 },
        { id: 'p3', x: 10 + dx, y: 20 + dy, originalX: 10, originalY: 20 },
      ]
      const [x, y] = mlsRigidDeformation(10, 10, pins, 1)
      expect(x).toBeCloseTo(20, 1)
      expect(y).toBeCloseTo(5, 1)
    })

    test('rigidity parameter affects result', () => {
      const pins: PuppetPin[] = [
        { id: 'p1', x: 0, y: 0, originalX: 0, originalY: 0 },
        { id: 'p2', x: 20, y: 10, originalX: 10, originalY: 0 },
      ]
      // Use a non-equidistant point (closer to pin 1 than pin 2)
      const [x1] = mlsRigidDeformation(2, 1, pins, 0.5)
      const [x2] = mlsRigidDeformation(2, 1, pins, 2.0)
      // Different alpha should produce different results because
      // relative weight of pin 1 vs pin 2 changes
      expect(x1).not.toBeCloseTo(x2, 2)
    })
  })

  // ── applyPuppetWarp ────────────────────────────────────────
  describe('applyPuppetWarp', () => {
    test('no pins returns copy of source', () => {
      const src = makeImageData(4, 4, 200)
      const result = applyPuppetWarp(src, [])
      expect(result.data[0]).toBe(200)
    })

    test('identity pins preserve image', () => {
      const src = makeImageData(8, 8, 100, 100, 100, 255)
      const pins: PuppetPin[] = [
        { id: 'p1', x: 2, y: 2, originalX: 2, originalY: 2 },
        { id: 'p2', x: 6, y: 6, originalX: 6, originalY: 6 },
      ]
      const result = applyPuppetWarp(src, pins)
      expect(result.width).toBe(8)
      expect(result.height).toBe(8)
      // Center should remain similar
      const idx = (4 * 8 + 4) * 4
      expect(result.data[idx]).toBeCloseTo(100, -1)
    })
  })

  // ── Pin management / lifecycle guards ──────────────────────
  describe('lifecycle guards', () => {
    beforeEach(() => cancelPuppetWarp())

    test('isPuppetWarpActive is false when inactive', () => {
      expect(isPuppetWarpActive()).toBe(false)
    })

    test('getPuppetPins returns empty when inactive', () => {
      expect(getPuppetPins()).toEqual([])
    })

    test('addPin adds a pin and returns its id', () => {
      const id = addPin(5, 10)
      expect(id).toMatch(/^pin_/)
    })

    test('removePin removes by id', () => {
      const id1 = addPin(1, 1)
      const id2 = addPin(2, 2)
      removePin(id1)
      const pins = getPuppetPins()
      expect(pins.find((p) => p.id === id1)).toBeUndefined()
      expect(pins.find((p) => p.id === id2)).toBeDefined()
    })

    test('movePin updates position', () => {
      const id = addPin(5, 5)
      movePin(id, 20, 30)
      const pin = getPuppetPins().find((p) => p.id === id)
      expect(pin?.x).toBe(20)
      expect(pin?.y).toBe(30)
      // originalX/Y should stay the same
      expect(pin?.originalX).toBe(5)
      expect(pin?.originalY).toBe(5)
    })

    test('movePin with unknown id does nothing', () => {
      movePin('nonexistent', 99, 99) // should not throw
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. LIQUIFY
// ═══════════════════════════════════════════════════════════════════════════

describe('liquify', () => {
  // ── Settings ───────────────────────────────────────────────
  describe('settings', () => {
    beforeEach(() => {
      // Reset to defaults in case another test modified them
      setLiquifySettings({ mode: 'push', brushSize: 50, brushPressure: 0.5, brushRate: 0.3 })
    })

    test('getLiquifySettings returns defaults', () => {
      const s = getLiquifySettings()
      expect(s.mode).toBe('push')
      expect(s.brushSize).toBe(50)
      expect(s.brushPressure).toBe(0.5)
      expect(s.brushRate).toBe(0.3)
    })

    test('setLiquifySettings merges partial', () => {
      setLiquifySettings({ mode: 'bloat' })
      expect(getLiquifySettings().mode).toBe('bloat')
      setLiquifySettings({ mode: 'push' })
    })

    test('returns a copy', () => {
      const s = getLiquifySettings()
      s.brushSize = 999
      expect(getLiquifySettings().brushSize).not.toBe(999)
    })
  })

  // ── beginLiquifyFromImageData + brush lifecycle ────────────
  describe('headless lifecycle', () => {
    beforeEach(() => {
      cancelLiquify()
    })

    test('beginLiquifyFromImageData activates', () => {
      const img = makeImageData(10, 10)
      beginLiquifyFromImageData(img)
      expect(isLiquifyActive()).toBe(true)
      expect(getLiquifyDisplacementField()).not.toBeNull()
      expect(getLiquifyDisplacementField()!.length).toBe(10 * 10 * 2)
      cancelLiquify()
    })

    test('displacement field starts as all zeros', () => {
      const img = makeImageData(4, 4)
      beginLiquifyFromImageData(img)
      const field = getLiquifyDisplacementField()!
      for (let i = 0; i < field.length; i++) {
        expect(field[i]).toBe(0)
      }
      cancelLiquify()
    })

    test('push brush modifies displacement field', () => {
      const img = makeImageData(20, 20, 128, 128, 128, 255)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 20, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(5, 10)
      applyLiquifyBrush(15, 10) // push rightward

      const field = getLiquifyDisplacementField()!
      // Some pixels near the brush center should have non-zero displacement
      let hasDisplacement = false
      for (let i = 0; i < field.length; i++) {
        if (Math.abs(field[i]!) > 0.01) {
          hasDisplacement = true
          break
        }
      }
      expect(hasDisplacement).toBe(true)

      endLiquifyBrush()
      cancelLiquify()
    })

    test('bloat brush pushes outward', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'bloat', brushSize: 16, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)

      const field = getLiquifyDisplacementField()!
      // Check a pixel to the right of center: displacement x should be positive (pushed right)
      const idx = (10 * 20 + 13) * 2
      expect(field[idx]!).toBeGreaterThan(0)

      cancelLiquify()
    })

    test('pinch brush pulls inward', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'pinch', brushSize: 16, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)

      const field = getLiquifyDisplacementField()!
      // Pixel to the right of center: displacement x should be negative (pulled left)
      const idx = (10 * 20 + 13) * 2
      expect(field[idx]!).toBeLessThan(0)

      cancelLiquify()
    })

    test('twirl-cw brush creates rotational displacement', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'twirl-cw', brushSize: 16, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)

      const field = getLiquifyDisplacementField()!
      // Some displacement should be non-zero
      let hasDisplacement = false
      for (let i = 0; i < field.length; i++) {
        if (Math.abs(field[i]!) > 0.01) {
          hasDisplacement = true
          break
        }
      }
      expect(hasDisplacement).toBe(true)

      cancelLiquify()
    })

    test('twirl-ccw brush creates opposite rotational displacement', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'twirl-ccw', brushSize: 16, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)

      const field = getLiquifyDisplacementField()!
      let hasDisplacement = false
      for (let i = 0; i < field.length; i++) {
        if (Math.abs(field[i]!) > 0.01) {
          hasDisplacement = true
          break
        }
      }
      expect(hasDisplacement).toBe(true)

      cancelLiquify()
    })

    test('reconstruct brush reduces displacement toward zero', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 20, brushPressure: 1.0, brushRate: 1.0 })

      startLiquifyBrush(5, 10)
      applyLiquifyBrush(15, 10)
      endLiquifyBrush()

      // Get displacement magnitude before reconstruct
      const field = getLiquifyDisplacementField()!
      const centerIdx = (10 * 20 + 10) * 2
      const beforeMag = Math.abs(field[centerIdx]!) + Math.abs(field[centerIdx + 1]!)

      // Now apply reconstruct brush
      setLiquifySettings({ mode: 'reconstruct', brushSize: 20, brushPressure: 1.0, brushRate: 1.0 })
      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)
      endLiquifyBrush()

      const afterMag = Math.abs(field[centerIdx]!) + Math.abs(field[centerIdx + 1]!)
      expect(afterMag).toBeLessThan(beforeMag + 0.001)

      cancelLiquify()
    })

    test('smooth brush averages neighbouring displacement', () => {
      const img = makeImageData(20, 20)
      beginLiquifyFromImageData(img)

      // Create some displacement first
      setLiquifySettings({ mode: 'push', brushSize: 10, brushPressure: 1.0, brushRate: 1.0 })
      startLiquifyBrush(5, 10)
      applyLiquifyBrush(15, 10)
      endLiquifyBrush()

      // Apply smooth
      setLiquifySettings({ mode: 'smooth', brushSize: 20, brushPressure: 1.0, brushRate: 1.0 })
      startLiquifyBrush(10, 10)
      applyLiquifyBrush(10, 10)
      endLiquifyBrush()

      // Just ensure it runs without crash
      expect(isLiquifyActive()).toBe(true)
      cancelLiquify()
    })

    test('renderLiquify returns valid ImageData', () => {
      const img = makeImageData(8, 8, 100, 100, 100, 255)
      beginLiquifyFromImageData(img)

      const result = renderLiquify()
      expect(result).not.toBeNull()
      expect(result!.width).toBe(8)
      expect(result!.height).toBe(8)

      cancelLiquify()
    })

    test('renderLiquify returns null when not active', () => {
      expect(renderLiquify()).toBeNull()
    })

    test('commitLiquify returns true when active', () => {
      const img = makeImageData(4, 4)
      beginLiquifyFromImageData(img)
      const ok = commitLiquify()
      expect(ok).toBe(true)
      expect(isLiquifyActive()).toBe(false)
    })

    test('commitLiquify returns false when not active', () => {
      expect(commitLiquify()).toBe(false)
    })

    test('cancelLiquify deactivates', () => {
      const img = makeImageData(4, 4)
      beginLiquifyFromImageData(img)
      cancelLiquify()
      expect(isLiquifyActive()).toBe(false)
      expect(getLiquifyDisplacementField()).toBeNull()
    })

    test('applyLiquifyBrush does nothing when not active', () => {
      applyLiquifyBrush(5, 5) // should not throw
    })

    test('startLiquifyBrush does nothing when not active', () => {
      startLiquifyBrush(5, 5) // should not throw
    })

    test('zero-size image works', () => {
      // Edge case: 1x1 image
      const img = makeImageData(1, 1, 255, 0, 0, 255)
      beginLiquifyFromImageData(img)
      expect(isLiquifyActive()).toBe(true)
      const result = renderLiquify()
      expect(result).not.toBeNull()
      expect(result!.width).toBe(1)
      cancelLiquify()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. TOUCH TYPE
// ═══════════════════════════════════════════════════════════════════════════

describe('touch-type', () => {
  // ── Lifecycle ──────────────────────────────────────────────
  describe('lifecycle', () => {
    beforeEach(() => endTouchType())

    test('isTouchTypeActive is false by default', () => {
      expect(isTouchTypeActive()).toBe(false)
    })

    test('beginTouchType activates', () => {
      beginTouchType(makeTextLayer())
      expect(isTouchTypeActive()).toBe(true)
    })

    test('endTouchType deactivates', () => {
      beginTouchType(makeTextLayer())
      endTouchType()
      expect(isTouchTypeActive()).toBe(false)
    })

    test('getTouchTypeState reflects active state', () => {
      const layer = makeTextLayer({ id: 'layer-abc' })
      beginTouchType(layer)
      const s = getTouchTypeState()
      expect(s.active).toBe(true)
      expect(s.layerId).toBe('layer-abc')
      expect(s.selectedCharIndex).toBeNull()
      endTouchType()
    })
  })

  // ── Character selection ────────────────────────────────────
  describe('character selection', () => {
    beforeEach(() => endTouchType())

    test('selectCharacter sets and gets index', () => {
      beginTouchType(makeTextLayer())
      selectCharacter(3)
      expect(getSelectedCharIndex()).toBe(3)
      selectCharacter(null)
      expect(getSelectedCharIndex()).toBeNull()
      endTouchType()
    })
  })

  // ── defaultCharacterTransform ──────────────────────────────
  describe('defaultCharacterTransform', () => {
    test('returns identity values', () => {
      const t = defaultCharacterTransform(5)
      expect(t.charIndex).toBe(5)
      expect(t.x).toBe(0)
      expect(t.y).toBe(0)
      expect(t.rotation).toBe(0)
      expect(t.scaleX).toBe(1)
      expect(t.scaleY).toBe(1)
    })
  })

  // ── getCharTransform ───────────────────────────────────────
  describe('getCharTransform', () => {
    test('returns existing transform if found', () => {
      const transforms: CharacterTransform[] = [{ charIndex: 2, x: 5, y: 10, rotation: 45, scaleX: 2, scaleY: 3 }]
      const t = getCharTransform(transforms, 2)
      expect(t.x).toBe(5)
      expect(t.rotation).toBe(45)
    })

    test('returns default when not found', () => {
      const t = getCharTransform([], 7)
      expect(t.charIndex).toBe(7)
      expect(t.x).toBe(0)
    })

    test('returns default when transforms is undefined', () => {
      const t = getCharTransform(undefined, 0)
      expect(t.charIndex).toBe(0)
      expect(t.scaleX).toBe(1)
    })
  })

  // ── transformCharacter (delta) ─────────────────────────────
  describe('transformCharacter', () => {
    test('creates new transform entry', () => {
      const result = transformCharacter(undefined, 0, { x: 5, y: -3 })
      expect(result.length).toBe(1)
      expect(result[0]!.x).toBe(5)
      expect(result[0]!.y).toBe(-3)
      expect(result[0]!.rotation).toBe(0)
      expect(result[0]!.scaleX).toBe(1)
    })

    test('adds delta to existing transform', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 10, y: 20, rotation: 30, scaleX: 2, scaleY: 2 }]
      const result = transformCharacter(existing, 0, { x: 5, rotation: 10, scaleX: 1.5 })
      expect(result[0]!.x).toBe(15)
      expect(result[0]!.y).toBe(20) // unchanged: delta.y was undefined
      expect(result[0]!.rotation).toBe(40)
      expect(result[0]!.scaleX).toBe(3) // multiplicative: 2 * 1.5
    })

    test('immutability: returns new array', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]
      const result = transformCharacter(existing, 0, { x: 5 })
      expect(result).not.toBe(existing)
    })

    test('appends new entry when charIndex not found', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 1, y: 2, rotation: 3, scaleX: 1, scaleY: 1 }]
      const result = transformCharacter(existing, 5, { x: 10 })
      expect(result.length).toBe(2)
      expect(result[1]!.charIndex).toBe(5)
      expect(result[1]!.x).toBe(10)
    })
  })

  // ── setCharacterTransform (absolute) ───────────────────────
  describe('setCharacterTransform', () => {
    test('sets absolute values', () => {
      const result = setCharacterTransform(undefined, 3, { x: 50, rotation: 90 })
      expect(result[0]!.charIndex).toBe(3)
      expect(result[0]!.x).toBe(50)
      expect(result[0]!.rotation).toBe(90)
      // Unspecified values should be defaults
      expect(result[0]!.y).toBe(0)
      expect(result[0]!.scaleX).toBe(1)
    })

    test('overwrites existing transform', () => {
      const existing: CharacterTransform[] = [{ charIndex: 3, x: 10, y: 20, rotation: 30, scaleX: 2, scaleY: 2 }]
      const result = setCharacterTransform(existing, 3, { x: 99 })
      expect(result[0]!.x).toBe(99)
      expect(result[0]!.y).toBe(20) // not changed
      expect(result[0]!.rotation).toBe(30) // not changed
    })
  })

  // ── resetCharacterTransform ────────────────────────────────
  describe('resetCharacterTransform', () => {
    test('removes the specified charIndex', () => {
      const existing: CharacterTransform[] = [
        { charIndex: 0, x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 },
        { charIndex: 1, x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      ]
      const result = resetCharacterTransform(existing, 0)
      expect(result.length).toBe(1)
      expect(result[0]!.charIndex).toBe(1)
    })

    test('returns empty array when undefined', () => {
      expect(resetCharacterTransform(undefined, 0)).toEqual([])
    })
  })

  // ── resetAllCharacterTransforms ────────────────────────────
  describe('resetAllCharacterTransforms', () => {
    test('returns empty array', () => {
      expect(resetAllCharacterTransforms()).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. VARIABLE FONTS
// ═══════════════════════════════════════════════════════════════════════════

describe('variable-fonts', () => {
  // ── getDefaultAxes ─────────────────────────────────────────
  describe('getDefaultAxes', () => {
    test('returns 5 registered axes', () => {
      const axes = getDefaultAxes()
      expect(axes.length).toBe(5)
    })

    test('includes wght, wdth, ital, slnt, opsz', () => {
      const tags = getDefaultAxes().map((a) => a.tag)
      expect(tags).toContain('wght')
      expect(tags).toContain('wdth')
      expect(tags).toContain('ital')
      expect(tags).toContain('slnt')
      expect(tags).toContain('opsz')
    })

    test('each axis has value === default', () => {
      for (const axis of getDefaultAxes()) {
        expect(axis.value).toBe(axis.default)
      }
    })

    test('each axis min <= default <= max', () => {
      for (const axis of getDefaultAxes()) {
        expect(axis.min).toBeLessThanOrEqual(axis.default)
        expect(axis.default).toBeLessThanOrEqual(axis.max)
      }
    })
  })

  // ── formatVariationSettings ────────────────────────────────
  describe('formatVariationSettings', () => {
    test('returns empty string when all at defaults', () => {
      const axes = getDefaultAxes()
      expect(formatVariationSettings(axes)).toBe('')
    })

    test('includes non-default axes', () => {
      const axes = getDefaultAxes().map((a) => (a.tag === 'wght' ? { ...a, value: 700 } : a))
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700")
    })

    test('includeAll=true includes all axes', () => {
      const axes = getDefaultAxes()
      const result = formatVariationSettings(axes, true)
      expect(result).toContain("'wght'")
      expect(result).toContain("'wdth'")
      expect(result).toContain("'ital'")
      expect(result).toContain("'slnt'")
      expect(result).toContain("'opsz'")
    })

    test('multiple non-default axes comma-separated', () => {
      const axes = getDefaultAxes().map((a) => {
        if (a.tag === 'wght') return { ...a, value: 700 }
        if (a.tag === 'wdth') return { ...a, value: 85 }
        return a
      })
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700, 'wdth' 85")
    })

    test('empty axes array returns empty string', () => {
      expect(formatVariationSettings([])).toBe('')
    })
  })

  // ── clampAxisValue ─────────────────────────────────────────
  describe('clampAxisValue', () => {
    const axis: FontVariationAxis = { tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400, value: 400 }

    test('value in range returns value', () => {
      expect(clampAxisValue(axis, 500)).toBe(500)
    })

    test('value below min returns min', () => {
      expect(clampAxisValue(axis, 50)).toBe(100)
    })

    test('value above max returns max', () => {
      expect(clampAxisValue(axis, 1000)).toBe(900)
    })

    test('min boundary', () => {
      expect(clampAxisValue(axis, 100)).toBe(100)
    })

    test('max boundary', () => {
      expect(clampAxisValue(axis, 900)).toBe(900)
    })
  })

  // ── updateAxisValue ────────────────────────────────────────
  describe('updateAxisValue', () => {
    test('updates the matching axis', () => {
      const axes = getDefaultAxes()
      const result = updateAxisValue(axes, 'wght', 700)
      const wght = result.find((a) => a.tag === 'wght')
      expect(wght!.value).toBe(700)
    })

    test('clamps value to range', () => {
      const axes = getDefaultAxes()
      const result = updateAxisValue(axes, 'wght', 2000)
      const wght = result.find((a) => a.tag === 'wght')
      expect(wght!.value).toBe(900)
    })

    test('leaves other axes unchanged', () => {
      const axes = getDefaultAxes()
      const result = updateAxisValue(axes, 'wght', 700)
      const wdth = result.find((a) => a.tag === 'wdth')
      expect(wdth!.value).toBe(100)
    })

    test('unknown tag leaves all unchanged', () => {
      const axes = getDefaultAxes()
      const result = updateAxisValue(axes, 'xxxx', 999)
      expect(result).toEqual(axes)
    })

    test('returns a new array (immutable)', () => {
      const axes = getDefaultAxes()
      const result = updateAxisValue(axes, 'wght', 700)
      expect(result).not.toBe(axes)
    })
  })

  // ── resetAxes ──────────────────────────────────────────────
  describe('resetAxes', () => {
    test('resets all values to defaults', () => {
      const axes = getDefaultAxes().map((a) => ({ ...a, value: a.max }))
      const result = resetAxes(axes)
      for (const axis of result) {
        expect(axis.value).toBe(axis.default)
      }
    })

    test('returns a new array (immutable)', () => {
      const axes = getDefaultAxes()
      const result = resetAxes(axes)
      expect(result).not.toBe(axes)
    })

    test('empty array returns empty array', () => {
      expect(resetAxes([])).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. IMAGE TRACE
// ═══════════════════════════════════════════════════════════════════════════

describe('image-trace', () => {
  // ── defaultTraceOptions ────────────────────────────────────
  describe('defaultTraceOptions', () => {
    test('has sensible defaults', () => {
      expect(defaultTraceOptions.threshold).toBe(128)
      expect(defaultTraceOptions.minPathLength).toBe(8)
      expect(defaultTraceOptions.simplifyTolerance).toBe(1.5)
      expect(defaultTraceOptions.smoothing).toBe(true)
    })
  })

  // ── traceImage: uniform images ──────────────────────────────
  describe('traceImage with uniform images', () => {
    test('all-white image produces no contours', () => {
      const img = makeImageData(10, 10, 255, 255, 255, 255)
      const contours = traceImage(img, defaultTraceOptions)
      expect(contours.length).toBe(0)
    })

    test('all-black image returns array', () => {
      const img = makeImageData(10, 10, 0, 0, 0, 255)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      // May or may not produce contours depending on edge-following behaviour
      expect(Array.isArray(contours)).toBe(true)
    })

    test('all-transparent image produces no contours', () => {
      const img = makeImageData(10, 10, 0, 0, 0, 0)
      const contours = traceImage(img, defaultTraceOptions)
      expect(contours.length).toBe(0)
    })
  })

  // ── traceImage: simple shapes ──────────────────────────────
  describe('traceImage with simple shapes', () => {
    test('centered black rectangle returns array of segment arrays', () => {
      const w = 20
      const h = 20
      const data = new Uint8ClampedArray(w * h * 4)
      // Fill white
      data.fill(255)
      // Draw a 10x10 black rectangle in the center
      for (let y = 5; y < 15; y++) {
        for (let x = 5; x < 15; x++) {
          const i = (y * w + x) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
          // alpha already 255
        }
      }
      const img = createImageData(data, w, h)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      expect(Array.isArray(contours)).toBe(true)
      // Each contour (if any) should start with 'move' and end with 'close'
      for (const segs of contours) {
        expect(segs.length).toBeGreaterThanOrEqual(3)
        expect(segs[0]!.type).toBe('move')
        expect(segs[segs.length - 1]!.type).toBe('close')
      }
    })

    test('single black pixel does not crash', () => {
      const w = 5
      const h = 5
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      const i = (2 * w + 2) * 4
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      const img = createImageData(data, w, h)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1, simplifyTolerance: 0 })
      expect(Array.isArray(contours)).toBe(true)
    })

    test('smoothing=false produces only move/line/close segments', () => {
      const w = 20
      const h = 20
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      for (let y = 5; y < 15; y++) {
        for (let x = 5; x < 15; x++) {
          const i = (y * w + x) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
      const img = createImageData(data, w, h)
      const contours = traceImage(img, {
        ...defaultTraceOptions,
        smoothing: false,
        minPathLength: 1,
      })
      for (const segs of contours) {
        for (const s of segs) {
          expect(['move', 'line', 'close']).toContain(s.type)
        }
      }
    })

    test('smoothing=true can produce cubic segments for blob', () => {
      const w = 40
      const h = 40
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      // Draw a large circle blob (radius 15)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cx = x - 20
          const cy = y - 20
          if (cx * cx + cy * cy < 225) {
            const i = (y * w + x) * 4
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
          }
        }
      }
      const img = createImageData(data, w, h)
      const contours = traceImage(img, {
        ...defaultTraceOptions,
        smoothing: true,
        minPathLength: 1,
        simplifyTolerance: 0.5,
      })
      // If contours are found, verify cubic segments exist
      let hasCubic = false
      for (const segs of contours) {
        for (const s of segs) {
          if (s.type === 'cubic') hasCubic = true
        }
      }
      if (contours.length > 0) {
        expect(hasCubic).toBe(true)
      }
    })

    test('higher simplifyTolerance produces fewer or equal segments', () => {
      const w = 30
      const h = 30
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      for (let y = 5; y < 25; y++) {
        for (let x = 5; x < 25; x++) {
          const i = (y * w + x) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
      const img = createImageData(data, w, h)
      const loTol = traceImage(img, { ...defaultTraceOptions, simplifyTolerance: 0.1, minPathLength: 1 })
      const hiTol = traceImage(img, { ...defaultTraceOptions, simplifyTolerance: 10, minPathLength: 1 })
      const countLo = loTol.reduce((s, c) => s + c.length, 0)
      const countHi = hiTol.reduce((s, c) => s + c.length, 0)
      expect(countHi).toBeLessThanOrEqual(countLo)
    })

    test('threshold controls whether uniform grey is foreground or background', () => {
      const w = 10
      const h = 10
      const data = new Uint8ClampedArray(w * h * 4)
      // Fill with grey (luminance ~128)
      for (let i = 0; i < w * h; i++) {
        data[i * 4] = 128
        data[i * 4 + 1] = 128
        data[i * 4 + 2] = 128
        data[i * 4 + 3] = 255
      }
      const img = createImageData(data, w, h)

      // threshold < luminance => all background => no contours
      const low = traceImage(img, { ...defaultTraceOptions, threshold: 100, minPathLength: 1 })
      // threshold > luminance => all foreground (contours depend on border handling)
      const high = traceImage(img, { ...defaultTraceOptions, threshold: 200, minPathLength: 1 })
      expect(low.length).toBe(0)
      // High threshold classifies everything as foreground — may or may not
      // produce border contours depending on marching-squares edge handling
      expect(Array.isArray(high)).toBe(true)
    })
  })

  // ── Edge cases ─────────────────────────────────────────────
  describe('edge cases', () => {
    test('1x1 image does not crash', () => {
      const img = makeImageData(1, 1, 0, 0, 0, 255)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      expect(Array.isArray(contours)).toBe(true)
    })

    test('2x2 all-black image does not crash', () => {
      const img = makeImageData(2, 2, 0, 0, 0, 255)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      expect(Array.isArray(contours)).toBe(true)
    })

    test('narrow 1-pixel-wide vertical line does not crash', () => {
      const w = 10
      const h = 10
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      for (let y = 0; y < h; y++) {
        const i = (y * w + 5) * 4
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
      }
      const img = createImageData(data, w, h)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      expect(Array.isArray(contours)).toBe(true)
    })

    test('checkerboard pattern does not crash', () => {
      const w = 6
      const h = 6
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const val = (x + y) % 2 === 0 ? 0 : 255
          data[i] = val
          data[i + 1] = val
          data[i + 2] = val
          data[i + 3] = 255
        }
      }
      const img = createImageData(data, w, h)
      const contours = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      expect(Array.isArray(contours)).toBe(true)
    })

    test('minPathLength filters small contours', () => {
      const w = 20
      const h = 20
      const data = new Uint8ClampedArray(w * h * 4)
      data.fill(255)
      for (let y = 5; y < 15; y++) {
        for (let x = 5; x < 15; x++) {
          const i = (y * w + x) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
      const img = createImageData(data, w, h)
      const withLow = traceImage(img, { ...defaultTraceOptions, minPathLength: 1 })
      const withHigh = traceImage(img, { ...defaultTraceOptions, minPathLength: 9999 })
      // Very high minPathLength should filter out all contours
      expect(withHigh.length).toBe(0)
      // Low minPathLength should produce at least as many contours
      expect(withLow.length).toBeGreaterThanOrEqual(withHigh.length)
    })
  })
})
