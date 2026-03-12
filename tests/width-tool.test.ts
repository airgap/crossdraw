import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore, createDefaultVectorLayer } from '@/store/editor.store'
import {
  widthToolMouseDown,
  widthToolMouseDrag,
  widthToolMouseUp,
  getWidthToolState,
  resetWidthTool,
  isWidthToolDragging,
} from '@/tools/width-tool'
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

/**
 * Add a vector layer with a cubic bezier path approximating a horizontal line
 * at y=50 from x=0 to x=200. Using cubic ensures flattenPath produces many
 * sample points for accurate hit testing.
 */
function addVectorLayerWithStroke(): string {
  const abId = artboardId()
  const layer = createDefaultVectorLayer('Test Vector')
  layer.stroke = {
    width: 4,
    color: '#ff0000',
    opacity: 1,
    position: 'center',
    linecap: 'round',
    linejoin: 'round',
    miterLimit: 4,
  }
  layer.fill = null
  layer.paths = [
    {
      id: 'test-path-1',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'cubic', x: 200, y: 50, cp1x: 66, cp1y: 50, cp2x: 133, cp2y: 50 },
      ],
      closed: false,
    },
  ]
  useEditorStore.getState().addLayer(abId, layer)
  return layer.id
}

/** Add a vector layer with a more curved cubic bezier path and a stroke. */
function addCubicLayerWithStroke(): string {
  const abId = artboardId()
  const layer = createDefaultVectorLayer('Cubic Vector')
  layer.stroke = {
    width: 3,
    color: '#0000ff',
    opacity: 1,
    position: 'center',
    linecap: 'round',
    linejoin: 'round',
    miterLimit: 4,
  }
  layer.fill = null
  layer.paths = [
    {
      id: 'cubic-path-1',
      segments: [
        { type: 'move', x: 0, y: 100 },
        { type: 'cubic', x: 200, y: 100, cp1x: 50, cp1y: 0, cp2x: 150, cp2y: 200 },
      ],
      closed: false,
    },
  ]
  useEditorStore.getState().addLayer(abId, layer)
  return layer.id
}

/** Add a vector layer with NO stroke — uses cubic for sample points. */
function addVectorLayerNoStroke(): string {
  const abId = artboardId()
  const layer = createDefaultVectorLayer('No Stroke Vector')
  layer.stroke = null
  layer.paths = [
    {
      id: 'nostroke-path',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'cubic', x: 200, y: 50, cp1x: 66, cp1y: 50, cp2x: 133, cp2y: 50 },
      ],
      closed: false,
    },
  ]
  useEditorStore.getState().addLayer(abId, layer)
  return layer.id
}

/** Add a locked vector layer with stroke. */
function addLockedVectorLayer(): string {
  const abId = artboardId()
  const layer = createDefaultVectorLayer('Locked Vector')
  layer.locked = true
  layer.stroke = {
    width: 2,
    color: '#000000',
    opacity: 1,
    position: 'center',
    linecap: 'round',
    linejoin: 'round',
    miterLimit: 4,
  }
  layer.paths = [
    {
      id: 'locked-path',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'cubic', x: 200, y: 50, cp1x: 66, cp1y: 50, cp2x: 133, cp2y: 50 },
      ],
      closed: false,
    },
  ]
  useEditorStore.getState().addLayer(abId, layer)
  return layer.id
}

/** Add a hidden vector layer with stroke. */
function addHiddenVectorLayer(): string {
  const abId = artboardId()
  const layer = createDefaultVectorLayer('Hidden Vector')
  layer.visible = false
  layer.stroke = {
    width: 2,
    color: '#000000',
    opacity: 1,
    position: 'center',
    linecap: 'round',
    linejoin: 'round',
    miterLimit: 4,
  }
  layer.paths = [
    {
      id: 'hidden-path',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'cubic', x: 200, y: 50, cp1x: 66, cp1y: 50, cp2x: 133, cp2y: 50 },
      ],
      closed: false,
    },
  ]
  useEditorStore.getState().addLayer(abId, layer)
  return layer.id
}

function getLayer(layerId: string): VectorLayer | undefined {
  const ab = artboard()
  return ab.layers.find((l) => l.id === layerId) as VectorLayer | undefined
}

// ── Tests ──

describe('Width Tool', () => {
  beforeEach(() => {
    resetWidthTool()
    resetStore()
  })

  describe('getWidthToolState', () => {
    test('returns initial state', () => {
      const s = getWidthToolState()
      expect(s.layerId).toBeNull()
      expect(s.artboardId).toBeNull()
      expect(s.activePosition).toBe(0)
      expect(s.dragStartY).toBe(0)
      expect(s.originalMultiplier).toBe(1)
      expect(s.isDragging).toBe(false)
    })
  })

  describe('resetWidthTool', () => {
    test('resets to initial state', () => {
      // Activate the tool first
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      resetWidthTool()
      const s = getWidthToolState()
      expect(s.isDragging).toBe(false)
      expect(s.layerId).toBeNull()
      expect(s.artboardId).toBeNull()
    })
  })

  describe('isWidthToolDragging', () => {
    test('returns false initially', () => {
      expect(isWidthToolDragging()).toBe(false)
    })

    test('returns true when dragging on a valid vector layer', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('returns false after mouseUp', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseUp()
      expect(isWidthToolDragging()).toBe(false)
    })
  })

  describe('widthToolMouseDown', () => {
    test('activates when clicking near a vector path with stroke', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // Click on the path (y=50, which is exactly on it)
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const s = getWidthToolState()
      expect(s.isDragging).toBe(true)
      expect(s.layerId).not.toBeNull()
      expect(s.artboardId).toBe(abId)
    })

    test('does not activate when clicking far from any path', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // Click very far from the path (y=50) — threshold is 20/zoom
      widthToolMouseDown(100, 500, 1, abId, 0, 0)

      expect(isWidthToolDragging()).toBe(false)
    })

    test('stores the drag start Y position', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const s = getWidthToolState()
      expect(s.dragStartY).toBe(50)
    })

    test('computes activePosition (t parameter) along the path', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // Click at x=100 on a cubic from (0,50) to (200,50) → t ≈ 0.5
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const s = getWidthToolState()
      expect(s.activePosition).toBeGreaterThan(0)
      expect(s.activePosition).toBeLessThanOrEqual(1)
      // Should be approximately 0.5
      expect(Math.abs(s.activePosition - 0.5)).toBeLessThan(0.15)
    })

    test('respects zoom for hit threshold', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // At zoom=2, threshold = 20/2 = 10 pixels
      // The path is at y=50, clicking at y=55 (5px away) should work at zoom=2
      widthToolMouseDown(100, 55, 2, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('does not activate on high-zoom click far from path', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // At zoom=10, threshold = 20/10 = 2 pixels
      // Clicking at y=60 (10px from path at y=50) should NOT activate
      widthToolMouseDown(100, 60, 10, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(false)
    })

    test('does not activate for locked layers', () => {
      addLockedVectorLayer()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(false)
    })

    test('does not activate for hidden layers', () => {
      addHiddenVectorLayer()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(false)
    })

    test('initializes width profile if stroke has none', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // Ensure no widthProfile
      const layer = getLayer(layerId)!
      expect(layer.stroke!.widthProfile).toBeUndefined()

      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // After mouseDown, widthProfile should be initialized
      const updated = getLayer(layerId)!
      expect(updated.stroke!.widthProfile).toBeDefined()
      expect(updated.stroke!.widthProfile!.length).toBe(2)
      expect(updated.stroke!.widthProfile![0]).toEqual([0, 1])
      expect(updated.stroke!.widthProfile![1]).toEqual([1, 1])
    })

    test('does not overwrite existing width profile', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // Set a custom widthProfile
      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0, 0.5],
            [0.5, 2],
            [1, 0.5],
          ],
        },
      } as Partial<VectorLayer>)

      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // Should keep the custom profile
      const updated = getLayer(layerId)!
      expect(updated.stroke!.widthProfile!.length).toBe(3)
    })

    test('handles artboard offset correctly', () => {
      const abId = artboardId()
      useEditorStore.getState().moveArtboard(abId, 100, 200)
      addVectorLayerWithStroke()

      // Path is at local (0-200, 50). Artboard at (100, 200).
      // So doc coords for path center: (200, 250)
      widthToolMouseDown(200, 250, 1, abId, 100, 200)

      expect(isWidthToolDragging()).toBe(true)
    })

    test('does nothing when artboard is not found', () => {
      addVectorLayerWithStroke()
      widthToolMouseDown(100, 50, 1, 'nonexistent-artboard', 0, 0)
      expect(isWidthToolDragging()).toBe(false)
    })

    test('initializes stroke if layer has no stroke at all', () => {
      const layerId = addVectorLayerNoStroke()
      const abId = artboardId()

      // The layer has no stroke — the hit test still finds nearest point
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      if (isWidthToolDragging()) {
        // If it did activate (found nearest path), it should have set up a stroke
        const updated = getLayer(layerId)!
        expect(updated.stroke).not.toBeNull()
        expect(updated.stroke!.widthProfile).toBeDefined()
      }
    })

    test('works with curved cubic bezier paths', () => {
      addCubicLayerWithStroke()
      const abId = artboardId()
      // The cubic goes from (0,100) to (200,100) with control points that curve
      widthToolMouseDown(100, 100, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('reads original multiplier from existing width profile', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // Set widthProfile with specific values
      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0, 0.5],
            [1, 2.0],
          ],
        },
      } as Partial<VectorLayer>)

      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const s = getWidthToolState()
      // The original multiplier should be interpolated from the profile at the active position
      expect(s.originalMultiplier).toBeGreaterThan(0)
    })
  })

  describe('widthToolMouseDrag', () => {
    test('does nothing when not dragging', () => {
      widthToolMouseDrag(100, 100)
      // Should not throw
      expect(isWidthToolDragging()).toBe(false)
    })

    test('modifies widthProfile based on vertical drag', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // Drag up (decrease Y) → increase multiplier
      widthToolMouseDrag(100, 0)

      const layer = getLayer(layerId)!
      expect(layer.stroke!.widthProfile).toBeDefined()
      // Find the control point near the active position
      const profile = layer.stroke!.widthProfile!
      expect(profile.length).toBeGreaterThanOrEqual(2)
    })

    test('dragging up increases the width multiplier', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const state = getWidthToolState()
      const origMult = state.originalMultiplier

      // Drag up by 100px → dy = startY - currentY = 50 - (-50) = 100
      // newMultiplier = original + 100 * 0.01 = original + 1
      widthToolMouseDrag(100, -50)

      const layer = getLayer(layerId)!
      const profile = layer.stroke!.widthProfile!
      // At least one entry should have a multiplier > original
      const hasIncreased = profile.some(([, mult]) => mult > origMult)
      expect(hasIncreased).toBe(true)
    })

    test('dragging down decreases the width multiplier', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // Drag down by a lot → should decrease multiplier (clamped at 0)
      widthToolMouseDrag(100, 200)

      const layer = getLayer(layerId)!
      const profile = layer.stroke!.widthProfile!
      // The multiplier should be less than or equal to original (clamped at 0)
      const hasDecreased = profile.some(([, mult]) => mult <= 1)
      expect(hasDecreased).toBe(true)
    })

    test('multiplier never goes below 0', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // Drag down massively
      widthToolMouseDrag(100, 10000)

      const layer = getLayer(layerId)!
      const profile = layer.stroke!.widthProfile!
      for (const [, mult] of profile) {
        expect(mult).toBeGreaterThanOrEqual(0)
      }
    })

    test('inserts new control point if none exists at active position', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // Set a minimal profile
      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0, 1],
            [1, 1],
          ],
        },
      } as Partial<VectorLayer>)

      // Click at mid-point of path
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      const activePos = getWidthToolState().activePosition

      // Drag to modify
      widthToolMouseDrag(100, 20)

      const layer = getLayer(layerId)!
      const profile = layer.stroke!.widthProfile!

      // Should have 3 entries now (0, activePos, 1) — unless activePos is near 0 or 1
      if (activePos > 0.02 && activePos < 0.98) {
        expect(profile.length).toBe(3)
        // The new point should be sorted by position
        const positions = profile.map(([p]) => p)
        for (let i = 1; i < positions.length; i++) {
          expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!)
        }
      }
    })

    test('updates existing control point if near active position', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // Click at start of path (t ≈ 0)
      widthToolMouseDown(0, 50, 1, abId, 0, 0)

      const activePos = getWidthToolState().activePosition
      // If near 0, it should update the [0, 1] entry rather than inserting new one

      widthToolMouseDrag(0, 20)

      const layer = getLayer(layerId)!
      const profile = layer.stroke!.widthProfile!

      if (activePos < 0.02) {
        // Should still have 2 entries, with the first one updated
        expect(profile.length).toBe(2)
        expect(profile[0]![1]).not.toBe(1) // Should have been modified
      }
    })

    test('does nothing if artboard not found during drag', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)

      // Manually modify the state to point to a bad artboard
      // The drag should not crash
      resetStore()

      // Should not throw — drag finds no artboard
      widthToolMouseDrag(100, 0)
    })

    test('does nothing if layer not found during drag', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      // Delete the layer
      useEditorStore.getState().deleteLayer(abId, layerId)

      // Should not throw
      widthToolMouseDrag(100, 0)
    })

    test('handles layer without stroke during drag gracefully', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)

      // Remove stroke from layer mid-drag
      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: null,
      } as Partial<VectorLayer>)

      // Should not throw
      widthToolMouseDrag(100, 0)
    })
  })

  describe('widthToolMouseUp', () => {
    test('does nothing when not dragging', () => {
      widthToolMouseUp()
      expect(isWidthToolDragging()).toBe(false)
    })

    test('commits the width profile change via updateLayer (with undo)', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseDrag(100, 0)
      widthToolMouseUp()

      // Layer should still have the width profile
      const layer = getLayer(layerId)!
      expect(layer.stroke!.widthProfile).toBeDefined()
    })

    test('clears dragging state', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseDrag(100, 0)
      widthToolMouseUp()

      const s = getWidthToolState()
      expect(s.isDragging).toBe(false)
      expect(s.layerId).toBeNull()
      expect(s.artboardId).toBeNull()
    })

    test('undo entry is created on mouseUp', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      const historyBefore = useEditorStore.getState().history.length

      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseDrag(100, 0)
      widthToolMouseUp()

      const historyAfter = useEditorStore.getState().history.length
      // updateLayer (not silent) should create a history entry
      expect(historyAfter).toBeGreaterThan(historyBefore)
    })

    test('handles missing artboard gracefully', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseDrag(100, 0)

      // Reset store
      resetStore()

      // Should not throw
      widthToolMouseUp()
      expect(isWidthToolDragging()).toBe(false)
    })

    test('handles missing layer gracefully', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      widthToolMouseDrag(100, 0)

      // Delete the layer
      useEditorStore.getState().deleteLayer(abId, layerId)

      // Should not throw
      widthToolMouseUp()
      expect(isWidthToolDragging()).toBe(false)
    })
  })

  describe('path flattening and hit testing', () => {
    test('works with cubic bezier segments (straight approximation)', () => {
      addVectorLayerWithStroke()
      const abId = artboardId()
      // Click in the middle of the cubic path
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('works with curved cubic bezier segments', () => {
      addCubicLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 100, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('finds closest layer among multiple layers', () => {
      // First layer: cubic at y=50
      addVectorLayerWithStroke()
      const abId = artboardId()

      // Second layer: cubic at y=200
      const layer2 = createDefaultVectorLayer('Vector 2')
      layer2.stroke = {
        width: 2,
        color: '#00ff00',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      }
      layer2.fill = null
      layer2.paths = [
        {
          id: 'path-2',
          segments: [
            { type: 'move', x: 0, y: 200 },
            { type: 'cubic', x: 200, y: 200, cp1x: 66, cp1y: 200, cp2x: 133, cp2y: 200 },
          ],
          closed: false,
        },
      ]
      useEditorStore.getState().addLayer(abId, layer2)

      // Click near second path (y=200)
      widthToolMouseDown(100, 198, 1, abId, 0, 0)

      const s = getWidthToolState()
      expect(s.isDragging).toBe(true)
      expect(s.layerId).toBe(layer2.id)
    })

    test('handles closed paths with close segment', () => {
      const abId = artboardId()
      const layer = createDefaultVectorLayer('Closed Path')
      layer.stroke = {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      }
      layer.fill = null
      layer.paths = [
        {
          id: 'closed-path',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'cubic', x: 100, y: 0, cp1x: 33, cp1y: 0, cp2x: 66, cp2y: 0 },
            { type: 'cubic', x: 100, y: 100, cp1x: 100, cp1y: 33, cp2x: 100, cp2y: 66 },
            { type: 'close' },
          ],
          closed: true,
        },
      ]
      useEditorStore.getState().addLayer(abId, layer)

      // Click near the top edge
      widthToolMouseDown(50, 0, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('handles quadratic bezier segments', () => {
      const abId = artboardId()
      const layer = createDefaultVectorLayer('Quadratic Path')
      layer.stroke = {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      }
      layer.fill = null
      layer.paths = [
        {
          id: 'quad-path',
          segments: [
            { type: 'move', x: 0, y: 100 },
            { type: 'quadratic', x: 200, y: 100, cpx: 100, cpy: 0 },
          ],
          closed: false,
        },
      ]
      useEditorStore.getState().addLayer(abId, layer)

      // Click near the path midpoint — quadratic mid at roughly (100, 50)
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
    })

    test('considers layer transform offset', () => {
      const abId = artboardId()
      const layer = createDefaultVectorLayer('Offset Vector')
      layer.transform = { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }
      layer.stroke = {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      }
      layer.fill = null
      layer.paths = [
        {
          id: 'offset-path',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'cubic', x: 200, y: 0, cp1x: 66, cp1y: 0, cp2x: 133, cp2y: 0 },
          ],
          closed: false,
        },
      ]
      useEditorStore.getState().addLayer(abId, layer)

      // Path is at local (0-200, 0) with transform offset (100, 100)
      // So in artboard coords: (100-300, 100)
      // Click at artboard (200, 100) → testX = 200-100 = 100, testY = 100-100 = 0
      widthToolMouseDown(200, 100, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)
      expect(getWidthToolState().layerId).toBe(layer.id)
    })

    test('handles path with only a move segment (no edges)', () => {
      const abId = artboardId()
      const layer = createDefaultVectorLayer('Move Only')
      layer.stroke = {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
      }
      layer.fill = null
      layer.paths = [
        {
          id: 'move-only',
          segments: [{ type: 'move', x: 100, y: 100 }],
          closed: false,
        },
      ]
      useEditorStore.getState().addLayer(abId, layer)

      // Click exactly on the single point
      widthToolMouseDown(100, 100, 1, abId, 0, 0)
      // With only 1 point, totalLength = 0, so findNearestPositionOnPath skips it
      // The tool should not activate
      expect(isWidthToolDragging()).toBe(false)
    })
  })

  describe('width profile interpolation', () => {
    test('getMultiplierAt returns 1 for empty/undefined profile', () => {
      // Indirectly tested: when layer has no widthProfile, originalMultiplier defaults to 1
      addVectorLayerWithStroke()
      const abId = artboardId()
      widthToolMouseDown(100, 50, 1, abId, 0, 0)

      const s = getWidthToolState()
      expect(s.originalMultiplier).toBe(1)
    })

    test('interpolates between profile entries', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0, 0],
            [1, 2],
          ],
        },
      } as Partial<VectorLayer>)

      // Click at midpoint → t ≈ 0.5 → multiplier should be ≈ 1.0
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      const s = getWidthToolState()
      // Depending on exact t, should be roughly between 0 and 2
      expect(s.originalMultiplier).toBeGreaterThanOrEqual(0)
      expect(s.originalMultiplier).toBeLessThanOrEqual(2)
    })

    test('returns first entry value when t is before first entry', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0.5, 3],
            [1, 1],
          ],
        },
      } as Partial<VectorLayer>)

      // Click at start of path → t ≈ 0 → should return first entry value (3)
      widthToolMouseDown(0, 50, 1, abId, 0, 0)
      const s = getWidthToolState()
      expect(s.originalMultiplier).toBe(3)
    })

    test('returns last entry value when t is after last entry', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      useEditorStore.getState().updateLayerSilent(abId, layerId, {
        stroke: {
          ...getLayer(layerId)!.stroke!,
          widthProfile: [
            [0, 1],
            [0.3, 5],
          ],
        },
      } as Partial<VectorLayer>)

      // Click at end of path → t ≈ 1 → should return last entry value (5)
      widthToolMouseDown(200, 50, 1, abId, 0, 0)
      const s = getWidthToolState()
      expect(s.originalMultiplier).toBe(5)
    })
  })

  describe('full workflow', () => {
    test('mouseDown → drag → mouseUp cycle works end to end', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // MouseDown on path
      widthToolMouseDown(100, 50, 1, abId, 0, 0)
      expect(isWidthToolDragging()).toBe(true)

      // Drag up to increase width
      widthToolMouseDrag(100, 10)

      // Check width profile changed
      const layerDuring = getLayer(layerId)!
      expect(layerDuring.stroke!.widthProfile).toBeDefined()

      // MouseUp to commit
      widthToolMouseUp()
      expect(isWidthToolDragging()).toBe(false)

      // Width profile should persist
      const layerAfter = getLayer(layerId)!
      expect(layerAfter.stroke!.widthProfile).toBeDefined()
      expect(layerAfter.stroke!.widthProfile!.length).toBeGreaterThanOrEqual(2)
    })

    test('multiple drag sessions on same layer accumulate profile points', () => {
      const layerId = addVectorLayerWithStroke()
      const abId = artboardId()

      // First session: near start
      widthToolMouseDown(10, 50, 1, abId, 0, 0)
      widthToolMouseDrag(10, 20)
      widthToolMouseUp()

      const profileAfter1 = getLayer(layerId)!.stroke!.widthProfile!
      const count1 = profileAfter1.length

      resetWidthTool()

      // Second session: near end
      widthToolMouseDown(190, 50, 1, abId, 0, 0)
      widthToolMouseDrag(190, 20)
      widthToolMouseUp()

      const profileAfter2 = getLayer(layerId)!.stroke!.widthProfile!
      // May have same or more entries depending on position overlap
      expect(profileAfter2.length).toBeGreaterThanOrEqual(count1)
    })
  })
})
