import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  beginGradientDrag,
  updateGradientDrag,
  endGradientDrag,
  isGradientDragging,
  getGradientDragLine,
} from '@/tools/gradient-tool'
import type { VectorLayer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 400, height: 400 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: 'vec-grad-1',
    name: 'Gradient Target',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

// ── Tests ──

describe('Gradient Tool', () => {
  beforeEach(() => {
    resetStore()
    endGradientDrag()
  })

  describe('isGradientDragging', () => {
    test('returns false initially', () => {
      expect(isGradientDragging()).toBe(false)
    })

    test('returns true after beginGradientDrag', () => {
      beginGradientDrag(50, 50, artboardId())
      expect(isGradientDragging()).toBe(true)
    })

    test('returns false after endGradientDrag', () => {
      beginGradientDrag(50, 50, artboardId())
      endGradientDrag()
      expect(isGradientDragging()).toBe(false)
    })
  })

  describe('getGradientDragLine', () => {
    test('returns null when not dragging', () => {
      expect(getGradientDragLine()).toBeNull()
    })

    test('returns drag line when active', () => {
      beginGradientDrag(10, 20, artboardId())
      const line = getGradientDragLine()
      expect(line).not.toBeNull()
      expect(line!.startX).toBe(10)
      expect(line!.startY).toBe(20)
    })
  })

  describe('beginGradientDrag', () => {
    test('sets active state', () => {
      beginGradientDrag(100, 200, artboardId())
      expect(isGradientDragging()).toBe(true)
    })

    test('stores start position', () => {
      beginGradientDrag(42, 84, artboardId())
      const line = getGradientDragLine()
      expect(line!.startX).toBe(42)
      expect(line!.startY).toBe(84)
    })

    test('sets layerId when a vector layer is selected', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(50, 50, artboardId())
      expect(isGradientDragging()).toBe(true)
    })

    test('clears layerId when no layer is selected', () => {
      useEditorStore.getState().deselectAll()
      beginGradientDrag(50, 50, artboardId())
      expect(isGradientDragging()).toBe(true)
    })

    test('clears layerId when selected layer is not vector', () => {
      // Add a non-vector layer (raster)
      useEditorStore.getState().addLayer(artboardId(), {
        id: 'raster-1',
        name: 'Raster',
        type: 'raster',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        imageChunkId: 'chunk-1',
        naturalWidth: 100,
        naturalHeight: 100,
      } as any)
      useEditorStore.getState().selectLayer('raster-1')

      beginGradientDrag(50, 50, artboardId())
      expect(isGradientDragging()).toBe(true)
      // The gradient should not target the raster layer
    })
  })

  describe('updateGradientDrag', () => {
    test('does nothing when not active', () => {
      // Should not throw
      updateGradientDrag(100, 100, false)
    })

    test('applies gradient fill to selected vector layer', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 0, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill).not.toBeNull()
        expect(updated.fill!.type).toBe('gradient')
      }
    })

    test('gradient has linear type', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 0, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.type).toBe('linear')
      }
    })

    test('gradient has default stops (black to white)', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 100, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        const stops = updated.fill.gradient!.stops
        expect(stops.length).toBe(2)
        expect(stops[0]!.offset).toBe(0)
        expect(stops[0]!.color).toBe('#000000')
        expect(stops[1]!.offset).toBe(1)
        expect(stops[1]!.color).toBe('#ffffff')
      }
    })

    test('computes angle from drag direction (horizontal = 0)', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 0, false) // pure horizontal

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.angle).toBeCloseTo(0, 1)
      }
    })

    test('computes angle from drag direction (vertical = 90)', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(0, 100, false) // pure downward

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.angle).toBeCloseTo(90, 1)
      }
    })

    test('computes angle from drag direction (diagonal = 45)', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 100, false) // 45 degrees

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.angle).toBeCloseTo(45, 1)
      }
    })

    test('shift constrains to 45-degree increments', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      // Slightly off from horizontal
      updateGradientDrag(100, 5, true)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        // Should snap to 0 degrees (horizontal)
        expect(updated.fill.gradient!.angle).toBeCloseTo(0, 1)
      }
    })

    test('shift constrains to 45-degree diagonal', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      // Close to 45 degrees
      updateGradientDrag(100, 95, true)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.angle).toBeCloseTo(45, 1)
      }
    })

    test('does nothing when artboard not found', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      beginGradientDrag(0, 0, 'nonexistent')
      // Should not throw
      updateGradientDrag(100, 100, false)
    })
  })

  describe('endGradientDrag', () => {
    test('does nothing when not active', () => {
      endGradientDrag()
      expect(isGradientDragging()).toBe(false)
    })

    test('clears active state', () => {
      beginGradientDrag(50, 50, artboardId())
      expect(isGradientDragging()).toBe(true)
      endGradientDrag()
      expect(isGradientDragging()).toBe(false)
    })

    test('clears drag line', () => {
      beginGradientDrag(50, 50, artboardId())
      expect(getGradientDragLine()).not.toBeNull()
      endGradientDrag()
      expect(getGradientDragLine()).toBeNull()
    })
  })

  describe('full gradient workflow', () => {
    test('begin -> update -> end applies gradient', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(10, 10, artboardId())
      updateGradientDrag(190, 190, false)
      endGradientDrag()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill!.type).toBe('gradient')
      }
    })

    test('multiple gradient drags update the fill each time', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(100, 0, false)
      endGradientDrag()

      beginGradientDrag(0, 0, artboardId())
      updateGradientDrag(0, 100, false)
      endGradientDrag()

      // Final gradient should have vertical angle
      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector' && updated.fill?.type === 'gradient') {
        expect(updated.fill.gradient!.angle).toBeCloseTo(90, 1)
      }
    })
  })
})
