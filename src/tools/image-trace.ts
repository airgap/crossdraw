/**
 * Image tracing — converts raster images to vector paths via marching squares
 * contour extraction, Ramer-Douglas-Peucker simplification, and optional
 * cubic bezier smoothing.
 */

import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer, RasterLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { getRasterData } from '@/store/raster-data'

// ── Public API ──────────────────────────────────────────────────────────────

export interface TraceOptions {
  /** 0-255 luminance threshold for binarization */
  threshold: number
  /** Minimum segment count to keep (filters noise contours) */
  minPathLength: number
  /** Ramer-Douglas-Peucker simplification epsilon (pixels) */
  simplifyTolerance: number
  /** Whether to convert simplified polylines to smooth cubic beziers */
  smoothing: boolean
}

export const defaultTraceOptions: TraceOptions = {
  threshold: 128,
  minPathLength: 8,
  simplifyTolerance: 1.5,
  smoothing: true,
}

/**
 * Trace contours in a raster image and return arrays of Segment[],
 * one per closed contour detected.
 */
export function traceImage(imageData: ImageData, options: TraceOptions): Segment[][] {
  const { width, height } = imageData

  // Step 1: Convert to grayscale luminance and binarize
  const binary = binarize(imageData, options.threshold)

  // Step 2: Marching squares contour extraction
  const rawContours = marchingSquares(binary, width, height)

  // Step 3: Filter tiny contours (noise)
  const filtered = rawContours.filter((c) => c.length >= options.minPathLength)

  // Step 4: Simplify each contour with RDP
  const simplified = filtered.map((contour) => simplifyRDP(contour, options.simplifyTolerance))

  // Step 5: Convert point arrays to Segment arrays
  const segmentArrays = simplified.map((contour) => {
    if (options.smoothing && contour.length >= 4) {
      return pointsToCubicSegments(contour)
    }
    return pointsToLineSegments(contour)
  })

  return segmentArrays
}

/**
 * Trace the currently selected raster layer and insert a new vector layer
 * with the traced paths.
 */
export function traceSelectedRasterLayer(options?: Partial<TraceOptions>) {
  const store = useEditorStore.getState()
  const { selection, document: doc } = store

  if (selection.layerIds.length === 0) return

  const layerId = selection.layerIds[0]!

  // Find the raster layer and its artboard
  let targetArtboard: (typeof doc.artboards)[number] | undefined
  let rasterLayer: RasterLayer | undefined

  for (const artboard of doc.artboards) {
    const found = findLayerById(artboard.layers, layerId)
    if (found && found.type === 'raster') {
      targetArtboard = artboard
      rasterLayer = found as RasterLayer
      break
    }
  }

  if (!targetArtboard || !rasterLayer) return

  const imageData = getRasterData(rasterLayer.imageChunkId)
  if (!imageData) return

  const opts: TraceOptions = { ...defaultTraceOptions, ...options }
  const contours = traceImage(imageData, opts)

  if (contours.length === 0) return

  // Build a vector layer with all traced paths
  const paths = contours.map((segments) => ({
    id: uuid(),
    segments,
    closed: true,
    fillRule: 'evenodd' as const,
  }))

  const vectorLayer: VectorLayer = {
    id: uuid(),
    name: `Traced ${rasterLayer.name}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: {
      x: rasterLayer.transform.x,
      y: rasterLayer.transform.y,
      scaleX: rasterLayer.transform.scaleX,
      scaleY: rasterLayer.transform.scaleY,
      rotation: rasterLayer.transform.rotation,
    },
    effects: [],
    paths,
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }

  store.addLayer(targetArtboard.id, vectorLayer)
  store.selectLayer(vectorLayer.id)
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Recursively find a layer by id in a possibly nested layer tree. */
function findLayerById(
  layers: ReadonlyArray<import('@/types').Layer>,
  id: string,
): import('@/types').Layer | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer
    if (layer.type === 'group') {
      const found = findLayerById(layer.children, id)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Convert RGBA ImageData to a flat Uint8Array of 0/1 values.
 * 1 = foreground (dark / below threshold), 0 = background.
 */
function binarize(imageData: ImageData, threshold: number): Uint8Array {
  const { data, width, height } = imageData
  const result = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]!
    const g = data[i * 4 + 1]!
    const b = data[i * 4 + 2]!
    const a = data[i * 4 + 3]!
    // ITU-R BT.709 luminance, weighted by alpha
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * (a / 255)
    result[i] = lum < threshold ? 1 : 0
  }
  return result
}

/**
 * Marching squares contour tracing.
 *
 * Scans a grid of 2x2 cells and follows contour edges to produce closed
 * polyline paths. Each path is an array of {x, y} points.
 */
function marchingSquares(binary: Uint8Array, width: number, height: number): Array<Array<{ x: number; y: number }>> {
  const contours: Array<Array<{ x: number; y: number }>> = []

  // Track which cell edges have already been visited to avoid duplicates.
  // Key: `${cellX},${cellY},${edgeIndex}` — edgeIndex 0-3 for T/R/B/L
  const visited = new Set<string>()

  /** Sample the binary image; out-of-bounds = 0 (background). */
  function sample(x: number, y: number): number {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0
    return binary[y * width + x]!
  }

  /** Compute the marching-squares case index for the cell at (cx, cy). */
  function caseIndex(cx: number, cy: number): number {
    // Corners: TL=bit3, TR=bit2, BR=bit1, BL=bit0
    const tl = sample(cx, cy)
    const tr = sample(cx + 1, cy)
    const br = sample(cx + 1, cy + 1)
    const bl = sample(cx, cy + 1)
    return (tl << 3) | (tr << 2) | (br << 1) | bl
  }

  /**
   * Contour edges within a cell. For each case we define which edges connect.
   * Edges are indexed: 0=top, 1=right, 2=bottom, 3=left.
   * Returns pairs of [entryEdge, exitEdge].
   */
  function cellEdges(ci: number): Array<[number, number]> {
    // prettier-ignore
    switch (ci) {
      case 0: case 15: return []                       // all same
      case 1:  return [[2, 3]]                         // BL
      case 2:  return [[1, 2]]                         // BR
      case 3:  return [[1, 3]]                         // BL+BR
      case 4:  return [[0, 1]]                         // TR
      case 5:  return [[0, 3], [1, 2]]                 // TR+BL (saddle)
      case 6:  return [[0, 2]]                         // TR+BR
      case 7:  return [[0, 3]]                         // TR+BR+BL
      case 8:  return [[0, 3]]                         // TL  — same edges as 7 but opposite winding
      case 9:  return [[0, 2]]                         // TL+BL
      case 10: return [[0, 1], [2, 3]]                 // TL+BR (saddle)
      case 11: return [[0, 1]]                         // TL+BL+BR
      case 12: return [[1, 3]]                         // TL+TR
      case 13: return [[1, 2]]                         // TL+TR+BL
      case 14: return [[2, 3]]                         // TL+TR+BR
      default: return []
    }
  }

  /** Return the midpoint on the specified edge of cell (cx, cy). */
  function edgeMidpoint(cx: number, cy: number, edge: number): { x: number; y: number } {
    switch (edge) {
      case 0:
        return { x: cx + 0.5, y: cy } // top
      case 1:
        return { x: cx + 1, y: cy + 0.5 } // right
      case 2:
        return { x: cx + 0.5, y: cy + 1 } // bottom
      case 3:
        return { x: cx, y: cy + 0.5 } // left
      default:
        return { x: cx + 0.5, y: cy + 0.5 }
    }
  }

  /** Opposite edge index. */
  function oppositeEdge(edge: number): number {
    return (edge + 2) & 3
  }

  /** Neighbouring cell when crossing the given edge. */
  function neighbour(cx: number, cy: number, edge: number): { nx: number; ny: number } {
    switch (edge) {
      case 0:
        return { nx: cx, ny: cy - 1 } // cross top → cell above
      case 1:
        return { nx: cx + 1, ny: cy } // cross right → cell to the right
      case 2:
        return { nx: cx, ny: cy + 1 } // cross bottom → cell below
      case 3:
        return { nx: cx - 1, ny: cy } // cross left → cell to the left
      default:
        return { nx: cx, ny: cy }
    }
  }

  /**
   * Follow a contour starting from a given cell and edge.
   */
  function followContour(startCx: number, startCy: number, startEdge: number): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []

    let cx = startCx
    let cy = startCy
    let entryEdge = startEdge
    let steps = 0
    const maxSteps = (width + 1) * (height + 1) * 2 // safety limit

    while (steps < maxSteps) {
      const key = `${cx},${cy},${entryEdge}`
      if (visited.has(key)) {
        // We have looped back — contour is closed
        break
      }
      visited.add(key)

      const ci = caseIndex(cx, cy)
      const edges = cellEdges(ci)

      // Find which edge pair uses our entry edge
      let exitEdge = -1
      for (const [a, b] of edges) {
        if (a === entryEdge) {
          exitEdge = b
          break
        }
        if (b === entryEdge) {
          exitEdge = a
          break
        }
      }

      if (exitEdge === -1) break // dead end (shouldn't happen on valid contours)

      // Record the exit midpoint
      const pt = edgeMidpoint(cx, cy, exitEdge)
      points.push(pt)

      // Mark the reverse direction as visited too
      const { nx, ny } = neighbour(cx, cy, exitEdge)
      const reverseEdge = oppositeEdge(exitEdge)
      visited.add(`${nx},${ny},${reverseEdge}`)

      // Move to the neighbouring cell
      cx = nx
      cy = ny
      entryEdge = reverseEdge
      steps++
    }

    return points
  }

  // Scan all cells for contour starts
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const ci = caseIndex(cx, cy)
      if (ci === 0 || ci === 15) continue // no contour

      const edges = cellEdges(ci)
      for (const [a, _b] of edges) {
        const key = `${cx},${cy},${a}`
        if (visited.has(key)) continue

        const contour = followContour(cx, cy, a)
        if (contour.length >= 3) {
          contours.push(contour)
        }
      }
    }
  }

  return contours
}

// ── RDP simplification ──────────────────────────────────────────────────────

/** Ramer-Douglas-Peucker polyline simplification. */
function simplifyRDP(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]!
  const last = points[points.length - 1]!

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegmentDist(points[i]!, first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, maxIdx + 1), epsilon)
    const right = simplifyRDP(points.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }

  return [first, last]
}

function pointToSegmentDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// ── Segment converters ──────────────────────────────────────────────────────

/** Convert a point array to a closed polyline of line segments. */
function pointsToLineSegments(points: Array<{ x: number; y: number }>): Segment[] {
  if (points.length < 2) return []
  const segments: Segment[] = [{ type: 'move', x: points[0]!.x, y: points[0]!.y }]
  for (let i = 1; i < points.length; i++) {
    segments.push({ type: 'line', x: points[i]!.x, y: points[i]!.y })
  }
  segments.push({ type: 'close' })
  return segments
}

/**
 * Convert a point array to smooth closed cubic bezier curves using
 * Catmull-Rom-to-cubic conversion (wrapping at endpoints for closure).
 */
function pointsToCubicSegments(points: Array<{ x: number; y: number }>): Segment[] {
  const n = points.length
  if (n < 3) return pointsToLineSegments(points)

  const segments: Segment[] = [{ type: 'move', x: points[0]!.x, y: points[0]!.y }]

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!
    const p1 = points[i]!
    const p2 = points[(i + 1) % n]!
    const p3 = points[(i + 2) % n]!

    // Catmull-Rom → cubic bezier control points (alpha=0 / uniform)
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    segments.push({
      type: 'cubic',
      x: p2.x,
      y: p2.y,
      cp1x,
      cp1y,
      cp2x,
      cp2y,
    })
  }

  segments.push({ type: 'close' })
  return segments
}
