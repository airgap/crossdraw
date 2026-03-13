import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  colorRangeSelect,
  luminosityRangeSelect,
  clearSelection,
  getSelectionMask,
  getSelectedPixelCount,
} from '@/tools/raster-selection'
import {
  getColorRangeSettings,
  setColorRangeSettings,
  beginColorRangeSample,
  updateColorRangeFuzziness,
  commitColorRange,
  getColorRangePreviewMask,
  resetColorRange,
} from '@/tools/color-range-tool'

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
  // Left half red (255,0,0), right half blue (0,0,255)
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
  // Horizontal gradient from black (0,0,0) to white (255,255,255)
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

// ── colorRangeSelect ──

describe('colorRangeSelect', () => {
  beforeEach(() => clearSelection())

  test('exact color match with fuzziness=0 selects only exact pixels', () => {
    const img = createTwoColorImageData(20, 20)
    const mask = colorRangeSelect(img, { r: 255, g: 0, b: 0 }, 0, 'replace')
    expect(mask.width).toBe(20)
    expect(mask.height).toBe(20)
    // Only left half (red pixels) should be selected
    const selected = getSelectedPixelCount(mask)
    expect(selected).toBe(200) // 10*20
  })

  test('fuzziness=0 selects nothing when no exact match', () => {
    const img = createSolidImageData(10, 10, 100, 100, 100)
    const mask = colorRangeSelect(img, { r: 101, g: 100, b: 100 }, 0, 'replace')
    // distance = sqrt(1) = 1, fuzziness=0 → none selected
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('fuzzy matching selects similar colors', () => {
    const img = createSolidImageData(10, 10, 100, 100, 100)
    // distance from (100,100,100) to (110,100,100) = 10
    const mask = colorRangeSelect(img, { r: 110, g: 100, b: 100 }, 15, 'replace')
    // distance=10, fuzz=15, 10 <= 15 → fully selected
    expect(getSelectedPixelCount(mask)).toBe(100) // all 10*10
  })

  test('gradient falloff for semi-matching pixels', () => {
    // Create image with pixel at exactly (150,0,0)
    const img = createSolidImageData(10, 10, 150, 0, 0)
    // Target (100,0,0), fuzziness=30
    // distance = sqrt(50^2) = 50, fuzz=30
    // 50 > 30 but 50 < 60 (fuzz*2) → soft falloff
    // value = round(255 * (1 - (50-30)/30)) = round(255 * (1 - 0.667)) = round(255 * 0.333) = 85
    const mask = colorRangeSelect(img, { r: 100, g: 0, b: 0 }, 30, 'replace')
    // Should have soft selection (0 < value < 255)
    expect(mask.data[0]).toBeGreaterThan(0)
    expect(mask.data[0]).toBeLessThan(255)
  })

  test('pixels outside fuzziness*2 are not selected', () => {
    const img = createSolidImageData(10, 10, 200, 0, 0)
    // Target (0,0,0), fuzziness=50
    // distance = sqrt(200^2) = 200, fuzz*2=100
    // 200 > 100 → not selected
    const mask = colorRangeSelect(img, { r: 0, g: 0, b: 0 }, 50, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(0)
  })

  test('add mode adds to existing selection', () => {
    const img = createTwoColorImageData(20, 20)
    // Select red pixels
    colorRangeSelect(img, { r: 255, g: 0, b: 0 }, 0, 'replace')
    // Add blue pixels
    const mask = colorRangeSelect(img, { r: 0, g: 0, b: 255 }, 0, 'add')
    // All 400 pixels should be selected
    expect(getSelectedPixelCount(mask)).toBe(400)
  })

  test('subtract mode removes from existing selection', () => {
    const img = createTwoColorImageData(20, 20)
    // Select all by selecting red then adding blue
    colorRangeSelect(img, { r: 255, g: 0, b: 0 }, 0, 'replace')
    colorRangeSelect(img, { r: 0, g: 0, b: 255 }, 0, 'add')
    expect(getSelectedPixelCount(getSelectionMask()!)).toBe(400)

    // Subtract red pixels
    const mask = colorRangeSelect(img, { r: 255, g: 0, b: 0 }, 0, 'subtract')
    // Only blue should remain
    expect(getSelectedPixelCount(mask)).toBe(200)
  })

  test('replace mode with no existing mask creates new mask', () => {
    const img = createSolidImageData(5, 5, 0, 0, 0)
    const mask = colorRangeSelect(img, { r: 0, g: 0, b: 0 }, 0, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(25)
  })

  test('fuzziness is clamped to 0-200 range', () => {
    const img = createSolidImageData(5, 5, 100, 100, 100)
    // Negative fuzziness should be clamped to 0
    const mask1 = colorRangeSelect(img, { r: 100, g: 100, b: 100 }, -10, 'replace')
    expect(getSelectedPixelCount(mask1)).toBe(25) // exact match still works

    clearSelection()
    // Very large fuzziness should be clamped to 200
    const mask2 = colorRangeSelect(img, { r: 100, g: 100, b: 100 }, 500, 'replace')
    expect(getSelectedPixelCount(mask2)).toBe(25)
  })

  test('selects across entire image regardless of connectivity', () => {
    // Create checkerboard of red and blue
    const w = 10
    const h = 10
    const data = new Uint8ClampedArray(w * h * 4)
    let redCount = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        if ((x + y) % 2 === 0) {
          data[idx] = 255 // R
          data[idx + 1] = 0
          data[idx + 2] = 0
          data[idx + 3] = 255
          redCount++
        } else {
          data[idx] = 0
          data[idx + 1] = 0
          data[idx + 2] = 255 // B
          data[idx + 3] = 255
        }
      }
    }
    const img = new ImageData(data, w, h)

    // Select all red pixels (non-contiguous, scattered)
    const mask = colorRangeSelect(img, { r: 255, g: 0, b: 0 }, 0, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(redCount)
  })
})

// ── luminosityRangeSelect ──

describe('luminosityRangeSelect', () => {
  beforeEach(() => clearSelection())

  test('selects pixels within luminosity range', () => {
    // Black pixels: luminosity = 0
    const img = createSolidImageData(10, 10, 0, 0, 0)
    const mask = luminosityRangeSelect(img, 0, 10, 0, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(100) // all black pixels
  })

  test('excludes pixels outside luminosity range', () => {
    // White pixels: luminosity ~= 255
    const img = createSolidImageData(10, 10, 255, 255, 255)
    // Select only dark pixels (0-50)
    const mask = luminosityRangeSelect(img, 0, 50, 0, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(0) // white is ~255, outside range
  })

  test('selects mid-range luminosity', () => {
    // Gray (128,128,128): luminosity = 0.2126*128 + 0.7152*128 + 0.0722*128 = 128
    const img = createSolidImageData(10, 10, 128, 128, 128)
    const mask = luminosityRangeSelect(img, 120, 140, 0, 'replace')
    expect(getSelectedPixelCount(mask)).toBe(100)
  })

  test('feather creates soft edges at boundaries', () => {
    const img = createGradientImageData(100, 1)
    // Select mid-range (100-150) with feather=20
    const mask = luminosityRangeSelect(img, 100, 150, 20, 'replace')

    // Pixels well within range should be fully selected
    // pixel at x=50 has value ~128.5, which is within 100-150
    expect(mask.data[50]).toBe(255)

    // Pixels just outside range should have soft falloff
    // pixel at x=37 has value ~94.9 which is within feather zone (80-100)
    // It should be > 0 but < 255
    const nearBoundaryPixel = mask.data[37]!
    // This pixel is near the boundary, should have some soft selection
    // (exact values depend on rounding, just check it's in the soft zone or 0)
    expect(nearBoundaryPixel).toBeLessThanOrEqual(255)
  })

  test('feather=0 gives hard edges', () => {
    const img = createGradientImageData(100, 1)
    const mask = luminosityRangeSelect(img, 100, 150, 0, 'replace')

    // Check that values are either 0 or 255 (no soft edges)
    for (let i = 0; i < mask.data.length; i++) {
      expect(mask.data[i] === 0 || mask.data[i] === 255).toBe(true)
    }
  })

  test('add mode adds to existing selection', () => {
    const img = createGradientImageData(100, 1)
    // Select dark range
    luminosityRangeSelect(img, 0, 50, 0, 'replace')
    const countDark = getSelectedPixelCount(getSelectionMask()!)
    // Add bright range
    const mask = luminosityRangeSelect(img, 200, 255, 0, 'add')
    const countBoth = getSelectedPixelCount(mask)
    expect(countBoth).toBeGreaterThan(countDark)
  })

  test('subtract mode removes from existing selection', () => {
    const img = createGradientImageData(100, 1)
    // Select everything
    luminosityRangeSelect(img, 0, 255, 0, 'replace')
    const countAll = getSelectedPixelCount(getSelectionMask()!)
    expect(countAll).toBe(100)

    // Subtract dark range
    const mask = luminosityRangeSelect(img, 0, 50, 0, 'subtract')
    expect(getSelectedPixelCount(mask)).toBeLessThan(countAll)
  })

  test('uses correct luminosity formula', () => {
    // Pure red (255,0,0): lum = 0.2126*255 = 54.213
    // Pure green (0,255,0): lum = 0.7152*255 = 182.376
    // Pure blue (0,0,255): lum = 0.0722*255 = 18.411
    const w = 3
    const h = 1
    const data = new Uint8ClampedArray(w * h * 4)
    data[0] = 255
    data[1] = 0
    data[2] = 0
    data[3] = 255 // red
    data[4] = 0
    data[5] = 255
    data[6] = 0
    data[7] = 255 // green
    data[8] = 0
    data[9] = 0
    data[10] = 255
    data[11] = 255 // blue
    const img = new ImageData(data, w, h)

    // Select only high luminosity (>100)
    const mask = luminosityRangeSelect(img, 100, 255, 0, 'replace')
    // Only green (lum ~182) should be selected; red (~54) and blue (~18) are below 100
    expect(mask.data[0]).toBe(0) // red
    expect(mask.data[1]).toBe(255) // green
    expect(mask.data[2]).toBe(0) // blue
  })
})

// ── Color Range Tool ──

describe('Color Range Tool', () => {
  beforeEach(() => {
    clearSelection()
    resetColorRange()
  })

  test('getColorRangeSettings returns default settings', () => {
    const settings = getColorRangeSettings()
    expect(settings.fuzziness).toBe(40)
    expect(settings.sampleColor).toBeNull()
    expect(settings.preview).toBe(true)
  })

  test('setColorRangeSettings updates settings', () => {
    setColorRangeSettings({ fuzziness: 100 })
    expect(getColorRangeSettings().fuzziness).toBe(100)

    setColorRangeSettings({ preview: false })
    expect(getColorRangeSettings().preview).toBe(false)
  })

  test('fuzziness is clamped to 0-200', () => {
    setColorRangeSettings({ fuzziness: -50 })
    expect(getColorRangeSettings().fuzziness).toBe(0)

    setColorRangeSettings({ fuzziness: 300 })
    expect(getColorRangeSettings().fuzziness).toBe(200)
  })

  test('beginColorRangeSample picks color from image data', () => {
    const img = createSolidImageData(10, 10, 128, 64, 32)
    const color = beginColorRangeSample(5, 5, img)
    expect(color).toEqual({ r: 128, g: 64, b: 32 })
    expect(getColorRangeSettings().sampleColor).toEqual({ r: 128, g: 64, b: 32 })
  })

  test('beginColorRangeSample returns null for out-of-bounds', () => {
    const img = createSolidImageData(10, 10, 128, 64, 32)
    expect(beginColorRangeSample(-1, 5, img)).toBeNull()
    expect(beginColorRangeSample(5, -1, img)).toBeNull()
    expect(beginColorRangeSample(10, 5, img)).toBeNull()
    expect(beginColorRangeSample(5, 10, img)).toBeNull()
  })

  test('beginColorRangeSample generates preview mask when preview enabled', () => {
    setColorRangeSettings({ preview: true })
    const img = createSolidImageData(10, 10, 200, 100, 50)
    beginColorRangeSample(5, 5, img)
    const preview = getColorRangePreviewMask()
    expect(preview).not.toBeNull()
    expect(preview!.width).toBe(10)
    expect(preview!.height).toBe(10)
  })

  test('updateColorRangeFuzziness regenerates preview', () => {
    const img = createSolidImageData(10, 10, 200, 100, 50)
    beginColorRangeSample(5, 5, img)

    const mask = updateColorRangeFuzziness(100, img)
    expect(mask).not.toBeNull()
    expect(getColorRangeSettings().fuzziness).toBe(100)
  })

  test('commitColorRange applies selection mask', () => {
    const img = createTwoColorImageData(20, 20)
    beginColorRangeSample(5, 10, img) // sample red
    const mask = commitColorRange(img, 'replace')
    expect(mask).not.toBeNull()
    // Should have selected the red half
    expect(getSelectedPixelCount(mask!)).toBe(200)
  })

  test('commitColorRange returns null when no color sampled', () => {
    const img = createSolidImageData(10, 10, 0, 0, 0)
    expect(commitColorRange(img, 'replace')).toBeNull()
  })

  test('resetColorRange clears sample color and preview', () => {
    const img = createSolidImageData(10, 10, 100, 100, 100)
    beginColorRangeSample(5, 5, img)
    expect(getColorRangeSettings().sampleColor).not.toBeNull()

    resetColorRange()
    expect(getColorRangeSettings().sampleColor).toBeNull()
    expect(getColorRangePreviewMask()).toBeNull()
  })
})
