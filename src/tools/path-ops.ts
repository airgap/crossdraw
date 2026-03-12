import { v4 as uuid } from 'uuid'
import type { Segment, Path, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ─── Helpers ─────────────────────────────────────────────────

/** Get the endpoint (x, y) of a segment that has coordinates. */
function segPoint(seg: Segment): { x: number; y: number } | null {
  if ('x' in seg) return { x: seg.x, y: seg.y }
  return null
}

/** Find the previous segment with coordinates, walking backwards. */
function prevPoint(segments: Segment[], index: number): { x: number; y: number } | null {
  for (let i = index - 1; i >= 0; i--) {
    const p = segPoint(segments[i]!)
    if (p) return p
  }
  return null
}

/** Euclidean distance between two points. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** De Casteljau evaluation for a cubic bezier at parameter t. */
function cubicEval(
  p0x: number,
  p0y: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  p1x: number,
  p1y: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * mt * p0x + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * p1x,
    y: mt * mt * mt * p0y + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * p1y,
  }
}

/** De Casteljau evaluation for a quadratic bezier at parameter t. */
function quadEval(
  p0x: number,
  p0y: number,
  cpx: number,
  cpy: number,
  p1x: number,
  p1y: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * p0x + 2 * mt * t * cpx + t * t * p1x,
    y: mt * mt * p0y + 2 * mt * t * cpy + t * t * p1y,
  }
}

/**
 * De Casteljau split for cubic bezier at parameter t.
 * Returns control points for the two resulting cubic segments.
 */
function cubicSplitAt(
  p0x: number,
  p0y: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  p1x: number,
  p1y: number,
  t: number,
): {
  left: { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  right: { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
} {
  // First level
  const a1x = p0x + (cp1x - p0x) * t
  const a1y = p0y + (cp1y - p0y) * t
  const a2x = cp1x + (cp2x - cp1x) * t
  const a2y = cp1y + (cp2y - cp1y) * t
  const a3x = cp2x + (p1x - cp2x) * t
  const a3y = cp2y + (p1y - cp2y) * t

  // Second level
  const b1x = a1x + (a2x - a1x) * t
  const b1y = a1y + (a2y - a1y) * t
  const b2x = a2x + (a3x - a2x) * t
  const b2y = a2y + (a3y - a2y) * t

  // Third level (split point)
  const mx = b1x + (b2x - b1x) * t
  const my = b1y + (b2y - b1y) * t

  return {
    left: { cp1x: a1x, cp1y: a1y, cp2x: b1x, cp2y: b1y, x: mx, y: my },
    right: { cp1x: b2x, cp1y: b2y, cp2x: a3x, cp2y: a3y, x: p1x, y: p1y },
  }
}

/**
 * De Casteljau split for quadratic bezier at parameter t.
 * Returns control points for the two resulting quadratic segments.
 */
function quadSplitAt(
  p0x: number,
  p0y: number,
  cpx: number,
  cpy: number,
  p1x: number,
  p1y: number,
  t: number,
): {
  left: { cpx: number; cpy: number; x: number; y: number }
  right: { cpx: number; cpy: number; x: number; y: number }
} {
  const a1x = p0x + (cpx - p0x) * t
  const a1y = p0y + (cpy - p0y) * t
  const a2x = cpx + (p1x - cpx) * t
  const a2y = cpy + (p1y - cpy) * t

  const mx = a1x + (a2x - a1x) * t
  const my = a1y + (a2y - a1y) * t

  return {
    left: { cpx: a1x, cpy: a1y, x: mx, y: my },
    right: { cpx: a2x, cpy: a2y, x: p1x, y: p1y },
  }
}

// ─── 1. Flatten Curves ───────────────────────────────────────

/**
 * Adaptively flatten a cubic bezier into line segments.
 * Uses de Casteljau subdivision until the curve is within
 * `tolerance` of the straight line between endpoints.
 */
function flattenCubic(
  p0x: number,
  p0y: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  p1x: number,
  p1y: number,
  tolerance: number,
  out: { x: number; y: number }[],
): void {
  // Check if control points are close enough to the chord
  const dx = p1x - p0x
  const dy = p1y - p0y
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-12) {
    // Degenerate: start and end coincide
    out.push({ x: p1x, y: p1y })
    return
  }

  const invLen = 1 / Math.sqrt(lenSq)
  const nx = -dy * invLen
  const ny = dx * invLen

  const d1 = Math.abs((cp1x - p0x) * nx + (cp1y - p0y) * ny)
  const d2 = Math.abs((cp2x - p0x) * nx + (cp2y - p0y) * ny)

  if (d1 + d2 <= tolerance) {
    out.push({ x: p1x, y: p1y })
    return
  }

  // Subdivide at midpoint
  const { left, right } = cubicSplitAt(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p1x, p1y, 0.5)
  flattenCubic(p0x, p0y, left.cp1x, left.cp1y, left.cp2x, left.cp2y, left.x, left.y, tolerance, out)
  flattenCubic(left.x, left.y, right.cp1x, right.cp1y, right.cp2x, right.cp2y, right.x, right.y, tolerance, out)
}

/**
 * Adaptively flatten a quadratic bezier into line segments.
 */
function flattenQuadratic(
  p0x: number,
  p0y: number,
  cpx: number,
  cpy: number,
  p1x: number,
  p1y: number,
  tolerance: number,
  out: { x: number; y: number }[],
): void {
  const dx = p1x - p0x
  const dy = p1y - p0y
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-12) {
    out.push({ x: p1x, y: p1y })
    return
  }

  const invLen = 1 / Math.sqrt(lenSq)
  const nx = -dy * invLen
  const ny = dx * invLen

  const d = Math.abs((cpx - p0x) * nx + (cpy - p0y) * ny)

  if (d <= tolerance) {
    out.push({ x: p1x, y: p1y })
    return
  }

  const { left, right } = quadSplitAt(p0x, p0y, cpx, cpy, p1x, p1y, 0.5)
  flattenQuadratic(p0x, p0y, left.cpx, left.cpy, left.x, left.y, tolerance, out)
  flattenQuadratic(left.x, left.y, right.cpx, right.cpy, right.x, right.y, tolerance, out)
}

/**
 * Convert all cubic/quadratic bezier segments to line segments via
 * adaptive subdivision using de Casteljau algorithm.
 */
export function flattenCurves(artboardId: string, layerId: string, tolerance = 1) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector') return

  const newPaths: Path[] = layer.paths.map((path) => {
    const newSegs: Segment[] = []
    let curX = 0
    let curY = 0

    for (const seg of path.segments) {
      switch (seg.type) {
        case 'move':
          newSegs.push(seg)
          curX = seg.x
          curY = seg.y
          break

        case 'line':
          newSegs.push(seg)
          curX = seg.x
          curY = seg.y
          break

        case 'cubic': {
          const pts: { x: number; y: number }[] = []
          flattenCubic(curX, curY, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y, tolerance, pts)
          for (const pt of pts) {
            newSegs.push({ type: 'line', x: pt.x, y: pt.y })
          }
          curX = seg.x
          curY = seg.y
          break
        }

        case 'quadratic': {
          const pts: { x: number; y: number }[] = []
          flattenQuadratic(curX, curY, seg.cpx, seg.cpy, seg.x, seg.y, tolerance, pts)
          for (const pt of pts) {
            newSegs.push({ type: 'line', x: pt.x, y: pt.y })
          }
          curX = seg.x
          curY = seg.y
          break
        }

        case 'arc': {
          // Approximate arc with line segments by sampling
          // Convert arc to a series of points
          const steps = 16
          for (let i = 1; i <= steps; i++) {
            const t = i / steps
            // Linear interpolation as simple arc approximation
            const ax = curX + (seg.x - curX) * t
            const ay = curY + (seg.y - curY) * t
            newSegs.push({ type: 'line', x: ax, y: ay })
          }
          curX = seg.x
          curY = seg.y
          break
        }

        case 'close':
          newSegs.push(seg)
          break
      }
    }

    return { id: path.id, segments: newSegs, closed: path.closed, fillRule: path.fillRule }
  })

  store.updateLayer(artboardId, layerId, { paths: newPaths } as Partial<VectorLayer>)
}

// ─── 2. Join Paths ───────────────────────────────────────────

/**
 * Join two or more selected open vector paths. Finds nearest
 * endpoints between paths, connects with line segments, and
 * merges into a single layer with a single path.
 */
export function joinPaths(artboardId: string, layerIds: string[]) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  if (layerIds.length < 2) return

  const layers = layerIds
    .map((id) => artboard.layers.find((l) => l.id === id))
    .filter((l): l is VectorLayer => l?.type === 'vector')

  if (layers.length < 2) return

  // Collect all open paths with their segments (skip closed paths)
  interface OpenPath {
    segments: Segment[]
    layerIndex: number
  }

  const openPaths: OpenPath[] = []
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    for (const path of layer.paths) {
      if (!path.closed) {
        openPaths.push({ segments: [...path.segments], layerIndex: li })
      }
    }
  }

  if (openPaths.length < 2) return

  // Greedy nearest-endpoint chaining
  let merged: Segment[] = openPaths[0]!.segments.filter((s) => s.type !== 'close')
  const used = new Set<number>([0])

  while (used.size < openPaths.length) {
    const mergedEnd = getLastPoint(merged)
    const mergedStart = getFirstPoint(merged)
    if (!mergedEnd || !mergedStart) break

    let bestIdx = -1
    let bestDist = Infinity
    let bestReverse = false
    let bestPrepend = false

    for (let i = 0; i < openPaths.length; i++) {
      if (used.has(i)) continue
      const segs = openPaths[i]!.segments
      const ep = getEndpoints(segs)
      if (!ep) continue

      // Try connecting merged-end to candidate-start
      const d1 = dist(mergedEnd, ep.start)
      if (d1 < bestDist) {
        bestDist = d1
        bestIdx = i
        bestReverse = false
        bestPrepend = false
      }

      // Try connecting merged-end to candidate-end (reverse candidate)
      const d2 = dist(mergedEnd, ep.end)
      if (d2 < bestDist) {
        bestDist = d2
        bestIdx = i
        bestReverse = true
        bestPrepend = false
      }

      // Try connecting candidate-end to merged-start (prepend)
      const d3 = dist(ep.end, mergedStart)
      if (d3 < bestDist) {
        bestDist = d3
        bestIdx = i
        bestReverse = false
        bestPrepend = true
      }

      // Try connecting candidate-start to merged-start (reverse + prepend)
      const d4 = dist(ep.start, mergedStart)
      if (d4 < bestDist) {
        bestDist = d4
        bestIdx = i
        bestReverse = true
        bestPrepend = true
      }
    }

    if (bestIdx === -1) break
    used.add(bestIdx)

    let candidateSegs: Segment[] = openPaths[bestIdx]!.segments.filter((s) => s.type !== 'close')
    if (bestReverse) {
      candidateSegs = reverseSegments(candidateSegs)
    }

    // Strip the leading 'move' from the candidate and turn it into a line
    const stripped = candidateSegs.slice(1)

    if (bestPrepend) {
      // Prepend: candidate connects to start of merged
      // Remove move from merged, add line to connect
      const candidateEnd = getLastPoint(candidateSegs)
      if (candidateEnd) {
        const mergedBody = merged.slice(1) // drop old move
        merged = [...candidateSegs, ...mergedBody]
      }
    } else {
      // Append: add line to connect, then candidate body
      merged = [...merged, ...stripped]
    }
  }

  // Build result path
  const resultPath: Path = {
    id: uuid(),
    segments: merged,
    closed: false,
  }

  // Create new layer based on the first selected layer
  const base = layers[0]!
  const resultLayer: VectorLayer = {
    id: uuid(),
    name: `${base.name} joined`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [resultPath],
    fill: base.fill ? { ...base.fill } : null,
    stroke: base.stroke ? { ...base.stroke } : null,
  }

  store.addLayer(artboardId, resultLayer)
  for (const layer of layers) {
    store.deleteLayer(artboardId, layer.id)
  }
  store.selectLayer(resultLayer.id)
}

function getFirstPoint(segments: Segment[]): { x: number; y: number } | null {
  for (const seg of segments) {
    const p = segPoint(seg)
    if (p) return p
  }
  return null
}

function getLastPoint(segments: Segment[]): { x: number; y: number } | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const p = segPoint(segments[i]!)
    if (p) return p
  }
  return null
}

function getEndpoints(segments: Segment[]): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const start = getFirstPoint(segments)
  const end = getLastPoint(segments)
  if (!start || !end) return null
  return { start, end }
}

/**
 * Reverse the order of path segments so the path is traversed backwards.
 */
function reverseSegments(segments: Segment[]): Segment[] {
  // Collect points with their segment types
  const points: { x: number; y: number; seg: Segment }[] = []
  for (const seg of segments) {
    if ('x' in seg) {
      points.push({ x: seg.x, y: seg.y, seg })
    }
  }

  if (points.length === 0) return segments

  // Reverse: first point becomes a move, rest become lines (curves are flattened in reverse)
  const reversed: Segment[] = []
  for (let i = points.length - 1; i >= 0; i--) {
    if (i === points.length - 1) {
      reversed.push({ type: 'move', x: points[i]!.x, y: points[i]!.y })
    } else {
      reversed.push({ type: 'line', x: points[i]!.x, y: points[i]!.y })
    }
  }

  return reversed
}

// ─── 3. Break at Intersections ───────────────────────────────

/**
 * Find line-line intersection point. Returns parameter t for each
 * line segment, or null if they don't intersect.
 */
function lineLineIntersection(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { t1: number; t2: number; x: number; y: number } | null {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(denom) < 1e-10) return null // Parallel

  const t1 = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
  const t2 = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom

  if (t1 < 1e-8 || t1 > 1 - 1e-8 || t2 < 1e-8 || t2 > 1 - 1e-8) return null

  return {
    t1,
    t2,
    x: ax + t1 * (bx - ax),
    y: ay + t1 * (by - ay),
  }
}

/**
 * Find intersections between a line segment and a cubic bezier curve.
 * Uses recursive subdivision approach.
 */
export function lineCubicIntersections(
  lx1: number,
  ly1: number,
  lx2: number,
  ly2: number,
  p0x: number,
  p0y: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  p1x: number,
  p1y: number,
  depth = 0,
): { t: number; x: number; y: number }[] {
  if (depth > 16) return []

  // Bounding box check
  const cMinX = Math.min(p0x, cp1x, cp2x, p1x)
  const cMaxX = Math.max(p0x, cp1x, cp2x, p1x)
  const cMinY = Math.min(p0y, cp1y, cp2y, p1y)
  const cMaxY = Math.max(p0y, cp1y, cp2y, p1y)

  const lMinX = Math.min(lx1, lx2)
  const lMaxX = Math.max(lx1, lx2)
  const lMinY = Math.min(ly1, ly2)
  const lMaxY = Math.max(ly1, ly2)

  if (cMaxX < lMinX || cMinX > lMaxX || cMaxY < lMinY || cMinY > lMaxY) return []

  // If curve is nearly flat, treat as line-line
  const flatness =
    Math.abs(cp1x - (p0x + p1x) / 2) +
    Math.abs(cp1y - (p0y + p1y) / 2) +
    Math.abs(cp2x - (p0x + p1x) / 2) +
    Math.abs(cp2y - (p0y + p1y) / 2)

  if (flatness < 0.5) {
    const hit = lineLineIntersection(lx1, ly1, lx2, ly2, p0x, p0y, p1x, p1y)
    if (hit) return [{ t: hit.t2, x: hit.x, y: hit.y }]
    return []
  }

  // Subdivide
  const { left, right } = cubicSplitAt(p0x, p0y, cp1x, cp1y, cp2x, cp2y, p1x, p1y, 0.5)

  const leftHits = lineCubicIntersections(
    lx1,
    ly1,
    lx2,
    ly2,
    p0x,
    p0y,
    left.cp1x,
    left.cp1y,
    left.cp2x,
    left.cp2y,
    left.x,
    left.y,
    depth + 1,
  )

  const rightHits = lineCubicIntersections(
    lx1,
    ly1,
    lx2,
    ly2,
    left.x,
    left.y,
    right.cp1x,
    right.cp1y,
    right.cp2x,
    right.cp2y,
    right.x,
    right.y,
    depth + 1,
  )

  return [...leftHits, ...rightHits]
}

/** Collect all line segments from a path (flattening curves to lines for intersection). */
function pathToLineSegments(
  layer: VectorLayer,
  pathIdx: number,
): { x1: number; y1: number; x2: number; y2: number; segIdx: number }[] {
  const path = layer.paths[pathIdx]
  if (!path) return []
  const t = layer.transform
  const result: { x1: number; y1: number; x2: number; y2: number; segIdx: number }[] = []

  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0

  for (let si = 0; si < path.segments.length; si++) {
    const seg = path.segments[si]!
    switch (seg.type) {
      case 'move':
        curX = seg.x * t.scaleX + t.x
        curY = seg.y * t.scaleY + t.y
        startX = curX
        startY = curY
        break
      case 'line': {
        const nx = seg.x * t.scaleX + t.x
        const ny = seg.y * t.scaleY + t.y
        result.push({ x1: curX, y1: curY, x2: nx, y2: ny, segIdx: si })
        curX = nx
        curY = ny
        break
      }
      case 'cubic': {
        // Approximate cubic as line segments for intersection
        const steps = 8
        let px = curX
        let py = curY
        for (let i = 1; i <= steps; i++) {
          const tt = i / steps
          const pt = cubicEval(
            curX,
            curY,
            seg.cp1x * t.scaleX + t.x,
            seg.cp1y * t.scaleY + t.y,
            seg.cp2x * t.scaleX + t.x,
            seg.cp2y * t.scaleY + t.y,
            seg.x * t.scaleX + t.x,
            seg.y * t.scaleY + t.y,
            tt,
          )
          result.push({ x1: px, y1: py, x2: pt.x, y2: pt.y, segIdx: si })
          px = pt.x
          py = pt.y
        }
        curX = seg.x * t.scaleX + t.x
        curY = seg.y * t.scaleY + t.y
        break
      }
      case 'quadratic': {
        const steps = 8
        let px = curX
        let py = curY
        for (let i = 1; i <= steps; i++) {
          const tt = i / steps
          const pt = quadEval(
            curX,
            curY,
            seg.cpx * t.scaleX + t.x,
            seg.cpy * t.scaleY + t.y,
            seg.x * t.scaleX + t.x,
            seg.y * t.scaleY + t.y,
            tt,
          )
          result.push({ x1: px, y1: py, x2: pt.x, y2: pt.y, segIdx: si })
          px = pt.x
          py = pt.y
        }
        curX = seg.x * t.scaleX + t.x
        curY = seg.y * t.scaleY + t.y
        break
      }
      case 'close':
        if (curX !== startX || curY !== startY) {
          result.push({ x1: curX, y1: curY, x2: startX, y2: startY, segIdx: si })
        }
        curX = startX
        curY = startY
        break
    }
  }

  return result
}

/**
 * Find where paths cross each other, insert nodes at intersections,
 * and split into separate subpaths.
 */
export function breakAtIntersections(artboardId: string, layerIds: string[]) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  if (layerIds.length < 2) return

  const layers = layerIds
    .map((id) => artboard.layers.find((l) => l.id === id))
    .filter((l): l is VectorLayer => l?.type === 'vector')

  if (layers.length < 2) return

  // Collect all line segments from all paths
  interface SegRef {
    layerIdx: number
    pathIdx: number
    segIdx: number
    x1: number
    y1: number
    x2: number
    y2: number
  }

  const allSegs: SegRef[] = []
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    for (let pi = 0; pi < layer.paths.length; pi++) {
      const lineSegs = pathToLineSegments(layer, pi)
      for (const ls of lineSegs) {
        allSegs.push({ layerIdx: li, pathIdx: pi, ...ls })
      }
    }
  }

  // Find intersections between segments from different layers
  const intersections: { x: number; y: number }[] = []
  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      const a = allSegs[i]!
      const b = allSegs[j]!
      // Only check segments from different layers
      if (a.layerIdx === b.layerIdx) continue

      const hit = lineLineIntersection(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)
      if (hit) {
        // Check for duplicate intersection points
        const isDup = intersections.some((p) => dist(p, { x: hit.x, y: hit.y }) < 0.5)
        if (!isDup) {
          intersections.push({ x: hit.x, y: hit.y })
        }
      }
    }
  }

  if (intersections.length === 0) return

  // For each layer, insert intersection points into its paths, then split
  const newLayers: VectorLayer[] = []

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    const t = layer.transform

    for (const path of layer.paths) {
      // Build flattened point list for this path
      const points: { x: number; y: number }[] = []
      for (const seg of path.segments) {
        if ('x' in seg) {
          points.push({ x: seg.x * t.scaleX + t.x, y: seg.y * t.scaleY + t.y })
        }
      }

      // Find which intersections fall near this path's segments
      const pathIntersections: { x: number; y: number; afterPointIdx: number }[] = []

      for (const ip of intersections) {
        // Find the nearest segment of this path
        let bestDist = Infinity
        let bestAfter = 0

        for (let pi = 0; pi < points.length - 1; pi++) {
          const p1 = points[pi]!
          const p2 = points[pi + 1]!
          // Distance from intersection point to this line segment
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const lenSq = dx * dx + dy * dy
          if (lenSq < 1e-10) continue

          const tParam = Math.max(0, Math.min(1, ((ip.x - p1.x) * dx + (ip.y - p1.y) * dy) / lenSq))
          const projX = p1.x + tParam * dx
          const projY = p1.y + tParam * dy
          const d = dist(ip, { x: projX, y: projY })

          if (d < bestDist) {
            bestDist = d
            bestAfter = pi
          }
        }

        if (bestDist < 5) {
          // Close enough to this path
          pathIntersections.push({ x: ip.x, y: ip.y, afterPointIdx: bestAfter })
        }
      }

      if (pathIntersections.length === 0) {
        // No intersections on this path, keep as-is in a new layer
        const newLayer: VectorLayer = {
          id: uuid(),
          name: `${layer.name} part`,
          type: 'vector',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { ...layer.transform },
          effects: [],
          paths: [{ id: uuid(), segments: [...path.segments], closed: path.closed }],
          fill: layer.fill ? { ...layer.fill } : null,
          stroke: layer.stroke ? { ...layer.stroke } : null,
        }
        newLayers.push(newLayer)
        continue
      }

      // Sort intersections by position along the path
      pathIntersections.sort((a, b) => a.afterPointIdx - b.afterPointIdx)

      // Build new segments with intersection nodes inserted
      // Convert everything to world coords, insert points, then back to local
      const invScaleX = t.scaleX !== 0 ? 1 / t.scaleX : 1
      const invScaleY = t.scaleY !== 0 ? 1 / t.scaleY : 1

      const allPoints: { x: number; y: number }[] = []
      let ptIdx = 0
      let ipIdx = 0

      for (ptIdx = 0; ptIdx < points.length; ptIdx++) {
        allPoints.push(points[ptIdx]!)

        while (ipIdx < pathIntersections.length && pathIntersections[ipIdx]!.afterPointIdx === ptIdx) {
          allPoints.push({ x: pathIntersections[ipIdx]!.x, y: pathIntersections[ipIdx]!.y })
          ipIdx++
        }
      }

      // Split at intersection points into subpaths
      const splitIndices = new Set<number>()
      for (let i = 0; i < allPoints.length; i++) {
        for (const ip of pathIntersections) {
          if (dist(allPoints[i]!, ip) < 0.5) {
            splitIndices.add(i)
          }
        }
      }

      // Build subpaths
      const subpathPoints: { x: number; y: number }[][] = []
      let current: { x: number; y: number }[] = []

      for (let i = 0; i < allPoints.length; i++) {
        current.push(allPoints[i]!)
        if (splitIndices.has(i) && current.length > 1) {
          subpathPoints.push(current)
          current = [allPoints[i]!] // Start new subpath from intersection point
        }
      }
      if (current.length > 1) {
        subpathPoints.push(current)
      }

      // Create a new layer for each subpath
      for (const pts of subpathPoints) {
        const segs: Segment[] = pts.map((p, i) => {
          const lx = (p.x - t.x) * invScaleX
          const ly = (p.y - t.y) * invScaleY
          return i === 0 ? ({ type: 'move', x: lx, y: ly } as Segment) : ({ type: 'line', x: lx, y: ly } as Segment)
        })

        const subLayer: VectorLayer = {
          id: uuid(),
          name: `${layer.name} part`,
          type: 'vector',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { ...layer.transform },
          effects: [],
          paths: [{ id: uuid(), segments: segs, closed: false }],
          fill: layer.fill ? { ...layer.fill } : null,
          stroke: layer.stroke ? { ...layer.stroke } : null,
        }
        newLayers.push(subLayer)
      }
    }
  }

  // Add new layers and remove originals
  for (const nl of newLayers) {
    store.addLayer(artboardId, nl)
  }
  for (const layer of layers) {
    store.deleteLayer(artboardId, layer.id)
  }
  if (newLayers.length > 0) {
    store.selectLayer(newLayers[0]!.id)
  }
}

// ─── 4. Subdivide Segment ────────────────────────────────────

/**
 * Split a segment at its midpoint using de Casteljau.
 * - Cubic: produces two cubics
 * - Quadratic: produces two quadratics
 * - Line: produces two lines
 */
export function subdivideSegment(artboardId: string, layerId: string, pathId: string, segIndex: number) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'vector') return

  const pathIdx = layer.paths.findIndex((p) => p.id === pathId)
  if (pathIdx === -1) return

  const path = layer.paths[pathIdx]!
  if (segIndex < 0 || segIndex >= path.segments.length) return

  const seg = path.segments[segIndex]!
  const prev = prevPoint(path.segments, segIndex)

  const newSegs = [...path.segments]

  switch (seg.type) {
    case 'line': {
      if (!prev) return
      const mx = (prev.x + seg.x) / 2
      const my = (prev.y + seg.y) / 2
      // Replace the line with two lines via midpoint
      newSegs.splice(segIndex, 1, { type: 'line', x: mx, y: my }, { type: 'line', x: seg.x, y: seg.y })
      break
    }

    case 'cubic': {
      if (!prev) return
      const { left, right } = cubicSplitAt(prev.x, prev.y, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y, 0.5)
      newSegs.splice(
        segIndex,
        1,
        {
          type: 'cubic',
          cp1x: left.cp1x,
          cp1y: left.cp1y,
          cp2x: left.cp2x,
          cp2y: left.cp2y,
          x: left.x,
          y: left.y,
        },
        {
          type: 'cubic',
          cp1x: right.cp1x,
          cp1y: right.cp1y,
          cp2x: right.cp2x,
          cp2y: right.cp2y,
          x: right.x,
          y: right.y,
        },
      )
      break
    }

    case 'quadratic': {
      if (!prev) return
      const { left, right } = quadSplitAt(prev.x, prev.y, seg.cpx, seg.cpy, seg.x, seg.y, 0.5)
      newSegs.splice(
        segIndex,
        1,
        { type: 'quadratic', cpx: left.cpx, cpy: left.cpy, x: left.x, y: left.y },
        { type: 'quadratic', cpx: right.cpx, cpy: right.cpy, x: right.x, y: right.y },
      )
      break
    }

    default:
      // move, arc, close — nothing to subdivide
      return
  }

  const newPaths = [...layer.paths]
  newPaths[pathIdx] = { ...path, segments: newSegs }
  store.updateLayer(artboardId, layerId, { paths: newPaths } as Partial<VectorLayer>)
}
