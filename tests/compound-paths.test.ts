import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { makeCompoundPath, releaseCompoundPath } from '@/tools/compound-paths'
import type { VectorLayer, TextLayer, Path, Layer } from '@/types'

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
  return `cp-${++counter}`
}

function makePath(closed = true): Path {
  return {
    id: uid(),
    segments: [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 10, y: 0 },
      { type: 'line', x: 10, y: 10 },
      { type: 'close' },
    ],
    closed,
  }
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
    paths: [makePath()],
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

// ── makeCompoundPath tests ──

describe('makeCompoundPath', () => {
  beforeEach(resetStore)

  it('combines two vector layers into a single compound path', () => {
    const v1 = addVectorLayer({ name: 'Rect' })
    const v2 = addVectorLayer({ name: 'Circle' })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const layers = artboardLayers()
    // The two original layers should be removed, one compound layer added
    expect(layers.length).toBe(1)
    expect(layers[0]!.name).toBe('Compound Path')
    expect(layers[0]!.type).toBe('vector')
    const compound = layers[0] as VectorLayer
    expect(compound.paths.length).toBe(2)
  })

  it('sets fillRule to evenodd on all paths', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    for (const path of compound.paths) {
      expect(path.fillRule).toBe('evenodd')
    }
  })

  it('copies fill and stroke from the first selected layer', () => {
    const v1 = addVectorLayer({
      fill: { type: 'solid', color: '#00ff00', opacity: 0.8 },
      stroke: {
        width: 3,
        color: '#ff00ff',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'bevel',
        miterLimit: 4,
      },
    })
    const v2 = addVectorLayer({
      fill: { type: 'solid', color: '#0000ff', opacity: 1 },
      stroke: null,
    })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.fill!.color).toBe('#00ff00')
    expect(compound.fill!.opacity).toBe(0.8)
    expect(compound.stroke!.color).toBe('#ff00ff')
    expect(compound.stroke!.width).toBe(3)
  })

  it('preserves opacity and blendMode from the first layer', () => {
    const v1 = addVectorLayer({ opacity: 0.5, blendMode: 'multiply' })
    const v2 = addVectorLayer({ opacity: 0.8, blendMode: 'screen' })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.opacity).toBe(0.5)
    expect(compound.blendMode).toBe('multiply')
  })

  it('selects the new compound layer after creation', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const sel = selection()
    expect(sel.length).toBe(1)
    const compound = artboardLayers()[0] as VectorLayer
    expect(sel[0]).toBe(compound.id)
  })

  it('gives new unique IDs to all paths', () => {
    const path1 = makePath()
    const path2 = makePath()
    const v1 = addVectorLayer({ paths: [path1] })
    const v2 = addVectorLayer({ paths: [path2] })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.paths[0]!.id).not.toBe(path1.id)
    expect(compound.paths[1]!.id).not.toBe(path2.id)
    expect(compound.paths[0]!.id).not.toBe(compound.paths[1]!.id)
  })

  it('handles layers with multiple paths each', () => {
    const v1 = addVectorLayer({ paths: [makePath(), makePath()] })
    const v2 = addVectorLayer({ paths: [makePath()] })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.paths.length).toBe(3)
  })

  it('combines three or more vector layers', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()
    const v3 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)
    useEditorStore.getState().selectLayer(v3.id, true)

    makeCompoundPath()

    const layers = artboardLayers()
    expect(layers.length).toBe(1)
    const compound = layers[0] as VectorLayer
    expect(compound.paths.length).toBe(3)
  })

  it('handles null fill on first layer', () => {
    const v1 = addVectorLayer({ fill: null })
    const v2 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.fill).toBeNull()
  })

  it('handles null stroke on first layer', () => {
    const v1 = addVectorLayer({ stroke: null })
    const v2 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()

    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.stroke).toBeNull()
  })

  describe('edge cases', () => {
    it('does nothing with no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      makeCompoundPath()
      // Should not throw
    })

    it('does nothing with no selection', () => {
      addVectorLayer()
      addVectorLayer()
      useEditorStore.getState().deselectAll()
      makeCompoundPath()

      expect(artboardLayers().length).toBe(2)
    })

    it('does nothing with only one layer selected', () => {
      const v1 = addVectorLayer()
      addVectorLayer()

      useEditorStore.getState().selectLayer(v1.id)
      makeCompoundPath()

      expect(artboardLayers().length).toBe(2)
    })

    it('does nothing when fewer than two vector layers are selected (one vector + one text)', () => {
      const v1 = addVectorLayer()
      const t1 = addTextLayer()

      useEditorStore.getState().selectLayer(v1.id)
      useEditorStore.getState().selectLayer(t1.id, true)

      makeCompoundPath()

      // No compound created — still 2 layers
      expect(artboardLayers().length).toBe(2)
    })

    it('does nothing when two non-vector layers are selected', () => {
      const t1 = addTextLayer()
      const t2 = addTextLayer()

      useEditorStore.getState().selectLayer(t1.id)
      useEditorStore.getState().selectLayer(t2.id, true)

      makeCompoundPath()

      expect(artboardLayers().length).toBe(2)
    })

    it('preserves non-selected layers', () => {
      const v1 = addVectorLayer({ name: 'A' })
      const v2 = addVectorLayer({ name: 'B' })
      const v3 = addVectorLayer({ name: 'Bystander' })

      useEditorStore.getState().selectLayer(v1.id)
      useEditorStore.getState().selectLayer(v2.id, true)

      makeCompoundPath()

      const layers = artboardLayers()
      // v3 (bystander) should still exist plus the compound
      const names = layers.map((l) => l.name)
      expect(names).toContain('Bystander')
      expect(names).toContain('Compound Path')
    })
  })
})

// ── releaseCompoundPath tests ──

describe('releaseCompoundPath', () => {
  beforeEach(resetStore)

  it('splits a multi-path layer into separate layers', () => {
    const compound = addVectorLayer({
      name: 'Compound Path',
      paths: [makePath(), makePath(), makePath()],
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    expect(layers.length).toBe(3)
  })

  it('names the new layers with index suffix', () => {
    const compound = addVectorLayer({
      name: 'MyCompound',
      paths: [makePath(), makePath()],
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    const names = layers.map((l) => l.name)
    expect(names).toContain('MyCompound 1')
    expect(names).toContain('MyCompound 2')
  })

  it('inherits fill and stroke from the original compound', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath()],
      fill: { type: 'solid', color: '#abcdef', opacity: 0.7 },
      stroke: {
        width: 4,
        color: '#123456',
        opacity: 1,
        position: 'inside',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 8,
      },
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    for (const layer of layers) {
      const vl = layer as VectorLayer
      expect(vl.fill!.color).toBe('#abcdef')
      expect(vl.fill!.opacity).toBe(0.7)
      expect(vl.stroke!.color).toBe('#123456')
      expect(vl.stroke!.width).toBe(4)
    }
  })

  it('preserves opacity and blendMode from the compound', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath()],
      opacity: 0.6,
      blendMode: 'overlay',
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    for (const layer of layers) {
      expect(layer.opacity).toBe(0.6)
      expect(layer.blendMode).toBe('overlay')
    }
  })

  it('each new layer has exactly one path', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath(), makePath()],
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    for (const layer of artboardLayers()) {
      expect((layer as VectorLayer).paths.length).toBe(1)
    }
  })

  it('removes the original compound layer', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath()],
    })
    const compoundId = compound.id

    useEditorStore.getState().selectLayer(compoundId)
    releaseCompoundPath()

    const found = artboardLayers().find((l) => l.id === compoundId)
    expect(found).toBeUndefined()
  })

  it('selects all new layers after release', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath()],
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const sel = selection()
    expect(sel.length).toBe(2)
    // All selected layers should exist in the artboard
    for (const id of sel) {
      expect(artboardLayers().find((l) => l.id === id)).toBeDefined()
    }
  })

  it('gives new unique IDs to released layers and paths', () => {
    const path1 = makePath()
    const path2 = makePath()
    const compound = addVectorLayer({
      paths: [path1, path2],
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    expect(layers[0]!.id).not.toBe(compound.id)
    expect(layers[1]!.id).not.toBe(compound.id)
    expect(layers[0]!.id).not.toBe(layers[1]!.id)
    // Path IDs should also be new
    expect((layers[0] as VectorLayer).paths[0]!.id).not.toBe(path1.id)
    expect((layers[1] as VectorLayer).paths[0]!.id).not.toBe(path2.id)
  })

  it('handles null fill/stroke', () => {
    const compound = addVectorLayer({
      paths: [makePath(), makePath()],
      fill: null,
      stroke: null,
    })

    useEditorStore.getState().selectLayer(compound.id)
    releaseCompoundPath()

    const layers = artboardLayers()
    for (const layer of layers) {
      const vl = layer as VectorLayer
      expect(vl.fill).toBeNull()
      expect(vl.stroke).toBeNull()
    }
  })

  describe('edge cases', () => {
    it('does nothing with no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      releaseCompoundPath()
      // Should not throw
    })

    it('does nothing with no selection', () => {
      addVectorLayer({ paths: [makePath(), makePath()] })
      useEditorStore.getState().deselectAll()
      releaseCompoundPath()

      expect(artboardLayers().length).toBe(1)
    })

    it('does nothing when multiple layers are selected', () => {
      const v1 = addVectorLayer({ paths: [makePath(), makePath()] })
      const v2 = addVectorLayer({ paths: [makePath(), makePath()] })

      useEditorStore.getState().selectLayer(v1.id)
      useEditorStore.getState().selectLayer(v2.id, true)

      releaseCompoundPath()

      // Nothing changed
      expect(artboardLayers().length).toBe(2)
    })

    it('does nothing when selected layer is not a vector', () => {
      const t1 = addTextLayer()

      useEditorStore.getState().selectLayer(t1.id)
      releaseCompoundPath()

      expect(artboardLayers().length).toBe(1)
    })

    it('does nothing when vector layer has only one path', () => {
      const v1 = addVectorLayer({ paths: [makePath()] })

      useEditorStore.getState().selectLayer(v1.id)
      releaseCompoundPath()

      // Still one layer
      expect(artboardLayers().length).toBe(1)
      expect(artboardLayers()[0]!.id).toBe(v1.id)
    })

    it('does nothing when selected layer is not found', () => {
      addVectorLayer({ paths: [makePath(), makePath()] })
      useEditorStore.setState({ selection: { layerIds: ['nonexistent'] } })

      releaseCompoundPath()

      expect(artboardLayers().length).toBe(1)
    })

    it('preserves bystander layers', () => {
      const bystander = addVectorLayer({ name: 'Bystander' })
      const compound = addVectorLayer({
        name: 'Compound',
        paths: [makePath(), makePath()],
      })

      useEditorStore.getState().selectLayer(compound.id)
      releaseCompoundPath()

      const layers = artboardLayers()
      expect(layers.find((l) => l.id === bystander.id)).toBeDefined()
    })
  })
})

// ── Round-trip test ──

describe('compound path round-trip', () => {
  beforeEach(resetStore)

  it('make then release produces the same number of layers', () => {
    const v1 = addVectorLayer({ name: 'A' })
    const v2 = addVectorLayer({ name: 'B' })
    const v3 = addVectorLayer({ name: 'C' })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)
    useEditorStore.getState().selectLayer(v3.id, true)

    makeCompoundPath()
    expect(artboardLayers().length).toBe(1)

    // The compound is now selected
    releaseCompoundPath()

    // We should have 3 layers back
    expect(artboardLayers().length).toBe(3)
  })

  it('make then release preserves path count', () => {
    const v1 = addVectorLayer({ paths: [makePath()] })
    const v2 = addVectorLayer({ paths: [makePath(), makePath()] })

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)

    makeCompoundPath()
    const compound = artboardLayers()[0] as VectorLayer
    expect(compound.paths.length).toBe(3)

    releaseCompoundPath()
    expect(artboardLayers().length).toBe(3)
    // Each released layer has exactly 1 path
    for (const layer of artboardLayers()) {
      expect((layer as VectorLayer).paths.length).toBe(1)
    }
  })
})
