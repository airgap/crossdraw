import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { makeClippingMask, releaseClippingMask } from '@/tools/clipping-mask'
import type { VectorLayer, TextLayer, RasterLayer, Layer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function artboardLayers(): Layer[] {
  return useEditorStore.getState().document.artboards[0]!.layers
}

function selection(): string[] {
  return useEditorStore.getState().selection.layerIds
}

let counter = 0
function uid(): string {
  return `cm-${++counter}`
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: uid(),
    name: 'Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: uid(),
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
          { type: 'line', x: 100, y: 100 },
          { type: 'close' },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: {
      width: 2,
      color: '#000000',
      opacity: 1,
      position: 'center',
      linecap: 'butt',
      linejoin: 'miter',
      miterLimit: 10,
    },
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  const layer: TextLayer = {
    id: uid(),
    name: 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addRasterLayer(overrides: Partial<RasterLayer> = {}): RasterLayer {
  const layer: RasterLayer = {
    id: uid(),
    name: 'Raster',
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
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

// ── makeClippingMask tests ──

describe('makeClippingMask', () => {
  beforeEach(resetStore)

  it('uses the topmost selected vector layer as a mask on the layer below', () => {
    // bottom layer (index 0) - the one to be masked
    const bottomLayer = addRasterLayer({ name: 'Photo' })
    // top layer (index 1) - becomes the mask
    const topLayer = addVectorLayer({ name: 'MaskShape' })

    useEditorStore.getState().selectLayer(bottomLayer.id)
    useEditorStore.getState().selectLayer(topLayer.id, true)

    makeClippingMask()

    const layers = artboardLayers()
    // Top layer should be removed
    expect(layers.find((l) => l.id === topLayer.id)).toBeUndefined()
    // Bottom layer should now have a mask
    const masked = layers.find((l) => l.id === bottomLayer.id)
    expect(masked).toBeDefined()
    expect(masked!.mask).toBeDefined()
    expect(masked!.mask!.type).toBe('vector')
  })

  it('names the mask layer with (Mask) suffix', () => {
    const bottom = addVectorLayer({ name: 'Content' })
    const top = addVectorLayer({ name: 'ClipShape' })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    expect(masked!.mask!.name).toBe('ClipShape (Mask)')
  })

  it('copies path data from the top layer into the mask', () => {
    const bottom = addVectorLayer({ name: 'Bottom' })
    const topPaths = [
      {
        id: uid(),
        segments: [
          { type: 'move' as const, x: 5, y: 5 },
          { type: 'line' as const, x: 50, y: 5 },
          { type: 'line' as const, x: 50, y: 50 },
          { type: 'close' as const },
        ],
        closed: true,
      },
    ]
    const top = addVectorLayer({ name: 'Mask', paths: topPaths })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    const maskVec = masked!.mask as VectorLayer
    expect(maskVec.paths.length).toBe(1)
    // Path data should match (segments content)
    expect(maskVec.paths[0]!.segments.length).toBe(topPaths[0]!.segments.length)
  })

  it('mask paths get new IDs (not same as original)', () => {
    const bottom = addVectorLayer()
    const originalPathId = uid()
    const top = addVectorLayer({
      paths: [
        {
          id: originalPathId,
          segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 10, y: 10 }, { type: 'close' }],
          closed: true,
        },
      ],
    })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    const maskVec = masked!.mask as VectorLayer
    expect(maskVec.paths[0]!.id).not.toBe(originalPathId)
  })

  it('mask layer has null stroke and opacity 1', () => {
    const bottom = addVectorLayer()
    const top = addVectorLayer({
      stroke: {
        width: 5,
        color: '#ff0000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      },
      opacity: 0.5,
    })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    const maskVec = masked!.mask as VectorLayer
    expect(maskVec.stroke).toBeNull()
    expect(maskVec.opacity).toBe(1)
  })

  it('preserves fill from the mask source', () => {
    const bottom = addVectorLayer()
    const top = addVectorLayer({
      fill: { type: 'solid', color: '#00ff00', opacity: 0.9 },
    })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    const maskVec = masked!.mask as VectorLayer
    expect(maskVec.fill!.color).toBe('#00ff00')
  })

  it('copies transform from the top layer', () => {
    const bottom = addVectorLayer()
    const top = addVectorLayer({
      transform: { x: 50, y: 30, scaleX: 2, scaleY: 2, rotation: 45 },
    })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const masked = artboardLayers().find((l) => l.id === bottom.id)
    const maskVec = masked!.mask as VectorLayer
    expect(maskVec.transform.x).toBe(50)
    expect(maskVec.transform.y).toBe(30)
    expect(maskVec.transform.rotation).toBe(45)
  })

  it('selects the masked layer after creation', () => {
    const bottom = addVectorLayer()
    const top = addVectorLayer()

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    const sel = selection()
    expect(sel.length).toBe(1)
    expect(sel[0]).toBe(bottom.id)
  })

  it('reduces layer count by one (top layer removed)', () => {
    addVectorLayer({ name: 'Bystander' })
    const bottom = addVectorLayer({ name: 'Bottom' })
    const top = addVectorLayer({ name: 'Top' })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()

    expect(artboardLayers().length).toBe(2) // bystander + masked bottom
  })

  it('with 3 selected, uses the topmost as mask and the second-topmost as target', () => {
    const layer1 = addVectorLayer({ name: 'Layer1' })
    const layer2 = addVectorLayer({ name: 'Layer2' })
    const layer3 = addVectorLayer({ name: 'MaskTop' })

    useEditorStore.getState().selectLayer(layer1.id)
    useEditorStore.getState().selectLayer(layer2.id, true)
    useEditorStore.getState().selectLayer(layer3.id, true)

    makeClippingMask()

    // layer3 (topmost) is the mask, applied to layer2 (second topmost)
    const layers = artboardLayers()
    expect(layers.find((l) => l.id === layer3.id)).toBeUndefined()
    const maskedLayer = layers.find((l) => l.id === layer2.id)
    expect(maskedLayer).toBeDefined()
    expect(maskedLayer!.mask).toBeDefined()
    expect(maskedLayer!.mask!.name).toBe('MaskTop (Mask)')
    // layer1 is unaffected
    expect(layers.find((l) => l.id === layer1.id)).toBeDefined()
  })

  describe('edge cases', () => {
    it('does nothing with no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      makeClippingMask()
      // Should not throw
    })

    it('does nothing with no selection', () => {
      addVectorLayer()
      addVectorLayer()
      useEditorStore.getState().deselectAll()
      makeClippingMask()

      expect(artboardLayers().length).toBe(2)
    })

    it('does nothing with only one layer selected', () => {
      const v1 = addVectorLayer()
      useEditorStore.getState().selectLayer(v1.id)
      makeClippingMask()

      expect(artboardLayers().length).toBe(1)
      expect(artboardLayers()[0]!.mask).toBeUndefined()
    })

    it('does nothing when topmost selected layer is not a vector', () => {
      const bottom = addVectorLayer({ name: 'Bottom' })
      const topText = addTextLayer({ name: 'TopText' })

      useEditorStore.getState().selectLayer(bottom.id)
      useEditorStore.getState().selectLayer(topText.id, true)

      makeClippingMask()

      // No mask applied
      expect(artboardLayers().length).toBe(2)
      const bottomFound = artboardLayers().find((l) => l.id === bottom.id)
      expect(bottomFound!.mask).toBeUndefined()
    })

    it('does nothing when only one selected layer is on the artboard', () => {
      const v1 = addVectorLayer()
      // Set selection to include v1 and a nonexistent layer
      useEditorStore.setState({ selection: { layerIds: [v1.id, 'nonexistent'] } })

      makeClippingMask()

      // Only one layer found on artboard from selection -> selectedLayers.length < 2
      expect(artboardLayers().length).toBe(1)
    })

    it('can mask a text layer with a vector mask', () => {
      const textBottom = addTextLayer({ name: 'Text Content' })
      const vecTop = addVectorLayer({ name: 'Circle Mask' })

      useEditorStore.getState().selectLayer(textBottom.id)
      useEditorStore.getState().selectLayer(vecTop.id, true)

      makeClippingMask()

      const layers = artboardLayers()
      expect(layers.length).toBe(1)
      expect(layers[0]!.id).toBe(textBottom.id)
      expect(layers[0]!.mask).toBeDefined()
      expect(layers[0]!.mask!.name).toBe('Circle Mask (Mask)')
    })

    it('can mask a raster layer with a vector mask', () => {
      const rasterBottom = addRasterLayer({ name: 'Photo' })
      const vecTop = addVectorLayer({ name: 'Oval Mask' })

      useEditorStore.getState().selectLayer(rasterBottom.id)
      useEditorStore.getState().selectLayer(vecTop.id, true)

      makeClippingMask()

      const layers = artboardLayers()
      expect(layers.length).toBe(1)
      expect(layers[0]!.id).toBe(rasterBottom.id)
      expect(layers[0]!.mask).toBeDefined()
    })

    it('handles null fill on mask source', () => {
      const bottom = addVectorLayer()
      const top = addVectorLayer({ fill: null })

      useEditorStore.getState().selectLayer(bottom.id)
      useEditorStore.getState().selectLayer(top.id, true)

      makeClippingMask()

      const masked = artboardLayers().find((l) => l.id === bottom.id)
      expect(masked!.mask).toBeDefined()
      expect((masked!.mask as VectorLayer).fill).toBeNull()
    })
  })
})

// ── releaseClippingMask tests ──

describe('releaseClippingMask', () => {
  beforeEach(resetStore)

  // Helper to set up a masked layer
  function setupMaskedLayer(): { maskedId: string } {
    const bottom = addVectorLayer({ name: 'Content' })
    const top = addVectorLayer({ name: 'MaskShape' })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)
    makeClippingMask()

    return { maskedId: bottom.id }
  }

  it('restores the mask as a standalone layer', () => {
    const { maskedId } = setupMaskedLayer()

    // After makeClippingMask, maskedId is selected
    releaseClippingMask()

    const layers = artboardLayers()
    // Should now have 2 layers: the original content + the restored mask
    expect(layers.length).toBe(2)
  })

  it('removes the mask from the masked layer', () => {
    const { maskedId } = setupMaskedLayer()

    releaseClippingMask()

    const maskedLayer = artboardLayers().find((l) => l.id === maskedId)
    expect(maskedLayer).toBeDefined()
    expect(maskedLayer!.mask).toBeUndefined()
  })

  it('restores the mask name without (Mask) suffix', () => {
    const { maskedId } = setupMaskedLayer()

    releaseClippingMask()

    const layers = artboardLayers()
    const restoredLayer = layers.find((l) => l.id !== maskedId)
    expect(restoredLayer).toBeDefined()
    expect(restoredLayer!.name).toBe('MaskShape')
  })

  it('selects both the original and restored layer', () => {
    const { maskedId } = setupMaskedLayer()

    releaseClippingMask()

    const sel = selection()
    expect(sel.length).toBe(2)
    expect(sel).toContain(maskedId)
  })

  it('restored layer has a new ID', () => {
    const { maskedId } = setupMaskedLayer()

    // Get the mask ID before release
    const maskedLayer = artboardLayers().find((l) => l.id === maskedId)
    const maskId = maskedLayer!.mask!.id

    releaseClippingMask()

    const layers = artboardLayers()
    const restored = layers.find((l) => l.id !== maskedId)
    expect(restored).toBeDefined()
    expect(restored!.id).not.toBe(maskId)
  })

  it('restored layer is a vector layer with paths', () => {
    const { maskedId } = setupMaskedLayer()

    releaseClippingMask()

    const layers = artboardLayers()
    const restored = layers.find((l) => l.id !== maskedId)
    expect(restored!.type).toBe('vector')
    expect((restored as VectorLayer).paths.length).toBeGreaterThan(0)
  })

  it('preserves bystander layers', () => {
    const bystander = addVectorLayer({ name: 'Bystander' })
    const { maskedId } = setupMaskedLayer()

    releaseClippingMask()

    const layers = artboardLayers()
    expect(layers.find((l) => l.id === bystander.id)).toBeDefined()
  })

  describe('edge cases', () => {
    it('does nothing with no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      releaseClippingMask()
      // Should not throw
    })

    it('does nothing with no selection', () => {
      setupMaskedLayer()
      useEditorStore.getState().deselectAll()
      releaseClippingMask()

      // Still 1 layer with mask intact
      expect(artboardLayers().length).toBe(1)
    })

    it('does nothing when multiple layers are selected', () => {
      const { maskedId } = setupMaskedLayer()
      const extra = addVectorLayer()

      useEditorStore.getState().selectLayer(maskedId)
      useEditorStore.getState().selectLayer(extra.id, true)

      releaseClippingMask()

      // No release happened (selection.length !== 1)
      const maskedLayer = artboardLayers().find((l) => l.id === maskedId)
      expect(maskedLayer!.mask).toBeDefined()
    })

    it('does nothing when selected layer has no mask', () => {
      const v1 = addVectorLayer()

      useEditorStore.getState().selectLayer(v1.id)
      releaseClippingMask()

      expect(artboardLayers().length).toBe(1)
    })

    it('does nothing when selected layer is not found', () => {
      setupMaskedLayer()
      useEditorStore.setState({ selection: { layerIds: ['nonexistent'] } })

      releaseClippingMask()

      // Still 1 layer with mask
      expect(artboardLayers().length).toBe(1)
    })

    it('uses fallback name "Released Mask" if original name was just " (Mask)"', () => {
      // Manually set up a layer with a mask whose name is exactly " (Mask)"
      const bottom = addVectorLayer({ name: 'Content' })
      const maskLayer: VectorLayer = {
        id: uid(),
        name: ' (Mask)',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: uid(),
            segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 10, y: 10 }, { type: 'close' }],
            closed: true,
          },
        ],
        fill: null,
        stroke: null,
      }
      useEditorStore.getState().setLayerMask(artboardId(), bottom.id, maskLayer)

      useEditorStore.getState().selectLayer(bottom.id)
      releaseClippingMask()

      const layers = artboardLayers()
      const restored = layers.find((l) => l.id !== bottom.id)
      // After replacing ' (Mask)' from ' (Mask)', result is '' which is falsy
      // so it falls back to 'Released Mask'
      expect(restored!.name).toBe('Released Mask')
    })
  })
})

// ── Round-trip test ──

describe('clipping mask round-trip', () => {
  beforeEach(resetStore)

  it('make then release restores layer count', () => {
    const bottom = addVectorLayer({ name: 'Content' })
    const top = addVectorLayer({ name: 'MaskShape' })

    expect(artboardLayers().length).toBe(2)

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()
    expect(artboardLayers().length).toBe(1)

    // masked layer is now selected
    releaseClippingMask()
    expect(artboardLayers().length).toBe(2)
  })

  it('make then release preserves the content layer', () => {
    const bottom = addRasterLayer({ name: 'Photo' })
    const top = addVectorLayer({ name: 'CircleMask' })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()
    releaseClippingMask()

    const layers = artboardLayers()
    const photoLayer = layers.find((l) => l.id === bottom.id)
    expect(photoLayer).toBeDefined()
    expect(photoLayer!.name).toBe('Photo')
    expect(photoLayer!.mask).toBeUndefined()
  })

  it('make then release produces a restored vector layer', () => {
    const bottom = addVectorLayer({ name: 'Base' })
    const top = addVectorLayer({ name: 'Clipper' })

    useEditorStore.getState().selectLayer(bottom.id)
    useEditorStore.getState().selectLayer(top.id, true)

    makeClippingMask()
    releaseClippingMask()

    const layers = artboardLayers()
    const restored = layers.find((l) => l.id !== bottom.id)
    expect(restored).toBeDefined()
    expect(restored!.type).toBe('vector')
    expect(restored!.name).toBe('Clipper')
  })
})
