import { useEditorStore } from '@/store/editor.store'

/**
 * Layer ordering and flip operations.
 */

function getSelectedLayerAndArtboard() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return null
  const layerId = store.selection.layerIds[0]!
  const idx = artboard.layers.findIndex(l => l.id === layerId)
  if (idx === -1) return null
  return { artboard, layerId, idx, store }
}

// ── Layer ordering ──

export function bringToFront() {
  const info = getSelectedLayerAndArtboard()
  if (!info) return
  const { artboard, layerId, idx, store } = info
  if (idx < artboard.layers.length - 1) {
    store.reorderLayer(artboard.id, layerId, artboard.layers.length - 1)
  }
}

export function bringForward() {
  const info = getSelectedLayerAndArtboard()
  if (!info) return
  const { artboard, layerId, idx, store } = info
  if (idx < artboard.layers.length - 1) {
    store.reorderLayer(artboard.id, layerId, idx + 1)
  }
}

export function sendBackward() {
  const info = getSelectedLayerAndArtboard()
  if (!info) return
  const { artboard, layerId, idx, store } = info
  if (idx > 0) {
    store.reorderLayer(artboard.id, layerId, idx - 1)
  }
}

export function sendToBack() {
  const info = getSelectedLayerAndArtboard()
  if (!info) return
  const { artboard, layerId, idx, store } = info
  if (idx > 0) {
    store.reorderLayer(artboard.id, layerId, 0)
  }
}

// ── Flip ──

export function flipHorizontal() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return

  for (const layerId of store.selection.layerIds) {
    const layer = artboard.layers.find(l => l.id === layerId)
    if (!layer) continue
    store.updateLayer(artboard.id, layerId, {
      transform: {
        ...layer.transform,
        scaleX: layer.transform.scaleX * -1,
      },
    })
  }
}

export function flipVertical() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return

  for (const layerId of store.selection.layerIds) {
    const layer = artboard.layers.find(l => l.id === layerId)
    if (!layer) continue
    store.updateLayer(artboard.id, layerId, {
      transform: {
        ...layer.transform,
        scaleY: layer.transform.scaleY * -1,
      },
    })
  }
}

// ── Arrow nudge ──

export function nudgeSelection(dx: number, dy: number) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard || store.selection.layerIds.length === 0) return

  for (const layerId of store.selection.layerIds) {
    const layer = artboard.layers.find(l => l.id === layerId)
    if (!layer) continue
    store.updateLayer(artboard.id, layerId, {
      transform: {
        ...layer.transform,
        x: layer.transform.x + dx,
        y: layer.transform.y + dy,
      },
    })
  }
}
