import { describe, test, expect } from 'bun:test'
import { applySharpen } from '@/filters/sharpen'

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

// ── Tests ────────────────────────────────────────────────────

describe('applySharpen', () => {
  test('radius=0 returns unchanged copy', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const result = applySharpen(img, { amount: 2, radius: 0, threshold: 0 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
    // Should be a copy, not the same object
    expect(result).not.toBe(img)
  })

  test('amount=0 returns unchanged copy', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const result = applySharpen(img, { amount: 0, radius: 2, threshold: 0 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('sharpening modifies edges in the image', () => {
    // Create a simple edge: left half dark, right half bright
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 50 : 200
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)
    const result = applySharpen(img, { amount: 2, radius: 1, threshold: 0 })
    // The result should differ from the original at edge pixels
    let anyDifferent = false
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] !== img.data[i]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('preserves alpha channel', () => {
    const img = makeSolid(3, 3, 100, 150, 200, 180)
    const result = applySharpen(img, { amount: 1.5, radius: 1, threshold: 0 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })

  test('threshold suppresses sharpening on small differences', () => {
    // Create an image where differences are small (all pixels close in value)
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = 128 + (x % 2 === 0 ? 2 : -2) // values differ by only 4
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)
    // Set threshold high enough that no sharpening occurs
    const result = applySharpen(img, { amount: 5, radius: 1, threshold: 100 })
    // With high threshold, pixels below threshold are copied unchanged
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(img.data[i])
      expect(result.data[i + 1]).toBe(img.data[i + 1])
      expect(result.data[i + 2]).toBe(img.data[i + 2])
    }
  })

  test('output values are clamped to 0-255', () => {
    // Sharp edge that will produce extreme values
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 0 : 255
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)
    const result = applySharpen(img, { amount: 10, radius: 1, threshold: 0 })
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('returns new ImageData (does not modify original)', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const originalData = new Uint8ClampedArray(img.data)
    const result = applySharpen(img, { amount: 2, radius: 1, threshold: 0 })
    // Original should be unchanged
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(originalData[i])
    }
    expect(result).not.toBe(img)
  })

  // ── Coverage for lines 81-87: createImageData fallback ────
  // The createImageData function at lines 78-88 has a fallback path
  // for non-browser environments. Since bun:test doesn't have ImageData,
  // the fallback is what actually runs — exercising lines 82-87.
  test('createImageData fallback produces correct dimensions', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const result = applySharpen(img, { amount: 1, radius: 1, threshold: 0 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    expect(result.data.length).toBe(4 * 4 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('negative radius is treated as zero (no sharpening)', () => {
    const img = makeSolid(3, 3, 100, 100, 100)
    const result = applySharpen(img, { amount: 2, radius: -1, threshold: 0 })
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
  })

  test('large radius on small image', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    // Large radius should still work on a small image
    const result = applySharpen(img, { amount: 1, radius: 10, threshold: 0 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })
})
