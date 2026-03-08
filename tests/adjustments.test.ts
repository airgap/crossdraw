import { describe, it, expect } from 'bun:test'
import { rgbToHsl, hslToRgb, buildCurveLUT } from '@/effects/adjustments'
import type { AdjustmentLayer, LevelsParams, CurvesParams, HueSatParams, ColorBalanceParams } from '@/types'

// Polyfill ImageData for bun test
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
): AdjustmentLayer {
  return {
    id: 'adj-1',
    name: 'test',
    type: 'adjustment',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    adjustmentType,
    params,
  } as unknown as AdjustmentLayer
}

// ─── Color conversion tests ──────────────────────────────────

describe('rgbToHsl', () => {
  it('converts pure red', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0, 2)
    expect(s).toBeCloseTo(1, 2)
    expect(l).toBeCloseTo(0.5, 2)
  })

  it('converts pure green', () => {
    const [h, s, l] = rgbToHsl(0, 255, 0)
    expect(h).toBeCloseTo(1 / 3, 2)
    expect(s).toBeCloseTo(1, 2)
    expect(l).toBeCloseTo(0.5, 2)
  })

  it('converts pure white', () => {
    const [, s, l] = rgbToHsl(255, 255, 255)
    expect(s).toBeCloseTo(0, 2)
    expect(l).toBeCloseTo(1, 2)
  })

  it('converts grey', () => {
    const [, s, l] = rgbToHsl(128, 128, 128)
    expect(s).toBeCloseTo(0, 2)
    expect(l).toBeCloseTo(128 / 255, 1)
  })
})

describe('hslToRgb', () => {
  it('converts red HSL back to RGB', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('converts achromatic (grey)', () => {
    const [r, g, b] = hslToRgb(0, 0, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })

  it('round-trips blue', () => {
    const [h, s, l] = rgbToHsl(0, 0, 255)
    const [r, g, b] = hslToRgb(h, s, l)
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(255)
  })
})

// ─── Curve LUT tests ─────────────────────────────────────────

describe('buildCurveLUT', () => {
  it('identity when no points', () => {
    const lut = buildCurveLUT([])
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i)
    }
  })

  it('identity with diagonal points', () => {
    const lut = buildCurveLUT([
      [0, 0],
      [255, 255],
    ])
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i)
    }
  })

  it('clamps and interpolates midpoint', () => {
    const lut = buildCurveLUT([
      [0, 0],
      [128, 255],
      [255, 255],
    ])
    expect(lut[0]).toBe(0)
    expect(lut[128]).toBe(255)
    expect(lut[255]).toBe(255)
    // Midpoint between 0 and 128 should be roughly 128
    expect(lut[64]).toBeGreaterThan(100)
    expect(lut[64]).toBeLessThan(150)
  })
})

// ─── Levels adjustment tests ─────────────────────────────────

describe('applyAdjustment', () => {
  // Import the function dynamically so the polyfill is used
  const { applyAdjustment } = require('@/effects/adjustments')

  it('levels identity (no change)', () => {
    const img = makeImageData([100, 150, 200, 255], 1, 1)
    const layer = makeAdjustmentLayer('levels', { blackPoint: 0, whitePoint: 255, gamma: 1 })
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(100)
    expect(img.data[1]).toBe(150)
    expect(img.data[2]).toBe(200)
    expect(img.data[3]).toBe(255) // alpha unchanged
  })

  it('levels crushes blacks', () => {
    const img = makeImageData([50, 50, 50, 255], 1, 1)
    const layer = makeAdjustmentLayer('levels', { blackPoint: 100, whitePoint: 255, gamma: 1 })
    applyAdjustment(img, layer)
    // 50 < blackPoint 100, so clamped to 0
    expect(img.data[0]).toBe(0)
    expect(img.data[1]).toBe(0)
    expect(img.data[2]).toBe(0)
  })

  it('hue-sat shifts hue', () => {
    const img = makeImageData([255, 0, 0, 255], 1, 1) // pure red
    const layer = makeAdjustmentLayer('hue-sat', { hue: 120, saturation: 0, lightness: 0 })
    applyAdjustment(img, layer)
    // 120 deg shift from red should move towards green
    expect(img.data[1]).toBeGreaterThan(img.data[0]!) // green > red
  })

  it('skips invisible layers', () => {
    const img = makeImageData([100, 100, 100, 255], 1, 1)
    const layer = makeAdjustmentLayer('levels', { blackPoint: 200, whitePoint: 255, gamma: 1 })
    layer.visible = false
    applyAdjustment(img, layer)
    expect(img.data[0]).toBe(100) // unchanged
  })
})
