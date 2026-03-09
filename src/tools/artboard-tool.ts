import { useEditorStore } from '@/store/editor.store'
import { snapPoint } from '@/tools/snap'

interface ArtboardDragState {
  mode: 'none' | 'create' | 'move' | 'resize'
  startX: number
  startY: number
  artboardId: string | null
  /** For move: offset from artboard origin to grab point */
  offsetX: number
  offsetY: number
  /** For resize: which edge/corner */
  resizeHandle: string | null
}

const dragState: ArtboardDragState = {
  mode: 'none',
  startX: 0,
  startY: 0,
  artboardId: null,
  offsetX: 0,
  offsetY: 0,
  resizeHandle: null,
}

export function beginArtboardDrag(docX: number, docY: number) {
  const store = useEditorStore.getState()

  // Check if clicking on an existing artboard edge/corner for resize
  // or inside for move, or empty space for create
  const artboard = store.document.artboards.find((a) => {
    return docX >= a.x && docX <= a.x + a.width && docY >= a.y && docY <= a.y + a.height
  })

  if (artboard) {
    // Check if near an edge for resize
    const margin = 8 / store.viewport.zoom
    const nearLeft = Math.abs(docX - artboard.x) < margin
    const nearRight = Math.abs(docX - (artboard.x + artboard.width)) < margin
    const nearTop = Math.abs(docY - artboard.y) < margin
    const nearBottom = Math.abs(docY - (artboard.y + artboard.height)) < margin

    if (nearLeft || nearRight || nearTop || nearBottom) {
      dragState.mode = 'resize'
      dragState.artboardId = artboard.id
      dragState.startX = docX
      dragState.startY = docY
      let handle = ''
      if (nearTop) handle += 'n'
      if (nearBottom) handle += 's'
      if (nearLeft) handle += 'w'
      if (nearRight) handle += 'e'
      dragState.resizeHandle = handle
    } else {
      // Move artboard
      dragState.mode = 'move'
      dragState.artboardId = artboard.id
      dragState.startX = docX
      dragState.startY = docY
      dragState.offsetX = docX - artboard.x
      dragState.offsetY = docY - artboard.y
    }
  } else {
    // Create new artboard
    dragState.mode = 'create'
    const snap = snapPoint(docX, docY)
    dragState.startX = snap.x ?? docX
    dragState.startY = snap.y ?? docY
    dragState.artboardId = null
  }
}

export function updateArtboardDrag(docX: number, docY: number, _shift: boolean) {
  const store = useEditorStore.getState()

  if (dragState.mode === 'create') {
    // Visual feedback handled by overlay; actual creation happens on end
    return
  }

  if (dragState.mode === 'move' && dragState.artboardId) {
    const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
    if (!artboard) return
    store.moveArtboard(dragState.artboardId, Math.round(docX - dragState.offsetX), Math.round(docY - dragState.offsetY))
  }
}

export function endArtboardDrag(docX: number, docY: number) {
  const store = useEditorStore.getState()

  if (dragState.mode === 'create') {
    const w = Math.abs(docX - dragState.startX)
    const h = Math.abs(docY - dragState.startY)
    if (w > 10 && h > 10) {
      const x = Math.min(dragState.startX, docX)
      const y = Math.min(dragState.startY, docY)
      store.addArtboard(`Artboard ${store.document.artboards.length + 1}`, Math.round(w), Math.round(h))
      // Position the new artboard
      const newArtboard = store.document.artboards[store.document.artboards.length - 1]
      if (newArtboard) {
        store.moveArtboard(newArtboard.id, Math.round(x), Math.round(y))
      }
    }
  }

  if (dragState.mode === 'resize' && dragState.artboardId) {
    const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
    if (artboard && dragState.resizeHandle) {
      let { x, y, width, height } = artboard
      const handle = dragState.resizeHandle
      if (handle.includes('e')) width = Math.max(50, Math.round(docX - x))
      if (handle.includes('s')) height = Math.max(50, Math.round(docY - y))
      if (handle.includes('w')) {
        const right = x + width
        x = Math.round(Math.min(docX, right - 50))
        width = right - x
      }
      if (handle.includes('n')) {
        const bottom = y + height
        y = Math.round(Math.min(docY, bottom - 50))
        height = bottom - y
      }
      store.moveArtboard(dragState.artboardId, x, y)
      store.resizeArtboard(dragState.artboardId, width, height)
    }
  }

  dragState.mode = 'none'
  dragState.artboardId = null
  dragState.resizeHandle = null
}

export function isArtboardDragging(): boolean {
  return dragState.mode !== 'none'
}

export function getArtboardDragRect(docX: number, docY: number): { x: number; y: number; w: number; h: number } | null {
  if (dragState.mode !== 'create') return null
  return {
    x: Math.min(dragState.startX, docX),
    y: Math.min(dragState.startY, docY),
    w: Math.abs(docX - dragState.startX),
    h: Math.abs(docY - dragState.startY),
  }
}
