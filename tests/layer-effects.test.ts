import { describe, it, expect } from 'bun:test'
import {
  applyBevelEmboss,
  applyColorOverlay,
  applyGradientOverlay,
  applyPatternOverlay,
  applySatin,
} from '@/effects/layer-effects'
import type {
  BevelEmbossEffectParams,
  ColorOverlayEffectParams,
  GradientOverlayEffectParams,
  PatternOverlayEffectParams,
  SatinEffectParams,
} from '@/types'

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

/** Create a circle (opaque in the centre, transparent outside). */
function makeCircle(size: number): ImageData {
  const data: number[] = []
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const inside = dx * dx + dy * dy <= r * r
      if (inside) {
        data.push(128, 128, 128, 255)
      } else {
        data.push(0, 0, 0, 0)
      }
    }
  }
  return makeImageData(data, size, size)
}

/** Count pixels that differ from the original. */
function countChanged(original: ImageData, result: ImageData): number {
  let changed = 0
  for (let i = 0; i < original.data.length; i += 4) {
    if (
      original.data[i] !== result.data[i] ||
      original.data[i + 1] !== result.data[i + 1] ||
      original.data[i + 2] !== result.data[i + 2]
    ) {
      changed++
    }
  }
  return changed
}

// ── Bevel & Emboss ──────────────────────────────────────────

describe('applyBevelEmboss', () => {
  const defaultParams: BevelEmbossEffectParams = {
    kind: 'bevel-emboss',
    style: 'emboss',
    depth: 100,
    direction: 'up',
    size: 2,
    soften: 0,
    angle: 135,
    altitude: 30,
    highlightMode: 'screen',
    highlightOpacity: 0.75,
    highlightColor: '#ffffff',
    shadowMode: 'multiply',
    shadowOpacity: 0.75,
    shadowColor: '#000000',
  }

  it('returns a new ImageData with same dimensions', () => {
    const src = makeCircle(16)
    const result = applyBevelEmboss(src, defaultParams)
    expect(result.width).toBe(16)
    expect(result.height).toBe(16)
    expect(result.data.length).toBe(src.data.length)
    expect(result).not.toBe(src) // new object
  })

  it('modifies opaque pixels at edges where height changes', () => {
    const src = makeCircle(32)
    const result = applyBevelEmboss(src, defaultParams)
    const changed = countChanged(src, result)
    expect(changed).toBeGreaterThan(0)
  })

  it('does not modify fully transparent pixels', () => {
    const src = makeSolid(4, 4, 0, 0, 0, 0)
    const result = applyBevelEmboss(src, { ...defaultParams, style: 'inner-bevel' })
    // All pixels transparent => no change
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('direction "down" reverses the lighting', () => {
    const src = makeCircle(16)
    const up = applyBevelEmboss(src, { ...defaultParams, direction: 'up' })
    const down = applyBevelEmboss(src, { ...defaultParams, direction: 'down' })
    // The two should differ (reversed highlights/shadows)
    let differ = false
    for (let i = 0; i < up.data.length; i += 4) {
      if (up.data[i] !== down.data[i]) {
        differ = true
        break
      }
    }
    expect(differ).toBe(true)
  })

  it('zero size produces minimal change (no blur on height map)', () => {
    const src = makeCircle(16)
    const result = applyBevelEmboss(src, { ...defaultParams, size: 0 })
    // Still should produce some change at the edge due to gradient computation
    expect(result).not.toBe(src)
  })

  it('respects inner-bevel style (skips transparent pixels)', () => {
    const src = makeCircle(16)
    const result = applyBevelEmboss(src, { ...defaultParams, style: 'inner-bevel' })
    // Transparent pixels should remain transparent
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = (y * 16 + x) * 4
        if (src.data[idx + 3] === 0) {
          expect(result.data[idx + 3]).toBe(0)
        }
      }
    }
  })
})

// ── Color Overlay ───────────────────────────────────────────

describe('applyColorOverlay', () => {
  const defaultParams: ColorOverlayEffectParams = {
    kind: 'color-overlay',
    color: '#ff0000',
    opacity: 1.0,
    blendMode: 'normal',
  }

  it('returns a new ImageData with same dimensions', () => {
    const src = makeSolid(4, 4, 128, 128, 128)
    const result = applyColorOverlay(src, defaultParams)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    expect(result).not.toBe(src)
  })

  it('at full opacity fills opaque pixels with the overlay color', () => {
    const src = makeSolid(4, 4, 0, 0, 0)
    const result = applyColorOverlay(src, defaultParams)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255) // red
      expect(result.data[i + 1]).toBe(0) // green
      expect(result.data[i + 2]).toBe(0) // blue
    }
  })

  it('at zero opacity does not change the image', () => {
    const src = makeSolid(4, 4, 100, 200, 50)
    const result = applyColorOverlay(src, { ...defaultParams, opacity: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('does not affect transparent pixels', () => {
    const src = makeSolid(4, 4, 0, 0, 0, 0)
    const result = applyColorOverlay(src, defaultParams)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(0)
      expect(result.data[i + 1]).toBe(0)
      expect(result.data[i + 2]).toBe(0)
      expect(result.data[i + 3]).toBe(0)
    }
  })

  it('at 50% opacity blends between source and overlay', () => {
    const src = makeSolid(4, 4, 0, 0, 0) // black
    const result = applyColorOverlay(src, { ...defaultParams, opacity: 0.5 })
    // 0 * 0.5 + 255 * 0.5 = 127.5 => 128
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeGreaterThanOrEqual(127)
      expect(result.data[i]).toBeLessThanOrEqual(128)
    }
  })
})

// ── Gradient Overlay ────────────────────────────────────────

describe('applyGradientOverlay', () => {
  const defaultParams: GradientOverlayEffectParams = {
    kind: 'gradient-overlay',
    stops: [
      { offset: 0, color: '#000000' },
      { offset: 1, color: '#ffffff' },
    ],
    angle: 0,
    opacity: 1.0,
    blendMode: 'normal',
    style: 'linear',
  }

  it('returns a new ImageData with same dimensions', () => {
    const src = makeSolid(8, 8, 128, 128, 128)
    const result = applyGradientOverlay(src, defaultParams)
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    expect(result).not.toBe(src)
  })

  it('creates a gradient across the image', () => {
    const src = makeSolid(16, 1, 128, 128, 128)
    const result = applyGradientOverlay(src, defaultParams)
    // Left side should be darker, right side lighter for angle=0 (left-to-right)
    const leftR = result.data[0]!
    const rightR = result.data[15 * 4]!
    expect(rightR).toBeGreaterThan(leftR)
  })

  it('does not affect transparent pixels', () => {
    const src = makeSolid(4, 4, 0, 0, 0, 0)
    const result = applyGradientOverlay(src, defaultParams)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i + 3]).toBe(0)
    }
  })

  it('handles single-stop gradient', () => {
    const src = makeSolid(4, 4, 100, 100, 100)
    const result = applyGradientOverlay(src, {
      ...defaultParams,
      stops: [{ offset: 0.5, color: '#ff0000' }],
    })
    // Should fill with red
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255) // red
    }
  })

  it('handles radial style', () => {
    const src = makeSolid(8, 8, 128, 128, 128)
    const result = applyGradientOverlay(src, { ...defaultParams, style: 'radial' })
    // Centre should be near black (stop 0), corners near white (stop 1)
    const centreIdx = (4 * 8 + 4) * 4
    const cornerIdx = 0
    expect(result.data[centreIdx]!).toBeLessThan(result.data[cornerIdx]!)
  })

  it('handles empty stops gracefully', () => {
    const src = makeSolid(4, 4, 100, 100, 100)
    const result = applyGradientOverlay(src, { ...defaultParams, stops: [] })
    // No gradient to apply, image should be unchanged
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })
})

// ── Pattern Overlay ─────────────────────────────────────────

describe('applyPatternOverlay', () => {
  const defaultParams: PatternOverlayEffectParams = {
    kind: 'pattern-overlay',
    scale: 1.0,
    opacity: 1.0,
    blendMode: 'normal',
  }

  it('returns a new ImageData with same dimensions', () => {
    const src = makeSolid(8, 8, 128, 128, 128)
    const result = applyPatternOverlay(src, defaultParams)
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    expect(result).not.toBe(src)
  })

  it('creates a checkerboard pattern on opaque pixels', () => {
    const src = makeSolid(16, 16, 128, 128, 128)
    const result = applyPatternOverlay(src, defaultParams)
    // At scale 1.0, cell size = 8, so there should be alternating light/dark 8x8 cells
    const topLeft = result.data[0]! // cell (0,0) => light (200)
    const topRight = result.data[8 * 4]! // cell (1,0) => dark (55)
    expect(topLeft).not.toBe(topRight)
  })

  it('does not affect transparent pixels', () => {
    const src = makeSolid(4, 4, 0, 0, 0, 0)
    const result = applyPatternOverlay(src, defaultParams)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i + 3]).toBe(0)
    }
  })

  it('at zero opacity preserves original pixels', () => {
    const src = makeSolid(4, 4, 100, 100, 100)
    const result = applyPatternOverlay(src, { ...defaultParams, opacity: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('respects scale parameter', () => {
    const src = makeSolid(32, 32, 128, 128, 128)
    const small = applyPatternOverlay(src, { ...defaultParams, scale: 0.5 })
    const large = applyPatternOverlay(src, { ...defaultParams, scale: 2.0 })
    // With different scales the patterns should differ
    let differ = false
    for (let i = 0; i < small.data.length; i += 4) {
      if (small.data[i] !== large.data[i]) {
        differ = true
        break
      }
    }
    expect(differ).toBe(true)
  })
})

// ── Satin ───────────────────────────────────────────────────

describe('applySatin', () => {
  const defaultParams: SatinEffectParams = {
    kind: 'satin',
    color: '#ff0000',
    opacity: 1.0,
    angle: 45,
    distance: 5,
    size: 3,
    blendMode: 'normal',
    contour: 'linear',
  }

  it('returns a new ImageData with same dimensions', () => {
    const src = makeCircle(16)
    const result = applySatin(src, defaultParams)
    expect(result.width).toBe(16)
    expect(result.height).toBe(16)
    expect(result).not.toBe(src)
  })

  it('modifies pixels within the opaque area', () => {
    const src = makeCircle(32)
    const result = applySatin(src, defaultParams)
    const changed = countChanged(src, result)
    expect(changed).toBeGreaterThan(0)
  })

  it('does not affect transparent pixels', () => {
    const src = makeSolid(4, 4, 0, 0, 0, 0)
    const result = applySatin(src, defaultParams)
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i + 3]).toBe(0)
    }
  })

  it('at zero opacity preserves original pixels', () => {
    const src = makeCircle(16)
    const result = applySatin(src, { ...defaultParams, opacity: 0 })
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })

  it('gaussian contour produces different result from linear', () => {
    const src = makeCircle(32)
    const linear = applySatin(src, { ...defaultParams, contour: 'linear' })
    const gaussian = applySatin(src, { ...defaultParams, contour: 'gaussian' })
    let differ = false
    for (let i = 0; i < linear.data.length; i += 4) {
      if (linear.data[i] !== gaussian.data[i]) {
        differ = true
        break
      }
    }
    expect(differ).toBe(true)
  })

  it('rounded contour produces different result from linear', () => {
    const src = makeCircle(32)
    const linear = applySatin(src, { ...defaultParams, contour: 'linear' })
    const rounded = applySatin(src, { ...defaultParams, contour: 'rounded' })
    let differ = false
    for (let i = 0; i < linear.data.length; i += 4) {
      if (linear.data[i] !== rounded.data[i]) {
        differ = true
        break
      }
    }
    expect(differ).toBe(true)
  })

  it('distance=0 produces minimal effect (offsets cancel)', () => {
    const src = makeCircle(16)
    const result = applySatin(src, { ...defaultParams, distance: 0 })
    // With distance=0 both offset copies are the same, XOR = 0 everywhere
    // So the satin mask is all zero, no color should be applied
    for (let i = 0; i < src.data.length; i++) {
      expect(result.data[i]).toBe(src.data[i])
    }
  })
})
