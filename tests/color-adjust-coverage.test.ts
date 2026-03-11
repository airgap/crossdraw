import { describe, test, expect } from 'bun:test'
import {
  applyPosterize,
  applyThreshold,
  applyInvert,
  applyDesaturate,
  applyVibrance,
  applyChannelMixer,
} from '@/filters/color-adjust'

// ── Helpers ──────────────────────────────────────────────────

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

// ── Coverage for lines 213-219: createImageData fallback ─────
// In bun:test, globalThis.ImageData is not defined as a function,
// so the fallback path (lines 214-219) runs every time createImageData is called.
// Every function that calls createImageData exercises this path.

describe('createImageData fallback (lines 213-219)', () => {
  test('applyPosterize returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(3, 3, 128, 128, 128)
    const result = applyPosterize(img, { levels: 4 })
    expect(result.width).toBe(3)
    expect(result.height).toBe(3)
    expect(result.data.length).toBe(3 * 3 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyThreshold returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyThreshold(img, { value: 128 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyInvert returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyInvert(img)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyDesaturate returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(2, 2, 200, 100, 50)
    const result = applyDesaturate(img)
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyVibrance returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(2, 2, 200, 100, 50)
    const result = applyVibrance(img, { amount: 0.5 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyChannelMixer returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(2, 2, 200, 100, 50)
    const result = applyChannelMixer(img, { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 4)
    expect(result.colorSpace).toBe('srgb')
  })
})

// ── Additional functional tests for completeness ──────────────

describe('applyPosterize', () => {
  test('posterize with 2 levels produces only 0 and 255', () => {
    const img = makeImageData([64, 128, 192, 255], 1, 1)
    const result = applyPosterize(img, { levels: 2 })
    for (let i = 0; i < 3; i++) {
      expect(result.data[i] === 0 || result.data[i] === 255).toBe(true)
    }
  })

  test('posterize preserves alpha', () => {
    const img = makeImageData([128, 128, 128, 100], 1, 1)
    const result = applyPosterize(img, { levels: 4 })
    expect(result.data[3]).toBe(100)
  })

  test('posterize with 256 levels is identity', () => {
    const img = makeImageData([37, 142, 201, 255], 1, 1)
    const result = applyPosterize(img, { levels: 256 })
    expect(result.data[0]).toBe(37)
    expect(result.data[1]).toBe(142)
    expect(result.data[2]).toBe(201)
  })

  test('posterize clamps levels to min 2', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const result = applyPosterize(img, { levels: 0 })
    // Should behave as levels=2
    expect(result.data[0] === 0 || result.data[0] === 255).toBe(true)
  })
})

describe('applyThreshold', () => {
  test('bright pixels become white', () => {
    const img = makeImageData([200, 200, 200, 255], 1, 1)
    const result = applyThreshold(img, { value: 100 })
    expect(result.data[0]).toBe(255)
    expect(result.data[1]).toBe(255)
    expect(result.data[2]).toBe(255)
  })

  test('dark pixels become black', () => {
    const img = makeImageData([30, 30, 30, 255], 1, 1)
    const result = applyThreshold(img, { value: 100 })
    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(0)
    expect(result.data[2]).toBe(0)
  })

  test('threshold preserves alpha', () => {
    const img = makeImageData([200, 200, 200, 100], 1, 1)
    const result = applyThreshold(img, { value: 100 })
    expect(result.data[3]).toBe(100)
  })
})

describe('applyInvert', () => {
  test('inverts all channels', () => {
    const img = makeImageData([0, 128, 255, 255], 1, 1)
    const result = applyInvert(img)
    expect(result.data[0]).toBe(255)
    expect(result.data[1]).toBe(127)
    expect(result.data[2]).toBe(0)
  })

  test('preserves alpha', () => {
    const img = makeImageData([100, 100, 100, 50], 1, 1)
    const result = applyInvert(img)
    expect(result.data[3]).toBe(50)
  })

  test('double invert is identity', () => {
    const img = makeImageData([37, 142, 201, 200], 1, 1)
    const result1 = applyInvert(img)
    const result2 = applyInvert(result1)
    expect(result2.data[0]).toBe(37)
    expect(result2.data[1]).toBe(142)
    expect(result2.data[2]).toBe(201)
    expect(result2.data[3]).toBe(200)
  })
})

describe('applyDesaturate', () => {
  test('grey pixel stays grey', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const result = applyDesaturate(img)
    expect(result.data[0]).toBe(128)
    expect(result.data[1]).toBe(128)
    expect(result.data[2]).toBe(128)
  })

  test('colored pixel becomes grey', () => {
    const img = makeImageData([255, 0, 0, 255], 1, 1)
    const result = applyDesaturate(img)
    const lum = Math.round(0.2126 * 255 + 0.7152 * 0 + 0.0722 * 0)
    expect(result.data[0]).toBe(lum)
    expect(result.data[1]).toBe(lum)
    expect(result.data[2]).toBe(lum)
  })

  test('preserves alpha', () => {
    const img = makeImageData([255, 0, 0, 100], 1, 1)
    const result = applyDesaturate(img)
    expect(result.data[3]).toBe(100)
  })
})

describe('applyVibrance', () => {
  test('amount=0 leaves pixels unchanged', () => {
    const img = makeImageData([200, 100, 50, 255], 1, 1)
    const result = applyVibrance(img, { amount: 0 })
    expect(result.data[0]).toBe(200)
    expect(result.data[1]).toBe(100)
    expect(result.data[2]).toBe(50)
  })

  test('positive amount boosts saturation of less-saturated pixels', () => {
    // Grey-ish pixel (low saturation)
    const img = makeImageData([130, 120, 125, 255], 1, 1)
    const result = applyVibrance(img, { amount: 1 })
    // The channels should move further from the average
    // At least one channel should differ from the original
    expect(result.data[0] !== 130 || result.data[1] !== 120 || result.data[2] !== 125).toBe(true)
  })

  test('preserves alpha', () => {
    const img = makeImageData([200, 100, 50, 77], 1, 1)
    const result = applyVibrance(img, { amount: 0.5 })
    expect(result.data[3]).toBe(77)
  })

  test('grey pixel (zero saturation) gets maximum boost', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const result = applyVibrance(img, { amount: 0.5 })
    // For a perfectly grey pixel, sat=0, boost = 0.5 * (1 - 0) = 0.5
    // But avg == each channel, so (r - avg) * boost = 0, meaning no change
    expect(result.data[0]).toBe(128)
    expect(result.data[1]).toBe(128)
    expect(result.data[2]).toBe(128)
  })
})

describe('applyChannelMixer', () => {
  test('identity matrix leaves pixels unchanged', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyChannelMixer(img, { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('swap red and blue channels', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyChannelMixer(img, { rr: 0, rg: 0, rb: 1, gr: 0, gg: 1, gb: 0, br: 1, bg: 0, bb: 0 })
    expect(result.data[0]).toBe(200) // red = old blue
    expect(result.data[1]).toBe(150) // green unchanged
    expect(result.data[2]).toBe(100) // blue = old red
  })

  test('output is clamped to 0-255', () => {
    const img = makeImageData([200, 200, 200, 255], 1, 1)
    const result = applyChannelMixer(img, { rr: 2, rg: 0, rb: 0, gr: 0, gg: 2, gb: 0, br: 0, bg: 0, bb: 2 })
    expect(result.data[0]).toBe(255)
    expect(result.data[1]).toBe(255)
    expect(result.data[2]).toBe(255)
  })

  test('preserves alpha', () => {
    const img = makeImageData([100, 150, 200, 80], 1, 1)
    const result = applyChannelMixer(img, { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 })
    expect(result.data[3]).toBe(80)
  })

  test('negative coefficients clamp to 0', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyChannelMixer(img, { rr: -1, rg: 0, rb: 0, gr: 0, gg: -1, gb: 0, br: 0, bg: 0, bb: -1 })
    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(0)
    expect(result.data[2]).toBe(0)
  })
})
