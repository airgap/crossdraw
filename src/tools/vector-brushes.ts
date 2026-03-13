import { v4 as uuid } from 'uuid'
import type { VectorLayer, Path, Segment } from '@/types'

// ── Types ──

export type VectorBrushType = 'pattern' | 'art' | 'scatter' | 'calligraphic'

export interface VectorBrushSettings {
  type: VectorBrushType
  // Pattern: repeat a shape along the path
  patternShape: 'circle' | 'square' | 'triangle' | 'arrow' | 'custom'
  patternSpacing: number
  // Scatter: randomly place shapes along path
  scatterAmount: number // perpendicular offset range
  scatterRotation: number // random rotation range in degrees
  scatterScale: number // random scale variation (0-1 range)
  // Calligraphic: angled ellipse nib
  nibAngle: number // 0-180 degrees
  nibRoundness: number // 0-100%
  nibSize: number
  // Art: pressure-varying width
  artWidth: number
  artVariation: number // 0-1 range
}

// ── Default settings ──

let brushSettings: VectorBrushSettings = {
  type: 'pattern',
  patternShape: 'circle',
  patternSpacing: 20,
  scatterAmount: 10,
  scatterRotation: 30,
  scatterScale: 0.3,
  nibAngle: 45,
  nibRoundness: 50,
  nibSize: 10,
  artWidth: 8,
  artVariation: 0.5,
}

export function getVectorBrushSettings(): VectorBrushSettings {
  return { ...brushSettings }
}

export function setVectorBrushSettings(settings: Partial<VectorBrushSettings>): void {
  brushSettings = { ...brushSettings, ...settings }
}

// ── Path geometry helpers ──

/** Point on a 2D plane. */
interface Point {
  x: number
  y: number
}

/** Evaluate a cubic bezier at parameter t. */
function cubicAt(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * p3.y,
  }
}

/** Compute the tangent direction of a cubic bezier at parameter t. */
function cubicTangent(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const dx = 3 * mt * mt * (cp1.x - p0.x) + 6 * mt * t * (cp2.x - cp1.x) + 3 * t * t * (p3.x - cp2.x)
  const dy = 3 * mt * mt * (cp1.y - p0.y) + 6 * mt * t * (cp2.y - cp1.y) + 3 * t * t * (p3.y - cp2.y)
  return { x: dx, y: dy }
}

/** Compute approximate length of a line segment. */
function lineLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Approximate the length of a cubic bezier by sampling. */
function cubicLength(p0: Point, cp1: Point, cp2: Point, p3: Point, samples = 16): number {
  let length = 0
  let prev = p0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const pt = cubicAt(p0, cp1, cp2, p3, t)
    length += lineLength(prev, pt)
    prev = pt
  }
  return length
}

/** A sampled point along a path, with position, tangent angle, and distance from start. */
export interface PathSample {
  point: Point
  angle: number // tangent angle in radians
  distance: number // cumulative distance from path start
}

/**
 * Walk along a Path and return sampled points at roughly the given spacing.
 * This flattens curves into line segments for sampling.
 */
export function samplePath(path: Path, spacing: number): PathSample[] {
  if (spacing <= 0) return []

  const samples: PathSample[] = []
  let currentPos: Point = { x: 0, y: 0 }
  let cumDist = 0
  let nextSampleAt = 0

  // Emit a sample at a given point along a sub-segment
  function emitSample(pt: Point, angle: number) {
    samples.push({ point: { ...pt }, angle, distance: cumDist })
    nextSampleAt = cumDist + spacing
  }

  // Process linear sub-segment
  function walkLine(from: Point, to: Point) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    if (len === 0) return
    const angle = Math.atan2(dy, dx)

    let walked = 0
    // Emit first sample if at the very beginning
    if (samples.length === 0) {
      emitSample(from, angle)
    }

    while (walked < len) {
      const remaining = nextSampleAt - cumDist
      if (remaining <= len - walked) {
        walked += remaining
        cumDist += remaining
        const frac = walked / len
        const pt = { x: from.x + dx * frac, y: from.y + dy * frac }
        emitSample(pt, angle)
      } else {
        cumDist += len - walked
        walked = len
      }
    }
  }

  // Process cubic bezier sub-segment
  function walkCubic(from: Point, cp1: Point, cp2: Point, to: Point) {
    const totalLen = cubicLength(from, cp1, cp2, to)
    if (totalLen === 0) return
    const stepCount = Math.max(4, Math.ceil(totalLen / (spacing / 4)))
    let prev = from
    for (let i = 1; i <= stepCount; i++) {
      const t = i / stepCount
      const pt = cubicAt(from, cp1, cp2, to, t)
      const tangent = cubicTangent(from, cp1, cp2, to, t)
      const segLen = lineLength(prev, pt)
      const angle = Math.atan2(tangent.y, tangent.x)

      const oldDist = cumDist
      cumDist += segLen

      // Emit samples that fall within this micro-segment
      while (nextSampleAt <= cumDist) {
        const frac = segLen > 0 ? (nextSampleAt - oldDist) / segLen : 0
        const samplePt = {
          x: prev.x + (pt.x - prev.x) * frac,
          y: prev.y + (pt.y - prev.y) * frac,
        }
        samples.push({ point: samplePt, angle, distance: nextSampleAt })
        nextSampleAt += spacing
      }

      prev = pt
    }
  }

  for (const seg of path.segments) {
    switch (seg.type) {
      case 'move':
        currentPos = { x: seg.x, y: seg.y }
        if (samples.length === 0) {
          emitSample(currentPos, 0)
        }
        break
      case 'line': {
        const to = { x: seg.x, y: seg.y }
        walkLine(currentPos, to)
        currentPos = to
        break
      }
      case 'cubic': {
        const to = { x: seg.x, y: seg.y }
        const cp1 = { x: seg.cp1x, y: seg.cp1y }
        const cp2 = { x: seg.cp2x, y: seg.cp2y }
        walkCubic(currentPos, cp1, cp2, to)
        currentPos = to
        break
      }
      case 'quadratic': {
        // Elevate to cubic
        const cp1 = {
          x: currentPos.x + (2 / 3) * (seg.cpx - currentPos.x),
          y: currentPos.y + (2 / 3) * (seg.cpy - currentPos.y),
        }
        const cp2 = {
          x: seg.x + (2 / 3) * (seg.cpx - seg.x),
          y: seg.y + (2 / 3) * (seg.cpy - seg.y),
        }
        const to = { x: seg.x, y: seg.y }
        walkCubic(currentPos, cp1, cp2, to)
        currentPos = to
        break
      }
      case 'arc': {
        // Approximate arc as a straight line for sampling
        const to = { x: seg.x, y: seg.y }
        walkLine(currentPos, to)
        currentPos = to
        break
      }
      case 'close':
        break
    }
  }

  return samples
}

// ── Shape generators ──

/** Generate a circle path centered at origin with given radius. */
export function makeCircleShape(radius: number): Path {
  const k = 0.5522847498 // kappa for circle approximation with cubic beziers
  const r = radius
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: r, y: 0 },
      { type: 'cubic', x: 0, y: r, cp1x: r, cp1y: r * k, cp2x: r * k, cp2y: r },
      { type: 'cubic', x: -r, y: 0, cp1x: -r * k, cp1y: r, cp2x: -r, cp2y: r * k },
      { type: 'cubic', x: 0, y: -r, cp1x: -r, cp1y: -r * k, cp2x: -r * k, cp2y: -r },
      { type: 'cubic', x: r, y: 0, cp1x: r * k, cp1y: -r, cp2x: r, cp2y: -r * k },
      { type: 'close' },
    ],
  }
}

/** Generate a square path centered at origin with given half-size. */
export function makeSquareShape(halfSize: number): Path {
  const s = halfSize
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: -s, y: -s },
      { type: 'line', x: s, y: -s },
      { type: 'line', x: s, y: s },
      { type: 'line', x: -s, y: s },
      { type: 'close' },
    ],
  }
}

/** Generate an equilateral triangle path centered at origin with given half-size. */
export function makeTriangleShape(halfSize: number): Path {
  const h = halfSize
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: 0, y: -h },
      { type: 'line', x: h * Math.cos(Math.PI / 6), y: h * Math.sin(Math.PI / 6) },
      { type: 'line', x: -h * Math.cos(Math.PI / 6), y: h * Math.sin(Math.PI / 6) },
      { type: 'close' },
    ],
  }
}

/** Generate an arrow path centered at origin pointing right. */
export function makeArrowShape(halfSize: number): Path {
  const s = halfSize
  return {
    id: uuid(),
    closed: true,
    segments: [
      { type: 'move', x: s, y: 0 },
      { type: 'line', x: 0, y: -s * 0.6 },
      { type: 'line', x: 0, y: -s * 0.2 },
      { type: 'line', x: -s, y: -s * 0.2 },
      { type: 'line', x: -s, y: s * 0.2 },
      { type: 'line', x: 0, y: s * 0.2 },
      { type: 'line', x: 0, y: s * 0.6 },
      { type: 'close' },
    ],
  }
}

/** Get a shape path based on the shape name. */
function getShapePath(shape: VectorBrushSettings['patternShape'], size: number): Path {
  const halfSize = size / 2
  switch (shape) {
    case 'circle':
      return makeCircleShape(halfSize)
    case 'square':
      return makeSquareShape(halfSize)
    case 'triangle':
      return makeTriangleShape(halfSize)
    case 'arrow':
      return makeArrowShape(halfSize)
    case 'custom':
      return makeCircleShape(halfSize) // fallback to circle
  }
}

// ── Transform a path (rotate, scale, translate) ──

function transformSegment(seg: Segment, cos: number, sin: number, scale: number, tx: number, ty: number): Segment {
  function tx2(x: number, y: number): { x: number; y: number } {
    const sx = x * scale
    const sy = y * scale
    return {
      x: sx * cos - sy * sin + tx,
      y: sx * sin + sy * cos + ty,
    }
  }

  switch (seg.type) {
    case 'move': {
      const p = tx2(seg.x, seg.y)
      return { type: 'move', x: p.x, y: p.y }
    }
    case 'line': {
      const p = tx2(seg.x, seg.y)
      return { type: 'line', x: p.x, y: p.y }
    }
    case 'cubic': {
      const p = tx2(seg.x, seg.y)
      const c1 = tx2(seg.cp1x, seg.cp1y)
      const c2 = tx2(seg.cp2x, seg.cp2y)
      return { type: 'cubic', x: p.x, y: p.y, cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y }
    }
    case 'quadratic': {
      const p = tx2(seg.x, seg.y)
      const cp = tx2(seg.cpx, seg.cpy)
      return { type: 'quadratic', x: p.x, y: p.y, cpx: cp.x, cpy: cp.y }
    }
    case 'arc': {
      const p = tx2(seg.x, seg.y)
      return { ...seg, x: p.x, y: p.y, rx: seg.rx * scale, ry: seg.ry * scale }
    }
    case 'close':
      return { type: 'close' }
  }
}

function transformPath(path: Path, angle: number, scale: number, tx: number, ty: number): Path {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    id: uuid(),
    closed: path.closed,
    segments: path.segments.map((s) => transformSegment(s, cos, sin, scale, tx, ty)),
    fillRule: path.fillRule,
  }
}

// ── Seeded pseudo-random number generator ──

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s * 1664525 + 1013904223) | 0
    return (s >>> 0) / 4294967296
  }
}

// ── Brush application ──

/**
 * Apply a vector brush to a path, generating vector layer(s) along it.
 */
export function applyVectorBrush(path: Path, settings: VectorBrushSettings = brushSettings): VectorLayer[] {
  switch (settings.type) {
    case 'pattern':
      return applyPatternBrush(path, settings)
    case 'scatter':
      return applyScatterBrush(path, settings)
    case 'calligraphic':
      return [applyCalligraphicBrush(path, settings)]
    case 'art':
      return [applyArtBrush(path, settings)]
  }
}

// ── Pattern brush ──

function applyPatternBrush(path: Path, settings: VectorBrushSettings): VectorLayer[] {
  const spacing = Math.max(1, settings.patternSpacing)
  const samples = samplePath(path, spacing)
  const shapeSize = spacing * 0.8

  return samples.map((sample, i) => {
    const shapePath = getShapePath(settings.patternShape, shapeSize)
    const placed = transformPath(shapePath, sample.angle, 1, sample.point.x, sample.point.y)

    return {
      id: uuid(),
      name: `Pattern ${i + 1}`,
      type: 'vector' as const,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [placed],
      fill: { type: 'solid' as const, color: '#000000', opacity: 1 },
      stroke: null,
    }
  })
}

// ── Scatter brush ──

function applyScatterBrush(path: Path, settings: VectorBrushSettings): VectorLayer[] {
  const spacing = Math.max(1, settings.patternSpacing)
  const samples = samplePath(path, spacing)
  const shapeSize = spacing * 0.8
  const rng = seededRandom(42)

  return samples.map((sample, i) => {
    const shapePath = getShapePath(settings.patternShape, shapeSize)

    // Random perpendicular offset
    const perpOffset = (rng() - 0.5) * 2 * settings.scatterAmount
    const perpAngle = sample.angle + Math.PI / 2
    const offsetX = sample.point.x + Math.cos(perpAngle) * perpOffset
    const offsetY = sample.point.y + Math.sin(perpAngle) * perpOffset

    // Random rotation
    const rotDeg = (rng() - 0.5) * 2 * settings.scatterRotation
    const rot = sample.angle + (rotDeg * Math.PI) / 180

    // Random scale
    const scaleVar = 1 + (rng() - 0.5) * 2 * settings.scatterScale
    const scale = Math.max(0.1, scaleVar)

    const placed = transformPath(shapePath, rot, scale, offsetX, offsetY)

    return {
      id: uuid(),
      name: `Scatter ${i + 1}`,
      type: 'vector' as const,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [placed],
      fill: { type: 'solid' as const, color: '#000000', opacity: 1 },
      stroke: null,
    }
  })
}

// ── Calligraphic brush ──

/**
 * Generate a variable-width stroke outline based on nib angle.
 * The nib is an ellipse defined by nibAngle, nibRoundness, and nibSize.
 * At each sample point, we place the nib ellipse and connect outer/inner edges.
 */
function applyCalligraphicBrush(path: Path, settings: VectorBrushSettings): VectorLayer {
  const spacing = Math.max(1, settings.nibSize / 4)
  const samples = samplePath(path, spacing)

  if (samples.length < 2) {
    return makeEmptyVectorLayer('Calligraphic stroke')
  }

  const nibAngleRad = (settings.nibAngle * Math.PI) / 180
  const roundness = Math.max(1, settings.nibRoundness) / 100
  const halfW = settings.nibSize / 2
  const halfH = halfW * roundness

  // For each sample, compute left and right edge points
  const leftEdge: Point[] = []
  const rightEdge: Point[] = []

  for (const sample of samples) {
    // Nib major axis direction (perpendicular to nib angle)
    const nibPerp = nibAngleRad + Math.PI / 2
    const cos = Math.cos(nibPerp)
    const sin = Math.sin(nibPerp)

    // Project the path tangent onto the nib axes to determine effective width
    const tangentAngle = sample.angle
    const relAngle = tangentAngle - nibAngleRad

    // Width varies based on relative angle between stroke direction and nib angle
    const width = Math.abs(Math.cos(relAngle)) * halfW + Math.abs(Math.sin(relAngle)) * halfH

    leftEdge.push({
      x: sample.point.x + cos * width,
      y: sample.point.y + sin * width,
    })
    rightEdge.push({
      x: sample.point.x - cos * width,
      y: sample.point.y - sin * width,
    })
  }

  // Build outline: left edge forward, then right edge backward
  const segments: Segment[] = []
  segments.push({ type: 'move', x: leftEdge[0]!.x, y: leftEdge[0]!.y })

  for (let i = 1; i < leftEdge.length; i++) {
    segments.push({ type: 'line', x: leftEdge[i]!.x, y: leftEdge[i]!.y })
  }

  // Connect to right edge (reversed)
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    segments.push({ type: 'line', x: rightEdge[i]!.x, y: rightEdge[i]!.y })
  }

  segments.push({ type: 'close' })

  const outlinePath: Path = {
    id: uuid(),
    closed: true,
    segments,
  }

  return {
    id: uuid(),
    name: 'Calligraphic stroke',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    paths: [outlinePath],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}

// ── Art brush ──

/**
 * Generate a variable-width stroke that simulates pressure variation.
 * Width varies sinusoidally along the path to simulate pressure dynamics.
 */
function applyArtBrush(path: Path, settings: VectorBrushSettings): VectorLayer {
  const spacing = Math.max(1, settings.artWidth / 4)
  const samples = samplePath(path, spacing)

  if (samples.length < 2) {
    return makeEmptyVectorLayer('Art stroke')
  }

  const totalDist = samples[samples.length - 1]!.distance
  const baseWidth = settings.artWidth / 2

  const leftEdge: Point[] = []
  const rightEdge: Point[] = []

  for (const sample of samples) {
    // Pressure simulation: taper at start and end, with variation in between
    const normalizedPos = totalDist > 0 ? sample.distance / totalDist : 0.5

    // Taper: smoothly reduce at start and end
    const taper = Math.sin(normalizedPos * Math.PI)
    // Variation: add some waviness
    const variation = 1 + settings.artVariation * Math.sin(normalizedPos * Math.PI * 6) * 0.3

    const width = baseWidth * taper * variation

    const perpAngle = sample.angle + Math.PI / 2
    const cos = Math.cos(perpAngle)
    const sin = Math.sin(perpAngle)

    leftEdge.push({
      x: sample.point.x + cos * width,
      y: sample.point.y + sin * width,
    })
    rightEdge.push({
      x: sample.point.x - cos * width,
      y: sample.point.y - sin * width,
    })
  }

  // Build outline path
  const segments: Segment[] = []
  segments.push({ type: 'move', x: leftEdge[0]!.x, y: leftEdge[0]!.y })

  for (let i = 1; i < leftEdge.length; i++) {
    segments.push({ type: 'line', x: leftEdge[i]!.x, y: leftEdge[i]!.y })
  }

  for (let i = rightEdge.length - 1; i >= 0; i--) {
    segments.push({ type: 'line', x: rightEdge[i]!.x, y: rightEdge[i]!.y })
  }

  segments.push({ type: 'close' })

  const outlinePath: Path = {
    id: uuid(),
    closed: true,
    segments,
  }

  return {
    id: uuid(),
    name: 'Art stroke',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    paths: [outlinePath],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}

// ── Helpers ──

function makeEmptyVectorLayer(name: string): VectorLayer {
  return {
    id: uuid(),
    name,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}
