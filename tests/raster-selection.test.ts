import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  createRectSelection,
  createEllipseSelection,
  magicWandSelect,
  invertSelection,
  selectAll,
  clearSelection,
  getSelectionMask,
  setSelectionMask,
  getSelectedPixelCount,
  getSelectionBounds,
  type SelectionMask,
} from '@/tools/raster-selection'
import { storeRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// Save originals
const origImageData = globalThis.ImageData

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
})

// Polyfill ImageData for bun test environment
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
    }
  }
}

// ── Helpers ──

function makeRasterLayer(w: number, h: number, chunkId: string): RasterLayer {
  return {
    id: 'rl-1',
    name: 'Raster',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: w,
    height: h,
  }
}

function createSolidImageData(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return new ImageData(data, w, h)
}

function createTwoColorImageData(w: number, h: number): ImageData {
  // Left half red, right half blue
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x < w / 2) {
        data[idx] = 255 // R
        data[idx + 1] = 0 // G
        data[idx + 2] = 0 // B
        data[idx + 3] = 255 // A
      } else {
        data[idx] = 0 // R
        data[idx + 1] = 0 // G
        data[idx + 2] = 255 // B
        data[idx + 3] = 255 // A
      }
    }
  }
  return new ImageData(data, w, h)
}

// ── Tests ──

describe('setSelectionMask / getSelectionMask / clearSelection', () => {
  beforeEach(() => clearSelection())

  test('getSelectionMask returns null initially', () => {
    expect(getSelectionMask()).toBeNull()
  })

  test('setSelectionMask sets and retrieves mask', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100).fill(255) }
    setSelectionMask(mask)
    expect(getSelectionMask()).toBe(mask)
  })

  test('clearSelection resets mask to null', () => {
    setSelectionMask({ width: 10, height: 10, data: new Uint8Array(100) })
    clearSelection()
    expect(getSelectionMask()).toBeNull()
  })
})

describe('createRectSelection', () => {
  beforeEach(() => clearSelection())

  test('creates rectangular selection in replace mode', () => {
    const mask = createRectSelection(5, 5, 10, 10, 20, 20, 'replace')
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(20)

    // Check pixels inside selection
    const selectedCount = getSelectedPixelCount(mask)
    expect(selectedCount).toBe(100) // 10x10
  })

  test('add mode adds to existing selection', () => {
    createRectSelection(0, 0, 5, 5, 20, 20, 'replace')
    const mask = createRectSelection(10, 10, 5, 5, 20, 20, 'add')

    const selectedCount = getSelectedPixelCount(mask)
    expect(selectedCount).toBe(50) // 5*5 + 5*5
  })

  test('subtract mode removes from existing selection', () => {
    createRectSelection(0, 0, 10, 10, 20, 20, 'replace')
    const mask = createRectSelection(0, 0, 5, 5, 20, 20, 'subtract')

    const selectedCount = getSelectedPixelCount(mask)
    expect(selectedCount).toBe(75) // 100 - 25
  })

  test('handles out of bounds coordinates', () => {
    const mask = createRectSelection(-5, -5, 15, 15, 20, 20)
    // Only 10x10 area should be selected (clipped to 0,0 -> 10,10)
    const selectedCount = getSelectedPixelCount(mask)
    expect(selectedCount).toBe(100)
  })

  test('add mode with no existing mask creates new mask', () => {
    // First call in 'add' mode with no existing mask should create new
    const mask = createRectSelection(0, 0, 5, 5, 10, 10, 'add')
    expect(getSelectedPixelCount(mask)).toBe(25)
  })
})

describe('createEllipseSelection', () => {
  beforeEach(() => clearSelection())

  test('creates elliptical selection', () => {
    const mask = createEllipseSelection(10, 10, 5, 5, 20, 20, 'replace')
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(20)

    // Center pixel should be selected
    expect(mask.data[10 * 20 + 10]).toBe(255)
    // Far corner should not be selected
    expect(mask.data[0]).toBe(0)
  })

  test('add mode adds to existing selection', () => {
    createRectSelection(0, 0, 5, 5, 20, 20, 'replace')
    const mask = createEllipseSelection(15, 15, 3, 3, 20, 20, 'add')

    // Both rect and ellipse selections should be present
    expect(mask.data[0 * 20 + 0]).toBe(255) // from rect
    expect(mask.data[15 * 20 + 15]).toBe(255) // from ellipse
  })

  test('subtract mode removes from ellipse', () => {
    createEllipseSelection(10, 10, 8, 8, 20, 20, 'replace')
    const before = getSelectedPixelCount(getSelectionMask()!)
    const mask = createEllipseSelection(10, 10, 4, 4, 20, 20, 'subtract')
    const after = getSelectedPixelCount(mask)
    expect(after).toBeLessThan(before)
  })

  test('handles out of bounds ellipse', () => {
    const mask = createEllipseSelection(0, 0, 5, 5, 20, 20)
    // Should not crash, only partial ellipse
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(20)
  })
})

describe('magicWandSelect', () => {
  beforeEach(() => clearSelection())

  test('selects contiguous area of same color', () => {
    const chunkId = 'mw-chunk-1'
    const imageData = createSolidImageData(20, 20, 255, 0, 0)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(20, 20, chunkId)

    const mask = magicWandSelect(layer, 10, 10, 32, true, 'replace')
    // All pixels should be selected (all same color)
    expect(getSelectedPixelCount(mask)).toBe(400) // 20*20
  })

  test('contiguous selection stops at color boundary', () => {
    const chunkId = 'mw-chunk-2'
    const imageData = createTwoColorImageData(20, 20)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(20, 20, chunkId)

    // Click on the left (red) side
    const mask = magicWandSelect(layer, 5, 10, 32, true, 'replace')
    const selected = getSelectedPixelCount(mask)
    // Only the left half should be selected (10 * 20 = 200)
    expect(selected).toBe(200)
  })

  test('non-contiguous selection selects all matching pixels', () => {
    const chunkId = 'mw-chunk-3'
    const imageData = createTwoColorImageData(20, 20)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(20, 20, chunkId)

    // Non-contiguous on the red side should still only select red pixels
    const mask = magicWandSelect(layer, 5, 10, 32, false, 'replace')
    const selected = getSelectedPixelCount(mask)
    expect(selected).toBe(200) // All red pixels
  })

  test('out of bounds start returns empty mask', () => {
    const chunkId = 'mw-chunk-4'
    storeRasterData(chunkId, createSolidImageData(20, 20, 0, 0, 0))
    const layer = makeRasterLayer(20, 20, chunkId)

    const mask = magicWandSelect(layer, -5, -5, 32, true, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('returns empty mask when no image data', () => {
    const layer = makeRasterLayer(20, 20, 'nonexistent-chunk')
    const mask = magicWandSelect(layer, 10, 10, 32, true, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('add mode adds to existing selection', () => {
    const chunkId = 'mw-chunk-5'
    const imageData = createTwoColorImageData(20, 20)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(20, 20, chunkId)

    // Select left half
    magicWandSelect(layer, 5, 10, 32, true, 'replace')
    // Add right half
    const mask = magicWandSelect(layer, 15, 10, 32, true, 'add')
    expect(getSelectedPixelCount(mask)).toBe(400) // All pixels
  })

  test('subtract mode removes from selection', () => {
    const chunkId = 'mw-chunk-6'
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(20, 20, chunkId)

    // Select all
    magicWandSelect(layer, 10, 10, 255, true, 'replace')
    // Subtract — same tolerance selects same color, subtracts all
    const mask = magicWandSelect(layer, 10, 10, 255, true, 'subtract')
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('non-contiguous subtract mode', () => {
    const chunkId = 'mw-chunk-7'
    const imageData = createSolidImageData(10, 10, 50, 50, 50)
    storeRasterData(chunkId, imageData)
    const layer = makeRasterLayer(10, 10, chunkId)

    selectAll(10, 10)
    const mask = magicWandSelect(layer, 5, 5, 255, false, 'subtract')
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('tolerance controls color matching range', () => {
    const chunkId = 'mw-chunk-8'
    // Create gradient-like image
    const w = 20
    const h = 1
    const data = new Uint8ClampedArray(w * h * 4)
    for (let x = 0; x < w; x++) {
      const idx = x * 4
      data[idx] = x * 12 // R: 0 to 228
      data[idx + 1] = 0
      data[idx + 2] = 0
      data[idx + 3] = 255
    }
    storeRasterData(chunkId, new ImageData(data, w, h))
    const layer = makeRasterLayer(w, h, chunkId)

    // Low tolerance: only nearby colors
    const maskLow = magicWandSelect(layer, 0, 0, 5, true, 'replace')
    const lowCount = getSelectedPixelCount(maskLow)

    // High tolerance: more colors
    clearSelection()
    const maskHigh = magicWandSelect(layer, 0, 0, 100, true, 'replace')
    const highCount = getSelectedPixelCount(maskHigh)

    expect(highCount).toBeGreaterThanOrEqual(lowCount)
  })
})

describe('invertSelection', () => {
  beforeEach(() => clearSelection())

  test('returns null when no mask', () => {
    expect(invertSelection()).toBeNull()
  })

  test('inverts all selected to unselected and vice versa', () => {
    createRectSelection(0, 0, 5, 5, 10, 10, 'replace')
    const before = getSelectedPixelCount(getSelectionMask()!)

    invertSelection()

    const after = getSelectedPixelCount(getSelectionMask()!)
    expect(after).toBe(100 - before) // 10*10 total minus originally selected
  })
})

describe('selectAll', () => {
  beforeEach(() => clearSelection())

  test('selects all pixels', () => {
    const mask = selectAll(20, 15)
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(15)
    expect(getSelectedPixelCount(mask)).toBe(300) // 20*15
  })
})

describe('getSelectedPixelCount', () => {
  test('returns 0 for empty mask', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('returns correct count for partial mask', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    mask.data[0] = 255
    mask.data[50] = 128 // Any value > 0 counts
    expect(getSelectedPixelCount(mask)).toBe(2)
  })
})

describe('getSelectionBounds', () => {
  test('returns null for empty selection', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    expect(getSelectionBounds(mask)).toBeNull()
  })

  test('returns correct bounds for partial selection', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    // Select area from (3,4) to (7,8)
    for (let y = 4; y <= 8; y++) {
      for (let x = 3; x <= 7; x++) {
        mask.data[y * 10 + x] = 255
      }
    }
    const bounds = getSelectionBounds(mask)!
    expect(bounds.x).toBe(3)
    expect(bounds.y).toBe(4)
    expect(bounds.width).toBe(5) // 7 - 3 + 1
    expect(bounds.height).toBe(5) // 8 - 4 + 1
  })

  test('returns single pixel bounds', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    mask.data[55] = 255 // pixel at (5, 5)
    const bounds = getSelectionBounds(mask)!
    expect(bounds.x).toBe(5)
    expect(bounds.y).toBe(5)
    expect(bounds.width).toBe(1)
    expect(bounds.height).toBe(1)
  })

  test('returns full bounds for full selection', () => {
    const mask = selectAll(20, 15)
    const bounds = getSelectionBounds(mask)!
    expect(bounds.x).toBe(0)
    expect(bounds.y).toBe(0)
    expect(bounds.width).toBe(20)
    expect(bounds.height).toBe(15)
  })
})
