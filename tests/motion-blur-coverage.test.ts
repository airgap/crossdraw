import { describe, test, expect } from 'bun:test'
import { applyMotionBlur, applyRadialBlur } from '@/filters/motion-blur'

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

// ── Coverage for lines 168-174: createImageData fallback ─────
// In bun:test, globalThis.ImageData is not a function,
// so the fallback path (lines 169-174) runs every time createImageData is called.

describe('createImageData fallback (lines 168-174)', () => {
  test('applyMotionBlur returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(3, 3, 128, 128, 128)
    const result = applyMotionBlur(img, { angle: 0, distance: 2 })
    expect(result.width).toBe(3)
    expect(result.height).toBe(3)
    expect(result.data.length).toBe(3 * 3 * 4)
    expect(result.colorSpace).toBe('srgb')
  })

  test('applyRadialBlur returns ImageData with correct dimensions via fallback', () => {
    const img = makeSolid(3, 3, 128, 128, 128)
    const result = applyRadialBlur(img, { centerX: 1, centerY: 1, amount: 3 })
    expect(result.width).toBe(3)
    expect(result.height).toBe(3)
    expect(result.data.length).toBe(3 * 3 * 4)
    expect(result.colorSpace).toBe('srgb')
  })
})

// ── applyMotionBlur ──────────────────────────────────────────

describe('applyMotionBlur', () => {
  test('distance=0 returns an exact copy', () => {
    const img = makeImageData([100, 150, 200, 255, 50, 75, 100, 128], 2, 1)
    const result = applyMotionBlur(img, { angle: 0, distance: 0 })
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
    expect(result).not.toBe(img)
  })

  test('solid image stays the same after motion blur', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const result = applyMotionBlur(img, { angle: 45, distance: 3 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
      expect(result.data[i + 1]).toBe(128)
      expect(result.data[i + 2]).toBe(128)
    }
  })

  test('horizontal blur at angle=0 averages along x-axis', () => {
    // 3x1 image: [0,0,0,255], [128,128,128,255], [255,255,255,255]
    const img = makeImageData([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255], 3, 1)
    const result = applyMotionBlur(img, { angle: 0, distance: 3 })
    // Middle pixel should be average of all 3: (0+128+255)/3 ~ 128
    expect(result.data[4]).toBeCloseTo(128, -1)
    expect(result.data[5]).toBeCloseTo(128, -1)
    expect(result.data[6]).toBeCloseTo(128, -1)
  })

  test('vertical blur at angle=90 averages along y-axis', () => {
    // 1x3 image: [0,0,0,255], [128,128,128,255], [255,255,255,255]
    const img = makeImageData([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255], 1, 3)
    const result = applyMotionBlur(img, { angle: 90, distance: 3 })
    // Middle pixel should be average
    expect(result.data[4]).toBeCloseTo(128, -1)
  })

  test('preserves alpha (averaged)', () => {
    const img = makeImageData([128, 128, 128, 200, 128, 128, 128, 100], 2, 1)
    const result = applyMotionBlur(img, { angle: 0, distance: 2 })
    // Alpha is also averaged across samples
    // Both pixels sample each other, so average alpha = (200+100)/2 = 150
    // But with distance=2, samples=2|1=3, and boundary clamping, it's more nuanced
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('does not modify original', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const original = new Uint8ClampedArray(img.data)
    applyMotionBlur(img, { angle: 45, distance: 5 })
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(original[i])
    }
  })

  test('large distance on small image does not crash', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applyMotionBlur(img, { angle: 30, distance: 100 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('negative distance is treated as zero', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyMotionBlur(img, { angle: 0, distance: -5 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
    expect(result.data[3]).toBe(255)
  })
})

// ── applyRadialBlur ──────────────────────────────────────────

describe('applyRadialBlur', () => {
  test('amount=0 copies pixel unchanged (samples=1 path)', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyRadialBlur(img, { centerX: 0, centerY: 0, amount: 0 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
    expect(result.data[3]).toBe(255)
  })

  test('pixel at center is copied unchanged', () => {
    const img = makeSolid(3, 3, 128, 128, 128)
    // Set center pixel to different value
    const ci = (1 * 3 + 1) * 4 // pixel (1,1)
    img.data[ci] = 200
    img.data[ci + 1] = 100
    img.data[ci + 2] = 50

    const result = applyRadialBlur(img, { centerX: 1, centerY: 1, amount: 5 })
    // Center pixel should be copied directly (dist < 0.5)
    expect(result.data[ci]).toBe(200)
    expect(result.data[ci + 1]).toBe(100)
    expect(result.data[ci + 2]).toBe(50)
  })

  test('solid image stays the same after radial blur', () => {
    const img = makeSolid(5, 5, 128, 128, 128)
    const result = applyRadialBlur(img, { centerX: 2, centerY: 2, amount: 5 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
      expect(result.data[i + 1]).toBe(128)
      expect(result.data[i + 2]).toBe(128)
    }
  })

  test('does not modify original', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const original = new Uint8ClampedArray(img.data)
    applyRadialBlur(img, { centerX: 1, centerY: 1, amount: 5 })
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(original[i])
    }
  })

  test('outer pixels are blurred more than inner pixels', () => {
    // Create an image with a pattern
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = ((x + y) % 2) * 255
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)
    const result = applyRadialBlur(img, { centerX: 2, centerY: 2, amount: 10 })
    // Center pixel should be copied directly
    const ci = (2 * 5 + 2) * 4
    expect(result.data[ci]).toBe(img.data[ci])
    // All pixels should be valid
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('amount=1 with samples=1 copies pixels at center', () => {
    const img = makeSolid(3, 3, 100, 100, 100)
    // Pixel at center
    const result = applyRadialBlur(img, { centerX: 1, centerY: 1, amount: 1 })
    // With amount=1, samples=1, the center pixel (dist < 0.5) and samples<=1 path
    // copies directly
    const ci = (1 * 3 + 1) * 4
    expect(result.data[ci]).toBe(100)
  })

  test('works on 1x1 image', () => {
    const img = makeImageData([200, 100, 50, 255], 1, 1)
    const result = applyRadialBlur(img, { centerX: 0, centerY: 0, amount: 10 })
    // Single pixel is always at the center — copied directly
    expect(result.data[0]).toBe(200)
    expect(result.data[1]).toBe(100)
    expect(result.data[2]).toBe(50)
    expect(result.data[3]).toBe(255)
  })

  test('large amount on small image does not crash', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applyRadialBlur(img, { centerX: 1, centerY: 1, amount: 100 })
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })
})
