import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { VectorLayer, Path } from '@/types'

/**
 * Compound path operations: combine multiple vector layers into one with evenodd fill rule,
 * or split a multi-path vector layer back into separate layers.
 */

/**
 * Combine multiple selected vector layers into a single vector layer with multiple paths.
 * Uses `fillRule: 'evenodd'` on each path. Copies fill/stroke from the first selected layer.
 */
export function makeCompoundPath(): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length < 2) return

  // Gather vector layers in selection order
  const vectorLayers: VectorLayer[] = []
  for (const id of selectedIds) {
    const layer = artboard.layers.find((l) => l.id === id)
    if (layer && layer.type === 'vector') {
      vectorLayers.push(layer as VectorLayer)
    }
  }

  if (vectorLayers.length < 2) return

  const first = vectorLayers[0]!

  // Collect all paths from all selected vector layers, setting fillRule to 'evenodd'
  const allPaths: Path[] = []
  for (const vl of vectorLayers) {
    for (const path of vl.paths) {
      allPaths.push({
        ...path,
        id: uuid(),
        fillRule: 'evenodd',
      })
    }
  }

  // Create the compound layer
  const compoundLayer: VectorLayer = {
    id: uuid(),
    name: 'Compound Path',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: first.opacity,
    blendMode: first.blendMode,
    transform: { ...first.transform },
    effects: [],
    paths: allPaths,
    fill: first.fill ? { ...first.fill } : null,
    stroke: first.stroke ? { ...first.stroke } : null,
  }

  // Remove original layers
  for (const vl of vectorLayers) {
    store.deleteLayer(artboard.id, vl.id)
  }

  // Add compound layer
  store.addLayer(artboard.id, compoundLayer)

  // Select the new compound layer
  useEditorStore.setState({ selection: { layerIds: [compoundLayer.id] } })
}

/**
 * Split a vector layer with multiple paths into separate vector layers (one per path).
 * Each new layer inherits the parent's fill/stroke.
 */
export function releaseCompoundPath(): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length !== 1) return

  const layer = artboard.layers.find((l) => l.id === selectedIds[0])
  if (!layer || layer.type !== 'vector') return

  const vectorLayer = layer as VectorLayer
  if (vectorLayer.paths.length < 2) return

  const newIds: string[] = []

  // Create one layer per path
  for (let i = 0; i < vectorLayer.paths.length; i++) {
    const path = vectorLayer.paths[i]!
    const newLayer: VectorLayer = {
      id: uuid(),
      name: `${vectorLayer.name} ${i + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: vectorLayer.opacity,
      blendMode: vectorLayer.blendMode,
      transform: { ...vectorLayer.transform },
      effects: [],
      paths: [{ ...path, id: uuid() }],
      fill: vectorLayer.fill ? { ...vectorLayer.fill } : null,
      stroke: vectorLayer.stroke ? { ...vectorLayer.stroke } : null,
    }
    newIds.push(newLayer.id)
    store.addLayer(artboard.id, newLayer)
  }

  // Remove the original compound layer
  store.deleteLayer(artboard.id, vectorLayer.id)

  // Select all the new layers
  useEditorStore.setState({ selection: { layerIds: newIds } })
}
