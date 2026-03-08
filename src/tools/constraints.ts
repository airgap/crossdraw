import type { Layer, Artboard, Transform } from '@/types'

/**
 * Constraint system for responsive artboard resizing.
 * Layers pin to edges and scale relative to the artboard.
 */
export interface Constraints {
  horizontal: 'left' | 'right' | 'left-right' | 'center' | 'scale'
  vertical: 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale'
}

/**
 * Apply constraints to a layer when the artboard is resized.
 */
export function applyConstraints(
  layer: Layer,
  constraints: Constraints,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): { x: number; y: number; scaleX: number; scaleY: number } {
  const t = layer.transform
  let x = t.x
  let y = t.y
  let scaleX = t.scaleX
  let scaleY = t.scaleY

  // Get layer dimensions (approximate from transform)
  const layerW = getLayerWidth(layer)
  const layerH = getLayerHeight(layer)

  // Horizontal constraints
  switch (constraints.horizontal) {
    case 'left':
      // Pin to left edge — x stays the same
      break
    case 'right':
      // Pin to right edge — maintain distance from right
      x = newWidth - (oldWidth - t.x)
      break
    case 'left-right':
      // Pin both edges — stretch to fill
      x = t.x // left stays
      const rightDist = oldWidth - (t.x + layerW * t.scaleX)
      const newW = newWidth - t.x - rightDist
      scaleX = t.scaleX * (newW / (layerW * t.scaleX))
      break
    case 'center':
      // Maintain center position proportionally
      const cx = t.x + (layerW * t.scaleX) / 2
      const cxRatio = cx / oldWidth
      x = cxRatio * newWidth - (layerW * scaleX) / 2
      break
    case 'scale':
      // Scale proportionally
      const xRatio = t.x / oldWidth
      x = xRatio * newWidth
      scaleX = t.scaleX * (newWidth / oldWidth)
      break
  }

  // Vertical constraints
  switch (constraints.vertical) {
    case 'top':
      break
    case 'bottom':
      y = newHeight - (oldHeight - t.y)
      break
    case 'top-bottom':
      y = t.y
      const bottomDist = oldHeight - (t.y + layerH * t.scaleY)
      const newH = newHeight - t.y - bottomDist
      scaleY = t.scaleY * (newH / (layerH * t.scaleY))
      break
    case 'center':
      const cy = t.y + (layerH * t.scaleY) / 2
      const cyRatio = cy / oldHeight
      y = cyRatio * newHeight - (layerH * scaleY) / 2
      break
    case 'scale':
      const yRatio = t.y / oldHeight
      y = yRatio * newHeight
      scaleY = t.scaleY * (newHeight / oldHeight)
      break
  }

  return { x, y, scaleX, scaleY }
}

function getLayerWidth(layer: Layer): number {
  if (layer.type === 'raster') return layer.width
  if (layer.type === 'vector' && layer.shapeParams) return layer.shapeParams.width
  return 100 // default fallback
}

function getLayerHeight(layer: Layer): number {
  if (layer.type === 'raster') return layer.height
  if (layer.type === 'vector' && layer.shapeParams) return layer.shapeParams.height
  return 100
}

/**
 * Apply constraints to all layers in an artboard when it's resized.
 */
export function applyArtboardResize(
  artboard: Artboard,
  newWidth: number,
  newHeight: number,
  constraintsMap: Map<string, Constraints>,
): Array<{ layerId: string; transform: Partial<Transform> }> {
  const updates: Array<{ layerId: string; transform: Partial<Transform> }> = []

  for (const layer of artboard.layers) {
    const constraints = constraintsMap.get(layer.id)
    if (!constraints) continue

    const result = applyConstraints(layer, constraints, artboard.width, artboard.height, newWidth, newHeight)

    updates.push({
      layerId: layer.id,
      transform: {
        x: result.x,
        y: result.y,
        scaleX: result.scaleX,
        scaleY: result.scaleY,
      },
    })
  }

  return updates
}

/**
 * Default constraints (pinned top-left, no scaling).
 */
export const DEFAULT_CONSTRAINTS: Constraints = {
  horizontal: 'left',
  vertical: 'top',
}
