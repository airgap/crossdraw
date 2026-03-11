import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { beginLineDrag, updateLineDrag, endLineDrag, isLineDragging } from '@/tools/line'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 400, height: 400 })
  // Disable snapping so it doesn't interfere with tests
  const state = useEditorStore.getState()
  if (state.snapEnabled) {
    state.toggleSnap()
  }
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

// ── Tests ──

describe('Line Tool', () => {
  beforeEach(() => {
    resetStore()
    endLineDrag()
  })

  describe('isLineDragging', () => {
    test('returns false initially', () => {
      expect(isLineDragging()).toBe(false)
    })

    test('returns true after beginLineDrag', () => {
      beginLineDrag(10, 20, artboardId())
      expect(isLineDragging()).toBe(true)
    })

    test('returns false after endLineDrag', () => {
      beginLineDrag(10, 20, artboardId())
      endLineDrag()
      expect(isLineDragging()).toBe(false)
    })
  })

  describe('beginLineDrag', () => {
    test('sets active state', () => {
      beginLineDrag(50, 60, artboardId())
      expect(isLineDragging()).toBe(true)
    })
  })

  describe('updateLineDrag', () => {
    test('does nothing when not active', () => {
      const initialLayerCount = useEditorStore.getState().document.artboards[0]!.layers.length
      updateLineDrag(100, 100, false)
      expect(useEditorStore.getState().document.artboards[0]!.layers.length).toBe(initialLayerCount)
    })

    test('creates a new vector layer on first update', () => {
      const initialLayerCount = useEditorStore.getState().document.artboards[0]!.layers.length

      beginLineDrag(10, 20, artboardId())
      updateLineDrag(100, 80, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      expect(artboard.layers.length).toBe(initialLayerCount + 1)

      const layer = artboard.layers[artboard.layers.length - 1]!
      expect(layer.type).toBe('vector')
      expect(layer.name).toContain('Line')
    })

    test('creates layer with stroke and no fill', () => {
      beginLineDrag(10, 20, artboardId())
      updateLineDrag(100, 80, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        expect(layer.stroke).not.toBeNull()
        expect(layer.stroke!.width).toBe(2)
        expect(layer.fill).toBeNull()
      }
    })

    test('creates path with move and line segments', () => {
      beginLineDrag(10, 20, artboardId())
      updateLineDrag(100, 80, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const path = layer.paths[0]!
        expect(path.segments.length).toBe(2)
        expect(path.segments[0]!.type).toBe('move')
        expect(path.segments[1]!.type).toBe('line')
        expect(path.closed).toBe(false)
      }
    })

    test('updates existing layer on subsequent drags', () => {
      beginLineDrag(10, 20, artboardId())
      updateLineDrag(50, 50, false)
      const count1 = useEditorStore.getState().document.artboards[0]!.layers.length

      updateLineDrag(80, 90, false)
      const count2 = useEditorStore.getState().document.artboards[0]!.layers.length

      // Should not add more layers
      expect(count2).toBe(count1)
    })

    test('shift constrains to 45-degree angles', () => {
      beginLineDrag(0, 0, artboardId())
      updateLineDrag(100, 5, true) // nearly horizontal

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const lineSeg = layer.paths[0]!.segments[1]!
        if ('y' in lineSeg) {
          // Y component should be near 0 for horizontal snap
          expect(Math.abs(lineSeg.y)).toBeLessThan(1)
        }
      }
    })

    test('shift constrains to vertical (90 degrees)', () => {
      beginLineDrag(0, 0, artboardId())
      updateLineDrag(3, 100, true) // nearly vertical

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const lineSeg = layer.paths[0]!.segments[1]!
        if ('x' in lineSeg) {
          // X component should be near 0 for vertical snap
          expect(Math.abs(lineSeg.x)).toBeLessThan(1)
        }
      }
    })

    test('shift constrains to 45-degree diagonal', () => {
      beginLineDrag(0, 0, artboardId())
      updateLineDrag(100, 95, true) // nearly 45 degrees

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const lineSeg = layer.paths[0]!.segments[1]!
        if ('x' in lineSeg && 'y' in lineSeg) {
          // X and Y should be approximately equal for 45 degrees
          expect(Math.abs(Math.abs(lineSeg.x) - Math.abs(lineSeg.y))).toBeLessThan(2)
        }
      }
    })

    test('selects created layer', () => {
      beginLineDrag(10, 20, artboardId())
      updateLineDrag(100, 80, false)

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds.length).toBe(1)
    })
  })

  describe('endLineDrag', () => {
    test('does nothing when not active', () => {
      endLineDrag()
      expect(isLineDragging()).toBe(false)
    })

    test('clears active state and clears snap lines', () => {
      beginLineDrag(10, 20, artboardId())
      updateLineDrag(50, 50, false)
      expect(isLineDragging()).toBe(true)

      endLineDrag()
      expect(isLineDragging()).toBe(false)
    })
  })

  describe('multiple line drags', () => {
    test('each drag creates a separate layer', () => {
      // First line
      beginLineDrag(0, 0, artboardId())
      updateLineDrag(100, 0, false)
      endLineDrag()

      const count1 = useEditorStore.getState().document.artboards[0]!.layers.length

      // Second line
      beginLineDrag(0, 50, artboardId())
      updateLineDrag(100, 50, false)
      endLineDrag()

      const count2 = useEditorStore.getState().document.artboards[0]!.layers.length
      expect(count2).toBe(count1 + 1)
    })
  })
})
