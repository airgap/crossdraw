import { v4 as uuid } from 'uuid'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
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
  const artboard = getActiveArtboard()
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
    store.updateLayer(artboard.id, selectedId, {
      paths: [newPaths[0]!],
      shapeParams: undefined,
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

// ── Vector types ─────────────────────────────────────────────

interface Point {
  x: number
  y: number
}

// ── De Casteljau subdivision for cubic bezier ────────────────

/**
 * Split a cubic bezier at parameter t using de Casteljau's algorithm.
 * Returns [left, right] where each is [p0, cp1, cp2, p3].
 */
function splitCubicAt(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): [Point[], Point[]] {
  const lerp = (a: Point, b: Point, u: number): Point => ({
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  })

  const a = lerp(p0, cp1, t)
  const b = lerp(cp1, cp2, t)
  const c = lerp(cp2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const f = lerp(d, e, t) // the point on the curve at t

  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ]
}

// ── Line-line intersection ───────────────────────────────────

/**
 * Find the intersection parameter t of line segment (p1->p2) with (p3->p4).
 * Returns t (0-1) for the first segment, or null if no intersection.
 */
function lineLineIntersectionT(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  p4x: number,
  p4y: number,
): number | null {
  const denom = (p4y - p3y) * (p2x - p1x) - (p4x - p3x) * (p2y - p1y)
  if (Math.abs(denom) < 1e-10) return null

  const ua = ((p4x - p3x) * (p1y - p3y) - (p4y - p3y) * (p1x - p3x)) / denom
  const ub = ((p2x - p1x) * (p1y - p3y) - (p2y - p1y) * (p1x - p3x)) / denom

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return ua
  }
  return null
}

// ── Line-cubic intersection via recursive subdivision ────────

/**
 * Find intersection parameters of a cubic bezier with a line segment.
 * Uses recursive subdivision (binary approach) for robustness.
 */
function lineCubicIntersections(
  p0: Point,
  cp1: Point,
  cp2: Point,
  p3: Point,
  lineA: Point,
  lineB: Point,
  depth: number = 0,
  tStart: number = 0,
  tEnd: number = 1,
): number[] {
  // Bounding box check
  const minX = Math.min(p0.x, cp1.x, cp2.x, p3.x)
  const maxX = Math.max(p0.x, cp1.x, cp2.x, p3.x)
  const minY = Math.min(p0.y, cp1.y, cp2.y, p3.y)
  const maxY = Math.max(p0.y, cp1.y, cp2.y, p3.y)

  const lMinX = Math.min(lineA.x, lineB.x)
  const lMaxX = Math.max(lineA.x, lineB.x)
  const lMinY = Math.min(lineA.y, lineB.y)
  const lMaxY = Math.max(lineA.y, lineB.y)

  // Quick reject if bounding boxes don't overlap
  if (maxX < lMinX || minX > lMaxX || maxY < lMinY || minY > lMaxY) {
    return []
  }

  // If the curve is flat enough (or max depth reached), test as a line
  if (depth > 8 || (maxX - minX < 0.5 && maxY - minY < 0.5)) {
    const t = lineLineIntersectionT(p0.x, p0.y, p3.x, p3.y, lineA.x, lineA.y, lineB.x, lineB.y)
    if (t != null) {
      return [tStart + t * (tEnd - tStart)]
    }
    return []
  }

  // Subdivide at midpoint
  const tMid = (tStart + tEnd) / 2
  const [left, right] = splitCubicAt(p0, cp1, cp2, p3, 0.5)

  const leftHits = lineCubicIntersections(left[0]!, left[1]!, left[2]!, left[3]!, lineA, lineB, depth + 1, tStart, tMid)
  const rightHits = lineCubicIntersections(
    right[0]!,
    right[1]!,
    right[2]!,
    right[3]!,
    lineA,
    lineB,
    depth + 1,
    tMid,
    tEnd,
  )

  return [...leftHits, ...rightHits]
}

// ── Intersection info ────────────────────────────────────────

interface SplitInfo {
  segIndex: number
  t: number // parameter along the segment (0-1)
}

/**
 * Split a path where the knife line crosses it.
 * Handles line segments and cubic bezier curves using de Casteljau subdivision.
 */
function splitPathWithKnife(
  path: Path,
  knifeLine: Array<{ x: number; y: number }>,
  transform: { x: number; y: number },
): Path[] {
  const segs = path.segments
  if (segs.length < 2) return [path]

  // Collect all intersection points (segment index + t parameter)
  const splits: SplitInfo[] = []

  for (let si = 1; si < segs.length; si++) {
    const seg = segs[si]!
    const prev = segs[si - 1]!
    if (seg.type === 'close' || prev.type === 'close') continue

    const prevX = getSegX(prev) + transform.x
    const prevY = getSegY(prev) + transform.y

    for (let ki = 0; ki < knifeLine.length - 1; ki++) {
      const kA = knifeLine[ki]!
      const kB = knifeLine[ki + 1]!

      if (seg.type === 'cubic') {
        // Cubic bezier: use de Casteljau subdivision to find intersections
        const p0: Point = { x: prevX, y: prevY }
        const cp1: Point = { x: seg.cp1x + transform.x, y: seg.cp1y + transform.y }
        const cp2: Point = { x: seg.cp2x + transform.x, y: seg.cp2y + transform.y }
        const p3: Point = { x: seg.x + transform.x, y: seg.y + transform.y }

        const hits = lineCubicIntersections(p0, cp1, cp2, p3, kA, kB)
        for (const t of hits) {
          splits.push({ segIndex: si, t })
        }
      } else if (seg.type === 'quadratic') {
        // Convert quadratic to approximate line and test
        const segX = seg.x + transform.x
        const segY = seg.y + transform.y
        const t = lineLineIntersectionT(prevX, prevY, segX, segY, kA.x, kA.y, kB.x, kB.y)
        if (t != null) {
          splits.push({ segIndex: si, t })
        }
      } else {
        // Line or move: simple line-line intersection
        const segX = getSegX(seg) + transform.x
        const segY = getSegY(seg) + transform.y
        const t = lineLineIntersectionT(prevX, prevY, segX, segY, kA.x, kA.y, kB.x, kB.y)
        if (t != null) {
          splits.push({ segIndex: si, t })
        }
      }
    }
  }

  if (splits.length === 0) return [path]

  // Sort by segment index, then by t within segment
  splits.sort((a, b) => a.segIndex - b.segIndex || a.t - b.t)

  // Deduplicate splits that are very close together
  const dedupedSplits: SplitInfo[] = []
  for (const s of splits) {
    const last = dedupedSplits[dedupedSplits.length - 1]
    if (last && last.segIndex === s.segIndex && Math.abs(last.t - s.t) < 0.01) continue
    dedupedSplits.push(s)
  }

  if (dedupedSplits.length === 0) return [path]

  // Build the split paths
  return buildSplitPaths(path, dedupedSplits, transform)
}

/**
 * Build split paths from a source path and a list of split points.
 */
function buildSplitPaths(path: Path, splits: SplitInfo[], _transform: { x: number; y: number }): Path[] {
  const segs = path.segments
  const paths: Path[] = []
  let currentSegs: Segment[] = []

  let splitIdx = 0

  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]!

    // Check if there are splits at this segment index
    if (splitIdx < splits.length && splits[splitIdx]!.segIndex === si) {
      const prev = si > 0 ? segs[si - 1]! : null

      if (seg.type === 'cubic' && prev && prev.type !== 'close') {
        // Split cubic at t using de Casteljau
        const p0: Point = { x: getSegX(prev), y: getSegY(prev) }
        const cp1: Point = { x: seg.cp1x, y: seg.cp1y }
        const cp2: Point = { x: seg.cp2x, y: seg.cp2y }
        const p3: Point = { x: seg.x, y: seg.y }

        // Collect all splits for this segment
        const segSplits: number[] = []
        while (splitIdx < splits.length && splits[splitIdx]!.segIndex === si) {
          segSplits.push(splits[splitIdx]!.t)
          splitIdx++
        }

        // Split the cubic at each t (adjusting t values as we go)
        let remainP0 = p0
        let remainCp1 = cp1
        let remainCp2 = cp2
        let remainP3 = p3
        let consumed = 0

        for (const t of segSplits) {
          // Adjust t for the remaining portion
          const adjustedT = (t - consumed) / (1 - consumed)
          const [left, right] = splitCubicAt(
            remainP0,
            remainCp1,
            remainCp2,
            remainP3,
            Math.max(0.001, Math.min(0.999, adjustedT)),
          )

          // Add the left half to current path
          currentSegs.push({
            type: 'cubic',
            cp1x: left[1]!.x,
            cp1y: left[1]!.y,
            cp2x: left[2]!.x,
            cp2y: left[2]!.y,
            x: left[3]!.x,
            y: left[3]!.y,
          })

          // Finish current sub-path
          if (currentSegs.length > 0) {
            // Ensure it starts with a move
            if (currentSegs[0]!.type !== 'move') {
              currentSegs.unshift({ type: 'move', x: getSegX(currentSegs[0]!), y: getSegY(currentSegs[0]!) })
            }
            paths.push({ id: uuid(), segments: currentSegs, closed: false })
          }

          // Start new sub-path from split point
          currentSegs = [{ type: 'move', x: left[3]!.x, y: left[3]!.y }]

          // Update remaining curve
          remainP0 = right[0]!
          remainCp1 = right[1]!
          remainCp2 = right[2]!
          remainP3 = right[3]!
          consumed = t
        }

        // Add remaining portion of the cubic
        currentSegs.push({
          type: 'cubic',
          cp1x: remainCp1.x,
          cp1y: remainCp1.y,
          cp2x: remainCp2.x,
          cp2y: remainCp2.y,
          x: remainP3.x,
          y: remainP3.y,
        })
      } else {
        // Line segment split: compute the intersection point
        const prevX = prev ? getSegX(prev) : 0
        const prevY = prev ? getSegY(prev) : 0
        const segX = getSegX(seg)
        const segY = getSegY(seg)

        // Collect all splits for this segment
        const segSplits: number[] = []
        while (splitIdx < splits.length && splits[splitIdx]!.segIndex === si) {
          segSplits.push(splits[splitIdx]!.t)
          splitIdx++
        }

        let fromX = prevX
        let fromY = prevY

        for (const t of segSplits) {
          const midX = fromX + (segX - fromX) * t
          const midY = fromY + (segY - fromY) * t

          // Add line to split point
          currentSegs.push({ type: 'line', x: midX, y: midY })

          // Finish current sub-path
          if (currentSegs.length > 0) {
            if (currentSegs[0]!.type !== 'move') {
              currentSegs.unshift({ type: 'move', x: getSegX(currentSegs[0]!), y: getSegY(currentSegs[0]!) })
            }
            paths.push({ id: uuid(), segments: currentSegs, closed: false })
          }

          // Start new sub-path
          currentSegs = [{ type: 'move', x: midX, y: midY }]
          fromX = midX
          fromY = midY
        }

        // Add remaining line to the endpoint
        currentSegs.push({ ...seg } as Segment)
      }
    } else {
      // No split at this segment, just copy it
      currentSegs.push({ ...seg } as Segment)
    }
  }

  // Add the final sub-path
  if (currentSegs.length > 1) {
    if (currentSegs[0]!.type !== 'move') {
      currentSegs.unshift({ type: 'move', x: getSegX(currentSegs[0]!), y: getSegY(currentSegs[0]!) })
    }
    paths.push({ id: uuid(), segments: currentSegs, closed: false })
  }

  return paths.length > 0 ? paths : [path]
}

function getSegX(seg: Segment): number {
  return 'x' in seg ? seg.x : 0
}

function getSegY(seg: Segment): number {
  return 'y' in seg ? seg.y : 0
}

/** Line segment intersection test (boolean) */
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

// Re-export for tests
export { segmentsIntersect, splitCubicAt, lineCubicIntersections, lineLineIntersectionT }
