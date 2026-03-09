/**
 * Auto-Name Layers Plugin
 *
 * Automatically names layers based on their type and visual properties.
 * For example, a blue rectangle becomes "Blue Rectangle", a red ellipse
 * becomes "Red Ellipse", etc.
 *
 * Usage (programmatic):
 *   import { init } from './auto-name-layers'
 *   init(api)
 *
 * Usage (sandboxed source):
 *   The code below can also be evaluated as a string via runPluginInSandbox.
 */

import type { CrossdrawPluginAPI } from '../plugin-api'
import type { Layer, VectorLayer, TextLayer } from '@/types'

// ---------------------------------------------------------------------------
// Color name mapping (simple hex -> English name)
// ---------------------------------------------------------------------------

const COLOR_NAMES: Record<string, string> = {
  '#000000': 'Black',
  '#ffffff': 'White',
  '#ff0000': 'Red',
  '#00ff00': 'Green',
  '#0000ff': 'Blue',
  '#ffff00': 'Yellow',
  '#ff00ff': 'Magenta',
  '#00ffff': 'Cyan',
  '#808080': 'Gray',
  '#ff8000': 'Orange',
  '#800080': 'Purple',
  '#ffc0cb': 'Pink',
  '#a52a2a': 'Brown',
}

function hexToName(hex: string): string {
  const lower = hex.toLowerCase()
  if (COLOR_NAMES[lower]) return COLOR_NAMES[lower]

  // Parse RGB and give a rough hue-based name
  const r = parseInt(lower.slice(1, 3), 16)
  const g = parseInt(lower.slice(3, 5), 16)
  const b = parseInt(lower.slice(5, 7), 16)

  if (r === g && g === b) {
    return r < 64 ? 'Dark Gray' : r < 192 ? 'Gray' : 'Light Gray'
  }

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let hue = 0
  if (max === min) {
    hue = 0
  } else if (max === r) {
    hue = ((g - b) / (max - min)) * 60
  } else if (max === g) {
    hue = ((b - r) / (max - min)) * 60 + 120
  } else {
    hue = ((r - g) / (max - min)) * 60 + 240
  }
  if (hue < 0) hue += 360

  if (hue < 15 || hue >= 345) return 'Red'
  if (hue < 45) return 'Orange'
  if (hue < 75) return 'Yellow'
  if (hue < 150) return 'Green'
  if (hue < 195) return 'Cyan'
  if (hue < 255) return 'Blue'
  if (hue < 285) return 'Purple'
  if (hue < 345) return 'Pink'

  return 'Colored'
}

// ---------------------------------------------------------------------------
// Shape detection from shapeParams
// ---------------------------------------------------------------------------

function getShapeName(layer: VectorLayer): string {
  if (layer.shapeParams) {
    switch (layer.shapeParams.shapeType) {
      case 'rectangle':
        return 'Rectangle'
      case 'ellipse':
        return 'Ellipse'
      case 'polygon':
        return `Polygon (${layer.shapeParams.sides ?? 3}-sided)`
      case 'star':
        return `Star (${layer.shapeParams.points ?? 5}-point)`
    }
  }

  // Fall back to path count
  const pathCount = layer.paths.length
  if (pathCount === 0) return 'Empty Path'
  if (pathCount === 1) return 'Path'
  return `Compound Path (${pathCount})`
}

// ---------------------------------------------------------------------------
// Generate a descriptive name for any layer
// ---------------------------------------------------------------------------

function generateLayerName(layer: Layer): string {
  switch (layer.type) {
    case 'vector': {
      const vec = layer as VectorLayer
      const shapeName = getShapeName(vec)
      const fillColor = vec.fill?.color
      if (fillColor) {
        return `${hexToName(fillColor)} ${shapeName}`
      }
      return shapeName
    }

    case 'text': {
      const txt = layer as TextLayer
      const preview = txt.text.length > 20 ? txt.text.slice(0, 20) + '...' : txt.text
      return `Text: "${preview}"`
    }

    case 'raster':
      return 'Raster Image'

    case 'group':
      return `Group (${(layer as import('@/types').GroupLayer).children.length} layers)`

    case 'adjustment':
      return `Adjustment: ${(layer as import('@/types').AdjustmentLayer).adjustmentType}`

    case 'symbol-instance':
      return 'Symbol Instance'

    default:
      return 'Layer'
  }
}

// ---------------------------------------------------------------------------
// Plugin init
// ---------------------------------------------------------------------------

/**
 * Initialise the auto-name-layers plugin.
 *
 * On activation it renames all existing unnamed layers ("Layer", "Layer 1", etc.)
 * in the active artboard. It then subscribes to the `layerAdded` event to name
 * newly created layers going forward. Returns an unsubscribe function for cleanup.
 */
export function init(api: CrossdrawPluginAPI): () => void {
  // 1. Rename existing layers with default names
  const artboard = api.getActiveArtboard()
  if (artboard) {
    renameDefaultLayers(api, artboard.id, artboard.layers)
  }

  api.showNotification('Auto-Name Layers plugin activated', 'info')

  // 2. Listen for new layers
  const unsubscribe = api.on('layerAdded', (...args: unknown[]) => {
    const artboardId = args[0] as string
    const layerId = args[1] as string

    // Re-fetch the artboard to get the fresh layer
    const currentArtboard = api.getActiveArtboard()
    if (!currentArtboard || currentArtboard.id !== artboardId) return

    const layer = findInLayers(currentArtboard.layers, layerId)
    if (!layer) return

    // Only rename if it has a generic default name
    if (isDefaultName(layer.name)) {
      const newName = generateLayerName(layer)
      api.updateLayer(artboardId, layerId, { name: newName })
    }
  })

  return unsubscribe
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_NAME_PATTERN = /^(Layer|Untitled)(\s+\d+)?$/i

function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_PATTERN.test(name.trim())
}

function renameDefaultLayers(api: CrossdrawPluginAPI, artboardId: string, layers: readonly Layer[]): void {
  for (const layer of layers) {
    if (isDefaultName(layer.name)) {
      const newName = generateLayerName(layer)
      api.updateLayer(artboardId, layer.id, { name: newName })
    }
    if (layer.type === 'group') {
      renameDefaultLayers(api, artboardId, (layer as import('@/types').GroupLayer).children)
    }
  }
}

function findInLayers(layers: readonly Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findInLayers((l as import('@/types').GroupLayer).children, id)
      if (child) return child
    }
  }
  return null
}
