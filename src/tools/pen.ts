import { v4 as uuid } from 'uuid'
import type { Segment, Path, VectorLayer } from '@/types'
import { useEditorStore, createDefaultVectorLayer } from '@/store/editor.store'
import { screenToDocument, type Point } from '@/math/viewport'

export interface PenState {
  isDrawing: boolean
  currentPath: Segment[]
  /** Last placed endpoint (for cubic handle computation) */
  lastPoint: Point | null
  /** If user dragged after clicking, these are the handle coords */
  lastHandle: Point | null
  /** Layer being drawn into */
  layerId: string | null
  /** Artboard being drawn on */
  artboardId: string | null
  /** Preview point for live feedback */
  previewPoint: Point | null
  /** Whether user is currently click-dragging to define a handle */
  isDragging: boolean
  /** Current control handle position during drag */
  dragHandle: Point | null
}

const initialPenState: PenState = {
  isDrawing: false,
  currentPath: [],
  lastPoint: null,
  lastHandle: null,
  layerId: null,
  artboardId: null,
  previewPoint: null,
  isDragging: false,
  dragHandle: null,
}

let penState: PenState = { ...initialPenState }

export function getPenState(): PenState {
  return penState
}

/** Returns the subset of pen state needed for viewport preview rendering */
export function getPenPreviewState() {
  return {
    isDrawing: penState.isDrawing,
    isDragging: penState.isDragging,
    lastPoint: penState.lastPoint,
    lastHandle: penState.lastHandle,
    dragHandle: penState.dragHandle,
    currentPath: penState.currentPath,
    previewPoint: penState.previewPoint,
  }
}

export function resetPen() {
  penState = { ...initialPenState }
}

function getArtboardId(): string | null {
  const store = useEditorStore.getState()
  return store.document.artboards[0]?.id ?? null
}

function getDocPoint(e: MouseEvent, canvasRect: DOMRect): Point {
  const viewport = useEditorStore.getState().viewport
  const doc = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, canvasRect)
  // Subtract artboard offset
  const artboard = useEditorStore.getState().document.artboards.find(
    (a) => a.id === penState.artboardId,
  )
  if (artboard) {
    return { x: doc.x - artboard.x, y: doc.y - artboard.y }
  }
  return doc
}

export function penMouseDown(e: MouseEvent, canvasRect: DOMRect) {
  if (e.button !== 0) return

  if (!penState.isDrawing) {
    // Start a new path
    const artboardId = getArtboardId()
    if (!artboardId) return

    penState.artboardId = artboardId
    penState.isDrawing = true
    penState.currentPath = []

    // Create a new vector layer for this path
    const layer = createDefaultVectorLayer(`Path ${Date.now()}`)
    // Pen paths need a visible stroke (default layer has stroke: null)
    layer.stroke = { width: 2, color: '#000000', opacity: 1, position: 'center', linecap: 'round', linejoin: 'round', miterLimit: 4 }
    layer.fill = null
    penState.layerId = layer.id
    useEditorStore.getState().addLayer(artboardId, layer)
  }

  const point = getDocPoint(e, canvasRect)

  // Check if clicking near first point to close
  if (penState.currentPath.length >= 2 && penState.lastPoint) {
    const firstSeg = penState.currentPath[0]
    if (firstSeg && firstSeg.type === 'move') {
      const dx = point.x - firstSeg.x
      const dy = point.y - firstSeg.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const viewport = useEditorStore.getState().viewport
      if (dist < 8 / viewport.zoom) {
        // Close the path
        finishPath(true)
        return
      }
    }
  }

  if (penState.currentPath.length === 0) {
    // First point: moveTo
    penState.currentPath.push({ type: 'move', x: point.x, y: point.y })
  } else if (penState.lastHandle) {
    // Previous point had a drag-handle: create cubic
    // cp1 = the outgoing handle from the previous anchor (the drag direction itself)
    penState.currentPath.push({
      type: 'cubic',
      cp1x: penState.lastHandle.x,
      cp1y: penState.lastHandle.y,
      cp2x: point.x, // will be updated on drag
      cp2y: point.y,
      x: point.x,
      y: point.y,
    })
  } else {
    // Simple line
    penState.currentPath.push({ type: 'line', x: point.x, y: point.y })
  }

  penState.lastPoint = point
  penState.lastHandle = null // reset until drag
  penState.previewPoint = null

  commitCurrentPath()
}

export function penMouseDrag(e: MouseEvent, canvasRect: DOMRect) {
  if (!penState.isDrawing || !penState.lastPoint) return

  const point = getDocPoint(e, canvasRect)

  // Track drag state for live bezier preview
  penState.isDragging = true
  penState.dragHandle = point

  // Alt key: asymmetric handles — only set outgoing handle, don't mirror
  const altKey = e.altKey

  // User is dragging — this defines the bezier handle
  penState.lastHandle = point

  // Update the last segment to be a cubic with handles
  const segments = penState.currentPath
  const lastSeg = segments[segments.length - 1]
  if (!lastSeg) return

  if (lastSeg.type === 'line') {
    // Convert line to cubic with handles
    const prevSeg = segments.length >= 2 ? segments[segments.length - 2] : null
    const prevX = prevSeg && 'x' in prevSeg ? prevSeg.x : lastSeg.x
    const prevY = prevSeg && 'y' in prevSeg ? prevSeg.y : lastSeg.y

    segments[segments.length - 1] = {
      type: 'cubic',
      cp1x: prevX,
      cp1y: prevY,
      cp2x: altKey ? lastSeg.x : 2 * lastSeg.x - point.x, // mirror of handle (or identity if Alt)
      cp2y: altKey ? lastSeg.y : 2 * lastSeg.y - point.y,
      x: lastSeg.x,
      y: lastSeg.y,
    }
  } else if (lastSeg.type === 'cubic') {
    // Update the incoming control point (cp2 = mirror of drag, or unchanged if Alt)
    if (!altKey) {
      lastSeg.cp2x = 2 * lastSeg.x - point.x
      lastSeg.cp2y = 2 * lastSeg.y - point.y
    }
  }

  commitCurrentPath()
}

export function penMouseMove(e: MouseEvent, canvasRect: DOMRect) {
  if (!penState.isDrawing) return
  penState.previewPoint = getDocPoint(e, canvasRect)
}

export function penMouseUp() {
  // Handle finishes on mouseUp — the drag handle is now locked in
  penState.isDragging = false
  penState.dragHandle = null
  // Flush final path state to store so layer rendering picks it up
  commitCurrentPath()
}

export function penKeyDown(e: KeyboardEvent) {
  if (!penState.isDrawing) return

  if (e.key === 'Escape') {
    // Cancel without saving
    if (penState.artboardId && penState.layerId) {
      useEditorStore.getState().deleteLayer(penState.artboardId, penState.layerId)
    }
    resetPen()
  } else if (e.key === 'Enter') {
    finishPath(false)
  }
}

function finishPath(close: boolean) {
  if (close) {
    penState.currentPath.push({ type: 'close' })
  }
  commitCurrentPath()
  commitFinalPath(close)
  resetPen()
}

function commitCurrentPath() {
  const { artboardId, layerId, currentPath } = penState
  if (!artboardId || !layerId || currentPath.length === 0) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === layerId) as VectorLayer | undefined
  if (!layer) return

  // Update or create the path on the layer
  const pathId = `pen-active-${layerId}`
  const existingPath = layer.paths.find((p) => p.id === pathId)

  // Deep-clone segments so Immer's freeze doesn't make penState's objects readonly
  const clonedSegments = currentPath.map(seg => ({ ...seg }))

  if (existingPath) {
    store.updatePath(artboardId, layerId, pathId, {
      segments: clonedSegments,
      closed: currentPath.some((s) => s.type === 'close'),
    })
  } else {
    const path: Path = {
      id: pathId,
      segments: clonedSegments,
      closed: false,
    }
    store.addPath(artboardId, layerId, path)
  }
}

function commitFinalPath(closed: boolean) {
  const { artboardId, layerId, currentPath } = penState
  if (!artboardId || !layerId) return

  // Replace the temp path with a final one (permanent ID)
  const tempPathId = `pen-active-${layerId}`
  const finalPath: Path = {
    id: uuid(),
    segments: [...currentPath],
    closed,
  }

  const store = useEditorStore.getState()
  // Delete temp, add final
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId) as VectorLayer | undefined
  if (!layer) return

  const hasTempPath = layer.paths.some((p) => p.id === tempPathId)
  if (hasTempPath) {
    store.updatePath(artboardId, layerId, tempPathId, {
      id: finalPath.id,
      segments: finalPath.segments,
      closed: finalPath.closed,
    })
  }
}
