import RBush from 'rbush'
import type { DesignDocument, Layer, Artboard } from '@/types'
import { getLayerBBox, type BBox } from './bbox'
import { segmentsToPath2D } from './path'

interface SpatialItem extends BBox {
  layerId: string
  artboardId: string
}

/**
 * Spatial index for fast layer hit testing.
 * Uses rbush R-Tree for O(log n) AABB queries.
 */
export class SpatialIndex {
  private tree = new RBush<SpatialItem>()
  private items = new Map<string, SpatialItem>()

  /** Rebuild the entire index from a document. */
  rebuild(doc: DesignDocument) {
    this.tree.clear()
    this.items.clear()

    const bulk: SpatialItem[] = []
    for (const artboard of doc.artboards) {
      for (const layer of artboard.layers) {
        if (!layer.visible) continue
        const bbox = getLayerBBox(layer, artboard)
        if (bbox.minX === Infinity) continue // empty
        const item: SpatialItem = {
          ...bbox,
          layerId: layer.id,
          artboardId: artboard.id,
        }
        this.items.set(layer.id, item)
        bulk.push(item)
      }
    }
    this.tree.load(bulk)
  }

  /**
   * Hit test at a document-space point.
   * Returns layers from topmost to bottommost.
   */
  hitTest(x: number, y: number, doc: DesignDocument): { layer: Layer; artboard: Artboard }[] {
    // Phase 1: AABB query
    const candidates = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    })

    if (candidates.length === 0) return []

    // Phase 2: precise hit test, ordered by layer stack (topmost first)
    const results: { layer: Layer; artboard: Artboard; stackIndex: number }[] = []

    for (const candidate of candidates) {
      const artboard = doc.artboards.find((a) => a.id === candidate.artboardId)
      if (!artboard) continue

      const layerIndex = artboard.layers.findIndex((l) => l.id === candidate.layerId)
      const layer = artboard.layers[layerIndex]
      if (!layer || !layer.visible) continue

      // Precise test
      if (preciseHitTest(layer, artboard, x, y)) {
        results.push({ layer, artboard, stackIndex: layerIndex })
      }
    }

    // Sort topmost first (highest index = rendered last = on top)
    results.sort((a, b) => b.stackIndex - a.stackIndex)
    return results.map(({ layer, artboard }) => ({ layer, artboard }))
  }
}

/**
 * Precise hit test: point-in-path for vector layers.
 * Uses an offscreen canvas for isPointInPath/isPointInStroke.
 */
function preciseHitTest(layer: Layer, artboard: Artboard, docX: number, docY: number): boolean {
  if (layer.type === 'raster') {
    // AABB is sufficient for rasters
    return true
  }

  if (
    layer.type === 'text' ||
    layer.type === 'group' ||
    layer.type === 'fill' ||
    layer.type === 'clone' ||
    layer.type === 'smart-object'
  ) {
    // AABB is sufficient for these layer types
    return true
  }

  if (layer.type !== 'vector') return false

  // Convert doc coords to layer-local coords (inverting translate, scale, then skew)
  const t = layer.transform
  let localX = (docX - artboard.x - t.x) / (t.scaleX || 1)
  let localY = (docY - artboard.y - t.y) / (t.scaleY || 1)
  if (t.skewX || t.skewY) {
    // Forward shear is x' = x + tanX·y, y' = tanY·x + y — invert it.
    const tanX = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
    const tanY = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
    const det = 1 - tanX * tanY
    if (Math.abs(det) > 1e-6) {
      const ux = (localX - tanX * localY) / det
      const uy = (localY - tanY * localX) / det
      localX = ux
      localY = uy
    }
  }

  // Use CanvasRenderingContext2D for hit testing
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')!

  for (const path of layer.paths) {
    const path2d = segmentsToPath2D(path.segments)

    // Check fill
    if (layer.fill && ctx.isPointInPath(path2d, localX, localY)) {
      return true
    }

    // Check stroke
    if (layer.stroke) {
      ctx.lineWidth = layer.stroke.width
      if (ctx.isPointInStroke(path2d, localX, localY)) {
        return true
      }
    }
  }

  return false
}

/** Singleton spatial index instance. */
export const spatialIndex = new SpatialIndex()
