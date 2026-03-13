import { describe, test, expect } from 'bun:test'
import { computeLuminosityMask, computeHueMask, applyRangeMask, computeRangeMask } from '@/effects/range-masks'
import type { LuminosityRangeMask, HueRangeMask, RangeMask } from '@/effects/range-masks'

// ── Helper: create an ImageData-like object ──────────────────

function makeImageData(width: number, height: number, pixels: number[]): ImageData {
  const data = new Uint8ClampedArray(pixels)
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

/** Create a single-pixel ImageData from RGBA. */
function pixel(r: number, g: number, b: number, a = 255): ImageData {
  return makeImageData(1, 1, [r, g, b, a])
}

/** Create a 4-pixel (2x2) image from an array of [r,g,b,a] tuples. */
function fourPixels(pixels: [number, number, number, number][]): ImageData {
  const flat = pixels.flatMap((p) => p)
  return makeImageData(2, 2, flat)
}

// ── computeLuminosityMask ────────────────────────────────────

describe('computeLuminosityMask', () => {
  test('bright pixel within range → 255', () => {
    const img = pixel(200, 200, 200)
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 100, max: 255, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('dark pixel outside range → 0', () => {
    const img = pixel(10, 10, 10)
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 100, max: 255, feather: 0 })
    expect(mask[0]).toBe(0)
  })

  test('pixel at exact min boundary → 255', () => {
    // Luminance of (128,128,128) ≈ 128
    const img = pixel(128, 128, 128)
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 128, max: 255, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('pixel at exact max boundary → 255', () => {
    const img = pixel(128, 128, 128)
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 0, max: 128, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('feather produces gradient below min', () => {
    // Luminance ≈ 50
    const img = pixel(50, 50, 50)
    const params: LuminosityRangeMask = { type: 'luminosity-range', min: 100, max: 200, feather: 60 }
    const mask = computeLuminosityMask(img, params)
    // 50 is 50 below min(100), feather is 60, so: 1 - 50/60 ≈ 0.167 → ~42
    expect(mask[0]).toBeGreaterThan(0)
    expect(mask[0]).toBeLessThan(255)
  })

  test('feather produces gradient above max', () => {
    // Luminance ≈ 230
    const img = pixel(230, 230, 230)
    const params: LuminosityRangeMask = { type: 'luminosity-range', min: 50, max: 200, feather: 50 }
    const mask = computeLuminosityMask(img, params)
    // 230 is 30 above max(200), feather is 50, so: 1 - 30/50 = 0.4 → ~102
    expect(mask[0]).toBeGreaterThan(0)
    expect(mask[0]).toBeLessThan(255)
  })

  test('pixel far outside feather zone → 0', () => {
    const img = pixel(5, 5, 5)
    const params: LuminosityRangeMask = { type: 'luminosity-range', min: 200, max: 255, feather: 10 }
    const mask = computeLuminosityMask(img, params)
    expect(mask[0]).toBe(0)
  })

  test('full range 0-255 → all 255', () => {
    const img = fourPixels([
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
      [64, 200, 30, 255],
    ])
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 0, max: 255, feather: 0 })
    for (let i = 0; i < 4; i++) {
      expect(mask[i]).toBe(255)
    }
  })

  test('narrow range isolates specific luminance band', () => {
    const img = fourPixels([
      [200, 200, 200, 255], // lum ≈ 200 → in range
      [100, 100, 100, 255], // lum ≈ 100 → out of range
      [0, 0, 0, 255], // black → out of range
      [128, 128, 128, 255], // mid → out of range
    ])
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 195, max: 205, feather: 0 })
    expect(mask[0]).toBe(255) // in range
    expect(mask[1]).toBe(0) // out of range
    expect(mask[2]).toBe(0) // black
    expect(mask[3]).toBe(0) // mid-gray
  })

  test('multiple pixels — shadows only', () => {
    const img = fourPixels([
      [20, 20, 20, 255], // dark → selected
      [200, 200, 200, 255], // bright → not selected
      [50, 50, 50, 255], // dark → selected
      [128, 128, 128, 255], // mid → not selected
    ])
    const mask = computeLuminosityMask(img, { type: 'luminosity-range', min: 0, max: 60, feather: 0 })
    expect(mask[0]).toBe(255)
    expect(mask[1]).toBe(0)
    expect(mask[2]).toBe(255)
    expect(mask[3]).toBe(0)
  })
})

// ── computeHueMask ───────────────────────────────────────────

describe('computeHueMask', () => {
  test('pure red pixel with red center hue → 255', () => {
    const img = pixel(255, 0, 0)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 30, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('pure green pixel with red center hue → 0', () => {
    const img = pixel(0, 255, 0)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 30, feather: 0 })
    expect(mask[0]).toBe(0)
  })

  test('pure blue pixel with blue center hue → 255', () => {
    const img = pixel(0, 0, 255)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 240, range: 30, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('achromatic (gray) pixel → 0 regardless of hue settings', () => {
    const img = pixel(128, 128, 128)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 180, feather: 60 })
    expect(mask[0]).toBe(0)
  })

  test('pure white → 0 (achromatic)', () => {
    const img = pixel(255, 255, 255)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 180, feather: 60 })
    expect(mask[0]).toBe(0)
  })

  test('pure black → 0 (achromatic)', () => {
    const img = pixel(0, 0, 0)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 180, feather: 60 })
    expect(mask[0]).toBe(0)
  })

  test('hue wrapping: red hue (0/360) with center at 350, range 30', () => {
    // Pure red = hue 0, center 350, range 30 → distance = 10 < 30 → selected
    const img = pixel(255, 0, 0)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 350, range: 30, feather: 0 })
    expect(mask[0]).toBe(255)
  })

  test('feather produces gradient at edge', () => {
    // Pure yellow ≈ hue 60. Center 0, range 30 → dist 60, outside by 30.
    // With feather 40 → 1 - 30/40 = 0.25 → ~64
    const img = pixel(255, 255, 0)
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 30, feather: 40 })
    expect(mask[0]).toBeGreaterThan(0)
    expect(mask[0]).toBeLessThan(255)
  })

  test('full hue range (180) selects all chromatic pixels', () => {
    const img = fourPixels([
      [255, 0, 0, 255], // red
      [0, 255, 0, 255], // green
      [0, 0, 255, 255], // blue
      [255, 255, 0, 255], // yellow
    ])
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 0, range: 180, feather: 0 })
    for (let i = 0; i < 4; i++) {
      expect(mask[i]).toBe(255)
    }
  })

  test('narrow range isolates single hue', () => {
    const img = fourPixels([
      [255, 0, 0, 255], // red hue=0
      [0, 255, 0, 255], // green hue=120
      [0, 0, 255, 255], // blue hue=240
      [255, 255, 0, 255], // yellow hue=60
    ])
    // Only select green (hue 120) with narrow range
    const mask = computeHueMask(img, { type: 'hue-range', centerHue: 120, range: 10, feather: 0 })
    expect(mask[0]).toBe(0) // red
    expect(mask[1]).toBe(255) // green
    expect(mask[2]).toBe(0) // blue
    expect(mask[3]).toBe(0) // yellow
  })
})

// ── applyRangeMask ───────────────────────────────────────────

describe('applyRangeMask', () => {
  test('mask=255 → fully filtered', () => {
    const original = pixel(100, 100, 100)
    const filtered = pixel(200, 200, 200)
    const mask = new Uint8Array([255])
    const result = applyRangeMask(original, filtered, mask)
    expect(result.data[0]).toBe(200)
    expect(result.data[1]).toBe(200)
    expect(result.data[2]).toBe(200)
  })

  test('mask=0 → fully original', () => {
    const original = pixel(100, 100, 100)
    const filtered = pixel(200, 200, 200)
    const mask = new Uint8Array([0])
    const result = applyRangeMask(original, filtered, mask)
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(100)
    expect(result.data[2]).toBe(100)
  })

  test('mask=128 → 50% blend', () => {
    const original = pixel(0, 0, 0)
    const filtered = pixel(200, 100, 50)
    const mask = new Uint8Array([128])
    const result = applyRangeMask(original, filtered, mask)
    // t = 128/255 ≈ 0.502
    const t = 128 / 255
    expect(result.data[0]).toBe(Math.round(200 * t))
    expect(result.data[1]).toBe(Math.round(100 * t))
    expect(result.data[2]).toBe(Math.round(50 * t))
  })

  test('alpha channel is also blended', () => {
    const original = pixel(100, 100, 100, 255)
    const filtered = pixel(200, 200, 200, 128)
    const mask = new Uint8Array([255])
    const result = applyRangeMask(original, filtered, mask)
    expect(result.data[3]).toBe(128) // fully filtered alpha
  })

  test('multi-pixel blending', () => {
    const original = fourPixels([
      [0, 0, 0, 255],
      [50, 50, 50, 255],
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ])
    const filtered = fourPixels([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ])
    const mask = new Uint8Array([255, 128, 0, 255])
    const result = applyRangeMask(original, filtered, mask)
    // Pixel 0: fully filtered → 255
    expect(result.data[0]).toBe(255)
    // Pixel 1: partial blend
    const t = 128 / 255
    expect(result.data[4]).toBe(Math.round(50 * (1 - t) + 255 * t))
    // Pixel 2: fully original → 100
    expect(result.data[8]).toBe(100)
    // Pixel 3: fully filtered → 255
    expect(result.data[12]).toBe(255)
  })
})

// ── computeRangeMask (dispatch) ──────────────────────────────

describe('computeRangeMask', () => {
  test('dispatches luminosity-range correctly', () => {
    const img = pixel(200, 200, 200)
    const config: RangeMask = { type: 'luminosity-range', min: 100, max: 255, feather: 0 }
    const mask = computeRangeMask(img, config)
    expect(mask[0]).toBe(255)
  })

  test('dispatches hue-range correctly', () => {
    const img = pixel(255, 0, 0)
    const config: RangeMask = { type: 'hue-range', centerHue: 0, range: 30, feather: 0 }
    const mask = computeRangeMask(img, config)
    expect(mask[0]).toBe(255)
  })
})

// ── Integration-style tests ──────────────────────────────────

describe('range mask integration', () => {
  test('luminosity mask + blend: filter only highlights', () => {
    // 4 pixels: dark, mid-dark, mid-bright, bright
    const original = fourPixels([
      [20, 20, 20, 255],
      [80, 80, 80, 255],
      [180, 180, 180, 255],
      [240, 240, 240, 255],
    ])
    // Simulate an invert filter
    const filtered = fourPixels([
      [235, 235, 235, 255],
      [175, 175, 175, 255],
      [75, 75, 75, 255],
      [15, 15, 15, 255],
    ])

    // Only apply to highlights (luminance 150-255, no feather)
    const maskConfig: LuminosityRangeMask = { type: 'luminosity-range', min: 150, max: 255, feather: 0 }
    const mask = computeLuminosityMask(original, maskConfig)

    // Dark pixels should be mask=0, bright pixels mask=255
    expect(mask[0]).toBe(0) // lum≈20
    expect(mask[1]).toBe(0) // lum≈80
    expect(mask[2]).toBe(255) // lum≈180
    expect(mask[3]).toBe(255) // lum≈240

    const result = applyRangeMask(original, filtered, mask)
    // Dark pixels unchanged
    expect(result.data[0]).toBe(20)
    expect(result.data[4]).toBe(80)
    // Bright pixels inverted
    expect(result.data[8]).toBe(75)
    expect(result.data[12]).toBe(15)
  })

  test('hue mask + blend: filter only red channel pixels', () => {
    const original = fourPixels([
      [220, 30, 30, 255], // red
      [30, 220, 30, 255], // green
      [30, 30, 220, 255], // blue
      [220, 220, 30, 255], // yellow
    ])
    // Simulate desaturation
    const filtered = fourPixels([
      [128, 128, 128, 255],
      [128, 128, 128, 255],
      [128, 128, 128, 255],
      [128, 128, 128, 255],
    ])

    // Only desaturate reds (center 0, range 30)
    const maskConfig: HueRangeMask = { type: 'hue-range', centerHue: 0, range: 30, feather: 0 }
    const mask = computeHueMask(original, maskConfig)

    expect(mask[0]).toBe(255) // red → selected
    expect(mask[1]).toBe(0) // green → not selected
    expect(mask[2]).toBe(0) // blue → not selected
    expect(mask[3]).toBe(0) // yellow hue ≈ 60, outside range 30

    const result = applyRangeMask(original, filtered, mask)
    // Red pixel desaturated
    expect(result.data[0]).toBe(128)
    expect(result.data[1]).toBe(128)
    expect(result.data[2]).toBe(128)
    // Green pixel unchanged
    expect(result.data[4]).toBe(30)
    expect(result.data[5]).toBe(220)
    expect(result.data[6]).toBe(30)
    // Blue pixel unchanged
    expect(result.data[8]).toBe(30)
    expect(result.data[9]).toBe(30)
    expect(result.data[10]).toBe(220)
  })

  test('feathered luminosity mask produces smooth transition', () => {
    // Gradient from dark to bright: 0, 85, 170, 255
    const original = fourPixels([
      [0, 0, 0, 255],
      [85, 85, 85, 255],
      [170, 170, 170, 255],
      [255, 255, 255, 255],
    ])

    // Midtone selection with feather
    const maskConfig: LuminosityRangeMask = { type: 'luminosity-range', min: 100, max: 200, feather: 50 }
    const mask = computeLuminosityMask(original, maskConfig)

    // Pixel 0 (lum=0): far below min-feather (100-50=50) → 0
    expect(mask[0]).toBe(0)
    // Pixel 1 (lum=85): in feather zone below min (85 > 50, 85 < 100) → partial
    expect(mask[1]).toBeGreaterThan(0)
    expect(mask[1]).toBeLessThan(255)
    // Pixel 2 (lum=170): within range [100, 200] → 255
    expect(mask[2]).toBe(255)
    // Pixel 3 (lum=255): above max+feather (200+50=250) → 0
    expect(mask[3]).toBe(0)
  })
})
