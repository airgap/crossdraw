import { describe, it, expect } from 'bun:test'
import { applyClouds, applyLensFlare, applyLighting } from '@/filters/render-filters'
import { applyClarity } from '@/filters/clarity'
import { applyDenoise } from '@/filters/denoise'

// ── Test helpers ──────────────────────────────────────────────

/** Create a minimal ImageData-like object for testing. */
function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

/** Create a flat-colour image (all pixels the same RGBA). */
function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) {
    data.push(r, g, b, a)
  }
  return makeImageData(data, w, h)
}

/** Create a horizontal gradient from black (left) to white (right). */
function makeHGradient(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255)
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Create an image with a sharp vertical edge: left half black, right half white. */
function makeEdge(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Create a noisy midtone image for denoise testing. */
function makeNoisyMidtone(w: number, h: number, seed: number): ImageData {
  const data: number[] = []
  let s = seed
  for (let i = 0; i < w * h; i++) {
    // Simple LCG for reproducible noise
    s = (s * 1664525 + 1013904223) >>> 0
    const noise = ((s / 0xffffffff) * 2 - 1) * 30
    const v = Math.max(0, Math.min(255, Math.round(128 + noise)))
    data.push(v, v, v, 255)
  }
  return makeImageData(data, w, h)
}

/** Average pixel value across all R channels. */
function avgChannel(img: ImageData, channel: number): number {
  const d = img.data
  let sum = 0
  let count = 0
  for (let i = channel; i < d.length; i += 4) {
    sum += d[i]!
    count++
  }
  return sum / count
}

/** Compute variance of R channel. */
function varianceChannel(img: ImageData, channel: number): number {
  const d = img.data
  const avg = avgChannel(img, channel)
  let sumSq = 0
  let count = 0
  for (let i = channel; i < d.length; i += 4) {
    const diff = d[i]! - avg
    sumSq += diff * diff
    count++
  }
  return sumSq / count
}

// ── Clouds tests ──────────────────────────────────────────────

describe('applyClouds', () => {
  it('produces a grayscale image with variation', () => {
    const src = makeSolid(32, 32, 0, 0, 0)
    const result = applyClouds(src, { scale: 50, seed: 42, turbulence: false })

    expect(result.width).toBe(32)
    expect(result.height).toBe(32)

    // Should be grayscale (R=G=B) for every pixel
    const d = result.data
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(d[i + 1])
      expect(d[i + 1]).toBe(d[i + 2])
      expect(d[i + 3]).toBe(255) // fully opaque
    }

    // Should have some variation (not all the same value)
    const variance = varianceChannel(result, 0)
    expect(variance).toBeGreaterThan(0)
  })

  it('different seeds produce different patterns', () => {
    const src = makeSolid(16, 16, 0, 0, 0)
    const a = applyClouds(src, { scale: 50, seed: 1, turbulence: false })
    const b = applyClouds(src, { scale: 50, seed: 999, turbulence: false })

    // At least some pixels should differ
    let diffs = 0
    for (let i = 0; i < a.data.length; i += 4) {
      if (a.data[i] !== b.data[i]) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('same seed produces identical output', () => {
    const src = makeSolid(16, 16, 0, 0, 0)
    const a = applyClouds(src, { scale: 50, seed: 42, turbulence: false })
    const b = applyClouds(src, { scale: 50, seed: 42, turbulence: false })

    for (let i = 0; i < a.data.length; i++) {
      expect(a.data[i]).toBe(b.data[i])
    }
  })

  it('turbulence mode produces all non-negative values', () => {
    const src = makeSolid(32, 32, 0, 0, 0)
    const result = applyClouds(src, { scale: 50, seed: 42, turbulence: true })

    const d = result.data
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBeGreaterThanOrEqual(0)
      expect(d[i]).toBeLessThanOrEqual(255)
    }
  })

  it('higher scale produces more variation across small distances', () => {
    const src = makeSolid(32, 32, 0, 0, 0)
    const lowScale = applyClouds(src, { scale: 5, seed: 42, turbulence: false })
    const highScale = applyClouds(src, { scale: 200, seed: 42, turbulence: false })

    // With higher scale (higher frequency), adjacent pixels should differ more.
    // Compute average absolute difference between adjacent horizontal pixels.
    let lowAdj = 0
    let highAdj = 0
    let count = 0
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 31; x++) {
        const pi = (y * 32 + x) * 4
        const ni = (y * 32 + x + 1) * 4
        lowAdj += Math.abs(lowScale.data[pi]! - lowScale.data[ni]!)
        highAdj += Math.abs(highScale.data[pi]! - highScale.data[ni]!)
        count++
      }
    }
    lowAdj /= count
    highAdj /= count

    expect(highAdj).toBeGreaterThan(lowAdj)
  })
})

// ── Lens Flare tests ──────────────────────────────────────────

describe('applyLensFlare', () => {
  it('adds brightness at the flare source location', () => {
    const src = makeSolid(64, 64, 50, 50, 50)
    const result = applyLensFlare(src, { x: 16, y: 16, brightness: 1.0, lensType: 'standard' })

    // Pixels near the flare source should be brighter than the original
    const srcIdx = (16 * 64 + 16) * 4
    expect(result.data[srcIdx]!).toBeGreaterThan(50)
  })

  it('preserves dimensions', () => {
    const src = makeSolid(32, 32, 100, 100, 100)
    const result = applyLensFlare(src, { x: 10, y: 10, brightness: 0.5, lensType: 'standard' })
    expect(result.width).toBe(32)
    expect(result.height).toBe(32)
  })

  it('higher brightness produces brighter pixels', () => {
    const src = makeSolid(64, 64, 50, 50, 50)
    const low = applyLensFlare(src, { x: 32, y: 32, brightness: 0.3, lensType: 'standard' })
    const high = applyLensFlare(src, { x: 32, y: 32, brightness: 1.5, lensType: 'standard' })

    // Average brightness should be higher with higher brightness param
    expect(avgChannel(high, 0)).toBeGreaterThan(avgChannel(low, 0))
  })

  it('different lens types produce different patterns', () => {
    const src = makeSolid(64, 64, 50, 50, 50)
    const standard = applyLensFlare(src, { x: 16, y: 16, brightness: 1.0, lensType: 'standard' })
    const zoom = applyLensFlare(src, { x: 16, y: 16, brightness: 1.0, lensType: 'zoom' })
    const movie = applyLensFlare(src, { x: 16, y: 16, brightness: 1.0, lensType: 'movie' })

    // Different types should not produce identical results
    let diffSZ = 0
    let diffSM = 0
    for (let i = 0; i < standard.data.length; i += 4) {
      if (standard.data[i] !== zoom.data[i]) diffSZ++
      if (standard.data[i] !== movie.data[i]) diffSM++
    }
    expect(diffSZ).toBeGreaterThan(0)
    expect(diffSM).toBeGreaterThan(0)
  })

  it('zero brightness leaves image unchanged', () => {
    const src = makeSolid(32, 32, 100, 100, 100)
    const result = applyLensFlare(src, { x: 16, y: 16, brightness: 0, lensType: 'standard' })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })
})

// ── Lighting tests ────────────────────────────────────────────

describe('applyLighting', () => {
  it('ambient light at 1.0 with zero intensity preserves original', () => {
    const src = makeHGradient(32, 32)
    const result = applyLighting(src, {
      lightX: 16,
      lightY: 16,
      intensity: 0,
      ambientLight: 1.0,
      surfaceHeight: 1,
    })

    // With ambient=1 and intensity=0, illum = 1.0, so pixels should be ~unchanged
    for (let i = 0; i < src.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(result.data[i + c]! - src.data[i + c]!)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('zero ambient with some intensity darkens pixels far from light', () => {
    const src = makeSolid(32, 32, 200, 200, 200)
    const result = applyLighting(src, {
      lightX: 0,
      lightY: 0,
      intensity: 1.0,
      ambientLight: 0,
      surfaceHeight: 0.5,
    })

    // Far corner (31, 31) should be darker than source
    const farIdx = (31 * 32 + 31) * 4
    expect(result.data[farIdx]!).toBeLessThan(200)
  })

  it('preserves alpha channel', () => {
    const src = makeImageData([100, 150, 200, 128, 50, 75, 25, 64], 2, 1)
    const result = applyLighting(src, {
      lightX: 1,
      lightY: 0,
      intensity: 1.0,
      ambientLight: 0.5,
      surfaceHeight: 1.0,
    })
    expect(result.data[3]).toBe(128)
    expect(result.data[7]).toBe(64)
  })

  it('preserves dimensions', () => {
    const src = makeSolid(20, 15, 100, 100, 100)
    const result = applyLighting(src, {
      lightX: 10,
      lightY: 7,
      intensity: 0.8,
      ambientLight: 0.3,
      surfaceHeight: 1.0,
    })
    expect(result.width).toBe(20)
    expect(result.height).toBe(15)
  })
})

// ── Clarity tests ─────────────────────────────────────────────

describe('applyClarity', () => {
  it('amount=0 returns identical copy', () => {
    const src = makeHGradient(32, 32)
    const result = applyClarity(src, { amount: 0 })

    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('positive amount enhances midtone contrast', () => {
    const src = makeHGradient(32, 32)
    const result = applyClarity(src, { amount: 2 })

    // At the centre of the gradient, the clarity-enhanced image should have
    // stronger local contrast. Check that midtone pixels diverge from the
    // blurred average.
    const midX = 16
    const midY = 16
    const midIdx = (midY * 32 + midX) * 4
    const origVal = src.data[midIdx]!
    const clarVal = result.data[midIdx]!

    // The enhanced pixel should differ from original (either brighter or darker)
    // since clarity pushes the pixel away from its local average.
    expect(clarVal).not.toBe(origVal)
  })

  it('does not modify extreme darks much', () => {
    // Image that is almost entirely black (low luminance)
    const src = makeSolid(16, 16, 5, 5, 5)
    const result = applyClarity(src, { amount: 2.0 })

    // Dark pixels have low midtone weight, so they should barely change
    for (let i = 0; i < src.data.length; i += 4) {
      expect(Math.abs(result.data[i]! - src.data[i]!)).toBeLessThanOrEqual(2)
    }
  })

  it('does not modify extreme lights much', () => {
    // Image that is almost entirely white (high luminance)
    const src = makeSolid(16, 16, 250, 250, 250)
    const result = applyClarity(src, { amount: 2.0 })

    // Light pixels have low midtone weight, so they should barely change
    for (let i = 0; i < src.data.length; i += 4) {
      expect(Math.abs(result.data[i]! - src.data[i]!)).toBeLessThanOrEqual(2)
    }
  })

  it('preserves alpha channel', () => {
    const src = makeImageData([128, 128, 128, 100], 1, 1)
    const result = applyClarity(src, { amount: 1.0 })
    expect(result.data[3]).toBe(100)
  })

  it('preserves dimensions', () => {
    const src = makeHGradient(20, 10)
    const result = applyClarity(src, { amount: 1.0 })
    expect(result.width).toBe(20)
    expect(result.height).toBe(10)
  })

  it('negative amount reduces local contrast', () => {
    const src = makeEdge(32, 32)
    const result = applyClarity(src, { amount: -2 })

    // Near the edge boundary, clarity with negative amount should push
    // values closer together (reduced contrast) in midtone regions.
    // Check a midtone-ish pixel near the edge
    const edgeX = 16
    const edgeY = 16
    // The edge pixel (right side) is 255 — this is not midtone, so
    // check a pixel that is adjacent to the blur zone
    const leftIdx = (edgeY * 32 + (edgeX - 2)) * 4
    const rightIdx = (edgeY * 32 + edgeX) * 4
    const origContrast = Math.abs(src.data[rightIdx]! - src.data[leftIdx]!)
    const resultContrast = Math.abs(result.data[rightIdx]! - result.data[leftIdx]!)

    // With negative clarity, contrast should be reduced or equal
    expect(resultContrast).toBeLessThanOrEqual(origContrast)
  })
})

// ── Denoise tests ─────────────────────────────────────────────

describe('applyDenoise', () => {
  it('strength=0 returns identical copy', () => {
    const src = makeNoisyMidtone(16, 16, 42)
    const result = applyDenoise(src, { strength: 0, detail: 0 })

    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('reduces variance of noisy image', () => {
    const src = makeNoisyMidtone(16, 16, 42)
    const result = applyDenoise(src, { strength: 50, detail: 0 })

    const srcVariance = varianceChannel(src, 0)
    const resultVariance = varianceChannel(result, 0)

    // Denoised image should have lower variance
    expect(resultVariance).toBeLessThan(srcVariance)
  })

  it('preserves alpha channel', () => {
    const data: number[] = []
    for (let i = 0; i < 10 * 10; i++) {
      data.push(128 + (i % 7) * 3, 128, 128, 200)
    }
    const src = makeImageData(data, 10, 10)
    const result = applyDenoise(src, { strength: 30, detail: 0 })

    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(200)
    }
  })

  it('preserves dimensions', () => {
    const src = makeNoisyMidtone(20, 15, 42)
    const result = applyDenoise(src, { strength: 20, detail: 0.5 })
    expect(result.width).toBe(20)
    expect(result.height).toBe(15)
  })

  it('high detail parameter preserves edges better', () => {
    const src = makeEdge(20, 20)
    // Add noise to the edge image
    const d = src.data
    let s = 42
    for (let i = 0; i < d.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0
      const noise = ((s / 0xffffffff) * 2 - 1) * 15
      d[i] = Math.max(0, Math.min(255, d[i]! + noise))
      d[i + 1] = d[i]!
      d[i + 2] = d[i]!
    }

    const noDetail = applyDenoise(src, { strength: 40, detail: 0 })
    const hiDetail = applyDenoise(src, { strength: 40, detail: 1.0 })

    // At the edge boundary, the high-detail version should preserve more
    // contrast between adjacent pixels across the edge.
    const y = 10
    const leftX = 8
    const rightX = 12
    const leftIdxNoD = (y * 20 + leftX) * 4
    const rightIdxNoD = (y * 20 + rightX) * 4
    const contrastNoDetail = Math.abs(noDetail.data[rightIdxNoD]! - noDetail.data[leftIdxNoD]!)

    const leftIdxHiD = (y * 20 + leftX) * 4
    const rightIdxHiD = (y * 20 + rightX) * 4
    const contrastHiDetail = Math.abs(hiDetail.data[rightIdxHiD]! - hiDetail.data[leftIdxHiD]!)

    // High detail should preserve more edge contrast (allow 2px rounding tolerance)
    expect(contrastHiDetail).toBeGreaterThanOrEqual(contrastNoDetail - 2)
  })

  it('higher strength produces stronger smoothing', () => {
    const src = makeNoisyMidtone(16, 16, 42)
    const lowStr = applyDenoise(src, { strength: 10, detail: 0 })
    const highStr = applyDenoise(src, { strength: 100, detail: 0 })

    const lowVariance = varianceChannel(lowStr, 0)
    const highVariance = varianceChannel(highStr, 0)

    // Higher strength should reduce variance more
    expect(highVariance).toBeLessThanOrEqual(lowVariance)
  })
})
