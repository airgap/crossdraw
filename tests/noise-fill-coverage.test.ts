import { describe, test, expect, afterAll } from 'bun:test'
import { generateNoiseFill, createNoisePattern } from '@/render/noise-fill'
import type { NoiseFillParams } from '@/render/noise-fill'
import type { NoiseFillConfig as NoiseFillConfigType } from '@/types'

// ── Polyfill OffscreenCanvas for Bun test env ──

const origOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext(_type: string) {
      const w = this.width
      const h = this.height
      return {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        }),
        putImageData: () => {},
        drawImage: () => {},
        getImageData: (_x: number, _y: number, iw: number, ih: number) => ({
          data: new Uint8ClampedArray(iw * ih * 4),
          width: iw,
          height: ih,
          colorSpace: 'srgb',
        }),
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
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        canvas: { width: w, height: h },
      }
    }
  }
}

/**
 * Additional coverage tests targeting lines 302, 311-336 in noise-fill.ts:
 * - Line 302: `return new ImageData(data, width, height)` — the native ImageData branch
 * - Lines 311-336: `createNoisePattern` function
 */

function makeParams(overrides: Partial<NoiseFillParams> = {}): NoiseFillParams {
  return {
    noiseType: 'simplex',
    scale: 50,
    octaves: 4,
    persistence: 0.5,
    seed: 42,
    color1: '#000000',
    color2: '#ffffff',
    opacity: 1,
    ...overrides,
  }
}

// ── generateNoiseFill — native ImageData branch (line 302) ──

describe('generateNoiseFill ImageData branch', () => {
  test('returns an object with data, width, height when ImageData is available', () => {
    // In Bun/browser, ImageData should be available
    const result = generateNoiseFill(10, 10, makeParams())
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    expect(result.data).toBeInstanceOf(Uint8ClampedArray)
    expect(result.data.length).toBe(10 * 10 * 4)
  })

  test('returns ImageData instance when constructor is available', () => {
    // In environments where ImageData is defined, we get a real ImageData
    if (typeof ImageData !== 'undefined') {
      const result = generateNoiseFill(5, 5, makeParams())
      expect(result).toBeInstanceOf(ImageData)
    }
  })
})

// ── createNoisePattern (lines 311-336) ──

describe('createNoisePattern', () => {
  test('returns a pattern for simplex noise', () => {
    const patternObj = { _isPattern: true }
    const calls: { method: string; args: any[] }[] = []
    const ctx = {
      createPattern: (...args: any[]) => {
        calls.push({ method: 'createPattern', args })
        return patternObj
      },
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'simplex',
      scale: 50,
      octaves: 4,
      persistence: 0.5,
      seed: 42,
      color1: '#000000',
      color2: '#ffffff',
    }

    const result = createNoisePattern(ctx, config, 100, 100, 1)
    expect(result).toBe(patternObj as any)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args[1]).toBe('repeat')
  })

  test('returns a pattern for perlin noise', () => {
    const ctx = {
      createPattern: () => ({ _type: 'pattern' }),
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'perlin',
      scale: 30,
      octaves: 2,
      persistence: 0.6,
      seed: 99,
      color1: '#ff0000',
      color2: '#0000ff',
    }

    const result = createNoisePattern(ctx, config, 200, 150, 0.8)
    expect(result).not.toBeNull()
  })

  test('returns a pattern for cellular noise', () => {
    const ctx = {
      createPattern: () => ({ _type: 'pattern' }),
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'cellular',
      scale: 20,
      octaves: 3,
      persistence: 0.5,
      seed: 7,
      color1: '#000000',
      color2: '#ffffff',
    }

    const result = createNoisePattern(ctx, config, 64, 64, 1)
    expect(result).not.toBeNull()
  })

  test('returns a pattern for white noise', () => {
    const ctx = {
      createPattern: () => ({ _type: 'pattern' }),
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'white',
      scale: 10,
      octaves: 1,
      persistence: 0.5,
      seed: 123,
      color1: '#111111',
      color2: '#eeeeee',
    }

    const result = createNoisePattern(ctx, config, 50, 50, 0.5)
    expect(result).not.toBeNull()
  })

  test('caps tile size at 512x512 for large dimensions', () => {
    const createPatternArgs: any[] = []
    const ctx = {
      createPattern: (...args: any[]) => {
        createPatternArgs.push(args)
        return {}
      },
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'simplex',
      scale: 50,
      octaves: 1,
      persistence: 0.5,
      seed: 42,
      color1: '#000000',
      color2: '#ffffff',
    }

    createNoisePattern(ctx, config, 2000, 2000, 1)
    // The OffscreenCanvas passed as first arg should be at most 512x512
    const offscreen = createPatternArgs[0][0] as OffscreenCanvas
    expect(offscreen.width).toBeLessThanOrEqual(512)
    expect(offscreen.height).toBeLessThanOrEqual(512)
  })

  test('uses at least 1x1 tile for very small dimensions', () => {
    const createPatternArgs: any[] = []
    const ctx = {
      createPattern: (...args: any[]) => {
        createPatternArgs.push(args)
        return {}
      },
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'simplex',
      scale: 50,
      octaves: 1,
      persistence: 0.5,
      seed: 42,
      color1: '#000000',
      color2: '#ffffff',
    }

    createNoisePattern(ctx, config, 0, 0, 1)
    const offscreen = createPatternArgs[0][0] as OffscreenCanvas
    expect(offscreen.width).toBeGreaterThanOrEqual(1)
    expect(offscreen.height).toBeGreaterThanOrEqual(1)
  })

  test('passes fillOpacity to generateNoiseFill', () => {
    const ctx = {
      createPattern: () => ({}),
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'simplex',
      scale: 50,
      octaves: 1,
      persistence: 0.5,
      seed: 42,
      color1: '#000000',
      color2: '#ffffff',
    }

    // The function should not throw with any valid opacity
    expect(() => createNoisePattern(ctx, config, 10, 10, 0)).not.toThrow()
    expect(() => createNoisePattern(ctx, config, 10, 10, 0.5)).not.toThrow()
    expect(() => createNoisePattern(ctx, config, 10, 10, 1)).not.toThrow()
  })

  test('returns null when createPattern returns null', () => {
    const ctx = {
      createPattern: () => null,
    } as unknown as CanvasRenderingContext2D

    const config: NoiseFillConfigType = {
      noiseType: 'simplex',
      scale: 50,
      octaves: 1,
      persistence: 0.5,
      seed: 42,
      color1: '#000000',
      color2: '#ffffff',
    }

    const result = createNoisePattern(ctx, config, 100, 100, 1)
    expect(result).toBeNull()
  })
})
