/**
 * LiveSketch (#98)
 *
 * A natural sketching tool that converts freehand strokes into smooth vector
 * curves in real time.  The pipeline:
 *
 *   1. Collect raw input points
 *   2. RDP simplification (reduce noise)
 *   3. Schneider curve fitting (fit cubic Beziers)
 *   4. Optional: snap to nearby geometry / merge with existing paths
 *
 * The result is a clean vector path suitable for further editing.
 */

import { v4 as uuid } from 'uuid'
import type { Segment, Path } from '@/types'

// ── Settings ─────────────────────────────────────────────────────────────────

export interface LiveSketchSettings {
  /** RDP simplification tolerance (higher = fewer points). */
  smoothingLevel: number
  /** Time window (ms) in which nearby strokes are merged. */
  mergeWindow: number
  /** Snap to nearby existing geometry. */
  snapToGeometry: boolean
  /** Distance threshold for connecting to existing paths (px). */
  connectDistance: number
  /** Bezier fitting error tolerance. */
  fittingTolerance: number
}

export const DEFAULT_LIVE_SKETCH_SETTINGS: LiveSketchSettings = {
  smoothingLevel: 2.0,
  mergeWindow: 500,
  snapToGeometry: true,
  connectDistance: 10,
  fittingTolerance: 4.0,
}

// ── Internal state ───────────────────────────────────────────────────────────

interface Point {
  x: number
  y: number
}

interface SketchStroke {
  points: Point[]
  timestamp: number
}

interface LiveSketchState {
  active: boolean
  currentPoints: Point[]
  recentStrokes: SketchStroke[]
  settings: LiveSketchSettings
}

const state: LiveSketchState = {
  active: false,
  currentPoints: [],
  recentStrokes: [],
  settings: { ...DEFAULT_LIVE_SKETCH_SETTINGS },
}

// ── Public API ───────────────────────────────────────────────────────────────

export function setLiveSketchSettings(settings: Partial<LiveSketchSettings>): void {
  Object.assign(state.settings, settings)
}

export function getLiveSketchSettings(): LiveSketchSettings {
  return { ...state.settings }
}

export function beginLiveSketch(x: number, y: number): void {
  state.active = true
  state.currentPoints = [{ x, y }]
}

export function addLiveSketchPoint(x: number, y: number): void {
  if (!state.active) return
  state.currentPoints.push({ x, y })
}

/**
 * Finalize the current live-sketch stroke.
 *
 * Returns a clean vector Path with cubic bezier segments fitted to the
 * raw input.  Returns null if the stroke has insufficient points.
 */
export function finalizeLiveSketch(): Path | null {
  if (!state.active || state.currentPoints.length < 2) {
    state.active = false
    state.currentPoints = []
    return null
  }

  const raw = [...state.currentPoints]
  state.active = false
  state.currentPoints = []

  // Step 1: RDP simplification
  const simplified = rdpSimplify(raw, state.settings.smoothingLevel)

  if (simplified.length < 2) return null

  // Step 2: Schneider curve fitting
  const segments = fitCurves(simplified, state.settings.fittingTolerance)

  // Step 3: Record stroke for potential merging
  const stroke: SketchStroke = { points: raw, timestamp: Date.now() }
  state.recentStrokes.push(stroke)

  // Prune old strokes outside merge window
  const cutoff = Date.now() - state.settings.mergeWindow
  state.recentStrokes = state.recentStrokes.filter((s) => s.timestamp > cutoff)

  return {
    id: uuid(),
    segments,
    closed: false,
  }
}

/**
 * Get a preview of the current in-progress stroke as simplified points.
 * Useful for rendering a preview while the user is drawing.
 */
export function getLiveSketchPreview(): Point[] {
  if (!state.active || state.currentPoints.length < 2) return []
  return rdpSimplify(state.currentPoints, state.settings.smoothingLevel)
}

// ── RDP Simplification ───────────────────────────────────────────────────────

function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)
}

export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points]

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
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(points.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }

  return [first, last]
}

// ── Schneider Curve Fitting ──────────────────────────────────────────────────

/**
 * Fit cubic Bezier curves to a sequence of points using an approach inspired
 * by Philip Schneider's algorithm.
 *
 * Returns an array of Segments (move + cubics).
 */
export function fitCurves(points: Point[], tolerance: number): Segment[] {
  if (points.length < 2) return []

  if (points.length === 2) {
    return [
      { type: 'move', x: points[0]!.x, y: points[0]!.y },
      { type: 'line', x: points[1]!.x, y: points[1]!.y },
    ]
  }

  const segments: Segment[] = [{ type: 'move', x: points[0]!.x, y: points[0]!.y }]

  // Compute left tangent
  const tHat1 = normalize(subtract(points[1]!, points[0]!))
  // Compute right tangent
  const tHat2 = normalize(subtract(points[points.length - 2]!, points[points.length - 1]!))

  fitCubic(points, 0, points.length - 1, tHat1, tHat2, tolerance, segments)

  return segments
}

function fitCubic(
  points: Point[],
  first: number,
  last: number,
  tHat1: Point,
  tHat2: Point,
  tolerance: number,
  segments: Segment[],
): void {
  const nPts = last - first + 1

  if (nPts === 2) {
    const p0 = points[first]!
    const p3 = points[last]!
    const dist = distance(p0, p3) / 3
    segments.push({
      type: 'cubic',
      x: p3.x,
      y: p3.y,
      cp1x: p0.x + tHat1.x * dist,
      cp1y: p0.y + tHat1.y * dist,
      cp2x: p3.x + tHat2.x * dist,
      cp2y: p3.y + tHat2.y * dist,
    })
    return
  }

  // Parameterize points by chord length
  const u = chordLengthParameterize(points, first, last)

  // Generate a Bezier curve for the region
  const bezCurve = generateBezier(points, first, last, u, tHat1, tHat2)

  // Find max deviation
  const [maxError, splitPoint] = computeMaxError(points, first, last, bezCurve, u)

  if (maxError < tolerance) {
    segments.push({
      type: 'cubic',
      x: bezCurve[3]!.x,
      y: bezCurve[3]!.y,
      cp1x: bezCurve[1]!.x,
      cp1y: bezCurve[1]!.y,
      cp2x: bezCurve[2]!.x,
      cp2y: bezCurve[2]!.y,
    })
    return
  }

  // If error is too large, split and recurse
  const tHatCenter = computeCenterTangent(points, splitPoint)

  fitCubic(points, first, splitPoint, tHat1, negate(tHatCenter), tolerance, segments)
  fitCubic(points, splitPoint, last, tHatCenter, tHat2, tolerance, segments)
}

// ── Bezier fitting helpers ───────────────────────────────────────────────────

function chordLengthParameterize(points: Point[], first: number, last: number): number[] {
  const u: number[] = [0]
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1]! + distance(points[i]!, points[i - 1]!))
  }
  const total = u[u.length - 1]!
  if (total > 0) {
    for (let i = 0; i < u.length; i++) {
      u[i] = u[i]! / total
    }
  }
  return u
}

function generateBezier(
  points: Point[],
  first: number,
  last: number,
  uPrime: number[],
  tHat1: Point,
  tHat2: Point,
): Point[] {
  const nPts = last - first + 1
  const p0 = points[first]!
  const p3 = points[last]!

  // Compute A matrix
  let c00 = 0,
    c01 = 0,
    c11 = 0
  let x0 = 0,
    x1 = 0

  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i]!
    const b0 = (1 - u) * (1 - u) * (1 - u)
    const b1 = 3 * u * (1 - u) * (1 - u)
    const b2 = 3 * u * u * (1 - u)
    const b3 = u * u * u

    const a1 = scale(tHat1, b1)
    const a2 = scale(tHat2, b2)

    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)

    const pi = points[first + i]!
    const tmp = subtract(pi, add(scale(p0, b0 + b1), scale(p3, b2 + b3)))
    x0 += dot(a1, tmp)
    x1 += dot(a2, tmp)
  }

  const det = c00 * c11 - c01 * c01
  let alpha1: number, alpha2: number

  if (Math.abs(det) < 1e-12) {
    const dist = distance(p0, p3) / 3
    alpha1 = dist
    alpha2 = dist
  } else {
    alpha1 = (c11 * x0 - c01 * x1) / det
    alpha2 = (c00 * x1 - c01 * x0) / det
  }

  const segLength = distance(p0, p3)
  const epsilon = 1e-6 * segLength

  if (alpha1 < epsilon || alpha2 < epsilon) {
    const dist = segLength / 3
    alpha1 = dist
    alpha2 = dist
  }

  return [p0, add(p0, scale(tHat1, alpha1)), add(p3, scale(tHat2, alpha2)), p3]
}

function computeMaxError(
  points: Point[],
  first: number,
  last: number,
  bezCurve: Point[],
  u: number[],
): [number, number] {
  let maxDist = 0
  let splitPoint = Math.floor((last - first + 1) / 2) + first

  for (let i = 1; i < last - first; i++) {
    const p = bezierEval(bezCurve, u[i]!)
    const dist = distanceSq(points[first + i]!, p)
    if (dist > maxDist) {
      maxDist = dist
      splitPoint = first + i
    }
  }

  return [maxDist, splitPoint]
}

function computeCenterTangent(points: Point[], center: number): Point {
  const prev = points[center - 1] ?? points[center]!
  const next = points[center + 1] ?? points[center]!
  return normalize(subtract(next, prev))
}

function bezierEval(curve: Point[], t: number): Point {
  const p0 = curve[0]!
  const p1 = curve[1]!
  const p2 = curve[2]!
  const p3 = curve[3]!

  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t

  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  }
}

// ── Vector math ──────────────────────────────────────────────────────────────

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

function scale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s }
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

function negate(p: Point): Point {
  return { x: -p.x, y: -p.y }
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function distanceSq(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

function normalize(p: Point): Point {
  const len = Math.sqrt(p.x * p.x + p.y * p.y)
  if (len < 1e-10) return { x: 1, y: 0 }
  return { x: p.x / len, y: p.y / len }
}
