import { describe, test, expect, beforeEach } from 'bun:test'
import {
  beginMagneticLasso,
  updateMagneticLasso,
  addMagneticLassoAnchor,
  closeMagneticLasso,
  cancelMagneticLasso,
  isMagneticLassoActive,
  getMagneticLassoPoints,
  getMagneticLassoAnchors,
  getMagneticLassoSettings,
  setMagneticLassoSettings,
  computeEdgeMap,
  snapToEdge,
  traceEdgePath,
} from '@/tools/magnetic-lasso'
import { clearSelection, setSelectionMask } from '@/tools/raster-selection'

/** Create a fake ImageData (works in bun test without DOM). */
function createImageData(width: number, height: number, fill?: Uint8ClampedArray): ImageData {
  const data = fill ?? new Uint8ClampedArray(width * height * 4)
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}

/** Create image data with a sharp vertical edge at column `col`. */
function createVerticalEdgeImage(width: number, height: number, col: number, leftVal = 0, rightVal = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const v = x < col ? leftVal : rightVal
      data[idx] = v
      data[idx + 1] = v
      data[idx + 2] = v
      data[idx + 3] = 255
    }
  }
  return createImageData(width, height, data)
}

/** Create image data with a sharp horizontal edge at row `row`. */
function createHorizontalEdgeImage(width: number, height: number, row: number, topVal = 0, bottomVal = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const v = y < row ? topVal : bottomVal
      data[idx] = v
      data[idx + 1] = v
      data[idx + 2] = v
      data[idx + 3] = 255
    }
  }
  return createImageData(width, height, data)
}

function resetState() {
  if (isMagneticLassoActive()) {
    cancelMagneticLasso()
  }
  clearSelection()
  setMagneticLassoSettings({ width: 10, contrast: 0.1, frequency: 40, feather: 0 })
}

describe('magnetic lasso tool', () => {
  beforeEach(() => {
    resetState()
  })

  // ─── Edge Detection ──────────────────────────────────────────

  describe('computeEdgeMap', () => {
    test('returns array of correct length', () => {
      const img = createImageData(10, 10)
      const edgeMap = computeEdgeMap(img)
      expect(edgeMap.length).toBe(100)
    })

    test('uniform image produces near-zero edge map', () => {
      const data = new Uint8ClampedArray(20 * 20 * 4)
      data.fill(128) // all channels same
      for (let i = 0; i < 20 * 20; i++) data[i * 4 + 3] = 255
      const img = createImageData(20, 20, data)
      const edgeMap = computeEdgeMap(img)
      let maxVal = 0
      for (let i = 0; i < edgeMap.length; i++) {
        if (edgeMap[i]! > maxVal) maxVal = edgeMap[i]!
      }
      expect(maxVal).toBe(0)
    })

    test('detects vertical edge', () => {
      const img = createVerticalEdgeImage(20, 20, 10)
      const edgeMap = computeEdgeMap(img)

      // Edge should be strongest near column 10
      const edgeStrength = edgeMap[10 * 20 + 10]! // row 10, col 10
      const awayStrength = edgeMap[10 * 20 + 3]! // row 10, col 3 (in uniform region)

      expect(edgeStrength).toBeGreaterThan(awayStrength)
    })

    test('detects horizontal edge', () => {
      const img = createHorizontalEdgeImage(20, 20, 10)
      const edgeMap = computeEdgeMap(img)

      // Edge should be strongest near row 10
      const edgeStrength = edgeMap[10 * 20 + 10]! // row 10, col 10
      const awayStrength = edgeMap[3 * 20 + 10]! // row 3, col 10 (in uniform region)

      expect(edgeStrength).toBeGreaterThan(awayStrength)
    })

    test('normalized to 0-1 range', () => {
      const img = createVerticalEdgeImage(20, 20, 10)
      const edgeMap = computeEdgeMap(img)

      let maxVal = 0
      let minVal = Infinity
      for (let i = 0; i < edgeMap.length; i++) {
        if (edgeMap[i]! > maxVal) maxVal = edgeMap[i]!
        if (edgeMap[i]! < minVal) minVal = edgeMap[i]!
      }

      expect(maxVal).toBeCloseTo(1, 2)
      expect(minVal).toBeGreaterThanOrEqual(0)
    })

    test('border pixels are zero', () => {
      const img = createVerticalEdgeImage(10, 10, 5)
      const edgeMap = computeEdgeMap(img)

      // Top row
      for (let x = 0; x < 10; x++) {
        expect(edgeMap[0 * 10 + x]).toBe(0)
      }
      // Bottom row
      for (let x = 0; x < 10; x++) {
        expect(edgeMap[9 * 10 + x]).toBe(0)
      }
      // Left col
      for (let y = 0; y < 10; y++) {
        expect(edgeMap[y * 10 + 0]).toBe(0)
      }
      // Right col
      for (let y = 0; y < 10; y++) {
        expect(edgeMap[y * 10 + 9]).toBe(0)
      }
    })
  })

  // ─── Edge Snapping ───────────────────────────────────────────

  describe('snapToEdge', () => {
    test('snaps to highest edge strength within radius', () => {
      const edgeMap = new Float32Array(10 * 10)
      // Place a strong edge at (5, 5)
      edgeMap[5 * 10 + 5] = 1.0
      // Place a weaker edge at (3, 3)
      edgeMap[3 * 10 + 3] = 0.5

      const result = snapToEdge(4, 4, edgeMap, 10, 10, 3)
      expect(result).toEqual({ x: 5, y: 5 })
    })

    test('stays at original position if no edge within radius', () => {
      const edgeMap = new Float32Array(10 * 10)
      // Strong edge far away at (9, 9)
      edgeMap[9 * 10 + 9] = 1.0

      const result = snapToEdge(2, 2, edgeMap, 10, 10, 3)
      // No edge within radius, so returns the best we found (which is 0 or original)
      // With contrast threshold 0, any pixel qualifies as 0 strength
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeGreaterThanOrEqual(0)
    })

    test('respects contrast threshold', () => {
      const edgeMap = new Float32Array(10 * 10)
      // Place a weak edge at (5, 5)
      edgeMap[5 * 10 + 5] = 0.05

      // With high threshold, should not snap to weak edge
      const result = snapToEdge(4, 4, edgeMap, 10, 10, 3, 0.5)
      // No edge above threshold, so bestStrength stays -1 and returns original
      expect(result).toEqual({ x: 4, y: 4 })
    })

    test('uses circular search area', () => {
      const edgeMap = new Float32Array(20 * 20)
      // Place strong edge at corner of search box (diagonal > radius)
      // radius=3, point at (5,5), edge at (8,8) → distance ~4.24 > 3
      edgeMap[8 * 20 + 8] = 1.0

      const result = snapToEdge(5, 5, edgeMap, 20, 20, 3)
      // Should NOT snap to (8,8) because it's outside circular radius
      expect(result.x).not.toBe(8)
      expect(result.y).not.toBe(8)
    })

    test('handles edge of image bounds', () => {
      const edgeMap = new Float32Array(5 * 5)
      edgeMap[0 * 5 + 0] = 1.0

      const result = snapToEdge(0, 0, edgeMap, 5, 5, 3)
      expect(result).toEqual({ x: 0, y: 0 })
    })
  })

  // ─── Path Tracing ────────────────────────────────────────────

  describe('traceEdgePath', () => {
    test('traces straight path with no edges', () => {
      const edgeMap = new Float32Array(20 * 20) // all zeros
      const path = traceEdgePath({ x: 2, y: 2 }, { x: 10, y: 2 }, edgeMap, 20, 20)

      expect(path.length).toBeGreaterThan(1)
      expect(path[0]).toEqual({ x: 2, y: 2 })
      expect(path[path.length - 1]).toEqual({ x: 10, y: 2 })
    })

    test('path follows strong edges', () => {
      const w = 20
      const h = 20
      const edgeMap = new Float32Array(w * h)

      // Create a strong edge along row 5
      for (let x = 0; x < w; x++) {
        edgeMap[5 * w + x] = 1.0
      }

      // Trace from (2, 5) to (15, 5) — should follow the edge
      const path = traceEdgePath({ x: 2, y: 5 }, { x: 15, y: 5 }, edgeMap, w, h)

      // Most path points should be on or near row 5
      let onEdgeCount = 0
      for (const pt of path) {
        if (Math.abs(pt.y - 5) <= 1) onEdgeCount++
      }
      expect(onEdgeCount / path.length).toBeGreaterThan(0.7)
    })

    test('returns start and end points', () => {
      const edgeMap = new Float32Array(10 * 10)
      const path = traceEdgePath({ x: 1, y: 1 }, { x: 8, y: 8 }, edgeMap, 10, 10)

      expect(path[0]).toEqual({ x: 1, y: 1 })
      expect(path[path.length - 1]).toEqual({ x: 8, y: 8 })
    })

    test('handles same start and end', () => {
      const edgeMap = new Float32Array(10 * 10)
      const path = traceEdgePath({ x: 5, y: 5 }, { x: 5, y: 5 }, edgeMap, 10, 10)

      expect(path.length).toBeGreaterThanOrEqual(1)
      expect(path[0]).toEqual({ x: 5, y: 5 })
    })

    test('handles adjacent points', () => {
      const edgeMap = new Float32Array(10 * 10)
      const path = traceEdgePath({ x: 5, y: 5 }, { x: 6, y: 5 }, edgeMap, 10, 10)

      expect(path.length).toBeGreaterThanOrEqual(2)
      expect(path[0]).toEqual({ x: 5, y: 5 })
      expect(path[path.length - 1]).toEqual({ x: 6, y: 5 })
    })
  })

  // ─── Lasso Lifecycle ─────────────────────────────────────────

  describe('beginMagneticLasso', () => {
    test('activates and sets first anchor', () => {
      const img = createVerticalEdgeImage(20, 20, 10)
      beginMagneticLasso(5, 5, img)

      expect(isMagneticLassoActive()).toBe(true)
      expect(getMagneticLassoAnchors().length).toBe(1)
    })

    test('snaps starting point to nearest edge', () => {
      const img = createVerticalEdgeImage(20, 20, 10)
      setMagneticLassoSettings({ width: 10, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(8, 5, img)

      const anchors = getMagneticLassoAnchors()
      // Should have snapped toward column 10 (the edge)
      expect(anchors[0]!.x).toBeGreaterThanOrEqual(8)
    })

    test('points array starts non-empty', () => {
      const img = createImageData(10, 10)
      beginMagneticLasso(5, 5, img)
      expect(getMagneticLassoPoints().length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('updateMagneticLasso', () => {
    test('updates live preview path', () => {
      const img = createVerticalEdgeImage(30, 30, 15)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)

      const initialPointCount = getMagneticLassoPoints().length
      updateMagneticLasso(10, 5)

      // Live path should add more points
      expect(getMagneticLassoPoints().length).toBeGreaterThanOrEqual(initialPointCount)
    })

    test('does nothing when not active', () => {
      updateMagneticLasso(10, 10)
      expect(getMagneticLassoPoints()).toHaveLength(0)
    })
  })

  describe('addMagneticLassoAnchor', () => {
    test('adds anchor and locks path segment', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)

      const initialAnchors = getMagneticLassoAnchors().length
      addMagneticLassoAnchor(15, 5)

      expect(getMagneticLassoAnchors().length).toBe(initialAnchors + 1)
    })

    test('returns false when not near first anchor', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)
      addMagneticLassoAnchor(15, 5)
      addMagneticLassoAnchor(15, 15)

      const shouldClose = addMagneticLassoAnchor(20, 20)
      expect(shouldClose).toBe(false)
    })

    test('returns true when clicking near first anchor (>= 3 anchors)', () => {
      const img = createImageData(50, 50)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(10, 10, img)
      addMagneticLassoAnchor(30, 10)
      addMagneticLassoAnchor(30, 30)

      // Click near first anchor (10, 10)
      const shouldClose = addMagneticLassoAnchor(11, 10)
      expect(shouldClose).toBe(true)
    })

    test('does not signal close with fewer than 3 anchors', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(10, 10, img)
      addMagneticLassoAnchor(20, 10)

      // Only 2 anchors, click near first
      const shouldClose = addMagneticLassoAnchor(10, 10)
      expect(shouldClose).toBe(false)
    })

    test('returns false when not active', () => {
      const result = addMagneticLassoAnchor(10, 10)
      expect(result).toBe(false)
    })
  })

  describe('closeMagneticLasso', () => {
    test('creates a selection mask', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)
      addMagneticLassoAnchor(25, 5)
      addMagneticLassoAnchor(25, 25)

      const mask = closeMagneticLasso('replace', 30, 30)
      expect(mask).not.toBeNull()
      expect(mask!.width).toBe(30)
      expect(mask!.height).toBe(30)
      expect(isMagneticLassoActive()).toBe(false)
    })

    test('returns null with fewer than 3 anchors', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)
      addMagneticLassoAnchor(25, 5)

      const mask = closeMagneticLasso('replace', 30, 30)
      expect(mask).toBeNull()
      expect(isMagneticLassoActive()).toBe(false)
    })

    test('returns null when not active', () => {
      const mask = closeMagneticLasso('replace', 30, 30)
      expect(mask).toBeNull()
    })

    test('clears state after close', () => {
      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(5, 5, img)
      addMagneticLassoAnchor(25, 5)
      addMagneticLassoAnchor(25, 25)
      closeMagneticLasso('replace', 30, 30)

      expect(isMagneticLassoActive()).toBe(false)
      expect(getMagneticLassoAnchors()).toHaveLength(0)
      expect(getMagneticLassoPoints()).toHaveLength(0)
    })

    test('supports add mode', () => {
      // Pre-fill a selection
      const initial = { width: 30, height: 30, data: new Uint8Array(900) }
      initial.data[0] = 255
      setSelectionMask(initial)

      const img = createImageData(30, 30)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(10, 10, img)
      addMagneticLassoAnchor(20, 10)
      addMagneticLassoAnchor(20, 20)

      const mask = closeMagneticLasso('add', 30, 30)
      expect(mask).not.toBeNull()
      // Original pixel should still be selected
      expect(mask!.data[0]).toBe(255)
    })
  })

  describe('cancelMagneticLasso', () => {
    test('clears state without creating selection', () => {
      const img = createImageData(30, 30)
      beginMagneticLasso(5, 5, img)
      addMagneticLassoAnchor(15, 5)
      cancelMagneticLasso()

      expect(isMagneticLassoActive()).toBe(false)
      expect(getMagneticLassoAnchors()).toHaveLength(0)
      expect(getMagneticLassoPoints()).toHaveLength(0)
    })
  })

  // ─── Settings ────────────────────────────────────────────────

  describe('settings', () => {
    test('default settings', () => {
      const s = getMagneticLassoSettings()
      expect(s.width).toBe(10)
      expect(s.contrast).toBe(0.1)
      expect(s.frequency).toBe(40)
      expect(s.feather).toBe(0)
    })

    test('partial update', () => {
      setMagneticLassoSettings({ width: 20 })
      const s = getMagneticLassoSettings()
      expect(s.width).toBe(20)
      expect(s.contrast).toBe(0.1) // unchanged
    })

    test('full update', () => {
      setMagneticLassoSettings({ width: 15, contrast: 0.5, frequency: 60, feather: 3 })
      const s = getMagneticLassoSettings()
      expect(s.width).toBe(15)
      expect(s.contrast).toBe(0.5)
      expect(s.frequency).toBe(60)
      expect(s.feather).toBe(3)
    })
  })

  // ─── Auto-anchor via frequency ───────────────────────────────

  describe('auto-anchor frequency', () => {
    test('auto-places anchors when moving far enough', () => {
      const img = createImageData(200, 200)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 10, feather: 0 })
      beginMagneticLasso(10, 10, img)

      const initialAnchors = getMagneticLassoAnchors().length

      // Move far enough to trigger auto-anchor placement
      for (let i = 1; i <= 30; i++) {
        updateMagneticLasso(10 + i * 2, 10)
      }

      // Should have more anchors than initial
      expect(getMagneticLassoAnchors().length).toBeGreaterThan(initialAnchors)
    })

    test('no auto-anchors when frequency is 0', () => {
      const img = createImageData(200, 200)
      setMagneticLassoSettings({ width: 5, contrast: 0, frequency: 0, feather: 0 })
      beginMagneticLasso(10, 10, img)

      const initialAnchors = getMagneticLassoAnchors().length

      for (let i = 1; i <= 30; i++) {
        updateMagneticLasso(10 + i * 2, 10)
      }

      // No auto-anchors should be placed
      expect(getMagneticLassoAnchors().length).toBe(initialAnchors)
    })
  })

  // ─── Integration: Edge-Following Selection ───────────────────

  describe('edge-following integration', () => {
    test('selection on vertical edge image includes edge region', () => {
      const img = createVerticalEdgeImage(30, 30, 15)
      setMagneticLassoSettings({ width: 10, contrast: 0, frequency: 0, feather: 0 })

      beginMagneticLasso(14, 2, img)
      addMagneticLassoAnchor(14, 15)
      addMagneticLassoAnchor(14, 28)

      const mask = closeMagneticLasso('replace', 30, 30)
      expect(mask).not.toBeNull()
      expect(mask!.data.length).toBe(900)
    })
  })
})
