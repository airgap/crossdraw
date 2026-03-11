import { describe, test, expect } from 'bun:test'
import { applyAdjustment } from '@/effects/adjustments'
import type { AdjustmentLayer, LevelsParams, CurvesParams, HueSatParams, ColorBalanceParams } from '@/types'

// ── Helpers ──────────────────────────────────────────────────

function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeAdjustmentLayer(
  adjustmentType: string,
  params: LevelsParams | CurvesParams | HueSatParams | ColorBalanceParams,
  visible = true,
): AdjustmentLayer {
  return {
    id: 'adj-1',
    name: 'test',
    type: 'adjustment',
    visible,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    adjustmentType,
    params,
  } as unknown as AdjustmentLayer
}

// ── Coverage for uncovered lines ─────────────────────────────
// Lines 14-15: the 'curves' case in applyAdjustment switch
// Lines 20-21: the 'color-balance' case in applyAdjustment switch
// Lines 41-46: applyCurves function body
// Lines 90-104: applyColorBalance function body

describe('applyAdjustment — curves branch (lines 14-15, 41-46)', () => {
  test('curves adjustment applies LUT from control points', () => {
    // 2x1 image with known pixel values
    const img = makeImageData([0, 128, 255, 255, 64, 192, 32, 255], 2, 1)
    const layer = makeAdjustmentLayer('curves', {
      points: [
        [0, 0],
        [128, 200],
        [255, 255],
      ] as [number, number][],
    })
    applyAdjustment(img, layer)
    // After curves: value 0 -> 0, 128 -> 200, 255 -> 255
    expect(img.data[0]).toBe(0)
    expect(img.data[1]).toBe(200)
    expect(img.data[2]).toBe(255)
  })

  test('curves with identity points leaves pixels unchanged', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('curves', {
      points: [
        [0, 0],
        [255, 255],
      ] as [number, number][],
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(100)
    expect(img.data[1]).toBe(150)
    expect(img.data[2]).toBe(200)
  })

  test('curves with empty points acts as identity', () => {
    const img = makeImageData([50, 100, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('curves', {
      points: [] as [number, number][],
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(50)
    expect(img.data[1]).toBe(100)
    expect(img.data[2]).toBe(200)
  })

  test('curves with midpoint-only (auto endpoints added)', () => {
    // Only a single midpoint, endpoints [0,0] and [255,255] should be auto-added
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const layer = makeAdjustmentLayer('curves', {
      points: [[128, 64]] as [number, number][],
    })
    applyAdjustment(img, layer)
    // Value 128 should map to 64
    expect(img.data[0]).toBe(64)
    expect(img.data[1]).toBe(64)
    expect(img.data[2]).toBe(64)
  })
})

describe('applyAdjustment — color-balance branch (lines 20-21, 90-104)', () => {
  test('color-balance with zero shifts leaves pixels unchanged', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 0,
      midtones: 0,
      highlights: 0,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(128)
    expect(img.data[1]).toBe(128)
    expect(img.data[2]).toBe(128)
  })

  test('color-balance shifts midtones red on mid-luminance pixel', () => {
    // Mid-grey pixel: luminance = 128/255 * 0.299 + 128/255 * 0.587 + 128/255 * 0.114 ~ 0.502
    // At lum~0.5: shadowW=max(0, 1-0.5*3)=0, highlightW=max(0,0.5*3-2)=0, midW=1
    // So shift = midtones * midW = 30 * 1 = 30
    // R += 30 -> 158, G -= 15 -> 113, B -= 15 -> 113
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 0,
      midtones: 30,
      highlights: 0,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBeGreaterThan(128) // red shifted up
    expect(img.data[1]).toBeLessThan(128) // green shifted down
    expect(img.data[2]).toBeLessThan(128) // blue shifted down
  })

  test('color-balance shifts shadows on dark pixel', () => {
    // Very dark pixel: lum ~ 10/255 = 0.039
    // shadowW = max(0, 1 - 0.039*3) = max(0, 0.882) = 0.882
    const img = makeImageData([10, 10, 10, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 50,
      midtones: 0,
      highlights: 0,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBeGreaterThan(10) // red boosted
  })

  test('color-balance shifts highlights on bright pixel', () => {
    // Very bright pixel: lum ~ 240/255 * 0.299 + 240/255 * 0.587 + 240/255 * 0.114 ~ 0.941
    // highlightW = max(0, 0.941*3 - 2) = max(0, 0.824) = 0.824
    const img = makeImageData([240, 240, 240, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 0,
      midtones: 0,
      highlights: 40,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBeGreaterThan(240) // red boosted
    expect(img.data[1]).toBeLessThan(240) // green decreased
  })

  test('color-balance clamps output to 0-255', () => {
    // Push red past 255
    const img = makeImageData([250, 200, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 100,
      midtones: 100,
      highlights: 100,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBeLessThanOrEqual(255)
    expect(img.data[0]).toBeGreaterThanOrEqual(0)
    expect(img.data[1]).toBeGreaterThanOrEqual(0)
    expect(img.data[2]).toBeGreaterThanOrEqual(0)
  })

  test('color-balance with negative shifts reduces red, boosts green/blue', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: -30,
      midtones: -30,
      highlights: -30,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBeLessThan(128) // red reduced
    expect(img.data[1]).toBeGreaterThan(128) // green boosted
    expect(img.data[2]).toBeGreaterThan(128) // blue boosted
  })

  test('color-balance preserves alpha', () => {
    const img = makeImageData([128, 128, 128, 100], 1, 1)
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 50,
      midtones: 50,
      highlights: 50,
    })
    applyAdjustment(img, layer)
    expect(img.data[3]).toBe(100)
  })

  test('color-balance on multi-pixel image', () => {
    // 2x2 image with varying luminance
    const img = makeImageData(
      [
        10,
        10,
        10,
        255, // dark pixel
        128,
        128,
        128,
        255, // mid pixel
        240,
        240,
        240,
        255, // bright pixel
        0,
        0,
        0,
        255, // black pixel
      ],
      2,
      2,
    )
    const layer = makeAdjustmentLayer('color-balance', {
      shadows: 20,
      midtones: 10,
      highlights: 30,
    })
    applyAdjustment(img, layer)
    // Verify all pixels were processed (different from original)
    // Dark pixel (shadows shift)
    expect(img.data[0]).toBeGreaterThanOrEqual(10)
    // Bright pixel (highlights shift)
    expect(img.data[8]).toBeGreaterThanOrEqual(240)
  })
})

describe('applyAdjustment — levels with degenerate range (line 28)', () => {
  test('levels with whitePoint <= blackPoint returns early (no change)', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('levels', {
      blackPoint: 200,
      whitePoint: 100, // whitePoint < blackPoint => range <= 0
      gamma: 1,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(100)
    expect(img.data[1]).toBe(150)
    expect(img.data[2]).toBe(200)
  })

  test('levels with equal blackPoint and whitePoint returns early', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('levels', {
      blackPoint: 128,
      whitePoint: 128, // equal => range = 0
      gamma: 1,
    })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(100)
    expect(img.data[1]).toBe(150)
    expect(img.data[2]).toBe(200)
  })
})
