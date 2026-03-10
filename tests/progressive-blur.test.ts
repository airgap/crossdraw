import { describe, it, expect } from 'bun:test'
import { applyProgressiveBlur, boxBlur } from '@/filters/progressive-blur'
import type { ProgressiveBlurParams } from '@/filters/progressive-blur'

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

/** Compute the average pixel value (R channel only) for a sub-region of an ImageData. */
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

function defaultParams(overrides: Partial<ProgressiveBlurParams> = {}): ProgressiveBlurParams {
  return {
    kind: 'progressive-blur',
    direction: 'linear',
    angle: 0,
    startRadius: 0,
    endRadius: 10,
    startPosition: 0,
    endPosition: 1,
    ...overrides,
  }
}

describe('boxBlur', () => {
  it('produces smoothed output', () => {
    const img = makeCheckerboard(8, 8)
    const blurred = boxBlur(img, 2)
    // After blurring a checkerboard the values should cluster around the mean (~127).
    // Check that the variance decreased compared to the original.
    const origVar = regionVariance(img, 0, 0, 8, 8)
    const blurVar = regionVariance(blurred, 0, 0, 8, 8)
    expect(blurVar).toBeLessThan(origVar)
  })

  it('returns an identical copy when radius is 0', () => {
    const img = makeCheckerboard(4, 4)
    const result = boxBlur(img, 0)
    expect(Array.from(result.data)).toEqual(Array.from(img.data))
  })
})

describe('applyProgressiveBlur', () => {
  it('linear progressive blur has more blur at end than start', () => {
    // 20 pixels wide, 4 tall.  Angle = 0 means left-to-right.
    const w = 20
    const h = 4
    const img = makeCheckerboard(w, h)
    const params = defaultParams({ angle: 0, startRadius: 0, endRadius: 10 })
    const result = applyProgressiveBlur(img, params)

    // Left quarter (start) should have HIGH variance (little blur).
    const leftVar = regionVariance(result, 0, 0, 5, h)
    // Right quarter (end) should have LOW variance (heavy blur).
    const rightVar = regionVariance(result, 15, 0, w, h)

    expect(rightVar).toBeLessThan(leftVar)
  })

  it('radial progressive blur has more blur at edges than center', () => {
    const size = 20
    const img = makeCheckerboard(size, size)
    const params = defaultParams({
      direction: 'radial',
      startRadius: 0,
      endRadius: 10,
    })
    const result = applyProgressiveBlur(img, params)

    // Centre region should keep high variance (sharp).
    const centerVar = regionVariance(result, 7, 7, 13, 13)
    // Edge region should have low variance (blurred).
    const edgeVar = regionVariance(result, 0, 0, 5, 5)

    expect(edgeVar).toBeLessThan(centerVar)
  })

  it('startRadius=endRadius produces uniform blur', () => {
    const w = 12
    const h = 12
    const img = makeCheckerboard(w, h)
    const params = defaultParams({
      startRadius: 5,
      endRadius: 5,
    })
    const result = applyProgressiveBlur(img, params)

    // Compare a full box blur at radius 5 vs the progressive result.
    const uniformBlur = boxBlur(img, 5)

    // They should be very similar (within rounding).
    let maxDiff = 0
    for (let i = 0; i < result.data.length; i++) {
      const diff = Math.abs(result.data[i]! - uniformBlur.data[i]!)
      if (diff > maxDiff) maxDiff = diff
    }
    // Allow a small tolerance due to band interpolation.
    expect(maxDiff).toBeLessThanOrEqual(3)
  })

  it('startRadius=0 endRadius=0 produces no change', () => {
    const img = makeCheckerboard(8, 8)
    const params = defaultParams({
      startRadius: 0,
      endRadius: 0,
    })
    const result = applyProgressiveBlur(img, params)
    expect(Array.from(result.data)).toEqual(Array.from(img.data))
  })

  it('angle parameter rotates the blur direction', () => {
    // With angle=0 blur increases left-to-right.
    // With angle=90 blur should increase top-to-bottom instead.
    const w = 20
    const h = 20
    const img = makeCheckerboard(w, h)

    const params0 = defaultParams({ angle: 0, startRadius: 0, endRadius: 10 })
    const result0 = applyProgressiveBlur(img, params0)

    const params90 = defaultParams({ angle: 90, startRadius: 0, endRadius: 10 })
    const result90 = applyProgressiveBlur(img, params90)

    // For angle=0: top-left vs top-right should differ (left sharp, right blurred).
    const tl0 = regionVariance(result0, 0, 0, 5, 5)
    const tr0 = regionVariance(result0, 15, 0, 20, 5)
    expect(tr0).toBeLessThan(tl0) // right is blurrier

    // For angle=90: top-left vs bottom-left should differ (top sharp, bottom blurred).
    const tl90 = regionVariance(result90, 0, 0, 5, 5)
    const bl90 = regionVariance(result90, 0, 15, 5, 20)
    expect(bl90).toBeLessThan(tl90) // bottom is blurrier
  })
})
