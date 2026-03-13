import { v4 as uuid } from 'uuid'
import type { VectorLayer, GroupLayer, Path, Segment, Fill, Stroke, Transform } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ── Config ──

export interface BlendConfig {
  steps: number
  spacing: 'even' | 'specified'
  method?: 'linear' | 'smooth'
}

// ── Blend settings (module-level state) ──

let blendSettings: { steps: number; method: 'linear' | 'smooth' } = {
  steps: 5,
  method: 'linear',
}

export function getBlendSettings(): { steps: number; method: 'linear' | 'smooth' } {
  return { ...blendSettings }
}

export function setBlendSettings(settings: Partial<{ steps: number; method: 'linear' | 'smooth' }>): void {
  if (settings.steps !== undefined) blendSettings.steps = Math.max(1, Math.round(settings.steps))
  if (settings.method !== undefined) blendSettings.method = settings.method
}

/**
 * Perform a blend between the two currently selected vector layers.
 * Uses the module-level blend settings, or accepts overrides.
 */
export function performBlend(steps?: number, method?: 'linear' | 'smooth'): void {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  const selectedIds = store.selection.layerIds
  if (selectedIds.length !== 2) return

  const resolvedSteps = steps ?? blendSettings.steps
  const resolvedMethod = method ?? blendSettings.method

  store.createBlend(artboard.id, selectedIds[0]!, selectedIds[1]!, resolvedSteps, resolvedMethod)
}

/** Smooth (ease-in-out) easing function. */
export function smoothEase(t: number): number {
  // Hermite interpolation: 3t^2 - 2t^3
  return t * t * (3 - 2 * t)
}

// ── Color interpolation ──

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return [r, g, b]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  )
}

export function interpolateColor(color1: string, color2: string, t: number): string {
  const [r1, g1, b1] = parseHex(color1)
  const [r2, g2, b2] = parseHex(color2)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

// ── Transform interpolation ──

export function interpolateTransform(t1: Transform, t2: Transform, t: number): Transform {
  return {
    x: t1.x + (t2.x - t1.x) * t,
    y: t1.y + (t2.y - t1.y) * t,
    scaleX: t1.scaleX + (t2.scaleX - t1.scaleX) * t,
    scaleY: t1.scaleY + (t2.scaleY - t1.scaleY) * t,
    rotation: t1.rotation + (t2.rotation - t1.rotation) * t,
    skewX: (t1.skewX ?? 0) + ((t2.skewX ?? 0) - (t1.skewX ?? 0)) * t,
    skewY: (t1.skewY ?? 0) + ((t2.skewY ?? 0) - (t1.skewY ?? 0)) * t,
  }
}

// ── Segment interpolation helpers ──

/** Lerp a numeric value. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Get the endpoint coordinates of a segment (for segments that have them). */
function segmentEndpoint(seg: Segment): { x: number; y: number } | null {
  if (seg.type === 'close') return null
  return { x: seg.x, y: seg.y }
}

/**
 * Promote a segment to cubic type for interpolation.
 * When segment types differ between paths we convert both to cubic for blending.
 * The previous endpoint is needed to compute implicit control points.
 */
function promoteToCubic(
  seg: Segment,
  prevX: number,
  prevY: number,
): { type: 'cubic'; x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
  switch (seg.type) {
    case 'move':
    case 'line':
      // A straight line as a degenerate cubic: cp1 at start, cp2 at end
      return { type: 'cubic', x: seg.x, y: seg.y, cp1x: prevX, cp1y: prevY, cp2x: seg.x, cp2y: seg.y }
    case 'cubic':
      return { type: 'cubic', x: seg.x, y: seg.y, cp1x: seg.cp1x, cp1y: seg.cp1y, cp2x: seg.cp2x, cp2y: seg.cp2y }
    case 'quadratic': {
      // Elevate quadratic to cubic
      const cp1x = prevX + (2 / 3) * (seg.cpx - prevX)
      const cp1y = prevY + (2 / 3) * (seg.cpy - prevY)
      const cp2x = seg.x + (2 / 3) * (seg.cpx - seg.x)
      const cp2y = seg.y + (2 / 3) * (seg.cpy - seg.y)
      return { type: 'cubic', x: seg.x, y: seg.y, cp1x, cp1y, cp2x, cp2y }
    }
    case 'arc':
      // Approximate arc as a line-like cubic
      return { type: 'cubic', x: seg.x, y: seg.y, cp1x: prevX, cp1y: prevY, cp2x: seg.x, cp2y: seg.y }
    case 'close':
      return { type: 'cubic', x: prevX, y: prevY, cp1x: prevX, cp1y: prevY, cp2x: prevX, cp2y: prevY }
  }
}

/** Interpolate two segments of any type by promoting to cubic when types differ. */
function interpolateSegment(
  seg1: Segment,
  seg2: Segment,
  t: number,
  prev1X: number,
  prev1Y: number,
  prev2X: number,
  prev2Y: number,
): Segment {
  // If both are 'close', result is close
  if (seg1.type === 'close' && seg2.type === 'close') return { type: 'close' }

  // If both are 'move', lerp directly
  if (seg1.type === 'move' && seg2.type === 'move') {
    return { type: 'move', x: lerp(seg1.x, seg2.x, t), y: lerp(seg1.y, seg2.y, t) }
  }

  // If both are 'line', lerp directly
  if (seg1.type === 'line' && seg2.type === 'line') {
    return { type: 'line', x: lerp(seg1.x, seg2.x, t), y: lerp(seg1.y, seg2.y, t) }
  }

  // If both are cubic, lerp all fields
  if (seg1.type === 'cubic' && seg2.type === 'cubic') {
    return {
      type: 'cubic',
      x: lerp(seg1.x, seg2.x, t),
      y: lerp(seg1.y, seg2.y, t),
      cp1x: lerp(seg1.cp1x, seg2.cp1x, t),
      cp1y: lerp(seg1.cp1y, seg2.cp1y, t),
      cp2x: lerp(seg1.cp2x, seg2.cp2x, t),
      cp2y: lerp(seg1.cp2y, seg2.cp2y, t),
    }
  }

  // Types differ — promote both to cubic and interpolate
  const c1 = promoteToCubic(seg1, prev1X, prev1Y)
  const c2 = promoteToCubic(seg2, prev2X, prev2Y)
  return {
    type: 'cubic',
    x: lerp(c1.x, c2.x, t),
    y: lerp(c1.y, c2.y, t),
    cp1x: lerp(c1.cp1x, c2.cp1x, t),
    cp1y: lerp(c1.cp1y, c2.cp1y, t),
    cp2x: lerp(c1.cp2x, c2.cp2x, t),
    cp2y: lerp(c1.cp2y, c2.cp2y, t),
  }
}

// ── Segment subdivision ──

/**
 * Subdivide a segment list by splitting each segment into `divisions` equal parts
 * until the total segment count (excluding 'close') reaches `targetCount`.
 *
 * We use an iterative approach: each round, we split the longest segment.
 */
export function subdivideSegments(segments: Segment[], targetCount: number): Segment[] {
  // Separate close segments from drawable segments
  const drawable: Segment[] = segments.filter((s) => s.type !== 'close')
  const hasClose = segments.some((s) => s.type === 'close')

  while (drawable.length < targetCount) {
    // Find the longest segment (by distance between its endpoint and the previous endpoint)
    let longestIdx = 1 // skip the initial move
    let longestDist = 0
    for (let i = 1; i < drawable.length; i++) {
      const prev = drawable[i - 1]!
      const cur = drawable[i]!
      const ep = segmentEndpoint(cur)
      const pp = segmentEndpoint(prev)
      if (!ep || !pp) continue
      const dist = Math.hypot(ep.x - pp.x, ep.y - pp.y)
      if (dist > longestDist) {
        longestDist = dist
        longestIdx = i
      }
    }

    const seg = drawable[longestIdx]!
    const prev = drawable[longestIdx - 1]!
    const pp = segmentEndpoint(prev) ?? { x: 0, y: 0 }
    const ep = segmentEndpoint(seg) ?? pp

    // Split into two segments at midpoint
    const midX = (pp.x + ep.x) / 2
    const midY = (pp.y + ep.y) / 2

    if (seg.type === 'line') {
      const mid: Segment = { type: 'line', x: midX, y: midY }
      const rest: Segment = { type: 'line', x: ep.x, y: ep.y }
      drawable.splice(longestIdx, 1, mid, rest)
    } else if (seg.type === 'cubic') {
      // De Casteljau split at t=0.5
      const { cp1x, cp1y, cp2x, cp2y, x, y } = seg
      const m1x = (pp.x + cp1x) / 2
      const m1y = (pp.y + cp1y) / 2
      const m2x = (cp1x + cp2x) / 2
      const m2y = (cp1y + cp2y) / 2
      const m3x = (cp2x + x) / 2
      const m3y = (cp2y + y) / 2
      const m12x = (m1x + m2x) / 2
      const m12y = (m1y + m2y) / 2
      const m23x = (m2x + m3x) / 2
      const m23y = (m2y + m3y) / 2
      const mx = (m12x + m23x) / 2
      const my = (m12y + m23y) / 2

      const first: Segment = { type: 'cubic', x: mx, y: my, cp1x: m1x, cp1y: m1y, cp2x: m12x, cp2y: m12y }
      const second: Segment = { type: 'cubic', x, y, cp1x: m23x, cp1y: m23y, cp2x: m3x, cp2y: m3y }
      drawable.splice(longestIdx, 1, first, second)
    } else if (seg.type === 'move') {
      // Can't really split a move; duplicate it as a line
      const mid: Segment = { type: 'line', x: midX, y: midY }
      drawable.splice(longestIdx + 1, 0, mid)
    } else {
      // For quadratic, arc, etc. — convert to line-based split
      const mid: Segment = { type: 'line', x: midX, y: midY }
      const rest: Segment = { type: 'line', x: ep.x, y: ep.y }
      drawable.splice(longestIdx, 1, mid, rest)
    }
  }

  if (hasClose) {
    drawable.push({ type: 'close' })
  }
  return drawable
}

/**
 * Count non-close segments in a segment list.
 */
function drawableCount(segments: Segment[]): number {
  return segments.filter((s) => s.type !== 'close').length
}

// ── Path interpolation ──

export function interpolatePaths(paths1: Path[], paths2: Path[], t: number): Path[] {
  const maxLen = Math.max(paths1.length, paths2.length)
  const result: Path[] = []

  for (let i = 0; i < maxLen; i++) {
    const p1 = paths1[Math.min(i, paths1.length - 1)]!
    const p2 = paths2[Math.min(i, paths2.length - 1)]!

    let segs1 = [...p1.segments]
    let segs2 = [...p2.segments]

    const count1 = drawableCount(segs1)
    const count2 = drawableCount(segs2)

    // Subdivide the shorter path to match segment counts
    if (count1 < count2) {
      segs1 = subdivideSegments(segs1, count2)
    } else if (count2 < count1) {
      segs2 = subdivideSegments(segs2, count1)
    }

    // Now interpolate segment by segment
    const interpolated: Segment[] = []
    let prev1X = 0
    let prev1Y = 0
    let prev2X = 0
    let prev2Y = 0

    const len = Math.max(segs1.length, segs2.length)
    for (let j = 0; j < len; j++) {
      const s1 = segs1[Math.min(j, segs1.length - 1)]!
      const s2 = segs2[Math.min(j, segs2.length - 1)]!

      interpolated.push(interpolateSegment(s1, s2, t, prev1X, prev1Y, prev2X, prev2Y))

      const ep1 = segmentEndpoint(s1)
      if (ep1) {
        prev1X = ep1.x
        prev1Y = ep1.y
      }
      const ep2 = segmentEndpoint(s2)
      if (ep2) {
        prev2X = ep2.x
        prev2Y = ep2.y
      }
    }

    result.push({
      id: uuid(),
      segments: interpolated,
      closed: p1.closed || p2.closed,
      fillRule: p1.fillRule ?? p2.fillRule,
    })
  }

  return result
}

// ── Fill interpolation ──

function interpolateFill(f1: Fill | null, f2: Fill | null, t: number): Fill | null {
  if (!f1 && !f2) return null
  if (!f1) return f2
  if (!f2) return f1

  const color1 = f1.color ?? '#000000'
  const color2 = f2.color ?? '#000000'

  return {
    type: 'solid',
    color: interpolateColor(color1, color2, t),
    opacity: lerp(f1.opacity, f2.opacity, t),
  }
}

// ── Stroke interpolation ──

function interpolateStroke(s1: Stroke | null, s2: Stroke | null, t: number): Stroke | null {
  if (!s1 && !s2) return null
  if (!s1) return s2
  if (!s2) return s1

  return {
    width: lerp(s1.width, s2.width, t),
    color: interpolateColor(s1.color, s2.color, t),
    opacity: lerp(s1.opacity, s2.opacity, t),
    position: t < 0.5 ? s1.position : s2.position,
    linecap: t < 0.5 ? s1.linecap : s2.linecap,
    linejoin: t < 0.5 ? s1.linejoin : s2.linejoin,
    miterLimit: lerp(s1.miterLimit, s2.miterLimit, t),
  }
}

// ── Generate blend ──

export function generateBlend(layer1: VectorLayer, layer2: VectorLayer, config: BlendConfig): VectorLayer[] {
  const intermediates: VectorLayer[] = []

  for (let i = 1; i <= config.steps; i++) {
    let t = i / (config.steps + 1)
    if (config.method === 'smooth') {
      t = smoothEase(t)
    }

    const paths = interpolatePaths(layer1.paths, layer2.paths, t)
    const transform = interpolateTransform(layer1.transform, layer2.transform, t)
    const fill = interpolateFill(layer1.fill, layer2.fill, t)
    const stroke = interpolateStroke(layer1.stroke, layer2.stroke, t)
    const opacity = lerp(layer1.opacity, layer2.opacity, t)

    const intermediate: VectorLayer = {
      id: uuid(),
      name: `Blend ${i}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity,
      blendMode: 'normal',
      transform,
      effects: [],
      paths,
      fill,
      stroke,
    }

    intermediates.push(intermediate)
  }

  return intermediates
}

// ── Create blend group ──

export function createBlendGroup(
  layer1: VectorLayer,
  layer2: VectorLayer,
  intermediates: VectorLayer[],
  _artboardId: string,
): GroupLayer {
  return {
    id: uuid(),
    name: 'Blend Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children: [layer1, ...intermediates, layer2],
  }
}
