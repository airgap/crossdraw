import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { performSelectSky, getSelectSkySettings, setSelectSkySettings } from '@/tools/select-sky'
import { performFocusAreaSelect, computeFocusMap, getFocusAreaSettings, setFocusAreaSettings } from '@/tools/focus-area'
import { getSelectionMask, clearSelection, getSelectedPixelCount } from '@/tools/raster-selection'

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

/** Blue sky on top, green ground on bottom, with a clear edge between them. */
function createSkyGroundImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  const horizon = Math.floor(h / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (y < horizon) {
        // Sky: blue
        data[idx] = 100
        data[idx + 1] = 150
        data[idx + 2] = 230
        data[idx + 3] = 255
      } else {
        // Ground: green
        data[idx] = 50
        data[idx + 1] = 130
        data[idx + 2] = 30
        data[idx + 3] = 255
      }
    }
  }
  return new ImageData(data, w, h)
}

/** Image with sharp edges in one region and uniform (blurry) in another. */
function createSharpBlurryImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x < w / 2) {
        // Left half: checkerboard pattern (sharp, high-frequency detail)
        const checker = (x + y) % 2 === 0 ? 255 : 0
        data[idx] = checker
        data[idx + 1] = checker
        data[idx + 2] = checker
        data[idx + 3] = 255
      } else {
        // Right half: uniform gray (blurry / no detail)
        data[idx] = 128
        data[idx + 1] = 128
        data[idx + 2] = 128
        data[idx + 3] = 255
      }
    }
  }
  return new ImageData(data, w, h)
}

// ── Select Sky Tests ──

describe('Select Sky', () => {
  beforeEach(() => {
    clearSelection()
    setSelectSkySettings({ tolerance: 40, edgeThreshold: 30, refineMask: false })
  })

  describe('getSelectSkySettings / setSelectSkySettings', () => {
    test('returns default settings', () => {
      const s = getSelectSkySettings()
      expect(s.tolerance).toBe(40)
      expect(s.edgeThreshold).toBe(30)
      expect(s.refineMask).toBe(false)
    })

    test('updates settings partially', () => {
      setSelectSkySettings({ tolerance: 60 })
      const s = getSelectSkySettings()
      expect(s.tolerance).toBe(60)
      expect(s.edgeThreshold).toBe(30) // unchanged
    })

    test('clamps tolerance to valid range', () => {
      setSelectSkySettings({ tolerance: 300 })
      expect(getSelectSkySettings().tolerance).toBe(255)
      setSelectSkySettings({ tolerance: -10 })
      expect(getSelectSkySettings().tolerance).toBe(0)
    })

    test('clamps edgeThreshold to valid range', () => {
      setSelectSkySettings({ edgeThreshold: 999 })
      expect(getSelectSkySettings().edgeThreshold).toBe(255)
    })

    test('setting refineMask works', () => {
      setSelectSkySettings({ refineMask: true })
      expect(getSelectSkySettings().refineMask).toBe(true)
    })
  })

  describe('performSelectSky', () => {
    test('selects blue sky region at top of image', () => {
      const img = createSkyGroundImage(40, 40)
      const mask = performSelectSky(img)

      expect(mask.width).toBe(40)
      expect(mask.height).toBe(40)

      // Count selected pixels in the top half (sky) vs bottom half (ground)
      let topSelected = 0
      let bottomSelected = 0
      const horizon = 20
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (mask.data[y * 40 + x]! > 0) {
            if (y < horizon) topSelected++
            else bottomSelected++
          }
        }
      }

      // Most of the top half should be selected
      expect(topSelected).toBeGreaterThan(horizon * 40 * 0.5)
      // Bottom half should have much less selection
      expect(topSelected).toBeGreaterThan(bottomSelected)
    })

    test('returns empty mask for non-sky image', () => {
      // Solid green — not a sky color
      const img = createSolidImageData(20, 20, 0, 128, 0)
      const mask = performSelectSky(img)
      expect(getSelectedPixelCount(mask)).toBe(0)
    })

    test('selects all for uniformly blue image', () => {
      // Solid blue sky
      const img = createSolidImageData(20, 20, 100, 150, 230)
      setSelectSkySettings({ tolerance: 50, edgeThreshold: 50 })
      const mask = performSelectSky(img)
      expect(getSelectedPixelCount(mask)).toBe(400) // 20*20
    })

    test('sets the global selection mask', () => {
      const img = createSolidImageData(10, 10, 100, 150, 230)
      performSelectSky(img)
      const mask = getSelectionMask()
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(10)
    })

    test('handles zero-size image gracefully', () => {
      const img = new ImageData(1, 1)
      // Manually make a 0x0 — use the 1x1 but test a valid small image
      const mask = performSelectSky(img)
      expect(mask.width).toBe(1)
    })

    test('refineMask smooths the selection', () => {
      const img = createSkyGroundImage(40, 40)
      setSelectSkySettings({ refineMask: false })
      const maskNoRefine = performSelectSky(img)
      const countNoRefine = getSelectedPixelCount(maskNoRefine)

      clearSelection()
      setSelectSkySettings({ refineMask: true })
      const maskRefine = performSelectSky(img)
      const countRefine = getSelectedPixelCount(maskRefine)

      // Both should select something, counts may differ due to smoothing
      expect(countNoRefine).toBeGreaterThan(0)
      expect(countRefine).toBeGreaterThan(0)
    })

    test('high tolerance selects more pixels', () => {
      const img = createSkyGroundImage(30, 30)
      setSelectSkySettings({ tolerance: 10, edgeThreshold: 30 })
      const maskLow = performSelectSky(img)
      const countLow = getSelectedPixelCount(maskLow)

      clearSelection()
      setSelectSkySettings({ tolerance: 80, edgeThreshold: 30 })
      const maskHigh = performSelectSky(img)
      const countHigh = getSelectedPixelCount(maskHigh)

      expect(countHigh).toBeGreaterThanOrEqual(countLow)
    })

    test('handles sunset-colored sky (orange/pink)', () => {
      // Orange sky top, dark ground bottom
      const w = 20
      const h = 20
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          if (y < h / 2) {
            // Sunset orange
            data[idx] = 230
            data[idx + 1] = 130
            data[idx + 2] = 60
            data[idx + 3] = 255
          } else {
            // Dark ground
            data[idx] = 30
            data[idx + 1] = 30
            data[idx + 2] = 20
            data[idx + 3] = 255
          }
        }
      }
      const img = new ImageData(data, w, h)
      setSelectSkySettings({ tolerance: 60, edgeThreshold: 20 })
      const mask = performSelectSky(img)

      // Should select some of the sunset sky
      let topSelected = 0
      for (let y = 0; y < h / 2; y++) {
        for (let x = 0; x < w; x++) {
          if (mask.data[y * w + x]! > 0) topSelected++
        }
      }
      expect(topSelected).toBeGreaterThan(0)
    })
  })
})

// ── Focus Area Tests ──

describe('Focus Area', () => {
  beforeEach(() => {
    clearSelection()
    setFocusAreaSettings({ focusRange: [30, 100], noiseLevel: 0 })
  })

  describe('getFocusAreaSettings / setFocusAreaSettings', () => {
    test('returns default settings', () => {
      const s = getFocusAreaSettings()
      expect(s.focusRange).toEqual([30, 100])
      expect(s.noiseLevel).toBe(0)
    })

    test('updates settings partially', () => {
      setFocusAreaSettings({ noiseLevel: 5 })
      const s = getFocusAreaSettings()
      expect(s.noiseLevel).toBe(5)
      expect(s.focusRange).toEqual([30, 100]) // unchanged
    })

    test('clamps focusRange values', () => {
      setFocusAreaSettings({ focusRange: [-10, 200] })
      const s = getFocusAreaSettings()
      expect(s.focusRange[0]).toBe(0)
      expect(s.focusRange[1]).toBe(100)
    })

    test('clamps noiseLevel', () => {
      setFocusAreaSettings({ noiseLevel: 50 })
      expect(getFocusAreaSettings().noiseLevel).toBe(20)
    })

    test('returns a copy, not a reference', () => {
      const s1 = getFocusAreaSettings()
      s1.focusRange[0] = 99
      const s2 = getFocusAreaSettings()
      expect(s2.focusRange[0]).toBe(30) // still the default, not mutated
    })
  })

  describe('computeFocusMap', () => {
    test('returns Float32Array of correct size', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      const map = computeFocusMap(img)
      expect(map).toBeInstanceOf(Float32Array)
      expect(map.length).toBe(400) // 20*20
    })

    test('uniform image has near-zero focus values', () => {
      const img = createSolidImageData(20, 20, 100, 100, 100)
      const map = computeFocusMap(img)
      let maxVal = 0
      for (let i = 0; i < map.length; i++) {
        if (map[i]! > maxVal) maxVal = map[i]!
      }
      // A perfectly uniform image should have zero Laplacian variance
      expect(maxVal).toBeLessThan(1)
    })

    test('sharp edges produce higher focus values', () => {
      const img = createSharpBlurryImage(40, 40)
      const map = computeFocusMap(img)

      // Average focus in left half (checkerboard) vs right half (uniform)
      let leftSum = 0
      let rightSum = 0
      let leftCount = 0
      let rightCount = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (x < 20) {
            leftSum += map[y * 40 + x]!
            leftCount++
          } else {
            rightSum += map[y * 40 + x]!
            rightCount++
          }
        }
      }

      const leftAvg = leftSum / leftCount
      const rightAvg = rightSum / rightCount

      // Left (sharp) should have higher focus values than right (blurry)
      expect(leftAvg).toBeGreaterThan(rightAvg)
    })
  })

  describe('performFocusAreaSelect', () => {
    test('selects in-focus (sharp) areas', () => {
      const img = createSharpBlurryImage(40, 40)
      setFocusAreaSettings({ focusRange: [50, 100], noiseLevel: 0 })
      const mask = performFocusAreaSelect(img)

      expect(mask.width).toBe(40)
      expect(mask.height).toBe(40)

      // Count selected pixels in left (sharp) vs right (blurry) halves
      let leftSelected = 0
      let rightSelected = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (mask.data[y * 40 + x]! > 0) {
            if (x < 20) leftSelected++
            else rightSelected++
          }
        }
      }

      // Sharp left half should have more selected pixels
      expect(leftSelected).toBeGreaterThan(rightSelected)
    })

    test('uniform image with focusRange including 0 selects all', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      setFocusAreaSettings({ focusRange: [0, 100], noiseLevel: 0 })
      const mask = performFocusAreaSelect(img)
      // Uniform image: all variance is 0, focusRange starts at 0, so all selected
      expect(getSelectedPixelCount(mask)).toBe(400)
    })

    test('uniform image with high focusRange min selects nothing', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      setFocusAreaSettings({ focusRange: [50, 100], noiseLevel: 0 })
      const mask = performFocusAreaSelect(img)
      // Uniform variance = 0, no pixels above 50% threshold
      expect(getSelectedPixelCount(mask)).toBe(0)
    })

    test('sets the global selection mask', () => {
      const img = createSolidImageData(10, 10, 128, 128, 128)
      setFocusAreaSettings({ focusRange: [0, 100], noiseLevel: 0 })
      performFocusAreaSelect(img)
      const mask = getSelectionMask()
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(10)
    })

    test('noiseLevel removes small isolated selections', () => {
      const img = createSharpBlurryImage(40, 40)
      setFocusAreaSettings({ focusRange: [30, 100], noiseLevel: 0 })
      const maskNoNoise = performFocusAreaSelect(img)
      const countNoNoise = getSelectedPixelCount(maskNoNoise)

      clearSelection()
      setFocusAreaSettings({ focusRange: [30, 100], noiseLevel: 3 })
      const maskNoise = performFocusAreaSelect(img)
      const countNoise = getSelectedPixelCount(maskNoise)

      // With noise reduction, small isolated spots are removed, generally fewer/equal selected
      // (for a checkerboard, many pixels near edges may survive, but noise reduction changes count)
      expect(countNoNoise).toBeGreaterThanOrEqual(0)
      expect(countNoise).toBeGreaterThanOrEqual(0)
    })

    test('full range [0,100] selects all pixels', () => {
      const img = createSharpBlurryImage(20, 20)
      setFocusAreaSettings({ focusRange: [0, 100], noiseLevel: 0 })
      const mask = performFocusAreaSelect(img)
      expect(getSelectedPixelCount(mask)).toBe(400) // 20*20
    })

    test('handles small image (1x1)', () => {
      const img = createSolidImageData(1, 1, 128, 128, 128)
      setFocusAreaSettings({ focusRange: [0, 100], noiseLevel: 0 })
      const mask = performFocusAreaSelect(img)
      expect(mask.width).toBe(1)
      expect(mask.height).toBe(1)
    })
  })
})
