import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  beginQuickSelection,
  paintQuickSelection,
  endQuickSelection,
  isQuickSelectionActive,
  getQuickSelectionSettings,
  setQuickSelectionSettings,
} from '@/tools/quick-selection'
import {
  getSelectionMask,
  setSelectionMask,
  clearSelection,
  getSelectedPixelCount,
  type SelectionMask,
} from '@/tools/raster-selection'

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
  // Left half red, right half blue — creates a strong edge in the middle
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x < w / 2) {
        data[idx] = 255
        data[idx + 1] = 0
        data[idx + 2] = 0
        data[idx + 3] = 255
      } else {
        data[idx] = 0
        data[idx + 1] = 0
        data[idx + 2] = 255
        data[idx + 3] = 255
      }
    }
  }
  return new ImageData(data, w, h)
}

function createGradientImageData(w: number, h: number): ImageData {
  // Horizontal gradient from black to white
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const v = Math.round((x / (w - 1)) * 255)
      data[idx] = v
      data[idx + 1] = v
      data[idx + 2] = v
      data[idx + 3] = 255
    }
  }
  return new ImageData(data, w, h)
}

// ── Settings tests ──

describe('getQuickSelectionSettings / setQuickSelectionSettings', () => {
  test('returns default settings', () => {
    const settings = getQuickSelectionSettings()
    expect(settings.brushSize).toBe(20)
    expect(settings.autoEnhance).toBe(true)
    expect(settings.sampleAllLayers).toBe(false)
  })

  test('updates brushSize', () => {
    setQuickSelectionSettings({ brushSize: 50 })
    expect(getQuickSelectionSettings().brushSize).toBe(50)
    setQuickSelectionSettings({ brushSize: 20 }) // reset
  })

  test('clamps brushSize to valid range', () => {
    setQuickSelectionSettings({ brushSize: -10 })
    expect(getQuickSelectionSettings().brushSize).toBe(1)
    setQuickSelectionSettings({ brushSize: 1000 })
    expect(getQuickSelectionSettings().brushSize).toBe(500)
    setQuickSelectionSettings({ brushSize: 20 }) // reset
  })

  test('updates autoEnhance', () => {
    setQuickSelectionSettings({ autoEnhance: false })
    expect(getQuickSelectionSettings().autoEnhance).toBe(false)
    setQuickSelectionSettings({ autoEnhance: true }) // reset
  })

  test('updates sampleAllLayers', () => {
    setQuickSelectionSettings({ sampleAllLayers: true })
    expect(getQuickSelectionSettings().sampleAllLayers).toBe(true)
    setQuickSelectionSettings({ sampleAllLayers: false }) // reset
  })

  test('returns a copy (not reference)', () => {
    const s1 = getQuickSelectionSettings()
    const s2 = getQuickSelectionSettings()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })
})

// ── Active state tests ──

describe('isQuickSelectionActive', () => {
  beforeEach(() => {
    clearSelection()
    // Ensure tool is not active by ending any pending selection
    endQuickSelection()
  })

  test('returns false when not active', () => {
    expect(isQuickSelectionActive()).toBe(false)
  })

  test('returns true after beginQuickSelection', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(10, 10, imageData, 'add')
    expect(isQuickSelectionActive()).toBe(true)
    endQuickSelection()
  })

  test('returns false after endQuickSelection', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(10, 10, imageData, 'add')
    endQuickSelection()
    expect(isQuickSelectionActive()).toBe(false)
  })
})

// ── Begin selection tests ──

describe('beginQuickSelection', () => {
  beforeEach(() => {
    clearSelection()
    endQuickSelection()
    setQuickSelectionSettings({ brushSize: 20, autoEnhance: false })
  })

  test('creates selection mask on solid color image', () => {
    const imageData = createSolidImageData(20, 20, 100, 100, 100)
    const mask = beginQuickSelection(10, 10, imageData, 'add')
    expect(mask).not.toBeNull()
    expect(mask!.width).toBe(20)
    expect(mask!.height).toBe(20)
    // On a solid color, the flood fill should select pixels
    expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    endQuickSelection()
  })

  test('returns null for zero-size image', () => {
    const imageData = new ImageData(1, 0) // degenerate
    const mask = beginQuickSelection(0, 0, imageData, 'add')
    // Width = 1, height = 0 means w*h = 0, so should return null
    expect(mask).toBeNull()
    endQuickSelection()
  })

  test('selects correct region on two-color image', () => {
    const imageData = createTwoColorImageData(40, 20)
    // Click on the red side (x=5)
    const mask = beginQuickSelection(5, 10, imageData, 'add')
    expect(mask).not.toBeNull()

    // Count selected pixels — should be mostly from the red side
    const count = getSelectedPixelCount(mask!)
    expect(count).toBeGreaterThan(0)

    // Pixel on far blue side should not be selected (strong edge stops expansion)
    expect(mask!.data[10 * 40 + 35]).toBe(0)
    endQuickSelection()
  })

  test('sets the global selection mask', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(10, 10, imageData, 'add')
    const globalMask = getSelectionMask()
    expect(globalMask).not.toBeNull()
    expect(globalMask!.width).toBe(20)
    endQuickSelection()
  })

  test('add mode preserves existing selection', () => {
    // Set up an existing selection in top-left corner
    const existing: SelectionMask = { width: 20, height: 20, data: new Uint8Array(400) }
    existing.data[0] = 255 // pixel at (0,0)
    setSelectionMask(existing)

    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    const mask = beginQuickSelection(10, 10, imageData, 'add')
    expect(mask).not.toBeNull()

    // The original pixel at (0,0) should still be selected
    expect(mask!.data[0]).toBe(255)
    endQuickSelection()
  })

  test('subtract mode removes from existing selection', () => {
    // Start with all selected
    const existing: SelectionMask = { width: 20, height: 20, data: new Uint8Array(400).fill(255) }
    setSelectionMask(existing)

    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    const mask = beginQuickSelection(10, 10, imageData, 'subtract')
    expect(mask).not.toBeNull()

    // Some pixels should now be deselected
    const count = getSelectedPixelCount(mask!)
    expect(count).toBeLessThan(400)
    endQuickSelection()
  })
})

// ── Paint selection tests ──

describe('paintQuickSelection', () => {
  beforeEach(() => {
    clearSelection()
    endQuickSelection()
    setQuickSelectionSettings({ brushSize: 20, autoEnhance: false })
  })

  test('returns null when not active', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    const result = paintQuickSelection(5, 5, imageData)
    expect(result).toBeNull()
  })

  test('expands selection on drag', () => {
    const imageData = createSolidImageData(40, 40, 128, 128, 128)
    setQuickSelectionSettings({ brushSize: 10 })
    beginQuickSelection(5, 5, imageData, 'add')
    const countBefore = getSelectedPixelCount(getSelectionMask()!)

    // Paint at a new location
    paintQuickSelection(30, 30, imageData)
    const countAfter = getSelectedPixelCount(getSelectionMask()!)

    // Selection should have grown
    expect(countAfter).toBeGreaterThanOrEqual(countBefore)
    endQuickSelection()
  })

  test('updates the global selection mask', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(5, 5, imageData, 'add')
    paintQuickSelection(15, 15, imageData)
    const mask = getSelectionMask()
    expect(mask).not.toBeNull()
    expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    endQuickSelection()
  })
})

// ── End selection tests ──

describe('endQuickSelection', () => {
  beforeEach(() => {
    clearSelection()
    endQuickSelection()
  })

  test('returns null when not active', () => {
    const result = endQuickSelection()
    expect(result).toBeNull()
  })

  test('returns final mask', () => {
    setQuickSelectionSettings({ autoEnhance: false })
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(10, 10, imageData, 'add')
    const mask = endQuickSelection()
    expect(mask).not.toBeNull()
    expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
  })

  test('auto-enhance smooths edges', () => {
    setQuickSelectionSettings({ autoEnhance: true, brushSize: 10 })
    const imageData = createTwoColorImageData(40, 20)
    beginQuickSelection(5, 10, imageData, 'add')
    const mask = endQuickSelection()
    expect(mask).not.toBeNull()
    // The auto-enhance should still produce a valid mask
    expect(mask!.width).toBe(40)
    expect(mask!.height).toBe(20)
  })

  test('sets active to false', () => {
    setQuickSelectionSettings({ autoEnhance: false })
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    beginQuickSelection(10, 10, imageData, 'add')
    expect(isQuickSelectionActive()).toBe(true)
    endQuickSelection()
    expect(isQuickSelectionActive()).toBe(false)
  })
})

// ── Edge-aware behavior tests ──

describe('edge-aware selection', () => {
  beforeEach(() => {
    clearSelection()
    endQuickSelection()
    setQuickSelectionSettings({ brushSize: 20, autoEnhance: false })
  })

  test('respects color boundaries on two-color image', () => {
    const imageData = createTwoColorImageData(40, 20)
    // Click on the left (red) side
    const mask = beginQuickSelection(5, 10, imageData, 'add')
    expect(mask).not.toBeNull()

    // Count how many blue-side pixels (x >= 20) are selected
    let blueSelected = 0
    for (let y = 0; y < 20; y++) {
      for (let x = 20; x < 40; x++) {
        if (mask!.data[y * 40 + x]! > 0) blueSelected++
      }
    }

    // Count how many red-side pixels (x < 20) are selected
    let redSelected = 0
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (mask!.data[y * 40 + x]! > 0) redSelected++
      }
    }

    // Red side should have significantly more selected pixels than blue side
    expect(redSelected).toBeGreaterThan(blueSelected)
    endQuickSelection()
  })

  test('gradient image has limited selection spread', () => {
    const imageData = createGradientImageData(40, 10)
    setQuickSelectionSettings({ brushSize: 10 })

    // Click on left side (dark)
    const mask = beginQuickSelection(2, 5, imageData, 'add')
    expect(mask).not.toBeNull()

    // The far right (bright) should not be selected
    let farRightSelected = 0
    for (let y = 0; y < 10; y++) {
      if (mask!.data[y * 40 + 39]! > 0) farRightSelected++
    }
    expect(farRightSelected).toBe(0)
    endQuickSelection()
  })

  test('out-of-bounds click produces no selection', () => {
    const imageData = createSolidImageData(20, 20, 128, 128, 128)
    const mask = beginQuickSelection(-5, -5, imageData, 'add')
    expect(mask).not.toBeNull()
    expect(getSelectedPixelCount(mask!)).toBe(0)
    endQuickSelection()
  })
})

// ── Integration tests ──

describe('quick selection full workflow', () => {
  beforeEach(() => {
    clearSelection()
    endQuickSelection()
    setQuickSelectionSettings({ brushSize: 15, autoEnhance: false })
  })

  test('begin + paint + end produces valid selection', () => {
    const imageData = createSolidImageData(30, 30, 100, 100, 100)
    beginQuickSelection(5, 5, imageData, 'add')
    paintQuickSelection(15, 15, imageData)
    paintQuickSelection(25, 25, imageData)
    const mask = endQuickSelection()

    expect(mask).not.toBeNull()
    expect(mask!.width).toBe(30)
    expect(mask!.height).toBe(30)
    expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    expect(isQuickSelectionActive()).toBe(false)
  })

  test('multiple strokes accumulate selection', () => {
    const imageData = createSolidImageData(30, 30, 100, 100, 100)

    // First stroke
    beginQuickSelection(5, 5, imageData, 'add')
    const mask1 = endQuickSelection()
    const count1 = getSelectedPixelCount(mask1!)

    // Second stroke (add mode should preserve first)
    beginQuickSelection(25, 25, imageData, 'add')
    const mask2 = endQuickSelection()
    const count2 = getSelectedPixelCount(mask2!)

    expect(count2).toBeGreaterThanOrEqual(count1)
  })

  test('subtract mode reduces existing selection', () => {
    const imageData = createSolidImageData(20, 20, 100, 100, 100)

    // First stroke: add
    beginQuickSelection(10, 10, imageData, 'add')
    const maskAdd = endQuickSelection()
    const countAdd = getSelectedPixelCount(maskAdd!)
    expect(countAdd).toBeGreaterThan(0)

    // Second stroke: subtract from the same area
    beginQuickSelection(10, 10, imageData, 'subtract')
    const maskSub = endQuickSelection()
    const countSub = getSelectedPixelCount(maskSub!)
    expect(countSub).toBeLessThan(countAdd)
  })
})
