import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer, Gradient, GradientStop, Fill } from '@/types'

interface GradientDragState {
  active: boolean
  startX: number
  startY: number
  artboardId: string
  layerId: string | null
}

const dragState: GradientDragState = {
  active: false,
  startX: 0,
  startY: 0,
  artboardId: '',
  layerId: null,
}

/** Default gradient stops (black to white) */
function defaultStops(): GradientStop[] {
  return [
    { offset: 0, color: '#000000', opacity: 1 },
    { offset: 1, color: '#ffffff', opacity: 1 },
  ]
}

export function beginGradientDrag(docX: number, docY: number, artboardId: string) {
  dragState.active = true
  dragState.startX = docX
  dragState.startY = docY
  dragState.artboardId = artboardId

  // If a layer is selected, we'll modify its fill
  const store = useEditorStore.getState()
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const artboard = store.document.artboards.find((a) => a.id === artboardId)
    const layer = artboard?.layers.find((l) => l.id === selectedId)
    if (layer && layer.type === 'vector') {
      dragState.layerId = selectedId
      return
    }
  }
  dragState.layerId = null
}

export function updateGradientDrag(docX: number, docY: number, shift: boolean) {
  if (!dragState.active) return

  let endX = docX
  let endY = docY

  // Shift: constrain angle to 45-degree increments
  if (shift) {
    const dx = endX - dragState.startX
    const dy = endY - dragState.startY
    const angle = Math.atan2(dy, dx)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    endX = dragState.startX + Math.cos(snapped) * dist
    endY = dragState.startY + Math.sin(snapped) * dist
  }

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
  if (!artboard) return

  // Compute gradient angle from start to end
  const dx = endX - dragState.startX
  const dy = endY - dragState.startY
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI

  // Relative position within artboard (0-1)
  const relX = (dragState.startX - artboard.x) / artboard.width
  const relY = (dragState.startY - artboard.y) / artboard.height

  const gradient: Gradient = {
    id: uuid(),
    name: 'Linear Gradient',
    type: 'linear',
    angle,
    x: relX,
    y: relY,
    stops: defaultStops(),
    dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
  }

  const fill: Fill = {
    type: 'gradient',
    gradient,
    opacity: 1,
  }

  if (dragState.layerId) {
    store.updateLayerSilent(dragState.artboardId, dragState.layerId, { fill } as Partial<VectorLayer>)
  }
}

export function endGradientDrag() {
  if (!dragState.active) return
  // Commit the silent updates to undo history
  if (dragState.layerId) {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
    const layer = artboard?.layers.find((l) => l.id === dragState.layerId) as VectorLayer | undefined
    if (layer?.fill) {
      store.updateLayer(dragState.artboardId, dragState.layerId, { fill: layer.fill } as Partial<VectorLayer>)
    }
  }
  dragState.active = false
  dragState.layerId = null
}

export function isGradientDragging(): boolean {
  return dragState.active
}

/** Get current drag line for overlay rendering */
export function getGradientDragLine(): { startX: number; startY: number; endX: number; endY: number } | null {
  if (!dragState.active) return null
  return { startX: dragState.startX, startY: dragState.startY, endX: 0, endY: 0 }
}
