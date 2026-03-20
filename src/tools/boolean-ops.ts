import { v4 as uuid } from 'uuid'
import ClipperLib from 'clipper-lib'
import type { Segment, Path, VectorLayer } from '@/types'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'xor' | 'divide' | 'trim' | 'merge'

const SCALE = 1000 // Clipper uses integer math; scale up for precision

// ─── Public API ──────────────────────────────────────────────

/**
 * Perform a boolean operation on two selected vector layers.
 * Creates a new layer with the result and optionally deletes originals.
 */
export function performBooleanOp(op: BooleanOp, deleteOriginals = true) {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length < 2) return

  const layers = selectedIds
    .map((id) => artboard.layers.find((l) => l.id === id))
    .filter((l): l is VectorLayer => l?.type === 'vector')

  if (layers.length < 2) return

  const subjectPaths = layerToClipperPaths(layers[0]!)
  const clipPaths = layerToClipperPaths(layers[1]!)

  let resultPaths: ClipperLib.Paths

  if (op === 'divide') {
    // Divide = intersect + subtract (two results merged)
    const intersect = clipperExecute(subjectPaths, clipPaths, ClipperLib.ClipType.ctIntersection)
    const subtract = clipperExecute(subjectPaths, clipPaths, ClipperLib.ClipType.ctDifference)
    resultPaths = [...intersect, ...subtract]
  } else if (op === 'trim') {
    // Trim = XOR — remove the overlapping area from both shapes
    resultPaths = clipperExecute(subjectPaths, clipPaths, ClipperLib.ClipType.ctXor)
  } else if (op === 'merge') {
    // Merge = iterative union of all selected paths into a single unified shape
    let accumulated = subjectPaths
    for (let i = 1; i < layers.length; i++) {
      const nextPaths = layerToClipperPaths(layers[i]!)
      accumulated = clipperExecute(accumulated, nextPaths, ClipperLib.ClipType.ctUnion)
    }
    resultPaths = accumulated
  } else {
    const clipType = opToClipType(op)
    resultPaths = clipperExecute(subjectPaths, clipPaths, clipType)
  }

  if (resultPaths.length === 0) return

  // Convert back to our segment format
  const paths: Path[] = resultPaths.map((cp) => ({
    id: uuid(),
    segments: clipperPathToSegments(cp),
    closed: true,
  }))

  // Create result layer
  const resultLayer: VectorLayer = {
    id: uuid(),
    name: `${op} result`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { ...layers[0]!.transform },
    effects: [],
    paths,
    fill: layers[0]!.fill ? { ...layers[0]!.fill } : { type: 'solid', color: '#000000', opacity: 1 },
    stroke: layers[0]!.stroke ? { ...layers[0]!.stroke } : null,
  }

  store.addLayer(artboard.id, resultLayer)

  if (deleteOriginals) {
    for (const layer of layers) {
      store.deleteLayer(artboard.id, layer.id)
    }
  }

  store.selectLayer(resultLayer.id)
}

// ─── Clipper conversion ──────────────────────────────────────

function layerToClipperPaths(layer: VectorLayer): ClipperLib.Paths {
  const paths: ClipperLib.Paths = []
  const t = layer.transform

  for (const path of layer.paths) {
    const cp: ClipperLib.Path = []
    for (const seg of path.segments) {
      if (!('x' in seg)) continue
      {
        // Apply transform (translation + scale, no rotation for simplicity)
        const x = Math.round((seg.x * t.scaleX + t.x) * SCALE)
        const y = Math.round((seg.y * t.scaleY + t.y) * SCALE)
        cp.push({ X: x, Y: y })
      }
      // For curves, also sample intermediate points
      if (seg.type === 'cubic') {
        // Add control points as interpolated samples
        const steps = 8
        const prevSeg = findPreviousPoint(path.segments, path.segments.indexOf(seg))
        if (prevSeg) {
          for (let i = 1; i < steps; i++) {
            const t2 = i / steps
            const pt = cubicPoint(prevSeg.x, prevSeg.y, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y, t2)
            cp.push({
              X: Math.round((pt.x * t.scaleX + t.x) * SCALE),
              Y: Math.round((pt.y * t.scaleY + t.y) * SCALE),
            })
          }
        }
      }
    }
    if (cp.length >= 3) paths.push(cp)
  }

  return paths
}

function findPreviousPoint(segments: Segment[], index: number): { x: number; y: number } | null {
  for (let i = index - 1; i >= 0; i--) {
    const s = segments[i]!
    if ('x' in s) return { x: s.x, y: s.y }
  }
  return null
}

function cubicPoint(
  x0: number,
  y0: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x: number,
  y: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * mt * x0 + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * x,
    y: mt * mt * mt * y0 + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * y,
  }
}

function clipperPathToSegments(cp: ClipperLib.Path): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < cp.length; i++) {
    const pt = cp[i]!
    const x = pt.X / SCALE
    const y = pt.Y / SCALE
    segments.push(i === 0 ? { type: 'move', x, y } : { type: 'line', x, y })
  }
  segments.push({ type: 'close' })
  return segments
}

function opToClipType(op: BooleanOp): number {
  switch (op) {
    case 'union':
      return ClipperLib.ClipType.ctUnion
    case 'subtract':
      return ClipperLib.ClipType.ctDifference
    case 'intersect':
      return ClipperLib.ClipType.ctIntersection
    case 'xor':
      return ClipperLib.ClipType.ctXor
    default:
      return ClipperLib.ClipType.ctUnion
  }
}

function clipperExecute(subject: ClipperLib.Paths, clip: ClipperLib.Paths, clipType: number): ClipperLib.Paths {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true)

  const solution: ClipperLib.Paths = []
  clipper.Execute(clipType, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return solution
}

// ─── Path operations (LYK-63) ────────────────────────────────

/**
 * Offset a path by N pixels (positive = expand, negative = contract).
 */
export function offsetPath(artboardId: string, layerId: string, delta: number) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector') return

  const clipperPaths = layerToClipperPaths(layer)
  const co = new ClipperLib.ClipperOffset()
  co.AddPaths(clipperPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)

  const solution: ClipperLib.Paths = []
  co.Execute(solution, delta * SCALE)

  if (solution.length === 0) return

  const paths: Path[] = solution.map((cp) => ({
    id: uuid(),
    segments: clipperPathToSegments(cp),
    closed: true,
  }))

  const resultLayer: VectorLayer = {
    id: uuid(),
    name: `${layer.name} offset`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: layer.fill ? { ...layer.fill } : { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }

  store.addLayer(artboardId, resultLayer)
  store.selectLayer(resultLayer.id)
}

/**
 * Expand stroke: convert a stroked path to a filled outline.
 */
export function expandStroke(artboardId: string, layerId: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector' || !layer.stroke) return

  const clipperPaths = layerToClipperPaths(layer)
  const co = new ClipperLib.ClipperOffset()
  co.AddPaths(clipperPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)

  const solution: ClipperLib.Paths = []
  co.Execute(solution, (layer.stroke.width / 2) * SCALE)

  if (solution.length === 0) return

  const paths: Path[] = solution.map((cp) => ({
    id: uuid(),
    segments: clipperPathToSegments(cp),
    closed: true,
  }))

  const resultLayer: VectorLayer = {
    id: uuid(),
    name: `${layer.name} expanded`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: { type: 'solid', color: layer.stroke.color, opacity: layer.stroke.opacity },
    stroke: null,
  }

  store.addLayer(artboardId, resultLayer)
  store.selectLayer(resultLayer.id)
}

/**
 * Simplify a path using Ramer-Douglas-Peucker algorithm.
 */
export function simplifyPath(artboardId: string, layerId: string, tolerance = 2) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector') return

  const newPaths: Path[] = layer.paths.map((path) => {
    // Extract points
    const points: { x: number; y: number }[] = []
    for (const seg of path.segments) {
      if ('x' in seg) {
        points.push({ x: seg.x, y: seg.y })
      }
    }

    const simplified = rdpSimplify(points, tolerance)
    const segments: Segment[] = simplified.map((p, i) =>
      i === 0 ? { type: 'move' as const, x: p.x, y: p.y } : { type: 'line' as const, x: p.x, y: p.y },
    )
    if (path.closed) segments.push({ type: 'close' })

    return { id: path.id, segments, closed: path.closed }
  })

  store.updateLayer(artboardId, layerId, { paths: newPaths } as Partial<VectorLayer>)
}

/**
 * Ramer-Douglas-Peucker line simplification.
 */
export function rdpSimplify(points: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]!
  const last = points[points.length - 1]!

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i]!, first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDist(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y)
  const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x)
  return num / Math.sqrt(lenSq)
}

// ─── Contour / Offset Path tool (Task #15) ────────────────────

export type ContourJoinType = 'miter' | 'round' | 'square'

export interface ContourParams {
  /** Offset distance per step (positive = outward, negative = inward) */
  offset: number
  /** Number of contour copies (1-20) */
  steps: number
  /** Join type for corners */
  joinType: ContourJoinType
  /** Miter limit for miter joins */
  miterLimit: number
  /** Whether to interpolate fill color from inner to outer */
  colorInterpolation: boolean
}

export const defaultContourParams: ContourParams = {
  offset: 5,
  steps: 5,
  joinType: 'round',
  miterLimit: 2,
  colorInterpolation: false,
}

function joinTypeToClipper(jt: ContourJoinType): number {
  switch (jt) {
    case 'miter':
      return ClipperLib.JoinType.jtMiter
    case 'round':
      return ClipperLib.JoinType.jtRound
    case 'square':
      return ClipperLib.JoinType.jtSquare
  }
}

/**
 * Interpolate between two hex colours. t in [0, 1].
 */
function lerpColor(c1: string, c2: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as [
      number,
      number,
      number,
    ]
  }
  const [r1, g1, b1] = parse(c1)
  const [r2, g2, b2] = parse(c2)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(lerp(r1, r2))}${toHex(lerp(g1, g2))}${toHex(lerp(b1, b2))}`
}

/**
 * Create N contour/offset copies of a path at incrementally increasing distances.
 * Each copy is a new VectorLayer placed below the original.
 */
export function contourPath(artboardId: string, layerId: string, params: ContourParams) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector') return

  const clipperJoin = joinTypeToClipper(params.joinType)
  const steps = Math.max(1, Math.min(20, Math.round(params.steps)))

  const clipperPaths = layerToClipperPaths(layer)
  const baseFillColor = layer.fill?.color ?? '#000000'
  // For interpolation, fade toward a lighter/darker version
  const targetColor = params.offset > 0 ? '#ffffff' : '#000000'

  const createdIds: string[] = []

  for (let i = 1; i <= steps; i++) {
    const delta = params.offset * i

    const co = new ClipperLib.ClipperOffset()
    co.MiterLimit = params.miterLimit
    co.AddPaths(clipperPaths, clipperJoin, ClipperLib.EndType.etClosedPolygon)

    const solution: ClipperLib.Paths = []
    co.Execute(solution, delta * SCALE)

    if (solution.length === 0) continue

    const paths: Path[] = solution.map((cp) => ({
      id: uuid(),
      segments: clipperPathToSegments(cp),
      closed: true,
    }))

    const t = i / steps
    const fillColor = params.colorInterpolation ? lerpColor(baseFillColor, targetColor, t * 0.5) : baseFillColor

    const resultLayer: VectorLayer = {
      id: uuid(),
      name: `${layer.name} contour ${i}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths,
      fill: { type: 'solid', color: fillColor, opacity: layer.fill?.opacity ?? 1 },
      stroke: null,
    }

    store.addLayer(artboardId, resultLayer)
    createdIds.push(resultLayer.id)
  }

  // Select all created contour layers
  if (createdIds.length > 0) {
    store.selectLayer(createdIds[0]!)
  }
}
