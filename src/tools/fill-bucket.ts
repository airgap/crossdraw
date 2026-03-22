import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getFillDefaults } from '@/ui/tool-options-state'
import type { Fill, VectorLayer, Path } from '@/types'
import { v4 as uuid } from 'uuid'

/**
 * Fill the selected vector layer with the current fill color.
 * If no layer is selected, hit-test the click position to find one.
 * If no layer exists, create a filled rectangle covering the artboard.
 */
export function applyFillBucket(docX: number, docY: number) {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  // Find target layer — either selected or hit-tested
  let targetLayerId = store.selection.layerIds[0]

  // Validate that the selected layer still exists on this artboard
  if (targetLayerId && !artboard.layers.some((l) => l.id === targetLayerId)) {
    targetLayerId = undefined
  }

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

  const fill: Fill = {
    type: 'solid',
    color: getFillDefaults().fillColor,
    opacity: 1,
  }

  if (!targetLayerId) {
    // Empty canvas — create a new vector layer filling the artboard
    const path: Path = {
      id: uuid(),
      closed: true,
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: artboard.width, y: 0 },
        { type: 'line', x: artboard.width, y: artboard.height },
        { type: 'line', x: 0, y: artboard.height },
      ],
    }
    const newLayer: VectorLayer = {
      id: uuid(),
      name: 'Fill',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [path],
      fill,
      stroke: null,
    }
    store.addLayer(artboard.id, newLayer)
    store.selectLayer(newLayer.id)
    return
  }

  const layer = artboard.layers.find((l) => l.id === targetLayerId)
  if (!layer || layer.type !== 'vector') return

  store.setFill(artboard.id, targetLayerId, fill)
  store.selectLayer(targetLayerId)
}
