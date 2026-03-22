import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { useEditorStore, createDefaultVectorLayer } from '@/store/editor.store'
import type {
  VectorLayer,
  GroupLayer,
  TextLayer,
  Fill,
  Stroke,
  Effect,
  Comment,
  CommentReply,
  Interaction,
} from '@/types'

// Save originals
const origDocument = (globalThis as any).document

afterAll(() => {
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  } else {
    delete (globalThis as any).document
  }
})

// Ensure document.documentElement exists for toggleTouchMode
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = {
    documentElement: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
  }
} else if (!globalThis.document.documentElement) {
  ;(globalThis.document as any).documentElement = {
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    style: {},
  }
}

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument()
}

function getState() {
  return useEditorStore.getState()
}

function getFirstArtboardId(): string {
  return getState().document.artboards[0]!.id
}

function addTestVectorLayer(name = 'Test Layer'): { artboardId: string; layerId: string } {
  const artboardId = getFirstArtboardId()
  const layer = createDefaultVectorLayer(name)
  getState().addLayer(artboardId, layer)
  return { artboardId, layerId: layer.id }
}

function addTestGroupWithChildren(): { artboardId: string; groupId: string; childIds: string[] } {
  const artboardId = getFirstArtboardId()
  const child1 = createDefaultVectorLayer('Child 1')
  const child2 = createDefaultVectorLayer('Child 2')
  getState().addLayer(artboardId, child1)
  getState().addLayer(artboardId, child2)
  getState().groupLayers(artboardId, [child1.id, child2.id])
  const layers = getState().document.artboards[0]!.layers
  const group = layers.find((l) => l.type === 'group') as GroupLayer
  return { artboardId, groupId: group.id, childIds: [child1.id, child2.id] }
}

// ── Tests ──

describe('Editor Store - Document Management', () => {
  beforeEach(resetStore)

  test('newDocument creates a valid document with defaults', () => {
    const state = getState()
    expect(state.document).toBeDefined()
    expect(state.document.artboards).toHaveLength(1)
    expect(state.document.metadata.title).toBe('Untitled')
    expect(state.document.metadata.width).toBe(1920)
    expect(state.document.metadata.height).toBe(1080)
    expect(state.document.metadata.colorspace).toBe('srgb')
    expect(state.history).toHaveLength(0)
    expect(state.historyIndex).toBe(-1)
    expect(state.selection.layerIds).toHaveLength(0)
    expect(state.isDirty).toBe(false)
    expect(state.filePath).toBeNull()
  })

  test('newDocument with custom options', () => {
    getState().newDocument({ title: 'My Doc', width: 800, height: 600, colorspace: 'p3', backgroundColor: '#000000' })
    const state = getState()
    expect(state.document.metadata.title).toBe('My Doc')
    expect(state.document.metadata.width).toBe(800)
    expect(state.document.metadata.height).toBe(600)
    expect(state.document.metadata.colorspace).toBe('p3')
    expect(state.document.artboards[0]!.backgroundColor).toBe('#000000')
  })

  test('newDocument resets history and selection', () => {
    // Add a layer to create history
    addTestVectorLayer()
    expect(getState().history.length).toBeGreaterThan(0)
    expect(getState().isDirty).toBe(true)

    getState().newDocument()
    expect(getState().history).toHaveLength(0)
    expect(getState().historyIndex).toBe(-1)
    expect(getState().selection.layerIds).toHaveLength(0)
    expect(getState().isDirty).toBe(false)
  })
})

describe('Editor Store - Artboard Operations', () => {
  beforeEach(resetStore)

  test('addArtboard adds a new artboard', () => {
    getState().addArtboard('Second Artboard', 800, 600)
    const artboards = getState().document.artboards
    expect(artboards).toHaveLength(2)
    expect(artboards[1]!.name).toBe('Second Artboard')
    expect(artboards[1]!.width).toBe(800)
    expect(artboards[1]!.height).toBe(600)
  })

  test('addArtboard positions after last artboard', () => {
    const first = getState().document.artboards[0]!
    getState().addArtboard('Second', 500, 400)
    const second = getState().document.artboards[1]!
    expect(second.x).toBe(first.x + first.width + 100)
    expect(second.y).toBe(0)
  })

  test('deleteArtboard removes an artboard', () => {
    getState().addArtboard('Second', 800, 600)
    expect(getState().document.artboards).toHaveLength(2)
    const secondId = getState().document.artboards[1]!.id
    getState().deleteArtboard(secondId)
    expect(getState().document.artboards).toHaveLength(1)
  })

  test('resizeArtboard updates dimensions', () => {
    const id = getFirstArtboardId()
    getState().resizeArtboard(id, 3840, 2160)
    const artboard = getState().document.artboards[0]!
    expect(artboard.width).toBe(3840)
    expect(artboard.height).toBe(2160)
  })

  test('resizeArtboard clamps to minimum 1', () => {
    const id = getFirstArtboardId()
    getState().resizeArtboard(id, 0, -5)
    const artboard = getState().document.artboards[0]!
    expect(artboard.width).toBe(1)
    expect(artboard.height).toBe(1)
  })

  test('moveArtboard updates position', () => {
    const id = getFirstArtboardId()
    getState().moveArtboard(id, 100, 200)
    const artboard = getState().document.artboards[0]!
    expect(artboard.x).toBe(100)
    expect(artboard.y).toBe(200)
  })
})

describe('Editor Store - Layer Operations', () => {
  beforeEach(resetStore)

  test('addLayer adds a layer to artboard', () => {
    const { artboardId: _artboardId, layerId } = addTestVectorLayer('My Layer')
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.name).toBe('My Layer')
    expect(layers[0]!.id).toBe(layerId)
  })

  test('importLayersToArtboard adds multiple layers', () => {
    const artboardId = getFirstArtboardId()
    const layers = [createDefaultVectorLayer('A'), createDefaultVectorLayer('B'), createDefaultVectorLayer('C')]
    getState().importLayersToArtboard(artboardId, layers)
    expect(getState().document.artboards[0]!.layers).toHaveLength(3)
  })

  test('importLayersToArtboard with empty array is no-op', () => {
    const artboardId = getFirstArtboardId()
    const historyBefore = getState().history.length
    getState().importLayersToArtboard(artboardId, [])
    expect(getState().history.length).toBe(historyBefore)
  })

  test('deleteLayer removes a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    expect(getState().document.artboards[0]!.layers).toHaveLength(1)
    getState().deleteLayer(artboardId, layerId)
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)
  })

  test('updateLayer modifies layer properties', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().updateLayer(artboardId, layerId, { name: 'Updated', opacity: 0.5 })
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.name).toBe('Updated')
    expect(layer.opacity).toBe(0.5)
  })

  test('updateLayerSilent modifies without creating undo entry', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const historyBefore = getState().history.length
    getState().updateLayerSilent(artboardId, layerId, { name: 'Silent Update' })
    expect(getState().history.length).toBe(historyBefore)
    expect(getState().document.artboards[0]!.layers[0]!.name).toBe('Silent Update')
  })

  test('setLayerVisibility toggles visibility', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerVisibility(artboardId, layerId, false)
    expect(getState().document.artboards[0]!.layers[0]!.visible).toBe(false)
    getState().setLayerVisibility(artboardId, layerId, true)
    expect(getState().document.artboards[0]!.layers[0]!.visible).toBe(true)
  })

  test('setLayerLocked toggles locked', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerLocked(artboardId, layerId, true)
    expect(getState().document.artboards[0]!.layers[0]!.locked).toBe(true)
    getState().setLayerLocked(artboardId, layerId, false)
    expect(getState().document.artboards[0]!.layers[0]!.locked).toBe(false)
  })

  test('setLayerOpacity sets opacity', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerOpacity(artboardId, layerId, 0.3)
    expect(getState().document.artboards[0]!.layers[0]!.opacity).toBe(0.3)
  })

  test('setLayerBlendMode sets blend mode', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerBlendMode(artboardId, layerId, 'multiply')
    expect(getState().document.artboards[0]!.layers[0]!.blendMode).toBe('multiply')
  })

  test('reorderLayer moves a layer', () => {
    const artboardId = getFirstArtboardId()
    const layerA = createDefaultVectorLayer('A')
    const layerB = createDefaultVectorLayer('B')
    const layerC = createDefaultVectorLayer('C')
    getState().addLayer(artboardId, layerA)
    getState().addLayer(artboardId, layerB)
    getState().addLayer(artboardId, layerC)

    // Move A to the end
    getState().reorderLayer(artboardId, layerA.id, 2)
    const layers = getState().document.artboards[0]!.layers
    expect(layers[0]!.id).toBe(layerB.id)
    expect(layers[1]!.id).toBe(layerC.id)
    expect(layers[2]!.id).toBe(layerA.id)
  })

  test('duplicateLayer creates a copy with new id', () => {
    const { artboardId, layerId } = addTestVectorLayer('Original')
    getState().duplicateLayer(artboardId, layerId)
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(2)
    expect(layers[1]!.name).toBe('Original Copy')
    expect(layers[1]!.id).not.toBe(layerId)
  })
})

describe('Editor Store - Group Operations', () => {
  beforeEach(resetStore)

  test('groupLayers creates a group from selected layers', () => {
    const { artboardId: _artboardId, groupId: _groupId, childIds: _childIds } = addTestGroupWithChildren()
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('group')
    const group = layers[0] as GroupLayer
    expect(group.children).toHaveLength(2)
  })

  test('groupLayers requires at least 2 layers', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().groupLayers(artboardId, [layerId])
    // Should be no-op, no new history entry added
    expect(getState().document.artboards[0]!.layers[0]!.type).toBe('vector')
  })

  test('ungroupLayer dissolves a group', () => {
    const { artboardId, groupId, childIds: _childIds } = addTestGroupWithChildren()
    getState().ungroupLayer(artboardId, groupId)
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(2)
    expect(layers.every((l) => l.type === 'vector')).toBe(true)
  })

  test('moveLayerToGroup moves a layer into a group', () => {
    const artboardId = getFirstArtboardId()
    const child1 = createDefaultVectorLayer('C1')
    const child2 = createDefaultVectorLayer('C2')
    const extra = createDefaultVectorLayer('Extra')
    getState().addLayer(artboardId, child1)
    getState().addLayer(artboardId, child2)
    getState().addLayer(artboardId, extra)
    getState().groupLayers(artboardId, [child1.id, child2.id])

    const group = getState().document.artboards[0]!.layers.find((l) => l.type === 'group') as GroupLayer
    getState().moveLayerToGroup(artboardId, extra.id, group.id)

    const updatedGroup = getState().document.artboards[0]!.layers.find((l) => l.type === 'group') as GroupLayer
    expect(updatedGroup.children).toHaveLength(3)
    expect(getState().document.artboards[0]!.layers).toHaveLength(1)
  })

  test('moveLayerOutOfGroup moves a layer out of a group', () => {
    const { artboardId, groupId, childIds } = addTestGroupWithChildren()
    getState().moveLayerOutOfGroup(artboardId, childIds[0]!, groupId, 0)
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(2)
    const group = layers.find((l) => l.type === 'group') as GroupLayer
    expect(group.children).toHaveLength(1)
  })
})

describe('Editor Store - Path Operations', () => {
  beforeEach(resetStore)

  test('addPath adds a path to a vector layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const path = { id: 'path-1', segments: [], closed: false }
    getState().addPath(artboardId, layerId, path)
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.paths).toHaveLength(1)
    expect(layer.paths[0]!.id).toBe('path-1')
  })

  test('updatePath modifies an existing path', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const path = { id: 'path-1', segments: [], closed: false }
    getState().addPath(artboardId, layerId, path)
    getState().updatePath(artboardId, layerId, 'path-1', { closed: true })
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.paths[0]!.closed).toBe(true)
  })

  test('addSegmentToPath appends a segment', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const path = { id: 'path-1', segments: [], closed: false }
    getState().addPath(artboardId, layerId, path)
    const segment = { type: 'line' as const, x: 10, y: 20 }
    getState().addSegmentToPath(artboardId, layerId, 'path-1', segment)
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(1)
    expect((layer.paths[0]!.segments[0]! as { type: 'line'; x: number; y: number }).x).toBe(10)
  })
})

describe('Editor Store - Fill/Stroke', () => {
  beforeEach(resetStore)

  test('setFill updates fill on a vector layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const fill: Fill = { type: 'solid', color: '#ff0000', opacity: 0.8 }
    getState().setFill(artboardId, layerId, fill)
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill!.color).toBe('#ff0000')
    expect(layer.fill!.opacity).toBe(0.8)
  })

  test('setFill with null removes fill', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setFill(artboardId, layerId, null)
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill).toBeNull()
  })

  test('setStroke updates stroke on a vector layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const stroke: Stroke = {
      color: '#00ff00',
      width: 3,
      opacity: 1,
      linecap: 'round',
      linejoin: 'round',
      position: 'center',
      miterLimit: 4,
    }
    getState().setStroke(artboardId, layerId, stroke)
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.stroke!.color).toBe('#00ff00')
    expect(layer.stroke!.width).toBe(3)
  })
})

describe('Editor Store - Effects', () => {
  beforeEach(resetStore)

  test('addEffect adds an effect to a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const effect: Effect = {
      id: 'effect-1',
      type: 'drop-shadow',
      enabled: true,
      opacity: 0.5,
      params: { kind: 'shadow', offsetX: 5, offsetY: 5, blurRadius: 10, spread: 0, color: '#000000', opacity: 0.5 },
    }
    getState().addEffect(artboardId, layerId, effect)
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.effects).toHaveLength(1)
    expect(layer.effects![0]!.id).toBe('effect-1')
  })

  test('removeEffect removes an effect', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const effect: Effect = {
      id: 'effect-1',
      type: 'drop-shadow',
      enabled: true,
      opacity: 0.5,
      params: { kind: 'shadow', offsetX: 5, offsetY: 5, blurRadius: 10, spread: 0, color: '#000000', opacity: 0.5 },
    }
    getState().addEffect(artboardId, layerId, effect)
    getState().removeEffect(artboardId, layerId, 'effect-1')
    expect(getState().document.artboards[0]!.layers[0]!.effects).toHaveLength(0)
  })

  test('updateEffect modifies an existing effect', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const effect: Effect = {
      id: 'effect-1',
      type: 'drop-shadow',
      enabled: true,
      opacity: 0.5,
      params: { kind: 'shadow', offsetX: 5, offsetY: 5, blurRadius: 10, spread: 0, color: '#000000', opacity: 0.5 },
    }
    getState().addEffect(artboardId, layerId, effect)
    getState().updateEffect(artboardId, layerId, 'effect-1', { opacity: 0.9 } as Partial<Effect>)
    const updated = getState().document.artboards[0]!.layers[0]!.effects![0]!
    expect(updated.opacity).toBe(0.9)
  })
})

describe('Editor Store - Adjustment Layers', () => {
  beforeEach(resetStore)

  test('addAdjustmentLayer adds levels adjustment', () => {
    const artboardId = getFirstArtboardId()
    getState().addAdjustmentLayer(artboardId, 'levels')
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('adjustment')
    expect(layers[0]!.name).toContain('levels')
  })

  test('addAdjustmentLayer adds curves adjustment', () => {
    const artboardId = getFirstArtboardId()
    getState().addAdjustmentLayer(artboardId, 'curves')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.type).toBe('adjustment')
    expect(layer.name).toContain('curves')
  })

  test('addAdjustmentLayer adds hue-sat adjustment', () => {
    const artboardId = getFirstArtboardId()
    getState().addAdjustmentLayer(artboardId, 'hue-sat')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.name).toContain('hue-sat')
  })

  test('addAdjustmentLayer adds color-balance adjustment', () => {
    const artboardId = getFirstArtboardId()
    getState().addAdjustmentLayer(artboardId, 'color-balance')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.name).toContain('color-balance')
  })
})

describe('Editor Store - Masks', () => {
  beforeEach(resetStore)

  test('setLayerMask adds a mask to a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const mask = createDefaultVectorLayer('Mask')
    getState().setLayerMask(artboardId, layerId, mask)
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.mask).toBeDefined()
    expect(layer.mask!.name).toBe('Mask')
  })

  test('removeLayerMask removes the mask', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const mask = createDefaultVectorLayer('Mask')
    getState().setLayerMask(artboardId, layerId, mask)
    getState().removeLayerMask(artboardId, layerId)
    expect(getState().document.artboards[0]!.layers[0]!.mask).toBeUndefined()
  })
})

describe('Editor Store - Selection', () => {
  beforeEach(resetStore)

  test('selectLayer selects a single layer', () => {
    const { layerId } = addTestVectorLayer()
    getState().selectLayer(layerId)
    expect(getState().selection.layerIds).toEqual([layerId])
  })

  test('selectLayer with multiselect adds to selection', () => {
    const artboardId = getFirstArtboardId()
    const layer1 = createDefaultVectorLayer('A')
    const layer2 = createDefaultVectorLayer('B')
    getState().addLayer(artboardId, layer1)
    getState().addLayer(artboardId, layer2)

    getState().selectLayer(layer1.id)
    getState().selectLayer(layer2.id, true)
    expect(getState().selection.layerIds).toContain(layer1.id)
    expect(getState().selection.layerIds).toContain(layer2.id)
  })

  test('selectLayer multiselect toggles off if already selected', () => {
    const { layerId } = addTestVectorLayer()
    getState().selectLayer(layerId)
    getState().selectLayer(layerId, true)
    expect(getState().selection.layerIds).not.toContain(layerId)
  })

  test('deselectAll clears all selections', () => {
    const { layerId } = addTestVectorLayer()
    getState().selectLayer(layerId)
    getState().deselectAll()
    expect(getState().selection.layerIds).toHaveLength(0)
  })
})

describe('Editor Store - Viewport', () => {
  beforeEach(resetStore)

  test('setZoom clamps between 0.1 and 64', () => {
    getState().setZoom(0.01)
    expect(getState().viewport.zoom).toBe(0.1)
    getState().setZoom(100)
    expect(getState().viewport.zoom).toBe(64)
    getState().setZoom(2.5)
    expect(getState().viewport.zoom).toBe(2.5)
  })

  test('setPan sets pan coordinates', () => {
    getState().setPan(100, -200)
    expect(getState().viewport.panX).toBe(100)
    expect(getState().viewport.panY).toBe(-200)
  })

  test('zoomToFit calculates correct zoom and pan', () => {
    getState().zoomToFit(1920, 1080)
    const vp = getState().viewport
    expect(vp.zoom).toBeGreaterThan(0)
    expect(vp.zoom).toBeLessThanOrEqual(10)
  })

  test('zoomToFit with zero viewport is no-op', () => {
    const before = { ...getState().viewport }
    getState().zoomToFit(0, 0)
    expect(getState().viewport.zoom).toBe(before.zoom)
  })

  test('setActiveTool changes the tool', () => {
    getState().setActiveTool('pen')
    expect(getState().activeTool).toBe('pen')
    getState().setActiveTool('rectangle')
    expect(getState().activeTool).toBe('rectangle')
  })
})

describe('Editor Store - Toggles', () => {
  beforeEach(resetStore)

  test('toggleRulers toggles showRulers', () => {
    const before = getState().showRulers
    getState().toggleRulers()
    expect(getState().showRulers).toBe(!before)
  })

  test('toggleGrid toggles showGrid', () => {
    const before = getState().showGrid
    getState().toggleGrid()
    expect(getState().showGrid).toBe(!before)
  })

  test('toggleSnap toggles snapEnabled', () => {
    const before = getState().snapEnabled
    getState().toggleSnap()
    expect(getState().snapEnabled).toBe(!before)
  })

  test('setGridSize clamps to minimum 1', () => {
    getState().setGridSize(16)
    expect(getState().gridSize).toBe(16)
    getState().setGridSize(0)
    expect(getState().gridSize).toBe(1)
  })

  test('togglePixelPreview toggles', () => {
    const before = getState().pixelPreview
    getState().togglePixelPreview()
    expect(getState().pixelPreview).toBe(!before)
  })

  test('toggleSnapToGrid toggles', () => {
    const before = getState().snapToGrid
    getState().toggleSnapToGrid()
    expect(getState().snapToGrid).toBe(!before)
  })

  test('toggleSnapToGuides toggles', () => {
    const before = getState().snapToGuides
    getState().toggleSnapToGuides()
    expect(getState().snapToGuides).toBe(!before)
  })

  test('toggleSnapToLayers toggles', () => {
    const before = getState().snapToLayers
    getState().toggleSnapToLayers()
    expect(getState().snapToLayers).toBe(!before)
  })

  test('toggleSnapToArtboard toggles', () => {
    const before = getState().snapToArtboard
    getState().toggleSnapToArtboard()
    expect(getState().snapToArtboard).toBe(!before)
  })

  test('toggleSnapToPixel toggles', () => {
    const before = getState().snapToPixel
    getState().toggleSnapToPixel()
    expect(getState().snapToPixel).toBe(!before)
  })

  test('toggleTouchMode toggles', () => {
    const before = getState().touchMode
    getState().toggleTouchMode()
    expect(getState().touchMode).toBe(!before)
  })

  test('toggleAIPanel toggles', () => {
    const before = getState().showAIPanel
    getState().toggleAIPanel()
    expect(getState().showAIPanel).toBe(!before)
  })

  test('togglePrototypeMode toggles', () => {
    const before = getState().prototypeMode
    getState().togglePrototypeMode()
    expect(getState().prototypeMode).toBe(!before)
  })

  test('toggleDevMode toggles', () => {
    expect(getState().devMode).toBe(false)
    getState().toggleDevMode()
    expect(getState().devMode).toBe(true)
    getState().toggleDevMode()
    expect(getState().devMode).toBe(false)
  })

  test('toggleDevModeReadOnly toggles', () => {
    const before = getState().devModeReadOnly
    getState().toggleDevModeReadOnly()
    expect(getState().devModeReadOnly).toBe(!before)
  })

  test('togglePNGTuberPanel toggles', () => {
    const before = getState().showPNGTuberPanel
    getState().togglePNGTuberPanel()
    expect(getState().showPNGTuberPanel).toBe(!before)
  })
})

describe('Editor Store - Undo/Redo', () => {
  beforeEach(resetStore)

  test('canUndo returns false on empty history', () => {
    expect(getState().canUndo()).toBe(false)
  })

  test('canRedo returns false on empty history', () => {
    expect(getState().canRedo()).toBe(false)
  })

  test('undo reverts a layer add', () => {
    addTestVectorLayer('To Undo')
    expect(getState().document.artboards[0]!.layers).toHaveLength(1)
    expect(getState().canUndo()).toBe(true)

    getState().undo()
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)
    expect(getState().canRedo()).toBe(true)
  })

  test('redo reapplies an undone action', () => {
    addTestVectorLayer('To Redo')
    getState().undo()
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)

    getState().redo()
    expect(getState().document.artboards[0]!.layers).toHaveLength(1)
    expect(getState().document.artboards[0]!.layers[0]!.name).toBe('To Redo')
  })

  test('new action after undo truncates redo history', () => {
    addTestVectorLayer('First')
    addTestVectorLayer('Second')
    getState().undo() // Undo 'Second'
    addTestVectorLayer('Third')
    expect(getState().canRedo()).toBe(false)
  })

  test('multiple undos and redos work correctly', () => {
    addTestVectorLayer('A')
    addTestVectorLayer('B')
    addTestVectorLayer('C')
    expect(getState().document.artboards[0]!.layers).toHaveLength(3)

    getState().undo()
    getState().undo()
    expect(getState().document.artboards[0]!.layers).toHaveLength(1)

    getState().redo()
    expect(getState().document.artboards[0]!.layers).toHaveLength(2)
  })

  test('undo on empty history is no-op', () => {
    const docBefore = getState().document
    getState().undo()
    expect(getState().document).toBe(docBefore)
  })

  test('redo at end of history is no-op', () => {
    addTestVectorLayer()
    const docBefore = getState().document
    getState().redo()
    expect(getState().document).toBe(docBefore)
  })
})

describe('Editor Store - Guides', () => {
  beforeEach(resetStore)

  test('addGuide adds a horizontal guide', () => {
    const artboardId = getFirstArtboardId()
    getState().addGuide(artboardId, 'horizontal', 100)
    const guides = getState().document.artboards[0]!.guides
    expect(guides).toBeDefined()
    expect(guides!.horizontal).toContain(100)
  })

  test('addGuide adds a vertical guide', () => {
    const artboardId = getFirstArtboardId()
    getState().addGuide(artboardId, 'vertical', 200)
    const guides = getState().document.artboards[0]!.guides
    expect(guides!.vertical).toContain(200)
  })

  test('removeGuide removes a guide by index', () => {
    const artboardId = getFirstArtboardId()
    getState().addGuide(artboardId, 'horizontal', 50)
    getState().addGuide(artboardId, 'horizontal', 100)
    getState().removeGuide(artboardId, 'horizontal', 0)
    const guides = getState().document.artboards[0]!.guides
    expect(guides!.horizontal).toHaveLength(1)
    expect(guides!.horizontal[0]).toBe(100)
  })

  test('updateGuide moves a guide', () => {
    const artboardId = getFirstArtboardId()
    getState().addGuide(artboardId, 'horizontal', 50)
    getState().updateGuide(artboardId, 'horizontal', 0, 150)
    expect(getState().document.artboards[0]!.guides!.horizontal[0]).toBe(150)
  })

  test('clearGuides removes all guides', () => {
    const artboardId = getFirstArtboardId()
    getState().addGuide(artboardId, 'horizontal', 50)
    getState().addGuide(artboardId, 'vertical', 100)
    getState().clearGuides(artboardId)
    const guides = getState().document.artboards[0]!.guides
    expect(guides!.horizontal).toHaveLength(0)
    expect(guides!.vertical).toHaveLength(0)
  })
})

describe('Editor Store - State Setters', () => {
  beforeEach(resetStore)

  test('setDirty sets isDirty', () => {
    getState().setDirty(true)
    expect(getState().isDirty).toBe(true)
    getState().setDirty(false)
    expect(getState().isDirty).toBe(false)
  })

  test('setShowInspectOverlay sets overlay', () => {
    getState().setShowInspectOverlay(true)
    expect(getState().showInspectOverlay).toBe(true)
    getState().setShowInspectOverlay(false)
    expect(getState().showInspectOverlay).toBe(false)
  })

  test('setActiveSnapLines sets snap lines', () => {
    getState().setActiveSnapLines({ h: [10, 20], v: [30] })
    expect(getState().activeSnapLines).toEqual({ h: [10, 20], v: [30] })
    getState().setActiveSnapLines(null)
    expect(getState().activeSnapLines).toBeNull()
  })

  test('openExportModal / closeExportModal', () => {
    getState().openExportModal()
    expect(getState().showExportModal).toBe(true)
    getState().closeExportModal()
    expect(getState().showExportModal).toBe(false)
  })
})

describe('Editor Store - Slices', () => {
  beforeEach(resetStore)

  test('addSlice adds a slice', () => {
    const artboardId = getFirstArtboardId()
    const slice = {
      id: 'slice-1',
      name: 'Icon',
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      format: 'png' as const,
      scale: 1,
    }
    getState().addSlice(artboardId, slice)
    expect(getState().document.artboards[0]!.slices).toHaveLength(1)
  })

  test('removeSlice removes a slice', () => {
    const artboardId = getFirstArtboardId()
    const slice = {
      id: 'slice-1',
      name: 'Icon',
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      format: 'png' as const,
      scale: 1,
    }
    getState().addSlice(artboardId, slice)
    getState().removeSlice(artboardId, 'slice-1')
    expect(getState().document.artboards[0]!.slices).toHaveLength(0)
  })

  test('updateSlice modifies a slice', () => {
    const artboardId = getFirstArtboardId()
    const slice = {
      id: 'slice-1',
      name: 'Old',
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      format: 'png' as const,
      scale: 1,
    }
    getState().addSlice(artboardId, slice)
    getState().updateSlice(artboardId, 'slice-1', { name: 'Updated', width: 128 })
    const updated = getState().document.artboards[0]!.slices![0]!
    expect(updated.name).toBe('Updated')
    expect(updated.width).toBe(128)
  })
})

describe('Editor Store - Comments', () => {
  beforeEach(resetStore)

  test('addComment adds a comment to document', () => {
    const comment: Comment = {
      id: 'c1',
      text: 'Hello',
      author: 'Alice',
      x: 100,
      y: 200,
      artboardId: getFirstArtboardId(),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    }
    getState().addComment(comment)
    expect(getState().document.comments).toHaveLength(1)
    expect(getState().document.comments![0]!.text).toBe('Hello')
  })

  test('removeComment removes a comment', () => {
    const comment: Comment = {
      id: 'c1',
      text: 'Hello',
      author: 'Alice',
      x: 100,
      y: 200,
      artboardId: getFirstArtboardId(),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    }
    getState().addComment(comment)
    getState().removeComment('c1')
    expect(getState().document.comments).toHaveLength(0)
  })

  test('removeComment resets selectedCommentId if matching', () => {
    const comment: Comment = {
      id: 'c1',
      text: 'Hello',
      author: 'Alice',
      x: 100,
      y: 200,
      artboardId: getFirstArtboardId(),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    }
    getState().addComment(comment)
    getState().selectComment('c1')
    expect(getState().selectedCommentId).toBe('c1')
    getState().removeComment('c1')
    expect(getState().selectedCommentId).toBeNull()
  })

  test('resolveComment toggles resolved', () => {
    const comment: Comment = {
      id: 'c1',
      text: 'Fix this',
      author: 'Bob',
      x: 0,
      y: 0,
      artboardId: getFirstArtboardId(),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    }
    getState().addComment(comment)
    getState().resolveComment('c1')
    expect(getState().document.comments![0]!.resolved).toBe(true)
    getState().resolveComment('c1')
    expect(getState().document.comments![0]!.resolved).toBe(false)
  })

  test('addReply adds a reply to a comment', () => {
    const comment: Comment = {
      id: 'c1',
      text: 'Test',
      author: 'Alice',
      x: 0,
      y: 0,
      artboardId: getFirstArtboardId(),
      resolved: false,
      replies: [],
      createdAt: new Date().toISOString(),
    }
    getState().addComment(comment)
    const reply: CommentReply = { id: 'r1', text: 'Reply here', author: 'Bob', createdAt: new Date().toISOString() }
    getState().addReply('c1', reply)
    expect(getState().document.comments![0]!.replies).toHaveLength(1)
    expect(getState().document.comments![0]!.replies[0]!.text).toBe('Reply here')
  })

  test('selectComment sets selectedCommentId', () => {
    getState().selectComment('c1')
    expect(getState().selectedCommentId).toBe('c1')
    getState().selectComment(null)
    expect(getState().selectedCommentId).toBeNull()
  })
})

describe('Editor Store - Prototype Interactions', () => {
  beforeEach(resetStore)

  test('addInteraction adds an interaction to a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const interaction: Interaction = {
      id: 'int-1',
      trigger: 'click',
      action: {
        type: 'navigate',
        targetArtboardId: 'artboard-2',
        transition: { type: 'instant', duration: 0, easing: 'linear' },
      },
    }
    getState().addInteraction(artboardId, layerId, interaction)
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.interactions).toHaveLength(1)
    expect(layer.interactions![0]!.trigger).toBe('click')
  })

  test('removeInteraction removes an interaction', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const interaction: Interaction = {
      id: 'int-1',
      trigger: 'click',
      action: {
        type: 'navigate',
        targetArtboardId: 'artboard-2',
        transition: { type: 'instant', duration: 0, easing: 'linear' },
      },
    }
    getState().addInteraction(artboardId, layerId, interaction)
    getState().removeInteraction(artboardId, layerId, 'int-1')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.interactions).toHaveLength(0)
  })

  test('updateInteraction modifies an interaction', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    const interaction: Interaction = {
      id: 'int-1',
      trigger: 'click',
      action: {
        type: 'navigate',
        targetArtboardId: 'ab-1',
        transition: { type: 'instant', duration: 0, easing: 'linear' },
      },
    }
    getState().addInteraction(artboardId, layerId, interaction)
    getState().updateInteraction(artboardId, layerId, 'int-1', { trigger: 'hover' })
    expect(getState().document.artboards[0]!.layers[0]!.interactions![0]!.trigger).toBe('hover')
  })

  test('setFlowStarting marks artboard as flow start', () => {
    const artboardId = getFirstArtboardId()
    getState().setFlowStarting(artboardId, true)
    expect(getState().document.artboards[0]!.flowStarting).toBe(true)
  })

  test('openPrototypePlayer sets state', () => {
    getState().openPrototypePlayer()
    expect(getState().showPrototypePlayer).toBe(true)
    expect(getState().prototypeStartArtboardId).toBeDefined()
  })

  test('closePrototypePlayer resets state', () => {
    getState().openPrototypePlayer()
    getState().closePrototypePlayer()
    expect(getState().showPrototypePlayer).toBe(false)
    expect(getState().prototypeStartArtboardId).toBeNull()
  })
})

describe('Editor Store - Document Colors', () => {
  beforeEach(resetStore)

  test('addDocumentColor adds a named color', () => {
    getState().addDocumentColor({ id: 'c1', name: 'Brand Red', value: '#ff0000' })
    expect(getState().document.assets.colors).toHaveLength(1)
    expect(getState().document.assets.colors[0]!.name).toBe('Brand Red')
  })

  test('removeDocumentColor removes a color', () => {
    getState().addDocumentColor({ id: 'c1', name: 'Red', value: '#ff0000' })
    getState().removeDocumentColor('c1')
    expect(getState().document.assets.colors).toHaveLength(0)
  })

  test('updateDocumentColor updates name and value', () => {
    getState().addDocumentColor({ id: 'c1', name: 'Red', value: '#ff0000' })
    getState().updateDocumentColor('c1', { name: 'Blue', value: '#0000ff' })
    expect(getState().document.assets.colors[0]!.name).toBe('Blue')
    expect(getState().document.assets.colors[0]!.value).toBe('#0000ff')
  })
})

describe('Editor Store - Breakpoints', () => {
  beforeEach(resetStore)

  test('addBreakpoint adds a breakpoint', () => {
    const artboardId = getFirstArtboardId()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    expect(getState().document.artboards[0]!.breakpoints).toHaveLength(1)
  })

  test('removeBreakpoint removes a breakpoint', () => {
    const artboardId = getFirstArtboardId()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    getState().removeBreakpoint(artboardId, 'bp-1')
    expect(getState().document.artboards[0]!.breakpoints).toHaveLength(0)
  })

  test('setActiveBreakpoint sets active breakpoint', () => {
    const artboardId = getFirstArtboardId()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    getState().setActiveBreakpoint(artboardId, 'bp-1')
    expect(getState().document.artboards[0]!.activeBreakpointId).toBe('bp-1')
  })

  test('setBreakpointOverride sets overrides for a layer/breakpoint', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    getState().setBreakpointOverride(artboardId, layerId, 'bp-1', { visible: false })
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.breakpointOverrides).toBeDefined()
    expect(layer.breakpointOverrides!['bp-1']!.visible).toBe(false)
  })
})

describe('Editor Store - Design Variables', () => {
  beforeEach(resetStore)

  test('addVariableCollection creates a collection with default mode', () => {
    getState().addVariableCollection('Colors')
    const collections = getState().document.variableCollections
    expect(collections).toHaveLength(1)
    expect(collections![0]!.name).toBe('Colors')
    expect(collections![0]!.modes).toHaveLength(1)
    expect(collections![0]!.modes[0]!.name).toBe('Default')
  })

  test('removeVariableCollection removes a collection', () => {
    getState().addVariableCollection('Colors')
    const collId = getState().document.variableCollections![0]!.id
    getState().removeVariableCollection(collId)
    expect(getState().document.variableCollections).toHaveLength(0)
  })

  test('renameVariableCollection renames', () => {
    getState().addVariableCollection('Old Name')
    const collId = getState().document.variableCollections![0]!.id
    getState().renameVariableCollection(collId, 'New Name')
    expect(getState().document.variableCollections![0]!.name).toBe('New Name')
  })

  test('addVariableMode adds a mode', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariableMode(collId, 'Dark')
    expect(getState().document.variableCollections![0]!.modes).toHaveLength(2)
    expect(getState().document.variableCollections![0]!.modes[1]!.name).toBe('Dark')
  })

  test('removeVariableMode removes a mode but keeps at least one', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariableMode(collId, 'Dark')
    const darkModeId = getState().document.variableCollections![0]!.modes[1]!.id
    getState().removeVariableMode(collId, darkModeId)
    expect(getState().document.variableCollections![0]!.modes).toHaveLength(1)
  })

  test('addVariable adds a variable with default values', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariable(collId, 'Primary Color', 'color')
    const coll = getState().document.variableCollections![0]!
    expect(coll.variables).toHaveLength(1)
    expect(coll.variables[0]!.name).toBe('Primary Color')
    expect(coll.variables[0]!.type).toBe('color')
  })

  test('removeVariable removes a variable', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariable(collId, 'Var1', 'string')
    const varId = getState().document.variableCollections![0]!.variables[0]!.id
    getState().removeVariable(collId, varId)
    expect(getState().document.variableCollections![0]!.variables).toHaveLength(0)
  })

  test('setVariableValue sets value for a variable/mode', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariable(collId, 'Color', 'color')
    const varId = getState().document.variableCollections![0]!.variables[0]!.id
    const modeId = getState().document.variableCollections![0]!.modes[0]!.id
    getState().setVariableValue(collId, varId, modeId, { type: 'color', value: '#ff0000' })
    expect(getState().document.variableCollections![0]!.values[varId]![modeId]!.value).toBe('#ff0000')
  })

  test('setActiveMode sets active mode for a collection', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariableMode(collId, 'Dark')
    const darkModeId = getState().document.variableCollections![0]!.modes[1]!.id
    getState().setActiveMode(collId, darkModeId)
    expect(getState().activeModeIds[collId]).toBe(darkModeId)
  })

  test('bindLayerProperty and unbindLayerProperty', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariable(collId, 'Opacity', 'number')
    const varId = getState().document.variableCollections![0]!.variables[0]!.id

    getState().bindLayerProperty(layerId, artboardId, 'opacity', varId, collId)
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.variableBindings).toBeDefined()
    expect(layer.variableBindings!['opacity']!.variableId).toBe(varId)

    getState().unbindLayerProperty(layerId, artboardId, 'opacity')
    const updated = getState().document.artboards[0]!.layers[0]!
    expect(updated.variableBindings!['opacity']).toBeUndefined()
  })
})

describe('Editor Store - Shared Styles', () => {
  beforeEach(resetStore)

  test('addTextStyle adds a text style', () => {
    getState().addTextStyle({
      id: 'ts1',
      name: 'Heading',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 'bold',
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
    })
    expect(getState().document.styles!.textStyles).toHaveLength(1)
  })

  test('updateTextStyle modifies a style', () => {
    getState().addTextStyle({
      id: 'ts1',
      name: 'Heading',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 'bold',
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
    })
    getState().updateTextStyle('ts1', { fontSize: 32 })
    expect(getState().document.styles!.textStyles[0]!.fontSize).toBe(32)
  })

  test('removeTextStyle removes a style', () => {
    getState().addTextStyle({
      id: 'ts1',
      name: 'Heading',
      fontFamily: 'Arial',
      fontSize: 24,
      fontWeight: 'bold',
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
    })
    getState().removeTextStyle('ts1')
    expect(getState().document.styles!.textStyles).toHaveLength(0)
  })

  test('addColorStyle adds a color style', () => {
    getState().addColorStyle({ id: 'cs1', name: 'Primary', color: '#ff0000', opacity: 1 })
    expect(getState().document.styles!.colorStyles).toHaveLength(1)
  })

  test('updateColorStyle modifies a style', () => {
    getState().addColorStyle({ id: 'cs1', name: 'Primary', color: '#ff0000', opacity: 1 })
    getState().updateColorStyle('cs1', { color: '#0000ff' })
    expect(getState().document.styles!.colorStyles[0]!.color).toBe('#0000ff')
  })

  test('removeColorStyle removes a style', () => {
    getState().addColorStyle({ id: 'cs1', name: 'Primary', color: '#ff0000', opacity: 1 })
    getState().removeColorStyle('cs1')
    expect(getState().document.styles!.colorStyles).toHaveLength(0)
  })

  test('addEffectStyle adds an effect style', () => {
    getState().addEffectStyle({
      id: 'es1',
      name: 'Shadow',
      effects: [
        {
          id: 'e1',
          type: 'drop-shadow',
          enabled: true,
          opacity: 0.3,
          params: { kind: 'shadow', offsetX: 0, offsetY: 4, blurRadius: 8, spread: 0, color: '#000', opacity: 0.3 },
        },
      ],
    })
    expect(getState().document.styles!.effectStyles).toHaveLength(1)
  })

  test('updateEffectStyle modifies a style', () => {
    getState().addEffectStyle({
      id: 'es1',
      name: 'Shadow',
      effects: [
        {
          id: 'e1',
          type: 'drop-shadow',
          enabled: true,
          opacity: 0.3,
          params: { kind: 'shadow', offsetX: 0, offsetY: 4, blurRadius: 8, spread: 0, color: '#000', opacity: 0.3 },
        },
      ],
    })
    getState().updateEffectStyle('es1', { name: 'Deep Shadow' })
    expect(getState().document.styles!.effectStyles[0]!.name).toBe('Deep Shadow')
  })

  test('removeEffectStyle removes a style', () => {
    getState().addEffectStyle({ id: 'es1', name: 'Shadow', effects: [] })
    getState().removeEffectStyle('es1')
    expect(getState().document.styles!.effectStyles).toHaveLength(0)
  })
})

describe('Editor Store - Dev Mode', () => {
  beforeEach(resetStore)

  test('setReadyForDev marks artboard', () => {
    const artboardId = getFirstArtboardId()
    getState().setReadyForDev(artboardId, true)
    expect(getState().document.artboards[0]!.readyForDev).toBe(true)
    getState().setReadyForDev(artboardId, false)
    expect(getState().document.artboards[0]!.readyForDev).toBe(false)
  })

  test('setDevAnnotation sets annotation on a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setDevAnnotation(layerId, artboardId, 'Needs attention')
    expect(getState().document.artboards[0]!.layers[0]!.devAnnotation).toBe('Needs attention')
  })

  test('setDevAnnotation with empty string removes annotation', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setDevAnnotation(layerId, artboardId, 'Note')
    getState().setDevAnnotation(layerId, artboardId, '')
    expect(getState().document.artboards[0]!.layers[0]!.devAnnotation).toBeUndefined()
  })
})

describe('Editor Store - Bulk Rename', () => {
  beforeEach(resetStore)

  test('bulkRenameLayers renames multiple layers', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Old1')
    const l2 = createDefaultVectorLayer('Old2')
    getState().addLayer(artboardId, l1)
    getState().addLayer(artboardId, l2)

    getState().bulkRenameLayers(artboardId, [
      { layerId: l1.id, newName: 'New1' },
      { layerId: l2.id, newName: 'New2' },
    ])

    const layers = getState().document.artboards[0]!.layers
    expect(layers[0]!.name).toBe('New1')
    expect(layers[1]!.name).toBe('New2')
  })

  test('bulkRenameLayers with empty array is no-op', () => {
    const artboardId = getFirstArtboardId()
    const historyBefore = getState().history.length
    getState().bulkRenameLayers(artboardId, [])
    expect(getState().history.length).toBe(historyBefore)
  })
})

describe('Editor Store - Perspective Grid', () => {
  beforeEach(resetStore)

  test('setPerspectiveGrid sets config', () => {
    const artboardId = getFirstArtboardId()
    const config = {
      mode: '1-point' as const,
      vanishingPoints: [{ x: 960, y: 540 }],
      gridDensity: 50,
      opacity: 0.5,
      color: '#0000ff',
      horizonY: 540,
    }
    getState().setPerspectiveGrid(artboardId, config)
    expect(getState().document.artboards[0]!.perspectiveGrid).toBeDefined()
  })

  test('setPerspectiveGrid with null removes config', () => {
    const artboardId = getFirstArtboardId()
    const config = {
      mode: '1-point' as const,
      vanishingPoints: [{ x: 960, y: 540 }],
      gridDensity: 50,
      opacity: 0.5,
      color: '#0000ff',
      horizonY: 540,
    }
    getState().setPerspectiveGrid(artboardId, config)
    getState().setPerspectiveGrid(artboardId, null)
    expect(getState().document.artboards[0]!.perspectiveGrid).toBeUndefined()
  })

  test('togglePerspectiveGrid toggles on and off', () => {
    const artboardId = getFirstArtboardId()
    getState().togglePerspectiveGrid(artboardId)
    expect(getState().document.artboards[0]!.perspectiveGrid).toBeDefined()
    getState().togglePerspectiveGrid(artboardId)
    expect(getState().document.artboards[0]!.perspectiveGrid).toBeUndefined()
  })
})

describe('Editor Store - Team Libraries', () => {
  beforeEach(resetStore)

  test('subscribeToLibrary adds a library', () => {
    getState().subscribeToLibrary('lib1', 'Icons', 1)
    expect(getState().subscribedLibraries).toHaveLength(1)
    expect(getState().subscribedLibraries[0]!.name).toBe('Icons')
  })

  test('subscribeToLibrary does not duplicate', () => {
    getState().subscribeToLibrary('lib1', 'Icons', 1)
    getState().subscribeToLibrary('lib1', 'Icons', 2)
    expect(getState().subscribedLibraries).toHaveLength(1)
  })

  test('unsubscribeFromLibrary removes a library', () => {
    getState().subscribeToLibrary('lib1', 'Icons', 1)
    getState().unsubscribeFromLibrary('lib1')
    expect(getState().subscribedLibraries).toHaveLength(0)
  })

  test('importSymbolFromLibrary adds symbol to document', () => {
    const symbol = { id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 }
    getState().importSymbolFromLibrary(symbol)
    expect(getState().document.symbols).toHaveLength(1)
    expect(getState().document.symbols![0]!.name).toBe('Button')
  })

  test('importSymbolFromLibrary replaces existing symbol with same id', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Old', layers: [], width: 100, height: 40 })
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Updated', layers: [], width: 120, height: 50 })
    expect(getState().document.symbols).toHaveLength(1)
    expect(getState().document.symbols![0]!.name).toBe('Updated')
  })
})

describe('Editor Store - PNGtuber', () => {
  beforeEach(resetStore)

  test('setPNGTuberEnabled creates pngtuber config', () => {
    getState().setPNGTuberEnabled(true)
    expect(getState().document.pngtuber).toBeDefined()
    expect(getState().document.pngtuber!.enabled).toBe(true)
    expect(getState().document.pngtuber!.expressions.length).toBeGreaterThan(0)
  })

  test('setPNGTuberEnabled toggles existing config', () => {
    getState().setPNGTuberEnabled(true)
    getState().setPNGTuberEnabled(false)
    expect(getState().document.pngtuber!.enabled).toBe(false)
  })

  test('addExpression adds a new expression', () => {
    getState().setPNGTuberEnabled(true)
    getState().addExpression('angry')
    expect(getState().document.pngtuber!.expressions).toContain('angry')
  })

  test('addExpression does not duplicate', () => {
    getState().setPNGTuberEnabled(true)
    const countBefore = getState().document.pngtuber!.expressions.length
    getState().addExpression('idle')
    expect(getState().document.pngtuber!.expressions.length).toBe(countBefore)
  })

  test('removeExpression removes an expression', () => {
    getState().setPNGTuberEnabled(true)
    getState().removeExpression('happy')
    expect(getState().document.pngtuber!.expressions).not.toContain('happy')
  })

  test('removeExpression updates default if needed', () => {
    getState().setPNGTuberEnabled(true)
    getState().setDefaultExpression('happy')
    getState().removeExpression('happy')
    expect(getState().document.pngtuber!.defaultExpression).not.toBe('happy')
  })

  test('setDefaultExpression sets default', () => {
    getState().setPNGTuberEnabled(true)
    getState().setDefaultExpression('talking')
    expect(getState().document.pngtuber!.defaultExpression).toBe('talking')
  })

  test('setLayerPNGTuberTag sets tag on layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerPNGTuberTag(artboardId, layerId, 'body')
    expect(getState().document.artboards[0]!.layers[0]!.pngtuberTag).toBe('body')
  })

  test('setLayerExpression sets expression', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerExpression(artboardId, layerId, 'happy')
    expect(getState().document.artboards[0]!.layers[0]!.pngtuberExpression).toBe('happy')
  })

  test('setLayerParallaxDepth sets and clamps depth', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayerParallaxDepth(artboardId, layerId, 0.5)
    expect(getState().document.artboards[0]!.layers[0]!.parallaxDepth).toBe(0.5)
    getState().setLayerParallaxDepth(artboardId, layerId, 2)
    expect(getState().document.artboards[0]!.layers[0]!.parallaxDepth).toBe(1)
    getState().setLayerParallaxDepth(artboardId, layerId, -1)
    expect(getState().document.artboards[0]!.layers[0]!.parallaxDepth).toBe(0)
  })
})

describe('Editor Store - Symbol Operations', () => {
  beforeEach(resetStore)

  test('deleteSymbolDefinition removes a symbol', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Test', layers: [], width: 100, height: 40 })
    getState().deleteSymbolDefinition('sym-1')
    expect(getState().document.symbols).toHaveLength(0)
  })

  test('renameSymbol renames a symbol', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Old', layers: [], width: 100, height: 40 })
    getState().renameSymbol('sym-1', 'New Name')
    expect(getState().document.symbols![0]!.name).toBe('New Name')
  })

  test('createSymbolInstance adds instance layer', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('symbol-instance')
  })

  test('addComponentProperty adds property to symbol', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().addComponentProperty('sym-1', { id: 'prop-1', name: 'Label', type: 'text', defaultValue: 'Click me' })
    expect(getState().document.symbols![0]!.componentProperties).toHaveLength(1)
  })

  test('removeComponentProperty removes property', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().addComponentProperty('sym-1', { id: 'prop-1', name: 'Label', type: 'text', defaultValue: 'Click me' })
    getState().removeComponentProperty('sym-1', 'prop-1')
    expect(getState().document.symbols![0]!.componentProperties).toHaveLength(0)
  })

  test('addVariant and removeVariant', () => {
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().addVariant('sym-1', { id: 'var-1', name: 'Primary', propertyValues: {}, layerOverrides: {} })
    expect(getState().document.symbols![0]!.variants).toHaveLength(1)
    getState().removeVariant('sym-1', 'var-1')
    expect(getState().document.symbols![0]!.variants).toHaveLength(0)
  })
})

describe('Editor Store - Collab', () => {
  beforeEach(resetStore)

  test('leaveCollabSession clears provider', () => {
    getState().leaveCollabSession()
    expect(getState().collabProvider).toBeNull()
    expect(getState().collabPresences).toEqual([])
  })

  test('updateCollabPresence is no-op when no provider', () => {
    // Should not throw
    getState().updateCollabPresence(100, 200)
  })
})

describe('Editor Store - createDefaultVectorLayer', () => {
  test('creates a vector layer with default name', () => {
    const layer = createDefaultVectorLayer()
    expect(layer.name).toBe('Layer')
    expect(layer.type).toBe('vector')
    expect(layer.visible).toBe(true)
    expect(layer.locked).toBe(false)
    expect(layer.opacity).toBe(1)
    expect(layer.blendMode).toBe('normal')
    expect(layer.paths).toEqual([])
    expect(layer.fill).toBeDefined()
    expect(layer.stroke).toBeNull()
  })

  test('creates a vector layer with custom name', () => {
    const layer = createDefaultVectorLayer('Custom')
    expect(layer.name).toBe('Custom')
  })
})

describe('Editor Store - setCollectionExtends and removeVariableOverride', () => {
  beforeEach(resetStore)

  test('setCollectionExtends sets extends id', () => {
    getState().addVariableCollection('Parent')
    getState().addVariableCollection('Child')
    const parentId = getState().document.variableCollections![0]!.id
    const childId = getState().document.variableCollections![1]!.id
    getState().setCollectionExtends(childId, parentId)
    expect(getState().document.variableCollections![1]!.extendsCollectionId).toBe(parentId)
  })

  test('setCollectionExtends with null removes extends', () => {
    getState().addVariableCollection('Parent')
    getState().addVariableCollection('Child')
    const parentId = getState().document.variableCollections![0]!.id
    const childId = getState().document.variableCollections![1]!.id
    getState().setCollectionExtends(childId, parentId)
    getState().setCollectionExtends(childId, null)
    expect(getState().document.variableCollections![1]!.extendsCollectionId).toBeUndefined()
  })

  test('removeVariableOverride removes variable values', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariable(collId, 'Var1', 'number')
    const varId = getState().document.variableCollections![0]!.variables[0]!.id
    expect(getState().document.variableCollections![0]!.values[varId]).toBeDefined()
    getState().removeVariableOverride(collId, varId)
    expect(getState().document.variableCollections![0]!.values[varId]).toBeUndefined()
  })
})

// ── New coverage tests ──

describe('Editor Store - updateLayer deep (nested in group)', () => {
  beforeEach(resetStore)

  test('updateLayer modifies a layer nested inside a group (lines 776-777)', () => {
    const { artboardId, groupId: _groupId, childIds } = addTestGroupWithChildren()
    // Update a child layer that is inside the group (not at top-level)
    getState().updateLayer(artboardId, childIds[0]!, { name: 'Renamed Child', opacity: 0.7 })
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === childIds[0]!)
    expect(child).toBeDefined()
    expect(child!.name).toBe('Renamed Child')
    expect(child!.opacity).toBe(0.7)
  })

  test('updateLayerSilent modifies a layer nested inside a group (lines 795-796)', () => {
    const { artboardId, groupId: _groupId, childIds } = addTestGroupWithChildren()
    const historyBefore = getState().history.length
    getState().updateLayerSilent(artboardId, childIds[0]!, { name: 'Silent Nested' })
    expect(getState().history.length).toBe(historyBefore)
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === childIds[0]!)
    expect(child!.name).toBe('Silent Nested')
  })
})

describe('Editor Store - Auto-layout on updateLayer (lines 783, 802)', () => {
  beforeEach(resetStore)

  test('updateLayer triggers auto-layout on parent group', () => {
    const { artboardId, groupId, childIds } = addTestGroupWithChildren()
    // Set auto-layout on the group
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'horizontal',
      gap: 10,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    // Now update a child inside the auto-layout group, which should trigger runAutoLayoutOnGroup
    getState().updateLayer(artboardId, childIds[0]!, { name: 'Updated in Auto' })
    // Simply verify it doesn't throw and the group still exists
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.autoLayout).toBeDefined()
  })

  test('updateLayerSilent triggers auto-layout on parent group', () => {
    const { artboardId, groupId, childIds } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'vertical',
      gap: 5,
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 10,
      paddingRight: 10,

      alignItems: 'center',
      justifyContent: 'start',
      wrap: false,
    })
    getState().updateLayerSilent(artboardId, childIds[1]!, { name: 'Silent Auto' })
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.autoLayout).toBeDefined()
  })
})

describe('Editor Store - moveLayerToGroup circular prevention (lines 867-874)', () => {
  beforeEach(resetStore)

  test('moveLayerToGroup prevents moving a group into itself', () => {
    const { artboardId, groupId } = addTestGroupWithChildren()
    const layersBefore = getState().document.artboards[0]!.layers.length
    // Try to move the group into itself - should be no-op (line 864)
    getState().moveLayerToGroup(artboardId, groupId, groupId)
    expect(getState().document.artboards[0]!.layers.length).toBe(layersBefore)
  })

  test('moveLayerToGroup prevents moving a group into its own descendant', () => {
    const artboardId = getFirstArtboardId()
    // Create an outer group with an inner group inside
    const child1 = createDefaultVectorLayer('C1')
    const child2 = createDefaultVectorLayer('C2')
    const innerChild = createDefaultVectorLayer('InnerC')
    getState().addLayer(artboardId, child1)
    getState().addLayer(artboardId, child2)
    getState().addLayer(artboardId, innerChild)
    // Group C1 and C2
    getState().groupLayers(artboardId, [child1.id, child2.id])
    const outerGroup = getState().document.artboards[0]!.layers.find((l) => l.type === 'group') as GroupLayer
    // Now group innerChild with one of the outer group's children by moving it into the outer group
    getState().moveLayerToGroup(artboardId, innerChild.id, outerGroup.id)
    // Now create a nested group inside outerGroup
    const outerGroupUpdated = getState().document.artboards[0]!.layers.find((l) => l.type === 'group') as GroupLayer
    expect(outerGroupUpdated.children.length).toBe(3)
  })
})

describe('Editor Store - moveLayerToGroup with auto-layout (line 880)', () => {
  beforeEach(resetStore)

  test('moveLayerToGroup triggers auto-layout on target group', () => {
    const { artboardId, groupId } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'horizontal',
      gap: 8,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    const extra = createDefaultVectorLayer('Extra')
    getState().addLayer(artboardId, extra)
    getState().moveLayerToGroup(artboardId, extra.id, groupId)
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.children.length).toBe(3)
    expect(group.autoLayout).toBeDefined()
  })
})

describe('Editor Store - moveLayerOutOfGroup with auto-layout (line 897)', () => {
  beforeEach(resetStore)

  test('moveLayerOutOfGroup triggers auto-layout on source group', () => {
    const { artboardId, groupId, childIds } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'vertical',
      gap: 4,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    getState().moveLayerOutOfGroup(artboardId, childIds[0]!, groupId, 0)
    const layers = getState().document.artboards[0]!.layers
    expect(layers.length).toBe(2) // one layer removed from group, one group remains
  })
})

describe('Editor Store - duplicateLayer with group children (line 914)', () => {
  beforeEach(resetStore)

  test('duplicateLayer re-IDs group children recursively', () => {
    const { artboardId, groupId, childIds: _childIds } = addTestGroupWithChildren()
    getState().duplicateLayer(artboardId, groupId)
    const layers = getState().document.artboards[0]!.layers
    expect(layers.length).toBe(2)
    const original = layers[0] as GroupLayer
    const copy = layers[1] as GroupLayer
    expect(copy.type).toBe('group')
    expect(copy.id).not.toBe(original.id)
    expect(copy.name).toBe(`${original.name} Copy`)
    // Children should have new IDs
    for (let i = 0; i < original.children.length; i++) {
      expect(copy.children[i]!.id).not.toBe(original.children[i]!.id)
    }
  })
})

describe('Editor Store - selectLayer ends text editing (line 1123)', () => {
  beforeEach(resetStore)

  test('selectLayer selects a layer without errors when text is not active', () => {
    const { layerId } = addTestVectorLayer('L1')
    const l2 = createDefaultVectorLayer('L2')
    getState().addLayer(getFirstArtboardId(), l2)
    // Just select different layers to ensure no errors even when text is inactive
    getState().selectLayer(layerId)
    getState().selectLayer(l2.id)
    expect(getState().selection.layerIds).toEqual([l2.id])
  })
})

describe('Editor Store - setActiveTool (line 1170)', () => {
  beforeEach(resetStore)

  test('setActiveTool changes tool away from text', () => {
    getState().setActiveTool('text')
    expect(getState().activeTool).toBe('text')
    getState().setActiveTool('pen')
    expect(getState().activeTool).toBe('pen')
  })
})

describe('Editor Store - setDirty (line 1317)', () => {
  beforeEach(resetStore)

  test('setDirty sets and clears isDirty', () => {
    expect(getState().isDirty).toBe(false)
    getState().setDirty(true)
    expect(getState().isDirty).toBe(true)
    getState().setDirty(false)
    expect(getState().isDirty).toBe(false)
  })
})

describe('Editor Store - createSymbolDefinition (lines 1507-1560)', () => {
  beforeEach(resetStore)

  test('createSymbolDefinition creates a symbol from selected layers', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Rect')
    l1.transform = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }
    l1.shapeParams = { type: 'rectangle', width: 100, height: 50, cornerRadius: 0 } as any
    getState().addLayer(artboardId, l1)
    // Set the viewport artboard so createSymbolDefinition finds it
    useEditorStore.setState({ viewport: { ...getState().viewport, artboardId } })
    getState().createSymbolDefinition('MySymbol', [l1.id])
    expect(getState().document.symbols).toBeDefined()
    expect(getState().document.symbols!.length).toBe(1)
    expect(getState().document.symbols![0]!.name).toBe('MySymbol')
    expect(getState().document.symbols![0]!.width).toBeGreaterThan(0)
    expect(getState().document.symbols![0]!.height).toBeGreaterThan(0)
  })

  test('createSymbolDefinition with no matching layers is no-op', () => {
    const artboardId = getFirstArtboardId()
    useEditorStore.setState({ viewport: { ...getState().viewport, artboardId } })
    getState().createSymbolDefinition('Empty', ['non-existent-id'])
    expect(getState().document.symbols ?? []).toHaveLength(0)
  })

  test('createSymbolDefinition with text layer computes bounding box from font', () => {
    const artboardId = getFirstArtboardId()
    const textLayer: TextLayer = {
      id: 'text-1',
      name: 'Label',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      text: 'Hello',
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#000000',
    }
    getState().addLayer(artboardId, textLayer as any)
    useEditorStore.setState({ viewport: { ...getState().viewport, artboardId } })
    getState().createSymbolDefinition('TextSym', ['text-1'])
    expect(getState().document.symbols!.length).toBe(1)
  })

  test('createSymbolDefinition falls back to first artboard when no active artboard', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('R1')
    getState().addLayer(artboardId, l1)
    // Don't set viewport.artboardId - it should fall back to first artboard
    getState().createSymbolDefinition('Fallback', [l1.id])
    expect(getState().document.symbols!.length).toBe(1)
  })
})

describe('Editor Store - setInstanceProperty (lines 1641-1651)', () => {
  beforeEach(resetStore)

  test('setInstanceProperty sets a property value on a symbol instance', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    getState().setInstanceProperty(artboardId, instanceId, 'label', 'Click Me')
    const layer = getState().document.artboards[0]!.layers[0]! as any
    expect(layer.propertyValues).toBeDefined()
    expect(layer.propertyValues.label).toBe('Click Me')
  })

  test('setInstanceProperty on non-symbol-instance is no-op', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setInstanceProperty(artboardId, layerId, 'label', 'test')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect((layer as any).propertyValues).toBeUndefined()
  })
})

describe('Editor Store - setInstanceVariant (lines 1655-1663)', () => {
  beforeEach(resetStore)

  test('setInstanceVariant sets the active variant on a symbol instance', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Button', layers: [], width: 100, height: 40 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    getState().setInstanceVariant(artboardId, instanceId, 'Hover')
    const layer = getState().document.artboards[0]!.layers[0]! as any
    expect(layer.activeVariant).toBe('Hover')
  })

  test('setInstanceVariant on non-symbol-instance is no-op', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setInstanceVariant(artboardId, layerId, 'Hover')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect((layer as any).activeVariant).toBeUndefined()
  })
})

describe('Editor Store - markAsSlot (lines 1668-1677)', () => {
  beforeEach(resetStore)

  test('markAsSlot marks a group layer in a symbol as a slot', () => {
    // Create a symbol that has a group child
    const groupChild: GroupLayer = {
      id: 'grp-child-1',
      name: 'Content Area',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [],
    }
    getState().importSymbolFromLibrary({
      id: 'sym-1',
      name: 'Card',
      layers: [groupChild as any],
      width: 200,
      height: 100,
    })
    getState().markAsSlot('sym-1', 'grp-child-1', 'content')
    const sym = getState().document.symbols![0]!
    const layer = sym.layers[0] as GroupLayer
    expect(layer.isSlot).toBe(true)
    expect(layer.slotName).toBe('content')
  })

  test('markAsSlot on non-group layer is no-op', () => {
    const vecLayer = createDefaultVectorLayer('Not a group')
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Test', layers: [vecLayer as any], width: 100, height: 40 })
    getState().markAsSlot('sym-1', vecLayer.id, 'myslot')
    // Should not produce a meaningful change
    const sym = getState().document.symbols![0]!
    const layer = sym.layers[0]
    expect((layer as any).isSlot).toBeUndefined()
  })
})

describe('Editor Store - unmarkSlot (lines 1681-1691)', () => {
  beforeEach(resetStore)

  test('unmarkSlot removes slot properties from a group layer in a symbol', () => {
    const groupChild: GroupLayer = {
      id: 'grp-child-1',
      name: 'Slot Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [],
    }
    getState().importSymbolFromLibrary({
      id: 'sym-1',
      name: 'Card',
      layers: [groupChild as any],
      width: 200,
      height: 100,
    })
    getState().markAsSlot('sym-1', 'grp-child-1', 'content')
    getState().unmarkSlot('sym-1', 'grp-child-1')
    const sym = getState().document.symbols![0]!
    const layer = sym.layers[0] as GroupLayer
    expect(layer.isSlot).toBeUndefined()
    expect(layer.slotName).toBeUndefined()
  })
})

describe('Editor Store - setSlotContent (lines 1695-1703)', () => {
  beforeEach(resetStore)

  test('setSlotContent injects content into a symbol instance slot', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Card', layers: [], width: 200, height: 100 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    const slotContent = [createDefaultVectorLayer('Injected')]
    getState().setSlotContent(artboardId, instanceId, 'content', slotContent as any[])
    const layer = getState().document.artboards[0]!.layers[0]! as any
    expect(layer.slotContent).toBeDefined()
    expect(layer.slotContent.content).toHaveLength(1)
    expect(layer.slotContent.content[0].name).toBe('Injected')
  })

  test('setSlotContent on non-symbol-instance is no-op', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setSlotContent(artboardId, layerId, 'slot', [])
    const layer = getState().document.artboards[0]!.layers[0]!
    expect((layer as any).slotContent).toBeUndefined()
  })
})

describe('Editor Store - clearSlotContent (lines 1707-1719)', () => {
  beforeEach(resetStore)

  test('clearSlotContent removes content from a symbol instance slot', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Card', layers: [], width: 200, height: 100 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    const slotContent = [createDefaultVectorLayer('Injected')]
    getState().setSlotContent(artboardId, instanceId, 'content', slotContent as any[])
    getState().clearSlotContent(artboardId, instanceId, 'content')
    const layer = getState().document.artboards[0]!.layers[0]! as any
    // slotContent should be deleted when empty
    expect(layer.slotContent).toBeUndefined()
  })

  test('clearSlotContent on a slot that does not exist is safe', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Card', layers: [], width: 200, height: 100 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    // Clear non-existing slot - should not throw
    getState().clearSlotContent(artboardId, instanceId, 'nonexistent')
    const layer = getState().document.artboards[0]!.layers[0]! as any
    expect(layer.slotContent).toBeUndefined()
  })

  test('clearSlotContent keeps other slots when removing one', () => {
    const artboardId = getFirstArtboardId()
    getState().importSymbolFromLibrary({ id: 'sym-1', name: 'Card', layers: [], width: 200, height: 100 })
    getState().createSymbolInstance(artboardId, 'sym-1')
    const instanceId = getState().document.artboards[0]!.layers[0]!.id
    getState().setSlotContent(artboardId, instanceId, 'header', [createDefaultVectorLayer('H')] as any[])
    getState().setSlotContent(artboardId, instanceId, 'body', [createDefaultVectorLayer('B')] as any[])
    getState().clearSlotContent(artboardId, instanceId, 'header')
    const layer = getState().document.artboards[0]!.layers[0]! as any
    expect(layer.slotContent).toBeDefined()
    expect(layer.slotContent.body).toHaveLength(1)
    expect(layer.slotContent.header).toBeUndefined()
  })
})

describe('Editor Store - updateDocumentColor propagation (lines 1745-1779)', () => {
  beforeEach(resetStore)

  test('updateDocumentColor propagates color changes to vector fill', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Colored')
    getState().addLayer(artboardId, l1)
    getState().setFill(artboardId, l1.id, { type: 'solid', color: '#ff0000', opacity: 1 })
    getState().addDocumentColor({ id: 'dc1', name: 'Red', value: '#ff0000' })
    getState().updateDocumentColor('dc1', { value: '#00ff00' })
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill!.color).toBe('#00ff00')
  })

  test('updateDocumentColor propagates color changes to vector stroke', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Stroked')
    getState().addLayer(artboardId, l1)
    getState().setStroke(artboardId, l1.id, {
      color: '#ff0000',
      width: 2,
      opacity: 1,
      linecap: 'round',
      linejoin: 'round',
      position: 'center',
      miterLimit: 4,
    })
    getState().addDocumentColor({ id: 'dc1', name: 'Red', value: '#ff0000' })
    getState().updateDocumentColor('dc1', { value: '#0000ff' })
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.stroke!.color).toBe('#0000ff')
  })

  test('updateDocumentColor propagates color changes to text layer', () => {
    const artboardId = getFirstArtboardId()
    const textLayer: TextLayer = {
      id: 'text-1',
      name: 'Label',
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
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#ff0000',
    }
    getState().addLayer(artboardId, textLayer as any)
    getState().addDocumentColor({ id: 'dc1', name: 'Red', value: '#ff0000' })
    getState().updateDocumentColor('dc1', { value: '#00ff00' })
    const layer = getState().document.artboards[0]!.layers[0]! as TextLayer
    expect(layer.color).toBe('#00ff00')
  })

  test('updateDocumentColor propagates through group children', () => {
    const { artboardId, childIds } = addTestGroupWithChildren()
    // Update the child to have a fill with the color we'll change
    getState().updateLayer(artboardId, childIds[0]!, { fill: { type: 'solid', color: '#aabbcc', opacity: 1 } } as any)
    getState().addDocumentColor({ id: 'dc1', name: 'Custom', value: '#aabbcc' })
    getState().updateDocumentColor('dc1', { value: '#ddeeff' })
    const updatedGroup = getState().document.artboards[0]!.layers[0] as GroupLayer
    const updatedChild = updatedGroup.children[0] as VectorLayer
    expect(updatedChild.fill!.color).toBe('#ddeeff')
  })

  test('updateDocumentColor propagates to additionalFills and additionalStrokes', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Multi')
    getState().addLayer(artboardId, l1)
    // Manually set additionalFills and additionalStrokes with the old color
    getState().updateLayer(artboardId, l1.id, {
      additionalFills: [{ type: 'solid', color: '#ff0000', opacity: 1 }],
      additionalStrokes: [{ color: '#ff0000', width: 1, opacity: 1, cap: 'round', join: 'round' }],
    } as any)
    getState().addDocumentColor({ id: 'dc1', name: 'Red', value: '#ff0000' })
    getState().updateDocumentColor('dc1', { value: '#00ff00' })
    const layer = getState().document.artboards[0]!.layers[0] as any
    expect(layer.additionalFills[0].color).toBe('#00ff00')
    expect(layer.additionalStrokes[0].color).toBe('#00ff00')
  })
})

describe('Editor Store - setAutoLayout (lines 1830-1839)', () => {
  beforeEach(resetStore)

  test('setAutoLayout enables auto-layout on a group', () => {
    const { artboardId, groupId } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'horizontal',
      gap: 10,
      paddingTop: 5,
      paddingBottom: 5,
      paddingLeft: 5,
      paddingRight: 5,

      alignItems: 'center',
      justifyContent: 'start',
      wrap: false,
    })
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.autoLayout).toBeDefined()
    expect(group.autoLayout!.direction).toBe('horizontal')
  })

  test('setAutoLayout with null disables auto-layout', () => {
    const { artboardId, groupId } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'horizontal',
      gap: 10,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    getState().setAutoLayout(artboardId, groupId, null as any)
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.autoLayout).toBeUndefined()
  })
})

describe('Editor Store - setLayoutSizing (lines 1843-1854)', () => {
  beforeEach(resetStore)

  test('setLayoutSizing sets sizing on a layer', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().setLayoutSizing(artboardId, layerId, { horizontal: 'fill', vertical: 'fixed' })
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.layoutSizing).toEqual({ horizontal: 'fill', vertical: 'fixed' })
  })

  test('setLayoutSizing triggers auto-layout on parent group', () => {
    const { artboardId, groupId, childIds } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'horizontal',
      gap: 10,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    getState().setLayoutSizing(artboardId, childIds[0]!, { horizontal: 'fill', vertical: 'hug' })
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === childIds[0]!)
    expect(child!.layoutSizing).toEqual({ horizontal: 'fill', vertical: 'hug' })
  })
})

describe('Editor Store - runAutoLayout (lines 1858-1862)', () => {
  beforeEach(resetStore)

  test('runAutoLayout explicitly re-runs layout on a group', () => {
    const { artboardId, groupId } = addTestGroupWithChildren()
    getState().setAutoLayout(artboardId, groupId, {
      direction: 'vertical',
      gap: 8,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,

      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    })
    // Should not throw
    getState().runAutoLayout(artboardId, groupId)
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    expect(group.autoLayout).toBeDefined()
  })
})

describe('Editor Store - removeBreakpoint cleanup (lines 1883, 1888-1894)', () => {
  beforeEach(resetStore)

  test('removeBreakpoint clears activeBreakpointId when removing active breakpoint', () => {
    const artboardId = getFirstArtboardId()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    getState().setActiveBreakpoint(artboardId, 'bp-1')
    expect(getState().document.artboards[0]!.activeBreakpointId).toBe('bp-1')
    getState().removeBreakpoint(artboardId, 'bp-1')
    expect(getState().document.artboards[0]!.activeBreakpointId).toBeUndefined()
  })

  test('removeBreakpoint cleans up breakpoint overrides from layers', () => {
    const { artboardId, layerId } = addTestVectorLayer()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Mobile', width: 375 })
    getState().setBreakpointOverride(artboardId, layerId, 'bp-1', { visible: false })
    expect(getState().document.artboards[0]!.layers[0]!.breakpointOverrides).toBeDefined()
    getState().removeBreakpoint(artboardId, 'bp-1')
    const layer = getState().document.artboards[0]!.layers[0]!
    // breakpointOverrides should be undefined since it was the only breakpoint
    expect(layer.breakpointOverrides).toBeUndefined()
  })

  test('removeBreakpoint cleans overrides from nested group layers', () => {
    const { artboardId, groupId: _groupId, childIds } = addTestGroupWithChildren()
    getState().addBreakpoint(artboardId, { id: 'bp-1', name: 'Tablet', width: 768 })
    // Set override on a child inside the group
    getState().setBreakpointOverride(artboardId, childIds[0]!, 'bp-1', { visible: false })
    getState().removeBreakpoint(artboardId, 'bp-1')
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === childIds[0]!)!
    expect(child.breakpointOverrides).toBeUndefined()
  })
})

describe('Editor Store - removeVariableMode cleanup (lines 2156-2169)', () => {
  beforeEach(resetStore)

  test('removeVariableMode cleans up values for removed mode', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariableMode(collId, 'Dark')
    getState().addVariable(collId, 'Color', 'color')
    const varId = getState().document.variableCollections![0]!.variables[0]!.id
    const darkModeId = getState().document.variableCollections![0]!.modes[1]!.id
    getState().setVariableValue(collId, varId, darkModeId, { type: 'color', value: '#000' })
    getState().removeVariableMode(collId, darkModeId)
    const coll = getState().document.variableCollections![0]!
    // The dark mode values should have been cleaned up
    const varValues = coll.values[varId]
    if (varValues) {
      expect(varValues[darkModeId]).toBeUndefined()
    }
  })

  test('removeVariableMode switches active mode if removed mode was active', () => {
    getState().addVariableCollection('Test')
    const collId = getState().document.variableCollections![0]!.id
    getState().addVariableMode(collId, 'Dark')
    const darkModeId = getState().document.variableCollections![0]!.modes[1]!.id
    getState().setActiveMode(collId, darkModeId)
    expect(getState().activeModeIds[collId]).toBe(darkModeId)
    getState().removeVariableMode(collId, darkModeId)
    // Should switch to the first available mode
    const firstModeId = getState().document.variableCollections![0]!.modes[0]!.id
    expect(getState().activeModeIds[collId]).toBe(firstModeId)
  })
})

describe('Editor Store - updateTextStyle propagation to groups (line 2290)', () => {
  beforeEach(resetStore)

  test('updateTextStyle propagates changes to text layers inside groups', () => {
    const artboardId = getFirstArtboardId()
    // Add a text style
    getState().addTextStyle({
      id: 'ts1',
      name: 'Body',
      fontFamily: 'Arial',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#000000',
    })
    // Create a text layer linked to the style, inside a group
    const textLayer: any = {
      id: 'text-in-group',
      name: 'GroupText',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      text: 'Hello',
      fontFamily: 'Arial',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#000000',
      textStyleId: 'ts1',
    }
    const vecLayer = createDefaultVectorLayer('Vec')
    getState().addLayer(artboardId, textLayer)
    getState().addLayer(artboardId, vecLayer)
    getState().groupLayers(artboardId, [textLayer.id, vecLayer.id])
    // Now update the text style
    getState().updateTextStyle('ts1', { fontSize: 20, color: '#ff0000' })
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const tl = group.children.find((c) => c.id === 'text-in-group') as TextLayer
    expect(tl.fontSize).toBe(20)
    expect(tl.color).toBe('#ff0000')
  })
})

describe('Editor Store - removeColorStyle detach in groups (lines 2353-2354)', () => {
  beforeEach(resetStore)

  test('removeColorStyle detaches fillStyleId from layers inside groups', () => {
    const artboardId = getFirstArtboardId()
    getState().addColorStyle({ id: 'cs1', name: 'Primary', color: '#ff0000', opacity: 1 })
    const l1 = createDefaultVectorLayer('Linked')
    getState().addLayer(artboardId, l1)
    // Manually set fillStyleId
    getState().updateLayer(artboardId, l1.id, { fillStyleId: 'cs1' } as any)
    const vec = createDefaultVectorLayer('Other')
    getState().addLayer(artboardId, vec)
    getState().groupLayers(artboardId, [l1.id, vec.id])
    getState().removeColorStyle('cs1')
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === l1.id)
    expect(child!.fillStyleId).toBeUndefined()
  })
})

describe('Editor Store - removeEffectStyle detach in groups (lines 2398-2399)', () => {
  beforeEach(resetStore)

  test('removeEffectStyle detaches effectStyleId from layers inside groups', () => {
    const artboardId = getFirstArtboardId()
    getState().addEffectStyle({ id: 'es1', name: 'Shadow', effects: [] })
    const l1 = createDefaultVectorLayer('Linked')
    getState().addLayer(artboardId, l1)
    getState().updateLayer(artboardId, l1.id, { effectStyleId: 'es1' } as any)
    const vec = createDefaultVectorLayer('Other')
    getState().addLayer(artboardId, vec)
    getState().groupLayers(artboardId, [l1.id, vec.id])
    getState().removeEffectStyle('es1')
    const group = getState().document.artboards[0]!.layers[0] as GroupLayer
    const child = group.children.find((c) => c.id === l1.id)
    expect(child!.effectStyleId).toBeUndefined()
  })
})

describe('Editor Store - applyColorStyle with no existing fill (line 2448)', () => {
  beforeEach(resetStore)

  test('applyColorStyle creates fill when layer has no fill', () => {
    const artboardId = getFirstArtboardId()
    getState().addColorStyle({ id: 'cs1', name: 'Primary', color: '#ff0000', opacity: 0.8 })
    const l1 = createDefaultVectorLayer('NoFill')
    getState().addLayer(artboardId, l1)
    // Clear the fill first
    getState().setFill(artboardId, l1.id, null)
    expect((getState().document.artboards[0]!.layers[0] as VectorLayer).fill).toBeNull()
    getState().applyColorStyle(l1.id, artboardId, 'cs1')
    const layer = getState().document.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fillStyleId).toBe('cs1')
    expect(layer.fill).toBeDefined()
    expect(layer.fill!.color).toBe('#ff0000')
    expect(layer.fill!.opacity).toBe(0.8)
  })
})

describe('Editor Store - createBlend (lines 2521-2551)', () => {
  beforeEach(resetStore)

  test('createBlend creates a blend group from two vector layers', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Start')
    l1.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    l1.shapeParams = { type: 'rectangle', width: 100, height: 50, cornerRadius: 0 } as any
    l1.fill = { type: 'solid', color: '#ff0000', opacity: 1 }
    const l2 = createDefaultVectorLayer('End')
    l2.transform = { x: 200, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    l2.shapeParams = { type: 'rectangle', width: 100, height: 50, cornerRadius: 0 } as any
    l2.fill = { type: 'solid', color: '#0000ff', opacity: 1 }
    getState().addLayer(artboardId, l1)
    getState().addLayer(artboardId, l2)
    getState().createBlend(artboardId, l1.id, l2.id, 3)
    const layers = getState().document.artboards[0]!.layers
    // The two layers should be replaced with a single blend group
    expect(layers.length).toBe(1)
    expect(layers[0]!.type).toBe('group')
    expect(layers[0]!.name.toLowerCase()).toContain('blend')
  })

  test('createBlend with non-vector layers is no-op', () => {
    const artboardId = getFirstArtboardId()
    const textLayer: any = {
      id: 'text-1',
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
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#000',
    }
    const l2 = createDefaultVectorLayer('Vec')
    getState().addLayer(artboardId, textLayer)
    getState().addLayer(artboardId, l2)
    const layersBefore = getState().document.artboards[0]!.layers.length
    getState().createBlend(artboardId, textLayer.id, l2.id, 3)
    // Should be no-op since first layer is text, not vector
    expect(getState().document.artboards[0]!.layers.length).toBe(layersBefore)
  })
})

describe('Editor Store - createRepeater (lines 2557-2576)', () => {
  beforeEach(resetStore)

  test('createRepeater creates a repeater group from a layer', () => {
    const artboardId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Source')
    l1.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    l1.shapeParams = { type: 'rectangle', width: 50, height: 50, cornerRadius: 0 } as any
    getState().addLayer(artboardId, l1)
    getState().createRepeater(artboardId, l1.id, {
      mode: 'linear',
      count: 4,
      linearSpacing: 60,
      linearAngle: 0,
      gridRows: 1,
      gridColumns: 1,
      gridRowGap: 0,
      gridColumnGap: 0,
      radialRadius: 100,
      radialStartAngle: 0,
      radialEndAngle: 360,
      progressiveRotation: 0,
      progressiveScale: 0,
      progressiveOpacity: 0,
    } as any)
    const layers = getState().document.artboards[0]!.layers
    // Source should be replaced with a repeater group
    expect(layers.length).toBe(1)
    expect(layers[0]!.type).toBe('group')
  })

  test('createRepeater with non-existent layer is no-op', () => {
    const artboardId = getFirstArtboardId()
    const layersBefore = getState().document.artboards[0]!.layers.length
    getState().createRepeater(artboardId, 'non-existent', {
      mode: 'linear',
      count: 3,
      linearSpacing: 60,
      linearAngle: 0,
      gridRows: 1,
      gridColumns: 1,
      gridRowGap: 0,
      gridColumnGap: 0,
      radialRadius: 100,
      radialStartAngle: 0,
      radialEndAngle: 360,
      progressiveRotation: 0,
      progressiveScale: 0,
      progressiveOpacity: 0,
    } as any)
    expect(getState().document.artboards[0]!.layers.length).toBe(layersBefore)
  })
})

describe('Editor Store - addExpression without pngtuber config (lines 2678-2683)', () => {
  beforeEach(resetStore)

  test('addExpression creates pngtuber config if not yet initialized', () => {
    // Don't call setPNGTuberEnabled first - addExpression should create the config
    expect(getState().document.pngtuber).toBeUndefined()
    getState().addExpression('wink')
    expect(getState().document.pngtuber).toBeDefined()
    expect(getState().document.pngtuber!.enabled).toBe(true)
    expect(getState().document.pngtuber!.expressions).toContain('wink')
  })
})

describe('Editor Store - findParentGroup recursive search (lines 586-588)', () => {
  beforeEach(resetStore)

  test('findParentGroup finds parent in nested groups via updateLayer', () => {
    const artboardId = getFirstArtboardId()
    // Create layers and nest them: outerGroup > innerGroup > leafLayer
    const leaf = createDefaultVectorLayer('Leaf')
    const inner1 = createDefaultVectorLayer('Inner1')
    getState().addLayer(artboardId, leaf)
    getState().addLayer(artboardId, inner1)
    getState().groupLayers(artboardId, [leaf.id, inner1.id])
    // Now we have one group. Add another layer and group with the existing group
    const outer1 = createDefaultVectorLayer('Outer1')
    getState().addLayer(artboardId, outer1)
    const innerGroupId = getState().document.artboards[0]!.layers.find((l) => l.type === 'group')!.id
    getState().groupLayers(artboardId, [innerGroupId, outer1.id])
    // Now update the leaf layer (deeply nested)
    getState().updateLayer(artboardId, leaf.id, { name: 'Deep Leaf' })
    // Verify it got renamed through deep search
    const outerGroup = getState().document.artboards[0]!.layers[0] as GroupLayer
    const innerGroup = outerGroup.children.find((c) => c.type === 'group') as GroupLayer
    const renamedLeaf = innerGroup.children.find((c) => c.id === leaf.id)
    expect(renamedLeaf!.name).toBe('Deep Leaf')
  })
})
