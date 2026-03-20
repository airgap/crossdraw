import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { VectorLayer, Layer } from '@/types'

/**
 * Clipping mask operations: use the topmost selected vector layer as a mask
 * for layers below it, or release a clipping mask back to a standalone layer.
 */

/**
 * Make a clipping mask from the selection.
 * The topmost selected vector layer becomes the mask shape for the layer(s) below it.
 * Sets `layer.mask` on the bottom layer (or group) to the top layer's path data.
 */
export function makeClippingMask(): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length < 2) return

  // Find selected layers in artboard order (bottom-to-top is array order)
  const selectedLayers: { layer: Layer; index: number }[] = []
  for (let i = 0; i < artboard.layers.length; i++) {
    if (selectedIds.includes(artboard.layers[i]!.id)) {
      selectedLayers.push({ layer: artboard.layers[i]!, index: i })
    }
  }

  if (selectedLayers.length < 2) return

  // The topmost layer in the stack (highest index) is the mask shape
  const topEntry = selectedLayers[selectedLayers.length - 1]!
  const topLayer = topEntry.layer

  // Must be a vector layer to use as mask
  if (topLayer.type !== 'vector') return

  // The layer to be masked is the one just below the mask in the selection
  const bottomEntry = selectedLayers[selectedLayers.length - 2]!
  const bottomLayer = bottomEntry.layer

  // Create a mask layer from the top vector layer's data
  const maskLayer: VectorLayer = {
    id: uuid(),
    name: `${topLayer.name} (Mask)`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { ...(topLayer as VectorLayer).transform },
    effects: [],
    paths: (topLayer as VectorLayer).paths.map((p) => ({ ...p, id: uuid() })),
    fill: (topLayer as VectorLayer).fill ? { ...(topLayer as VectorLayer).fill! } : null,
    stroke: null,
  }

  // Set the mask on the bottom layer
  store.setLayerMask(artboard.id, bottomLayer.id, maskLayer)

  // Remove the top layer (it's now embedded as a mask)
  store.deleteLayer(artboard.id, topLayer.id)

  // Select the masked layer
  useEditorStore.setState({ selection: { layerIds: [bottomLayer.id] } })
}

/**
 * Release a clipping mask from the selected layer.
 * Restores the mask as a standalone vector layer above the previously masked layer.
 */
export function releaseClippingMask(): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length !== 1) return

  const layer = artboard.layers.find((l) => l.id === selectedIds[0])
  if (!layer || !layer.mask) return

  const maskData = layer.mask

  // Create a standalone vector layer from the mask
  // The mask is a Layer; if it's a vector layer, restore it as-is
  const restoredLayer: Layer = {
    ...maskData,
    id: uuid(),
    name: maskData.name.replace(' (Mask)', '') || 'Released Mask',
  }

  // Remove the mask from the layer
  store.removeLayerMask(artboard.id, layer.id)

  // Add the restored layer
  store.addLayer(artboard.id, restoredLayer)

  // Select both the original and the restored mask layer
  useEditorStore.setState({ selection: { layerIds: [layer.id, restoredLayer.id] } })
}
