import { useEditorStore } from '@/store/editor.store'
import { getLayerBBox, type BBox } from '@/math/bbox'

export interface SnapResult {
  x: number | null  // snapped X or null if no snap
  y: number | null  // snapped Y or null if no snap
  snapLinesH: number[]  // horizontal snap lines to render
  snapLinesV: number[]  // vertical snap lines to render
}

/**
 * Snap a point to guides, grid, artboard edges, and other layer edges.
 * Respects granular snap preferences from the store.
 * Returns the snapped coordinates and snap lines for rendering.
 */
export function snapPoint(
  docX: number,
  docY: number,
  excludeLayerIds: string[] = [],
): SnapResult {
  const store = useEditorStore.getState()
  if (!store.snapEnabled) return { x: null, y: null, snapLinesH: [], snapLinesV: [] }

  const artboard = store.document.artboards[0]
  if (!artboard) return { x: null, y: null, snapLinesH: [], snapLinesV: [] }

  const zoom = store.viewport.zoom
  const threshold = store.snapThreshold / zoom

  const candidatesX: number[] = []
  const candidatesY: number[] = []

  // 1. Guides
  if (store.snapToGuides && artboard.guides) {
    for (const gx of artboard.guides.vertical) {
      candidatesX.push(artboard.x + gx)
    }
    for (const gy of artboard.guides.horizontal) {
      candidatesY.push(artboard.y + gy)
    }
  }

  // 2. Grid
  if (store.snapToGrid && store.showGrid) {
    const gs = store.gridSize
    const nearestGridX = Math.round((docX - artboard.x) / gs) * gs + artboard.x
    const nearestGridY = Math.round((docY - artboard.y) / gs) * gs + artboard.y
    candidatesX.push(nearestGridX)
    candidatesY.push(nearestGridY)
  }

  // 3. Artboard edges and center
  if (store.snapToArtboard) {
    candidatesX.push(artboard.x, artboard.x + artboard.width / 2, artboard.x + artboard.width)
    candidatesY.push(artboard.y, artboard.y + artboard.height / 2, artboard.y + artboard.height)
  }

  // 4. Other layer edges and centers
  if (store.snapToLayers) {
    for (const layer of artboard.layers) {
      if (excludeLayerIds.includes(layer.id)) continue
      if (!layer.visible) continue
      const bbox = getLayerBBox(layer, artboard)
      if (bbox.minX === Infinity) continue
      candidatesX.push(bbox.minX, (bbox.minX + bbox.maxX) / 2, bbox.maxX)
      candidatesY.push(bbox.minY, (bbox.minY + bbox.maxY) / 2, bbox.maxY)
    }
  }

  // Find best snap
  let bestX: number | null = null
  let bestDistX = threshold
  for (const cx of candidatesX) {
    const dist = Math.abs(docX - cx)
    if (dist < bestDistX) {
      bestDistX = dist
      bestX = cx
    }
  }

  let bestY: number | null = null
  let bestDistY = threshold
  for (const cy of candidatesY) {
    const dist = Math.abs(docY - cy)
    if (dist < bestDistY) {
      bestDistY = dist
      bestY = cy
    }
  }

  // Pixel snapping: round to nearest integer after all other snapping
  if (store.snapToPixel) {
    bestX = bestX !== null ? Math.round(bestX) : Math.round(docX)
    bestY = bestY !== null ? Math.round(bestY) : Math.round(docY)
  }

  return {
    x: bestX,
    y: bestY,
    snapLinesV: bestX !== null ? [bestX] : [],
    snapLinesH: bestY !== null ? [bestY] : [],
  }
}

/**
 * Snap a bounding box (for layer move operations).
 * Checks all 5 reference lines (left, center, right / top, middle, bottom).
 * Respects granular snap preferences from the store.
 */
export function snapBBox(
  bbox: BBox,
  dx: number,
  dy: number,
  excludeLayerIds: string[] = [],
): { dx: number; dy: number; snapLinesH: number[]; snapLinesV: number[] } {
  const store = useEditorStore.getState()
  if (!store.snapEnabled) return { dx, dy, snapLinesH: [], snapLinesV: [] }

  const artboard = store.document.artboards[0]
  if (!artboard) return { dx, dy, snapLinesH: [], snapLinesV: [] }

  const zoom = store.viewport.zoom
  const threshold = store.snapThreshold / zoom

  // The proposed new position
  const newBBox: BBox = {
    minX: bbox.minX + dx,
    minY: bbox.minY + dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  }
  const newCx = (newBBox.minX + newBBox.maxX) / 2
  const newCy = (newBBox.minY + newBBox.maxY) / 2

  // Collect snap targets
  const targetsX: number[] = []
  const targetsY: number[] = []

  if (store.snapToGuides && artboard.guides) {
    for (const gx of artboard.guides.vertical) targetsX.push(artboard.x + gx)
    for (const gy of artboard.guides.horizontal) targetsY.push(artboard.y + gy)
  }

  if (store.snapToGrid && store.showGrid) {
    const gs = store.gridSize
    for (const ref of [newBBox.minX, newCx, newBBox.maxX]) {
      targetsX.push(Math.round((ref - artboard.x) / gs) * gs + artboard.x)
    }
    for (const ref of [newBBox.minY, newCy, newBBox.maxY]) {
      targetsY.push(Math.round((ref - artboard.y) / gs) * gs + artboard.y)
    }
  }

  if (store.snapToArtboard) {
    targetsX.push(artboard.x, artboard.x + artboard.width / 2, artboard.x + artboard.width)
    targetsY.push(artboard.y, artboard.y + artboard.height / 2, artboard.y + artboard.height)
  }

  if (store.snapToLayers) {
    for (const layer of artboard.layers) {
      if (excludeLayerIds.includes(layer.id)) continue
      if (!layer.visible) continue
      const lb = getLayerBBox(layer, artboard)
      if (lb.minX === Infinity) continue
      targetsX.push(lb.minX, (lb.minX + lb.maxX) / 2, lb.maxX)
      targetsY.push(lb.minY, (lb.minY + lb.maxY) / 2, lb.maxY)
    }
  }

  // Check each edge of the moving bbox against targets
  let bestSnapDx = 0
  let bestDistX = threshold
  let snapLineV: number | null = null
  const refXs = [newBBox.minX, newCx, newBBox.maxX]
  for (const refX of refXs) {
    for (const tx of targetsX) {
      const dist = Math.abs(refX - tx)
      if (dist < bestDistX) {
        bestDistX = dist
        bestSnapDx = tx - refX
        snapLineV = tx
      }
    }
  }

  let bestSnapDy = 0
  let bestDistY = threshold
  let snapLineH: number | null = null
  const refYs = [newBBox.minY, newCy, newBBox.maxY]
  for (const refY of refYs) {
    for (const ty of targetsY) {
      const dist = Math.abs(refY - ty)
      if (dist < bestDistY) {
        bestDistY = dist
        bestSnapDy = ty - refY
        snapLineH = ty
      }
    }
  }

  let finalDx = dx + bestSnapDx
  let finalDy = dy + bestSnapDy

  // Pixel snapping: round final position to nearest integer
  if (store.snapToPixel) {
    const finalMinX = bbox.minX + finalDx
    const finalMinY = bbox.minY + finalDy
    finalDx = Math.round(finalMinX) - bbox.minX
    finalDy = Math.round(finalMinY) - bbox.minY
  }

  return {
    dx: finalDx,
    dy: finalDy,
    snapLinesV: snapLineV !== null ? [snapLineV] : [],
    snapLinesH: snapLineH !== null ? [snapLineH] : [],
  }
}

/**
 * Render snap lines (magenta dashed) on the canvas in document space.
 */
export function renderSnapLines(
  ctx: CanvasRenderingContext2D,
  lines: { h: number[]; v: number[] },
  zoom: number,
) {
  ctx.save()
  ctx.strokeStyle = '#ff00ff'
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])
  for (const y of lines.h) {
    ctx.beginPath()
    ctx.moveTo(-10000, y)
    ctx.lineTo(10000, y)
    ctx.stroke()
  }
  for (const x of lines.v) {
    ctx.beginPath()
    ctx.moveTo(x, -10000)
    ctx.lineTo(x, 10000)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}
