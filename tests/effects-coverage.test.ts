// ── Global polyfills for Bun test environment ───────────────────
import { afterAll } from 'bun:test'

const origImageData = (globalThis as any).ImageData
const origOffscreenCanvas = (globalThis as any).OffscreenCanvas

afterAll(() => {
  if (origImageData === undefined) delete (globalThis as any).ImageData
  else (globalThis as any).ImageData = origImageData
  if (origOffscreenCanvas === undefined) delete (globalThis as any).OffscreenCanvas
  else (globalThis as any).OffscreenCanvas = origOffscreenCanvas
})

// ImageData polyfill — many filter modules use `new ImageData(w,h)` directly
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(sw: number | Uint8ClampedArray, sh?: number, _settings?: unknown) {
      if (typeof sw === 'number') {
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        // ImageData(data, width, height?)
        this.data = sw
        this.width = sh!
        this.height = (arguments[2] as number) ?? sw.length / (4 * sh!)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// OffscreenCanvas polyfill — used by render-effects.ts and video-export.ts
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  function parseHexToRgb(hex: string): [number, number, number] {
    let h = hex.replace('#', '')
    if (h.length === 3) {
      h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
    }
    const n = parseInt(h, 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }

  ;(globalThis as Record<string, unknown>).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    _imageData: ImageData
    private _ctx: any = null
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
      this._imageData = new ImageData(w, h)
    }
    getContext(_type: string): any {
      if (this._ctx) return this._ctx
      const self = this
      const ctx = {
        getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
          // If requested size matches canvas, return a copy of internal buffer
          if (sw === self.width && sh === self.height) {
            const copy = new ImageData(sw, sh)
            copy.data.set(self._imageData.data)
            return copy
          }
          return new ImageData(sw, sh)
        },
        putImageData: (data: ImageData) => {
          self._imageData = data
        },
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        fillRect: (x: number, y: number, w: number, h: number) => {
          // Parse fillStyle as hex color and fill the pixel buffer
          const style = ctx.fillStyle
          if (typeof style === 'string' && style.startsWith('#')) {
            const [r, g, b] = parseHexToRgb(style)
            const data = self._imageData.data
            const x0 = Math.max(0, Math.floor(x))
            const y0 = Math.max(0, Math.floor(y))
            const x1 = Math.min(self.width, Math.floor(x + w))
            const y1 = Math.min(self.height, Math.floor(y + h))
            for (let py = y0; py < y1; py++) {
              for (let px = x0; px < x1; px++) {
                const idx = (py * self.width + px) * 4
                data[idx] = r
                data[idx + 1] = g
                data[idx + 2] = b
                data[idx + 3] = 255
              }
            }
          }
        },
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        filter: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        font: '',
        textAlign: 'start',
      }
      this._ctx = ctx as ReturnType<OffscreenCanvas['getContext']>
      return ctx
    }
    transferToImageBitmap() {
      return {}
    }
  }
}

import { describe, it, expect, beforeEach } from 'bun:test'
import { applyBoxBlur } from '@/filters/box-blur'
import { applyGaussianBlur } from '@/filters/gaussian-blur'
import { applySolarize } from '@/filters/solarize'
import { applyEffects, hasActiveEffects } from '@/effects/render-effects'
import {
  validateExportSettings,
  computeFrameOverrides,
  getTimelineDuration,
  renderFrameToImageData,
  defaultVideoExportSettings,
} from '@/animation/video-export'
import type { VideoExportSettings } from '@/animation/video-export'
import {
  getOnionSkinSettings,
  setOnionSkinSettings,
  resetOnionSkinSettings,
  tintImageData,
  computeOnionOverlayFrames,
  computeOnionOverlay,
} from '@/animation/onion-skin'
import type { OnionSkinSettings } from '@/animation/onion-skin'
import type { Effect, Artboard, AnimationTimeline, Keyframe, Layer, VectorLayer } from '@/types'

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

/** Create a checkerboard pattern: alternating black/white pixels. */
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

/** Compute average of a channel across all pixels. */

/** Check if two ImageData buffers are identical. */
function imagesEqual(a: ImageData, b: ImageData): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false
  }
  return true
}

/** Create a minimal artboard for testing. */
function makeArtboard(layers: Layer[] = [], overrides: Partial<Artboard> = {}): Artboard {
  return {
    id: 'ab-1',
    name: 'Test',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: '#ffffff',
    layers,
    ...overrides,
  }
}

/** Create a minimal vector layer for testing. */
function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: 'layer-1',
    name: 'Vector 1',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    paths: [],
    fill: null as unknown as VectorLayer['fill'],
    stroke: null as unknown as VectorLayer['stroke'],
    ...overrides,
  } as VectorLayer
}

function makeKeyframe(time: number, props: Record<string, unknown>, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return {
    id: `kf-${time}`,
    time,
    easing,
    properties: props,
  }
}

// ==============================================================
// Box Blur
// ==============================================================

describe('applyBoxBlur', () => {
  it('returns a copy with radius 0', () => {
    const src = makeSolid(4, 4, 100, 150, 200)
    const result = applyBoxBlur(src, { radius: 0 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
    expect(result.data[3]).toBe(255)
    // Should be a copy, not the same reference
    expect(result.data).not.toBe(src.data)
  })

  it('radius 0 returns identical pixels', () => {
    const src = makeCheckerboard(8, 8)
    const result = applyBoxBlur(src, { radius: 0 })
    expect(imagesEqual(src, result)).toBe(true)
  })

  it('radius 1 blurs a checkerboard', () => {
    const src = makeCheckerboard(8, 8)
    const result = applyBoxBlur(src, { radius: 1 })
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    // After blurring a checkerboard, the variance should decrease
    // Center pixels should tend toward ~128 (average of 0 and 255)
    const centerPx = (3 * 8 + 3) * 4
    const val = result.data[centerPx]!
    expect(val).toBeGreaterThan(20)
    expect(val).toBeLessThan(235)
  })

  it('handles a 1x1 image', () => {
    const src = makeSolid(1, 1, 42, 99, 200)
    const result = applyBoxBlur(src, { radius: 5 })
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    // With a 1x1 image, the blur should leave it unchanged since every
    // clamped sample points to the single pixel
    expect(result.data[0]).toBe(42)
    expect(result.data[1]).toBe(99)
    expect(result.data[2]).toBe(200)
    expect(result.data[3]).toBe(255)
  })

  it('large radius on a solid image leaves it unchanged', () => {
    const src = makeSolid(10, 10, 77, 77, 77)
    const result = applyBoxBlur(src, { radius: 50 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(77)
      expect(result.data[i + 1]).toBe(77)
      expect(result.data[i + 2]).toBe(77)
    }
  })

  it('preserves alpha on a uniform-alpha image', () => {
    const src = makeSolid(6, 6, 100, 100, 100, 200)
    const result = applyBoxBlur(src, { radius: 2 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(200)
    }
  })

  it('negative radius treated as zero (returns copy)', () => {
    const src = makeSolid(3, 3, 10, 20, 30)
    const result = applyBoxBlur(src, { radius: -5 })
    expect(imagesEqual(src, result)).toBe(true)
  })
})

// ==============================================================
// Gaussian Blur
// ==============================================================

describe('applyGaussianBlur', () => {
  it('returns a copy with radius 0', () => {
    const src = makeSolid(4, 4, 100, 150, 200)
    const result = applyGaussianBlur(src, { radius: 0 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    expect(result.data[0]).toBe(100)
    expect(result.data).not.toBe(src.data)
  })

  it('radius 0 returns identical pixels', () => {
    const src = makeCheckerboard(6, 6)
    const result = applyGaussianBlur(src, { radius: 0 })
    expect(imagesEqual(src, result)).toBe(true)
  })

  it('radius 1 blurs a checkerboard', () => {
    const src = makeCheckerboard(8, 8)
    const result = applyGaussianBlur(src, { radius: 1 })
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    const centerPx = (3 * 8 + 3) * 4
    const val = result.data[centerPx]!
    expect(val).toBeGreaterThan(20)
    expect(val).toBeLessThan(235)
  })

  it('handles a 1x1 image', () => {
    const src = makeSolid(1, 1, 55, 110, 220)
    const result = applyGaussianBlur(src, { radius: 10 })
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(result.data[0]).toBe(55)
    expect(result.data[1]).toBe(110)
    expect(result.data[2]).toBe(220)
  })

  it('large radius on a solid image leaves it unchanged', () => {
    const src = makeSolid(10, 10, 128, 128, 128)
    const result = applyGaussianBlur(src, { radius: 50 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
    }
  })

  it('negative radius treated as zero (returns copy)', () => {
    const src = makeSolid(3, 3, 10, 20, 30)
    const result = applyGaussianBlur(src, { radius: -3 })
    expect(imagesEqual(src, result)).toBe(true)
  })

  it('blurring reduces contrast of a high-contrast image', () => {
    const src = makeCheckerboard(16, 16)
    const result = applyGaussianBlur(src, { radius: 3 })
    // Min and max should be closer together
    let minVal = 255
    let maxVal = 0
    for (let i = 0; i < result.data.length; i += 4) {
      const v = result.data[i]!
      if (v < minVal) minVal = v
      if (v > maxVal) maxVal = v
    }
    // The original has min=0, max=255. After blur, the range should shrink.
    expect(maxVal - minVal).toBeLessThan(255)
  })
})

// ==============================================================
// Solarize
// ==============================================================

describe('applySolarize', () => {
  it('threshold 255 — no pixels exceed, result equals input', () => {
    const src = makeSolid(4, 4, 100, 200, 50)
    const result = applySolarize(src, { threshold: 255 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(100)
      expect(result.data[i + 1]).toBe(200)
      expect(result.data[i + 2]).toBe(50)
    }
  })

  it('threshold 0 — all pixels inverted', () => {
    const src = makeSolid(2, 2, 100, 200, 50)
    const result = applySolarize(src, { threshold: 0 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(155) // 255 - 100
      expect(result.data[i + 1]).toBe(55) // 255 - 200
      expect(result.data[i + 2]).toBe(205) // 255 - 50
    }
  })

  it('threshold between channels — selective inversion', () => {
    // R=100, G=200, B=50, threshold=150
    // R=100 <=150 -> 100 (unchanged), G=200>150 -> 55, B=50<=150 -> 50
    const src = makeSolid(2, 2, 100, 200, 50)
    const result = applySolarize(src, { threshold: 150 })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(100)
      expect(result.data[i + 1]).toBe(55)
      expect(result.data[i + 2]).toBe(50)
    }
  })

  it('preserves alpha channel', () => {
    const src = makeSolid(2, 2, 200, 200, 200, 128)
    const result = applySolarize(src, { threshold: 100 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
    }
  })

  it('does not modify the source ImageData', () => {
    const src = makeSolid(2, 2, 200, 200, 200)
    const origVal = src.data[0]
    applySolarize(src, { threshold: 100 })
    expect(src.data[0]).toBe(origVal)
  })

  it('exact threshold value — pixel at threshold is NOT inverted', () => {
    // Threshold comparison is strictly greater-than: val > threshold
    const src = makeSolid(1, 1, 128, 128, 128)
    const result = applySolarize(src, { threshold: 128 })
    // 128 is NOT > 128, so no inversion
    expect(result.data[0]).toBe(128)
  })

  it('pixel value one above threshold — inverted', () => {
    const src = makeSolid(1, 1, 129, 129, 129)
    const result = applySolarize(src, { threshold: 128 })
    // 129 > 128 => 255 - 129 = 126
    expect(result.data[0]).toBe(126)
  })

  it('returns correct dimensions', () => {
    const src = makeSolid(7, 3, 0, 0, 0)
    const result = applySolarize(src, { threshold: 128 })
    expect(result.width).toBe(7)
    expect(result.height).toBe(3)
  })

  it('handles image with varied per-pixel values', () => {
    // Two pixels: [0, 128, 255, 255] and [50, 200, 100, 255]
    const src = makeImageData([0, 128, 255, 255, 50, 200, 100, 255], 2, 1)
    const result = applySolarize(src, { threshold: 127 })
    // Pixel 0: R=0<=127->0, G=128>127->127, B=255>127->0
    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(127)
    expect(result.data[2]).toBe(0)
    // Pixel 1: R=50<=127->50, G=200>127->55, B=100<=127->100
    expect(result.data[4]).toBe(50)
    expect(result.data[5]).toBe(55)
    expect(result.data[6]).toBe(100)
  })
})

// ==============================================================
// render-effects.ts — applyEffects dispatch + hasActiveEffects
// ==============================================================

describe('render-effects', () => {
  function mockOffscreenCanvas(w: number, h: number): OffscreenCanvas {
    return new OffscreenCanvas(w, h)
  }

  describe('hasActiveEffects', () => {
    it('returns false for empty effects array', () => {
      expect(hasActiveEffects([])).toBe(false)
    })

    it('returns false when all effects disabled', () => {
      const effects: Effect[] = [
        { id: '1', type: 'blur', enabled: false, opacity: 1, params: { kind: 'blur', radius: 5, quality: 'medium' } },
        {
          id: '2',
          type: 'solarize',
          enabled: false,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
      ]
      expect(hasActiveEffects(effects)).toBe(false)
    })

    it('returns true when at least one effect enabled', () => {
      const effects: Effect[] = [
        { id: '1', type: 'blur', enabled: false, opacity: 1, params: { kind: 'blur', radius: 5, quality: 'medium' } },
        {
          id: '2',
          type: 'solarize',
          enabled: true,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
      ]
      expect(hasActiveEffects(effects)).toBe(true)
    })
  })

  describe('applyEffects dispatch', () => {
    it('returns source unchanged for empty effects list', () => {
      const src = mockOffscreenCanvas(10, 10)
      const result = applyEffects(src, [])
      expect(result).toBe(src)
    })

    it('skips disabled effects', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'solarize',
          enabled: false,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        { id: '1', type: 'blur', enabled: true, opacity: 1, params: { kind: 'blur', radius: 5, quality: 'medium' } },
      ]
      const result = applyEffects(src, effects)
      // Blur with radius>0 creates a new larger canvas (padding)
      expect(result).not.toBe(src)
      expect(result.width).toBeGreaterThanOrEqual(src.width)
    })

    it('dispatches blur effect with radius 0 returns source', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        { id: '1', type: 'blur', enabled: true, opacity: 1, params: { kind: 'blur', radius: 0, quality: 'medium' } },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches shadow effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'shadow',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'shadow',
            offsetX: 2,
            offsetY: 2,
            blurRadius: 4,
            spread: 0,
            color: '#000000',
            opacity: 0.5,
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches glow effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'glow',
          enabled: true,
          opacity: 1,
          params: { kind: 'glow', radius: 5, spread: 2, color: '#ff0000', opacity: 0.8 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches inner-shadow effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'inner-shadow',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'inner-shadow',
            offsetX: 1,
            offsetY: 1,
            blurRadius: 3,
            color: '#000000',
            opacity: 0.5,
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches background-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'background-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'background-blur', radius: 5 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches background-blur with radius 0 returns source', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'background-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'background-blur', radius: 0 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches noise effect (gaussian)', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'noise',
          enabled: true,
          opacity: 1,
          params: { kind: 'noise', noiseType: 'gaussian', amount: 25, monochrome: false, seed: 42 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches noise effect (uniform)', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'noise',
          enabled: true,
          opacity: 1,
          params: { kind: 'noise', noiseType: 'uniform', amount: 25, monochrome: true, seed: 42 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches noise effect (film-grain)', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'noise',
          enabled: true,
          opacity: 1,
          params: { kind: 'noise', noiseType: 'film-grain', amount: 25, monochrome: false, seed: 42, size: 3 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches sharpen effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'sharpen',
          enabled: true,
          opacity: 1,
          params: { kind: 'sharpen', amount: 50, radius: 1, threshold: 0 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches motion-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'motion-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'motion-blur', angle: 0, distance: 5 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches radial-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'radial-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'radial-blur', centerX: 0.5, centerY: 0.5, amount: 10 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust posterize effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-adjust', adjustType: 'posterize', levels: 4 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust threshold effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-adjust', adjustType: 'threshold', thresholdValue: 128 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust invert effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-adjust', adjustType: 'invert' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust desaturate effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-adjust', adjustType: 'desaturate' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust vibrance effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-adjust', adjustType: 'vibrance', vibranceAmount: 50 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-adjust channel-mixer effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-adjust',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'color-adjust',
            adjustType: 'channel-mixer',
            channelMatrix: { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 },
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches wave effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'wave',
          enabled: true,
          opacity: 1,
          params: { kind: 'wave', amplitudeX: 5, amplitudeY: 5, frequencyX: 0.1, frequencyY: 0.1 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches twirl effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'twirl',
          enabled: true,
          opacity: 1,
          params: { kind: 'twirl', angle: 45, radius: 50 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches pinch effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'pinch',
          enabled: true,
          opacity: 1,
          params: { kind: 'pinch', amount: 0.5 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches spherize effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'spherize',
          enabled: true,
          opacity: 1,
          params: { kind: 'spherize', amount: 0.5 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches ripple effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'ripple',
          enabled: true,
          opacity: 1,
          params: { kind: 'ripple', amplitude: 5, frequency: 2, direction: 'both' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches zigzag effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'zigzag',
          enabled: true,
          opacity: 1,
          params: { kind: 'zigzag', amount: 5, ridges: 3 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches polar-coordinates effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'polar-coordinates',
          enabled: true,
          opacity: 1,
          params: { kind: 'polar-coordinates', mode: 'rectangular-to-polar' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches gaussian-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'gaussian-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'gaussian-blur', radius: 3 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches gaussian-blur with radius 0 returns source', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'gaussian-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'gaussian-blur', radius: 0 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches box-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'box-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'box-blur', radius: 3 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches box-blur with radius 0 returns source', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'box-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'box-blur', radius: 0 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches solarize effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'solarize',
          enabled: true,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches emboss effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'emboss',
          enabled: true,
          opacity: 1,
          params: { kind: 'emboss', angle: 135, height: 1, amount: 100 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches find-edges effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'find-edges',
          enabled: true,
          opacity: 1,
          params: { kind: 'find-edges', threshold: 20 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches wind effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'wind',
          enabled: true,
          opacity: 1,
          params: { kind: 'wind', strength: 20, direction: 'right', method: 'wind' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches surface-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'surface-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'surface-blur', radius: 3, threshold: 25 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches brightness-contrast effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'brightness-contrast',
          enabled: true,
          opacity: 1,
          params: { kind: 'brightness-contrast', brightness: 20, contrast: 10 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches shadow-highlight effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'shadow-highlight',
          enabled: true,
          opacity: 1,
          params: { kind: 'shadow-highlight', shadows: 50, highlights: -30 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches exposure effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'exposure',
          enabled: true,
          opacity: 1,
          params: { kind: 'exposure', exposure: 1.0, offset: 0, gamma: 1.0 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches photo-filter effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'photo-filter',
          enabled: true,
          opacity: 1,
          params: { kind: 'photo-filter', color: '#ec8a00', density: 50, preserveLuminosity: true },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches black-white mixer effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'black-white',
          enabled: true,
          opacity: 1,
          params: { kind: 'black-white', reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches oil-paint effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'oil-paint',
          enabled: true,
          opacity: 1,
          params: { kind: 'oil-paint', radius: 2, levels: 8 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches halftone effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'halftone',
          enabled: true,
          opacity: 1,
          params: { kind: 'halftone', dotSize: 4, angle: 45, shape: 'circle' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches pixelate effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'pixelate',
          enabled: true,
          opacity: 1,
          params: { kind: 'pixelate', cellSize: 4, mode: 'mosaic' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches smart-sharpen effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'smart-sharpen',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'smart-sharpen',
            amount: 100,
            radius: 1,
            noiseReduction: 10,
            shadowFade: 0,
            highlightFade: 0,
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches lut effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      // A 2x2x2 identity LUT
      const lutData: number[] = []
      for (let b = 0; b < 2; b++) {
        for (let g = 0; g < 2; g++) {
          for (let r = 0; r < 2; r++) {
            lutData.push(r * 255, g * 255, b * 255)
          }
        }
      }
      const effects: Effect[] = [
        {
          id: '1',
          type: 'lut',
          enabled: true,
          opacity: 1,
          params: { kind: 'lut', lutData, size: 2 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches selective-color effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const channel = { cyan: 0, magenta: 0, yellow: 0, black: 0 }
      const effects: Effect[] = [
        {
          id: '1',
          type: 'selective-color',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'selective-color',
            reds: channel,
            yellows: channel,
            greens: channel,
            cyans: channel,
            blues: channel,
            magentas: channel,
            whites: channel,
            neutrals: channel,
            blacks: channel,
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches clouds effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'clouds',
          enabled: true,
          opacity: 1,
          params: { kind: 'clouds', scale: 50, seed: 42, turbulence: false },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches lens-flare effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'lens-flare',
          enabled: true,
          opacity: 1,
          params: { kind: 'lens-flare', x: 0.5, y: 0.5, brightness: 100, lensType: 'standard' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches lighting effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'lighting',
          enabled: true,
          opacity: 1,
          params: { kind: 'lighting', lightX: 0.5, lightY: 0.5, intensity: 1, ambientLight: 0.3, surfaceHeight: 1 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches clarity effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'clarity',
          enabled: true,
          opacity: 1,
          params: { kind: 'clarity', amount: 50 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches denoise effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'denoise',
          enabled: true,
          opacity: 1,
          params: { kind: 'denoise', strength: 50, detail: 50 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches lens-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'lens-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'lens-blur', radius: 3, bladeCount: 6, rotation: 0, brightness: 0, threshold: 128 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches lens-blur with radius 0 returns source', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'lens-blur',
          enabled: true,
          opacity: 1,
          params: { kind: 'lens-blur', radius: 0, bladeCount: 6, rotation: 0, brightness: 0, threshold: 128 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).toBe(src)
    })

    it('dispatches displace effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'displace',
          enabled: true,
          opacity: 1,
          params: { kind: 'displace', scaleX: 10, scaleY: 10, wrap: 'clamp' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches glass effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'glass',
          enabled: true,
          opacity: 1,
          params: { kind: 'glass', distortion: 5, smoothness: 3, texture: 'frosted', scale: 100 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches bevel-emboss effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'bevel-emboss',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'bevel-emboss',
            style: 'inner-bevel',
            depth: 100,
            direction: 'up',
            size: 5,
            soften: 0,
            angle: 120,
            altitude: 30,
            highlightMode: 'screen',
            highlightOpacity: 0.75,
            highlightColor: '#ffffff',
            shadowMode: 'multiply',
            shadowOpacity: 0.75,
            shadowColor: '#000000',
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches color-overlay effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'color-overlay',
          enabled: true,
          opacity: 1,
          params: { kind: 'color-overlay', color: '#ff0000', opacity: 0.5, blendMode: 'normal' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches gradient-overlay effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'gradient-overlay',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'gradient-overlay',
            stops: [
              { offset: 0, color: '#000000' },
              { offset: 1, color: '#ffffff' },
            ],
            angle: 90,
            opacity: 1,
            blendMode: 'normal',
            style: 'linear',
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches pattern-overlay effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'pattern-overlay',
          enabled: true,
          opacity: 1,
          params: { kind: 'pattern-overlay', scale: 100, opacity: 1, blendMode: 'normal' },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches satin effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'satin',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'satin',
            color: '#000000',
            opacity: 0.5,
            angle: 19,
            distance: 11,
            size: 14,
            blendMode: 'multiply',
            contour: 'linear',
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('dispatches progressive-blur effect', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'progressive-blur',
          enabled: true,
          opacity: 1,
          params: {
            kind: 'progressive-blur',
            direction: 'linear',
            angle: 0,
            startRadius: 0,
            endRadius: 5,
            startPosition: 0,
            endPosition: 1,
          },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('processes multiple enabled effects in sequence', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'solarize',
          enabled: true,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
        {
          id: '2',
          type: 'emboss',
          enabled: true,
          opacity: 1,
          params: { kind: 'emboss', angle: 135, height: 1, amount: 100 },
        },
      ]
      const result = applyEffects(src, effects)
      expect(result).not.toBe(src)
    })

    it('skips disabled effects in a mixed list', () => {
      const src = mockOffscreenCanvas(10, 10)
      const effects: Effect[] = [
        {
          id: '1',
          type: 'solarize',
          enabled: false,
          opacity: 1,
          params: { kind: 'solarize', threshold: 128 },
        },
        {
          id: '2',
          type: 'emboss',
          enabled: true,
          opacity: 1,
          params: { kind: 'emboss', angle: 135, height: 1, amount: 100 },
        },
      ]
      const result = applyEffects(src, effects)
      // Only the emboss effect should have run
      expect(result).not.toBe(src)
    })
  })
})

// ==============================================================
// video-export.ts
// ==============================================================

describe('video-export', () => {
  describe('validateExportSettings', () => {
    it('returns no errors for valid default settings', () => {
      const errors = validateExportSettings(defaultVideoExportSettings)
      expect(errors).toEqual([])
    })

    it('rejects invalid format', () => {
      const settings = { ...defaultVideoExportSettings, format: 'avi' as 'mp4' }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Invalid format'))).toBe(true)
    })

    it('rejects width < 1', () => {
      const settings = { ...defaultVideoExportSettings, width: 0 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Width'))).toBe(true)
    })

    it('rejects width > 7680', () => {
      const settings = { ...defaultVideoExportSettings, width: 8000 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Width'))).toBe(true)
    })

    it('rejects height < 1', () => {
      const settings = { ...defaultVideoExportSettings, height: 0 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Height'))).toBe(true)
    })

    it('rejects height > 4320', () => {
      const settings = { ...defaultVideoExportSettings, height: 5000 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Height'))).toBe(true)
    })

    it('rejects fps < 1', () => {
      const settings = { ...defaultVideoExportSettings, fps: 0 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('FPS'))).toBe(true)
    })

    it('rejects fps > 120', () => {
      const settings = { ...defaultVideoExportSettings, fps: 121 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('FPS'))).toBe(true)
    })

    it('rejects quality < 0', () => {
      const settings = { ...defaultVideoExportSettings, quality: -1 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Quality'))).toBe(true)
    })

    it('rejects quality > 100', () => {
      const settings = { ...defaultVideoExportSettings, quality: 101 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Quality'))).toBe(true)
    })

    it('rejects negative frame range start', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        frameRange: [-1, 10],
      }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('start'))).toBe(true)
    })

    it('rejects frame range end < start', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        frameRange: [10, 5],
      }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('end'))).toBe(true)
    })

    it('accepts valid frame range', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        frameRange: [0, 10],
      }
      const errors = validateExportSettings(settings)
      expect(errors).toEqual([])
    })

    it('rejects negative loop count', () => {
      const settings = { ...defaultVideoExportSettings, loopCount: -1 }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('Loop count'))).toBe(true)
    })

    it('accepts loop count 0 (infinite)', () => {
      const settings = { ...defaultVideoExportSettings, loopCount: 0 }
      const errors = validateExportSettings(settings)
      expect(errors).toEqual([])
    })

    it('MP4 requires even width', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        format: 'mp4',
        width: 801,
        height: 600,
      }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('MP4 width must be even'))).toBe(true)
    })

    it('MP4 requires even height', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        format: 'mp4',
        width: 800,
        height: 601,
      }
      const errors = validateExportSettings(settings)
      expect(errors.some((e) => e.includes('MP4 height must be even'))).toBe(true)
    })

    it('MP4 with even dimensions is valid', () => {
      const settings: VideoExportSettings = {
        ...defaultVideoExportSettings,
        format: 'mp4',
        width: 800,
        height: 600,
      }
      const errors = validateExportSettings(settings)
      expect(errors).toEqual([])
    })

    it('can accumulate multiple errors', () => {
      const settings: VideoExportSettings = {
        format: 'flv' as 'mp4',
        width: 0,
        height: 0,
        fps: 0,
        quality: -1,
        frameRange: [-1, -5],
        loopCount: -1,
        backgroundColor: '#ffffff',
      }
      const errors = validateExportSettings(settings)
      expect(errors.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('getTimelineDuration', () => {
    it('returns default 3000ms for artboard with no animated layers', () => {
      const ab = makeArtboard()
      expect(getTimelineDuration(ab)).toBe(3000)
    })

    it('returns max duration across animated layers', () => {
      const layer1 = makeVectorLayer({
        id: 'l1',
        animation: {
          duration: 2000,
          loop: false,
          keyframes: [makeKeyframe(0, { x: 0 }), makeKeyframe(2000, { x: 100 })],
        },
      })
      const layer2 = makeVectorLayer({
        id: 'l2',
        animation: {
          duration: 5000,
          loop: false,
          keyframes: [makeKeyframe(0, { y: 0 }), makeKeyframe(5000, { y: 200 })],
        },
      })
      const ab = makeArtboard([layer1, layer2])
      expect(getTimelineDuration(ab)).toBe(5000)
    })

    it('traverses groups recursively', () => {
      const innerLayer = makeVectorLayer({
        id: 'inner',
        animation: {
          duration: 4000,
          loop: false,
          keyframes: [makeKeyframe(0, { x: 0 }), makeKeyframe(4000, { x: 50 })],
        },
      })
      const group = {
        id: 'g1',
        name: 'Group',
        type: 'group' as const,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        children: [innerLayer],
      }
      const ab = makeArtboard([group as Layer])
      expect(getTimelineDuration(ab)).toBe(4000)
    })
  })

  describe('computeFrameOverrides', () => {
    it('returns empty map for artboard with no animated layers', () => {
      const ab = makeArtboard()
      const overrides = computeFrameOverrides(ab, 1000)
      expect(overrides.size).toBe(0)
    })

    it('returns interpolated properties for animated layers', () => {
      const layer = makeVectorLayer({
        id: 'anim-layer',
        animation: {
          duration: 2000,
          loop: false,
          keyframes: [makeKeyframe(0, { x: 0 }), makeKeyframe(2000, { x: 200 })],
        },
      })
      const ab = makeArtboard([layer])
      const overrides = computeFrameOverrides(ab, 1000)
      expect(overrides.has('anim-layer')).toBe(true)
      const props = overrides.get('anim-layer')!
      expect(props.x).toBeCloseTo(100, 0)
    })

    it('loops animation when track.loop is true', () => {
      const layer = makeVectorLayer({
        id: 'loop-layer',
        animation: {
          duration: 1000,
          loop: true,
          keyframes: [makeKeyframe(0, { x: 0 }), makeKeyframe(1000, { x: 100 })],
        },
      })
      const ab = makeArtboard([layer])
      // At time 1500ms with a 1000ms loop, effective time is 500ms
      const overrides = computeFrameOverrides(ab, 1500)
      expect(overrides.has('loop-layer')).toBe(true)
      const props = overrides.get('loop-layer')!
      expect(props.x).toBeCloseTo(50, 0)
    })

    it('clamps time to duration for non-looping tracks', () => {
      const layer = makeVectorLayer({
        id: 'clamp-layer',
        animation: {
          duration: 1000,
          loop: false,
          keyframes: [makeKeyframe(0, { x: 0 }), makeKeyframe(1000, { x: 100 })],
        },
      })
      const ab = makeArtboard([layer])
      // At time 5000ms with non-looping 1000ms track, should clamp to 1000
      const overrides = computeFrameOverrides(ab, 5000)
      const props = overrides.get('clamp-layer')!
      expect(props.x).toBeCloseTo(100, 0)
    })
  })

  describe('renderFrameToImageData', () => {
    it('renders a frame with background color', () => {
      const ab = makeArtboard()
      const frame = renderFrameToImageData(0, ab, 24, 4, 4, '#ff0000')
      expect(frame.width).toBe(4)
      expect(frame.height).toBe(4)
      // Background should be red
      expect(frame.data[0]).toBe(255) // R
      expect(frame.data[1]).toBe(0) // G
      expect(frame.data[2]).toBe(0) // B
      expect(frame.data[3]).toBe(255) // A
    })

    it('renders with white background', () => {
      const ab = makeArtboard()
      const frame = renderFrameToImageData(0, ab, 24, 2, 2, '#ffffff')
      expect(frame.data[0]).toBe(255)
      expect(frame.data[1]).toBe(255)
      expect(frame.data[2]).toBe(255)
    })

    it('renders with black background', () => {
      const ab = makeArtboard()
      const frame = renderFrameToImageData(0, ab, 24, 2, 2, '#000000')
      expect(frame.data[0]).toBe(0)
      expect(frame.data[1]).toBe(0)
      expect(frame.data[2]).toBe(0)
    })

    it('renders correct dimensions', () => {
      const ab = makeArtboard()
      const frame = renderFrameToImageData(0, ab, 24, 100, 50, '#ffffff')
      expect(frame.width).toBe(100)
      expect(frame.height).toBe(50)
      expect(frame.data.length).toBe(100 * 50 * 4)
    })

    it('parses 3-char hex colors', () => {
      const ab = makeArtboard()
      const frame = renderFrameToImageData(0, ab, 24, 2, 2, '#f00')
      expect(frame.data[0]).toBe(255) // R
      expect(frame.data[1]).toBe(0) // G
      expect(frame.data[2]).toBe(0) // B
    })
  })
})

// ==============================================================
// onion-skin.ts
// ==============================================================

describe('onion-skin', () => {
  beforeEach(() => {
    resetOnionSkinSettings()
  })

  describe('getOnionSkinSettings / setOnionSkinSettings / resetOnionSkinSettings', () => {
    it('returns default settings initially', () => {
      const s = getOnionSkinSettings()
      expect(s.enabled).toBe(false)
      expect(s.previousFrames).toBe(2)
      expect(s.nextFrames).toBe(1)
      expect(s.previousColor).toBe('#ff0000')
      expect(s.nextColor).toBe('#00ff00')
      expect(s.opacity).toBe(0.3)
      expect(s.falloff).toBe(0.5)
    })

    it('updates settings partially', () => {
      setOnionSkinSettings({ enabled: true, opacity: 0.8 })
      const s = getOnionSkinSettings()
      expect(s.enabled).toBe(true)
      expect(s.opacity).toBe(0.8)
      // Other values remain default
      expect(s.previousFrames).toBe(2)
    })

    it('returns a copy, not a reference', () => {
      const s1 = getOnionSkinSettings()
      s1.enabled = true
      const s2 = getOnionSkinSettings()
      expect(s2.enabled).toBe(false)
    })

    it('reset restores defaults', () => {
      setOnionSkinSettings({ enabled: true, opacity: 0.9, previousFrames: 5 })
      resetOnionSkinSettings()
      const s = getOnionSkinSettings()
      expect(s.enabled).toBe(false)
      expect(s.opacity).toBe(0.3)
      expect(s.previousFrames).toBe(2)
    })
  })

  describe('tintImageData', () => {
    it('tints pixels with red and scales alpha', () => {
      const src = makeSolid(2, 2, 200, 200, 200, 255)
      tintImageData(src, '#ff0000', 0.5)
      // tintStrength=0.5, so R = round(200*0.5 + 255*0.5) = round(100+127.5) = 228
      // G = round(200*0.5 + 0*0.5) = 100
      // B = round(200*0.5 + 0*0.5) = 100
      // A = round(255 * 0.5) = 128
      expect(src.data[0]).toBe(228)
      expect(src.data[1]).toBe(100)
      expect(src.data[2]).toBe(100)
      expect(src.data[3]).toBe(128)
    })

    it('mutates in place and returns the same ImageData', () => {
      const src = makeSolid(1, 1, 100, 100, 100)
      const result = tintImageData(src, '#00ff00', 1.0)
      expect(result).toBe(src)
    })

    it('opacity 0 sets alpha to 0', () => {
      const src = makeSolid(1, 1, 100, 100, 100, 200)
      tintImageData(src, '#ffffff', 0)
      expect(src.data[3]).toBe(0)
    })

    it('handles short hex (#rgb) colors', () => {
      const src = makeSolid(1, 1, 0, 0, 0, 255)
      tintImageData(src, '#f00', 1.0)
      // R = round(0*0.5 + 255*0.5) = 128
      expect(src.data[0]).toBe(128)
      expect(src.data[1]).toBe(0)
      expect(src.data[2]).toBe(0)
    })
  })

  describe('computeOnionOverlayFrames', () => {
    function makeTimeline(frameCount: number, loop = true): AnimationTimeline {
      const frames = Array.from({ length: frameCount }, (_, i) => ({
        id: `f-${i}`,
        name: `Frame ${i + 1}`,
        duration: 0,
        layerVisibility: {},
      }))
      return { frames, fps: 12, loop, currentFrame: 0 }
    }

    it('returns empty when disabled', () => {
      const timeline = makeTimeline(5)
      const ab = makeArtboard()
      const overlays = computeOnionOverlayFrames(timeline, 2, ab)
      // Default settings have enabled: false
      expect(overlays).toEqual([])
    })

    it('returns previous and next frames when enabled', () => {
      const timeline = makeTimeline(5)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 2,
        nextFrames: 1,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.3,
        falloff: 0.5,
      }
      const overlays = computeOnionOverlayFrames(timeline, 2, ab, settings)
      // Should have 2 previous (frames 1, 0) and 1 next (frame 3)
      expect(overlays.length).toBe(3)
      const prevFrames = overlays.filter((o) => o.direction === 'previous')
      const nextFrames = overlays.filter((o) => o.direction === 'next')
      expect(prevFrames.length).toBe(2)
      expect(nextFrames.length).toBe(1)
    })

    it('wraps around for previous frames with loop', () => {
      const timeline = makeTimeline(5, true)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 2,
        nextFrames: 0,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.3,
        falloff: 0.5,
      }
      // Current frame = 0, previous 2 should wrap to frames 4 and 3
      const overlays = computeOnionOverlayFrames(timeline, 0, ab, settings)
      expect(overlays.length).toBe(2)
      expect(overlays[0]!.frameIndex).toBe(4)
      expect(overlays[1]!.frameIndex).toBe(3)
    })

    it('wraps around for next frames with loop', () => {
      const timeline = makeTimeline(5, true)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 0,
        nextFrames: 2,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.3,
        falloff: 0.5,
      }
      // Current frame = 4, next 2 should wrap to frames 0 and 1
      const overlays = computeOnionOverlayFrames(timeline, 4, ab, settings)
      expect(overlays.length).toBe(2)
      expect(overlays[0]!.frameIndex).toBe(0)
      expect(overlays[1]!.frameIndex).toBe(1)
    })

    it('does not wrap without loop', () => {
      const timeline = makeTimeline(5, false)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 3,
        nextFrames: 0,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.3,
        falloff: 0.5,
      }
      // Current frame = 1, previous 3 would try -2, -1, 0 — only 0 is valid
      const overlays = computeOnionOverlayFrames(timeline, 1, ab, settings)
      expect(overlays.length).toBe(1)
      expect(overlays[0]!.frameIndex).toBe(0)
    })

    it('applies falloff to opacity', () => {
      const timeline = makeTimeline(5)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 3,
        nextFrames: 0,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 1.0,
        falloff: 0.5,
      }
      const overlays = computeOnionOverlayFrames(timeline, 3, ab, settings)
      // Step 1: opacity * falloff^0 = 1.0
      // Step 2: opacity * falloff^1 = 0.5
      // Step 3: opacity * falloff^2 = 0.25
      expect(overlays[0]!.opacity).toBeCloseTo(1.0)
      expect(overlays[1]!.opacity).toBeCloseTo(0.5)
      expect(overlays[2]!.opacity).toBeCloseTo(0.25)
    })
  })

  describe('computeOnionOverlay', () => {
    function makeTimeline(frameCount: number, loop = true): AnimationTimeline {
      const frames = Array.from({ length: frameCount }, (_, i) => ({
        id: `f-${i}`,
        name: `Frame ${i + 1}`,
        duration: 0,
        layerVisibility: {},
      }))
      return { frames, fps: 12, loop, currentFrame: 0 }
    }

    it('returns empty without a renderFrame callback', () => {
      const timeline = makeTimeline(5)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 2,
        nextFrames: 1,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.3,
        falloff: 0.5,
      }
      const results = computeOnionOverlay(timeline, 2, ab, settings)
      expect(results).toEqual([])
    })

    it('calls renderFrame for each overlay and tints result', () => {
      const timeline = makeTimeline(5)
      const ab = makeArtboard()
      const settings: OnionSkinSettings = {
        enabled: true,
        previousFrames: 1,
        nextFrames: 1,
        previousColor: '#ff0000',
        nextColor: '#00ff00',
        opacity: 0.5,
        falloff: 0.5,
      }
      const renderCalls: number[] = []
      const renderFrame = (_ab: Artboard, frameIndex: number) => {
        renderCalls.push(frameIndex)
        return makeSolid(2, 2, 200, 200, 200, 255)
      }
      const results = computeOnionOverlay(timeline, 2, ab, settings, renderFrame)
      // Should render frame 1 (previous) and frame 3 (next)
      expect(renderCalls.length).toBe(2)
      expect(results.length).toBe(2)
      // The returned ImageData should have been tinted (alpha scaled)
      // opacity 0.5, alpha was 255, so scaled alpha = round(255*0.5) = 128
      expect(results[0]!.data[3]).toBe(128)
      expect(results[1]!.data[3]).toBe(128)
    })
  })
})
