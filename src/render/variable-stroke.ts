import type { Path, Stroke, Segment } from '@/types'

// ─── Width presets ────────────────────────────────────────────

/** Preset variable-width profiles. Each entry is [position (0-1), width multiplier]. */
export const WIDTH_PRESETS: Record<string, [number, number][]> = {
  uniform: [
    [0, 1],
    [1, 1],
  ],
  taper: [
    [0, 0],
    [0.2, 1],
    [0.8, 1],
    [1, 0],
  ],
  taperStart: [
    [0, 0],
    [0.3, 1],
    [1, 1],
  ],
  taperEnd: [
    [0, 1],
    [0.7, 1],
    [1, 0],
  ],
  bulge: [
    [0, 0.5],
    [0.5, 1.5],
    [1, 0.5],
  ],
  pressure: [
    [0, 0.3],
    [0.1, 1],
    [0.5, 0.8],
    [0.9, 1.2],
    [1, 0.2],
  ],
}

/** Human-readable labels for width presets. */
export const WIDTH_PRESET_LABELS: Record<string, string> = {
  uniform: 'Uniform',
  taper: 'Taper',
  taperStart: 'Taper Start',
  taperEnd: 'Taper End',
  bulge: 'Bulge',
  pressure: 'Pressure',
}

// ─── Point type used internally ──────────────────────────────

interface Point {
  x: number
  y: number
}

// ─── Path flattening ─────────────────────────────────────────

/** Number of line segments per curve when flattening. */
const FLATTEN_STEPS = 20

/**
 * Flatten a Path (with segments) into a polyline of {x, y} points.
 * Curves are approximated with line segments.
 */
function flattenPath(path: Path): Point[] {
  const points: Point[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  for (const seg of path.segments) {
    switch (seg.type) {
      case 'move':
        cx = seg.x
        cy = seg.y
        startX = cx
        startY = cy
        points.push({ x: cx, y: cy })
        break

      case 'line':
        cx = seg.x
        cy = seg.y
        points.push({ x: cx, y: cy })
        break

      case 'cubic': {
        const x0 = cx,
          y0 = cy
        for (let i = 1; i <= FLATTEN_STEPS; i++) {
          const t = i / FLATTEN_STEPS
          const u = 1 - t
          const x = u * u * u * x0 + 3 * u * u * t * seg.cp1x + 3 * u * t * t * seg.cp2x + t * t * t * seg.x
          const y = u * u * u * y0 + 3 * u * u * t * seg.cp1y + 3 * u * t * t * seg.cp2y + t * t * t * seg.y
          points.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'quadratic': {
        const x0 = cx,
          y0 = cy
        for (let i = 1; i <= FLATTEN_STEPS; i++) {
          const t = i / FLATTEN_STEPS
          const u = 1 - t
          const x = u * u * x0 + 2 * u * t * seg.cpx + t * t * seg.x
          const y = u * u * y0 + 2 * u * t * seg.cpy + t * t * seg.y
          points.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'arc': {
        // Approximate arc with line segments using the SVG arc parametrization.
        // For simplicity, subdivide into FLATTEN_STEPS segments using a Path2D round-trip
        // isn't possible here, so we approximate with an elliptical arc.
        const pts = approximateArc(cx, cy, seg)
        for (const p of pts) {
          points.push(p)
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'close':
        if (points.length > 0) {
          const first = points[0]!
          if (cx !== first.x || cy !== first.y) {
            points.push({ x: startX, y: startY })
          }
        }
        cx = startX
        cy = startY
        break
    }
  }

  return points
}

/**
 * Approximate an SVG arc segment with line segments.
 */
function approximateArc(cx: number, cy: number, seg: Extract<Segment, { type: 'arc' }>): Point[] {
  const points: Point[] = []
  // Simple linear interpolation for arc approximation
  // For a proper SVG arc conversion we'd need endpoint-to-center conversion,
  // but a reasonable approximation is to subdivide the chord.
  const { x: ex, y: ey, rx, ry, rotation, largeArc, sweep } = seg

  // Convert endpoint arc to center parametrization
  const params = endpointToCenter(cx, cy, ex, ey, rx, ry, rotation, largeArc, sweep)
  if (!params) {
    // Degenerate arc — just draw a line
    points.push({ x: ex, y: ey })
    return points
  }

  const { cxc, cyc, theta1, dtheta, rxf, ryf } = params
  const cosRot = Math.cos((rotation * Math.PI) / 180)
  const sinRot = Math.sin((rotation * Math.PI) / 180)

  for (let i = 1; i <= FLATTEN_STEPS; i++) {
    const t = i / FLATTEN_STEPS
    const angle = theta1 + dtheta * t
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const x = cxc + rxf * cosA * cosRot - ryf * sinA * sinRot
    const y = cyc + rxf * cosA * sinRot + ryf * sinA * cosRot
    points.push({ x, y })
  }

  return points
}

/**
 * Convert SVG endpoint arc params to center parametrization.
 */
function endpointToCenter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
): { cxc: number; cyc: number; theta1: number; dtheta: number; rxf: number; ryf: number } | null {
  const phi = (angleDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (x1 - x2) / 2
  const dy2 = (y1 - y2) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  // Ensure radii are large enough
  let rxSq = rx * rx
  let rySq = ry * ry
  const x1pSq = x1p * x1p
  const y1pSq = y1p * y1p
  const lambda = x1pSq / rxSq + y1pSq / rySq
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda)
    rx *= sqrtLambda
    ry *= sqrtLambda
    rxSq = rx * rx
    rySq = ry * ry
  }

  const denom = rxSq * y1pSq + rySq * x1pSq
  if (denom === 0) return null

  let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / denom
  if (sq < 0) sq = 0
  let root = Math.sqrt(sq)
  if (largeArc === sweep) root = -root

  const cxp = (root * rx * y1p) / ry
  const cyp = -(root * ry * x1p) / rx

  const cxc = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cyc = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dtheta = vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)

  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI

  return { cxc, cyc, theta1, dtheta, rxf: rx, ryf: ry }
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1
  const dot = ux * vx + uy * vy
  const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy)
  if (len === 0) return 0
  let cos = dot / len
  if (cos < -1) cos = -1
  if (cos > 1) cos = 1
  return sign * Math.acos(cos)
}

// ─── Arc-length & width interpolation ────────────────────────

/**
 * Compute cumulative arc lengths for a polyline.
 * Returns an array of the same length as `points`, where result[0] = 0.
 */
function cumulativeArcLengths(points: Point[]): number[] {
  const lengths = new Array<number>(points.length)
  lengths[0] = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x
    const dy = points[i]!.y - points[i - 1]!.y
    lengths[i] = lengths[i - 1]! + Math.sqrt(dx * dx + dy * dy)
  }
  return lengths
}

/**
 * Interpolate the width multiplier at a given position (0-1) along the path
 * using the widthProfile control points.
 */
function interpolateWidth(profile: [number, number][], t: number): number {
  if (profile.length === 0) return 1
  if (profile.length === 1) return profile[0]![1]

  // Clamp t
  if (t <= profile[0]![0]) return profile[0]![1]
  if (t >= profile[profile.length - 1]![0]) return profile[profile.length - 1]![1]

  // Find surrounding control points
  for (let i = 1; i < profile.length; i++) {
    const [pos0, w0] = profile[i - 1]!
    const [pos1, w1] = profile[i]!
    if (t >= pos0 && t <= pos1) {
      const range = pos1 - pos0
      if (range === 0) return w0
      const localT = (t - pos0) / range
      // Smooth interpolation (smoothstep)
      const s = localT * localT * (3 - 2 * localT)
      return w0 + (w1 - w0) * s
    }
  }

  return 1
}

// ─── Normal computation ──────────────────────────────────────

/**
 * Compute perpendicular normals at each point along a polyline.
 * Uses averaged normals from adjacent segments for smooth results.
 */
function computeNormals(points: Point[]): Point[] {
  const normals = new Array<Point>(points.length)

  if (points.length < 2) {
    for (let i = 0; i < points.length; i++) normals[i] = { x: 0, y: -1 }
    return normals
  }

  for (let i = 0; i < points.length; i++) {
    let nx = 0
    let ny = 0

    if (i === 0) {
      // First point: use direction to next point
      const dx = points[1]!.x - points[0]!.x
      const dy = points[1]!.y - points[0]!.y
      nx = -dy
      ny = dx
    } else if (i === points.length - 1) {
      // Last point: use direction from previous point
      const dx = points[i]!.x - points[i - 1]!.x
      const dy = points[i]!.y - points[i - 1]!.y
      nx = -dy
      ny = dx
    } else {
      // Interior point: average the normals of the two adjacent segments
      const dx1 = points[i]!.x - points[i - 1]!.x
      const dy1 = points[i]!.y - points[i - 1]!.y
      const dx2 = points[i + 1]!.x - points[i]!.x
      const dy2 = points[i + 1]!.y - points[i]!.y
      nx = -(dy1 + dy2)
      ny = dx1 + dx2
    }

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny)
    if (len > 0) {
      normals[i] = { x: nx / len, y: ny / len }
    } else {
      normals[i] = { x: 0, y: -1 }
    }
  }

  return normals
}

// ─── Main render function ────────────────────────────────────

/**
 * Render a variable-width stroke for a vector path.
 *
 * If the stroke has no widthProfile (or it's empty), falls back to a normal ctx.stroke().
 * Otherwise, builds offset curves and fills the area between them.
 */
export function renderVariableStroke(ctx: CanvasRenderingContext2D, path: Path, stroke: Stroke, path2d: Path2D): void {
  // Fall back to normal stroke if no variable width
  if (!stroke.widthProfile || stroke.widthProfile.length === 0) {
    ctx.lineWidth = stroke.width
    ctx.stroke(path2d)
    return
  }

  const profile = stroke.widthProfile
  const baseWidth = stroke.width

  // 1. Flatten the path to a polyline
  const points = flattenPath(path)
  if (points.length < 2) {
    // Not enough points to form a stroke
    ctx.lineWidth = stroke.width
    ctx.stroke(path2d)
    return
  }

  // 2. Compute cumulative arc lengths
  const arcLengths = cumulativeArcLengths(points)
  const totalLength = arcLengths[arcLengths.length - 1]!
  if (totalLength === 0) {
    ctx.lineWidth = stroke.width
    ctx.stroke(path2d)
    return
  }

  // 3. Compute normals at each point
  const normals = computeNormals(points)

  // 4. Build offset curves (left and right)
  const leftCurve: Point[] = new Array(points.length)
  const rightCurve: Point[] = new Array(points.length)

  for (let i = 0; i < points.length; i++) {
    const t = arcLengths[i]! / totalLength
    const widthMultiplier = interpolateWidth(profile, t)
    const halfWidth = (baseWidth * widthMultiplier) / 2

    const p = points[i]!
    const n = normals[i]!

    leftCurve[i] = {
      x: p.x + n.x * halfWidth,
      y: p.y + n.y * halfWidth,
    }
    rightCurve[i] = {
      x: p.x - n.x * halfWidth,
      y: p.y - n.y * halfWidth,
    }
  }

  // 5. Build a closed path: left curve forward, then right curve backward
  ctx.beginPath()
  ctx.moveTo(leftCurve[0]!.x, leftCurve[0]!.y)

  for (let i = 1; i < leftCurve.length; i++) {
    ctx.lineTo(leftCurve[i]!.x, leftCurve[i]!.y)
  }

  // Connect to the end of the right curve and trace it backwards
  for (let i = rightCurve.length - 1; i >= 0; i--) {
    ctx.lineTo(rightCurve[i]!.x, rightCurve[i]!.y)
  }

  ctx.closePath()

  // 6. Fill the stroke shape using the stroke color
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
}

/**
 * Identify which width preset key matches a given widthProfile, or return null.
 */
export function matchWidthPreset(profile?: [number, number][]): string | null {
  if (!profile || profile.length === 0) return null

  for (const [key, preset] of Object.entries(WIDTH_PRESETS)) {
    if (preset.length !== profile.length) continue
    let match = true
    for (let i = 0; i < preset.length; i++) {
      if (preset[i]![0] !== profile[i]![0] || preset[i]![1] !== profile[i]![1]) {
        match = false
        break
      }
    }
    if (match) return key
  }

  return null
}
