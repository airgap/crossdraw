import type { Segment } from '@/types'

/**
 * Text-on-path support.
 * Flows text characters along a vector path with configurable offset.
 */

export interface TextOnPathConfig {
  /** ID of the path layer to flow text along */
  pathReference: string
  /** Position along the path (0-1) */
  pathOffset: number
  /** Alignment relative to the path */
  pathAlign: 'left' | 'center' | 'right'
  /** Flip text to other side of path */
  flipSide: boolean
  /** Perpendicular offset from path (positive = above) */
  perpendicularOffset: number
}

/**
 * Calculate a point and tangent angle on a polyline at a given distance.
 */
export function getPointOnPolyline(
  points: Array<{ x: number; y: number }>,
  distance: number,
): { x: number; y: number; angle: number } | null {
  if (points.length < 2) return null

  let accumulated = 0

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!
    const p1 = points[i + 1]!
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const segLen = Math.sqrt(dx * dx + dy * dy)

    if (accumulated + segLen >= distance) {
      const t = (distance - accumulated) / segLen
      const angle = Math.atan2(dy, dx)
      return {
        x: p0.x + dx * t,
        y: p0.y + dy * t,
        angle,
      }
    }
    accumulated += segLen
  }

  // Past end — return last point
  const last = points[points.length - 1]!
  const prev = points[points.length - 2]!
  return {
    x: last.x,
    y: last.y,
    angle: Math.atan2(last.y - prev.y, last.x - prev.x),
  }
}

/**
 * Calculate the total length of a polyline.
 */
export function polylineLength(points: Array<{ x: number; y: number }>): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1]!.x - points[i]!.x
    const dy = points[i + 1]!.y - points[i]!.y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

/**
 * Flatten segments into a polyline (series of points) for text placement.
 * Cubic/quadratic beziers are approximated with line segments.
 */
export function flattenSegments(segments: Segment[], resolution: number = 10): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let cx = 0, cy = 0

  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        cx = seg.x; cy = seg.y
        points.push({ x: cx, y: cy })
        break
      case 'line':
        cx = seg.x; cy = seg.y
        points.push({ x: cx, y: cy })
        break
      case 'cubic':
        for (let t = 1; t <= resolution; t++) {
          const u = t / resolution
          const u2 = u * u
          const u3 = u2 * u
          const inv = 1 - u
          const inv2 = inv * inv
          const inv3 = inv2 * inv
          const x = inv3 * cx + 3 * inv2 * u * seg.cp1x + 3 * inv * u2 * seg.cp2x + u3 * seg.x
          const y = inv3 * cy + 3 * inv2 * u * seg.cp1y + 3 * inv * u2 * seg.cp2y + u3 * seg.y
          points.push({ x, y })
        }
        cx = seg.x; cy = seg.y
        break
      case 'quadratic':
        for (let t = 1; t <= resolution; t++) {
          const u = t / resolution
          const inv = 1 - u
          const x = inv * inv * cx + 2 * inv * u * seg.cpx + u * u * seg.x
          const y = inv * inv * cy + 2 * inv * u * seg.cpy + u * u * seg.y
          points.push({ x, y })
        }
        cx = seg.x; cy = seg.y
        break
      case 'close':
        if (points.length > 0) {
          points.push({ x: points[0]!.x, y: points[0]!.y })
          cx = points[0]!.x; cy = points[0]!.y
        }
        break
    }
  }

  return points
}

/**
 * Calculate character positions along a path.
 */
export function layoutTextOnPath(
  text: string,
  segments: Segment[],
  config: TextOnPathConfig,
  fontSize: number,
): Array<{ char: string; x: number; y: number; angle: number }> {
  const points = flattenSegments(segments)
  const totalLen = polylineLength(points)
  if (totalLen === 0 || points.length < 2) return []

  // Approximate character width
  const charWidth = fontSize * 0.6
  const textWidth = text.length * charWidth

  // Calculate start position based on alignment
  let startDist: number
  switch (config.pathAlign) {
    case 'left':
      startDist = config.pathOffset * totalLen
      break
    case 'center':
      startDist = config.pathOffset * totalLen - textWidth / 2
      break
    case 'right':
      startDist = config.pathOffset * totalLen - textWidth
      break
  }

  const result: Array<{ char: string; x: number; y: number; angle: number }> = []
  const perpOffset = config.flipSide ? -config.perpendicularOffset : config.perpendicularOffset

  for (let i = 0; i < text.length; i++) {
    const dist = startDist + i * charWidth + charWidth / 2
    const pt = getPointOnPolyline(points, dist)
    if (!pt) continue

    // Apply perpendicular offset
    const nx = -Math.sin(pt.angle) * perpOffset
    const ny = Math.cos(pt.angle) * perpOffset

    result.push({
      char: text[i]!,
      x: pt.x + nx,
      y: pt.y + ny,
      angle: config.flipSide ? pt.angle + Math.PI : pt.angle,
    })
  }

  return result
}
