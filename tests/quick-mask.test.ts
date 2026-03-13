import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  enterQuickMask,
  exitQuickMask,
  getEditMask,
  paintQuickMask,
  beginQuickMaskStroke,
  paintQuickMaskStroke,
  endQuickMaskStroke,
  isQuickMaskStrokeActive,
  getQuickMaskOverlay,
  getQuickMaskSettings,
  setQuickMaskSettings,
} from '@/tools/quick-mask'
import { getSelectionMask, setSelectionMask, clearSelection, type SelectionMask } from '@/tools/raster-selection'

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

beforeEach(() => {
  // Reset quick mask state first (exitQuickMask may set selection mask)
  if (getEditMask()) {
    exitQuickMask()
  }
  // Then clear any selection mask
  clearSelection()
})

describe('Quick Mask', () => {
  describe('enterQuickMask', () => {
    test('creates empty mask when no selection exists', () => {
      const mask = enterQuickMask(100, 80)
      expect(mask.width).toBe(100)
      expect(mask.height).toBe(80)
      expect(mask.data.length).toBe(100 * 80)
      // All zeros (unselected)
      for (let i = 0; i < mask.data.length; i++) {
        expect(mask.data[i]).toBe(0)
      }
    })

    test('copies existing selection mask', () => {
      const selMask: SelectionMask = {
        width: 50,
        height: 50,
        data: new Uint8Array(50 * 50),
      }
      // Set some selected pixels
      selMask.data[0] = 255
      selMask.data[10] = 128
      selMask.data[100] = 255
      setSelectionMask(selMask)

      const mask = enterQuickMask(50, 50)
      expect(mask.width).toBe(50)
      expect(mask.height).toBe(50)
      expect(mask.data[0]).toBe(255)
      expect(mask.data[10]).toBe(128)
      expect(mask.data[100]).toBe(255)
      expect(mask.data[1]).toBe(0)

      // Should be a copy, not a reference
      selMask.data[0] = 0
      expect(mask.data[0]).toBe(255)
    })
  })

  describe('exitQuickMask', () => {
    test('converts painted mask back to selection', () => {
      enterQuickMask(20, 20)
      const editMask = getEditMask()!
      // Paint some pixels selected
      editMask.data[0] = 255
      editMask.data[5] = 200
      editMask.data[10] = 100

      const result = exitQuickMask()
      expect(result).not.toBeNull()

      const selMask = getSelectionMask()
      expect(selMask).not.toBeNull()
      expect(selMask!.data[0]).toBe(255)
      expect(selMask!.data[5]).toBe(200)
      expect(selMask!.data[10]).toBe(100)
    })

    test('sets selection to null if mask is completely empty', () => {
      enterQuickMask(20, 20)
      // Don't paint anything — mask is all zeros

      exitQuickMask()
      const selMask = getSelectionMask()
      expect(selMask).toBeNull()
    })

    test('clears edit mask after exit', () => {
      enterQuickMask(20, 20)
      expect(getEditMask()).not.toBeNull()

      exitQuickMask()
      expect(getEditMask()).toBeNull()
    })

    test('returns null when no edit mask exists', () => {
      const result = exitQuickMask()
      expect(result).toBeNull()
    })
  })

  describe('paintQuickMask', () => {
    test('adds to mask with value=255', () => {
      enterQuickMask(20, 20)
      paintQuickMask(5, 5, 3, 255, 1.0)

      const mask = getEditMask()!
      // Center pixel should be 255
      expect(mask.data[5 * 20 + 5]).toBe(255)
    })

    test('removes from mask with value=0', () => {
      enterQuickMask(20, 20)
      const mask = getEditMask()!
      // Fill center area
      for (let y = 3; y < 8; y++) {
        for (let x = 3; x < 8; x++) {
          mask.data[y * 20 + x] = 255
        }
      }

      // Erase at center
      paintQuickMask(5, 5, 2, 0, 1.0)

      // Center should be reduced toward 0
      expect(mask.data[5 * 20 + 5]).toBe(0)
    })

    test('respects mask boundaries', () => {
      enterQuickMask(10, 10)
      // Paint near edge — should not crash
      paintQuickMask(0, 0, 5, 255, 1.0)
      paintQuickMask(9, 9, 5, 255, 1.0)

      const mask = getEditMask()!
      expect(mask.data[0]).toBe(255)
      expect(mask.data[9 * 10 + 9]).toBe(255)
    })

    test('soft brush creates gradient falloff', () => {
      enterQuickMask(40, 40)
      paintQuickMask(20, 20, 10, 255, 0.0)

      const mask = getEditMask()!
      // Center should be high
      const center = mask.data[20 * 40 + 20]!
      expect(center).toBeGreaterThan(200)

      // Edge should be lower
      const edge = mask.data[20 * 40 + 29]!
      expect(edge).toBeLessThan(center)
    })

    test('does nothing if no edit mask', () => {
      // No enterQuickMask called
      paintQuickMask(5, 5, 3, 255, 1.0)
      expect(getEditMask()).toBeNull()
    })
  })

  describe('stroke lifecycle', () => {
    test('beginQuickMaskStroke sets stroke active', () => {
      enterQuickMask(20, 20)
      expect(isQuickMaskStrokeActive()).toBe(false)

      beginQuickMaskStroke(10, 10, 3, 255)
      expect(isQuickMaskStrokeActive()).toBe(true)
    })

    test('endQuickMaskStroke clears stroke active', () => {
      enterQuickMask(20, 20)
      beginQuickMaskStroke(10, 10, 3, 255)
      expect(isQuickMaskStrokeActive()).toBe(true)

      endQuickMaskStroke()
      expect(isQuickMaskStrokeActive()).toBe(false)
    })

    test('paints first dab at begin position', () => {
      enterQuickMask(30, 30)
      beginQuickMaskStroke(15, 15, 3, 255, 1.0)

      const mask = getEditMask()!
      expect(mask.data[15 * 30 + 15]).toBe(255)
    })

    test('paintQuickMaskStroke interpolates dabs along path', () => {
      enterQuickMask(100, 100)
      beginQuickMaskStroke(10, 50, 3, 255, 1.0)
      paintQuickMaskStroke(90, 50)
      endQuickMaskStroke()

      const mask = getEditMask()!
      // Check that multiple points along the line have been painted
      let paintedCount = 0
      for (let x = 10; x <= 90; x++) {
        if (mask.data[50 * 100 + x]! > 0) paintedCount++
      }
      // Should have painted many pixels along the line
      expect(paintedCount).toBeGreaterThan(20)
    })

    test('eraser stroke removes from mask', () => {
      enterQuickMask(50, 50)
      const mask = getEditMask()!
      // Fill a row
      for (let x = 0; x < 50; x++) {
        mask.data[25 * 50 + x] = 255
      }

      // Erase stroke along the row
      beginQuickMaskStroke(5, 25, 3, 0, 1.0)
      paintQuickMaskStroke(45, 25)
      endQuickMaskStroke()

      // Center pixels should be erased
      let erasedCount = 0
      for (let x = 5; x <= 45; x++) {
        if (mask.data[25 * 50 + x]! < 255) erasedCount++
      }
      expect(erasedCount).toBeGreaterThan(10)
    })
  })

  describe('getQuickMaskOverlay', () => {
    test('returns null when no edit mask', () => {
      const overlay = getQuickMaskOverlay(10, 10)
      expect(overlay).toBeNull()
    })

    test('generates overlay with red color for unselected areas', () => {
      enterQuickMask(4, 4)
      const mask = getEditMask()!
      // Mark pixel (1,1) as selected
      mask.data[1 * 4 + 1] = 255

      const overlay = getQuickMaskOverlay(4, 4)
      expect(overlay).not.toBeNull()
      expect(overlay!.width).toBe(4)
      expect(overlay!.height).toBe(4)

      // Unselected pixel (0,0): should have red overlay
      const idx00 = 0
      expect(overlay!.data[idx00]).toBe(255) // R
      expect(overlay!.data[idx00 + 1]).toBe(0) // G
      expect(overlay!.data[idx00 + 2]).toBe(0) // B
      expect(overlay!.data[idx00 + 3]).toBeGreaterThan(0) // A > 0

      // Selected pixel (1,1): should be transparent
      const idx11 = (1 * 4 + 1) * 4
      expect(overlay!.data[idx11 + 3]).toBe(0) // A = 0
    })

    test('respects custom mask color and opacity', () => {
      setQuickMaskSettings({ maskColor: [0, 255, 0], maskOpacity: 0.75 })
      enterQuickMask(2, 2)

      const overlay = getQuickMaskOverlay(2, 2)
      expect(overlay).not.toBeNull()

      // Unselected pixel: green overlay at 75% opacity
      expect(overlay!.data[0]).toBe(0) // R
      expect(overlay!.data[1]).toBe(255) // G
      expect(overlay!.data[2]).toBe(0) // B
      expect(overlay!.data[3]).toBe(Math.round(0.75 * 255)) // A

      // Restore defaults
      setQuickMaskSettings({ maskColor: [255, 0, 0], maskOpacity: 0.5 })
    })

    test('partially selected pixels get proportional overlay', () => {
      enterQuickMask(2, 2)
      const mask = getEditMask()!
      mask.data[0] = 128 // half selected

      const overlay = getQuickMaskOverlay(2, 2)
      expect(overlay).not.toBeNull()

      // Alpha should be roughly half of base opacity
      const baseAlpha = Math.round(0.5 * 255)
      const expectedAlpha = Math.round(((255 - 128) / 255) * baseAlpha)
      expect(overlay!.data[3]).toBe(expectedAlpha)
    })
  })

  describe('settings', () => {
    test('getQuickMaskSettings returns defaults', () => {
      const s = getQuickMaskSettings()
      expect(s.maskColor).toEqual([255, 0, 0])
      expect(s.maskOpacity).toBe(0.5)
    })

    test('setQuickMaskSettings updates settings', () => {
      setQuickMaskSettings({ maskOpacity: 0.8 })
      expect(getQuickMaskSettings().maskOpacity).toBe(0.8)
      // Restore
      setQuickMaskSettings({ maskOpacity: 0.5 })
    })
  })

  describe('round-trip: enter with selection, paint, exit', () => {
    test('modifying mask and exiting updates selection', () => {
      // Start with a selection
      const selMask: SelectionMask = {
        width: 20,
        height: 20,
        data: new Uint8Array(20 * 20),
      }
      // Select a rectangle
      for (let y = 5; y < 15; y++) {
        for (let x = 5; x < 15; x++) {
          selMask.data[y * 20 + x] = 255
        }
      }
      setSelectionMask(selMask)

      // Enter quick mask
      enterQuickMask(20, 20)
      const editMask = getEditMask()!

      // Verify it copied the selection
      expect(editMask.data[7 * 20 + 7]).toBe(255)
      expect(editMask.data[0]).toBe(0)

      // Add to mask outside original selection
      paintQuickMask(2, 2, 2, 255, 1.0)
      expect(editMask.data[2 * 20 + 2]).toBeGreaterThan(0)

      // Remove from mask inside original selection
      paintQuickMask(10, 10, 2, 0, 1.0)
      expect(editMask.data[10 * 20 + 10]).toBe(0)

      // Exit quick mask
      exitQuickMask()

      // Verify updated selection
      const finalMask = getSelectionMask()!
      expect(finalMask).not.toBeNull()
      expect(finalMask.data[2 * 20 + 2]).toBeGreaterThan(0)
      expect(finalMask.data[10 * 20 + 10]).toBe(0)
      // Original selected area not touched by erase should remain
      expect(finalMask.data[7 * 20 + 7]).toBe(255)
    })
  })
})
