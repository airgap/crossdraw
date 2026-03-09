import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'

interface PencilState {
  active: boolean
  artboardId: string
  layerId: string | null
  points: Array<{ x: number; y: number }>
}

const state: PencilState = {
  active: false,
  artboardId: '',
  layerId: null,
  points: [],
}

/** Simplify a polyline using Ramer-Douglas-Peucker algorithm */
function simplify(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]!
  const last = points[points.length - 1]!

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i]!, first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, maxIdx + 1), epsilon)
    const right = simplify(points.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

function pointToLineDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
}

export function beginPencilStroke(docX: number, docY: number, artboardId: string) {
  state.active = true
  state.artboardId = artboardId
  state.layerId = null
  state.points = [{ x: docX, y: docY }]
}

export function updatePencilStroke(docX: number, docY: number) {
  if (!state.active) return

  state.points.push({ x: docX, y: docY })

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return

  // Build segments from raw points (live preview)
  const segments: Segment[] = state.points.map((p, i) => {
    const lx = p.x - artboard.x
    const ly = p.y - artboard.y
    return i === 0 ? { type: 'move' as const, x: lx, y: ly } : { type: 'line' as const, x: lx, y: ly }
  })

  if (!state.layerId) {
    const layer: VectorLayer = {
      id: uuid(),
      name: `Pencil ${artboard.layers.length + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
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
    store.addLayer(state.artboardId, layer)
    state.layerId = layer.id
    store.selectLayer(layer.id)
  } else {
    store.updateLayerSilent(state.artboardId, state.layerId, {
      paths: [{ id: uuid(), segments, closed: false }],
    } as Partial<VectorLayer>)
  }
}

export function endPencilStroke() {
  if (!state.active) return

  // Simplify path and convert to smooth curves
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (artboard && state.layerId && state.points.length > 2) {
    const simplified = simplify(state.points, 2)
    const segments: Segment[] = fitCurves(simplified, artboard)
    store.updateLayerSilent(state.artboardId, state.layerId, {
      paths: [{ id: uuid(), segments, closed: false }],
    } as Partial<VectorLayer>)
  }

  state.active = false
  state.layerId = null
  state.points = []
}

/** Convert simplified points to smooth cubic bezier curves */
function fitCurves(points: Array<{ x: number; y: number }>, artboard: { x: number; y: number }): Segment[] {
  if (points.length < 2) return []

  const segments: Segment[] = [{ type: 'move', x: points[0]!.x - artboard.x, y: points[0]!.y - artboard.y }]

  if (points.length === 2) {
    segments.push({ type: 'line', x: points[1]!.x - artboard.x, y: points[1]!.y - artboard.y })
    return segments
  }

  // Catmull-Rom to cubic bezier conversion
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!

    const cp1x = p1.x + (p2.x - p0.x) / 6 - artboard.x
    const cp1y = p1.y + (p2.y - p0.y) / 6 - artboard.y
    const cp2x = p2.x - (p3.x - p1.x) / 6 - artboard.x
    const cp2y = p2.y - (p3.y - p1.y) / 6 - artboard.y

    segments.push({
      type: 'cubic',
      x: p2.x - artboard.x,
      y: p2.y - artboard.y,
      cp1x,
      cp1y,
      cp2x,
      cp2y,
    })
  }

  return segments
}

export function isPencilDrawing(): boolean {
  return state.active
}
