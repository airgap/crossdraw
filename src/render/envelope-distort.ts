import type { Segment, Path } from '@/types'

// ── Warp Presets ───────────────────────────────────────────────

export type WarpPreset =
  | 'arc'
  | 'arch'
  | 'bulge'
  | 'flag'
  | 'wave'
  | 'fish'
  | 'rise'
  | 'squeeze'
  | 'twist'
  | 'none'

export interface EnvelopeParams {
  preset: WarpPreset
  /** Primary bend amount (-1 to 1) */
  bend: number
  /** Horizontal distortion (-1 to 1) */
  horizontalDistortion: number
  /** Vertical distortion (-1 to 1) */
  verticalDistortion: number
}

export interface Bounds {
  minX: number
  minY: number
  width: number
  height: number
}

// ── Core warp function ─────────────────────────────────────────

/**
 * Transform a single point through the envelope distortion.
 * Coordinates are in local path space; bounds define the bounding box
 * over which the distortion is applied.
 */
export function warpPoint(
  x: number,
  y: number,
  bounds: Bounds,
  params: EnvelopeParams,
): { x: number; y: number } {
  if (params.preset === 'none') return { x, y }

  const { minX, minY, width, height } = bounds
  if (width === 0 || height === 0) return { x, y }

  // Normalize to 0-1 within the bounding box
  const nx = (x - minX) / width
  const ny = (y - minY) / height

  // Apply preset distortion in normalized space
  const { dx, dy } = applyPreset(nx, ny, params)

  // Apply horizontal / vertical distortion
  const hdx = params.horizontalDistortion * (ny - 0.5) * width
  const vdy = params.verticalDistortion * (nx - 0.5) * height

  return {
    x: x + dx + hdx,
    y: y + dy + vdy,
  }
}

// ── Preset implementations ─────────────────────────────────────

function applyPreset(
  nx: number,
  ny: number,
  params: EnvelopeParams,
): { dx: number; dy: number } {
  const { preset, bend } = params
  const strength = bend

  switch (preset) {
    case 'arc':
      return arcPreset(nx, ny, strength)
    case 'arch':
      return archPreset(nx, ny, strength)
    case 'bulge':
      return bulgePreset(nx, ny, strength)
    case 'flag':
      return flagPreset(nx, ny, strength)
    case 'wave':
      return wavePreset(nx, ny, strength)
    case 'fish':
      return fishPreset(nx, ny, strength)
    case 'rise':
      return risePreset(nx, ny, strength)
    case 'squeeze':
      return squeezePreset(nx, ny, strength)
    case 'twist':
      return twistPreset(nx, ny, strength)
    case 'none':
      return { dx: 0, dy: 0 }
  }
}

/**
 * Arc: circular bend along horizontal axis.
 * Points near the center are pushed up/down based on bend.
 */
function arcPreset(
  nx: number,
  _ny: number,
  strength: number,
): { dx: number; dy: number } {
  // Parabolic arc: maximum displacement at center (nx=0.5), zero at edges
  const factor = 4 * nx * (1 - nx)
  return { dx: 0, dy: -strength * factor * 50 }
}

/**
 * Arch: parabolic arch — similar to arc but also affects x.
 * Creates an arch shape that curves the content.
 */
function archPreset(
  nx: number,
  ny: number,
  strength: number,
): { dx: number; dy: number } {
  // Parabolic factor from x position
  const factor = 4 * nx * (1 - nx)
  // Y displacement is strongest at top, tapers at bottom
  const yFactor = 1 - ny
  return {
    dx: 0,
    dy: -strength * factor * yFactor * 80,
  }
}

/**
 * Bulge: pinch/expand from center.
 * Points are pushed away from (or toward) the center.
 */
function bulgePreset(
  nx: number,
  ny: number,
  strength: number,
): { dx: number; dy: number } {
  const cx = nx - 0.5
  const cy = ny - 0.5
  const dist = Math.sqrt(cx * cx + cy * cy)
  // Maximum radius is ~0.707 (corner to center distance in normalized space)
  const maxDist = Math.SQRT1_2
  const factor = 1 - Math.min(dist / maxDist, 1)
  return {
    dx: cx * strength * factor * 60,
    dy: cy * strength * factor * 60,
  }
}

/**
 * Flag: sinusoidal wave — single period sine wave along x.
 */
function flagPreset(
  nx: number,
  _ny: number,
  strength: number,
): { dx: number; dy: number } {
  const dy = strength * Math.sin(nx * Math.PI * 2) * 30
  return { dx: 0, dy }
}

/**
 * Wave: multi-period sinusoidal wave.
 */
function wavePreset(
  nx: number,
  _ny: number,
  strength: number,
): { dx: number; dy: number } {
  const dy = strength * Math.sin(nx * Math.PI * 4) * 25
  const dx = strength * Math.sin(nx * Math.PI * 3) * 10
  return { dx, dy }
}

/**
 * Fish: fisheye lens distortion — radial expansion from center.
 */
function fishPreset(
  nx: number,
  ny: number,
  strength: number,
): { dx: number; dy: number } {
  const cx = nx - 0.5
  const cy = ny - 0.5
  const r = Math.sqrt(cx * cx + cy * cy)
  if (r === 0) return { dx: 0, dy: 0 }
  const maxR = Math.SQRT1_2
  const normR = r / maxR
  // Fisheye: remap radius with a power curve
  const power = 1 + strength * 0.8
  const newR = Math.pow(normR, power) * maxR
  const scale = r > 0 ? newR / r : 1
  return {
    dx: (cx * scale - cx) * 100,
    dy: (cy * scale - cy) * 100,
  }
}

/**
 * Rise: vertical skew increasing left-to-right.
 */
function risePreset(
  nx: number,
  _ny: number,
  strength: number,
): { dx: number; dy: number } {
  // Linear ramp: left side stays, right side rises
  return {
    dx: 0,
    dy: -strength * nx * 60,
  }
}

/**
 * Squeeze: horizontal compression at center.
 */
function squeezePreset(
  nx: number,
  ny: number,
  strength: number,
): { dx: number; dy: number } {
  // Squeeze horizontally, with maximum effect at the vertical center
  const yCenterFactor = 4 * ny * (1 - ny)
  const xDisplace = (nx - 0.5) * strength * yCenterFactor * 40
  return {
    dx: -xDisplace,
    dy: 0,
  }
}

/**
 * Twist: rotational distortion from center.
 */
function twistPreset(
  nx: number,
  ny: number,
  strength: number,
): { dx: number; dy: number } {
  const cx = nx - 0.5
  const cy = ny - 0.5
  const dist = Math.sqrt(cx * cx + cy * cy)
  // Twist angle proportional to distance from center
  const angle = dist * strength * Math.PI
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const newCx = cx * cosA - cy * sinA
  const newCy = cx * sinA + cy * cosA
  return {
    dx: (newCx - cx) * 100,
    dy: (newCy - cy) * 100,
  }
}

// ── Segment-level transform ────────────────────────────────────

/**
 * Compute the bounding box of an array of segments.
 */
export function computeSegmentBounds(segments: Segment[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const seg of segments) {
    if ('x' in seg) {
      if (seg.x < minX) minX = seg.x
      if (seg.x > maxX) maxX = seg.x
      if (seg.y < minY) minY = seg.y
      if (seg.y > maxY) maxY = seg.y
    }
    // Also consider control points for tighter bounds
    if (seg.type === 'cubic') {
      if (seg.cp1x < minX) minX = seg.cp1x
      if (seg.cp1x > maxX) maxX = seg.cp1x
      if (seg.cp1y < minY) minY = seg.cp1y
      if (seg.cp1y > maxY) maxY = seg.cp1y
      if (seg.cp2x < minX) minX = seg.cp2x
      if (seg.cp2x > maxX) maxX = seg.cp2x
      if (seg.cp2y < minY) minY = seg.cp2y
      if (seg.cp2y > maxY) maxY = seg.cp2y
    }
    if (seg.type === 'quadratic') {
      if (seg.cpx < minX) minX = seg.cpx
      if (seg.cpx > maxX) maxX = seg.cpx
      if (seg.cpy < minY) minY = seg.cpy
      if (seg.cpy > maxY) maxY = seg.cpy
    }
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, width: 0, height: 0 }
  }

  return {
    minX,
    minY,
    width: maxX - minX || 1,
    height: maxY - minY || 1,
  }
}

/**
 * Transform all segments through the envelope distortion.
 * Control points for cubic and quadratic curves are also warped.
 */
export function warpSegments(
  segments: Segment[],
  bounds: Bounds,
  params: EnvelopeParams,
): Segment[] {
  if (params.preset === 'none') return segments

  return segments.map((seg): Segment => {
    switch (seg.type) {
      case 'move': {
        const p = warpPoint(seg.x, seg.y, bounds, params)
        return { type: 'move', x: p.x, y: p.y }
      }
      case 'line': {
        const p = warpPoint(seg.x, seg.y, bounds, params)
        return { type: 'line', x: p.x, y: p.y }
      }
      case 'cubic': {
        const p = warpPoint(seg.x, seg.y, bounds, params)
        const cp1 = warpPoint(seg.cp1x, seg.cp1y, bounds, params)
        const cp2 = warpPoint(seg.cp2x, seg.cp2y, bounds, params)
        return {
          type: 'cubic',
          x: p.x,
          y: p.y,
          cp1x: cp1.x,
          cp1y: cp1.y,
          cp2x: cp2.x,
          cp2y: cp2.y,
        }
      }
      case 'quadratic': {
        const p = warpPoint(seg.x, seg.y, bounds, params)
        const cp = warpPoint(seg.cpx, seg.cpy, bounds, params)
        return {
          type: 'quadratic',
          x: p.x,
          y: p.y,
          cpx: cp.x,
          cpy: cp.y,
        }
      }
      case 'arc': {
        const p = warpPoint(seg.x, seg.y, bounds, params)
        return {
          type: 'arc',
          x: p.x,
          y: p.y,
          rx: seg.rx,
          ry: seg.ry,
          rotation: seg.rotation,
          largeArc: seg.largeArc,
          sweep: seg.sweep,
        }
      }
      case 'close':
        return { type: 'close' }
    }
  })
}

/**
 * Transform all paths through the envelope distortion.
 * Computes a unified bounding box across all paths first.
 */
export function warpPaths(paths: Path[], params: EnvelopeParams): Path[] {
  if (params.preset === 'none') return paths

  // Compute unified bounds across all paths
  const allSegments = paths.flatMap((p) => p.segments)
  const bounds = computeSegmentBounds(allSegments)

  return paths.map((path) => ({
    ...path,
    segments: warpSegments(path.segments, bounds, params),
  }))
}

export const WARP_PRESETS: WarpPreset[] = [
  'none',
  'arc',
  'arch',
  'bulge',
  'flag',
  'wave',
  'fish',
  'rise',
  'squeeze',
  'twist',
]
