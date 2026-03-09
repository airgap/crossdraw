import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer, Segment, Path } from '@/types'

interface KnifeState {
  active: boolean
  points: Array<{ x: number; y: number }>
}

const state: KnifeState = {
  active: false,
  points: [],
}

export function beginKnifeCut(docX: number, docY: number) {
  state.active = true
  state.points = [{ x: docX, y: docY }]
}

export function updateKnifeCut(docX: number, docY: number) {
  if (!state.active) return
  state.points.push({ x: docX, y: docY })
}

export function endKnifeCut() {
  if (!state.active || state.points.length < 2) {
    state.active = false
    state.points = []
    return
  }

  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) {
    state.active = false
    state.points = []
    return
  }

  // Find selected vector layer to cut
  const selectedId = store.selection.layerIds[0]
  if (!selectedId) {
    state.active = false
    state.points = []
    return
  }

  const layer = artboard.layers.find((l) => l.id === selectedId)
  if (!layer || layer.type !== 'vector') {
    state.active = false
    state.points = []
    return
  }

  const vectorLayer = layer as VectorLayer
  const knifeLine = state.points

  // For each path in the layer, find intersections with the knife line
  // and split the path at those points
  const newPaths: Path[] = []
  for (const path of vectorLayer.paths) {
    const splitPaths = splitPathWithKnife(path, knifeLine, vectorLayer.transform)
    newPaths.push(...splitPaths)
  }

  if (newPaths.length > vectorLayer.paths.length) {
    // Create new layers for the split result
    store.updateLayerSilent(artboard.id, selectedId, {
      paths: [newPaths[0]!],
    } as Partial<VectorLayer>)

    // Add remaining paths as new layers
    for (let i = 1; i < newPaths.length; i++) {
      const newLayer: VectorLayer = {
        ...vectorLayer,
        id: uuid(),
        name: `${vectorLayer.name} (cut ${i})`,
        paths: [newPaths[i]!],
        shapeParams: undefined,
      }
      store.addLayer(artboard.id, newLayer)
    }
  }

  state.active = false
  state.points = []
}

/**
 * Split a path where the knife line crosses it.
 * Simplified: finds approximate split points and divides segments.
 */
function splitPathWithKnife(
  path: Path,
  knifeLine: Array<{ x: number; y: number }>,
  transform: { x: number; y: number },
): Path[] {
  const segs = path.segments
  if (segs.length < 2) return [path]

  // Find intersections between knife line segments and path segments
  const splitIndices: number[] = []

  for (let si = 1; si < segs.length; si++) {
    const seg = segs[si]!
    const prev = segs[si - 1]!
    if (seg.type === 'close' || prev.type === 'close') continue

    const ax = getSegX(prev) + transform.x
    const ay = getSegY(prev) + transform.y
    const bx = getSegX(seg) + transform.x
    const by = getSegY(seg) + transform.y

    for (let ki = 0; ki < knifeLine.length - 1; ki++) {
      const cx = knifeLine[ki]!.x
      const cy = knifeLine[ki]!.y
      const dx = knifeLine[ki + 1]!.x
      const dy = knifeLine[ki + 1]!.y

      if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) {
        splitIndices.push(si)
        break
      }
    }
  }

  if (splitIndices.length === 0) return [path]

  // Split the path at the found indices
  const paths: Path[] = []
  let startIdx = 0

  for (const splitIdx of splitIndices) {
    const subSegs: Segment[] = []
    for (let i = startIdx; i <= splitIdx; i++) {
      const seg = segs[i]!
      if (i === startIdx && seg.type !== 'move') {
        subSegs.push({ type: 'move', x: getSegX(seg), y: getSegY(seg) })
      } else {
        subSegs.push({ ...seg } as Segment)
      }
    }
    if (subSegs.length > 1) {
      paths.push({ id: uuid(), segments: subSegs, closed: false })
    }
    startIdx = splitIdx
  }

  // Remaining segments
  const remaining: Segment[] = []
  for (let i = startIdx; i < segs.length; i++) {
    const seg = segs[i]!
    if (i === startIdx && seg.type !== 'move') {
      remaining.push({ type: 'move', x: getSegX(seg), y: getSegY(seg) })
    } else {
      remaining.push({ ...seg } as Segment)
    }
  }
  if (remaining.length > 1) {
    paths.push({ id: uuid(), segments: remaining, closed: false })
  }

  return paths.length > 0 ? paths : [path]
}

function getSegX(seg: Segment): number {
  return 'x' in seg ? seg.x : 0
}

function getSegY(seg: Segment): number {
  return 'y' in seg ? seg.y : 0
}

/** Line segment intersection test */
function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = direction(cx, cy, dx, dy, ax, ay)
  const d2 = direction(cx, cy, dx, dy, bx, by)
  const d3 = direction(ax, ay, bx, by, cx, cy)
  const d4 = direction(ax, ay, bx, by, dx, dy)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

function direction(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

export function getKnifePoints(): Array<{ x: number; y: number }> {
  return state.points
}

export function isKnifeCutting(): boolean {
  return state.active
}
