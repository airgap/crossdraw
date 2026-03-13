import { describe, test, expect, beforeEach } from 'bun:test'
import {
  beginPolygonalLasso,
  addPolygonalLassoPoint,
  closePolygonalLasso,
  cancelPolygonalLasso,
  isPolygonalLassoActive,
  getPolygonalLassoPoints,
  getPolygonalLassoSettings,
  setPolygonalLassoSettings,
  rasterizePolygon,
} from '@/tools/polygonal-lasso'
import { clearSelection, setSelectionMask } from '@/tools/raster-selection'

function resetState() {
  if (isPolygonalLassoActive()) {
    cancelPolygonalLasso()
  }
  clearSelection()
}

describe('polygonal lasso tool', () => {
  beforeEach(() => {
    resetState()
    setPolygonalLassoSettings({ feather: 0, antiAlias: true })
  })

  describe('beginPolygonalLasso', () => {
    test('activates and sets first point', () => {
      beginPolygonalLasso(10, 20)
      expect(isPolygonalLassoActive()).toBe(true)
      expect(getPolygonalLassoPoints()).toEqual([{ x: 10, y: 20 }])
    })

    test('restarts with new point', () => {
      beginPolygonalLasso(5, 5)
      addPolygonalLassoPoint(10, 10)
      beginPolygonalLasso(50, 60)
      expect(getPolygonalLassoPoints()).toEqual([{ x: 50, y: 60 }])
    })
  })

  describe('addPolygonalLassoPoint', () => {
    test('adds points when active', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(10, 0)
      addPolygonalLassoPoint(10, 10)
      expect(getPolygonalLassoPoints()).toHaveLength(3)
    })

    test('does nothing when not active', () => {
      const result = addPolygonalLassoPoint(10, 10)
      expect(result).toBe(false)
      expect(getPolygonalLassoPoints()).toHaveLength(0)
    })

    test('returns true when clicking near first point (close signal)', () => {
      beginPolygonalLasso(100, 100)
      addPolygonalLassoPoint(200, 100)
      addPolygonalLassoPoint(200, 200)
      // Click within closing distance (8px) of first point
      const shouldClose = addPolygonalLassoPoint(102, 101)
      expect(shouldClose).toBe(true)
      // Point should NOT have been added since we're signalling close
      expect(getPolygonalLassoPoints()).toHaveLength(3)
    })

    test('does not signal close with fewer than 3 points', () => {
      beginPolygonalLasso(100, 100)
      addPolygonalLassoPoint(200, 100)
      // Only 2 points, clicking near first should not close
      const shouldClose = addPolygonalLassoPoint(101, 100)
      expect(shouldClose).toBe(false)
      expect(getPolygonalLassoPoints()).toHaveLength(3)
    })

    test('does not signal close when far from first point', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(100, 0)
      addPolygonalLassoPoint(100, 100)
      const shouldClose = addPolygonalLassoPoint(50, 50)
      expect(shouldClose).toBe(false)
      expect(getPolygonalLassoPoints()).toHaveLength(4)
    })
  })

  describe('closePolygonalLasso', () => {
    test('creates a selection mask for a triangle', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(20, 0)
      addPolygonalLassoPoint(10, 20)

      const mask = closePolygonalLasso('replace', 30, 30)
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(30)
      expect(mask!.height).toBe(30)

      // The center of the triangle (~10, 7) should be selected
      expect(mask!.data[7 * 30 + 10]).toBe(255)
      // A corner far from the triangle should not be selected
      expect(mask!.data[29 * 30 + 29]).toBe(0)

      expect(isPolygonalLassoActive()).toBe(false)
    })

    test('returns null with fewer than 3 points', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(10, 0)

      const mask = closePolygonalLasso('replace', 20, 20)
      expect(mask).toBeNull()
      expect(isPolygonalLassoActive()).toBe(false)
    })

    test('returns null when not active', () => {
      const mask = closePolygonalLasso('replace', 20, 20)
      expect(mask).toBeNull()
    })

    test('clears state after close', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(10, 0)
      addPolygonalLassoPoint(10, 10)
      closePolygonalLasso('replace', 20, 20)

      expect(isPolygonalLassoActive()).toBe(false)
      expect(getPolygonalLassoPoints()).toHaveLength(0)
    })
  })

  describe('cancelPolygonalLasso', () => {
    test('clears state without creating selection', () => {
      beginPolygonalLasso(0, 0)
      addPolygonalLassoPoint(10, 0)
      addPolygonalLassoPoint(10, 10)
      cancelPolygonalLasso()

      expect(isPolygonalLassoActive()).toBe(false)
      expect(getPolygonalLassoPoints()).toHaveLength(0)
    })
  })

  describe('settings', () => {
    test('default settings', () => {
      const s = getPolygonalLassoSettings()
      expect(s.feather).toBe(0)
      expect(s.antiAlias).toBe(true)
    })

    test('partial update', () => {
      setPolygonalLassoSettings({ feather: 5 })
      const s = getPolygonalLassoSettings()
      expect(s.feather).toBe(5)
      expect(s.antiAlias).toBe(true)
    })
  })

  describe('rasterizePolygon (scanline fill)', () => {
    test('fills a rectangle polygon', () => {
      const polygon = [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ]
      const mask = rasterizePolygon(polygon, 10, 10, 'replace')

      // Inside the rectangle
      expect(mask.data[5 * 10 + 5]).toBe(255)
      // Outside top-left corner
      expect(mask.data[0 * 10 + 0]).toBe(0)
      // Outside bottom-right corner
      expect(mask.data[9 * 10 + 9]).toBe(0)
    })

    test('fills a triangle polygon', () => {
      // Triangle: (5,0), (10,10), (0,10)
      const polygon = [
        { x: 5, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]
      const mask = rasterizePolygon(polygon, 12, 12, 'replace')

      // Center of triangle should be selected
      expect(mask.data[6 * 12 + 5]).toBe(255)
      // Outside corners should not be selected
      expect(mask.data[0 * 12 + 0]).toBe(0)
      expect(mask.data[0 * 12 + 11]).toBe(0)
    })

    test('add mode preserves existing selection', () => {
      // Create initial selection
      const initial = { width: 10, height: 10, data: new Uint8Array(100) }
      initial.data[0] = 255 // top-left pixel selected
      setSelectionMask(initial)

      const polygon = [
        { x: 5, y: 5 },
        { x: 9, y: 5 },
        { x: 9, y: 9 },
        { x: 5, y: 9 },
      ]
      const mask = rasterizePolygon(polygon, 10, 10, 'add')

      // Original pixel should still be selected
      expect(mask.data[0]).toBe(255)
      // New polygon area should also be selected
      expect(mask.data[7 * 10 + 7]).toBe(255)
    })

    test('subtract mode removes from existing selection', () => {
      // Create initial full selection
      const initial = { width: 10, height: 10, data: new Uint8Array(100).fill(255) }
      setSelectionMask(initial)

      // Subtract a rectangle from the center
      const polygon = [
        { x: 3, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ]
      const mask = rasterizePolygon(polygon, 10, 10, 'subtract')

      // Center should be deselected
      expect(mask.data[5 * 10 + 5]).toBe(0)
      // Corners should still be selected
      expect(mask.data[0 * 10 + 0]).toBe(255)
      expect(mask.data[9 * 10 + 9]).toBe(255)
    })

    test('replace mode clears existing selection', () => {
      // Create initial full selection
      const initial = { width: 10, height: 10, data: new Uint8Array(100).fill(255) }
      setSelectionMask(initial)

      // Replace with a small polygon
      const polygon = [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ]
      const mask = rasterizePolygon(polygon, 10, 10, 'replace')

      // Outside the polygon should be deselected
      expect(mask.data[9 * 10 + 9]).toBe(0)
      // Inside the polygon should be selected
      expect(mask.data[2 * 10 + 2]).toBe(255)
    })

    test('empty polygon returns empty mask', () => {
      const mask = rasterizePolygon([], 10, 10, 'replace')
      let sum = 0
      for (let i = 0; i < mask.data.length; i++) sum += mask.data[i]!
      expect(sum).toBe(0)
    })

    test('polygon with 2 points returns empty mask', () => {
      const mask = rasterizePolygon(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        20,
        20,
        'replace',
      )
      let sum = 0
      for (let i = 0; i < mask.data.length; i++) sum += mask.data[i]!
      expect(sum).toBe(0)
    })
  })

  describe('closing distance detection', () => {
    test('exactly at closing distance signals close', () => {
      beginPolygonalLasso(100, 100)
      addPolygonalLassoPoint(200, 100)
      addPolygonalLassoPoint(200, 200)
      // Point at distance exactly 8 from (100, 100) → (108, 100)
      const shouldClose = addPolygonalLassoPoint(108, 100)
      expect(shouldClose).toBe(true)
    })

    test('just outside closing distance does not signal close', () => {
      beginPolygonalLasso(100, 100)
      addPolygonalLassoPoint(200, 100)
      addPolygonalLassoPoint(200, 200)
      // Point at distance ~8.06 from (100, 100) → (108, 1) relative: dx=8, dy=1
      // Actually let's use 109, 100 → distance 9 > 8
      const shouldClose = addPolygonalLassoPoint(109, 100)
      expect(shouldClose).toBe(false)
    })
  })
})
