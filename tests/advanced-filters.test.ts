import { describe, it, expect } from 'bun:test'
import { applySharpen } from '@/filters/sharpen'
import { applyMotionBlur, applyRadialBlur } from '@/filters/motion-blur'
import {
  applyPosterize,
  applyThreshold,
  applyInvert,
  applyDesaturate,
  applyVibrance,
  applyChannelMixer,
} from '@/filters/color-adjust'

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

/** Count the number of unique RGB triples in the image. */
function countUniqueColors(img: ImageData): number {
  const set = new Set<string>()
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
  }
  return set.size
}

/** Check if every pixel in the image is either pure black or pure white. */
function isBlackAndWhite(img: ImageData): boolean {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!
    const g = d[i + 1]!
    const b = d[i + 2]!
    if (!((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255))) {
      return false
    }
  }
  return true
}

// ── Sharpen tests ─────────────────────────────────────────────

describe('applySharpen', () => {
  it('increases edge contrast', () => {
    const src = makeEdge(20, 10)
    const result = applySharpen(src, { amount: 2, radius: 1, threshold: 0 })

    // On the edge boundary, the sharpened image should have pixels that
    // overshoot (brighter than 255 clamped to 255) or undershoot (darker than 0).
    // Compare the contrast at the edge: the difference between adjacent pixels
    // should be >= the original (which was already 255-0 = 255 at the boundary).
    // The key test: in the original, the transition is 1px wide.  After
    // sharpening, pixels adjacent to the edge should be pushed further apart.
    const midX = 10
    const y = 5

    // Pixel just left of edge in original
    const origLeftIdx = (y * 20 + (midX - 1)) * 4
    const origLeft = src.data[origLeftIdx]!

    // Same pixel in sharpened result
    const sharpLeft = result.data[origLeftIdx]!

    // Pixel just right of edge in sharpened result
    const sharpRightIdx = (y * 20 + midX) * 4
    const sharpRight = result.data[sharpRightIdx]!

    // The sharpened left pixel should be <= original (pushed darker).
    // The sharpened right pixel should be >= original right (pushed brighter).
    expect(sharpLeft).toBeLessThanOrEqual(origLeft)
    expect(sharpRight).toBeGreaterThanOrEqual(src.data[sharpRightIdx]!)

    // Overall edge contrast should be at least as large as original
    expect(sharpRight - sharpLeft).toBeGreaterThanOrEqual(255)
  })

  it('returns identical output when amount is 0', () => {
    const src = makeHGradient(10, 10)
    const result = applySharpen(src, { amount: 0, radius: 2, threshold: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('returns identical output when radius is 0', () => {
    const src = makeHGradient(10, 10)
    const result = applySharpen(src, { amount: 2, radius: 0, threshold: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('respects threshold — no sharpening when diff is below threshold', () => {
    // Subtle gradient: values differ by only ~1 per pixel step
    const data: number[] = []
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const v = 128 + x // 128..137
        data.push(v, v, v, 255)
      }
    }
    const src = makeImageData(data, 10, 10)

    // High threshold (50) should suppress sharpening of these tiny differences
    const result = applySharpen(src, { amount: 5, radius: 2, threshold: 50 })

    // Most pixels should remain unchanged
    let unchanged = 0
    for (let i = 0; i < src.data.length; i += 4) {
      if (result.data[i] === src.data[i]) unchanged++
    }
    // Majority of pixels should be unchanged
    expect(unchanged).toBeGreaterThan(50)
  })
})

// ── Motion Blur tests ─────────────────────────────────────────

describe('applyMotionBlur', () => {
  it('blurs along horizontal axis', () => {
    const src = makeEdge(20, 10)
    const result = applyMotionBlur(src, { angle: 0, distance: 5 })

    // In the original, pixel at (9,5) is 0 and (10,5) is 255 — a sharp edge.
    // After horizontal motion blur, these pixels should be intermediate values.
    const y = 5
    const leftIdx = (y * 20 + 9) * 4
    const rightIdx = (y * 20 + 10) * 4

    // The edge pixels should now be grey (between 0 and 255)
    expect(result.data[leftIdx]!).toBeGreaterThan(0)
    expect(result.data[rightIdx]!).toBeLessThan(255)
  })

  it('preserves vertical edges when blurring vertically', () => {
    const src = makeEdge(20, 10)
    const result = applyMotionBlur(src, { angle: 90, distance: 5 })

    // A vertical blur should NOT significantly affect a vertical edge.
    // Pixels far from top/bottom edges should remain black or white.
    const y = 5 // middle row
    const blackIdx = (y * 20 + 2) * 4
    const whiteIdx = (y * 20 + 17) * 4

    expect(result.data[blackIdx]!).toBe(0)
    expect(result.data[whiteIdx]!).toBe(255)
  })

  it('returns a copy when distance is 0', () => {
    const src = makeHGradient(10, 10)
    const result = applyMotionBlur(src, { angle: 0, distance: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })
})

// ── Radial Blur tests ─────────────────────────────────────────

describe('applyRadialBlur', () => {
  it('blurs pixels radiating from centre', () => {
    // Create an image with a sharp horizontal edge (top black, bottom white)
    const data: number[] = []
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const v = y < 10 ? 0 : 255
        data.push(v, v, v, 255)
      }
    }
    const src = makeImageData(data, 20, 20)
    const result = applyRadialBlur(src, { centerX: 10, centerY: 10, amount: 10 })

    // Pixel at the edge boundary (directly above centre) should get blurred.
    // (10, 9) is black in original, but radial samples along the vertical axis
    // will pick up white pixels from below, producing a mid-grey.
    const edgeIdx = (9 * 20 + 10) * 4
    const edgeVal = result.data[edgeIdx]!
    expect(edgeVal).toBeGreaterThan(0)
    expect(edgeVal).toBeLessThan(255)
  })

  it('leaves centre pixel unchanged', () => {
    const data: number[] = []
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        data.push(x * 12, y * 12, 100, 255)
      }
    }
    const src = makeImageData(data, 20, 20)
    const result = applyRadialBlur(src, { centerX: 10, centerY: 10, amount: 10 })

    // Centre pixel should be unchanged (no blur at dist=0)
    const cIdx = (10 * 20 + 10) * 4
    expect(result.data[cIdx]).toBe(src.data[cIdx])
    expect(result.data[cIdx + 1]).toBe(src.data[cIdx + 1])
    expect(result.data[cIdx + 2]).toBe(src.data[cIdx + 2])
  })
})

// ── Posterize tests ───────────────────────────────────────────

describe('applyPosterize', () => {
  it('reduces unique colours', () => {
    const src = makeHGradient(256, 1) // 256 unique grey levels
    const result = applyPosterize(src, { levels: 4 })
    const unique = countUniqueColors(result)
    expect(unique).toBeLessThanOrEqual(4)
  })

  it('with levels=2 produces only black and white', () => {
    const src = makeHGradient(100, 1)
    const result = applyPosterize(src, { levels: 2 })
    expect(isBlackAndWhite(result)).toBe(true)
  })

  it('with levels=256 preserves original values', () => {
    const src = makeHGradient(256, 1)
    const result = applyPosterize(src, { levels: 256 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })
})

// ── Threshold tests ───────────────────────────────────────────

describe('applyThreshold', () => {
  it('produces only black and white pixels', () => {
    const src = makeHGradient(100, 10)
    const result = applyThreshold(src, { value: 128 })
    expect(isBlackAndWhite(result)).toBe(true)
  })

  it('all white when threshold=0', () => {
    const src = makeHGradient(20, 1)
    const result = applyThreshold(src, { value: 0 })
    const d = result.data
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(255)
      expect(d[i + 1]).toBe(255)
      expect(d[i + 2]).toBe(255)
    }
  })

  it('all black when threshold=256', () => {
    const src = makeHGradient(20, 1)
    const result = applyThreshold(src, { value: 256 })
    const d = result.data
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(0)
      expect(d[i + 1]).toBe(0)
      expect(d[i + 2]).toBe(0)
    }
  })
})

// ── Invert tests ──────────────────────────────────────────────

describe('applyInvert', () => {
  it('produces complementary colours', () => {
    const src = makeImageData([100, 150, 200, 255, 0, 255, 128, 255], 2, 1)
    const result = applyInvert(src)

    expect(result.data[0]).toBe(155)
    expect(result.data[1]).toBe(105)
    expect(result.data[2]).toBe(55)
    expect(result.data[3]).toBe(255) // alpha preserved

    expect(result.data[4]).toBe(255)
    expect(result.data[5]).toBe(0)
    expect(result.data[6]).toBe(127)
    expect(result.data[7]).toBe(255)
  })

  it('double invert restores original', () => {
    const src = makeHGradient(50, 1)
    const inv = applyInvert(src)
    const restored = applyInvert(inv)
    for (let i = 0; i < src.data.length; i++) {
      expect(restored.data[i]).toBe(src.data[i])
    }
  })

  it('preserves alpha channel', () => {
    const src = makeImageData([100, 100, 100, 128], 1, 1)
    const result = applyInvert(src)
    expect(result.data[3]).toBe(128)
  })
})

// ── Desaturate tests ──────────────────────────────────────────

describe('applyDesaturate', () => {
  it('produces equal R=G=B channels', () => {
    const src = makeImageData(
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 100, 150, 200, 255],
      4,
      1,
    )
    const result = applyDesaturate(src)
    const d = result.data

    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(d[i + 1])
      expect(d[i + 1]).toBe(d[i + 2])
    }
  })

  it('pure white stays white', () => {
    const src = makeSolid(2, 2, 255, 255, 255)
    const result = applyDesaturate(src)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255)
    }
  })

  it('pure black stays black', () => {
    const src = makeSolid(2, 2, 0, 0, 0)
    const result = applyDesaturate(src)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(0)
    }
  })

  it('preserves alpha', () => {
    const src = makeImageData([200, 100, 50, 128], 1, 1)
    const result = applyDesaturate(src)
    expect(result.data[3]).toBe(128)
  })
})

// ── Vibrance tests ────────────────────────────────────────────

describe('applyVibrance', () => {
  it('increases less-saturated colours more than already-saturated ones', () => {
    // Low-saturation pixel: (150, 140, 130) — close to grey
    // High-saturation pixel: (255, 0, 0) — pure red
    const src = makeImageData(
      [150, 140, 130, 255, 255, 0, 0, 255],
      2,
      1,
    )
    const result = applyVibrance(src, { amount: 0.8 })

    // For the low-sat pixel, compute the spread (max - min) before and after.
    const lowSpreadBefore = 150 - 130 // = 20
    const lowSpreadAfter = Math.max(result.data[0]!, result.data[1]!, result.data[2]!) -
      Math.min(result.data[0]!, result.data[1]!, result.data[2]!)

    // For the high-sat pixel, compute spread before and after.
    const highSpreadBefore = 255 - 0 // = 255
    const highSpreadAfter = Math.max(result.data[4]!, result.data[5]!, result.data[6]!) -
      Math.min(result.data[4]!, result.data[5]!, result.data[6]!)

    // Low-saturation colour should get a proportionally larger boost.
    const lowBoostRatio = lowSpreadAfter / lowSpreadBefore
    const highBoostRatio = highSpreadAfter / highSpreadBefore

    expect(lowBoostRatio).toBeGreaterThan(highBoostRatio)
  })

  it('amount=0 produces no change', () => {
    const src = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyVibrance(src, { amount: 0 })
    for (let i = 0; i < 4; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('negative amount desaturates less-saturated colours', () => {
    // Use a partially saturated pixel so vibrance has an effect
    const src = makeImageData([200, 100, 150, 255], 1, 1)
    const result = applyVibrance(src, { amount: -0.8 })
    // After desaturation, channels should be closer together
    const spreadBefore = Math.max(200, 100, 150) - Math.min(200, 100, 150) // 100
    const spreadAfter = Math.max(result.data[0]!, result.data[1]!, result.data[2]!) -
      Math.min(result.data[0]!, result.data[1]!, result.data[2]!)
    expect(spreadAfter).toBeLessThan(spreadBefore)
  })
})

// ── Channel Mixer tests ───────────────────────────────────────

describe('applyChannelMixer', () => {
  it('identity matrix produces no change', () => {
    const src = makeImageData(
      [100, 150, 200, 255, 50, 75, 100, 255],
      2,
      1,
    )
    const result = applyChannelMixer(src, {
      rr: 1, rg: 0, rb: 0,
      gr: 0, gg: 1, gb: 0,
      br: 0, bg: 0, bb: 1,
    })

    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('swaps red and blue channels', () => {
    const src = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyChannelMixer(src, {
      rr: 0, rg: 0, rb: 1,
      gr: 0, gg: 1, gb: 0,
      br: 1, bg: 0, bb: 0,
    })

    expect(result.data[0]).toBe(200) // was blue -> now red
    expect(result.data[1]).toBe(150) // green unchanged
    expect(result.data[2]).toBe(100) // was red -> now blue
    expect(result.data[3]).toBe(255) // alpha preserved
  })

  it('zero matrix produces black', () => {
    const src = makeImageData([100, 150, 200, 255], 1, 1)
    const result = applyChannelMixer(src, {
      rr: 0, rg: 0, rb: 0,
      gr: 0, gg: 0, gb: 0,
      br: 0, bg: 0, bb: 0,
    })

    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(0)
    expect(result.data[2]).toBe(0)
    expect(result.data[3]).toBe(255) // alpha preserved
  })

  it('clamps values that exceed 255', () => {
    const src = makeImageData([200, 200, 200, 255], 1, 1)
    const result = applyChannelMixer(src, {
      rr: 2, rg: 0, rb: 0,
      gr: 0, gg: 2, gb: 0,
      br: 0, bg: 0, bb: 2,
    })

    expect(result.data[0]).toBe(255) // 200*2=400, clamped to 255
    expect(result.data[1]).toBe(255)
    expect(result.data[2]).toBe(255)
  })
})
