import { v4 as uuid } from 'uuid'
import type { Segment, Path, VectorLayer } from '@/types'
import { useEditorStore, createDefaultVectorLayer } from '@/store/editor.store'

// ─── Module state ────────────────────────────────────────────

interface CurvaturePenPoint {
  x: number
  y: number
  corner: boolean
}

interface CurvaturePenState {
  isDrawing: boolean
  points: CurvaturePenPoint[]
  layerId: string | null
  artboardId: string | null
  previewX: number
  previewY: number
  hasPreview: boolean
}

const initialState: CurvaturePenState = {
  isDrawing: false,
  points: [],
  layerId: null,
  artboardId: null,
  previewX: 0,
  previewY: 0,
  hasPreview: false,
}

let state: CurvaturePenState = { ...initialState }

// ─── Exports ─────────────────────────────────────────────────

export function getCurvaturePenState(): CurvaturePenState {
  return state
}

export function resetCurvaturePen() {
  state = { ...initialState }
}

// ─── Catmull-Rom to cubic bezier conversion ──────────────────

/**
 * Given an array of points (with corner flags), compute cubic bezier
 * segments. For smooth points, uses Catmull-Rom tangent estimation:
 *   tangent(i) = (P(i+1) - P(i-1)) / 2
 * Then:
 *   cp1 of segment from Pi to Pi+1 = Pi + tangent(i) / 3
 *   cp2 of segment from Pi to Pi+1 = Pi+1 - tangent(i+1) / 3
 *
 * For corner points, tangent is zero (no smoothing).
 */
function computeSegments(points: CurvaturePenPoint[], closed: boolean): Segment[] {
  if (points.length === 0) return []
  if (points.length === 1) {
    return [{ type: 'move', x: points[0]!.x, y: points[0]!.y }]
  }

  const n = points.length

  // Compute tangents for each point
  const tangents: Array<{ x: number; y: number }> = new Array(n)
  for (let i = 0; i < n; i++) {
    if (points[i]!.corner) {
      tangents[i] = { x: 0, y: 0 }
      continue
    }

    let prev: CurvaturePenPoint
    let next: CurvaturePenPoint

    if (closed) {
      prev = points[(i - 1 + n) % n]!
      next = points[(i + 1) % n]!
    } else {
      if (i === 0) {
        // Open start: use forward difference
        prev = points[0]!
        next = points[1]!
      } else if (i === n - 1) {
        // Open end: use backward difference
        prev = points[n - 2]!
        next = points[n - 1]!
      } else {
        prev = points[i - 1]!
        next = points[i + 1]!
      }
    }

    tangents[i] = {
      x: (next.x - prev.x) / 2,
      y: (next.y - prev.y) / 2,
    }
  }

  const segments: Segment[] = []
  segments.push({ type: 'move', x: points[0]!.x, y: points[0]!.y })

  const segCount = closed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n
    const p0 = points[i]!
    const p1 = points[j]!
    const t0 = tangents[i]!
    const t1 = tangents[j]!

    // If both endpoints are corners, use a straight line
    if (p0.corner && p1.corner) {
      segments.push({ type: 'line', x: p1.x, y: p1.y })
    } else {
      // Cubic bezier: cp1 = p0 + tangent(0)/3, cp2 = p1 - tangent(1)/3
      const cp1x = p0.x + t0.x / 3
      const cp1y = p0.y + t0.y / 3
      const cp2x = p1.x - t1.x / 3
      const cp2y = p1.y - t1.y / 3
      segments.push({
        type: 'cubic',
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        x: p1.x,
        y: p1.y,
      })
    }
  }

  if (closed) {
    segments.push({ type: 'close' })
  }

  return segments
}

// ─── Commit preview path to store ────────────────────────────

function commitPreview() {
  const { artboardId, layerId, points } = state
  if (!artboardId || !layerId || points.length === 0) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === layerId) as VectorLayer | undefined
  if (!layer) return

  const segments = computeSegments(points, false)
  const pathId = `curvpen-active-${layerId}`
  const existingPath = layer.paths.find((p) => p.id === pathId)
  const clonedSegments = segments.map((seg) => ({ ...seg }))

  if (existingPath) {
    store.updatePath(artboardId, layerId, pathId, {
      segments: clonedSegments,
      closed: false,
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

// ─── Finalize: replace temp path with permanent one ──────────

function finishPath(closed: boolean) {
  const { artboardId, layerId, points } = state
  if (!artboardId || !layerId || points.length < 2) {
    // Not enough points — delete the layer
    if (artboardId && layerId) {
      useEditorStore.getState().deleteLayer(artboardId, layerId)
    }
    resetCurvaturePen()
    return
  }

  const segments = computeSegments(points, closed)
  const tempPathId = `curvpen-active-${layerId}`
  const finalPath: Path = {
    id: uuid(),
    segments,
    closed,
  }

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) {
    resetCurvaturePen()
    return
  }

  const layer = artboard.layers.find((l) => l.id === layerId) as VectorLayer | undefined
  if (!layer) {
    resetCurvaturePen()
    return
  }

  const hasTempPath = layer.paths.some((p) => p.id === tempPathId)
  if (hasTempPath) {
    store.updatePath(artboardId, layerId, tempPathId, {
      id: finalPath.id,
      segments: finalPath.segments,
      closed: finalPath.closed,
    })
  }

  store.selectLayer(layerId)
  resetCurvaturePen()
}

// ─── Event handlers ──────────────────────────────────────────

export function curvaturePenMouseDown(
  docX: number,
  docY: number,
  artboardId: string,
  artboardX: number,
  artboardY: number,
  _shiftKey: boolean,
  isDoubleClick: boolean,
) {
  const localX = docX - artboardX
  const localY = docY - artboardY

  if (!state.isDrawing) {
    // Start a new path
    state.isDrawing = true
    state.artboardId = artboardId
    state.points = []

    // Create a vector layer for this path
    const layer = createDefaultVectorLayer(`Curvature Path ${Date.now()}`)
    layer.stroke = {
      width: 2,
      color: '#000000',
      opacity: 1,
      position: 'center',
      linecap: 'round',
      linejoin: 'round',
      miterLimit: 4,
    }
    layer.fill = null
    state.layerId = layer.id
    useEditorStore.getState().addLayer(artboardId, layer)
  }

  // Check if clicking near the first point to close the path
  if (state.points.length >= 2) {
    const first = state.points[0]!
    const dx = localX - first.x
    const dy = localY - first.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const zoom = useEditorStore.getState().viewport.zoom
    if (dist < 8 / zoom) {
      finishPath(true)
      return
    }
  }

  // Add point: double-click = corner, single click = smooth
  state.points.push({
    x: localX,
    y: localY,
    corner: isDoubleClick,
  })

  commitPreview()
}

export function curvaturePenMouseMove(docX: number, docY: number) {
  if (!state.isDrawing || !state.artboardId) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return

  state.previewX = docX - artboard.x
  state.previewY = docY - artboard.y
  state.hasPreview = true
}

export function curvaturePenKeyDown(key: string) {
  if (!state.isDrawing) return

  if (key === 'Escape') {
    // Cancel — delete the layer
    if (state.artboardId && state.layerId) {
      useEditorStore.getState().deleteLayer(state.artboardId, state.layerId)
    }
    resetCurvaturePen()
  } else if (key === 'Enter') {
    finishPath(false)
  }
}
