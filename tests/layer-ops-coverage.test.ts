import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  bringToFront,
  bringForward,
  sendBackward,
  sendToBack,
  flipHorizontal,
  flipVertical,
  nudgeSelection,
} from '@/tools/layer-ops'
import type { VectorLayer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: `vec-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Layer',
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

function getLayerIds(): string[] {
  return useEditorStore.getState().document.artboards[0]!.layers.map((l) => l.id)
}

// ── Tests ──

describe('Layer Operations (coverage)', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('bringToFront', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      useEditorStore.getState().deselectAll()

      bringToFront()
      // No crash, order unchanged
    })

    test('does nothing when layer is already at front', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      useEditorStore.getState().selectLayer('b')

      bringToFront()
      expect(getLayerIds()).toEqual(['a', 'b'])
    })

    test('moves layer to front', () => {
      addVectorLayer({ id: 'x' })
      addVectorLayer({ id: 'y' })
      addVectorLayer({ id: 'z' })
      useEditorStore.getState().selectLayer('x')

      bringToFront()
      const ids = getLayerIds()
      expect(ids[ids.length - 1]).toBe('x')
    })

    test('moves middle layer to front', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      addVectorLayer({ id: 'c' })
      useEditorStore.getState().selectLayer('b')

      bringToFront()
      const ids = getLayerIds()
      expect(ids[ids.length - 1]).toBe('b')
    })
  })

  describe('bringForward', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      useEditorStore.getState().deselectAll()
      bringForward()
    })

    test('does nothing when layer is already at front', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      useEditorStore.getState().selectLayer('b')

      bringForward()
      expect(getLayerIds()).toEqual(['a', 'b'])
    })

    test('moves layer one position forward', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      addVectorLayer({ id: 'c' })
      useEditorStore.getState().selectLayer('a')

      bringForward()
      expect(getLayerIds()).toEqual(['b', 'a', 'c'])
    })
  })

  describe('sendBackward', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      useEditorStore.getState().deselectAll()
      sendBackward()
    })

    test('does nothing when layer is already at back', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      useEditorStore.getState().selectLayer('a')

      sendBackward()
      expect(getLayerIds()).toEqual(['a', 'b'])
    })

    test('moves layer one position backward', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      addVectorLayer({ id: 'c' })
      useEditorStore.getState().selectLayer('c')

      sendBackward()
      expect(getLayerIds()).toEqual(['a', 'c', 'b'])
    })
  })

  describe('sendToBack', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      useEditorStore.getState().deselectAll()
      sendToBack()
    })

    test('does nothing when layer is already at back', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      useEditorStore.getState().selectLayer('a')

      sendToBack()
      expect(getLayerIds()).toEqual(['a', 'b'])
    })

    test('moves layer to back', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      addVectorLayer({ id: 'c' })
      useEditorStore.getState().selectLayer('c')

      sendToBack()
      const ids = getLayerIds()
      expect(ids[0]).toBe('c')
    })

    test('moves middle layer to back', () => {
      addVectorLayer({ id: 'a' })
      addVectorLayer({ id: 'b' })
      addVectorLayer({ id: 'c' })
      useEditorStore.getState().selectLayer('b')

      sendToBack()
      expect(getLayerIds()[0]).toBe('b')
    })
  })

  describe('flipHorizontal', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      useEditorStore.getState().deselectAll()
      flipHorizontal()
    })

    test('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      flipHorizontal()
    })

    test('negates scaleX of selected layer', () => {
      const layer = addVectorLayer({
        id: 'flip-h',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipHorizontal()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'flip-h')!
      expect(updated.transform.scaleX).toBe(-1)
    })

    test('double flip restores original scaleX', () => {
      const layer = addVectorLayer({
        id: 'flip-h2',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipHorizontal()
      flipHorizontal()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'flip-h2')!
      expect(updated.transform.scaleX).toBe(1)
    })

    test('flips multiple selected layers', () => {
      const l1 = addVectorLayer({ id: 'mflip-1', transform: { x: 0, y: 0, scaleX: 2, scaleY: 1, rotation: 0 } })
      const l2 = addVectorLayer({ id: 'mflip-2', transform: { x: 0, y: 0, scaleX: 3, scaleY: 1, rotation: 0 } })
      useEditorStore.getState().selectLayer(l1.id)
      useEditorStore.getState().selectLayer(l2.id, true)

      flipHorizontal()

      const artboard = useEditorStore.getState().document.artboards[0]!
      expect(artboard.layers.find((l) => l.id === 'mflip-1')!.transform.scaleX).toBe(-2)
      expect(artboard.layers.find((l) => l.id === 'mflip-2')!.transform.scaleX).toBe(-3)
    })

    test('preserves scaleY when flipping horizontal', () => {
      const layer = addVectorLayer({
        id: 'flip-preserve',
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 2, rotation: 45 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipHorizontal()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'flip-preserve')!
      expect(updated.transform.scaleY).toBe(2)
      expect(updated.transform.x).toBe(10)
      expect(updated.transform.y).toBe(20)
    })
  })

  describe('flipVertical', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'a' })
      useEditorStore.getState().deselectAll()
      flipVertical()
    })

    test('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      flipVertical()
    })

    test('negates scaleY of selected layer', () => {
      const layer = addVectorLayer({
        id: 'flip-v',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipVertical()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'flip-v')!
      expect(updated.transform.scaleY).toBe(-1)
    })

    test('double flip restores original scaleY', () => {
      const layer = addVectorLayer({
        id: 'flip-v2',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipVertical()
      flipVertical()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'flip-v2')!
      expect(updated.transform.scaleY).toBe(1)
    })

    test('flips multiple selected layers vertically', () => {
      const l1 = addVectorLayer({ id: 'mvflip-1', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1.5, rotation: 0 } })
      const l2 = addVectorLayer({ id: 'mvflip-2', transform: { x: 0, y: 0, scaleX: 1, scaleY: 2.5, rotation: 0 } })
      useEditorStore.getState().selectLayer(l1.id)
      useEditorStore.getState().selectLayer(l2.id, true)

      flipVertical()

      const artboard = useEditorStore.getState().document.artboards[0]!
      expect(artboard.layers.find((l) => l.id === 'mvflip-1')!.transform.scaleY).toBe(-1.5)
      expect(artboard.layers.find((l) => l.id === 'mvflip-2')!.transform.scaleY).toBe(-2.5)
    })

    test('preserves scaleX when flipping vertical', () => {
      const layer = addVectorLayer({
        id: 'vflip-preserve',
        transform: { x: 5, y: 15, scaleX: 3, scaleY: 1, rotation: 30 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipVertical()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'vflip-preserve')!
      expect(updated.transform.scaleX).toBe(3)
    })
  })

  describe('nudgeSelection', () => {
    test('does nothing with no selection', () => {
      addVectorLayer({ id: 'no-nudge' })
      useEditorStore.getState().deselectAll()
      nudgeSelection(1, 0)
    })

    test('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      nudgeSelection(1, 0)
    })

    test('nudges right by 1px', () => {
      const layer = addVectorLayer({
        id: 'nudge-r',
        transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(1, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-r')!
      expect(updated.transform.x).toBe(101)
      expect(updated.transform.y).toBe(200)
    })

    test('nudges left by 1px', () => {
      const layer = addVectorLayer({
        id: 'nudge-l',
        transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(-1, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-l')!
      expect(updated.transform.x).toBe(99)
    })

    test('nudges down by 1px', () => {
      const layer = addVectorLayer({
        id: 'nudge-d',
        transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(0, 1)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-d')!
      expect(updated.transform.y).toBe(201)
    })

    test('nudges up by 1px', () => {
      const layer = addVectorLayer({
        id: 'nudge-u',
        transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(0, -1)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-u')!
      expect(updated.transform.y).toBe(199)
    })

    test('big nudge (shift) by 10px', () => {
      const layer = addVectorLayer({
        id: 'nudge-big',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(10, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-big')!
      expect(updated.transform.x).toBe(60)
    })

    test('nudges multiple selected layers', () => {
      const l1 = addVectorLayer({ id: 'mn-1', transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 } })
      const l2 = addVectorLayer({ id: 'mn-2', transform: { x: 30, y: 40, scaleX: 1, scaleY: 1, rotation: 0 } })
      useEditorStore.getState().selectLayer(l1.id)
      useEditorStore.getState().selectLayer(l2.id, true)

      nudgeSelection(5, -3)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const u1 = artboard.layers.find((l) => l.id === 'mn-1')!
      const u2 = artboard.layers.find((l) => l.id === 'mn-2')!
      expect(u1.transform.x).toBe(15)
      expect(u1.transform.y).toBe(17)
      expect(u2.transform.x).toBe(35)
      expect(u2.transform.y).toBe(37)
    })

    test('preserves other transform properties', () => {
      const layer = addVectorLayer({
        id: 'nudge-preserve',
        transform: { x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 45 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(5, 10)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'nudge-preserve')!
      expect(updated.transform.scaleX).toBe(2)
      expect(updated.transform.scaleY).toBe(3)
      expect(updated.transform.rotation).toBe(45)
    })

    test('skips layers not found in artboard', () => {
      useEditorStore.setState({ selection: { layerIds: ['nonexistent'] } })
      // Should not crash
      nudgeSelection(1, 1)
    })

    test('accumulates multiple nudges', () => {
      const layer = addVectorLayer({
        id: 'multi-nudge',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      nudgeSelection(1, 0)
      nudgeSelection(1, 0)
      nudgeSelection(1, 0)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'multi-nudge')!
      expect(updated.transform.x).toBe(3)
    })
  })

  describe('combined operations', () => {
    test('flip then nudge', () => {
      const layer = addVectorLayer({
        id: 'combo',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      useEditorStore.getState().selectLayer(layer.id)

      flipHorizontal()
      nudgeSelection(10, 5)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === 'combo')!
      expect(updated.transform.scaleX).toBe(-1)
      expect(updated.transform.x).toBe(60)
      expect(updated.transform.y).toBe(55)
    })

    test('ordering then flip', () => {
      addVectorLayer({ id: 'ord-1' })
      addVectorLayer({ id: 'ord-2' })
      addVectorLayer({ id: 'ord-3' })
      useEditorStore.getState().selectLayer('ord-1')

      bringToFront()
      flipVertical()

      const artboard = useEditorStore.getState().document.artboards[0]!
      const ids = artboard.layers.map((l) => l.id)
      expect(ids[ids.length - 1]).toBe('ord-1')
      const updated = artboard.layers.find((l) => l.id === 'ord-1')!
      expect(updated.transform.scaleY).toBe(-1)
    })
  })
})
