import { useEditorStore } from '@/store/editor.store'
import type { Fill, Stroke, BlendMode } from '@/types'

interface CopiedStyle {
  fill: Fill | null
  stroke: Stroke | null
  opacity: number
  blendMode: BlendMode
}

let copiedStyle: CopiedStyle | null = null

/**
 * Copy the appearance/style from the currently selected layer.
 */
export function copyStyle(): boolean {
  const state = useEditorStore.getState()
  const artboard = state.document.artboards[0]
  if (!artboard || state.selection.layerIds.length === 0) return false

  const layer = artboard.layers.find((l) => state.selection.layerIds.includes(l.id))
  if (!layer) return false

  if (layer.type === 'vector') {
    copiedStyle = {
      fill: layer.fill ? { ...layer.fill } : null,
      stroke: layer.stroke ? { ...layer.stroke } : null,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
    }
    return true
  }

  copiedStyle = {
    fill: null,
    stroke: null,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
  }
  return true
}

/**
 * Paste the previously copied style onto the currently selected layer(s).
 */
export function pasteStyle(): boolean {
  if (!copiedStyle) return false

  const state = useEditorStore.getState()
  const artboard = state.document.artboards[0]
  if (!artboard || state.selection.layerIds.length === 0) return false

  for (const layerId of state.selection.layerIds) {
    const layer = artboard.layers.find((l) => l.id === layerId)
    if (!layer) continue

    state.updateLayer(artboard.id, layerId, {
      opacity: copiedStyle.opacity,
      blendMode: copiedStyle.blendMode,
    })

    if (layer.type === 'vector') {
      if (copiedStyle.fill !== null) {
        state.setFill(artboard.id, layerId, copiedStyle.fill)
      }
      if (copiedStyle.stroke !== null) {
        state.setStroke(artboard.id, layerId, copiedStyle.stroke)
      }
    }
  }

  return true
}

/**
 * Check if there's a style on the clipboard.
 */
export function hasStyleClipboard(): boolean {
  return copiedStyle !== null
}
