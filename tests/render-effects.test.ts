import { describe, test, expect, afterAll } from 'bun:test'
import { applyEffects, hasActiveEffects } from '@/effects/render-effects'
import type { Effect, BlurParams, ShadowParams, GlowParams, InnerShadowParams, BackgroundBlurParams } from '@/types'

// ── Mock OffscreenCanvas and CanvasRenderingContext2D ─────────

function createMockContext() {
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
    getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
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

function createMockCanvas(w: number, h: number): OffscreenCanvas {
  const ctx = createMockContext()
  return {
    width: w,
    height: h,
    getContext: (_type: string) => ctx,
  } as unknown as OffscreenCanvas
}

// Patch OffscreenCanvas globally for tests
const OriginalOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  if (OriginalOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = OriginalOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

globalThis.OffscreenCanvas = class MockOffscreenCanvas {
  width: number
  height: number
  private ctx: ReturnType<typeof createMockContext>

  constructor(w: number, h: number) {
    this.width = w
    this.height = h
    this.ctx = createMockContext()
  }

  getContext(_type: string) {
    return this.ctx
  }
} as unknown as typeof OffscreenCanvas

// ── Helper to build Effect objects ───────────────────────────

function makeEffect(
  params: BlurParams | ShadowParams | GlowParams | InnerShadowParams | BackgroundBlurParams,
  enabled = true,
  opacity = 1,
): Effect {
  const kindToType: Record<string, Effect['type']> = {
    blur: 'blur',
    shadow: 'shadow',
    glow: 'glow',
    'inner-shadow': 'inner-shadow',
    'background-blur': 'background-blur',
  }
  return {
    id: 'eff-' + Math.random().toString(36).slice(2),
    type: kindToType[params.kind] || 'blur',
    enabled,
    opacity,
    params,
  } as Effect
}

// ── hasActiveEffects ─────────────────────────────────────────

describe('hasActiveEffects', () => {
  test('returns false for empty array', () => {
    expect(hasActiveEffects([])).toBe(false)
  })

  test('returns false when all effects are disabled', () => {
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, false),
      makeEffect(
        { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        false,
      ),
    ]
    expect(hasActiveEffects(effects)).toBe(false)
  })

  test('returns true when at least one effect is enabled', () => {
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, false),
      makeEffect(
        { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        true,
      ),
    ]
    expect(hasActiveEffects(effects)).toBe(true)
  })

  test('returns true when all effects are enabled', () => {
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, true)]
    expect(hasActiveEffects(effects)).toBe(true)
  })
})

// ── applyEffects ─────────────────────────────────────────────

describe('applyEffects', () => {
  test('returns source canvas when no effects', () => {
    const source = createMockCanvas(100, 100)
    const result = applyEffects(source, [])
    expect(result).toBe(source) // identity — no effects applied
  })

  test('returns source canvas when all effects are disabled', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, false),
      makeEffect(
        { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        false,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies blur effect and returns new canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 10, quality: 'medium' }, true, 0.8)]
    const result = applyEffects(source, effects)
    // Blur with padding creates a larger canvas
    expect(result).not.toBe(source)
    expect(result.width).toBeGreaterThan(source.width)
    expect(result.height).toBeGreaterThan(source.height)
  })

  test('blur with radius=0 returns source canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'blur', radius: 0, quality: 'medium' }, true, 1)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies shadow effect and returns new canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'shadow', offsetX: 5, offsetY: 5, blurRadius: 10, spread: 2, color: 'rgba(0,0,0,0.5)', opacity: 0.8 },
        true,
        1,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    // Shadow padding expands the canvas
    expect(result.width).toBeGreaterThan(source.width)
  })

  test('applies glow effect and returns new canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'glow', radius: 8, spread: 4, color: '#ff0', opacity: 0.6 }, true, 0.9),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBeGreaterThan(source.width)
  })

  test('applies inner-shadow effect and returns same-size canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'inner-shadow', offsetX: 3, offsetY: 3, blurRadius: 5, color: '#000', opacity: 0.5 }, true, 1),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    // Inner shadow doesn't expand the canvas
    expect(result.width).toBe(source.width)
    expect(result.height).toBe(source.height)
  })

  test('applies background-blur effect and returns same-size canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'background-blur', radius: 10 }, true, 1)]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
    expect(result.width).toBe(source.width)
    expect(result.height).toBe(source.height)
  })

  test('background-blur with radius=0 returns source canvas', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [makeEffect({ kind: 'background-blur', radius: 0 }, true, 1)]
    const result = applyEffects(source, effects)
    expect(result).toBe(source)
  })

  test('applies multiple effects in sequence', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, true, 1),
      makeEffect(
        { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        true,
        1,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source)
  })

  test('skips disabled effects in a mixed list', () => {
    const source = createMockCanvas(100, 100)
    const effects: Effect[] = [
      makeEffect({ kind: 'blur', radius: 5, quality: 'medium' }, false, 1), // disabled
      makeEffect(
        { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        true,
        1,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result).not.toBe(source) // shadow was applied
  })

  test('shadow with zero offset but positive blur still creates padded canvas', () => {
    const source = createMockCanvas(50, 50)
    const effects: Effect[] = [
      makeEffect(
        { kind: 'shadow', offsetX: 0, offsetY: 0, blurRadius: 10, spread: 0, color: '#000', opacity: 1 },
        true,
        1,
      ),
    ]
    const result = applyEffects(source, effects)
    expect(result.width).toBeGreaterThan(50)
  })

  test('glow with large spread creates proportionally larger canvas', () => {
    const source = createMockCanvas(50, 50)
    const effects: Effect[] = [makeEffect({ kind: 'glow', radius: 5, spread: 20, color: '#0f0', opacity: 1 }, true, 1)]
    const result = applyEffects(source, effects)
    expect(result.width).toBeGreaterThan(50 + 20) // pad = ceil((5+20)*3) = 75
  })
})
