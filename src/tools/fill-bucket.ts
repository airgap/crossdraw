import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { Fill } from '@/types'

/** Current fill color for the bucket tool */
let fillColor = '#4a7dff'

export function setFillBucketColor(color: string) {
  fillColor = color
}

export function getFillBucketColor(): string {
  return fillColor
}

/**
 * Fill the selected vector layer with the current fill color.
 * If no layer is selected, hit-test the click position to find one.
 */
export function applyFillBucket(docX: number, docY: number) {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  // Find target layer — either selected or hit-tested
  let targetLayerId = store.selection.layerIds[0]

  if (!targetLayerId) {
    // Simple bbox hit test
    for (let i = artboard.layers.length - 1; i >= 0; i--) {
      const layer = artboard.layers[i]!
      if (!layer.visible || layer.locked) continue
      if (layer.type !== 'vector') continue
      const t = layer.transform
      // Rough hit test using transform position
      if (docX >= artboard.x + t.x && docY >= artboard.y + t.y) {
        targetLayerId = layer.id
        break
      }
    }
  }

  if (!targetLayerId) return

  const layer = artboard.layers.find((l) => l.id === targetLayerId)
  if (!layer || layer.type !== 'vector') return

  const fill: Fill = {
    type: 'solid',
    color: fillColor,
    opacity: 1,
  }

  store.setFill(artboard.id, targetLayerId, fill)
  store.selectLayer(targetLayerId)
}
