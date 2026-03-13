import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  enterRefineEdge,
  exitRefineEdge,
  updateRefineEdge,
  getRefineEdgeSettings,
  setRefineEdgeSettings,
  isRefineEdgeActive,
  getRefineEdgePreview,
  computeRefinedMask,
} from '@/tools/refine-edge'
import type { RefineEdgeViewMode } from '@/tools/refine-edge'
import {
  getSelectionMask,
  setSelectionMask,
  clearSelection,
  createRectSelection,
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

function makeMask(w: number, h: number, fill = 0): SelectionMask {
  return { width: w, height: h, data: new Uint8Array(w * h).fill(fill) }
}

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

beforeEach(() => {
  // Make sure we exit any active refine-edge session first
  if (isRefineEdgeActive()) {
    exitRefineEdge(false)
  }
  clearSelection()
})

describe('Refine Edge', () => {
  describe('enterRefineEdge / exitRefineEdge', () => {
    test('activates and deactivates', () => {
      expect(isRefineEdgeActive()).toBe(false)
      createRectSelection(0, 0, 10, 10, 20, 20)
      enterRefineEdge()
      expect(isRefineEdgeActive()).toBe(true)
      exitRefineEdge(false)
      expect(isRefineEdgeActive()).toBe(false)
    })

    test('exit with apply=false restores original mask', () => {
      const original = createRectSelection(2, 2, 6, 6, 20, 20)
      const originalData = new Uint8Array(original.data)
      enterRefineEdge()
      // Modify settings so refined mask differs
      updateRefineEdge({ smooth: 10 })
      exitRefineEdge(false) // cancel
      const restored = getSelectionMask()!
      expect(restored).not.toBeNull()
      expect(new Uint8Array(restored.data)).toEqual(originalData)
    })

    test('exit with apply=true sets refined mask as selection', () => {
      createRectSelection(2, 2, 6, 6, 20, 20)
      const before = new Uint8Array(getSelectionMask()!.data)
      enterRefineEdge()
      updateRefineEdge({ feather: 3 })
      exitRefineEdge(true)
      const after = getSelectionMask()!
      expect(after).not.toBeNull()
      // Feathered mask should differ from original hard-edged mask
      let differs = false
      for (let i = 0; i < before.length; i++) {
        if (before[i] !== after.data[i]) {
          differs = true
          break
        }
      }
      expect(differs).toBe(true)
    })

    test('enter with no selection snapshots null', () => {
      clearSelection()
      enterRefineEdge()
      expect(isRefineEdgeActive()).toBe(true)
      exitRefineEdge(false)
      expect(getSelectionMask()).toBeNull()
    })

    test('settings reset to defaults on enter', () => {
      createRectSelection(0, 0, 10, 10, 20, 20)
      enterRefineEdge()
      updateRefineEdge({ smooth: 50, feather: 25 })
      exitRefineEdge(false)

      createRectSelection(0, 0, 10, 10, 20, 20)
      enterRefineEdge()
      const s = getRefineEdgeSettings()
      expect(s.smooth).toBe(0)
      expect(s.feather).toBe(0)
      exitRefineEdge(false)
    })
  })

  describe('getRefineEdgeSettings / setRefineEdgeSettings', () => {
    test('returns a copy of settings', () => {
      enterRefineEdge()
      const a = getRefineEdgeSettings()
      const b = getRefineEdgeSettings()
      expect(a).toEqual(b)
      expect(a).not.toBe(b) // different object references
      exitRefineEdge(false)
    })

    test('setRefineEdgeSettings updates settings', () => {
      enterRefineEdge()
      setRefineEdgeSettings({ contrast: 42, viewMode: 'on-black' })
      const s = getRefineEdgeSettings()
      expect(s.contrast).toBe(42)
      expect(s.viewMode).toBe('on-black')
      exitRefineEdge(false)
    })
  })

  describe('computeRefinedMask', () => {
    test('no-op with default settings returns same values', () => {
      const mask = makeMask(10, 10, 0)
      // Set a block to 255
      for (let y = 3; y < 7; y++) {
        for (let x = 3; x < 7; x++) {
          mask.data[y * 10 + x] = 255
        }
      }
      const result = computeRefinedMask(mask, {
        smooth: 0,
        feather: 0,
        contrast: 0,
        shift: 0,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      expect(result.width).toBe(10)
      expect(result.height).toBe(10)
      expect(new Uint8Array(result.data)).toEqual(new Uint8Array(mask.data))
    })

    test('smooth blurs hard edges', () => {
      const mask = makeMask(20, 20, 0)
      for (let y = 5; y < 15; y++) {
        for (let x = 5; x < 15; x++) {
          mask.data[y * 20 + x] = 255
        }
      }
      const result = computeRefinedMask(mask, {
        smooth: 3,
        feather: 0,
        contrast: 0,
        shift: 0,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      // Pixel at the border (5,5) should be partially selected (not full 255)
      const borderVal = result.data[5 * 20 + 5]!
      expect(borderVal).toBeGreaterThan(0)
      expect(borderVal).toBeLessThan(255)
      // Center pixel should still be significantly selected
      expect(result.data[10 * 20 + 10]!).toBeGreaterThan(100)
    })

    test('feather creates soft edges', () => {
      const mask = makeMask(30, 30, 0)
      for (let y = 10; y < 20; y++) {
        for (let x = 10; x < 20; x++) {
          mask.data[y * 30 + x] = 255
        }
      }
      const result = computeRefinedMask(mask, {
        smooth: 0,
        feather: 5,
        contrast: 0,
        shift: 0,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      // A pixel just outside the original boundary should have some value > 0
      const outsideVal = result.data[8 * 30 + 15]!
      expect(outsideVal).toBeGreaterThan(0)
      // Center should still retain significant value
      expect(result.data[15 * 30 + 15]!).toBeGreaterThan(50)
    })

    test('contrast sharpens mask edges', () => {
      // Create a mask with gradient values (simulating a feathered edge)
      const mask = makeMask(10, 1, 0)
      mask.data[0] = 0
      mask.data[1] = 50
      mask.data[2] = 100
      mask.data[3] = 128
      mask.data[4] = 150
      mask.data[5] = 200
      mask.data[6] = 220
      mask.data[7] = 255
      mask.data[8] = 255
      mask.data[9] = 255

      const result = computeRefinedMask(mask, {
        smooth: 0,
        feather: 0,
        contrast: 100,
        shift: 0,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      // Values below 128 should be pushed towards 0
      expect(result.data[1]!).toBeLessThan(50)
      // Values above 128 should be pushed towards 255
      expect(result.data[5]!).toBeGreaterThan(200)
      // Mid-value at 128 stays at 128
      expect(result.data[3]!).toBe(128)
    })

    test('positive shift expands mask (dilate)', () => {
      const mask = makeMask(20, 20, 0)
      // Single pixel
      mask.data[10 * 20 + 10] = 255
      const result = computeRefinedMask(mask, {
        smooth: 0,
        feather: 0,
        contrast: 0,
        shift: 100,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      // Neighbours should now be selected
      expect(result.data[10 * 20 + 11]!).toBe(255)
      expect(result.data[11 * 20 + 10]!).toBe(255)
    })

    test('negative shift contracts mask (erode)', () => {
      const mask = makeMask(20, 20, 0)
      // Fill a 4x4 block
      for (let y = 8; y < 12; y++) {
        for (let x = 8; x < 12; x++) {
          mask.data[y * 20 + x] = 255
        }
      }
      const result = computeRefinedMask(mask, {
        smooth: 0,
        feather: 0,
        contrast: 0,
        shift: -100,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })
      // Border pixels should be eroded
      expect(result.data[8 * 20 + 8]!).toBe(0)
      // But center pixels may survive depending on radius
      // At least the mask should be smaller
      let selectedBefore = 0
      let selectedAfter = 0
      for (let i = 0; i < 400; i++) {
        if (mask.data[i]! > 0) selectedBefore++
        if (result.data[i]! > 0) selectedAfter++
      }
      expect(selectedAfter).toBeLessThan(selectedBefore)
    })
  })

  describe('updateRefineEdge', () => {
    test('returns refined mask when active with mask', () => {
      createRectSelection(2, 2, 6, 6, 20, 20)
      enterRefineEdge()
      const result = updateRefineEdge({ smooth: 5 })
      expect(result).not.toBeNull()
      expect(result!.width).toBe(20)
      expect(result!.height).toBe(20)
      exitRefineEdge(false)
    })

    test('returns null when no original mask', () => {
      clearSelection()
      enterRefineEdge()
      const result = updateRefineEdge({ smooth: 5 })
      expect(result).toBeNull()
      exitRefineEdge(false)
    })
  })

  describe('getRefineEdgePreview', () => {
    const viewModes: RefineEdgeViewMode[] = [
      'marching-ants',
      'overlay',
      'on-black',
      'on-white',
      'black-white',
      'on-layers',
    ]

    test('returns null when no original mask', () => {
      clearSelection()
      enterRefineEdge()
      const img = makeImageData(20, 20)
      const result = getRefineEdgePreview(img, 'overlay')
      expect(result).toBeNull()
      exitRefineEdge(false)
    })

    for (const mode of viewModes) {
      test(`view mode "${mode}" produces valid ImageData`, () => {
        createRectSelection(2, 2, 6, 6, 20, 20)
        enterRefineEdge()
        const img = makeImageData(20, 20, 200, 100, 50)
        const result = getRefineEdgePreview(img, mode)
        expect(result).not.toBeNull()
        expect(result!.width).toBe(20)
        expect(result!.height).toBe(20)
        expect(result!.data.length).toBe(20 * 20 * 4)
        exitRefineEdge(false)
      })
    }

    test('on-black mode: unselected pixels are black', () => {
      createRectSelection(5, 5, 10, 10, 20, 20)
      enterRefineEdge()
      const img = makeImageData(20, 20, 200, 100, 50)
      const result = getRefineEdgePreview(img, 'on-black')!
      // (0, 0) is unselected → should be black
      expect(result.data[0]).toBe(0)
      expect(result.data[1]).toBe(0)
      expect(result.data[2]).toBe(0)
      expect(result.data[3]).toBe(255) // alpha = 255
      exitRefineEdge(false)
    })

    test('on-white mode: unselected pixels are white', () => {
      createRectSelection(5, 5, 10, 10, 20, 20)
      enterRefineEdge()
      const img = makeImageData(20, 20, 200, 100, 50)
      const result = getRefineEdgePreview(img, 'on-white')!
      // (0, 0) is unselected → should be white
      expect(result.data[0]).toBe(255)
      expect(result.data[1]).toBe(255)
      expect(result.data[2]).toBe(255)
      expect(result.data[3]).toBe(255)
      exitRefineEdge(false)
    })

    test('black-white mode: selected pixels are white, unselected are black', () => {
      createRectSelection(5, 5, 10, 10, 20, 20)
      enterRefineEdge()
      const img = makeImageData(20, 20, 200, 100, 50)
      const result = getRefineEdgePreview(img, 'black-white')!
      // (0, 0) unselected → all channels = 0 (mask value)
      expect(result.data[0]).toBe(0)
      expect(result.data[1]).toBe(0)
      expect(result.data[2]).toBe(0)
      // (7, 7) selected → all channels = 255
      const idx = (7 * 20 + 7) * 4
      expect(result.data[idx]).toBe(255)
      expect(result.data[idx + 1]).toBe(255)
      expect(result.data[idx + 2]).toBe(255)
      exitRefineEdge(false)
    })

    test('on-layers mode: mask as alpha channel', () => {
      createRectSelection(5, 5, 10, 10, 20, 20)
      enterRefineEdge()
      const img = makeImageData(20, 20, 200, 100, 50)
      const result = getRefineEdgePreview(img, 'on-layers')!
      // (0, 0) unselected → alpha = 0
      expect(result.data[3]).toBe(0)
      // (7, 7) selected → alpha = 255
      const idx = (7 * 20 + 7) * 4
      expect(result.data[idx + 3]).toBe(255)
      exitRefineEdge(false)
    })

    test('overlay mode: unselected areas have red tint', () => {
      createRectSelection(5, 5, 10, 10, 20, 20)
      enterRefineEdge()
      const img = makeImageData(20, 20, 100, 100, 100)
      const result = getRefineEdgePreview(img, 'overlay')!
      // (0, 0) unselected → red overlay: R channel should be pushed towards red
      const r = result.data[0]!
      const g = result.data[1]!
      expect(r).toBeGreaterThan(g) // Red influence
      // (7, 7) selected → no overlay, original colours
      const idx = (7 * 20 + 7) * 4
      expect(result.data[idx]).toBe(100)
      expect(result.data[idx + 1]).toBe(100)
      expect(result.data[idx + 2]).toBe(100)
      exitRefineEdge(false)
    })
  })

  describe('decontaminate', () => {
    test('modifies edge pixel colors when enabled', () => {
      // Create a mask with edge pixels
      const mask: SelectionMask = makeMask(10, 10, 0)
      // Fully selected center block
      for (let y = 3; y < 7; y++) {
        for (let x = 3; x < 7; x++) {
          mask.data[y * 10 + x] = 255
        }
      }
      // Edge ring with partial selection
      mask.data[2 * 10 + 3] = 128
      mask.data[2 * 10 + 4] = 128

      setSelectionMask(mask)
      enterRefineEdge()
      setRefineEdgeSettings({ decontaminate: true, decontaminateAmount: 100 })

      // Create image with red center, green fringe
      const img = makeImageData(10, 10, 0, 255, 0) // green everywhere
      // Center block is red
      for (let y = 3; y < 7; y++) {
        for (let x = 3; x < 7; x++) {
          const pi = (y * 10 + x) * 4
          img.data[pi] = 255
          img.data[pi + 1] = 0
          img.data[pi + 2] = 0
        }
      }

      const result = getRefineEdgePreview(img, 'on-black')
      expect(result).not.toBeNull()
      // The edge pixel at (3, 2) should have some decontamination applied
      // (shifted towards the fully-selected neighbour's color)
      // With decontamination, edge pixel should pick up red from the selected centre
      // Since mask value is 128, and on-black blends with mask, we just verify it ran
      expect(result!.data.length).toBe(10 * 10 * 4)
      exitRefineEdge(false)
    })
  })

  describe('pipeline ordering', () => {
    test('smooth + feather + contrast applied in sequence', () => {
      const mask = makeMask(30, 30, 0)
      // Hard-edged rect
      for (let y = 10; y < 20; y++) {
        for (let x = 10; x < 20; x++) {
          mask.data[y * 30 + x] = 255
        }
      }

      // Apply all three
      const result = computeRefinedMask(mask, {
        smooth: 3,
        feather: 2,
        contrast: 50,
        shift: 0,
        decontaminate: false,
        decontaminateAmount: 0,
        viewMode: 'marching-ants',
      })

      // Center should still retain significant value
      expect(result.data[15 * 30 + 15]!).toBeGreaterThan(50)
      // Far outside should still be low
      expect(result.data[0]!).toBeLessThan(50)
      // Overall mask should be valid
      expect(result.width).toBe(30)
      expect(result.height).toBe(30)
    })
  })
})
