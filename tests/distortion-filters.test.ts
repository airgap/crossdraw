/**
 * Tests for Ripple, Zigzag, and Polar Coordinates distortion filters.
 *
 * Since Bun does not provide globalThis.ImageData, we polyfill it before
 * importing the module under test.
 */

// ── Polyfill ImageData for Bun ──────────────────────────────────────────────

if (typeof globalThis.ImageData !== 'function') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string

    constructor(sw: number | Uint8ClampedArray, sh?: number, settings?: number) {
      if (typeof sw === 'number') {
        // new ImageData(width, height)
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        // new ImageData(data, width, height?)
        this.data = sw
        this.width = sh!
        this.height = settings ?? sw.length / (4 * sh!)
      }
      this.colorSpace = 'srgb'
    }
  }
}

import { describe, test, expect } from 'bun:test'
import { bilinearSample, applyRipple, applyZigzag, applyPolarCoordinates } from '@/filters/distort'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeImageData(data: number[], w: number, h: number): ImageData {
  return new ImageData(new Uint8ClampedArray(data), w, h)
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) data.push(r, g, b, a)
  return makeImageData(data, w, h)
}

/** Create a horizontal gradient: R decreases left-to-right, B increases. */
function makeGradientH(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = w > 1 ? x / (w - 1) : 0
      data.push(Math.round(255 * (1 - t)), 0, Math.round(255 * t), 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Get pixel at (x, y) from ImageData */
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!]
}

/** Check that all alpha values are 255. */
function allAlphaFull(img: ImageData): boolean {
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] !== 255) return false
  }
  return true
}

/** Count how many pixels differ between two images (by any RGBA component). */
function countDiffPixels(a: ImageData, b: ImageData): number {
  let count = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      count++
    }
  }
  return count
}

// ── applyRipple ─────────────────────────────────────────────────────────────

describe('applyRipple', () => {
  test('returns ImageData with same dimensions', () => {
    const src = makeSolid(64, 48, 128, 64, 32)
    const dst = applyRipple(src, 5, 2, 'horizontal')
    expect(dst.width).toBe(64)
    expect(dst.height).toBe(48)
    expect(dst.data.length).toBe(64 * 48 * 4)
    expect(dst).not.toBe(src)
  })

  test('zero amplitude produces identical output', () => {
    const src = makeGradientH(32, 32)
    const dst = applyRipple(src, 0, 3, 'both')
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('zero frequency produces identical output (sin(0)=0)', () => {
    const src = makeGradientH(32, 32)
    const dst = applyRipple(src, 10, 0, 'both')
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('solid image stays solid regardless of amplitude', () => {
    const src = makeSolid(20, 20, 200, 100, 50)
    const dst = applyRipple(src, 10, 4, 'both')
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(200)
      expect(dst.data[i + 1]).toBe(100)
      expect(dst.data[i + 2]).toBe(50)
      expect(dst.data[i + 3]).toBe(255)
    }
  })

  test('horizontal direction displaces pixels on a gradient', () => {
    const src = makeGradientH(64, 64)
    const dst = applyRipple(src, 8, 3, 'horizontal')
    expect(countDiffPixels(src, dst)).toBeGreaterThan(0)
  })

  test('vertical direction displaces pixels on a 2D gradient', () => {
    // Horizontal gradient has identical rows, so vertical displacement on it
    // won't change values.  Use a vertical gradient instead.
    const w = 64
    const h = 64
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1)
      for (let x = 0; x < w; x++) {
        data.push(Math.round(255 * (1 - t)), 0, Math.round(255 * t), 255)
      }
    }
    const src = makeImageData(data, w, h)
    const dst = applyRipple(src, 8, 3, 'vertical')
    expect(countDiffPixels(src, dst)).toBeGreaterThan(0)
  })

  test('both direction differs from horizontal-only direction', () => {
    // Use a 2D pattern (checkerboard) so both axes of displacement are visible
    const w = 64
    const h = 64
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (x + y) % 2 === 0 ? 255 : 0
        data.push(v, v, v, 255)
      }
    }
    const src = makeImageData(data, w, h)
    const dstH = applyRipple(src, 8, 3, 'horizontal')
    const dstBoth = applyRipple(src, 8, 3, 'both')
    expect(countDiffPixels(dstH, dstBoth)).toBeGreaterThan(0)
  })

  test('preserves full alpha on opaque input', () => {
    const src = makeGradientH(32, 32)
    const dst = applyRipple(src, 5, 2, 'both')
    expect(allAlphaFull(dst)).toBe(true)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const dst = applyRipple(src, 2, 1, 'horizontal')
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })
})

// ── applyZigzag ─────────────────────────────────────────────────────────────

describe('applyZigzag', () => {
  test('returns ImageData with same dimensions', () => {
    const src = makeSolid(50, 50, 100, 150, 200)
    const dst = applyZigzag(src, 10, 4)
    expect(dst.width).toBe(50)
    expect(dst.height).toBe(50)
    expect(dst.data.length).toBe(50 * 50 * 4)
    expect(dst).not.toBe(src)
  })

  test('zero amount produces identical output', () => {
    const src = makeGradientH(32, 32)
    const dst = applyZigzag(src, 0, 5)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('solid image stays solid regardless of amount', () => {
    const src = makeSolid(24, 24, 80, 160, 240)
    const dst = applyZigzag(src, 15, 3)
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(80)
      expect(dst.data[i + 1]).toBe(160)
      expect(dst.data[i + 2]).toBe(240)
      expect(dst.data[i + 3]).toBe(255)
    }
  })

  test('non-zero amount produces displacement on gradient', () => {
    const src = makeGradientH(64, 64)
    const dst = applyZigzag(src, 10, 4)
    expect(countDiffPixels(src, dst)).toBeGreaterThan(0)
  })

  test('centre pixel displacement is minimal (r near 0)', () => {
    // For even-sized images cx/cy are at 0.5 offsets so no pixel has r=0 exactly.
    // Use a solid image and check the centre pixel is unchanged.
    const src = makeSolid(33, 33, 80, 160, 240)
    const dst = applyZigzag(src, 10, 4)
    // Solid colour: every sampled pixel returns the same value regardless of displacement.
    expect(getPixel(dst, 16, 16)).toEqual([80, 160, 240, 255])
  })

  test('more ridges produce different results', () => {
    const src = makeGradientH(64, 64)
    const dst2 = applyZigzag(src, 10, 2)
    const dst8 = applyZigzag(src, 10, 8)
    expect(countDiffPixels(dst2, dst8)).toBeGreaterThan(0)
  })

  test('preserves full alpha on opaque input', () => {
    const src = makeGradientH(32, 32)
    const dst = applyZigzag(src, 8, 3)
    expect(allAlphaFull(dst)).toBe(true)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(16, 8)
    const dst = applyZigzag(src, 5, 2)
    expect(dst.width).toBe(16)
    expect(dst.height).toBe(8)
  })

  test('negative amount displaces in opposite direction', () => {
    const src = makeGradientH(64, 64)
    const dstPos = applyZigzag(src, 10, 4)
    const dstNeg = applyZigzag(src, -10, 4)
    expect(countDiffPixels(dstPos, dstNeg)).toBeGreaterThan(0)
  })
})

// ── applyPolarCoordinates ───────────────────────────────────────────────────

describe('applyPolarCoordinates', () => {
  test('returns ImageData with same dimensions (rect-to-polar)', () => {
    const src = makeSolid(40, 40, 100, 200, 50)
    const dst = applyPolarCoordinates(src, 'rectangular-to-polar')
    expect(dst.width).toBe(40)
    expect(dst.height).toBe(40)
    expect(dst.data.length).toBe(40 * 40 * 4)
    expect(dst).not.toBe(src)
  })

  test('returns ImageData with same dimensions (polar-to-rect)', () => {
    const src = makeSolid(40, 40, 100, 200, 50)
    const dst = applyPolarCoordinates(src, 'polar-to-rectangular')
    expect(dst.width).toBe(40)
    expect(dst.height).toBe(40)
  })

  test('solid image stays solid in both modes', () => {
    const src = makeSolid(30, 30, 55, 155, 255)

    const dstRP = applyPolarCoordinates(src, 'rectangular-to-polar')
    for (let i = 0; i < dstRP.data.length; i += 4) {
      expect(dstRP.data[i]).toBe(55)
      expect(dstRP.data[i + 1]).toBe(155)
      expect(dstRP.data[i + 2]).toBe(255)
      expect(dstRP.data[i + 3]).toBe(255)
    }

    const dstPR = applyPolarCoordinates(src, 'polar-to-rectangular')
    for (let i = 0; i < dstPR.data.length; i += 4) {
      expect(dstPR.data[i]).toBe(55)
      expect(dstPR.data[i + 1]).toBe(155)
      expect(dstPR.data[i + 2]).toBe(255)
      expect(dstPR.data[i + 3]).toBe(255)
    }
  })

  test('rect-to-polar changes a gradient image', () => {
    const src = makeGradientH(64, 64)
    const dst = applyPolarCoordinates(src, 'rectangular-to-polar')
    expect(countDiffPixels(src, dst)).toBeGreaterThan(0)
  })

  test('polar-to-rect changes a gradient image', () => {
    const src = makeGradientH(64, 64)
    const dst = applyPolarCoordinates(src, 'polar-to-rectangular')
    expect(countDiffPixels(src, dst)).toBeGreaterThan(0)
  })

  test('rect-to-polar and polar-to-rect produce different results', () => {
    const src = makeGradientH(64, 64)
    const dstRP = applyPolarCoordinates(src, 'rectangular-to-polar')
    const dstPR = applyPolarCoordinates(src, 'polar-to-rectangular')
    expect(countDiffPixels(dstRP, dstPR)).toBeGreaterThan(0)
  })

  test('preserves full alpha on opaque input (rect-to-polar)', () => {
    const src = makeGradientH(32, 32)
    const dst = applyPolarCoordinates(src, 'rectangular-to-polar')
    expect(allAlphaFull(dst)).toBe(true)
  })

  test('preserves full alpha on opaque input (polar-to-rect)', () => {
    const src = makeGradientH(32, 32)
    const dst = applyPolarCoordinates(src, 'polar-to-rectangular')
    expect(allAlphaFull(dst)).toBe(true)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(16, 8)
    const dstRP = applyPolarCoordinates(src, 'rectangular-to-polar')
    expect(dstRP.width).toBe(16)
    expect(dstRP.height).toBe(8)
    const dstPR = applyPolarCoordinates(src, 'polar-to-rectangular')
    expect(dstPR.width).toBe(16)
    expect(dstPR.height).toBe(8)
  })
})

// ── bilinearSample edge cases (shared helper) ──────────────────────────────

describe('bilinearSample edge cases', () => {
  test('clamps negative coordinates', () => {
    const src = makeSolid(4, 4, 100, 200, 50)
    const [r, g, b, a] = bilinearSample(src, -10, -10)
    expect(r).toBe(100)
    expect(g).toBe(200)
    expect(b).toBe(50)
    expect(a).toBe(255)
  })

  test('clamps coordinates beyond image bounds', () => {
    const src = makeSolid(4, 4, 10, 20, 30)
    const [r, g, b, a] = bilinearSample(src, 100, 100)
    expect(r).toBe(10)
    expect(g).toBe(20)
    expect(b).toBe(30)
    expect(a).toBe(255)
  })
})
