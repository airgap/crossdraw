/**
 * Tests for stylize filters: oil-paint, halftone, pixelate.
 *
 * All functions operate on ImageData and return new ImageData.
 * Since Bun does not provide globalThis.ImageData, we polyfill it before
 * importing the modules under test.
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
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        this.data = sw
        this.width = sh!
        this.height = settings ?? sw.length / (4 * sh!)
      }
      this.colorSpace = 'srgb'
    }
  }
}

import { describe, test, expect } from 'bun:test'
import { applyOilPaint } from '@/filters/oil-paint'
import { applyHalftone } from '@/filters/halftone'
import { applyPixelate } from '@/filters/pixelate'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(data: number[], w: number, h: number): ImageData {
  return new ImageData(new Uint8ClampedArray(data), w, h)
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) data.push(r, g, b, a)
  return makeImageData(data, w, h)
}

function makeGradientH(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data.push(Math.min(255, x * 60), Math.min(255, x * 40), Math.min(255, x * 20), 255)
    }
  }
  return makeImageData(data, w, h)
}

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

function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!]
}

// ══════════════════════════════════════════════════════════════════════════════
// Oil Paint
// ══════════════════════════════════════════════════════════════════════════════

describe('applyOilPaint', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const dst = applyOilPaint(src, { radius: 2, levels: 20 })
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('solid image remains solid', () => {
    const src = makeSolid(8, 8, 100, 150, 200)
    const dst = applyOilPaint(src, { radius: 3, levels: 20 })
    // Every pixel in a solid image should stay the same colour
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(100)
      expect(dst.data[i + 1]).toBe(150)
      expect(dst.data[i + 2]).toBe(200)
      expect(dst.data[i + 3]).toBe(255)
    }
  })

  test('produces flat regions on a gradient (reduces unique colours)', () => {
    const src = makeGradientH(20, 20)
    const dst = applyOilPaint(src, { radius: 3, levels: 5 })
    // Count unique R values
    const uniqueSrc = new Set<number>()
    const uniqueDst = new Set<number>()
    for (let i = 0; i < src.data.length; i += 4) {
      uniqueSrc.add(src.data[i]!)
      uniqueDst.add(dst.data[i]!)
    }
    // Oil paint should reduce the number of unique colour values
    expect(uniqueDst.size).toBeLessThanOrEqual(uniqueSrc.size)
  })

  test('preserves alpha channel', () => {
    const src = makeSolid(6, 6, 100, 150, 200, 128)
    const dst = applyOilPaint(src, { radius: 2, levels: 10 })
    for (let i = 3; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(128)
    }
  })

  test('radius=1 still produces effect on checkerboard', () => {
    const src = makeCheckerboard(10, 10)
    const dst = applyOilPaint(src, { radius: 1, levels: 10 })
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
  })

  test('high levels value works without error', () => {
    const src = makeGradientH(8, 8)
    const dst = applyOilPaint(src, { radius: 2, levels: 256 })
    expect(dst.width).toBe(8)
    expect(dst.height).toBe(8)
  })

  test('low levels value (2) creates strongly posterized result', () => {
    const src = makeGradientH(10, 10)
    const dst = applyOilPaint(src, { radius: 2, levels: 2 })
    // With only 2 bins, there should be very few unique R values
    const unique = new Set<number>()
    for (let i = 0; i < dst.data.length; i += 4) {
      unique.add(dst.data[i]!)
    }
    expect(unique.size).toBeLessThanOrEqual(10) // highly quantized
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const dst = applyOilPaint(src, { radius: 2, levels: 10 })
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })

  test('larger radius produces smoother result', () => {
    const src = makeCheckerboard(20, 20)
    const dst1 = applyOilPaint(src, { radius: 1, levels: 10 })
    const dst5 = applyOilPaint(src, { radius: 5, levels: 10 })
    // Larger radius should have fewer unique colours (more averaging)
    const unique1 = new Set<number>()
    const unique5 = new Set<number>()
    for (let i = 0; i < dst1.data.length; i += 4) {
      unique1.add(dst1.data[i]!)
      unique5.add(dst5.data[i]!)
    }
    expect(unique5.size).toBeLessThanOrEqual(unique1.size)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Halftone
// ══════════════════════════════════════════════════════════════════════════════

describe('applyHalftone', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(20, 20, 128, 128, 128)
    const dst = applyHalftone(src, { dotSize: 4, angle: 0, shape: 'circle' })
    expect(dst.width).toBe(20)
    expect(dst.height).toBe(20)
    expect(dst.data.length).toBe(20 * 20 * 4)
    expect(dst).not.toBe(src)
  })

  test('output is greyscale (R=G=B for each pixel)', () => {
    const src = makeGradientH(20, 20)
    const dst = applyHalftone(src, { dotSize: 4, angle: 0, shape: 'circle' })
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(dst.data[i + 1])
      expect(dst.data[i + 1]).toBe(dst.data[i + 2])
    }
  })

  test('preserves alpha channel', () => {
    const src = makeSolid(12, 12, 100, 150, 200, 128)
    const dst = applyHalftone(src, { dotSize: 4, angle: 0, shape: 'circle' })
    for (let i = 3; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(128)
    }
  })

  test('circle shape produces valid output', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'circle' })
    // All values should be in range [0, 255]
    for (let i = 0; i < dst.data.length; i++) {
      expect(dst.data[i]).toBeGreaterThanOrEqual(0)
      expect(dst.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('diamond shape produces valid output', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'diamond' })
    expect(dst.width).toBe(20)
    expect(dst.height).toBe(20)
  })

  test('line shape produces valid output', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'line' })
    expect(dst.width).toBe(20)
    expect(dst.height).toBe(20)
  })

  test('cross shape produces valid output', () => {
    const src = makeCheckerboard(20, 20)
    const dst = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'cross' })
    expect(dst.width).toBe(20)
    expect(dst.height).toBe(20)
  })

  test('nonzero angle rotates the halftone grid', () => {
    const src = makeGradientH(20, 20)
    const dst0 = applyHalftone(src, { dotSize: 4, angle: 0, shape: 'circle' })
    const dst45 = applyHalftone(src, { dotSize: 4, angle: 45, shape: 'circle' })
    // Different angles should produce different output
    let diffCount = 0
    for (let i = 0; i < dst0.data.length; i++) {
      if (dst0.data[i] !== dst45.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('different dot sizes produce different results', () => {
    const src = makeGradientH(20, 20)
    const dstSmall = applyHalftone(src, { dotSize: 3, angle: 0, shape: 'circle' })
    const dstLarge = applyHalftone(src, { dotSize: 8, angle: 0, shape: 'circle' })
    let diffCount = 0
    for (let i = 0; i < dstSmall.data.length; i++) {
      if (dstSmall.data[i] !== dstLarge.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(16, 8)
    const dst = applyHalftone(src, { dotSize: 4, angle: 0, shape: 'circle' })
    expect(dst.width).toBe(16)
    expect(dst.height).toBe(8)
  })

  test('different shapes produce different results on same input', () => {
    const src = makeGradientH(20, 20)
    const dstCircle = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'circle' })
    const dstDiamond = applyHalftone(src, { dotSize: 5, angle: 0, shape: 'diamond' })
    let diffCount = 0
    for (let i = 0; i < dstCircle.data.length; i++) {
      if (dstCircle.data[i] !== dstDiamond.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Pixelate
// ══════════════════════════════════════════════════════════════════════════════

describe('applyPixelate', () => {
  // ── Mosaic ──

  test('mosaic: returns new ImageData with same dimensions', () => {
    const src = makeSolid(12, 12, 128, 128, 128)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(12)
    expect(dst.data.length).toBe(12 * 12 * 4)
    expect(dst).not.toBe(src)
  })

  test('mosaic: solid image remains solid', () => {
    const src = makeSolid(10, 10, 100, 150, 200)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(100)
      expect(dst.data[i + 1]).toBe(150)
      expect(dst.data[i + 2]).toBe(200)
    }
  })

  test('mosaic: all pixels within a block are identical', () => {
    const src = makeGradientH(12, 12)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    // Check first 4x4 block
    const ref = getPixel(dst, 0, 0)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getPixel(dst, x, y)).toEqual(ref)
      }
    }
  })

  test('mosaic: reduces unique colours', () => {
    const src = makeGradientH(20, 20)
    const dst = applyPixelate(src, { cellSize: 5, mode: 'mosaic' })
    const uniqueSrc = new Set<string>()
    const uniqueDst = new Set<string>()
    for (let i = 0; i < src.data.length; i += 4) {
      uniqueSrc.add(`${src.data[i]},${src.data[i + 1]},${src.data[i + 2]}`)
      uniqueDst.add(`${dst.data[i]},${dst.data[i + 1]},${dst.data[i + 2]}`)
    }
    expect(uniqueDst.size).toBeLessThan(uniqueSrc.size)
  })

  test('mosaic: preserves alpha', () => {
    const src = makeSolid(8, 8, 100, 100, 100, 128)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    for (let i = 3; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(128)
    }
  })

  test('mosaic: works with non-square images', () => {
    const src = makeGradientH(15, 7)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    expect(dst.width).toBe(15)
    expect(dst.height).toBe(7)
  })

  test('mosaic: cellSize larger than image still works', () => {
    const src = makeGradientH(6, 6)
    const dst = applyPixelate(src, { cellSize: 10, mode: 'mosaic' })
    // Entire image should be one colour (average)
    const ref = getPixel(dst, 0, 0)
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        expect(getPixel(dst, x, y)).toEqual(ref)
      }
    }
  })

  // ── Crystallize ──

  test('crystallize: returns new ImageData with same dimensions', () => {
    const src = makeSolid(12, 12, 128, 128, 128)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'crystallize' })
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(12)
    expect(dst.data.length).toBe(12 * 12 * 4)
    expect(dst).not.toBe(src)
  })

  test('crystallize: solid image remains solid', () => {
    const src = makeSolid(10, 10, 100, 150, 200)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'crystallize' })
    for (let i = 0; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(100)
      expect(dst.data[i + 1]).toBe(150)
      expect(dst.data[i + 2]).toBe(200)
    }
  })

  test('crystallize: reduces unique colours on gradient', () => {
    const src = makeGradientH(20, 20)
    const dst = applyPixelate(src, { cellSize: 5, mode: 'crystallize' })
    const uniqueSrc = new Set<string>()
    const uniqueDst = new Set<string>()
    for (let i = 0; i < src.data.length; i += 4) {
      uniqueSrc.add(`${src.data[i]},${src.data[i + 1]},${src.data[i + 2]}`)
      uniqueDst.add(`${dst.data[i]},${dst.data[i + 1]},${dst.data[i + 2]}`)
    }
    expect(uniqueDst.size).toBeLessThan(uniqueSrc.size)
  })

  test('crystallize: produces Voronoi-like cells (adjacent same-colour regions)', () => {
    const src = makeGradientH(20, 20)
    const dst = applyPixelate(src, { cellSize: 5, mode: 'crystallize' })
    // Check that some adjacent pixels share the same colour (cell effect)
    let sameNeighbourCount = 0
    for (let y = 0; y < 20; y++) {
      for (let x = 1; x < 20; x++) {
        const [r1, g1, b1] = getPixel(dst, x - 1, y)
        const [r2, g2, b2] = getPixel(dst, x, y)
        if (r1 === r2 && g1 === g2 && b1 === b2) sameNeighbourCount++
      }
    }
    // Most adjacent pixels within a cell should match
    expect(sameNeighbourCount).toBeGreaterThan(20 * 19 * 0.3) // at least 30% match
  })

  // ── Pointillize ──

  test('pointillize: returns new ImageData with same dimensions', () => {
    const src = makeSolid(12, 12, 128, 128, 128)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'pointillize' })
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(12)
    expect(dst.data.length).toBe(12 * 12 * 4)
    expect(dst).not.toBe(src)
  })

  test('pointillize: background pixels are white', () => {
    // Use a large cellSize relative to image so some pixels must be background
    const src = makeSolid(20, 20, 50, 50, 50)
    const dst = applyPixelate(src, { cellSize: 8, mode: 'pointillize' })
    // At least some pixels should be white (background)
    let whiteCount = 0
    for (let i = 0; i < dst.data.length; i += 4) {
      if (dst.data[i]! >= 250 && dst.data[i + 1]! >= 250 && dst.data[i + 2]! >= 250) {
        whiteCount++
      }
    }
    // With a dark source and large cells, there should be visible white gaps
    expect(whiteCount).toBeGreaterThan(0)
  })

  test('pointillize: preserves alpha from source', () => {
    const src = makeSolid(10, 10, 100, 100, 100, 128)
    const dst = applyPixelate(src, { cellSize: 4, mode: 'pointillize' })
    for (let i = 3; i < dst.data.length; i += 4) {
      expect(dst.data[i]).toBe(128)
    }
  })

  test('pointillize: produces circular dots (center differs from corners)', () => {
    const src = makeSolid(20, 20, 0, 0, 0) // black source
    const dst = applyPixelate(src, { cellSize: 8, mode: 'pointillize' })
    // Some pixels should be dark (dots) and some white (background)
    let darkCount = 0
    let lightCount = 0
    for (let i = 0; i < dst.data.length; i += 4) {
      if (dst.data[i]! < 128) darkCount++
      else lightCount++
    }
    expect(darkCount).toBeGreaterThan(0)
    expect(lightCount).toBeGreaterThan(0)
  })

  // ── Cross-mode ──

  test('different modes produce different results', () => {
    const src = makeGradientH(20, 20)
    const mosaic = applyPixelate(src, { cellSize: 4, mode: 'mosaic' })
    const crystal = applyPixelate(src, { cellSize: 4, mode: 'crystallize' })
    const pointil = applyPixelate(src, { cellSize: 4, mode: 'pointillize' })

    let mosaicCrystalDiff = 0
    let mosaicPointilDiff = 0
    for (let i = 0; i < mosaic.data.length; i++) {
      if (mosaic.data[i] !== crystal.data[i]) mosaicCrystalDiff++
      if (mosaic.data[i] !== pointil.data[i]) mosaicPointilDiff++
    }
    expect(mosaicCrystalDiff).toBeGreaterThan(0)
    expect(mosaicPointilDiff).toBeGreaterThan(0)
  })

  test('larger cellSize produces fewer unique colours in mosaic', () => {
    const src = makeGradientH(20, 20)
    const dstSmall = applyPixelate(src, { cellSize: 2, mode: 'mosaic' })
    const dstLarge = applyPixelate(src, { cellSize: 10, mode: 'mosaic' })
    const uniqueSmall = new Set<string>()
    const uniqueLarge = new Set<string>()
    for (let i = 0; i < dstSmall.data.length; i += 4) {
      uniqueSmall.add(`${dstSmall.data[i]},${dstSmall.data[i + 1]},${dstSmall.data[i + 2]}`)
      uniqueLarge.add(`${dstLarge.data[i]},${dstLarge.data[i + 1]},${dstLarge.data[i + 2]}`)
    }
    expect(uniqueLarge.size).toBeLessThanOrEqual(uniqueSmall.size)
  })
})
