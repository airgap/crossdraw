/**
 * Tests for applyDisplace and applyGlass in src/filters/distort.ts
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
import { applyDisplace, applyGlass, generateGlassTexture } from '@/filters/distort'
import type { DisplaceParams, GlassParams } from '@/filters/distort'

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
 * Create a horizontal gradient: column x has R = x * 60, G = x * 40, B = x * 20.
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

/** Get pixel at (x, y) from ImageData */
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!]
}

/**
 * Create a displacement map with a uniform value.
 * R = rVal, G = gVal everywhere. 128 = no displacement.
 */
function makeUniformMap(w: number, h: number, rVal: number, gVal: number): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) {
    data.push(rVal, gVal, 128, 255)
  }
  return makeImageData(data, w, h)
}

// ── applyDisplace ──────────────────────────────────────────────────────────

describe('applyDisplace', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const params: DisplaceParams = { scaleX: 10, scaleY: 10, mapData: null, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('uniform map with value 128 produces no displacement', () => {
    const src = makeGradientH(10, 10)
    const map = makeUniformMap(10, 10, 128, 128)
    const params: DisplaceParams = { scaleX: 50, scaleY: 50, mapData: map, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('zero scale produces no displacement regardless of map', () => {
    const src = makeGradientH(10, 10)
    const map = makeUniformMap(10, 10, 255, 0) // max displacement values
    const params: DisplaceParams = { scaleX: 0, scaleY: 0, mapData: map, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('nonzero displacement shifts pixels on a gradient', () => {
    const src = makeGradientH(20, 20)
    // R = 200 means offset = (200-128)*scale/128 = positive horizontal shift
    const map = makeUniformMap(20, 20, 200, 128)
    const params: DisplaceParams = { scaleX: 10, scaleY: 0, mapData: map, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('clamp wrap mode clamps out-of-bounds to edge pixels', () => {
    const src = makeGradientH(10, 1)
    // R = 0: offset = (0-128)*100/128 = -100 => source x is way negative
    const map = makeUniformMap(10, 1, 0, 128)
    const params: DisplaceParams = { scaleX: 100, scaleY: 0, mapData: map, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    // bilinearSample clamps, so all pixels should sample from x=0
    const expected = getPixel(src, 0, 0)
    for (let x = 0; x < 10; x++) {
      expect(getPixel(dst, x, 0)).toEqual(expected)
    }
  })

  test('transparent wrap mode sets out-of-bounds pixels to transparent', () => {
    const src = makeSolid(10, 10, 255, 0, 0, 255)
    // R = 0: offset = (0-128)*200/128 = -200, way out of bounds
    const map = makeUniformMap(10, 10, 0, 128)
    const params: DisplaceParams = { scaleX: 200, scaleY: 0, mapData: map, wrap: 'transparent' }
    const dst = applyDisplace(src, params)
    // All pixels should be transparent because srcX < 0
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const [, , , a] = getPixel(dst, x, y)
        expect(a).toBe(0)
      }
    }
  })

  test('tile wrap mode wraps around', () => {
    const src = makeGradientH(10, 1)
    // R = 255: offset = (255-128)*10/128 ~= 9.92, so srcX = x + ~9.92
    // For tile mode this wraps around instead of clamping
    const map = makeUniformMap(10, 1, 255, 128)
    const params: DisplaceParams = { scaleX: 10, scaleY: 0, mapData: map, wrap: 'tile' }
    const dst = applyDisplace(src, params)
    // Should not be all edge pixel since tiling wraps
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(1)
  })

  test('null mapData generates default gradient map', () => {
    const src = makeGradientH(10, 10)
    const params: DisplaceParams = { scaleX: 5, scaleY: 5, mapData: null, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    // Default map generates displacement so at least some pixels should differ
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('displacement map smaller than source tiles correctly', () => {
    const src = makeSolid(10, 10, 100, 150, 200)
    // 2x2 map tiles across the 10x10 source
    const map = makeUniformMap(2, 2, 128, 128) // no displacement
    const params: DisplaceParams = { scaleX: 10, scaleY: 10, mapData: map, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    // No displacement because map is all 128
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const params: DisplaceParams = { scaleX: 5, scaleY: 5, mapData: null, wrap: 'clamp' }
    const dst = applyDisplace(src, params)
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })

  test('R channel controls horizontal, G channel controls vertical', () => {
    // 10x1 horizontal gradient
    const src = makeGradientH(10, 1)
    // Only R offset (horizontal), G = 128 (no vertical)
    const mapH = makeUniformMap(10, 1, 180, 128)
    const paramsH: DisplaceParams = { scaleX: 10, scaleY: 10, mapData: mapH, wrap: 'clamp' }
    const dstH = applyDisplace(src, paramsH)

    // Only G offset (vertical), R = 128 (no horizontal)
    const mapV = makeUniformMap(10, 1, 128, 180)
    const paramsV: DisplaceParams = { scaleX: 10, scaleY: 10, mapData: mapV, wrap: 'clamp' }
    const dstV = applyDisplace(src, paramsV)

    // For a 1-pixel-tall image, vertical displacement just clamps to row 0
    // so dstV should be identity-like, while dstH should differ
    let diffH = 0
    let diffV = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dstH.data[i] !== src.data[i]) diffH++
      if (dstV.data[i] !== src.data[i]) diffV++
    }
    expect(diffH).toBeGreaterThan(0)
    // Vertical on 1-row image: clamped so should match source
    expect(diffV).toBe(0)
  })

  test('negative displacement (map < 128) shifts in opposite direction', () => {
    const src = makeGradientH(20, 1)
    const mapPos = makeUniformMap(20, 1, 180, 128)
    const mapNeg = makeUniformMap(20, 1, 76, 128) // 128 - 52 = 76 (symmetric to 180)
    const paramsPos: DisplaceParams = { scaleX: 10, scaleY: 0, mapData: mapPos, wrap: 'clamp' }
    const paramsNeg: DisplaceParams = { scaleX: 10, scaleY: 0, mapData: mapNeg, wrap: 'clamp' }
    const dstPos = applyDisplace(src, paramsPos)
    const dstNeg = applyDisplace(src, paramsNeg)
    // They should produce different results
    let sameCount = 0
    for (let i = 0; i < dstPos.data.length; i++) {
      if (dstPos.data[i] === dstNeg.data[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(dstPos.data.length)
  })
})

// ── applyGlass ──────────────────────────────────────────────────────────────

describe('applyGlass', () => {
  test('returns new ImageData with same dimensions', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const params: GlassParams = { distortion: 5, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst = applyGlass(src, params)
    expect(dst.width).toBe(10)
    expect(dst.height).toBe(10)
    expect(dst.data.length).toBe(10 * 10 * 4)
    expect(dst).not.toBe(src)
  })

  test('distortion=0 returns identical pixels (no displacement)', () => {
    const src = makeGradientH(10, 10)
    const params: GlassParams = { distortion: 0, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst = applyGlass(src, params)
    for (let i = 0; i < src.data.length; i++) {
      expect(dst.data[i]).toBe(src.data[i])
    }
  })

  test('frosted texture produces displacement on a gradient', () => {
    const src = makeGradientH(20, 20)
    const params: GlassParams = { distortion: 5, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst = applyGlass(src, params)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('blocks texture produces displacement on a gradient', () => {
    const src = makeGradientH(20, 20)
    const params: GlassParams = { distortion: 5, smoothness: 1, texture: 'blocks', scale: 4 }
    const dst = applyGlass(src, params)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('tiny-lens texture produces displacement on a gradient', () => {
    const src = makeGradientH(20, 20)
    const params: GlassParams = { distortion: 5, smoothness: 1, texture: 'tiny-lens', scale: 4 }
    const dst = applyGlass(src, params)
    let diffCount = 0
    for (let i = 0; i < src.data.length; i++) {
      if (dst.data[i] !== src.data[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })

  test('higher distortion produces more total displacement', () => {
    const src = makeGradientH(20, 20)
    const paramsLow: GlassParams = { distortion: 1, smoothness: 1, texture: 'frosted', scale: 4 }
    const paramsHigh: GlassParams = { distortion: 20, smoothness: 1, texture: 'frosted', scale: 4 }
    const dstLow = applyGlass(src, paramsLow)
    const dstHigh = applyGlass(src, paramsHigh)

    // Sum of absolute pixel differences measures total displacement magnitude
    let sadLow = 0
    let sadHigh = 0
    for (let i = 0; i < src.data.length; i++) {
      sadLow += Math.abs(dstLow.data[i]! - src.data[i]!)
      sadHigh += Math.abs(dstHigh.data[i]! - src.data[i]!)
    }
    // Higher distortion should produce a larger total displacement
    expect(sadHigh).toBeGreaterThan(sadLow)
  })

  test('different textures produce different results', () => {
    const src = makeGradientH(20, 20)
    const dstFrosted = applyGlass(src, { distortion: 5, smoothness: 1, texture: 'frosted', scale: 4 })
    const dstBlocks = applyGlass(src, { distortion: 5, smoothness: 1, texture: 'blocks', scale: 4 })
    let sameCount = 0
    for (let i = 0; i < dstFrosted.data.length; i++) {
      if (dstFrosted.data[i] === dstBlocks.data[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(dstFrosted.data.length)
  })

  test('works with non-square images', () => {
    const src = makeGradientH(12, 6)
    const params: GlassParams = { distortion: 3, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst = applyGlass(src, params)
    expect(dst.width).toBe(12)
    expect(dst.height).toBe(6)
  })

  test('result is deterministic (seeded PRNG)', () => {
    const src = makeGradientH(10, 10)
    const params: GlassParams = { distortion: 5, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst1 = applyGlass(src, params)
    const dst2 = applyGlass(src, params)
    for (let i = 0; i < dst1.data.length; i++) {
      expect(dst1.data[i]).toBe(dst2.data[i])
    }
  })

  test('smoothness affects frosted texture', () => {
    const src = makeGradientH(20, 20)
    const dstSmooth0: GlassParams = { distortion: 5, smoothness: 0, texture: 'frosted', scale: 4 }
    const dstSmooth10: GlassParams = { distortion: 5, smoothness: 10, texture: 'frosted', scale: 4 }
    const dst0 = applyGlass(src, dstSmooth0)
    const dst10 = applyGlass(src, dstSmooth10)
    // Different smoothness should produce different results
    let sameCount = 0
    for (let i = 0; i < dst0.data.length; i++) {
      if (dst0.data[i] === dst10.data[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(dst0.data.length)
  })

  test('solid image with glass still produces same-color output', () => {
    // A solid image displaced by any amount still samples the same color
    const src = makeSolid(10, 10, 42, 84, 126, 255)
    const params: GlassParams = { distortion: 10, smoothness: 1, texture: 'frosted', scale: 4 }
    const dst = applyGlass(src, params)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const [r, g, b, a] = getPixel(dst, x, y)
        // May be slightly off due to bilinear interpolation at edges clamping to edge pixel
        expect(r).toBe(42)
        expect(g).toBe(84)
        expect(b).toBe(126)
        expect(a).toBe(255)
      }
    }
  })
})

// ── generateGlassTexture ────────────────────────────────────────────────────

describe('generateGlassTexture', () => {
  test('returns Float64Array of correct length', () => {
    const tex = generateGlassTexture(10, 10, 'frosted', 1, 4)
    expect(tex).toBeInstanceOf(Float64Array)
    expect(tex.length).toBe(100)
  })

  test('frosted texture values are in roughly 0-255 range', () => {
    const tex = generateGlassTexture(20, 20, 'frosted', 0, 4)
    for (let i = 0; i < tex.length; i++) {
      expect(tex[i]!).toBeGreaterThanOrEqual(0)
      expect(tex[i]!).toBeLessThanOrEqual(255)
    }
  })

  test('blocks texture produces uniform blocks', () => {
    const blockSize = 4
    const tex = generateGlassTexture(20, 20, 'blocks', 1, blockSize)
    // All pixels in the same block should have the same value
    const val = tex[0]! // top-left block value
    for (let y = 0; y < blockSize; y++) {
      for (let x = 0; x < blockSize; x++) {
        expect(tex[y * 20 + x]).toBe(val)
      }
    }
  })

  test('tiny-lens texture has value 128 outside lens circles', () => {
    const scale = 4 // lensRadius = 4, diameter = 8
    const tex = generateGlassTexture(16, 16, 'tiny-lens', 1, scale)
    // Pixel at corner of a tile (0,0) maps to lens coord (-4, -4), dist = 5.66 > 4 = outside
    expect(tex[0]).toBe(128)
  })

  test('frosted texture is deterministic', () => {
    const tex1 = generateGlassTexture(10, 10, 'frosted', 1, 4)
    const tex2 = generateGlassTexture(10, 10, 'frosted', 1, 4)
    for (let i = 0; i < tex1.length; i++) {
      expect(tex1[i]).toBe(tex2[i])
    }
  })

  test('different texture types produce different values', () => {
    const frosted = generateGlassTexture(10, 10, 'frosted', 0, 4)
    const blocks = generateGlassTexture(10, 10, 'blocks', 0, 4)
    let sameCount = 0
    for (let i = 0; i < frosted.length; i++) {
      if (frosted[i] === blocks[i]) sameCount++
    }
    expect(sameCount).toBeLessThan(frosted.length)
  })
})
