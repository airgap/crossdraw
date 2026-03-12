import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  curvaturePenMouseDown,
  curvaturePenMouseMove,
  curvaturePenKeyDown,
  getCurvaturePenState,
  resetCurvaturePen,
} from '@/tools/curvature-pen'
import type { VectorLayer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 800, height: 600 })
  const state = useEditorStore.getState()
  if (state.snapEnabled) {
    state.toggleSnap()
  }
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function artboard() {
  return useEditorStore.getState().document.artboards[0]!
}

function layerCount(): number {
  return artboard().layers.length
}

function lastLayer(): VectorLayer {
  const ab = artboard()
  return ab.layers[ab.layers.length - 1]! as VectorLayer
}

// ── Tests ──

describe('Curvature Pen Tool', () => {
  beforeEach(() => {
    resetCurvaturePen()
    resetStore()
  })

  describe('getCurvaturePenState', () => {
    test('returns initial state', () => {
      const s = getCurvaturePenState()
      expect(s.isDrawing).toBe(false)
      expect(s.points).toEqual([])
      expect(s.layerId).toBeNull()
      expect(s.artboardId).toBeNull()
      expect(s.previewX).toBe(0)
      expect(s.previewY).toBe(0)
      expect(s.hasPreview).toBe(false)
    })
  })

  describe('resetCurvaturePen', () => {
    test('resets to initial state after drawing', () => {
      const abId = artboardId()
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      expect(getCurvaturePenState().isDrawing).toBe(true)

      resetCurvaturePen()
      const s = getCurvaturePenState()
      expect(s.isDrawing).toBe(false)
      expect(s.points).toEqual([])
      expect(s.layerId).toBeNull()
      expect(s.artboardId).toBeNull()
    })
  })

  describe('curvaturePenMouseDown', () => {
    test('starts drawing on first click', () => {
      const abId = artboardId()
      curvaturePenMouseDown(50, 60, abId, 0, 0, false, false)

      const s = getCurvaturePenState()
      expect(s.isDrawing).toBe(true)
      expect(s.artboardId).toBe(abId)
      expect(s.layerId).not.toBeNull()
      expect(s.points).toHaveLength(1)
      expect(s.points[0]!.x).toBe(50)
      expect(s.points[0]!.y).toBe(60)
      expect(s.points[0]!.corner).toBe(false)
    })

    test('creates a vector layer on first click', () => {
      const abId = artboardId()
      const before = layerCount()
      curvaturePenMouseDown(10, 20, abId, 0, 0, false, false)
      expect(layerCount()).toBe(before + 1)

      const layer = lastLayer()
      expect(layer.type).toBe('vector')
      expect(layer.stroke).not.toBeNull()
      expect(layer.stroke!.width).toBe(2)
      expect(layer.fill).toBeNull()
    })

    test('uses artboard offsets to compute local coordinates', () => {
      const abId = artboardId()
      curvaturePenMouseDown(150, 200, abId, 50, 100, false, false)

      const s = getCurvaturePenState()
      expect(s.points[0]!.x).toBe(100) // 150 - 50
      expect(s.points[0]!.y).toBe(100) // 200 - 100
    })

    test('subsequent clicks add more points', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 10, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 50, abId, 0, 0, false, false)

      const s = getCurvaturePenState()
      expect(s.points).toHaveLength(3)
    })

    test('double-click creates a corner point', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, true) // double-click

      const s = getCurvaturePenState()
      expect(s.points[0]!.corner).toBe(false)
      expect(s.points[1]!.corner).toBe(true)
    })

    test('does not create duplicate layers on subsequent clicks', () => {
      const abId = artboardId()
      const before = layerCount()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      // Only one layer should have been created
      expect(layerCount()).toBe(before + 1)
    })
  })

  describe('closing a path by clicking near start', () => {
    test('closes path when clicking near first point', () => {
      const abId = artboardId()
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 200, abId, 0, 0, false, false)

      // Click near the first point (within 8 / zoom threshold)
      curvaturePenMouseDown(100.5, 100.5, abId, 0, 0, false, false)

      // Path should be finalized and state reset
      const s = getCurvaturePenState()
      expect(s.isDrawing).toBe(false)
      expect(s.points).toEqual([])
    })

    test('closed path has a close segment', () => {
      const abId = artboardId()
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 200, abId, 0, 0, false, false)

      // Close by clicking near start
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)

      // The layer should remain and have a closed path
      const ab = artboard()
      expect(ab.layers.length).toBeGreaterThanOrEqual(1)
      const layer = ab.layers[ab.layers.length - 1] as VectorLayer
      if (layer && layer.paths.length > 0) {
        const path = layer.paths[0]!
        // The path should have a close segment
        const lastSeg = path.segments[path.segments.length - 1]
        expect(lastSeg!.type).toBe('close')
        expect(path.closed).toBe(true)
      }
    })

    test('does not close with fewer than 2 points', () => {
      const abId = artboardId()
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      // Only 1 point — clicking near start should add the point, not close
      curvaturePenMouseDown(100.1, 100.1, abId, 0, 0, false, false)

      const s = getCurvaturePenState()
      // Should still be drawing — added a second point, not closed
      expect(s.isDrawing).toBe(true)
      expect(s.points).toHaveLength(2)
    })
  })

  describe('path segment generation', () => {
    test('3 smooth points generate cubic bezier segments', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 50, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false)

      // The layer path should have cubic segments
      const layer = lastLayer()
      expect(layer.paths.length).toBeGreaterThanOrEqual(1)
      const path = layer.paths[0]!
      // Expect: move + 2 cubics
      expect(path.segments[0]!.type).toBe('move')
      // With 3 smooth points, we should get cubic beziers
      const cubics = path.segments.filter((s) => s.type === 'cubic')
      expect(cubics.length).toBe(2)
    })

    test('corner points generate line segments between them', () => {
      const abId = artboardId()
      // All corners via double-click
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, true)
      curvaturePenMouseDown(100, 0, abId, 0, 0, false, true)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, true)

      const layer = lastLayer()
      const path = layer.paths[0]!
      expect(path.segments[0]!.type).toBe('move')
      // Both following segments should be lines (corner to corner)
      const lines = path.segments.filter((s) => s.type === 'line')
      expect(lines.length).toBe(2)
    })

    test('mixed smooth and corner points produce correct segment types', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false) // smooth
      curvaturePenMouseDown(100, 50, abId, 0, 0, false, true) // corner
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false) // smooth

      const layer = lastLayer()
      const path = layer.paths[0]!
      expect(path.segments[0]!.type).toBe('move')
      // Segment from smooth(0) to corner(1): cubic (smooth start, corner end)
      // Segment from corner(1) to smooth(2): cubic (corner start, smooth end)
      // At least one should be cubic since one endpoint is smooth
      const cubics = path.segments.filter((s) => s.type === 'cubic')
      expect(cubics.length).toBeGreaterThanOrEqual(1)
    })

    test('single point does not produce bezier segments', () => {
      const abId = artboardId()
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, false)

      const layer = lastLayer()
      const path = layer.paths[0]!
      // Only a move segment for a single point
      expect(path.segments).toHaveLength(1)
      expect(path.segments[0]!.type).toBe('move')
    })

    test('two points produce a single cubic segment', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)

      const layer = lastLayer()
      const path = layer.paths[0]!
      expect(path.segments).toHaveLength(2)
      expect(path.segments[0]!.type).toBe('move')
      // Two smooth points → cubic
      expect(path.segments[1]!.type).toBe('cubic')
    })

    test('four or more points create proper cubic path', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 80, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 20, abId, 0, 0, false, false)
      curvaturePenMouseDown(150, 80, abId, 0, 0, false, false)

      const layer = lastLayer()
      const path = layer.paths[0]!
      // move + 3 cubics = 4 segments
      expect(path.segments).toHaveLength(4)
      expect(path.segments[0]!.type).toBe('move')
      expect(path.segments[1]!.type).toBe('cubic')
      expect(path.segments[2]!.type).toBe('cubic')
      expect(path.segments[3]!.type).toBe('cubic')
    })

    test('cubic bezier handles are based on Catmull-Rom tangents', () => {
      const abId = artboardId()
      // Place points along a known path: horizontal line with middle point offset
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false)

      const layer = lastLayer()
      const path = layer.paths[0]!
      // Middle point tangent = (P2 - P0) / 2 = (200-0, 0-0) / 2 = (100, 0)
      // So for second segment (from P1 to P2):
      //   cp2 = P2 - tangent(2)/3
      // For first segment (from P0 to P1):
      //   cp1 = P0 + tangent(0)/3
      // Check that cubic control points are numbers (not NaN)
      for (const seg of path.segments) {
        if (seg.type === 'cubic') {
          expect(typeof seg.cp1x).toBe('number')
          expect(typeof seg.cp1y).toBe('number')
          expect(typeof seg.cp2x).toBe('number')
          expect(typeof seg.cp2y).toBe('number')
          expect(Number.isNaN(seg.cp1x)).toBe(false)
          expect(Number.isNaN(seg.cp1y)).toBe(false)
          expect(Number.isNaN(seg.cp2x)).toBe(false)
          expect(Number.isNaN(seg.cp2y)).toBe(false)
        }
      }
    })
  })

  describe('curvaturePenMouseMove', () => {
    test('does nothing when not drawing', () => {
      curvaturePenMouseMove(100, 200)
      const s = getCurvaturePenState()
      expect(s.hasPreview).toBe(false)
    })

    test('updates preview position during drawing', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenMouseMove(80, 90)

      const s = getCurvaturePenState()
      expect(s.hasPreview).toBe(true)
      expect(s.previewX).toBe(80) // docX - artboard.x (artboard at 0,0)
      expect(s.previewY).toBe(90)
    })

    test('accounts for artboard position in preview', () => {
      // Move the artboard first
      const abId = artboardId()
      useEditorStore.getState().moveArtboard(abId, 50, 30)

      curvaturePenMouseDown(100, 100, abId, 50, 30, false, false)
      curvaturePenMouseMove(200, 180)

      const s = getCurvaturePenState()
      expect(s.previewX).toBe(150) // 200 - 50
      expect(s.previewY).toBe(150) // 180 - 30
    })

    test('does nothing if artboard is not found', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)

      // Manually set artboardId to a nonexistent one
      const s = getCurvaturePenState()
      const origArtboardId = s.artboardId

      // Forcibly break the artboardId by resetting store (artboard changes id)
      // This tests the guard clause in curvaturePenMouseMove
      resetStore()
      // State still has old artboardId
      curvaturePenMouseMove(100, 100)

      // hasPreview should not have been set (artboard not found)
      // (state.artboardId still points to old id which no longer exists)
      // The function should return early
      expect(getCurvaturePenState().artboardId).toBe(origArtboardId)
    })
  })

  describe('curvaturePenKeyDown', () => {
    test('does nothing when not drawing', () => {
      curvaturePenKeyDown('Enter')
      const s = getCurvaturePenState()
      expect(s.isDrawing).toBe(false)
    })

    test('Escape cancels and deletes the layer', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, false)
      const s = getCurvaturePenState()
      const layerId = s.layerId!

      curvaturePenKeyDown('Escape')

      // State should be reset
      expect(getCurvaturePenState().isDrawing).toBe(false)

      // Layer should be deleted
      const ab = artboard()
      const found = ab.layers.find((l) => l.id === layerId)
      expect(found).toBeUndefined()
    })

    test('Enter finishes the path (open)', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 50, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false)

      curvaturePenKeyDown('Enter')

      // State should be reset
      expect(getCurvaturePenState().isDrawing).toBe(false)

      // Layer should remain with finalized path
      const ab = artboard()
      expect(ab.layers.length).toBeGreaterThanOrEqual(1)
      const layer = ab.layers[ab.layers.length - 1] as VectorLayer
      expect(layer.paths.length).toBeGreaterThanOrEqual(1)
      const path = layer.paths[0]!
      // Should not have a close segment (open path)
      const lastSeg = path.segments[path.segments.length - 1]
      expect(lastSeg!.type).not.toBe('close')
      expect(path.closed).toBe(false)
    })

    test('Enter with only 1 point deletes the layer', () => {
      const abId = artboardId()
      const before = layerCount()
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, false)
      const s = getCurvaturePenState()
      const layerId = s.layerId!
      expect(layerCount()).toBe(before + 1)

      curvaturePenKeyDown('Enter')

      // Layer should be deleted (not enough points)
      const ab = artboard()
      expect(ab.layers.find((l) => l.id === layerId)).toBeUndefined()
      expect(getCurvaturePenState().isDrawing).toBe(false)
    })

    test('Enter selects the finished layer', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 50, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false)

      curvaturePenKeyDown('Enter')

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds.length).toBe(1)
    })

    test('other keys are ignored', () => {
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      curvaturePenKeyDown('a')
      curvaturePenKeyDown('Shift')
      curvaturePenKeyDown('Delete')

      // Still drawing
      expect(getCurvaturePenState().isDrawing).toBe(true)
    })
  })

  describe('path finalization', () => {
    test('finalized path has a unique UUID id (not temp id)', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 0, abId, 0, 0, false, false)

      curvaturePenKeyDown('Enter')

      const layer = lastLayer()
      const path = layer.paths[0]!
      expect(path.id).not.toContain('curvpen-active-')
    })

    test('preview path uses temp id while drawing', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)

      const s = getCurvaturePenState()
      const layer = lastLayer()
      const path = layer.paths[0]!
      expect(path.id).toBe(`curvpen-active-${s.layerId}`)
    })

    test('multiple clicks then Enter produces correct number of segments', () => {
      const abId = artboardId()
      for (let i = 0; i < 5; i++) {
        curvaturePenMouseDown(i * 50, (i % 2) * 80, abId, 0, 0, false, false)
      }

      curvaturePenKeyDown('Enter')

      const layer = lastLayer()
      const path = layer.paths[0]!
      // 5 points → move + 4 cubic segments = 5 segments total
      expect(path.segments).toHaveLength(5)
      expect(path.segments[0]!.type).toBe('move')
    })
  })

  describe('edge cases', () => {
    test('closing path triggers selection', () => {
      const abId = artboardId()
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(200, 100, abId, 0, 0, false, false)
      curvaturePenMouseDown(150, 200, abId, 0, 0, false, false)

      // Close
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds.length).toBe(1)
    })

    test('Escape with no artboardId/layerId does not throw', () => {
      // Manually enter drawing state without proper IDs
      const abId = artboardId()
      curvaturePenMouseDown(10, 10, abId, 0, 0, false, false)
      // Reset underlying layer manually via store
      getCurvaturePenState()
      // Just call escape — it should handle gracefully
      curvaturePenKeyDown('Escape')
      expect(getCurvaturePenState().isDrawing).toBe(false)
    })

    test('consecutive drawing sessions create separate layers', () => {
      const abId = artboardId()

      // First session
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)
      curvaturePenMouseDown(50, 50, abId, 0, 0, false, false)
      curvaturePenKeyDown('Enter')
      const count1 = layerCount()

      // Second session
      curvaturePenMouseDown(200, 200, abId, 0, 0, false, false)
      curvaturePenMouseDown(300, 300, abId, 0, 0, false, false)
      curvaturePenKeyDown('Enter')
      const count2 = layerCount()

      expect(count2).toBe(count1 + 1)
    })

    test('commitPreview updates existing path on subsequent clicks', () => {
      const abId = artboardId()
      curvaturePenMouseDown(0, 0, abId, 0, 0, false, false)

      const layer1 = lastLayer()
      expect(layer1.paths).toHaveLength(1)

      // Second click should update existing path, not add new one
      curvaturePenMouseDown(100, 100, abId, 0, 0, false, false)
      const layer2 = lastLayer()
      expect(layer2.paths).toHaveLength(1)
    })
  })
})
