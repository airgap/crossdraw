import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { ExportSlice } from '@/types'

interface SliceDragState {
  active: boolean
  startX: number
  startY: number
  artboardId: string
}

const dragState: SliceDragState = {
  active: false,
  startX: 0,
  startY: 0,
  artboardId: '',
}

export function beginSliceDrag(docX: number, docY: number, artboardId: string) {
  dragState.active = true
  dragState.startX = docX
  dragState.startY = docY
  dragState.artboardId = artboardId
}

export function updateSliceDrag(_docX: number, _docY: number) {
  // Visual feedback handled by overlay rendering
}

export function endSliceDrag(docX: number, docY: number) {
  if (!dragState.active) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
  if (!artboard) {
    dragState.active = false
    return
  }

  const x = Math.min(dragState.startX, docX) - artboard.x
  const y = Math.min(dragState.startY, docY) - artboard.y
  const w = Math.abs(docX - dragState.startX)
  const h = Math.abs(docY - dragState.startY)

  if (w > 5 && h > 5) {
    const slice: ExportSlice = {
      id: uuid(),
      name: `Slice ${(artboard.slices?.length ?? 0) + 1}`,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      format: 'png',
      scale: 1,
    }
    store.addSlice(dragState.artboardId, slice)
  }

  dragState.active = false
}

export function getSliceDragRect(docX: number, docY: number): { x: number; y: number; w: number; h: number } | null {
  if (!dragState.active) return null
  return {
    x: Math.min(dragState.startX, docX),
    y: Math.min(dragState.startY, docY),
    w: Math.abs(docX - dragState.startX),
    h: Math.abs(docY - dragState.startY),
  }
}

export function isSliceDragging(): boolean {
  return dragState.active
}
