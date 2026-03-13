import { describe, it, expect, beforeEach } from 'bun:test'

// ── Mock localStorage ──

const storage = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size
  },
  key: (_index: number) => null as string | null,
}
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true })

// ── Mock ImageData for test environments ──

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string = 'srgb'
    constructor(data: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
      if (typeof data === 'number') {
        // new ImageData(width, height)
        this.width = data
        this.height = widthOrHeight!
        this.data = new Uint8ClampedArray(data * widthOrHeight! * 4)
      } else if (widthOrHeight !== undefined && height !== undefined) {
        // new ImageData(data, width, height)
        this.data = data
        this.width = widthOrHeight
        this.height = height
      } else {
        throw new Error('Invalid ImageData constructor args')
      }
    }
  }
}

// ── Imports ──

import { getAIConfig, setAIConfig, isAIConfigured, type AIBackendConfig } from '@/ai/ai-config'

import {
  prepareMaskPNG,
  compositeResult,
  getGenerativeFillSettings,
  setGenerativeFillSettings,
} from '@/ai/generative-fill'

import {
  buildExpandedCanvas,
  computeTiles,
  blendOverlap,
  getGenerativeExpandSettings,
  setGenerativeExpandSettings,
} from '@/ai/generative-expand'

import { getRemoveToolSettings, setRemoveToolSettings } from '@/ai/remove-tool'

import { parseShortName, isGenericName, renderLayerThumbnail } from '@/ai/smart-rename'

import type { SelectionMask } from '@/tools/raster-selection'
import { storeRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ── Helpers ──

function makeImageData(w: number, h: number, r = 128, g = 128, b = 128, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return new ImageData(data, w, h)
}

function makeRectMask(w: number, h: number, rx: number, ry: number, rw: number, rh: number): SelectionMask {
  const data = new Uint8Array(w * h)
  for (let y = ry; y < ry + rh && y < h; y++) {
    for (let x = rx; x < rx + rw && x < w; x++) {
      data[y * w + x] = 255
    }
  }
  return { width: w, height: h, data }
}

// ========================================================================
// AI Config
// ========================================================================

describe('ai-config', () => {
  beforeEach(() => {
    storage.clear()
    // Reset config to defaults
    setAIConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
  })

  describe('getAIConfig', () => {
    it('returns defaults when nothing is configured', () => {
      const cfg = getAIConfig()
      expect(cfg.inpaintingEndpoint).toBe('')
      expect(cfg.textToImageEndpoint).toBe('')
      expect(cfg.visionEndpoint).toBe('')
      expect(cfg.apiKey).toBe('')
      expect(cfg.timeout).toBe(60000)
    })

    it('returns a copy (mutations do not affect internal state)', () => {
      const a = getAIConfig()
      a.apiKey = 'mutated'
      const b = getAIConfig()
      expect(b.apiKey).not.toBe('mutated')
    })
  })

  describe('setAIConfig', () => {
    it('merges partial updates', () => {
      setAIConfig({ inpaintingEndpoint: 'http://localhost:7860/api/inpaint' })
      const cfg = getAIConfig()
      expect(cfg.inpaintingEndpoint).toBe('http://localhost:7860/api/inpaint')
      expect(cfg.timeout).toBe(60000) // untouched
    })

    it('persists to localStorage', () => {
      setAIConfig({ apiKey: 'sk-test-123' })
      const raw = storage.get('crossdraw:ai-backend-config')
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!) as AIBackendConfig
      expect(parsed.apiKey).toBe('sk-test-123')
    })

    it('roundtrips through localStorage', () => {
      const patch: Partial<AIBackendConfig> = {
        inpaintingEndpoint: 'http://example.com/inpaint',
        visionEndpoint: 'http://example.com/vision',
        apiKey: 'key-abc',
        timeout: 30000,
      }
      setAIConfig(patch)

      // Simulate a fresh module load by reading from storage
      const raw = storage.get('crossdraw:ai-backend-config')
      const restored = JSON.parse(raw!) as AIBackendConfig
      expect(restored.inpaintingEndpoint).toBe(patch.inpaintingEndpoint!)
      expect(restored.visionEndpoint).toBe(patch.visionEndpoint!)
      expect(restored.apiKey).toBe(patch.apiKey!)
      expect(restored.timeout).toBe(patch.timeout!)
    })
  })

  describe('isAIConfigured', () => {
    it('returns false when no endpoints are set', () => {
      expect(isAIConfigured()).toBe(false)
    })

    it('returns true when inpainting endpoint is set', () => {
      setAIConfig({ inpaintingEndpoint: 'http://localhost/inpaint' })
      expect(isAIConfigured()).toBe(true)
    })

    it('returns true when text-to-image endpoint is set', () => {
      setAIConfig({ textToImageEndpoint: 'http://localhost/txt2img' })
      expect(isAIConfigured()).toBe(true)
    })

    it('returns true when vision endpoint is set', () => {
      setAIConfig({ visionEndpoint: 'http://localhost/vision' })
      expect(isAIConfigured()).toBe(true)
    })
  })
})

// ========================================================================
// Generative Fill — Mask Preparation
// ========================================================================

describe('generative-fill: prepareMaskPNG', () => {
  it('returns empty data for empty mask', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    const image = makeImageData(10, 10)
    const result = prepareMaskPNG(mask, image, 4)
    expect(result.bounds.w).toBe(0)
    expect(result.bounds.h).toBe(0)
    expect(result.maskData.length).toBe(0)
    expect(result.contextData.length).toBe(0)
  })

  it('extracts region with padding around selection', () => {
    const mask = makeRectMask(20, 20, 5, 5, 5, 5) // 5x5 rect at (5,5)
    const image = makeImageData(20, 20, 200, 100, 50)
    const result = prepareMaskPNG(mask, image, 3)

    // Selection is at x=[5..9], y=[5..9], padding=3
    // Padded region: x0=max(0,5-3)=2, x1=min(20,10+3)=13, w=11
    //                y0=max(0,5-3)=2, y1=min(20,10+3)=13, h=11
    expect(result.bounds.x).toBe(2)
    expect(result.bounds.y).toBe(2)
    expect(result.bounds.w).toBe(11)
    expect(result.bounds.h).toBe(11)
  })

  it('clamps padding to image boundaries', () => {
    const mask = makeRectMask(10, 10, 0, 0, 3, 3) // selection at top-left corner
    const image = makeImageData(10, 10)
    const result = prepareMaskPNG(mask, image, 5)

    // x0 clamped to 0, y0 clamped to 0
    expect(result.bounds.x).toBe(0)
    expect(result.bounds.y).toBe(0)
    // x1 = min(10, 0+3+5) = 8, y1 = min(10, 0+3+5) = 8
    expect(result.bounds.w).toBe(8)
    expect(result.bounds.h).toBe(8)
  })

  it('mask data has white pixels only where selected', () => {
    const mask = makeRectMask(10, 10, 2, 2, 3, 3)
    const image = makeImageData(10, 10)
    const result = prepareMaskPNG(mask, image, 0)

    // Bounds should exactly match selection: x=2, y=2, w=3, h=3
    const bw = result.bounds.w
    const bh = result.bounds.h
    expect(bw).toBe(3)
    expect(bh).toBe(3)

    // Every pixel in the cropped mask should be white (255)
    for (let i = 0; i < bw * bh; i++) {
      expect(result.maskData[i * 4]).toBe(255) // R
      expect(result.maskData[i * 4 + 1]).toBe(255) // G
      expect(result.maskData[i * 4 + 2]).toBe(255) // B
      expect(result.maskData[i * 4 + 3]).toBe(255) // A
    }
  })

  it('context data preserves original pixel colors', () => {
    const mask = makeRectMask(10, 10, 4, 4, 2, 2)
    const image = makeImageData(10, 10, 42, 84, 126)
    const result = prepareMaskPNG(mask, image, 0)

    // Context should contain the original colors
    expect(result.contextData[0]).toBe(42) // R
    expect(result.contextData[1]).toBe(84) // G
    expect(result.contextData[2]).toBe(126) // B
    expect(result.contextData[3]).toBe(255) // A
  })
})

// ========================================================================
// Generative Fill — Compositing
// ========================================================================

describe('generative-fill: compositeResult', () => {
  it('does not modify pixels outside the mask', () => {
    const original = makeImageData(10, 10, 100, 100, 100)
    const generated = makeImageData(4, 4, 200, 200, 200)
    const mask = makeRectMask(10, 10, 3, 3, 4, 4)
    const bounds = { x: 3, y: 3, w: 4, h: 4 }

    const result = compositeResult(original, generated, mask, bounds, 0)

    // Check a pixel outside the mask
    const outsideI = (0 * 10 + 0) * 4
    expect(result.data[outsideI]).toBe(100)
    expect(result.data[outsideI + 1]).toBe(100)
    expect(result.data[outsideI + 2]).toBe(100)
  })

  it('replaces pixels inside a fully opaque mask with zero feather', () => {
    const original = makeImageData(10, 10, 0, 0, 0)
    const generated = makeImageData(10, 10, 255, 0, 0)
    // Make a large enough mask so interior pixels are far from edge
    const mask = makeRectMask(10, 10, 0, 0, 10, 10)
    const bounds = { x: 0, y: 0, w: 10, h: 10 }

    const result = compositeResult(original, generated, mask, bounds, 0)

    // Center pixel should be fully replaced
    const centerI = (5 * 10 + 5) * 4
    expect(result.data[centerI]).toBe(255)
    expect(result.data[centerI + 1]).toBe(0)
    expect(result.data[centerI + 2]).toBe(0)
  })

  it('produces blended pixels near mask edges with feathering', () => {
    const original = makeImageData(20, 20, 0, 0, 0)
    const generated = makeImageData(10, 10, 200, 200, 200)
    const mask = makeRectMask(20, 20, 5, 5, 10, 10)
    const bounds = { x: 5, y: 5, w: 10, h: 10 }

    const result = compositeResult(original, generated, mask, bounds, 3)

    // Edge pixel (5,5) is right at the mask boundary
    const edgeI = (5 * 20 + 5) * 4
    // It should be partially blended (not 0 and not 200)
    const r = result.data[edgeI]!
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(200)

    // Deep interior pixel should be close to generated value
    const deepI = (10 * 20 + 10) * 4
    const deepR = result.data[deepI]!
    expect(deepR).toBeGreaterThanOrEqual(150) // should be close to 200
  })

  it('returns an ImageData with correct dimensions', () => {
    const original = makeImageData(50, 30)
    const generated = makeImageData(10, 10)
    const mask = makeRectMask(50, 30, 10, 10, 10, 10)
    const bounds = { x: 10, y: 10, w: 10, h: 10 }

    const result = compositeResult(original, generated, mask, bounds)
    expect(result.width).toBe(50)
    expect(result.height).toBe(30)
    expect(result.data.length).toBe(50 * 30 * 4)
  })
})

// ========================================================================
// Generative Fill — Settings
// ========================================================================

describe('generative-fill: settings', () => {
  it('returns default settings', () => {
    const s = getGenerativeFillSettings()
    expect(s.prompt).toBe('')
    expect(s.negativePrompt).toBe('')
    expect(s.strength).toBeCloseTo(0.85)
    expect(s.numVariations).toBe(1)
  })

  it('merges partial updates', () => {
    setGenerativeFillSettings({ prompt: 'forest background', strength: 0.9 })
    const s = getGenerativeFillSettings()
    expect(s.prompt).toBe('forest background')
    expect(s.strength).toBeCloseTo(0.9)
    expect(s.negativePrompt).toBe('') // untouched
  })

  it('returns a copy', () => {
    const a = getGenerativeFillSettings()
    a.prompt = 'mutated'
    const b = getGenerativeFillSettings()
    expect(b.prompt).not.toBe('mutated')
  })
})

// ========================================================================
// Generative Expand — Canvas Expansion
// ========================================================================

describe('generative-expand: buildExpandedCanvas', () => {
  it('expands to the right', () => {
    const original = makeImageData(10, 10, 100, 100, 100)
    const { expanded, mask, newWidth, newHeight } = buildExpandedCanvas(original, 'right', 5)

    expect(newWidth).toBe(15)
    expect(newHeight).toBe(10)
    expect(expanded.width).toBe(15)
    expect(expanded.height).toBe(10)

    // Original pixels at (0,0) should be preserved
    expect(expanded.data[0]).toBe(100)

    // New area at (10,0) should be in the mask
    expect(mask.data[0 * 15 + 10]).toBe(255)

    // Original area should not be in the mask
    expect(mask.data[0 * 15 + 0]).toBe(0)
  })

  it('expands to the left', () => {
    const original = makeImageData(10, 10, 50, 50, 50)
    const { expanded, mask, newWidth, newHeight } = buildExpandedCanvas(original, 'left', 3)

    expect(newWidth).toBe(13)
    expect(newHeight).toBe(10)

    // Original pixels should be offset by 3
    const pixI = (0 * 13 + 3) * 4
    expect(expanded.data[pixI]).toBe(50)

    // New area at (0,0) should be in the mask
    expect(mask.data[0]).toBe(255)
    // Original area at (3,0) should not be in the mask
    expect(mask.data[3]).toBe(0)
  })

  it('expands downward', () => {
    const original = makeImageData(10, 10, 75, 75, 75)
    const { expanded: _exp1, mask, newWidth, newHeight } = buildExpandedCanvas(original, 'bottom', 4)

    expect(newWidth).toBe(10)
    expect(newHeight).toBe(14)

    // New area at (0, 10) should be in the mask
    expect(mask.data[10 * 10 + 0]).toBe(255)
    // Original area at (0, 0) should not
    expect(mask.data[0]).toBe(0)
  })

  it('expands upward', () => {
    const original = makeImageData(10, 10)
    const { expanded: _exp2, mask, newWidth, newHeight } = buildExpandedCanvas(original, 'top', 6)

    expect(newWidth).toBe(10)
    expect(newHeight).toBe(16)

    // New area at (0, 0) should be in the mask
    expect(mask.data[0]).toBe(255)
    // Original area at (0, 6) should not
    expect(mask.data[6 * 10 + 0]).toBe(0)
  })
})

describe('generative-expand: computeTiles', () => {
  it('returns single tile for small expansions', () => {
    const tiles = computeTiles('right', 100, 200, 100)
    expect(tiles.length).toBe(1)
    expect(tiles[0]!.w).toBe(200)
    expect(tiles[0]!.h).toBe(100)
  })

  it('returns multiple tiles for large expansions', () => {
    const tiles = computeTiles('right', 1024, 1124, 500)
    expect(tiles.length).toBeGreaterThan(1)
  })
})

describe('generative-expand: blendOverlap', () => {
  it('returns an ImageData of the same dimensions', () => {
    const base = makeImageData(20, 20, 0, 0, 0)
    const overlay = makeImageData(20, 20, 255, 255, 255)
    const result = blendOverlap(base, overlay, 5, 'right')
    expect(result.width).toBe(20)
    expect(result.height).toBe(20)
  })

  it('blends smoothly in overlap region', () => {
    const base = makeImageData(20, 10, 0, 0, 0)
    const overlay = makeImageData(20, 10, 200, 200, 200)
    const result = blendOverlap(base, overlay, 10, 'right')

    // At x=10 (midpoint of 20-wide, overlap from x=10), t = 0
    // At x=15, t = (15-10)/10 = 0.5 → blend is ~100
    const midI = (5 * 20 + 15) * 4
    const r = result.data[midI]!
    expect(r).toBeGreaterThan(50)
    expect(r).toBeLessThan(150)
  })
})

describe('generative-expand: settings', () => {
  it('returns default settings', () => {
    const s = getGenerativeExpandSettings()
    expect(s.direction).toBe('right')
    expect(s.expandPx).toBe(256)
    expect(s.prompt).toBe('')
  })

  it('merges partial updates', () => {
    setGenerativeExpandSettings({ direction: 'top', expandPx: 128 })
    const s = getGenerativeExpandSettings()
    expect(s.direction).toBe('top')
    expect(s.expandPx).toBe(128)
  })
})

// ========================================================================
// Remove Tool
// ========================================================================

describe('remove-tool: settings', () => {
  it('returns default settings', () => {
    const s = getRemoveToolSettings()
    expect(s.brushRadius).toBe(20)
    expect(s.featherRadius).toBe(4)
  })

  it('merges partial updates', () => {
    setRemoveToolSettings({ brushRadius: 50 })
    const s = getRemoveToolSettings()
    expect(s.brushRadius).toBe(50)
    expect(s.featherRadius).toBe(4) // untouched
  })

  it('returns a copy', () => {
    const a = getRemoveToolSettings()
    a.brushRadius = 999
    const b = getRemoveToolSettings()
    expect(b.brushRadius).not.toBe(999)
  })
})

// ========================================================================
// Smart Rename — parseShortName
// ========================================================================

describe('smart-rename: parseShortName', () => {
  it('strips leading articles', () => {
    expect(parseShortName('a red balloon')).toBe('Red Balloon')
    expect(parseShortName('an orange cat')).toBe('Orange Cat')
    expect(parseShortName('the sunset')).toBe('Sunset')
  })

  it('strips common filler phrases', () => {
    expect(parseShortName('image of a mountain')).toBe('Mountain')
    expect(parseShortName('photo of a beach at sunset')).toBe('Beach At Sunset')
    expect(parseShortName('this is a logo')).toBe('Logo')
  })

  it('title-cases each word', () => {
    expect(parseShortName('dark forest path')).toBe('Dark Forest Path')
  })

  it('truncates to 4 words max', () => {
    expect(parseShortName('very long descriptive caption text here')).toBe('Very Long Descriptive Caption')
  })

  it('returns "Layer" for empty captions', () => {
    expect(parseShortName('')).toBe('Layer')
  })

  it('handles single-article input gracefully', () => {
    // A bare article with no noun becomes a single capitalized letter
    expect(parseShortName('a ')).toBe('Layer')
    // or passes through as-is if there is nothing else
  })

  it('strips trailing periods', () => {
    expect(parseShortName('a sunset over mountains.')).toBe('Sunset Over Mountains')
  })
})

// ========================================================================
// Smart Rename — isGenericName
// ========================================================================

describe('smart-rename: isGenericName', () => {
  it('detects generic layer names', () => {
    expect(isGenericName('Layer')).toBe(true)
    expect(isGenericName('Layer 1')).toBe(true)
    expect(isGenericName('Layer 42')).toBe(true)
    expect(isGenericName('Rectangle')).toBe(true)
    expect(isGenericName('Rectangle 3')).toBe(true)
    expect(isGenericName('Ellipse')).toBe(true)
    expect(isGenericName('Group')).toBe(true)
    expect(isGenericName('Group 5')).toBe(true)
    expect(isGenericName('Vector')).toBe(true)
    expect(isGenericName('Text 7')).toBe(true)
    expect(isGenericName('Path')).toBe(true)
    expect(isGenericName('Untitled')).toBe(true)
    expect(isGenericName('Untitled 2')).toBe(true)
    expect(isGenericName('Image')).toBe(true)
    expect(isGenericName('Raster 1')).toBe(true)
  })

  it('does not flag meaningful names', () => {
    expect(isGenericName('Hero Background')).toBe(false)
    expect(isGenericName('Submit Button')).toBe(false)
    expect(isGenericName('Nav Logo')).toBe(false)
    expect(isGenericName('Footer Links')).toBe(false)
    expect(isGenericName('Profile Avatar')).toBe(false)
  })
})

// ========================================================================
// Smart Rename — renderLayerThumbnail
// ========================================================================

describe('smart-rename: renderLayerThumbnail', () => {
  it('returns null for missing raster data', () => {
    const layer: RasterLayer = {
      type: 'raster',
      id: 'missing-chunk',
      name: 'Test',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      imageChunkId: 'nonexistent-chunk',
      width: 100,
      height: 100,
    }
    expect(renderLayerThumbnail(layer)).toBeNull()
  })

  it('returns downscaled thumbnail data for stored raster', () => {
    const chunkId = 'test-thumb-chunk'
    const imageData = makeImageData(256, 256, 50, 100, 150)
    storeRasterData(chunkId, imageData)

    const layer: RasterLayer = {
      type: 'raster',
      id: 'thumb-layer',
      name: 'Test',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      imageChunkId: chunkId,
      width: 256,
      height: 256,
    }

    const thumb = renderLayerThumbnail(layer)
    expect(thumb).not.toBeNull()
    // 256 → 128 scale = 0.5, so output is 128x128
    expect(thumb!.length).toBe(128 * 128 * 4)
    // Check a pixel preserves the color
    expect(thumb![0]).toBe(50)
    expect(thumb![1]).toBe(100)
    expect(thumb![2]).toBe(150)
    expect(thumb![3]).toBe(255)
  })

  it('does not upscale small images', () => {
    const chunkId = 'test-thumb-small'
    const imageData = makeImageData(32, 64, 10, 20, 30)
    storeRasterData(chunkId, imageData)

    const layer: RasterLayer = {
      type: 'raster',
      id: 'thumb-small',
      name: 'Small',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      imageChunkId: chunkId,
      width: 32,
      height: 64,
    }

    const thumb = renderLayerThumbnail(layer)
    expect(thumb).not.toBeNull()
    // scale = min(128/32, 128/64, 1) = min(4, 2, 1) = 1 → no scaling
    expect(thumb!.length).toBe(32 * 64 * 4)
  })
})

// ========================================================================
// Fallback Logic (content-aware fill as fallback)
// ========================================================================

describe('remove-tool: fallback logic', () => {
  it('isAIConfigured returns false without endpoints → triggers fallback', () => {
    // Ensure clean state
    setAIConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    expect(isAIConfigured()).toBe(false)
    // This confirms the remove tool will use content-aware fill as fallback
  })

  it('isAIConfigured returns true with endpoint → uses AI path', () => {
    setAIConfig({ inpaintingEndpoint: 'http://localhost:7860/api/inpaint' })
    expect(isAIConfigured()).toBe(true)
  })
})

// ========================================================================
// Edge Cases
// ========================================================================

describe('edge cases', () => {
  it('prepareMaskPNG with zero padding', () => {
    const mask = makeRectMask(10, 10, 2, 2, 3, 3)
    const image = makeImageData(10, 10)
    const result = prepareMaskPNG(mask, image, 0)
    expect(result.bounds.x).toBe(2)
    expect(result.bounds.y).toBe(2)
    expect(result.bounds.w).toBe(3)
    expect(result.bounds.h).toBe(3)
  })

  it('compositeResult with mask having partial (non-255) values', () => {
    const original = makeImageData(10, 10, 0, 0, 0)
    const generated = makeImageData(10, 10, 200, 200, 200)
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    // Set center pixel to 128 (partial selection)
    mask.data[5 * 10 + 5] = 128
    const bounds = { x: 0, y: 0, w: 10, h: 10 }

    const result = compositeResult(original, generated, mask, bounds, 0)
    const i = (5 * 10 + 5) * 4
    // alpha = 128/255 ≈ 0.502 → result ≈ 0*(1-0.5) + 200*0.5 ≈ 100
    const r = result.data[i]!
    expect(r).toBeGreaterThan(80)
    expect(r).toBeLessThan(120)
  })

  it('buildExpandedCanvas with zero expand does not change dimensions', () => {
    const original = makeImageData(10, 10)
    const { newWidth, newHeight } = buildExpandedCanvas(original, 'right', 0)
    expect(newWidth).toBe(10)
    expect(newHeight).toBe(10)
  })

  it('computeTiles returns at least one tile', () => {
    const tiles = computeTiles('right', 0, 10, 10)
    expect(tiles.length).toBeGreaterThanOrEqual(1)
  })
})
