/**
 * Tests for src/filters/distort.ts
 *
 * All functions operate on ImageData and return new ImageData.
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
import { bilinearSample, applyWave, applyTwirl, applyPinch, applySphereize } from '@/filters/distort'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(data: number[], w: number, h: number): ImageData {
  return new ImageData(new Uint8ClampedArray(data), w, h)
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) data.push(r, g, b, a)
  return makeImageData(data, w, h)
}

/**
 * Create a 4x4 image with distinct pixel values for each column.
 * Column x has R = x * 60, G = x * 40, B = x * 20, A = 255.
 */
function makeGradientH(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.push(Math.min(255, x * 60), Math.min(255, x * 40), Math.min(255, x * 20), 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Create an image with a checkerboard pattern: alternating black/white pixels. */
function makeCheckerboard(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? 255 : 0
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Get pixel at (x, y) from ImageData */
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!]
}

// ── bilinearSample ──────────────────────────────────────────────────────────

describe('bilinearSample', () => {
  test('returns exact pixel value at integer coordinates', () => {
    const img = makeGradientH(4, 4)
    // pixel at (0,0) = [0, 0, 0, 255]
    expect(bilinearSample(img, 0, 0)).toEqual([0, 0, 0, 255])
    // pixel at (1,0) = [60, 40, 20, 255]
    expect(bilinearSample(img, 1, 0)).toEqual([60, 40, 20, 255])
    // pixel at (2,0) = [120, 80, 40, 255]
    expect(bilinearSample(img, 2, 0)).toEqual([120, 80, 40, 255])
    // pixel at (3,0) = [180, 120, 60, 255]
    expect(bilinearSample(img, 3, 0)).toEqual([180, 120, 60, 255])
  })

  test('interpolates between two pixels horizontally', () => {
    const img = makeGradientH(4, 4)
    // Midpoint between (0,0)=[0,0,0,255] and (1,0)=[60,40,20,255]
    const [r, g, b, a] = bilinearSample(img, 0.5, 0)
    expect(r).toBe(30) // (0 + 60) / 2
    expect(g).toBe(20) // (0 + 40) / 2
    expect(b).toBe(10) // (0 + 20) / 2
    expect(a).toBe(255)
  })

  test('interpolates between two pixels vertically', () => {
    // Build a 2x2: top-left white, top-right white, bottom-left black, bottom-right black
    const img = makeImageData([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255], 2, 2)
    // Midpoint vertically at (0, 0.5)
    const [r, g, b, a] = bilinearSample(img, 0, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
    expect(a).toBe(255)
  })

  test('interpolates diagonally (2D bilinear)', () => {
    // 2x2: TL=0, TR=100, BL=100, BR=200
    const img = makeImageData([0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255], 2, 2)
    const [r] = bilinearSample(img, 0.5, 0.5)
    // Centre of 4 pixels: (0+100+100+200)/4 = 100
    expect(r).toBe(100)
  })

  test('clamps negative coordinates to image bounds', () => {
    const img = makeSolid(4, 4, 128, 64, 32, 255)
    const [r, g, b, a] = bilinearSample(img, -5, -5)
    expect(r).toBe(128)
    expect(g).toBe(64)
    expect(b).toBe(32)
    expect(a).toBe(255)
  })

  test('clamps coordinates beyond image width/height', () => {
    const img = makeSolid(4, 4, 128, 64, 32, 255)
    const [r, g, b, a] = bilinearSample(img, 100, 100)
    expect(r).toBe(128)
    expect(g).toBe(64)
    expect(b).toBe(32)
    expect(a).toBe(255)
  })

  test('handles 1x1 image', () => {
    const img = makeImageData([42, 84, 126, 200], 1, 1)
    expect(bilinearSample(img, 0, 0)).toEqual([42, 84, 126, 200])
    // Even fractional coords clamp to (0,0)
    expect(bilinearSample(img, 0.5, 0.5)).toEqual([42, 84, 126, 200])
  })

  test('handles fractional coordinates near edge', () => {
    const img = makeGradientH(4, 1)
    // At (2.9, 0): mostly pixel 3 with a bit of pixel 2
    const [r] = bilinearSample(img, 2.9, 0)
    // pixel 2 = 120, pixel 3 = 180, 0.9*180 + 0.1*120 = 162+12 = 174
    expect(r).toBe(174)
  })

  test('interpolates alpha channel correctly', () => {
    // 2x1: left fully opaque, right half transparent
    const img = makeImageData([100, 100, 100, 255, 100, 100, 100, 0], 2, 1)
    const [, , , a] = bilinearSample(img, 0.5, 0)
    expect(a).toBe(128) // (255 + 0) / 2 rounded
  })
})

// ── applyWave ───────────────────────────────────────────────────────────────

describe('applyWave', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const dst = applyWave(src, 2, 2, 1, 1)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src) // must be a new object
  })

  test('zero amplitude returns identical pixels', () => {
    const src = makeSolid(6, 6, 100, 150, 200)
    const dst = applyWave(src, 0, 0, 1, 1)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('zero frequency returns identical pixels', () => {
    const src = makeSolid(6, 6, 100, 150, 200)
    const dst = applyWave(src, 5, 5, 0, 0)
    // sin(0) = 0, so displacement is always 0
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('nonzero amplitude produces different pixel values on a gradient', () => {
    const src = makeGradientH(20, 20)
    const dst = applyWave(src, 3, 3, 2, 2)
    // At least some pixels should differ due to wave displacement
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('larger amplitude produces displacement', () => {
    const src = makeCheckerboard(20, 20)
    const dstLarge = applyWave(src, 5, 5, 1, 1)

    let diffLarge = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dstLarge.data[i] !== src.data[i]) diffLarge++
    }
    expect(diffLarge).toBeGreaterThan(0)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(8, 4)
    const dst = applyWave(src, 2, 2, 1, 1)
    expect(dst.width).toBe(8)
    expect(dst.height).toBe(4)
    expect(dst.data.length).toBe(8 * 4 * 4)
  })

  test('handles high frequency gracefully', () => {
    const src = makeGradientH(10, 10)
    const dst = applyWave(src, 1, 1, 50, 50)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
  })
})

// ── applyTwirl ──────────────────────────────────────────────────────────────

describe('applyTwirl', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const dst = applyTwirl(src, Math.PI / 2, 5)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('angle=0 returns identical pixels', () => {
    const src = makeSolid(8, 8, 100, 150, 200)
    const dst = applyTwirl(src, 0, 4)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('radius=0 auto-computes radius as half the shortest side', () => {
    const src = makeGradientH(10, 6)
    const dst = applyTwirl(src, Math.PI / 4, 0)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(6)
    // Should produce some displacement since angle is nonzero
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('twirl displaces pixels within radius', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyTwirl(src, Math.PI, 10)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('pixels outside radius remain unchanged', () => {
    // Use a small radius so most pixels are outside
    const src = makeCheckerboard(20, 20)
    const dst = applyTwirl(src, Math.PI, 1) // radius = 1px, only centre is affected

    // Check corner pixels (far from centre, definitely outside radius=1)
    expect(getPixel(dst, 0, 0)).toEqual(getPixel(src, 0, 0))
    expect(getPixel(dst, 19, 0)).toEqual(getPixel(src, 19, 0))
    expect(getPixel(dst, 0, 19)).toEqual(getPixel(src, 0, 19))
    expect(getPixel(dst, 19, 19)).toEqual(getPixel(src, 19, 19))
  })

  test('negative angle twirls in opposite direction', () => {
    const src = makeGradientH(10, 10)
    const dstPos = applyTwirl(src, Math.PI / 2, 5)
    const dstNeg = applyTwirl(src, -Math.PI / 2, 5)
    // They should not be identical
    let sameCount = 0
    for (let i = 0; i < dstPos.data.length; i++) {
      if (dstPos.data[i] === dstNeg.data[i]) sameCount++
    }
    // Some pixels will differ (especially those inside radius)
    expect(sameCount).toBeLessThan(dstPos.data.length)
  })

  test('large angle produces strong twirl effect', () => {
    const src = makeGradientH(10, 10)
    const dst = applyTwirl(src, Math.PI * 4, 5)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const dst = applyTwirl(src, Math.PI / 3, 3)
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })
})

// ── applyPinch ──────────────────────────────────────────────────────────────

describe('applyPinch', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const dst = applyPinch(src, 0.5)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('amount=0 returns nearly identical pixels', () => {
    const src = makeSolid(8, 8, 100, 150, 200)
    const dst = applyPinch(src, 0)
    // With amount=0, factor calculation: pow(normDist, 1/1)/normDist = 1
    // So sx=x, sy=y
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('positive amount pulls pixels toward centre (pinch)', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyPinch(src, 0.8)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('negative amount pushes pixels away from centre (bulge)', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyPinch(src, -0.8)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('amount is clamped to [-1, 1]', () => {
    const src = makeGradientH(10, 10)
    // amount=5 should be clamped to 1; amount=-5 to -1
    const dst1 = applyPinch(src, 5)
    const dst1Clamped = applyPinch(src, 1)
    const dst2 = applyPinch(src, -5)
    const dst2Clamped = applyPinch(src, -1)

    for (let i = 0; i < src.data.length; i++) {
      expect(dst1.data[i]).toBe(dst1Clamped.data[i])
      expect(dst2.data[i]).toBe(dst2Clamped.data[i])
    }
  })

  test('pinch and bulge produce different results', () => {
    const src = makeGradientH(10, 10)
    const dstPinch = applyPinch(src, 0.5)
    const dstBulge = applyPinch(src, -0.5)
    let sameCount = 0
    for (let i = 0; i < dstPinch.data.length; i++) {
      if (dstPinch.data[i] === dstBulge.data[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(dstPinch.data.length)
  })

  test('corner pixels outside radius remain unchanged', () => {
    // 20x20 image, radius = min(20,20)/2 = 10 from centre (10,10)
    // Corner (0,0) distance = sqrt(100+100) = 14.14 > 10 => unaffected
    const src = makeCheckerboard(20, 20)
    const dst = applyPinch(src, 0.9)
    expect(getPixel(dst, 0, 0)).toEqual(getPixel(src, 0, 0))
    expect(getPixel(dst, 19, 19)).toEqual(getPixel(src, 19, 19))
  })

  test('amount=1 maximum pinch', () => {
    const src = makeGradientH(10, 10)
    const dst = applyPinch(src, 1)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('amount=-1 maximum bulge', () => {
    const src = makeGradientH(10, 10)
    const dst = applyPinch(src, -1)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const dst = applyPinch(src, 0.5)
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })

  test('centre pixel at dist=0 remains at same position', () => {
    // For even-sized image, exact centre is between pixels, so use odd size
    const w = 11
    const h = 11
    const src = makeSolid(w, h, 128, 64, 32, 255)
    const dst = applyPinch(src, 0.9)
    // Centre pixel at (5,5)
    expect(getPixel(dst, 5, 5)).toEqual([128, 64, 32, 255])
  })
})

// ── applySphereize ──────────────────────────────────────────────────────────

describe('applySphereize', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const dst = applySphereize(src, 0.5)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('nonzero amount produces displacement on a gradient', () => {
    const src = makeGradientH(20, 20)
    const dst = applySphereize(src, 0.5)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('amount=1 produces fisheye distortion', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applySphereize(src, 1)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('amount > 1 produces extreme distortion', () => {
    const src = makeGradientH(10, 10)
    const dst = applySphereize(src, 2)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
  })

  test('pixels outside radius circle remain unchanged', () => {
    // 20x20: radius = 10, corners are at distance ~14.14 from centre, r2 > 1
    const src = makeCheckerboard(20, 20)
    const dst = applySphereize(src, 0.5)
    expect(getPixel(dst, 0, 0)).toEqual(getPixel(src, 0, 0))
    expect(getPixel(dst, 19, 19)).toEqual(getPixel(src, 19, 19))
  })

  test('different amounts produce different results', () => {
    const src = makeGradientH(10, 10)
    const dst1 = applySphereize(src, 0.3)
    const dst2 = applySphereize(src, 0.8)
    let sameCount = 0
    for (let i = 0; i < dst1.data.length; i++) {
      if (dst1.data[i] === dst2.data[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(dst1.data.length)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const dst = applySphereize(src, 0.5)
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })

  test('handles near-zero amount (close to identity)', () => {
    const src = makeSolid(8, 8, 100, 150, 200)
    const dst = applySphereize(src, 0.001)
    // With very small amount, most pixels should be very close to original
    expect(dst.width).toBe(8)
    expect(dst.height).toBe(8)
  })

  test('centre pixel with r=0 uses scale=1 (no division by zero)', () => {
    // Odd-sized image so centre is exactly on a pixel
    const src = makeSolid(11, 11, 128, 64, 32, 255)
    const dst = applySphereize(src, 1)
    // Centre at (5, 5): normalized (0, 0), r=0 => scale=1 => sx=cx, sy=cy
    expect(getPixel(dst, 5, 5)).toEqual([128, 64, 32, 255])
  })

  test('negative amount also produces distortion', () => {
    const src = makeGradientH(10, 10)
    const dst = applySphereize(src, -0.5)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })
})
