import { describe, it, expect } from 'bun:test'
import {
  blendPixel,
  compositeImageData,
  isCustomBlendMode,
  NATIVE_BLEND_MODES,
  CUSTOM_BLEND_MODES,
} from '@/render/blend-modes'
import type { BlendMode } from '@/types/document'

// Helper to make ImageData for testing
function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

describe('blend-modes', () => {
  describe('isCustomBlendMode', () => {
    it('returns false for native blend modes', () => {
      expect(isCustomBlendMode('normal')).toBe(false)
      expect(isCustomBlendMode('multiply')).toBe(false)
      expect(isCustomBlendMode('screen')).toBe(false)
      expect(isCustomBlendMode('overlay')).toBe(false)
      expect(isCustomBlendMode('hue')).toBe(false)
    })

    it('returns true for custom blend modes', () => {
      expect(isCustomBlendMode('vivid-light')).toBe(true)
      expect(isCustomBlendMode('linear-light')).toBe(true)
      expect(isCustomBlendMode('pin-light')).toBe(true)
      expect(isCustomBlendMode('hard-mix')).toBe(true)
      expect(isCustomBlendMode('darker-color')).toBe(true)
      expect(isCustomBlendMode('lighter-color')).toBe(true)
      expect(isCustomBlendMode('subtract')).toBe(true)
      expect(isCustomBlendMode('divide')).toBe(true)
      expect(isCustomBlendMode('linear-burn')).toBe(true)
      expect(isCustomBlendMode('linear-dodge')).toBe(true)
      expect(isCustomBlendMode('dissolve')).toBe(true)
    })

    it('returns false for pass-through', () => {
      expect(isCustomBlendMode('pass-through')).toBe(false)
    })
  })

  describe('NATIVE_BLEND_MODES and CUSTOM_BLEND_MODES sets', () => {
    it('has 16 native blend modes', () => {
      expect(NATIVE_BLEND_MODES.size).toBe(16)
    })

    it('has 11 custom blend modes', () => {
      expect(CUSTOM_BLEND_MODES.size).toBe(11)
    })

    it('sets are disjoint', () => {
      for (const mode of CUSTOM_BLEND_MODES) {
        expect(NATIVE_BLEND_MODES.has(mode)).toBe(false)
      }
    })
  })

  describe('blendPixel - transparent blend returns base', () => {
    it('returns base when blend alpha is 0', () => {
      const result = blendPixel(100, 150, 200, 255, 50, 60, 70, 0, 'subtract')
      expect(result).toEqual([100, 150, 200, 255])
    })
  })

  describe('blendPixel - subtract', () => {
    it('subtracts blend from base and clamps to 0', () => {
      const [r, g, b] = blendPixel(200, 100, 50, 255, 100, 150, 50, 255, 'subtract')
      expect(r).toBe(100) // 200 - 100
      expect(g).toBe(0) // 100 - 150 => clamped to 0
      expect(b).toBe(0) // 50 - 50
    })

    it('handles partial opacity', () => {
      // With blend alpha 128 (~50%), the result should be interpolated
      const [r] = blendPixel(200, 0, 0, 255, 100, 0, 0, 128, 'subtract')
      // blended = 200-100 = 100, alpha = 128/255 ~ 0.502
      // result = 200 + (100 - 200) * 0.502 = 200 - 50.2 = 149.8 => 150
      expect(r).toBeGreaterThan(140)
      expect(r).toBeLessThan(160)
    })
  })

  describe('blendPixel - divide', () => {
    it('divides base by blend scaled to 255', () => {
      const [r] = blendPixel(128, 0, 0, 255, 128, 0, 0, 255, 'divide')
      // 128 / 128 * 255 = 255
      expect(r).toBe(255)
    })

    it('returns 255 when blend is 0 (prevent division by zero)', () => {
      const [r] = blendPixel(100, 0, 0, 255, 0, 0, 0, 255, 'divide')
      expect(r).toBe(255)
    })

    it('handles small blend values', () => {
      const [r] = blendPixel(50, 0, 0, 255, 255, 0, 0, 255, 'divide')
      // 50 / 255 * 255 = 50
      expect(r).toBe(50)
    })
  })

  describe('blendPixel - linear-burn', () => {
    it('computes base + blend - 255', () => {
      const [r] = blendPixel(200, 0, 0, 255, 200, 0, 0, 255, 'linear-burn')
      // 200 + 200 - 255 = 145
      expect(r).toBe(145)
    })

    it('clamps to 0 for dark values', () => {
      const [r] = blendPixel(50, 0, 0, 255, 50, 0, 0, 255, 'linear-burn')
      // 50 + 50 - 255 = -155 => 0
      expect(r).toBe(0)
    })
  })

  describe('blendPixel - linear-dodge', () => {
    it('adds base and blend, clamped to 255', () => {
      const [r] = blendPixel(100, 0, 0, 255, 100, 0, 0, 255, 'linear-dodge')
      expect(r).toBe(200) // 100 + 100
    })

    it('clamps to 255', () => {
      const [r] = blendPixel(200, 0, 0, 255, 200, 0, 0, 255, 'linear-dodge')
      expect(r).toBe(255) // 200 + 200 => 400 => 255
    })
  })

  describe('blendPixel - vivid-light', () => {
    it('uses color-burn for blend < 128', () => {
      // blend=64 (< 128): color-burn(base=200, 2*64=128)
      // color-burn: 255 - (255-200)*255/128 = 255 - 55*255/128 = 255 - 109.6 = 145
      const [r] = blendPixel(200, 0, 0, 255, 64, 0, 0, 255, 'vivid-light')
      expect(r).toBeGreaterThan(140)
      expect(r).toBeLessThan(150)
    })

    it('uses color-dodge for blend >= 128', () => {
      // blend=192 (>= 128): color-dodge(base=100, 2*(192-128)=128)
      // color-dodge: 100*255/(255-128) = 100*255/127 = 200.8 => 201
      const [r] = blendPixel(100, 0, 0, 255, 192, 0, 0, 255, 'vivid-light')
      expect(r).toBeGreaterThan(195)
      expect(r).toBeLessThan(210)
    })
  })

  describe('blendPixel - linear-light', () => {
    it('uses linear-burn formula for blend < 128', () => {
      // blend=50 (<128): base + 2*50 - 255 = 200 + 100 - 255 = 45
      const [r] = blendPixel(200, 0, 0, 255, 50, 0, 0, 255, 'linear-light')
      expect(r).toBe(45)
    })

    it('uses linear-dodge formula for blend >= 128', () => {
      // blend=200 (>=128): base + 2*(200-128) = 100 + 144 = 244
      const [r] = blendPixel(100, 0, 0, 255, 200, 0, 0, 255, 'linear-light')
      expect(r).toBe(244)
    })
  })

  describe('blendPixel - pin-light', () => {
    it('darkens when blend < 128', () => {
      // blend=50 (<128): min(base, 2*50) = min(200, 100) = 100
      const [r] = blendPixel(200, 0, 0, 255, 50, 0, 0, 255, 'pin-light')
      expect(r).toBe(100)
    })

    it('lightens when blend >= 128', () => {
      // blend=200 (>=128): max(base, 2*(200-128)) = max(100, 144) = 144
      const [r] = blendPixel(100, 0, 0, 255, 200, 0, 0, 255, 'pin-light')
      expect(r).toBe(144)
    })
  })

  describe('blendPixel - hard-mix', () => {
    it('produces 0 or 255 per channel', () => {
      const [r, g, b] = blendPixel(200, 50, 128, 255, 200, 50, 128, 255, 'hard-mix')
      // Each channel is either 0 or 255
      expect(r === 0 || r === 255).toBe(true)
      expect(g === 0 || g === 255).toBe(true)
      expect(b === 0 || b === 255).toBe(true)
    })

    it('bright base + bright blend = 255', () => {
      const [r] = blendPixel(200, 0, 0, 255, 200, 0, 0, 255, 'hard-mix')
      expect(r).toBe(255) // vivid-light of these would be bright => threshold >= 128
    })

    it('dark base + dark blend = 0', () => {
      const [r] = blendPixel(20, 0, 0, 255, 20, 0, 0, 255, 'hard-mix')
      expect(r).toBe(0) // vivid-light of dark values would be dark => threshold < 128
    })
  })

  describe('blendPixel - darker-color', () => {
    it('keeps the pixel with lower luminance', () => {
      // base: (200, 100, 50) lum = 0.299*200 + 0.587*100 + 0.114*50 = 59.8 + 58.7 + 5.7 = 124.2
      // blend: (50, 60, 70) lum = 0.299*50 + 0.587*60 + 0.114*70 = 14.95 + 35.22 + 7.98 = 58.15
      const [r, g, b] = blendPixel(200, 100, 50, 255, 50, 60, 70, 255, 'darker-color')
      expect(r).toBe(50) // blend is darker
      expect(g).toBe(60)
      expect(b).toBe(70)
    })

    it('keeps base if base is darker', () => {
      const [r, g, b] = blendPixel(10, 10, 10, 255, 200, 200, 200, 255, 'darker-color')
      expect(r).toBe(10)
      expect(g).toBe(10)
      expect(b).toBe(10)
    })
  })

  describe('blendPixel - lighter-color', () => {
    it('keeps the pixel with higher luminance', () => {
      const [r, g, b] = blendPixel(200, 100, 50, 255, 50, 60, 70, 255, 'lighter-color')
      expect(r).toBe(200) // base is lighter
      expect(g).toBe(100)
      expect(b).toBe(50)
    })

    it('keeps blend if blend is lighter', () => {
      const [r, g, b] = blendPixel(10, 10, 10, 255, 200, 200, 200, 255, 'lighter-color')
      expect(r).toBe(200)
      expect(g).toBe(200)
      expect(b).toBe(200)
    })
  })

  describe('blendPixel - dissolve', () => {
    it('shows blend pixel when rand < blendAlpha', () => {
      // blendA=200 => alpha=200/255=0.784, rand=0.5 (< 0.784) => show blend
      const [r, g, b, a] = blendPixel(100, 100, 100, 255, 200, 50, 30, 200, 'dissolve', 0.5)
      expect(r).toBe(200)
      expect(g).toBe(50)
      expect(b).toBe(30)
      expect(a).toBe(255)
    })

    it('shows base pixel when rand >= blendAlpha', () => {
      // blendA=100 => alpha=100/255=0.392, rand=0.5 (>= 0.392) => show base
      const [r, g, b, a] = blendPixel(100, 100, 100, 255, 200, 50, 30, 100, 'dissolve', 0.5)
      expect(r).toBe(100)
      expect(g).toBe(100)
      expect(b).toBe(100)
      expect(a).toBe(255)
    })

    it('always shows blend when blend is fully opaque and rand < 1', () => {
      const [r, g, b, a] = blendPixel(0, 0, 0, 255, 255, 128, 64, 255, 'dissolve', 0.99)
      expect(r).toBe(255)
      expect(g).toBe(128)
      expect(b).toBe(64)
      expect(a).toBe(255)
    })
  })

  describe('blendPixel - alpha compositing', () => {
    it('computes correct output alpha', () => {
      const [, , , a] = blendPixel(0, 0, 0, 128, 0, 0, 0, 128, 'subtract')
      // outA = 128 + 128 - (128*128/255) = 256 - 64.25 = 191.75 => 192
      expect(a).toBeGreaterThan(188)
      expect(a).toBeLessThan(196)
    })

    it('full alpha on both sides stays 255', () => {
      const [, , , a] = blendPixel(100, 100, 100, 255, 50, 50, 50, 255, 'linear-dodge')
      expect(a).toBe(255)
    })
  })

  describe('compositeImageData', () => {
    it('composites subtract mode across all pixels', () => {
      const base = makeImageData(
        [
          200,
          100,
          50,
          255, // pixel 0
          100,
          200,
          150,
          255, // pixel 1
        ],
        2,
        1,
      )
      const blend = makeImageData(
        [
          50,
          50,
          50,
          255, // pixel 0
          200,
          100,
          50,
          255, // pixel 1
        ],
        2,
        1,
      )

      compositeImageData(base, blend, 'subtract', 1)

      expect(base.data[0]).toBe(150) // 200 - 50
      expect(base.data[1]).toBe(50) // 100 - 50
      expect(base.data[2]).toBe(0) // 50 - 50
      expect(base.data[3]).toBe(255)

      expect(base.data[4]).toBe(0) // 100 - 200 => 0
      expect(base.data[5]).toBe(100) // 200 - 100
      expect(base.data[6]).toBe(100) // 150 - 50
      expect(base.data[7]).toBe(255)
    })

    it('respects opacity parameter', () => {
      const base = makeImageData([200, 0, 0, 255], 1, 1)
      const blend = makeImageData([200, 0, 0, 255], 1, 1)

      // With opacity 0.5, blend alpha becomes 128
      compositeImageData(base, blend, 'linear-dodge', 0.5)

      // linear-dodge: 200+200=255 (clamped), but with alpha ~0.5:
      // result = 200 + (255 - 200) * 0.502 = 200 + 27.6 = 228
      const r = base.data[0]!
      expect(r).toBeGreaterThan(220)
      expect(r).toBeLessThan(240)
    })

    it('leaves base unchanged when blend is fully transparent', () => {
      const base = makeImageData([100, 150, 200, 255], 1, 1)
      const blend = makeImageData([50, 60, 70, 0], 1, 1)

      compositeImageData(base, blend, 'subtract', 1)

      expect(base.data[0]).toBe(100)
      expect(base.data[1]).toBe(150)
      expect(base.data[2]).toBe(200)
      expect(base.data[3]).toBe(255)
    })
  })

  describe('BlendMode type coverage', () => {
    it('all new blend modes are accounted for', () => {
      const allNewModes: BlendMode[] = [
        'vivid-light',
        'linear-light',
        'pin-light',
        'hard-mix',
        'darker-color',
        'lighter-color',
        'subtract',
        'divide',
        'linear-burn',
        'linear-dodge',
        'dissolve',
        'pass-through',
      ]
      // They should all be valid BlendMode values (TypeScript compile check)
      for (const mode of allNewModes) {
        expect(typeof mode).toBe('string')
      }
    })

    it('pass-through is not a custom blend mode (handled differently)', () => {
      expect(isCustomBlendMode('pass-through')).toBe(false)
      expect(CUSTOM_BLEND_MODES.has('pass-through')).toBe(false)
      expect(NATIVE_BLEND_MODES.has('pass-through')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles all black pixels for vivid-light', () => {
      const [r, g, b] = blendPixel(0, 0, 0, 255, 0, 0, 0, 255, 'vivid-light')
      // color-burn(0, 0): blend=0 => return 0
      expect(r).toBe(0)
      expect(g).toBe(0)
      expect(b).toBe(0)
    })

    it('handles all white pixels for linear-light', () => {
      const [r, g, b] = blendPixel(255, 255, 255, 255, 255, 255, 255, 255, 'linear-light')
      // blend >= 128: 255 + 2*(255-128) = 255 + 254 = 509 => clamped 255
      expect(r).toBe(255)
      expect(g).toBe(255)
      expect(b).toBe(255)
    })

    it('handles midpoint values for pin-light', () => {
      // blend=127 (<128): min(128, 2*127) = min(128, 254) = 128
      const [r] = blendPixel(128, 0, 0, 255, 127, 0, 0, 255, 'pin-light')
      expect(r).toBe(128)
    })

    it('handles divide with very small blend values', () => {
      const [r] = blendPixel(100, 0, 0, 255, 1, 0, 0, 255, 'divide')
      // 100 / 1 * 255 = 25500 => clamped to 255
      expect(r).toBe(255)
    })

    it('dissolve with 0 alpha always shows base', () => {
      const [r, g, b, a] = blendPixel(100, 100, 100, 255, 200, 50, 30, 0, 'dissolve', 0.0)
      expect(r).toBe(100)
      expect(g).toBe(100)
      expect(b).toBe(100)
      expect(a).toBe(255)
    })
  })
})
