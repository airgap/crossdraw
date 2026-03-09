import { useEditorStore } from '@/store/editor.store'
import { zoomAtPoint } from '@/math/viewport'

const ZOOM_STEP = 0.5 // 50% per click

/**
 * Zoom tool click handler.
 * Left click = zoom in, Alt+click = zoom out.
 */
export function zoomToolClick(screenX: number, screenY: number, canvasRect: DOMRect, zoomOut: boolean) {
  const store = useEditorStore.getState()
  const delta = zoomOut ? -ZOOM_STEP : ZOOM_STEP
  const newViewport = zoomAtPoint(store.viewport, { x: screenX, y: screenY }, canvasRect, delta)
  store.setZoom(newViewport.zoom)
  store.setPan(newViewport.panX, newViewport.panY)
}

/**
 * Zoom tool drag handler — zoom by dragging up/down.
 */
interface ZoomDragState {
  active: boolean
  startY: number
  startZoom: number
  anchorX: number
  anchorY: number
}

const dragState: ZoomDragState = {
  active: false,
  startY: 0,
  startZoom: 1,
  anchorX: 0,
  anchorY: 0,
}

export function beginZoomDrag(screenX: number, screenY: number) {
  const store = useEditorStore.getState()
  dragState.active = true
  dragState.startY = screenY
  dragState.startZoom = store.viewport.zoom
  dragState.anchorX = screenX
  dragState.anchorY = screenY
}

export function updateZoomDrag(screenY: number, canvasRect: DOMRect) {
  if (!dragState.active) return
  const store = useEditorStore.getState()
  const deltaY = dragState.startY - screenY // drag up = zoom in
  const factor = 1 + deltaY * 0.005
  const newZoom = Math.max(0.1, Math.min(10, dragState.startZoom * factor))

  const newViewport = zoomAtPoint(
    { ...store.viewport, zoom: dragState.startZoom },
    { x: dragState.anchorX, y: dragState.anchorY },
    canvasRect,
    newZoom / dragState.startZoom - 1,
  )
  store.setZoom(newViewport.zoom)
  store.setPan(newViewport.panX, newViewport.panY)
}

export function endZoomDrag() {
  dragState.active = false
}

export function isZoomDragging(): boolean {
  return dragState.active
}
