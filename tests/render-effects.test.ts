/**
 * Tests for src/effects/render-effects.ts
 *
 * Covers all branches in applyEffects (the main switch) including the
 * newer filter-based effects: progressive-blur, noise, sharpen, motion-blur,
 * radial-blur, color-adjust, wave, twirl, pinch, spherize.
 *
 * OffscreenCanvas and ImageData are both unavailable in Bun, so we polyfill
 * them before importing the module under test.
 */

// ── Polyfill ImageData for Bun ──────────────────────────────────────────────

if (typeof globalThis.ImageData !== 'function') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string

    constructor(sw: number | Uint8ClampedArray, sh?: number, settings?: number) {
      if (typeof sw === 'number') {
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        this.data = sw
        this.width = sh!
        this.height = settings ?? sw.length / (4 * sh!)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── Polyfill OffscreenCanvas for Bun ────────────────────────────────────────

function createMockContext(w: number, h: number) {
  return {
    filter: 'none',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    drawImage: () => {},
    getImageData: (_x: number, _y: number, iw: number, ih: number) => {
      const data = new Uint8ClampedArray(iw * ih * 4)
      // Fill with a recognisable pattern so filters have data to work with
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128
        data[i + 1] = 64
        data[i + 2] = 32
        data[i + 3] = 255
      }
      return new ImageData(data, iw, ih)
    },
    putImageData: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    arc: () => {},
    rect: () => {},
    clip: () => {},
  }
}

const OriginalOffscreenCanvas = globalThis.OffscreenCanvas

globalThis.OffscreenCanvas = class MockOffscreenCanvas {
  width: number
  height: number
  private ctx: ReturnType<typeof createMockContext>

  constructor(w: number, h: number) {
    this.width = w
    this.height = h
    this.ctx = createMockContext(w, h)
  }

  getContext(_type: string) {
    return this.ctx
  }
} as unknown as typeof OffscreenCanvas

import { describe, test, expect, afterAll } from 'bun:test'
import { applyEffects, hasActiveEffects } from '@/effects/render-effects'
import type {
  Effect,
  BlurParams,
  ShadowParams,
  GlowParams,
  InnerShadowParams,
  BackgroundBlurParams,
  ProgressiveBlurParams,
  NoiseEffectParams,
  SharpenEffectParams,
  MotionBlurEffectParams,
  RadialBlurEffectParams,
  ColorAdjustEffectParams,
  WaveEffectParams,
  TwirlEffectParams,
  PinchEffectParams,
  SpherizeEffectParams,
} from '@/types'

afterAll(() => {
  if (OriginalOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = OriginalOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

// ── Helper to build Effect objects ───────────────────────────

function makeEffect(params: Effect['params'], enabled = true, opacity = 1): Effect {
  return {
    id: 'eff-' + Math.random().toString(36).slice(2),
    type: params.kind as Effect['type'],
    enabled,
    opacity,
    params,
  } as Effect
}

function createMockCanvas(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(w, h)
}

// ── hasActiveEffects ─────────────────────────────────────────

describe('hasActiveEffects', () => {
  test('returns false for empty array', () => {
    expect(hasActiveEffects([])).toBe(false)
  })

  test('returns false when all effects are disabled', () => {
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, false),
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 4,
          spread: 0,
          color: '#000',
          opacity: 0.5,
        } as ShadowParams,
        false,
      ),
    ]
    expect(hasActiveEffects(effects)).toBe(false)
  })

  test('returns true when at least one effect is enabled', () => {
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, false),
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 4,
          spread: 0,
          color: '#000',
          opacity: 0.5,
        } as ShadowParams,
        true,
      ),
    ]
    expect(hasActiveEffects(effects)).toBe(true)
  })

  test('returns true when all effects are enabled', () => {
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, true)]
    expect(hasActiveEffects(effects)).toBe(true)
  })
})

// ── applyEffects — original effects ──────────────────────────

describe('applyEffects — original effects', () => {
  test('returns source canvas when no effects', () => {
    const source = createMockCanvas(100, 100)
    const result = applyEffects(source, [])
    expect(result).toBe(source)
  })

  test('returns source canvas when all effects are disabled', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, false),
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 4,
          spread: 0,
          color: '#000',
          opacity: 0.5,
        } as ShadowParams,
        false,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies blur effect and returns new canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 10, quality: 'medium' } as BlurParams, true, 0.8)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBeGreaterThan(source.width)
    expect(result.height).toBeGreaterThan(source.height)
  })

  test('blur with radius=0 returns source canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 0, quality: 'medium' } as BlurParams, true, 1)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies shadow effect', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 5,
          offsetY: 5,
          blurRadius: 10,
          spread: 2,
          color: 'rgba(0,0,0,0.5)',
          opacity: 0.8,
        } as ShadowParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBeGreaterThan(source.width)
  })

  test('applies glow effect', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'glow', radius: 8, spread: 4, color: '#ff0', opacity: 0.6 } as GlowParams, true, 0.9),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBeGreaterThan(source.width)
  })

  test('applies inner-shadow effect with same-size canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'inner-shadow',
          offsetX: 3,
          offsetY: 3,
          blurRadius: 5,
          color: '#000',
          opacity: 0.5,
        } as InnerShadowParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(source.width)
    expect(result.height).toBe(source.height)
  })

  test('applies background-blur effect', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'background-blur', radius: 10 } as BackgroundBlurParams, true)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(source.width)
    expect(result.height).toBe(source.height)
  })

  test('background-blur with radius=0 returns source canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'background-blur', radius: 0 } as BackgroundBlurParams, true)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies multiple effects in sequence', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, true),
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 4,
          spread: 0,
          color: '#000',
          opacity: 0.5,
        } as ShadowParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('skips disabled effects in a mixed list', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, false),
      makeEffect(
        {
          kind: 'shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 4,
          spread: 0,
          color: '#000',
          opacity: 0.5,
        } as ShadowParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })
})

// ── applyEffects — progressive-blur ──────────────────────────

describe('applyEffects — progressive-blur', () => {
  test('applies progressive-blur effect', () => {
    const source = createMockCanvas(50, 50)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'progressive-blur',
          direction: 'linear',
          angle: 0,
          startRadius: 0,
          endRadius: 10,
          startPosition: 0,
          endPosition: 1,
        } as ProgressiveBlurParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(50)
    expect(result.height).toBe(50)
  })

  test('progressive-blur with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'progressive-blur',
          direction: 'linear',
          angle: 0,
          startRadius: 0,
          endRadius: 10,
          startPosition: 0,
          endPosition: 1,
        } as ProgressiveBlurParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('progressive-blur with radial direction', () => {
    const source = createMockCanvas(50, 50)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'progressive-blur',
          direction: 'radial',
          angle: 45,
          startRadius: 0,
          endRadius: 5,
          startPosition: 0.2,
          endPosition: 0.8,
        } as ProgressiveBlurParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })
})

// ── applyEffects — noise ─────────────────────────────────────

describe('applyEffects — noise', () => {
  test('applies gaussian noise effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'noise', noiseType: 'gaussian', amount: 20, monochrome: false, seed: 42 } as NoiseEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('applies uniform noise effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'noise', noiseType: 'uniform', amount: 15, monochrome: true, seed: 7 } as NoiseEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies film-grain noise effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'noise',
          noiseType: 'film-grain',
          amount: 10,
          monochrome: false,
          seed: 99,
          size: 3,
        } as NoiseEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('noise with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'noise', noiseType: 'gaussian', amount: 20, monochrome: false, seed: 1 } as NoiseEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('film-grain without explicit size uses default', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'noise', noiseType: 'film-grain', amount: 10, monochrome: false, seed: 5 } as NoiseEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })
})

// ── applyEffects — sharpen ───────────────────────────────────

describe('applyEffects — sharpen', () => {
  test('applies sharpen effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect({ kind: 'sharpen', amount: 50, radius: 1, threshold: 0 } as SharpenEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('sharpen with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect({ kind: 'sharpen', amount: 50, radius: 1, threshold: 0 } as SharpenEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — motion-blur ───────────────────────────────

describe('applyEffects — motion-blur', () => {
  test('applies motion-blur effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect({ kind: 'motion-blur', angle: 45, distance: 10 } as MotionBlurEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('motion-blur with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect({ kind: 'motion-blur', angle: 0, distance: 5 } as MotionBlurEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — radial-blur ───────────────────────────────

describe('applyEffects — radial-blur', () => {
  test('applies radial-blur effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect({ kind: 'radial-blur', centerX: 0.5, centerY: 0.5, amount: 5 } as RadialBlurEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('radial-blur with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect({ kind: 'radial-blur', centerX: 0.5, centerY: 0.5, amount: 5 } as RadialBlurEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — color-adjust (all sub-types) ──────────────

describe('applyEffects — color-adjust', () => {
  test('applies posterize color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'posterize', levels: 4 } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(20)
  })

  test('applies posterize with default levels when unset', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'posterize' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies threshold color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'color-adjust', adjustType: 'threshold', thresholdValue: 128 } as ColorAdjustEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies threshold with default value when unset', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'threshold' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies invert color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'invert' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies desaturate color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'desaturate' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies vibrance color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'vibrance', vibranceAmount: 50 } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies vibrance with default amount when unset', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'vibrance' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies channel-mixer color adjustment', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect(
        {
          kind: 'color-adjust',
          adjustType: 'channel-mixer',
          channelMatrix: { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 },
        } as ColorAdjustEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('applies channel-mixer with default identity matrix when unset', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'channel-mixer' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('unknown adjustType returns source (default branch)', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'nonexistent' as any } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    // Falls through to default branch which returns source
    expect(result).toBe(source)
  })

  test('color-adjust with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'invert' } as ColorAdjustEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — wave ──────────────────────────────────────

describe('applyEffects — wave', () => {
  test('applies wave effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'wave', amplitudeX: 3, amplitudeY: 3, frequencyX: 1, frequencyY: 1 } as WaveEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('wave with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'wave', amplitudeX: 3, amplitudeY: 3, frequencyX: 1, frequencyY: 1 } as WaveEffectParams,
        true,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — twirl ─────────────────────────────────────

describe('applyEffects — twirl', () => {
  test('applies twirl effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [makeEffect({ kind: 'twirl', angle: Math.PI / 4, radius: 15 } as TwirlEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('twirl with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [makeEffect({ kind: 'twirl', angle: Math.PI / 4, radius: 5 } as TwirlEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — pinch ─────────────────────────────────────

describe('applyEffects — pinch', () => {
  test('applies pinch effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [makeEffect({ kind: 'pinch', amount: 0.5 } as PinchEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('pinch with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [makeEffect({ kind: 'pinch', amount: 0.5 } as PinchEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — spherize ──────────────────────────────────

describe('applyEffects — spherize', () => {
  test('applies spherize effect', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [makeEffect({ kind: 'spherize', amount: 0.5 } as SpherizeEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(30)
  })

  test('spherize with 0x0 canvas returns source', () => {
    const source = createMockCanvas(0, 0)
    const effects: Effect[] = [makeEffect({ kind: 'spherize', amount: 0.5 } as SpherizeEffectParams, true)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})

// ── applyEffects — mixed effect chains ───────────────────────

describe('applyEffects — mixed chains', () => {
  test('chains blur + noise + sharpen', () => {
    const source = createMockCanvas(40, 40)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 3, quality: 'medium' } as BlurParams, true),
      makeEffect(
        { kind: 'noise', noiseType: 'gaussian', amount: 10, monochrome: true, seed: 42 } as NoiseEffectParams,
        true,
      ),
      makeEffect({ kind: 'sharpen', amount: 30, radius: 1, threshold: 0 } as SharpenEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('chains wave + twirl + pinch + spherize', () => {
    const source = createMockCanvas(30, 30)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'wave', amplitudeX: 2, amplitudeY: 2, frequencyX: 1, frequencyY: 1 } as WaveEffectParams,
        true,
      ),
      makeEffect({ kind: 'twirl', angle: Math.PI / 6, radius: 10 } as TwirlEffectParams, true),
      makeEffect({ kind: 'pinch', amount: 0.3 } as PinchEffectParams, true),
      makeEffect({ kind: 'spherize', amount: 0.4 } as SpherizeEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('chains color-adjust + motion-blur + radial-blur', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'color-adjust', adjustType: 'invert' } as ColorAdjustEffectParams, true),
      makeEffect({ kind: 'motion-blur', angle: 0, distance: 3 } as MotionBlurEffectParams, true),
      makeEffect({ kind: 'radial-blur', centerX: 0.5, centerY: 0.5, amount: 2 } as RadialBlurEffectParams, true),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('skips disabled effects in mixed chain', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'wave', amplitudeX: 5, amplitudeY: 5, frequencyX: 2, frequencyY: 2 } as WaveEffectParams,
        false, // disabled
      ),
      makeEffect({ kind: 'pinch', amount: 0.5 } as PinchEffectParams, true), // enabled
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source) // pinch was applied
  })

  test('all effects disabled in long chain returns source', () => {
    const source = createMockCanvas(20, 20)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' } as BlurParams, false),
      makeEffect(
        { kind: 'noise', noiseType: 'gaussian', amount: 10, monochrome: false, seed: 1 } as NoiseEffectParams,
        false,
      ),
      makeEffect({ kind: 'sharpen', amount: 30, radius: 1, threshold: 0 } as SharpenEffectParams, false),
      makeEffect({ kind: 'pinch', amount: 0.5 } as PinchEffectParams, false),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })
})
