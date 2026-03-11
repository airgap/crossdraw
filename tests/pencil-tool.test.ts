import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { beginPencilStroke, updatePencilStroke, endPencilStroke, isPencilDrawing } from '@/tools/pencil'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

// ── Tests ──

describe('Pencil Tool', () => {
  beforeEach(() => {
    resetStore()
    // End any active stroke from previous tests
    endPencilStroke()
  })

  describe('isPencilDrawing', () => {
    test('returns false initially', () => {
      expect(isPencilDrawing()).toBe(false)
    })

    test('returns true after beginPencilStroke', () => {
      beginPencilStroke(10, 20, artboardId())
      expect(isPencilDrawing()).toBe(true)
    })

    test('returns false after endPencilStroke', () => {
      beginPencilStroke(10, 20, artboardId())
      expect(isPencilDrawing()).toBe(true)
      endPencilStroke()
      expect(isPencilDrawing()).toBe(false)
    })
  })

  describe('beginPencilStroke', () => {
    test('initializes stroke state', () => {
      beginPencilStroke(50, 60, artboardId())
      expect(isPencilDrawing()).toBe(true)
    })
  })

  describe('updatePencilStroke', () => {
    test('does nothing when not active', () => {
      const layerCount = useEditorStore.getState().document.artboards[0]!.layers.length
      updatePencilStroke(100, 100)
      expect(useEditorStore.getState().document.artboards[0]!.layers.length).toBe(layerCount)
    })

    test('creates a new layer on first update', () => {
      const initialLayerCount = useEditorStore.getState().document.artboards[0]!.layers.length

      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)

      const artboard = useEditorStore.getState().document.artboards[0]!
      expect(artboard.layers.length).toBe(initialLayerCount + 1)

      const newLayer = artboard.layers[artboard.layers.length - 1]!
      expect(newLayer.type).toBe('vector')
      expect(newLayer.name).toContain('Pencil')
    })

    test('creates layer with stroke and no fill', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        expect(layer.stroke).not.toBeNull()
        expect(layer.stroke!.width).toBe(2)
        expect(layer.fill).toBeNull()
      }
    })

    test('updates the same layer on subsequent points', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)
      const layerCount1 = useEditorStore.getState().document.artboards[0]!.layers.length

      updatePencilStroke(50, 60)
      const layerCount2 = useEditorStore.getState().document.artboards[0]!.layers.length

      // Should not add more layers
      expect(layerCount2).toBe(layerCount1)
    })

    test('builds segments from accumulated points', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)
      updatePencilStroke(50, 60)
      updatePencilStroke(70, 80)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const path = layer.paths[0]!
        // Should have move + 3 line segments (4 total: initial point + 3 updates)
        expect(path.segments.length).toBeGreaterThanOrEqual(3)
        expect(path.segments[0]!.type).toBe('move')
      }
    })

    test('selects the created layer', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds.length).toBe(1)
    })
  })

  describe('endPencilStroke', () => {
    test('does nothing when not active', () => {
      endPencilStroke()
      expect(isPencilDrawing()).toBe(false)
    })

    test('simplifies path with curves when enough points', () => {
      beginPencilStroke(10, 20, artboardId())
      // Add enough points for simplification (more than 2)
      updatePencilStroke(15, 25)
      updatePencilStroke(20, 30)
      updatePencilStroke(25, 35)
      updatePencilStroke(30, 45)
      updatePencilStroke(40, 55)
      updatePencilStroke(50, 70)

      endPencilStroke()
      expect(isPencilDrawing()).toBe(false)

      // The path should now contain cubic segments from curve fitting
      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers[artboard.layers.length - 1]!
      if (layer.type === 'vector') {
        const path = layer.paths[0]!
        // First segment should be move
        expect(path.segments[0]!.type).toBe('move')
        // At least one cubic segment should exist
        const hasCubic = path.segments.some((s) => s.type === 'cubic')
        expect(hasCubic).toBe(true)
      }
    })

    test('resets state after ending', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)
      endPencilStroke()

      expect(isPencilDrawing()).toBe(false)
    })

    test('keeps simple path with 2 or fewer points', () => {
      beginPencilStroke(10, 20, artboardId())
      updatePencilStroke(30, 40)
      // Only 2 points: start + one update. endPencilStroke won't simplify
      endPencilStroke()

      expect(isPencilDrawing()).toBe(false)
    })
  })

  describe('multiple strokes', () => {
    test('can draw multiple independent strokes', () => {
      // First stroke
      beginPencilStroke(10, 10, artboardId())
      updatePencilStroke(20, 20)
      updatePencilStroke(30, 30)
      endPencilStroke()

      const layerCount1 = useEditorStore.getState().document.artboards[0]!.layers.length

      // Second stroke
      beginPencilStroke(50, 50, artboardId())
      updatePencilStroke(60, 60)
      updatePencilStroke(70, 70)
      endPencilStroke()

      const layerCount2 = useEditorStore.getState().document.artboards[0]!.layers.length
      expect(layerCount2).toBe(layerCount1 + 1)
    })
  })
})
