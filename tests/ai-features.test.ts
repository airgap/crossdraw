import { describe, it, expect } from 'bun:test'

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
        this.width = data
        this.height = widthOrHeight!
        this.data = new Uint8ClampedArray(data * widthOrHeight! * 4)
      } else if (widthOrHeight !== undefined && height !== undefined) {
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

import {
  getAvailableFilters,
  getFilterById,
  registerFilter,
  unregisterFilter,
  type NeuralFilter,
} from '@/ai/neural-filters'

import { computeTiles, extractTile, reassembleTiles, type Tile } from '@/ai/super-resolution'

import { getStylePreset, getAvailableStyles } from '@/ai/text-to-vector'

import { blendImages } from '@/ai/ml-denoise'

import { setAIConfig } from '@/ai/ai-config'

// ═══════════════════════════════════════════════════════════════════════════
// Neural Filters
// ═══════════════════════════════════════════════════════════════════════════

describe('Neural Filters', () => {
  describe('getAvailableFilters', () => {
    it('returns built-in filters', () => {
      const filters = getAvailableFilters()
      expect(filters.length).toBeGreaterThanOrEqual(6)
      const ids = filters.map((f) => f.id)
      expect(ids).toContain('style-transfer')
      expect(ids).toContain('colorize')
      expect(ids).toContain('depth-blur')
      expect(ids).toContain('super-resolution')
      expect(ids).toContain('background-blur')
      expect(ids).toContain('sketch-to-photo')
    })

    it('each filter has required fields', () => {
      for (const filter of getAvailableFilters()) {
        expect(typeof filter.id).toBe('string')
        expect(filter.id.length).toBeGreaterThan(0)
        expect(typeof filter.name).toBe('string')
        expect(filter.name.length).toBeGreaterThan(0)
        expect(typeof filter.description).toBe('string')
        expect(Array.isArray(filter.params)).toBe(true)
      }
    })

    it('each param has valid type', () => {
      const validTypes = ['slider', 'image', 'select', 'boolean']
      for (const filter of getAvailableFilters()) {
        for (const param of filter.params) {
          expect(validTypes).toContain(param.type)
          expect(typeof param.name).toBe('string')
        }
      }
    })

    it('slider params have min/max/default', () => {
      for (const filter of getAvailableFilters()) {
        for (const param of filter.params) {
          if (param.type === 'slider') {
            expect(typeof param.min).toBe('number')
            expect(typeof param.max).toBe('number')
            expect(param.default).toBeDefined()
            expect(param.max!).toBeGreaterThanOrEqual(param.min!)
          }
        }
      }
    })

    it('select params have options', () => {
      for (const filter of getAvailableFilters()) {
        for (const param of filter.params) {
          if (param.type === 'select') {
            expect(Array.isArray(param.options)).toBe(true)
            expect(param.options!.length).toBeGreaterThan(0)
          }
        }
      }
    })
  })

  describe('getFilterById', () => {
    it('finds a built-in filter', () => {
      const filter = getFilterById('style-transfer')
      expect(filter).toBeDefined()
      expect(filter!.name).toBe('Style Transfer')
    })

    it('returns undefined for unknown id', () => {
      expect(getFilterById('nonexistent-filter')).toBeUndefined()
    })
  })

  describe('registerFilter / unregisterFilter', () => {
    const testFilter: NeuralFilter = {
      id: 'test-custom-filter',
      name: 'Test Custom Filter',
      description: 'A test filter for unit tests.',
      params: [{ name: 'intensity', type: 'slider', min: 0, max: 100, default: 50 }],
    }

    afterEach(() => {
      // Clean up any registered test filters
      unregisterFilter('test-custom-filter')
    })

    it('registers a custom filter', () => {
      registerFilter(testFilter)
      const found = getFilterById('test-custom-filter')
      expect(found).toBeDefined()
      expect(found!.name).toBe('Test Custom Filter')
    })

    it('custom filter appears in getAvailableFilters', () => {
      registerFilter(testFilter)
      const ids = getAvailableFilters().map((f) => f.id)
      expect(ids).toContain('test-custom-filter')
    })

    it('throws on duplicate registration', () => {
      registerFilter(testFilter)
      expect(() => registerFilter(testFilter)).toThrow('already registered')
    })

    it('unregisters a custom filter', () => {
      registerFilter(testFilter)
      expect(unregisterFilter('test-custom-filter')).toBe(true)
      expect(getFilterById('test-custom-filter')).toBeUndefined()
    })

    it('unregister returns false for unknown filter', () => {
      expect(unregisterFilter('nonexistent')).toBe(false)
    })
  })
})

// We need afterEach from bun:test
import { afterEach } from 'bun:test'

// ═══════════════════════════════════════════════════════════════════════════
// Super Resolution — Tiling Math
// ═══════════════════════════════════════════════════════════════════════════

describe('Super Resolution — Tiling', () => {
  describe('computeTiles', () => {
    it('single tile for small images', () => {
      const tiles = computeTiles(256, 256, 512, 64)
      expect(tiles.length).toBe(1)
      expect(tiles[0]).toEqual({ x: 0, y: 0, w: 256, h: 256 })
    })

    it('exact tile size with zero overlap produces single tile', () => {
      const tiles = computeTiles(512, 512, 512, 0)
      expect(tiles.length).toBe(1)
      expect(tiles[0]).toEqual({ x: 0, y: 0, w: 512, h: 512 })
    })

    it('creates multiple overlapping tiles', () => {
      const tiles = computeTiles(1024, 1024, 512, 64)
      expect(tiles.length).toBeGreaterThan(1)

      // Verify all tiles are within bounds
      for (const tile of tiles) {
        expect(tile.x).toBeGreaterThanOrEqual(0)
        expect(tile.y).toBeGreaterThanOrEqual(0)
        expect(tile.x + tile.w).toBeLessThanOrEqual(1024)
        expect(tile.y + tile.h).toBeLessThanOrEqual(1024)
      }
    })

    it('tiles cover the entire image', () => {
      const width = 1000
      const height = 800
      const tiles = computeTiles(width, height, 512, 64)

      // Check every pixel is covered by at least one tile
      const covered = new Uint8Array(width * height)
      for (const tile of tiles) {
        for (let y = tile.y; y < tile.y + tile.h; y++) {
          for (let x = tile.x; x < tile.x + tile.w; x++) {
            covered[y * width + x] = 1
          }
        }
      }

      let allCovered = true
      for (let i = 0; i < width * height; i++) {
        if (!covered[i]) {
          allCovered = false
          break
        }
      }
      expect(allCovered).toBe(true)
    })

    it('tiles have proper overlap', () => {
      const overlap = 64
      const tiles = computeTiles(1024, 512, 512, overlap)

      // Adjacent horizontal tiles should overlap
      const sortedByX = tiles.filter((t) => t.y === 0).sort((a, b) => a.x - b.x)
      for (let i = 1; i < sortedByX.length; i++) {
        const prev = sortedByX[i - 1]!
        const curr = sortedByX[i]!
        const overlapAmount = prev.x + prev.w - curr.x
        expect(overlapAmount).toBeGreaterThanOrEqual(0)
      }
    })

    it('handles non-square images', () => {
      const tiles = computeTiles(1920, 200, 512, 64)
      expect(tiles.length).toBeGreaterThan(1)
      for (const tile of tiles) {
        expect(tile.h).toBeLessThanOrEqual(200)
      }
    })

    it('tile widths/heights do not exceed source dimensions', () => {
      const tiles = computeTiles(300, 400, 512, 64)
      for (const tile of tiles) {
        expect(tile.w).toBeLessThanOrEqual(300)
        expect(tile.h).toBeLessThanOrEqual(400)
      }
    })
  })

  describe('extractTile', () => {
    it('extracts the correct region', () => {
      const img = new ImageData(4, 4)
      // Set a distinct pattern: pixel (x,y) = x*10 + y
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const i = (y * 4 + x) * 4
          img.data[i] = x * 10 + y
          img.data[i + 1] = 0
          img.data[i + 2] = 0
          img.data[i + 3] = 255
        }
      }

      const tile = extractTile(img, { x: 1, y: 1, w: 2, h: 2 })
      expect(tile.width).toBe(2)
      expect(tile.height).toBe(2)

      // Check pixel (0,0) of tile = pixel (1,1) of original
      expect(tile.data[0]).toBe(11) // 1*10 + 1
      // Check pixel (1,0) of tile = pixel (2,1) of original
      expect(tile.data[4]).toBe(21) // 2*10 + 1
      // Check pixel (0,1) of tile = pixel (1,2) of original
      expect(tile.data[8]).toBe(12) // 1*10 + 2
      // Check pixel (1,1) of tile = pixel (2,2) of original
      expect(tile.data[12]).toBe(22) // 2*10 + 2
    })
  })

  describe('reassembleTiles', () => {
    it('reconstructs a simple non-overlapping image', () => {
      // 4x4 source image, scale factor 1, tile size 2, no overlap
      const srcW = 4
      const srcH = 4

      const tiles: Tile[] = [
        { x: 0, y: 0, w: 2, h: 2 },
        { x: 2, y: 0, w: 2, h: 2 },
        { x: 0, y: 2, w: 2, h: 2 },
        { x: 2, y: 2, w: 2, h: 2 },
      ]

      // Create tile data — each tile is a 2x2 image filled with a distinct color
      const upscaledTiles = tiles.map((t, idx) => {
        const img = new ImageData(t.w, t.h)
        for (let i = 0; i < t.w * t.h * 4; i += 4) {
          img.data[i] = (idx + 1) * 50
          img.data[i + 1] = 0
          img.data[i + 2] = 0
          img.data[i + 3] = 255
        }
        return img
      })

      const result = reassembleTiles(tiles, upscaledTiles, 1, srcW, srcH, 0)
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)

      // Top-left pixel should be from tile 0
      expect(result.data[0]).toBe(50)
      // Top-right pixel (x=2, y=0) should be from tile 1
      expect(result.data[(0 * 4 + 2) * 4]).toBe(100)
    })

    it('produces output at scaled resolution', () => {
      const tiles: Tile[] = [{ x: 0, y: 0, w: 4, h: 4 }]
      const upscaled = new ImageData(8, 8) // 2x scale
      for (let i = 0; i < 8 * 8 * 4; i += 4) {
        upscaled.data[i] = 128
        upscaled.data[i + 1] = 64
        upscaled.data[i + 2] = 32
        upscaled.data[i + 3] = 255
      }

      const result = reassembleTiles(tiles, [upscaled], 2, 4, 4, 0)
      expect(result.width).toBe(8)
      expect(result.height).toBe(8)
      // All pixels should be the same since single tile
      expect(result.data[0]).toBe(128)
      expect(result.data[1]).toBe(64)
      expect(result.data[2]).toBe(32)
      expect(result.data[3]).toBe(255)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Text to Vector — Style Presets
// ═══════════════════════════════════════════════════════════════════════════

describe('Text to Vector — Style Presets', () => {
  it('returns all available styles', () => {
    const styles = getAvailableStyles()
    expect(styles.length).toBeGreaterThanOrEqual(5)
    expect(styles).toContain('flat')
    expect(styles).toContain('line-art')
    expect(styles).toContain('detailed')
    expect(styles).toContain('sketch')
    expect(styles).toContain('geometric')
  })

  it('each style has a preset with required fields', () => {
    for (const style of getAvailableStyles()) {
      const preset = getStylePreset(style)
      expect(typeof preset.promptSuffix).toBe('string')
      expect(preset.promptSuffix.length).toBeGreaterThan(0)
      expect(typeof preset.negativePrompt).toBe('string')
      expect(typeof preset.traceOptions).toBe('object')
    }
  })

  it('flat style uses higher simplification', () => {
    const flat = getStylePreset('flat')
    const detailed = getStylePreset('detailed')
    expect(flat.traceOptions.simplifyTolerance!).toBeGreaterThan(detailed.traceOptions.simplifyTolerance!)
  })

  it('line-art style uses high contrast threshold', () => {
    const lineArt = getStylePreset('line-art')
    expect(lineArt.traceOptions.threshold!).toBeGreaterThanOrEqual(180)
  })

  it('sketch style disables smoothing', () => {
    const sketch = getStylePreset('sketch')
    expect(sketch.traceOptions.smoothing).toBe(false)
  })

  it('geometric style disables smoothing', () => {
    const geometric = getStylePreset('geometric')
    expect(geometric.traceOptions.smoothing).toBe(false)
  })

  it('geometric style has high simplification tolerance', () => {
    const geometric = getStylePreset('geometric')
    expect(geometric.traceOptions.simplifyTolerance!).toBeGreaterThanOrEqual(2.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ML Denoise — Blending & Fallback
// ═══════════════════════════════════════════════════════════════════════════

describe('ML Denoise', () => {
  describe('blendImages', () => {
    it('t=0 returns original', () => {
      const a = new ImageData(2, 2)
      const b = new ImageData(2, 2)
      a.data[0] = 100
      a.data[1] = 200
      b.data[0] = 50
      b.data[1] = 50

      const result = blendImages(a, b, 0)
      expect(result.data[0]).toBe(100)
      expect(result.data[1]).toBe(200)
    })

    it('t=1 returns processed', () => {
      const a = new ImageData(2, 2)
      const b = new ImageData(2, 2)
      a.data[0] = 100
      b.data[0] = 50

      const result = blendImages(a, b, 1)
      expect(result.data[0]).toBe(50)
    })

    it('t=0.5 blends evenly', () => {
      const a = new ImageData(1, 1)
      const b = new ImageData(1, 1)
      a.data[0] = 100
      a.data[1] = 0
      a.data[2] = 200
      a.data[3] = 255
      b.data[0] = 200
      b.data[1] = 100
      b.data[2] = 0
      b.data[3] = 255

      const result = blendImages(a, b, 0.5)
      expect(result.data[0]).toBe(150) // (100+200)/2
      expect(result.data[1]).toBe(50) // (0+100)/2
      expect(result.data[2]).toBe(100) // (200+0)/2
      expect(result.data[3]).toBe(255) // alpha unchanged
    })

    it('preserves image dimensions', () => {
      const a = new ImageData(10, 15)
      const b = new ImageData(10, 15)
      const result = blendImages(a, b, 0.5)
      expect(result.width).toBe(10)
      expect(result.height).toBe(15)
    })
  })

  describe('performMLDenoise fallback', () => {
    it('module can be imported', async () => {
      const mod = await import('@/ai/ml-denoise')
      expect(typeof mod.performMLDenoise).toBe('function')
      expect(typeof mod.blendImages).toBe('function')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Text to Image
// ═══════════════════════════════════════════════════════════════════════════

describe('Text to Image', () => {
  it('module exports performTextToImage', async () => {
    const mod = await import('@/ai/text-to-image')
    expect(typeof mod.performTextToImage).toBe('function')
  })

  it('throws on empty prompt', async () => {
    setAIConfig({
      textToImageEndpoint: 'http://localhost:9999/text2img',
      apiKey: 'test',
    })

    const { performTextToImage } = await import('@/ai/text-to-image')
    await expect(
      performTextToImage({
        prompt: '   ',
        negativePrompt: '',
        width: 512,
        height: 512,
      }),
    ).rejects.toThrow('Prompt cannot be empty')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cross-module integration
// ═══════════════════════════════════════════════════════════════════════════

describe('AI Features — Integration', () => {
  it('all AI modules export their public APIs', async () => {
    const neuralFilters = await import('@/ai/neural-filters')
    expect(typeof neuralFilters.getAvailableFilters).toBe('function')
    expect(typeof neuralFilters.getFilterById).toBe('function')
    expect(typeof neuralFilters.registerFilter).toBe('function')
    expect(typeof neuralFilters.unregisterFilter).toBe('function')
    expect(typeof neuralFilters.applyNeuralFilter).toBe('function')

    const textToVector = await import('@/ai/text-to-vector')
    expect(typeof textToVector.performTextToVector).toBe('function')
    expect(typeof textToVector.getStylePreset).toBe('function')
    expect(typeof textToVector.getAvailableStyles).toBe('function')

    const textToImage = await import('@/ai/text-to-image')
    expect(typeof textToImage.performTextToImage).toBe('function')

    const superRes = await import('@/ai/super-resolution')
    expect(typeof superRes.performSuperResolution).toBe('function')
    expect(typeof superRes.computeTiles).toBe('function')
    expect(typeof superRes.extractTile).toBe('function')
    expect(typeof superRes.reassembleTiles).toBe('function')

    const mlDenoise = await import('@/ai/ml-denoise')
    expect(typeof mlDenoise.performMLDenoise).toBe('function')
    expect(typeof mlDenoise.blendImages).toBe('function')
  })
})
