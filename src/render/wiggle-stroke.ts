import type { Segment } from '@/types'

// ─── Simple 1D noise (gradient noise, no external deps) ─────

/**
 * Permutation table for noise, seeded deterministically.
 * We use a simple LCG to shuffle 0..255 based on the seed.
 */
function buildPermutation(seed: number): Uint8Array {
  const perm = new Uint8Array(512)
  // Initialize 0..255
  for (let i = 0; i < 256; i++) perm[i] = i
  // Fisher-Yates shuffle with seed-derived LCG
  let s = (seed | 0) & 0x7fffffff
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    const j = s % (i + 1)
    const tmp = perm[i]!
    perm[i] = perm[j]!
    perm[j] = tmp
  }
  // Mirror for overflow-safe indexing
  for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]!
  return perm
}

/** Fade curve for smooth interpolation: 6t^5 - 15t^4 + 10t^3. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * 1D gradient noise in [-1, 1].
 * @param x - input coordinate
 * @param perm - precomputed permutation table
 */
export function noise1D(x: number, perm: Uint8Array): number {
  const xi = Math.floor(x) & 255
  const xf = x - Math.floor(x)
  const u = fade(xf)
  // Gradients: use high bit of perm entry to choose +1 or -1
  const g0 = (perm[xi]! & 1) === 0 ? xf : -xf
  const g1 = (perm[xi + 1]! & 1) === 0 ? xf - 1 : -(xf - 1)
  return lerp(g0, g1, u)
}

// ─── Point type ──────────────────────────────────────────────

interface Point {
  x: number
  y: number
}

// ─── Path sampling ───────────────────────────────────────────

const SAMPLE_INTERVAL = 2 // pixels between samples

/**
 * Sample a segment list into evenly-spaced points along the path.
 * Returns the polyline and cumulative arc-length at each point.
 */
export function sampleSegments(segments: Segment[], interval: number = SAMPLE_INTERVAL): { points: Point[]; lengths: number[] } {
  // First flatten segments to a raw polyline
  const raw: Point[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        cx = seg.x
        cy = seg.y
        startX = cx
        startY = cy
        raw.push({ x: cx, y: cy })
        break

      case 'line':
        raw.push({ x: seg.x, y: seg.y })
        cx = seg.x
        cy = seg.y
        break

      case 'cubic': {
        const x0 = cx
        const y0 = cy
        const steps = 20
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const u = 1 - t
          const x = u * u * u * x0 + 3 * u * u * t * seg.cp1x + 3 * u * t * t * seg.cp2x + t * t * t * seg.x
          const y = u * u * u * y0 + 3 * u * u * t * seg.cp1y + 3 * u * t * t * seg.cp2y + t * t * t * seg.y
          raw.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'quadratic': {
        const x0 = cx
        const y0 = cy
        const steps = 20
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const u = 1 - t
          const x = u * u * x0 + 2 * u * t * seg.cpx + t * t * seg.x
          const y = u * u * y0 + 2 * u * t * seg.cpy + t * t * seg.y
          raw.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'close':
        if (raw.length > 0 && (cx !== startX || cy !== startY)) {
          raw.push({ x: startX, y: startY })
        }
        cx = startX
        cy = startY
        break

      case 'arc': {
        // Approximate arc with line segments
        const steps = 20
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const x = cx + (seg.x - cx) * t
          const y = cy + (seg.y - cy) * t
          raw.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }
    }
  }

  if (raw.length < 2) return { points: raw, lengths: raw.map(() => 0) }

  // Compute cumulative arc lengths of raw polyline
  const rawLengths: number[] = [0]
  for (let i = 1; i < raw.length; i++) {
    const dx = raw[i]!.x - raw[i - 1]!.x
    const dy = raw[i]!.y - raw[i - 1]!.y
    rawLengths.push(rawLengths[i - 1]! + Math.sqrt(dx * dx + dy * dy))
  }
  const totalLength = rawLengths[rawLengths.length - 1]!
  if (totalLength === 0) return { points: raw, lengths: rawLengths }

  // Resample at regular intervals
  const numSamples = Math.max(2, Math.ceil(totalLength / interval) + 1)
  const points: Point[] = []
  const lengths: number[] = []
  let rawIdx = 0

  for (let i = 0; i < numSamples; i++) {
    const targetLen = (i / (numSamples - 1)) * totalLength
    // Advance rawIdx to find the segment containing targetLen
    while (rawIdx < raw.length - 2 && rawLengths[rawIdx + 1]! < targetLen) {
      rawIdx++
    }
    const segStart = rawLengths[rawIdx]!
    const segEnd = rawLengths[rawIdx + 1]!
    const segLen = segEnd - segStart
    const t = segLen > 0 ? (targetLen - segStart) / segLen : 0
    const p0 = raw[rawIdx]!
    const p1 = raw[rawIdx + 1]!
    points.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    })
    lengths.push(targetLen)
  }

  return { points, lengths }
}

// ─── Wiggle stroke params ────────────────────────────────────

export interface WiggleStrokeParams {
  amplitude: number
  frequency: number
  seed: number
  taperStart: number
  taperEnd: number
}

// ─── Taper function ──────────────────────────────────────────

/**
 * Compute the taper multiplier at position t (0..1) along the path.
 * taperStart/taperEnd are 0..1 representing the fraction of the path
 * over which amplitude ramps from 0 to full (or full to 0).
 */
export function taperMultiplier(t: number, taperStart: number, taperEnd: number): number {
  let m = 1
  if (taperStart > 0 && t < taperStart) {
    m *= t / taperStart
  }
  if (taperEnd > 0 && t > 1 - taperEnd) {
    m *= (1 - t) / taperEnd
  }
  return Math.max(0, Math.min(1, m))
}

// ─── Main render function ────────────────────────────────────

/**
 * Render a wiggle/hand-drawn stroke along the given segments.
 *
 * Algorithm:
 * 1. Sample the path into evenly-spaced points.
 * 2. At each point, compute the perpendicular (normal) direction.
 * 3. Displace each point perpendicular to the path using seeded 1D noise,
 *    scaled by amplitude and tapered at start/end.
 * 4. Draw the displaced polyline as a Canvas stroke.
 */
export function renderWiggleStroke(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  strokeWidth: number,
  params: WiggleStrokeParams,
): void {
  const { amplitude, frequency, seed, taperStart, taperEnd } = params

  const { points, lengths } = sampleSegments(segments)
  if (points.length < 2) return

  const totalLength = lengths[lengths.length - 1]!
  if (totalLength === 0) return

  const perm = buildPermutation(seed)

  // Build displaced polyline
  ctx.beginPath()

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const t = lengths[i]! / totalLength

    // Compute normal (perpendicular to path direction)
    let nx: number
    let ny: number
    if (i === 0) {
      const dx = points[1]!.x - p.x
      const dy = points[1]!.y - p.y
      const len = Math.sqrt(dx * dx + dy * dy)
      nx = len > 0 ? -dy / len : 0
      ny = len > 0 ? dx / len : -1
    } else if (i === points.length - 1) {
      const dx = p.x - points[i - 1]!.x
      const dy = p.y - points[i - 1]!.y
      const len = Math.sqrt(dx * dx + dy * dy)
      nx = len > 0 ? -dy / len : 0
      ny = len > 0 ? dx / len : -1
    } else {
      const dx1 = p.x - points[i - 1]!.x
      const dy1 = p.y - points[i - 1]!.y
      const dx2 = points[i + 1]!.x - p.x
      const dy2 = points[i + 1]!.y - p.y
      nx = -(dy1 + dy2)
      ny = dx1 + dx2
      const len = Math.sqrt(nx * nx + ny * ny)
      if (len > 0) {
        nx /= len
        ny /= len
      } else {
        nx = 0
        ny = -1
      }
    }

    // Noise displacement
    const noiseInput = t * frequency
    const noiseVal = noise1D(noiseInput, perm) // in [-1, 1]
    const taper = taperMultiplier(t, taperStart, taperEnd)
    const displacement = noiseVal * amplitude * taper

    const x = p.x + nx * displacement
    const y = p.y + ny * displacement

    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.lineWidth = strokeWidth
  ctx.stroke()
}
