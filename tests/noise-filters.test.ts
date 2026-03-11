import { describe, test, expect } from 'bun:test'
import { applyGaussianNoise, applyUniformNoise, applyFilmGrain } from '@/filters/noise'

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

function cloneData(img: ImageData): Uint8ClampedArray {
  return new Uint8ClampedArray(img.data)
}

// ── applyGaussianNoise ───────────────────────────────────────

describe('applyGaussianNoise', () => {
  test('amount=0 leaves pixels unchanged', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const before = cloneData(img)
    applyGaussianNoise(img, 0, false, 42)
    // With sigma=0, noise is 0 — pixels stay the same (modulo rounding)
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('monochrome=true applies same noise to R, G, B channels', () => {
    // Use a grey pixel so the same offset applies equally
    const img = makeSolid(4, 4, 128, 128, 128)
    applyGaussianNoise(img, 50, true, 99)
    // For each pixel, R, G, B should be identical (same noise value)
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(img.data[i + 1])
      expect(img.data[i + 1]).toBe(img.data[i + 2])
    }
  })

  test('monochrome=false allows different noise per channel', () => {
    const img = makeSolid(8, 8, 128, 128, 128)
    applyGaussianNoise(img, 80, false, 7)
    // At least some pixels should have differing R, G, B
    let anyDifferent = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== img.data[i + 1] || img.data[i + 1] !== img.data[i + 2]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('alpha channel is never modified', () => {
    const img = makeSolid(3, 3, 100, 100, 100, 200)
    applyGaussianNoise(img, 100, false, 1)
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(200)
    }
  })

  test('output is clamped to 0-255', () => {
    // Pure white pixel with high noise amount — additions clamp at 255
    const img = makeSolid(4, 4, 255, 255, 255)
    applyGaussianNoise(img, 100, true, 42)
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }

    // Pure black pixel — subtractions clamp at 0
    const img2 = makeSolid(4, 4, 0, 0, 0)
    applyGaussianNoise(img2, 100, true, 42)
    for (let i = 0; i < img2.data.length; i += 4) {
      expect(img2.data[i]).toBeGreaterThanOrEqual(0)
      expect(img2.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('same seed produces identical results', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    applyGaussianNoise(img1, 50, false, 12345)
    applyGaussianNoise(img2, 50, false, 12345)
    for (let i = 0; i < img1.data.length; i++) {
      expect(img1.data[i]).toBe(img2.data[i])
    }
  })

  test('different seeds produce different results', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    applyGaussianNoise(img1, 50, false, 100)
    applyGaussianNoise(img2, 50, false, 200)
    let anyDifferent = false
    for (let i = 0; i < img1.data.length; i++) {
      if (img1.data[i] !== img2.data[i]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('high amount actually modifies pixels', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const before = cloneData(img)
    applyGaussianNoise(img, 100, false, 42)
    let anyChanged = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== before[i]) {
        anyChanged = true
        break
      }
    }
    expect(anyChanged).toBe(true)
  })

  test('works on a 1x1 image', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    applyGaussianNoise(img, 50, true, 1)
    expect(img.data[3]).toBe(255) // alpha unchanged
    expect(img.data[0]).toBe(img.data[1]) // monochrome
  })
})

// ── applyUniformNoise ────────────────────────────────────────

describe('applyUniformNoise', () => {
  test('amount=0 leaves pixels unchanged', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const before = cloneData(img)
    applyUniformNoise(img, 0, false, 42)
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('monochrome=true applies same noise to R, G, B channels', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    applyUniformNoise(img, 50, true, 99)
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(img.data[i + 1])
      expect(img.data[i + 1]).toBe(img.data[i + 2])
    }
  })

  test('monochrome=false allows different noise per channel', () => {
    const img = makeSolid(8, 8, 128, 128, 128)
    applyUniformNoise(img, 80, false, 7)
    let anyDifferent = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== img.data[i + 1] || img.data[i + 1] !== img.data[i + 2]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('alpha channel is never modified', () => {
    const img = makeSolid(3, 3, 100, 100, 100, 180)
    applyUniformNoise(img, 100, false, 1)
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(180)
    }
  })

  test('output is clamped to 0-255', () => {
    const img = makeSolid(4, 4, 255, 255, 255)
    applyUniformNoise(img, 100, true, 42)
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }

    const img2 = makeSolid(4, 4, 0, 0, 0)
    applyUniformNoise(img2, 100, true, 42)
    for (let i = 0; i < img2.data.length; i += 4) {
      expect(img2.data[i]).toBeGreaterThanOrEqual(0)
      expect(img2.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('same seed produces identical results', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    applyUniformNoise(img1, 50, false, 12345)
    applyUniformNoise(img2, 50, false, 12345)
    for (let i = 0; i < img1.data.length; i++) {
      expect(img1.data[i]).toBe(img2.data[i])
    }
  })

  test('noise range scales with amount', () => {
    // At amount=100, range is +/-128, so a mid-grey pixel (128) can vary widely
    const img = makeSolid(16, 16, 128, 128, 128)
    applyUniformNoise(img, 100, true, 42)
    let minVal = 255
    let maxVal = 0
    for (let i = 0; i < img.data.length; i += 4) {
      minVal = Math.min(minVal, img.data[i]!)
      maxVal = Math.max(maxVal, img.data[i]!)
    }
    // Should have a decent spread
    expect(maxVal - minVal).toBeGreaterThan(30)
  })

  test('works on a 1x1 image', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    applyUniformNoise(img, 50, false, 1)
    expect(img.data[3]).toBe(255) // alpha unchanged
  })
})

// ── applyFilmGrain ───────────────────────────────────────────

describe('applyFilmGrain', () => {
  test('amount=0 leaves pixels unchanged', () => {
    const img = makeSolid(3, 3, 128, 128, 128)
    const before = cloneData(img)
    applyFilmGrain(img, 0, 1, 42)
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('film grain applies monochrome noise (R=G=B shift)', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    applyFilmGrain(img, 50, 1, 42)
    // Film grain is monochrome by design — same noise added to R, G, B
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(img.data[i + 1])
      expect(img.data[i + 1]).toBe(img.data[i + 2])
    }
  })

  test('alpha channel is never modified', () => {
    const img = makeSolid(3, 3, 100, 100, 100, 210)
    applyFilmGrain(img, 60, 2, 1)
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(210)
    }
  })

  test('size=1 means no blur (raw noise)', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    applyFilmGrain(img1, 50, 1, 42)
    // Just check that it ran without errors and modified pixels
    let anyChanged = false
    for (let i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== 128) {
        anyChanged = true
        break
      }
    }
    expect(anyChanged).toBe(true)
  })

  test('size>1 applies blur to noise field (larger grain clumps)', () => {
    const img = makeSolid(8, 8, 128, 128, 128)
    applyFilmGrain(img, 80, 3, 42)
    // Should run without error and modify pixels
    let anyChanged = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== 128) {
        anyChanged = true
        break
      }
    }
    expect(anyChanged).toBe(true)
  })

  test('size=5 (max blur passes) works correctly', () => {
    const img = makeSolid(6, 6, 128, 128, 128)
    applyFilmGrain(img, 70, 5, 42)
    // With heavy blur, adjacent pixels should be somewhat similar
    // Just verify it completes and produces valid values
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('size clamped to max 5', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    // size=10 should be clamped to 5 (same as size=5)
    applyFilmGrain(img1, 50, 10, 42)
    applyFilmGrain(img2, 50, 5, 42)
    for (let i = 0; i < img1.data.length; i++) {
      expect(img1.data[i]).toBe(img2.data[i])
    }
  })

  test('same seed produces identical results', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    applyFilmGrain(img1, 50, 2, 12345)
    applyFilmGrain(img2, 50, 2, 12345)
    for (let i = 0; i < img1.data.length; i++) {
      expect(img1.data[i]).toBe(img2.data[i])
    }
  })

  test('different seeds produce different results', () => {
    const img1 = makeSolid(4, 4, 128, 128, 128)
    const img2 = makeSolid(4, 4, 128, 128, 128)
    applyFilmGrain(img1, 50, 2, 100)
    applyFilmGrain(img2, 50, 2, 200)
    let anyDifferent = false
    for (let i = 0; i < img1.data.length; i++) {
      if (img1.data[i] !== img2.data[i]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('output is clamped to 0-255', () => {
    const img = makeSolid(6, 6, 0, 0, 0)
    applyFilmGrain(img, 100, 3, 42)
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('works on a 1x1 image with blur', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    applyFilmGrain(img, 50, 3, 42)
    expect(img.data[3]).toBe(255) // alpha unchanged
  })

  test('high amount on white pixels', () => {
    const img = makeSolid(4, 4, 255, 255, 255)
    applyFilmGrain(img, 100, 1, 42)
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }
  })
})
