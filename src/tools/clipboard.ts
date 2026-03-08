import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, GroupLayer } from '@/types'

let clipboardLayers: Layer[] = []
let pasteCount = 0

function deepCloneWithNewIds(layer: Layer): Layer {
  const clone: Layer = JSON.parse(JSON.stringify(layer))
  function reId(l: Layer) {
    l.id = uuid()
    if (l.type === 'group') {
      for (const child of (l as GroupLayer).children) reId(child)
    }
  }
  reId(clone)
  return clone
}

export function copyLayers() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return

  clipboardLayers = []
  for (const layerId of store.selection.layerIds) {
    const layer = artboard.layers.find((l) => l.id === layerId)
    if (layer) {
      clipboardLayers.push(JSON.parse(JSON.stringify(layer)))
    }
  }
  pasteCount = 0
}

export function pasteLayers() {
  if (clipboardLayers.length === 0) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  pasteCount++
  const offset = pasteCount * 10

  store.deselectAll()
  for (const original of clipboardLayers) {
    const clone = deepCloneWithNewIds(original)
    clone.name = `${original.name} Copy`
    clone.transform = {
      ...clone.transform,
      x: clone.transform.x + offset,
      y: clone.transform.y + offset,
    }
    store.addLayer(artboard.id, clone)
    store.selectLayer(clone.id, true)
  }
}

export function cutLayers() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return

  copyLayers()
  const layerIds = [...store.selection.layerIds]
  for (const layerId of layerIds) {
    store.deleteLayer(artboard.id, layerId)
  }
  store.deselectAll()
}

export function hasClipboard(): boolean {
  return clipboardLayers.length > 0
}
