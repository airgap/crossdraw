import { describe, test, expect, beforeEach } from 'bun:test'
import { getSharpenBlurSettings, setSharpenBlurSettings } from '@/tools/sharpen-blur-brush'
import { applyRedEyeRemoval, getRedEyeSettings, setRedEyeSettings } from '@/tools/red-eye'
import {
  getSymmetryPoints,
  getSymmetrySettings,
  setSymmetrySettings,
  isSymmetryEnabled,
  expandSymmetryPoints,
} from '@/tools/symmetry'

// ── Helpers ──

function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) data.push(r, g, b, a)
  return makeImageData(data, w, h)
}

// ── Sharpen/Blur Brush ──

describe('Sharpen/Blur Brush', () => {
  beforeEach(() => {
    setSharpenBlurSettings({ mode: 'blur', size: 20, strength: 0.5, hardness: 0.5, spacing: 0.25 })
  })

  test('default settings', () => {
    const s = getSharpenBlurSettings()
    expect(s.mode).toBe('blur')
    expect(s.size).toBe(20)
    expect(s.strength).toBeGreaterThan(0)
    expect(s.strength).toBeLessThanOrEqual(1)
    expect(s.hardness).toBeGreaterThanOrEqual(0)
    expect(s.hardness).toBeLessThanOrEqual(1)
  })

  test('setSharpenBlurSettings merges partial updates', () => {
    setSharpenBlurSettings({ mode: 'sharpen', size: 30 })
    const s = getSharpenBlurSettings()
    expect(s.mode).toBe('sharpen')
    expect(s.size).toBe(30)
    // Other fields unchanged
    expect(s.strength).toBe(0.5)
    // Reset
    setSharpenBlurSettings({ mode: 'blur', size: 20 })
  })

  test('getSharpenBlurSettings returns a copy', () => {
    const a = getSharpenBlurSettings()
    const b = getSharpenBlurSettings()
    expect(a).toEqual(b)
    a.size = 999
    expect(getSharpenBlurSettings().size).not.toBe(999)
  })
})

// ── Red Eye Removal ──

describe('Red Eye Removal', () => {
  test('default settings', () => {
    const s = getRedEyeSettings()
    expect(s.pupilSize).toBe(20)
    expect(s.darkenAmount).toBeGreaterThan(0)
    expect(s.darkenAmount).toBeLessThanOrEqual(1)
  })

  test('setRedEyeSettings merges partial updates', () => {
    setRedEyeSettings({ pupilSize: 40 })
    const s = getRedEyeSettings()
    expect(s.pupilSize).toBe(40)
    expect(s.darkenAmount).toBe(0.8)
    // Reset
    setRedEyeSettings({ pupilSize: 20 })
  })

  test('getRedEyeSettings returns a copy', () => {
    const a = getRedEyeSettings()
    const b = getRedEyeSettings()
    expect(a).toEqual(b)
    a.pupilSize = 999
    expect(getRedEyeSettings().pupilSize).not.toBe(999)
  })

  test('removes red pixels from red-eye area', () => {
    // Create a small image: 10x10 with a red cluster in the center
    const w = 10
    const h = 10
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= 3 && x <= 6 && y >= 3 && y <= 6) {
          // Red-eye pixels: high red, low green/blue
          data.push(200, 30, 30, 255)
        } else {
          // Skin-tone background
          data.push(180, 140, 120, 255)
        }
      }
    }
    const img = makeImageData(data, w, h)

    const affected = applyRedEyeRemoval(5, 5, img)

    expect(affected).toBeGreaterThan(0)

    // Check that red pixels in the center had their R channel reduced
    const centerIdx = (5 * w + 5) * 4
    const newR = img.data[centerIdx]!
    const newG = img.data[centerIdx + 1]!
    // R should now be closer to G (desaturated)
    expect(newR).toBeLessThan(200) // was 200
    // Green should be unchanged
    expect(newG).toBe(30)
  })

  test('returns 0 for non-red area', () => {
    // All gray pixels
    const img = makeSolid(10, 10, 128, 128, 128)
    const affected = applyRedEyeRemoval(5, 5, img)
    expect(affected).toBe(0)
  })

  test('returns 0 for out-of-bounds click', () => {
    const img = makeSolid(10, 10, 200, 30, 30)
    const affected = applyRedEyeRemoval(-5, -5, img)
    expect(affected).toBe(0)
  })

  test('respects pupilSize limit', () => {
    // Create image with a long red line but small pupil size
    const w = 50
    const h = 1
    const data: number[] = []
    for (let x = 0; x < w; x++) {
      data.push(200, 20, 20, 255) // all red
    }
    const img = makeImageData(data, w, h)

    // With a very small pupil size, should only affect nearby pixels
    const affected = applyRedEyeRemoval(25, 0, img, { pupilSize: 3 })
    expect(affected).toBeGreaterThan(0)
    expect(affected).toBeLessThan(w) // should not cover the full width
  })

  test('does not modify transparent pixels', () => {
    // Red but transparent
    const img = makeImageData([200, 30, 30, 0, 200, 30, 30, 0, 200, 30, 30, 0, 200, 30, 30, 0], 2, 2)
    const affected = applyRedEyeRemoval(0, 0, img)
    expect(affected).toBe(0)
  })
})

// ── Symmetry Drawing ──

describe('Symmetry Drawing', () => {
  test('default settings', () => {
    const s = getSymmetrySettings()
    expect(s.enabled).toBe(false)
    expect(s.axes).toBe(2)
    expect(s.angle).toBe(0)
  })

  test('setSymmetrySettings merges partial updates', () => {
    setSymmetrySettings({ enabled: true, axes: 6 })
    const s = getSymmetrySettings()
    expect(s.enabled).toBe(true)
    expect(s.axes).toBe(6)
    expect(s.angle).toBe(0)
    // Reset
    setSymmetrySettings({ enabled: false, axes: 2 })
  })

  test('getSymmetrySettings returns a copy', () => {
    const a = getSymmetrySettings()
    const b = getSymmetrySettings()
    expect(a).toEqual(b)
    a.axes = 999
    expect(getSymmetrySettings().axes).not.toBe(999)
  })

  test('isSymmetryEnabled returns false when disabled', () => {
    setSymmetrySettings({ enabled: false })
    expect(isSymmetryEnabled()).toBe(false)
  })

  test('isSymmetryEnabled returns true when enabled with axes >= 2', () => {
    setSymmetrySettings({ enabled: true, axes: 4 })
    expect(isSymmetryEnabled()).toBe(true)
    setSymmetrySettings({ enabled: false, axes: 2 })
  })

  test('getSymmetryPoints returns original when disabled', () => {
    setSymmetrySettings({ enabled: false })
    const pts = getSymmetryPoints(10, 20, 50, 50)
    expect(pts).toEqual([{ x: 10, y: 20 }])
  })

  test('getSymmetryPoints with 2 axes (mirror) at angle=0', () => {
    const pts = getSymmetryPoints(60, 50, 50, 50, { enabled: true, axes: 2, angle: 0 })
    expect(pts.length).toBe(2)
    // First point should be the original (angle=0)
    expect(pts[0]!.x).toBeCloseTo(60)
    expect(pts[0]!.y).toBeCloseTo(50)
    // Second point should be rotated 180 degrees
    expect(pts[1]!.x).toBeCloseTo(40)
    expect(pts[1]!.y).toBeCloseTo(50)
  })

  test('getSymmetryPoints with 4 axes (quad symmetry)', () => {
    const pts = getSymmetryPoints(60, 50, 50, 50, { enabled: true, axes: 4, angle: 0 })
    expect(pts.length).toBe(4)
    // 0°: (60, 50)
    expect(pts[0]!.x).toBeCloseTo(60)
    expect(pts[0]!.y).toBeCloseTo(50)
    // 90°: (50, 60)
    expect(pts[1]!.x).toBeCloseTo(50)
    expect(pts[1]!.y).toBeCloseTo(60)
    // 180°: (40, 50)
    expect(pts[2]!.x).toBeCloseTo(40)
    expect(pts[2]!.y).toBeCloseTo(50)
    // 270°: (50, 40)
    expect(pts[3]!.x).toBeCloseTo(50)
    expect(pts[3]!.y).toBeCloseTo(40)
  })

  test('getSymmetryPoints with angle offset', () => {
    // 2 axes with 90-degree offset
    const pts = getSymmetryPoints(60, 50, 50, 50, { enabled: true, axes: 2, angle: 90 })
    expect(pts.length).toBe(2)
    // Original point (10, 0) offset from center, rotated 90° => (0, 10)
    expect(pts[0]!.x).toBeCloseTo(50)
    expect(pts[0]!.y).toBeCloseTo(60)
    // Rotated 180° more => (0, -10)
    expect(pts[1]!.x).toBeCloseTo(50)
    expect(pts[1]!.y).toBeCloseTo(40)
  })

  test('getSymmetryPoints preserves distance from center', () => {
    const cx = 100
    const cy = 100
    const x = 110
    const y = 100
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) // 10

    const pts = getSymmetryPoints(x, y, cx, cy, { enabled: true, axes: 6, angle: 0 })
    expect(pts.length).toBe(6)

    for (const pt of pts) {
      const d = Math.sqrt((pt.x - cx) ** 2 + (pt.y - cy) ** 2)
      expect(d).toBeCloseTo(dist)
    }
  })

  test('expandSymmetryPoints creates per-axis arrays', () => {
    setSymmetrySettings({ enabled: true, axes: 3, angle: 0 })
    const points = [
      { x: 60, y: 50 },
      { x: 65, y: 55 },
    ]
    const expanded = expandSymmetryPoints(points, 50, 50)
    expect(expanded.length).toBe(3)
    // Each axis should have 2 points
    for (const axis of expanded) {
      expect(axis.length).toBe(2)
    }
    // First axis, first point should be original
    expect(expanded[0]![0]!.x).toBeCloseTo(60)
    expect(expanded[0]![0]!.y).toBeCloseTo(50)
    // Reset
    setSymmetrySettings({ enabled: false, axes: 2 })
  })

  test('expandSymmetryPoints returns single array when disabled', () => {
    setSymmetrySettings({ enabled: false })
    const points = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]
    const expanded = expandSymmetryPoints(points, 50, 50)
    expect(expanded.length).toBe(1)
    expect(expanded[0]).toEqual(points)
  })
})
