import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { Layer, VectorLayer, TextLayer, GroupLayer } from '@/types'

/**
 * Selection utilities: select layers sharing a property value, or invert selection.
 */

type SelectSameProperty = 'fill' | 'stroke' | 'strokeWidth' | 'font' | 'effectType'

/** Collect all layer children of a group (non-recursive into nested groups' children). */
function collectGroupChildren(layer: Layer): Layer[] {
  if (layer.type === 'group') {
    return (layer as GroupLayer).children
  }
  return []
}

/** Get a comparable value for a property from a layer, or undefined if not applicable. */
function getPropertyValue(layer: Layer, property: SelectSameProperty): string | number | undefined {
  switch (property) {
    case 'fill':
      if (layer.type === 'vector') {
        return (layer as VectorLayer).fill?.color ?? undefined
      }
      return undefined
    case 'stroke':
      if (layer.type === 'vector') {
        return (layer as VectorLayer).stroke?.color ?? undefined
      }
      return undefined
    case 'strokeWidth':
      if (layer.type === 'vector') {
        return (layer as VectorLayer).stroke?.width ?? undefined
      }
      return undefined
    case 'font':
      if (layer.type === 'text') {
        return (layer as TextLayer).fontFamily
      }
      return undefined
    case 'effectType':
      if (layer.effects && layer.effects.length > 0) {
        return layer.effects[0]!.type
      }
      return undefined
  }
}

/**
 * Select all layers on the active artboard that share the same property value
 * as the currently selected layer.
 */
export function selectSame(property: SelectSameProperty): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length === 0) return

  // Use the first selected layer as the reference
  const refLayer = artboard.layers.find((l) => l.id === selectedIds[0])
  if (!refLayer) return

  const refValue = getPropertyValue(refLayer, property)
  if (refValue === undefined) return

  const matchingIds: string[] = []

  for (const layer of artboard.layers) {
    const val = getPropertyValue(layer, property)
    if (val !== undefined && val === refValue) {
      matchingIds.push(layer.id)
    }
    // Also check group children
    for (const child of collectGroupChildren(layer)) {
      const childVal = getPropertyValue(child, property)
      if (childVal !== undefined && childVal === refValue) {
        matchingIds.push(child.id)
      }
    }
  }

  if (matchingIds.length > 0) {
    useEditorStore.setState({ selection: { layerIds: matchingIds } })
  }
}

/**
 * Deselect current selection, select everything else on the active artboard.
 * Includes top-level layers and group children (non-recursive).
 */
export function selectInverse(): void {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = new Set(store.selection.layerIds)
  const inverseIds: string[] = []

  for (const layer of artboard.layers) {
    if (!selectedIds.has(layer.id)) {
      inverseIds.push(layer.id)
    }
    // Include group children
    for (const child of collectGroupChildren(layer)) {
      if (!selectedIds.has(child.id)) {
        inverseIds.push(child.id)
      }
    }
  }

  useEditorStore.setState({ selection: { layerIds: inverseIds } })
}
