import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { snapPoint } from '@/tools/snap'

interface LineDragState {
  active: boolean
  startX: number
  startY: number
  artboardId: string
  layerId: string | null
}

const dragState: LineDragState = {
  active: false,
  startX: 0,
  startY: 0,
  artboardId: '',
  layerId: null,
}

export function beginLineDrag(docX: number, docY: number, artboardId: string) {
  const snap = snapPoint(docX, docY)
  dragState.active = true
  dragState.startX = snap.x ?? docX
  dragState.startY = snap.y ?? docY
  dragState.artboardId = artboardId
  dragState.layerId = null
}

export function updateLineDrag(docX: number, docY: number, shift: boolean) {
  if (!dragState.active) return

  const store = useEditorStore.getState()
  const excludeIds = dragState.layerId ? [dragState.layerId] : []
  const snap = snapPoint(docX, docY, excludeIds)
  let endX = snap.x ?? docX
  let endY = snap.y ?? docY

  if (snap.snapLinesH.length > 0 || snap.snapLinesV.length > 0) {
    store.setActiveSnapLines({ h: snap.snapLinesH, v: snap.snapLinesV })
  } else {
    store.setActiveSnapLines(null)
  }

  // Shift: constrain to 0/45/90 degree angles
  if (shift) {
    const dx = endX - dragState.startX
    const dy = endY - dragState.startY
    const angle = Math.atan2(dy, dx)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    endX = dragState.startX + Math.cos(snapped) * dist
    endY = dragState.startY + Math.sin(snapped) * dist
  }

  const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
  if (!artboard) return

  const localStartX = dragState.startX - artboard.x
  const localStartY = dragState.startY - artboard.y
  const localEndX = endX - artboard.x
  const localEndY = endY - artboard.y

  const segments: Segment[] = [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: localEndX - localStartX, y: localEndY - localStartY },
  ]

  if (!dragState.layerId) {
    const layer: VectorLayer = {
      id: uuid(),
      name: `Line ${artboard.layers.length + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: localStartX, y: localStartY, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [{ id: uuid(), segments, closed: false }],
      fill: null,
      stroke: {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 10,
      },
    }
    store.addLayer(dragState.artboardId, layer)
    dragState.layerId = layer.id
    store.selectLayer(layer.id)
  } else {
    store.updateLayerSilent(dragState.artboardId, dragState.layerId, {
      paths: [{ id: uuid(), segments, closed: false }],
    } as Partial<VectorLayer>)
  }
}

export function endLineDrag() {
  if (!dragState.active) return
  useEditorStore.getState().setActiveSnapLines(null)
  dragState.active = false
  dragState.layerId = null
}

export function isLineDragging(): boolean {
  return dragState.active
}
