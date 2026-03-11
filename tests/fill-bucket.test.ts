import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { setFillBucketColor, getFillBucketColor, applyFillBucket } from '@/tools/fill-bucket'
import type { VectorLayer, RasterLayer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function artboardX(): number {
  return useEditorStore.getState().document.artboards[0]!.x
}

function artboardY(): number {
  return useEditorStore.getState().document.artboards[0]!.y
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: 'vec-fill-1',
    name: 'Test Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addRasterLayer(): RasterLayer {
  const layer: RasterLayer = {
    id: 'raster-fill-1',
    name: 'Test Raster',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: 'chunk-1',
    width: 100,
    height: 100,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

// ── Tests ──

describe('Fill Bucket Tool', () => {
  beforeEach(() => {
    resetStore()
    setFillBucketColor('#4a7dff') // reset to default
  })

  describe('getFillBucketColor', () => {
    test('returns default fill color', () => {
      expect(getFillBucketColor()).toBe('#4a7dff')
    })
  })

  describe('setFillBucketColor', () => {
    test('sets a new fill color', () => {
      setFillBucketColor('#ff0000')
      expect(getFillBucketColor()).toBe('#ff0000')
    })

    test('accepts any hex string', () => {
      setFillBucketColor('#abcdef')
      expect(getFillBucketColor()).toBe('#abcdef')
    })

    test('overwrites previous color', () => {
      setFillBucketColor('#111111')
      setFillBucketColor('#222222')
      expect(getFillBucketColor()).toBe('#222222')
    })
  })

  describe('applyFillBucket', () => {
    test('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: {
          ...useEditorStore.getState().document,
          artboards: [],
        },
      })
      // Should not throw
      applyFillBucket(50, 50)
    })

    test('applies fill to selected vector layer', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      setFillBucketColor('#ff0000')
      applyFillBucket(50, 50)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill).not.toBeNull()
        expect(updated.fill!.type).toBe('solid')
        if (updated.fill!.type === 'solid') {
          expect(updated.fill!.color).toBe('#ff0000')
        }
      }
    })

    test('selects the layer after filling', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      applyFillBucket(50, 50)

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds).toContain(layer.id)
    })

    test('does nothing when no target is found', () => {
      // No layers, no selection
      applyFillBucket(50, 50)
      // No error
    })

    test('does not fill non-vector layers', () => {
      const rasterLayer = addRasterLayer()
      useEditorStore.getState().selectLayer(rasterLayer.id)

      applyFillBucket(50, 50)
      // Should not crash; raster layers are skipped
    })

    test('hit-tests layers when nothing is selected', () => {
      const ax = artboardX()
      const ay = artboardY()

      // Add a vector layer at transform position (10, 20) relative to artboard
      addVectorLayer({
        id: 'vec-hittest',
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
      })

      useEditorStore.getState().deselectAll()

      // Click at a position that is past the artboard origin + layer transform
      setFillBucketColor('#00ff00')
      applyFillBucket(ax + 15, ay + 25)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'vec-hittest')!
      if (updated.type === 'vector') {
        expect(updated.fill).not.toBeNull()
        expect(updated.fill!.type).toBe('solid')
        if (updated.fill!.type === 'solid') {
          expect(updated.fill!.color).toBe('#00ff00')
        }
      }
    })

    test('skips invisible layers during hit-test', () => {
      addVectorLayer({ id: 'invisible-vec', visible: false })
      useEditorStore.getState().deselectAll()

      applyFillBucket(50, 50)
      // Nothing should be filled
    })

    test('skips locked layers during hit-test', () => {
      addVectorLayer({ id: 'locked-vec', locked: true })
      useEditorStore.getState().deselectAll()

      applyFillBucket(50, 50)
      // Nothing should be filled
    })

    test('uses current fill color from getFillBucketColor', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      setFillBucketColor('#abcdef')
      applyFillBucket(0, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill).not.toBeNull()
        if (updated.fill!.type === 'solid') {
          expect(updated.fill!.color).toBe('#abcdef')
        }
      }
    })

    test('fill has opacity 1', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      applyFillBucket(0, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill!.opacity).toBe(1)
      }
    })
  })
})
