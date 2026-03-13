import { describe, it, expect } from 'bun:test'
import { applyLensBlur, generateBokehKernel } from '@/filters/lens-blur'
import type { LensBlurParams } from '@/filters/lens-blur'

/** Create a minimal ImageData-like object for testing. */
function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

/** Create a checkerboard pattern: alternating 0 and 255 pixels. */
function makeCheckerboard(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? 0 : 255
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Create a solid-color image. */
function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) {
    data.push(r, g, b, a)
  }
  return makeImageData(data, w, h)
}

/** Create an image with a single bright pixel on a dark background. */
function makeBrightSpot(w: number, h: number): ImageData {
  const data = new Array(w * h * 4).fill(0)
  // Set alpha to 255 for all pixels
  for (let i = 0; i < w * h; i++) {
    data[i * 4 + 3] = 255
  }
  // Place a bright white pixel in the center
  const cx = Math.floor(w / 2)
  const cy = Math.floor(h / 2)
  const idx = (cy * w + cx) * 4
  data[idx] = 255
  data[idx + 1] = 255
  data[idx + 2] = 255
  return makeImageData(data, w, h)
}

/** Compute variance in the R channel across a region. */
function regionVariance(img: ImageData, x0: number, y0: number, x1: number, y1: number): number {
  const data = img.data
  const w = img.width
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = data[(y * w + x) * 4]!
      sum += v
      sumSq += v * v
      count++
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

function defaultParams(overrides: Partial<LensBlurParams> = {}): LensBlurParams {
  return {
    radius: 3,
    bladeCount: 6,
    rotation: 0,
    brightness: 0,
    threshold: 200,
    ...overrides,
  }
}

describe('generateBokehKernel', () => {
  it('produces a non-empty kernel with correct dimensions', () => {
    const { kernel, size, sum } = generateBokehKernel(3, 6, 0)
    expect(size).toBe(7) // 2*3+1
    expect(kernel.length).toBe(49) // 7*7
    expect(sum).toBeGreaterThan(0)
  })

  it('kernel contains values inside polygon', () => {
    const { kernel, size, sum } = generateBokehKernel(5, 6, 0)
    // The center should always be 1
    const center = Math.floor(size / 2)
    expect(kernel[center * size + center]).toBe(1)
    // Sum should be less than size*size (not all pixels are inside)
    expect(sum).toBeLessThan(size * size)
    expect(sum).toBeGreaterThan(1)
  })

  it('different blade counts produce different kernels', () => {
    const hex = generateBokehKernel(5, 6, 0)
    const tri = generateBokehKernel(5, 3, 0)
    // Triangle should have fewer filled pixels than hexagon
    expect(tri.sum).toBeLessThan(hex.sum)
  })

  it('rotation changes the kernel', () => {
    const k0 = generateBokehKernel(5, 6, 0)
    const k45 = generateBokehKernel(5, 6, 45)
    // The sums may differ slightly due to pixel rasterisation at different angles
    let different = false
    for (let i = 0; i < k0.kernel.length; i++) {
      if (k0.kernel[i] !== k45.kernel[i]) {
        different = true
        break
      }
    }
    expect(different).toBe(true)
  })

  it('clamps blade count to [3, 12]', () => {
    const kLow = generateBokehKernel(4, 1, 0)
    const k3 = generateBokehKernel(4, 3, 0)
    // bladeCount=1 should be clamped to 3
    expect(kLow.sum).toBe(k3.sum)

    const kHigh = generateBokehKernel(4, 20, 0)
    const k12 = generateBokehKernel(4, 12, 0)
    expect(kHigh.sum).toBe(k12.sum)
  })

  it('radius 1 produces a small valid kernel', () => {
    const { kernel, size, sum } = generateBokehKernel(1, 6, 0)
    expect(size).toBe(3)
    expect(sum).toBeGreaterThan(0)
    // Center pixel should be filled
    expect(kernel[4]).toBe(1) // index 4 = center of 3x3
  })
})

describe('applyLensBlur', () => {
  it('returns a copy when radius is 0', () => {
    const img = makeCheckerboard(8, 8)
    const result = applyLensBlur(img, defaultParams({ radius: 0 }))
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    expect(Array.from(result.data)).toEqual(Array.from(img.data))
    // Ensure it is a new object, not the same reference
    expect(result).not.toBe(img)
  })

  it('blurs a checkerboard (reduces variance)', () => {
    const img = makeCheckerboard(16, 16)
    const result = applyLensBlur(img, defaultParams({ radius: 3 }))
    const origVar = regionVariance(img, 2, 2, 14, 14)
    const blurVar = regionVariance(result, 2, 2, 14, 14)
    expect(blurVar).toBeLessThan(origVar)
  })

  it('preserves image dimensions', () => {
    const img = makeCheckerboard(20, 15)
    const result = applyLensBlur(img, defaultParams({ radius: 4 }))
    expect(result.width).toBe(20)
    expect(result.height).toBe(15)
  })

  it('larger radius produces more blur', () => {
    const img = makeCheckerboard(20, 20)
    const r2 = applyLensBlur(img, defaultParams({ radius: 2 }))
    const r5 = applyLensBlur(img, defaultParams({ radius: 5 }))
    const var2 = regionVariance(r2, 5, 5, 15, 15)
    const var5 = regionVariance(r5, 5, 5, 15, 15)
    expect(var5).toBeLessThan(var2)
  })

  it('does not modify the original image data', () => {
    const img = makeCheckerboard(8, 8)
    const originalData = new Uint8ClampedArray(img.data)
    applyLensBlur(img, defaultParams({ radius: 3 }))
    expect(Array.from(img.data)).toEqual(Array.from(originalData))
  })

  it('preserves a solid image in the interior (no change expected)', () => {
    // Use a larger image so interior pixels are fully covered by the kernel
    const r = 3
    const img = makeSolid(20, 20, 128, 128, 128)
    const result = applyLensBlur(img, defaultParams({ radius: r, brightness: 0 }))
    // Check only interior pixels (away from edges where kernel is partially out-of-bounds)
    for (let y = r + 1; y < 20 - r - 1; y++) {
      for (let x = r + 1; x < 20 - r - 1; x++) {
        const idx = (y * 20 + x) * 4
        expect(Math.abs(result.data[idx]! - 128)).toBeLessThanOrEqual(1)
        expect(Math.abs(result.data[idx + 1]! - 128)).toBeLessThanOrEqual(1)
        expect(Math.abs(result.data[idx + 2]! - 128)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('brightness boost makes bright areas brighter in the output', () => {
    // Create image with some bright and dark pixels
    const w = 16
    const h = 16
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Left half dark, right half bright
        const v = x < w / 2 ? 30 : 240
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, w, h)

    const noBrightness = applyLensBlur(img, defaultParams({ radius: 2, brightness: 0, threshold: 200 }))
    const withBrightness = applyLensBlur(img, defaultParams({ radius: 2, brightness: 2, threshold: 200 }))

    // The bright region should be brighter with the brightness boost
    let sumNoBright = 0
    let sumWithBright = 0
    // Check the right-center region (definitely in the bright area)
    for (let y = 6; y < 10; y++) {
      for (let x = 12; x < 16; x++) {
        const idx = (y * w + x) * 4
        sumNoBright += noBrightness.data[idx]!
        sumWithBright += withBrightness.data[idx]!
      }
    }
    expect(sumWithBright).toBeGreaterThan(sumNoBright)
  })

  it('threshold controls which pixels get brightness boost', () => {
    const img = makeSolid(10, 10, 150, 150, 150) // moderate brightness
    // With low threshold, pixels at 150 will be boosted
    const lowThresh = applyLensBlur(img, defaultParams({ radius: 2, brightness: 2, threshold: 100 }))
    // With high threshold, pixels at 150 will NOT be boosted
    const highThresh = applyLensBlur(img, defaultParams({ radius: 2, brightness: 2, threshold: 200 }))

    // Low threshold result should be brighter
    const centerIdx = (5 * 10 + 5) * 4
    expect(lowThresh.data[centerIdx]!).toBeGreaterThan(highThresh.data[centerIdx]!)
  })

  it('different blade counts produce different blur patterns', () => {
    const img = makeBrightSpot(21, 21)
    const hex = applyLensBlur(img, defaultParams({ radius: 5, bladeCount: 6 }))
    const tri = applyLensBlur(img, defaultParams({ radius: 5, bladeCount: 3 }))

    // Count non-zero pixels in each result (different shapes should illuminate different pixels)
    let hexNonZero = 0
    let triNonZero = 0
    for (let i = 0; i < hex.data.length; i += 4) {
      if (hex.data[i]! > 0) hexNonZero++
      if (tri.data[i]! > 0) triNonZero++
    }
    // Hexagon has more area than triangle at same radius
    expect(hexNonZero).toBeGreaterThan(triNonZero)
  })

  it('spreads a bright spot into surrounding pixels', () => {
    const img = makeBrightSpot(15, 15)
    const result = applyLensBlur(img, defaultParams({ radius: 3 }))

    // The center should now be dimmer (spread out)
    const cx = 7
    const cy = 7
    const centerIdx = (cy * 15 + cx) * 4
    expect(result.data[centerIdx]!).toBeLessThan(255)

    // Some neighbours should now be non-zero
    let neighbourSum = 0
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue
        const idx = ((cy + dy) * 15 + (cx + dx)) * 4
        neighbourSum += result.data[idx]!
      }
    }
    expect(neighbourSum).toBeGreaterThan(0)
  })

  it('handles large radius via downscale path', () => {
    const img = makeCheckerboard(30, 30)
    // radius > 12 triggers downscale optimisation
    const result = applyLensBlur(img, defaultParams({ radius: 15 }))
    expect(result.width).toBe(30)
    expect(result.height).toBe(30)

    // Should still produce a blurred result
    const origVar = regionVariance(img, 5, 5, 25, 25)
    const blurVar = regionVariance(result, 5, 5, 25, 25)
    expect(blurVar).toBeLessThan(origVar)
  })

  it('preserves alpha channel', () => {
    const w = 10
    const h = 10
    const data: number[] = []
    for (let i = 0; i < w * h; i++) {
      data.push(100, 100, 100, 128) // semi-transparent
    }
    const img = makeImageData(data, w, h)
    const result = applyLensBlur(img, defaultParams({ radius: 2 }))

    // Alpha should be preserved (solid region, no edge effects in the center)
    const cx = 5
    const cy = 5
    const idx = (cy * w + cx) * 4
    expect(Math.abs(result.data[idx + 3]! - 128)).toBeLessThanOrEqual(1)
  })

  it('1x1 image does not crash', () => {
    const img = makeSolid(1, 1, 200, 100, 50)
    const result = applyLensBlur(img, defaultParams({ radius: 3 }))
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
  })
})
