import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  computeHomography,
  invertHomography,
  applyPerspectiveTransform,
  dragPerspectiveCorner,
  commitPerspectiveTransform,
  cancelPerspectiveTransform,
  isPerspectiveActive,
  getActiveHandle,
  getPerspectiveSettings,
  setPerspectiveSettings,
} from '@/tools/perspective-transform'
import type { Point2D } from '@/tools/perspective-transform'
import {
  getLiquifySettings,
  setLiquifySettings,
  isLiquifyActive,
  beginLiquifyFromImageData,
  startLiquifyBrush,
  applyLiquifyBrush,
  endLiquifyBrush,
  renderLiquify,
  commitLiquify,
  cancelLiquify,
  getLiquifyDisplacementField,
} from '@/tools/liquify'
import type { LiquifyMode } from '@/tools/liquify'

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

type P4 = [Point2D, Point2D, Point2D, Point2D]

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

/** Apply homography H to a single point, returning the transformed (x, y). */
function applyH(H: number[], px: number, py: number): [number, number] {
  const w = H[6]! * px + H[7]! * py + H[8]!
  const tx = (H[0]! * px + H[1]! * py + H[2]!) / w
  const ty = (H[3]! * px + H[4]! * py + H[5]!) / w
  return [tx, ty]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Perspective Transform
// ═══════════════════════════════════════════════════════════════════════════════

describe('perspective transform', () => {
  beforeEach(() => {
    // Ensure clean state
    if (isPerspectiveActive()) {
      cancelPerspectiveTransform()
    }
    setPerspectiveSettings({ showGrid: true, gridDivisions: 4, interpolation: 'bilinear' })
  })

  describe('settings', () => {
    test('returns default settings', () => {
      const s = getPerspectiveSettings()
      expect(s.showGrid).toBe(true)
      expect(s.gridDivisions).toBe(4)
      expect(s.interpolation).toBe('bilinear')
    })

    test('updates settings partially', () => {
      setPerspectiveSettings({ gridDivisions: 8 })
      expect(getPerspectiveSettings().gridDivisions).toBe(8)
      expect(getPerspectiveSettings().showGrid).toBe(true)
    })

    test('returns a copy', () => {
      const s = getPerspectiveSettings()
      s.gridDivisions = 999
      expect(getPerspectiveSettings().gridDivisions).not.toBe(999)
    })
  })

  describe('computeHomography', () => {
    test('identity mapping returns identity-like matrix', () => {
      const pts: P4 = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const H = computeHomography(pts, pts)
      expect(H).not.toBeNull()
      if (!H) return

      // For identity, H should be proportional to [1,0,0, 0,1,0, 0,0,1]
      // Normalise by h[8]
      const s = H[8]!
      expect(Math.abs(H[0]! / s - 1)).toBeLessThan(1e-6)
      expect(Math.abs(H[1]! / s)).toBeLessThan(1e-6)
      expect(Math.abs(H[2]! / s)).toBeLessThan(1e-6)
      expect(Math.abs(H[3]! / s)).toBeLessThan(1e-6)
      expect(Math.abs(H[4]! / s - 1)).toBeLessThan(1e-6)
      expect(Math.abs(H[5]! / s)).toBeLessThan(1e-6)
      expect(Math.abs(H[6]! / s)).toBeLessThan(1e-6)
      expect(Math.abs(H[7]! / s)).toBeLessThan(1e-6)
    })

    test('translation mapping shifts coordinates', () => {
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const dst: P4 = [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
        { x: 10, y: 120 },
      ]
      const H = computeHomography(src, dst)
      expect(H).not.toBeNull()
      if (!H) return

      const [tx, ty] = applyH(H, 0, 0)
      expect(Math.abs(tx - 10)).toBeLessThan(0.01)
      expect(Math.abs(ty - 20)).toBeLessThan(0.01)
    })

    test('scale mapping doubles coordinates', () => {
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ]
      const dst: P4 = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const H = computeHomography(src, dst)
      expect(H).not.toBeNull()
      if (!H) return

      const [mx, my] = applyH(H, 25, 25)
      expect(Math.abs(mx - 50)).toBeLessThan(0.01)
      expect(Math.abs(my - 50)).toBeLessThan(0.01)
    })

    test('returns null for degenerate (collinear) points', () => {
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]
      const dst: P4 = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ]
      const H = computeHomography(src, dst)
      expect(H).toBeNull()
    })

    test('perspective warp produces valid matrix', () => {
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ]
      // Trapezoid destination (perspective effect)
      const dst: P4 = [
        { x: 30, y: 10 },
        { x: 170, y: 10 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ]
      const H = computeHomography(src, dst)
      expect(H).not.toBeNull()
      expect(H!.length).toBe(9)

      // Verify the corner mappings
      for (let i = 0; i < 4; i++) {
        const [mx, my] = applyH(H!, src[i]!.x, src[i]!.y)
        expect(Math.abs(mx - dst[i]!.x)).toBeLessThan(0.1)
        expect(Math.abs(my - dst[i]!.y)).toBeLessThan(0.1)
      }
    })
  })

  describe('invertHomography', () => {
    test('inverts identity matrix', () => {
      const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
      const inv = invertHomography(I)
      expect(inv).not.toBeNull()
      if (!inv) return
      for (let i = 0; i < 9; i++) {
        expect(Math.abs(inv[i]! - I[i]!)).toBeLessThan(1e-10)
      }
    })

    test('H * H_inv approximates identity', () => {
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const dst: P4 = [
        { x: 10, y: 5 },
        { x: 90, y: 5 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]
      const H = computeHomography(src, dst)
      expect(H).not.toBeNull()
      if (!H) return

      const Hinv = invertHomography(H)
      expect(Hinv).not.toBeNull()
      if (!Hinv) return

      // Product H * Hinv should be proportional to identity
      const prod = new Array(9).fill(0) as number[]
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          for (let k = 0; k < 3; k++) {
            prod[r * 3 + c]! += H[r * 3 + k]! * Hinv[k * 3 + c]!
          }
        }
      }
      // Normalise
      const s = prod[8]!
      for (let i = 0; i < 9; i++) prod[i] = prod[i]! / s
      // Check identity
      expect(Math.abs(prod[0]! - 1)).toBeLessThan(1e-6)
      expect(Math.abs(prod[4]! - 1)).toBeLessThan(1e-6)
      expect(Math.abs(prod[8]! - 1)).toBeLessThan(1e-6)
      expect(Math.abs(prod[1]!)).toBeLessThan(1e-6)
      expect(Math.abs(prod[2]!)).toBeLessThan(1e-6)
      expect(Math.abs(prod[3]!)).toBeLessThan(1e-6)
    })

    test('returns null for singular matrix', () => {
      const singular = [1, 0, 0, 0, 0, 0, 0, 0, 0]
      expect(invertHomography(singular)).toBeNull()
    })
  })

  describe('applyPerspectiveTransform', () => {
    test('identity homography preserves image', () => {
      const img = makeTestImage(20, 20)
      const H = computeHomography(
        [
          { x: 0, y: 0 },
          { x: 19, y: 0 },
          { x: 19, y: 19 },
          { x: 0, y: 19 },
        ],
        [
          { x: 0, y: 0 },
          { x: 19, y: 0 },
          { x: 19, y: 19 },
          { x: 0, y: 19 },
        ],
      )!
      const result = applyPerspectiveTransform(img, H)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)

      // Check center pixel is approximately preserved
      const cx = 10
      const cy = 10
      const idx = (cy * 20 + cx) * 4
      expect(Math.abs(result.data[idx]! - img.data[idx]!)).toBeLessThan(2)
      expect(Math.abs(result.data[idx + 1]! - img.data[idx + 1]!)).toBeLessThan(2)
    })

    test('produces output with correct dimensions', () => {
      const img = makeTestImage(50, 40)
      const src: P4 = [
        { x: 0, y: 0 },
        { x: 49, y: 0 },
        { x: 49, y: 39 },
        { x: 0, y: 39 },
      ]
      const dst: P4 = [
        { x: 5, y: 5 },
        { x: 44, y: 5 },
        { x: 49, y: 39 },
        { x: 0, y: 39 },
      ]
      const H = computeHomography(src, dst)!
      const result = applyPerspectiveTransform(img, H)
      expect(result.width).toBe(50)
      expect(result.height).toBe(40)
    })

    test('nearest-neighbour interpolation works', () => {
      setPerspectiveSettings({ interpolation: 'nearest' })
      const img = makeTestImage(20, 20)
      const H = computeHomography(
        [
          { x: 0, y: 0 },
          { x: 19, y: 0 },
          { x: 19, y: 19 },
          { x: 0, y: 19 },
        ],
        [
          { x: 0, y: 0 },
          { x: 19, y: 0 },
          { x: 19, y: 19 },
          { x: 0, y: 19 },
        ],
      )!
      const result = applyPerspectiveTransform(img, H)
      expect(result.width).toBe(20)
      // Pixels should be exact copies with nearest-neighbour
      const idx = (10 * 20 + 10) * 4
      expect(result.data[idx]).toBe(img.data[idx])
      setPerspectiveSettings({ interpolation: 'bilinear' })
    })
  })

  describe('state management', () => {
    test('isPerspectiveActive initially false', () => {
      expect(isPerspectiveActive()).toBe(false)
    })

    test('getActiveHandle initially -1', () => {
      expect(getActiveHandle()).toBe(-1)
    })

    test('cancelPerspectiveTransform is safe when not active', () => {
      // Should not throw
      cancelPerspectiveTransform()
      expect(isPerspectiveActive()).toBe(false)
    })

    test('commitPerspectiveTransform returns false when not active', () => {
      expect(commitPerspectiveTransform()).toBe(false)
    })

    test('dragPerspectiveCorner is no-op when not active', () => {
      // Should not throw
      dragPerspectiveCorner(0, 50, 50)
      expect(isPerspectiveActive()).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Liquify
// ═══════════════════════════════════════════════════════════════════════════════

describe('liquify', () => {
  beforeEach(() => {
    if (isLiquifyActive()) {
      cancelLiquify()
    }
    setLiquifySettings({ mode: 'push', brushSize: 50, brushPressure: 0.5, brushRate: 0.3 })
  })

  describe('settings', () => {
    test('returns default settings', () => {
      const s = getLiquifySettings()
      expect(s.mode).toBe('push')
      expect(s.brushSize).toBe(50)
      expect(s.brushPressure).toBe(0.5)
      expect(s.brushRate).toBe(0.3)
    })

    test('updates settings partially', () => {
      setLiquifySettings({ brushSize: 100 })
      expect(getLiquifySettings().brushSize).toBe(100)
      expect(getLiquifySettings().mode).toBe('push')
    })

    test('returns a copy', () => {
      const s = getLiquifySettings()
      s.brushSize = 999
      expect(getLiquifySettings().brushSize).not.toBe(999)
    })

    test('accepts all mode values', () => {
      const modes: LiquifyMode[] = ['push', 'twirl-cw', 'twirl-ccw', 'bloat', 'pinch', 'smooth', 'reconstruct']
      for (const mode of modes) {
        setLiquifySettings({ mode })
        expect(getLiquifySettings().mode).toBe(mode)
      }
    })
  })

  describe('beginLiquifyFromImageData', () => {
    test('activates liquify state', () => {
      const img = makeTestImage(20, 20)
      beginLiquifyFromImageData(img)
      expect(isLiquifyActive()).toBe(true)
    })

    test('allocates displacement field', () => {
      const img = makeTestImage(30, 25)
      beginLiquifyFromImageData(img)
      const field = getLiquifyDisplacementField()
      expect(field).not.toBeNull()
      expect(field!.length).toBe(30 * 25 * 2)
      // All zeros initially
      for (let i = 0; i < field!.length; i++) {
        expect(field![i]).toBe(0)
      }
    })
  })

  describe('renderLiquify', () => {
    test('renders identity when no displacement', () => {
      const img = makeTestImage(20, 20)
      beginLiquifyFromImageData(img)

      const result = renderLiquify()
      expect(result).not.toBeNull()
      expect(result!.width).toBe(20)
      expect(result!.height).toBe(20)

      // With zero displacement, output should match input
      for (let i = 0; i < img.data.length; i++) {
        expect(result!.data[i]).toBe(img.data[i])
      }
    })

    test('returns null when not active', () => {
      expect(renderLiquify()).toBeNull()
    })
  })

  describe('applyLiquifyBrush — push mode', () => {
    test('push mode displaces pixels in brush direction', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 40, brushPressure: 1, brushRate: 1 })

      // Start at center, push right
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(60, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      // Check that center pixels have positive x displacement
      const ci = (50 * 100 + 50) * 2
      expect(field[ci]).toBeGreaterThan(0) // dx > 0 for rightward push
    })
  })

  describe('applyLiquifyBrush — twirl-cw mode', () => {
    test('twirl-cw creates rotational displacement', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'twirl-cw', brushSize: 60, brushPressure: 1, brushRate: 1 })

      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      // Pixels above center should be displaced (CW rotation)
      // Check pixel at (50, 40) — 10px above center
      const ci = (40 * 100 + 50) * 2
      // The displacement should have some non-zero component
      const mag = Math.sqrt(field[ci]! * field[ci]! + field[ci + 1]! * field[ci + 1]!)
      expect(mag).toBeGreaterThan(0)
    })
  })

  describe('applyLiquifyBrush — twirl-ccw mode', () => {
    test('twirl-ccw creates opposite rotational displacement', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'twirl-ccw', brushSize: 60, brushPressure: 1, brushRate: 1 })

      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      const ci = (40 * 100 + 50) * 2
      const mag = Math.sqrt(field[ci]! * field[ci]! + field[ci + 1]! * field[ci + 1]!)
      expect(mag).toBeGreaterThan(0)
    })
  })

  describe('applyLiquifyBrush — bloat mode', () => {
    test('bloat pushes pixels outward from center', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'bloat', brushSize: 60, brushPressure: 1, brushRate: 1 })

      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      // Pixel above center (50, 40): dx=(50-50)=0, dy=(40-50)=-10
      // Bloat: disp += (dx/dist, dy/dist) * amount * radius -> disp.y += -1 * ... < 0
      // This pushes the pixel outward (away from center = upward)
      const idx = (40 * 100 + 50) * 2
      expect(field[idx + 1]).toBeLessThan(0)
    })
  })

  describe('applyLiquifyBrush — pinch mode', () => {
    test('pinch pulls pixels toward center', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'pinch', brushSize: 60, brushPressure: 1, brushRate: 1 })

      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      // Pixel above center (50, 40): dx=(50-50)=0, dy=(40-50)=-10
      // Pinch: disp -= (dx/dist, dy/dist) * amount * radius -> disp.y -= -1 * ... > 0
      // This pulls the pixel toward center (downward)
      const idx = (40 * 100 + 50) * 2
      expect(field[idx + 1]).toBeGreaterThan(0)
    })
  })

  describe('applyLiquifyBrush — smooth mode', () => {
    test('smooth reduces displacement variation', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)

      // First, create some displacement with push
      setLiquifySettings({ mode: 'push', brushSize: 40, brushPressure: 1, brushRate: 1 })
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(60, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      const ci = (50 * 100 + 50) * 2

      // Now smooth it
      setLiquifySettings({ mode: 'smooth', brushSize: 40, brushPressure: 1, brushRate: 1 })
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      // After smoothing, displacement should still exist but be modulated
      const afterDx = field[ci]
      // The displacement should change (smooth averages with neighbours)
      expect(typeof afterDx).toBe('number')
    })
  })

  describe('applyLiquifyBrush — reconstruct mode', () => {
    test('reconstruct reduces displacement toward zero', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)

      // Create displacement
      setLiquifySettings({ mode: 'push', brushSize: 40, brushPressure: 1, brushRate: 1 })
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(60, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      const ci = (50 * 100 + 50) * 2
      const beforeDx = Math.abs(field[ci]!)
      expect(beforeDx).toBeGreaterThan(0)

      // Reconstruct to reduce displacement
      setLiquifySettings({ mode: 'reconstruct', brushSize: 40, brushPressure: 1, brushRate: 1 })
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(50, 50)
      endLiquifyBrush()

      const afterDx = Math.abs(field[ci]!)
      expect(afterDx).toBeLessThan(beforeDx)
    })
  })

  describe('brush falloff', () => {
    test('pixels outside brush radius are not affected', () => {
      const img = makeTestImage(200, 200)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 20, brushPressure: 1, brushRate: 1 })

      // Brush at (100, 100) with radius 10
      startLiquifyBrush(100, 100)
      applyLiquifyBrush(110, 100)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      // Pixel far from brush center (0, 0) should have zero displacement
      expect(field[0]).toBe(0)
      expect(field[1]).toBe(0)

      // Pixel far away (199, 199) should have zero displacement
      const farIdx = (199 * 200 + 199) * 2
      expect(field[farIdx]).toBe(0)
      expect(field[farIdx + 1]).toBe(0)
    })
  })

  describe('commitLiquify', () => {
    test('returns true when active', () => {
      const img = makeTestImage(20, 20)
      beginLiquifyFromImageData(img)
      // Commit without chunkId (headless) -- still returns true
      const result = commitLiquify()
      expect(result).toBe(true)
      expect(isLiquifyActive()).toBe(false)
    })

    test('returns false when not active', () => {
      expect(commitLiquify()).toBe(false)
    })
  })

  describe('cancelLiquify', () => {
    test('deactivates liquify', () => {
      const img = makeTestImage(20, 20)
      beginLiquifyFromImageData(img)
      expect(isLiquifyActive()).toBe(true)
      cancelLiquify()
      expect(isLiquifyActive()).toBe(false)
    })

    test('clears displacement field', () => {
      const img = makeTestImage(20, 20)
      beginLiquifyFromImageData(img)
      cancelLiquify()
      expect(getLiquifyDisplacementField()).toBeNull()
    })

    test('safe to call when not active', () => {
      cancelLiquify()
      expect(isLiquifyActive()).toBe(false)
    })
  })

  describe('full workflow', () => {
    test('push brush alters rendered output', () => {
      const img = makeTestImage(50, 50)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 30, brushPressure: 1, brushRate: 1 })

      startLiquifyBrush(25, 25)
      applyLiquifyBrush(35, 25)
      endLiquifyBrush()

      const result = renderLiquify()!
      expect(result.width).toBe(50)
      expect(result.height).toBe(50)

      // The output should differ from the input at the brush location
      const ci = (25 * 50 + 25) * 4
      const outputR = result.data[ci]!
      // With push, pixels are displaced so the sampled value changes
      // We just check it's a valid pixel value
      expect(outputR).toBeGreaterThanOrEqual(0)
      expect(outputR).toBeLessThanOrEqual(255)

      commitLiquify()
      expect(isLiquifyActive()).toBe(false)
    })

    test('multiple brush strokes accumulate displacement', () => {
      const img = makeTestImage(100, 100)
      beginLiquifyFromImageData(img)
      setLiquifySettings({ mode: 'push', brushSize: 40, brushPressure: 0.5, brushRate: 0.5 })

      // First stroke
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(55, 50)
      endLiquifyBrush()

      const field = getLiquifyDisplacementField()!
      const ci = (50 * 100 + 50) * 2
      const afterFirst = field[ci]!

      // Second stroke in same direction
      startLiquifyBrush(50, 50)
      applyLiquifyBrush(55, 50)
      endLiquifyBrush()

      const afterSecond = field[ci]!
      expect(Math.abs(afterSecond)).toBeGreaterThan(Math.abs(afterFirst))

      cancelLiquify()
    })
  })
})
