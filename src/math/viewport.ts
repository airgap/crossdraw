import type { ViewportState } from '@/types'

export interface Point {
  x: number
  y: number
}

/** Convert a screen-space point to document-space. */
export function screenToDocument(screenPoint: Point, viewport: ViewportState, canvasRect: DOMRect): Point {
  return {
    x: (screenPoint.x - canvasRect.left - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - canvasRect.top - viewport.panY) / viewport.zoom,
  }
}

/** Convert a document-space point to screen-space. */
export function documentToScreen(docPoint: Point, viewport: ViewportState, canvasRect: DOMRect): Point {
  return {
    x: docPoint.x * viewport.zoom + viewport.panX + canvasRect.left,
    y: docPoint.y * viewport.zoom + viewport.panY + canvasRect.top,
  }
}

/** Zoom centered on a screen-space point. */
export function zoomAtPoint(
  viewport: ViewportState,
  screenPoint: Point,
  canvasRect: DOMRect,
  zoomDelta: number,
): ViewportState {
  const oldZoom = viewport.zoom
  const newZoom = Math.max(0.1, Math.min(10, oldZoom * (1 + zoomDelta)))

  // Point in document space should stay under the cursor
  const docX = (screenPoint.x - canvasRect.left - viewport.panX) / oldZoom
  const docY = (screenPoint.y - canvasRect.top - viewport.panY) / oldZoom

  return {
    ...viewport,
    zoom: newZoom,
    panX: screenPoint.x - canvasRect.left - docX * newZoom,
    panY: screenPoint.y - canvasRect.top - docY * newZoom,
  }
}
