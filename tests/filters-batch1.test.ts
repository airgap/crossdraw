import { describe, test, expect } from 'bun:test'
import { applyBoxBlur } from '@/filters/box-blur'
import { applySurfaceBlur } from '@/filters/surface-blur'
import { applyEmboss } from '@/filters/emboss'
import { applyFindEdges } from '@/filters/find-edges'
import { applySolarize } from '@/filters/solarize'
import { applyWind } from '@/filters/wind'

// ── Helpers ──────────────────────────────────────────────────

function makeImageData(w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const img = makeImageData(w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r
    img.data[i + 1] = g
    img.data[i + 2] = b
    img.data[i + 3] = a
  }
  return img
}

function cloneData(img: ImageData): Uint8ClampedArray {
  return new Uint8ClampedArray(img.data)
}

// ── Box Blur ─────────────────────────────────────────────────

describe('applyBoxBlur', () => {
  test('radius=0 returns an identical copy', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applyBoxBlur(img, { radius: 0 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('does not mutate original', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    applyBoxBlur(img, { radius: 1 })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('blur averages pixel values', () => {
    const img = makeImageData(3, 3)
    // Set centre pixel to white, rest black
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = 255 // alpha
    }
    const cx = (1 * 3 + 1) * 4
    img.data[cx] = 255
    img.data[cx + 1] = 255
    img.data[cx + 2] = 255

    const result = applyBoxBlur(img, { radius: 1 })
    // After blur, centre should be less than 255
    const rc = (1 * 3 + 1) * 4
    expect(result.data[rc]!).toBeLessThan(255)
    expect(result.data[rc]!).toBeGreaterThan(0)
  })

  test('returns new ImageData, not the same reference', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applyBoxBlur(img, { radius: 1 })
    expect(result).not.toBe(img)
  })

  test('preserves alpha channel', () => {
    const img = makeSolid(4, 4, 100, 100, 100, 200)
    const result = applyBoxBlur(img, { radius: 1 })
    // Alpha should be approximately 200 (uniform, so blur preserves it)
    for (let i = 3; i < result.data.length; i += 4) {
      expect(Math.abs(result.data[i]! - 200)).toBeLessThanOrEqual(1)
    }
  })
})

// ── Surface Blur ─────────────────────────────────────────────

describe('applySurfaceBlur', () => {
  test('radius=0 returns identical copy', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applySurfaceBlur(img, { radius: 0, threshold: 50 })
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('threshold=0 returns identical copy', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applySurfaceBlur(img, { radius: 2, threshold: 0 })
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('uniform image remains unchanged', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const result = applySurfaceBlur(img, { radius: 2, threshold: 50 })
    for (let i = 0; i < img.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
      expect(result.data[i + 1]).toBe(128)
      expect(result.data[i + 2]).toBe(128)
    }
  })

  test('preserves hard edges (high contrast below threshold)', () => {
    // Create a 4x4 image with left half black, right half white
    const img = makeImageData(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = (y * 4 + x) * 4
        const val = x < 2 ? 0 : 255
        img.data[idx] = val
        img.data[idx + 1] = val
        img.data[idx + 2] = val
        img.data[idx + 3] = 255
      }
    }
    // With a low threshold, edges should be preserved
    const result = applySurfaceBlur(img, { radius: 1, threshold: 10 })
    // Black region centre should stay black (or very close)
    const blackIdx = (1 * 4 + 0) * 4
    expect(result.data[blackIdx]!).toBeLessThan(10)
    // White region centre should stay white (or very close)
    const whiteIdx = (1 * 4 + 3) * 4
    expect(result.data[whiteIdx]!).toBeGreaterThan(245)
  })

  test('does not mutate original', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    applySurfaceBlur(img, { radius: 2, threshold: 50 })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('preserves alpha', () => {
    const img = makeSolid(4, 4, 100, 100, 100, 180)
    const result = applySurfaceBlur(img, { radius: 1, threshold: 50 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })
})

// ── Emboss ───────────────────────────────────────────────────

describe('applyEmboss', () => {
  test('amount=0 returns identical copy', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applyEmboss(img, { angle: 0, height: 1, amount: 0 })
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('uniform image produces neutral grey at full amount', () => {
    const img = makeSolid(5, 5, 128, 128, 128)
    const result = applyEmboss(img, { angle: 45, height: 1, amount: 1 })
    // On a uniform image, convolution gradients are ~0, so result ~128 (bias)
    const cx = (2 * 5 + 2) * 4
    expect(Math.abs(result.data[cx]! - 128)).toBeLessThanOrEqual(2)
  })

  test('does not mutate original', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    applyEmboss(img, { angle: 0, height: 1, amount: 1 })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('preserves alpha', () => {
    const img = makeSolid(4, 4, 100, 100, 100, 200)
    const result = applyEmboss(img, { angle: 45, height: 1, amount: 1 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(200)
    }
  })

  test('produces visible effect on gradient image', () => {
    // Horizontal gradient 0..255
    const img = makeImageData(8, 1)
    for (let x = 0; x < 8; x++) {
      const v = Math.round((x / 7) * 255)
      img.data[x * 4] = v
      img.data[x * 4 + 1] = v
      img.data[x * 4 + 2] = v
      img.data[x * 4 + 3] = 255
    }
    const result = applyEmboss(img, { angle: 0, height: 1, amount: 1 })
    // Result should differ from input (edges detected)
    let anyDiff = false
    for (let i = 0; i < img.data.length; i += 4) {
      if (result.data[i] !== img.data[i]) {
        anyDiff = true
        break
      }
    }
    expect(anyDiff).toBe(true)
  })
})

// ── Find Edges ───────────────────────────────────────────────

describe('applyFindEdges', () => {
  test('uniform image produces all black', () => {
    const img = makeSolid(5, 5, 128, 128, 128)
    const result = applyFindEdges(img, { threshold: 0 })
    // Sobel gradients on uniform image are 0
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(0)
      expect(result.data[i + 1]).toBe(0)
      expect(result.data[i + 2]).toBe(0)
    }
  })

  test('detects vertical edge', () => {
    // Left half black, right half white
    const img = makeImageData(6, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        const idx = (y * 6 + x) * 4
        const val = x < 3 ? 0 : 255
        img.data[idx] = val
        img.data[idx + 1] = val
        img.data[idx + 2] = val
        img.data[idx + 3] = 255
      }
    }
    const result = applyFindEdges(img, { threshold: 0 })
    // Pixels near the edge (x=2 or x=3) should have non-zero values
    const edgeIdx = (1 * 6 + 3) * 4
    expect(result.data[edgeIdx]!).toBeGreaterThan(0)
  })

  test('threshold suppresses weak edges', () => {
    // Mild gradient
    const img = makeImageData(5, 1)
    for (let x = 0; x < 5; x++) {
      const v = x * 10 // 0,10,20,30,40 — mild gradient
      img.data[x * 4] = v
      img.data[x * 4 + 1] = v
      img.data[x * 4 + 2] = v
      img.data[x * 4 + 3] = 255
    }
    const result = applyFindEdges(img, { threshold: 200 })
    // Very high threshold should suppress these mild edges
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(0)
    }
  })

  test('preserves alpha', () => {
    const img = makeSolid(4, 4, 100, 100, 100, 180)
    const result = applyFindEdges(img, { threshold: 0 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })

  test('does not mutate original', () => {
    const img = makeSolid(4, 4, 100, 100, 100)
    const before = cloneData(img)
    applyFindEdges(img, { threshold: 0 })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })
})

// ── Solarize ─────────────────────────────────────────────────

describe('applySolarize', () => {
  test('threshold=255 leaves image unchanged (no channel exceeds 255)', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applySolarize(img, { threshold: 255 })
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('threshold=0 inverts all channels (every value > 0 is inverted)', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const result = applySolarize(img, { threshold: 0 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(155) // 255 - 100
      expect(result.data[i + 1]).toBe(105) // 255 - 150
      expect(result.data[i + 2]).toBe(55) // 255 - 200
    }
  })

  test('values at threshold are not inverted', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applySolarize(img, { threshold: 128 })
    // 128 is not > 128, so it stays
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
    }
  })

  test('values above threshold are inverted', () => {
    const img = makeSolid(2, 2, 200, 200, 200)
    const result = applySolarize(img, { threshold: 128 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(55) // 255 - 200
    }
  })

  test('preserves alpha', () => {
    const img = makeSolid(2, 2, 200, 200, 200, 180)
    const result = applySolarize(img, { threshold: 128 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })

  test('does not mutate original', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const before = cloneData(img)
    applySolarize(img, { threshold: 128 })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('mixed channels solarize independently', () => {
    const img = makeImageData(1, 1)
    img.data[0] = 50 // below threshold
    img.data[1] = 200 // above threshold
    img.data[2] = 128 // at threshold
    img.data[3] = 255
    const result = applySolarize(img, { threshold: 128 })
    expect(result.data[0]).toBe(50) // not inverted
    expect(result.data[1]).toBe(55) // 255 - 200
    expect(result.data[2]).toBe(128) // not inverted (not > threshold)
  })
})

// ── Wind ─────────────────────────────────────────────────────

describe('applyWind', () => {
  test('strength=0 returns identical copy', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    const result = applyWind(img, { strength: 0, direction: 'right', method: 'wind' })
    for (let i = 0; i < before.length; i++) {
      expect(result.data[i]).toBe(before[i])
    }
  })

  test('uniform image remains unchanged regardless of wind', () => {
    const img = makeSolid(8, 8, 128, 128, 128)
    const result = applyWind(img, { strength: 10, direction: 'right', method: 'wind' })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
      expect(result.data[i + 1]).toBe(128)
      expect(result.data[i + 2]).toBe(128)
    }
  })

  test('returns new ImageData', () => {
    const img = makeSolid(4, 4, 100, 100, 100)
    const result = applyWind(img, { strength: 5, direction: 'right', method: 'wind' })
    expect(result).not.toBe(img)
  })

  test('preserves alpha', () => {
    const img = makeSolid(8, 4, 100, 100, 100, 200)
    const result = applyWind(img, { strength: 3, direction: 'right', method: 'wind' })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(200)
    }
  })

  test('all three methods produce output', () => {
    for (const method of ['wind', 'blast', 'stagger'] as const) {
      const img = makeImageData(8, 4)
      // Put a bright pixel in centre
      const cx = (2 * 8 + 4) * 4
      img.data[cx] = 255
      img.data[cx + 1] = 255
      img.data[cx + 2] = 255
      img.data[cx + 3] = 255
      const result = applyWind(img, { strength: 5, direction: 'right', method })
      expect(result.width).toBe(8)
      expect(result.height).toBe(4)
    }
  })

  test('does not mutate original', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const before = cloneData(img)
    applyWind(img, { strength: 5, direction: 'left', method: 'blast' })
    for (let i = 0; i < before.length; i++) {
      expect(img.data[i]).toBe(before[i])
    }
  })

  test('left and right directions both work', () => {
    const img = makeSolid(8, 4, 100, 100, 100)
    const left = applyWind(img, { strength: 5, direction: 'left', method: 'wind' })
    const right = applyWind(img, { strength: 5, direction: 'right', method: 'wind' })
    expect(left.width).toBe(8)
    expect(right.width).toBe(8)
  })
})
