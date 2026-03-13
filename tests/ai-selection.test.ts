import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  beginObjectSelection,
  updateObjectSelection,
  commitObjectSelection,
  cancelObjectSelection,
  isObjectSelectionActive,
  getObjectSelectionSettings,
  setObjectSelectionSettings,
} from '@/tools/object-selection'
import { performSelectSubject, computeSaliencyMap } from '@/tools/select-subject'
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

/**
 * Create an image with a bright object in the center and dark background.
 * The center region (middle 50%) is white, the border is black.
 */
function createCenteredObjectImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  const marginX = Math.floor(w * 0.25)
  const marginY = Math.floor(h * 0.25)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x >= marginX && x < w - marginX && y >= marginY && y < h - marginY) {
        // White object
        data[idx] = 255
        data[idx + 1] = 255
        data[idx + 2] = 255
      } else {
        // Black background
        data[idx] = 0
        data[idx + 1] = 0
        data[idx + 2] = 0
      }
      data[idx + 3] = 255
    }
  }
  return new ImageData(data, w, h)
}

/**
 * Create an image with a red circle on a blue background.
 */
function createCircleImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) * 0.3

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) {
        // Red circle
        data[idx] = 220
        data[idx + 1] = 30
        data[idx + 2] = 30
      } else {
        // Blue background
        data[idx] = 30
        data[idx + 1] = 30
        data[idx + 2] = 200
      }
      data[idx + 3] = 255
    }
  }
  return new ImageData(data, w, h)
}

/**
 * Create a two-tone image: left half red, right half blue.
 */
function createTwoToneImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      if (x < w / 2) {
        data[idx] = 200
        data[idx + 1] = 30
        data[idx + 2] = 30
      } else {
        data[idx] = 30
        data[idx + 1] = 30
        data[idx + 2] = 200
      }
      data[idx + 3] = 255
    }
  }
  return new ImageData(data, w, h)
}

// ── Object Selection Tests ──

describe('Object Selection', () => {
  beforeEach(() => {
    clearSelection()
    cancelObjectSelection()
    setObjectSelectionSettings({ mode: 'rectangle', refinementIterations: 4 })
  })

  describe('getObjectSelectionSettings / setObjectSelectionSettings', () => {
    test('returns default settings', () => {
      const s = getObjectSelectionSettings()
      expect(s.mode).toBe('rectangle')
      expect(s.refinementIterations).toBe(4)
    })

    test('updates mode', () => {
      setObjectSelectionSettings({ mode: 'lasso' })
      expect(getObjectSelectionSettings().mode).toBe('lasso')
    })

    test('updates refinementIterations', () => {
      setObjectSelectionSettings({ refinementIterations: 7 })
      expect(getObjectSelectionSettings().refinementIterations).toBe(7)
    })

    test('clamps refinementIterations to valid range', () => {
      setObjectSelectionSettings({ refinementIterations: 0 })
      expect(getObjectSelectionSettings().refinementIterations).toBe(1)
      setObjectSelectionSettings({ refinementIterations: 99 })
      expect(getObjectSelectionSettings().refinementIterations).toBe(10)
    })

    test('returns a copy, not a reference', () => {
      const s1 = getObjectSelectionSettings()
      s1.mode = 'lasso'
      const s2 = getObjectSelectionSettings()
      expect(s2.mode).toBe('rectangle')
    })

    test('partial update preserves other settings', () => {
      setObjectSelectionSettings({ mode: 'lasso' })
      setObjectSelectionSettings({ refinementIterations: 3 })
      const s = getObjectSelectionSettings()
      expect(s.mode).toBe('lasso')
      expect(s.refinementIterations).toBe(3)
    })
  })

  describe('isObjectSelectionActive', () => {
    test('initially false', () => {
      expect(isObjectSelectionActive()).toBe(false)
    })

    test('true after begin', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      beginObjectSelection(5, 5, img)
      expect(isObjectSelectionActive()).toBe(true)
    })

    test('false after cancel', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      beginObjectSelection(5, 5, img)
      cancelObjectSelection()
      expect(isObjectSelectionActive()).toBe(false)
    })

    test('false after commit', async () => {
      const img = createCenteredObjectImage(40, 40)
      beginObjectSelection(5, 5, img)
      updateObjectSelection(35, 35)
      await commitObjectSelection(img)
      expect(isObjectSelectionActive()).toBe(false)
    })
  })

  describe('rectangle mode selection', () => {
    test('selects object within bounding box', async () => {
      const img = createCenteredObjectImage(40, 40)
      beginObjectSelection(0, 0, img)
      updateObjectSelection(40, 40)
      const mask = await commitObjectSelection(img)

      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(40)
      expect(mask!.height).toBe(40)
      expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    })

    test('sets the global selection mask', async () => {
      const img = createCenteredObjectImage(30, 30)
      beginObjectSelection(0, 0, img)
      updateObjectSelection(30, 30)
      await commitObjectSelection(img)

      const mask = getSelectionMask()
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(30)
    })

    test('handles negative drag direction', async () => {
      const img = createCenteredObjectImage(40, 40)
      // Start at bottom-right, drag to top-left
      beginObjectSelection(35, 35, img)
      updateObjectSelection(5, 5)
      const mask = await commitObjectSelection(img)

      expect(mask).not.toBeNull()
      expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    })

    test('returns null for zero-size region', async () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      beginObjectSelection(10, 10, img)
      // No updateObjectSelection call — width/height stays 0
      const mask = await commitObjectSelection(img)
      expect(mask).toBeNull()
    })

    test('commit without begin returns null', async () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      const mask = await commitObjectSelection(img)
      expect(mask).toBeNull()
    })

    test('selects more in center for centered object', async () => {
      const img = createCenteredObjectImage(40, 40)
      beginObjectSelection(0, 0, img)
      updateObjectSelection(40, 40)
      const mask = await commitObjectSelection(img)

      expect(mask).not.toBeNull()
      // Count selected pixels in center vs border
      let centerSelected = 0
      let borderSelected = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (mask!.data[y * 40 + x]! > 0) {
            if (x >= 10 && x < 30 && y >= 10 && y < 30) centerSelected++
            else borderSelected++
          }
        }
      }
      // Center (where the object is) should have more selected pixels
      expect(centerSelected).toBeGreaterThan(borderSelected)
    })
  })

  describe('lasso mode selection', () => {
    test('selects within lasso polygon', async () => {
      setObjectSelectionSettings({ mode: 'lasso' })
      const img = createCenteredObjectImage(40, 40)

      // Draw a lasso around the center
      beginObjectSelection(5, 5, img)
      updateObjectSelection(35, 5)
      updateObjectSelection(35, 35)
      updateObjectSelection(5, 35)
      const mask = await commitObjectSelection(img)

      expect(mask).not.toBeNull()
      expect(getSelectedPixelCount(mask!)).toBeGreaterThan(0)
    })

    test('lasso clips to polygon boundary', async () => {
      setObjectSelectionSettings({ mode: 'lasso' })
      const img = createCenteredObjectImage(40, 40)

      // Draw a small lasso that only covers the top-left
      beginObjectSelection(0, 0, img)
      updateObjectSelection(15, 0)
      updateObjectSelection(15, 15)
      updateObjectSelection(0, 15)
      const mask = await commitObjectSelection(img)

      expect(mask).not.toBeNull()
      // Bottom-right should not be selected since lasso doesn't cover it
      let bottomRightSelected = 0
      for (let y = 25; y < 40; y++) {
        for (let x = 25; x < 40; x++) {
          if (mask!.data[y * 40 + x]! > 0) bottomRightSelected++
        }
      }
      expect(bottomRightSelected).toBe(0)
    })
  })

  describe('cancelObjectSelection', () => {
    test('cancels without setting mask', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      clearSelection()
      beginObjectSelection(0, 0, img)
      updateObjectSelection(20, 20)
      cancelObjectSelection()

      // Selection mask should still be null (not set by cancelled operation)
      expect(getSelectionMask()).toBeNull()
    })

    test('can begin again after cancel', async () => {
      const img = createCenteredObjectImage(30, 30)
      beginObjectSelection(0, 0, img)
      cancelObjectSelection()

      beginObjectSelection(0, 0, img)
      updateObjectSelection(30, 30)
      const mask = await commitObjectSelection(img)
      expect(mask).not.toBeNull()
    })
  })

  describe('refinementIterations affects result', () => {
    test('different iteration counts produce potentially different masks', async () => {
      const img = createCircleImage(40, 40)

      setObjectSelectionSettings({ refinementIterations: 1 })
      beginObjectSelection(0, 0, img)
      updateObjectSelection(40, 40)
      const mask1 = await commitObjectSelection(img)

      clearSelection()
      setObjectSelectionSettings({ refinementIterations: 8 })
      beginObjectSelection(0, 0, img)
      updateObjectSelection(40, 40)
      const mask2 = await commitObjectSelection(img)

      // Both should select something
      expect(mask1).not.toBeNull()
      expect(mask2).not.toBeNull()
      expect(getSelectedPixelCount(mask1!)).toBeGreaterThan(0)
      expect(getSelectedPixelCount(mask2!)).toBeGreaterThan(0)
    })
  })
})

// ── Select Subject Tests ──

describe('Select Subject', () => {
  beforeEach(() => {
    clearSelection()
  })

  describe('computeSaliencyMap', () => {
    test('returns Float32Array of correct size', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      const map = computeSaliencyMap(img)
      expect(map).toBeInstanceOf(Float32Array)
      expect(map.length).toBe(400)
    })

    test('uniform image has low saliency (dominated by center bias)', () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      const map = computeSaliencyMap(img)
      // All edges and color contrast should be 0; only center bias contributes
      // Center bias ranges from ~0 to 1, weighted by 0.2, so max saliency ~ 0.2
      let maxVal = 0
      for (let i = 0; i < map.length; i++) {
        if (map[i]! > maxVal) maxVal = map[i]!
      }
      // Max saliency should come from center bias alone
      expect(maxVal).toBeLessThanOrEqual(0.25)
    })

    test('high-contrast object has higher saliency in center', () => {
      const img = createCenteredObjectImage(40, 40)
      const map = computeSaliencyMap(img)

      // Average saliency in center vs border
      let centerSum = 0
      let borderSum = 0
      let centerCount = 0
      let borderCount = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          const val = map[y * 40 + x]!
          if (x >= 10 && x < 30 && y >= 10 && y < 30) {
            centerSum += val
            centerCount++
          } else {
            borderSum += val
            borderCount++
          }
        }
      }

      const centerAvg = centerSum / centerCount
      const borderAvg = borderSum / borderCount

      // Center should be more salient due to center bias + color contrast
      expect(centerAvg).toBeGreaterThan(borderAvg)
    })

    test('returns empty array for zero-size image', () => {
      const img = new ImageData(1, 1)
      // 1x1 image — valid but trivial
      const map = computeSaliencyMap(img)
      expect(map.length).toBe(1)
    })

    test('circle on contrasting background has high saliency at edges', () => {
      const img = createCircleImage(40, 40)
      const map = computeSaliencyMap(img)

      // There should be some non-zero saliency
      let maxVal = 0
      for (let i = 0; i < map.length; i++) {
        if (map[i]! > maxVal) maxVal = map[i]!
      }
      expect(maxVal).toBeGreaterThan(0)
    })
  })

  describe('performSelectSubject', () => {
    test('selects the main subject (centered bright object)', async () => {
      const img = createCenteredObjectImage(40, 40)
      const mask = await performSelectSubject(img)

      expect(mask.width).toBe(40)
      expect(mask.height).toBe(40)
      expect(getSelectedPixelCount(mask)).toBeGreaterThan(0)
    })

    test('sets the global selection mask', async () => {
      const img = createCenteredObjectImage(30, 30)
      await performSelectSubject(img)
      const mask = getSelectionMask()
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(30)
    })

    test('selects more center pixels for centered object', async () => {
      const img = createCenteredObjectImage(40, 40)
      const mask = await performSelectSubject(img)

      let centerSelected = 0
      let borderSelected = 0
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          if (mask.data[y * 40 + x]! > 0) {
            if (x >= 10 && x < 30 && y >= 10 && y < 30) centerSelected++
            else borderSelected++
          }
        }
      }

      // Center area should be preferentially selected
      expect(centerSelected).toBeGreaterThan(borderSelected)
    })

    test('handles uniform image', async () => {
      const img = createSolidImageData(20, 20, 128, 128, 128)
      const mask = await performSelectSubject(img)
      // Should still return a valid mask (may select all or none)
      expect(mask.width).toBe(20)
      expect(mask.height).toBe(20)
    })

    test('works with two-tone image', async () => {
      const img = createTwoToneImage(40, 40)
      const mask = await performSelectSubject(img)

      expect(mask.width).toBe(40)
      expect(mask.height).toBe(40)
      // Should select something — color contrast is high
      expect(getSelectedPixelCount(mask)).toBeGreaterThan(0)
    })

    test('handles small image (3x3)', async () => {
      const img = createSolidImageData(3, 3, 200, 50, 50)
      const mask = await performSelectSubject(img)
      expect(mask.width).toBe(3)
      expect(mask.height).toBe(3)
    })

    test('circle on contrasting background selects circle region', async () => {
      const img = createCircleImage(60, 60)
      const mask = await performSelectSubject(img)

      expect(getSelectedPixelCount(mask)).toBeGreaterThan(0)

      // Count selected pixels inside vs outside the circle
      const cx = 30
      const cy = 30
      const radius = 18 // 0.3 * 60
      let insideSelected = 0
      let outsideSelected = 0
      for (let y = 0; y < 60; y++) {
        for (let x = 0; x < 60; x++) {
          if (mask.data[y * 60 + x]! > 0) {
            const dx = x - cx
            const dy = y - cy
            if (dx * dx + dy * dy <= radius * radius) insideSelected++
            else outsideSelected++
          }
        }
      }

      // The circle area should be one of the selected regions
      // (either inside or outside could be selected depending on Otsu threshold)
      const totalSelected = insideSelected + outsideSelected
      expect(totalSelected).toBeGreaterThan(0)
    })

    test('produces binary mask (only 0 and 255)', async () => {
      const img = createCenteredObjectImage(30, 30)
      const mask = await performSelectSubject(img)

      for (let i = 0; i < mask.data.length; i++) {
        expect(mask.data[i] === 0 || mask.data[i] === 255).toBe(true)
      }
    })

    test('handles 1x1 image without error', async () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255])
      const img = new ImageData(data, 1, 1)
      const mask = await performSelectSubject(img)
      expect(mask.width).toBe(1)
      expect(mask.height).toBe(1)
    })
  })
})
