import type { TextWarpPreset, TextWarpConfig } from '@/types'

// ── Types ──────────────────────────────────────────────────────

/** A point in 2D space. */
export interface WarpPoint {
  x: number
  y: number
}

/** Bounding box for the text area. */
export interface TextBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A warp function that maps a normalized (x,y) through distortion. */
type WarpFunction = (
  nx: number,
  ny: number,
  bend: number,
  distortH: number,
  distortV: number,
) => { dx: number; dy: number }

// ── Preset list ────────────────────────────────────────────────

/** Ordered list of all text warp presets. */
export const TEXT_WARP_PRESET_LIST: TextWarpPreset[] = [
  'none',
  'arc',
  'arc-lower',
  'arc-upper',
  'arch',
  'bulge',
  'shell-lower',
  'shell-upper',
  'flag',
  'wave',
  'fish',
  'rise',
  'fisheye',
  'inflate',
  'squeeze',
  'twist',
]

/** Get the list of available text warp presets. */
export function getTextWarpPresets(): TextWarpPreset[] {
  return TEXT_WARP_PRESET_LIST
}

// ── Default config ─────────────────────────────────────────────

/** Create a default (no-op) text warp config. */
export function defaultTextWarpConfig(): TextWarpConfig {
  return {
    preset: 'none',
    bend: 0,
    distortH: 0,
    distortV: 0,
  }
}

// ── Preset implementations ─────────────────────────────────────
// Each returns (dx, dy) displacement in normalized coords (-1 to 1 space).
// Bend is in -100..100 range, normalized internally to -1..1 for computation.

function noneWarp(): { dx: number; dy: number } {
  return { dx: 0, dy: 0 }
}

function arcWarp(nx: number, _ny: number, bend: number): { dx: number; dy: number } {
  // Parabolic arc: maximum at center, zero at edges
  const b = bend / 100
  const factor = 4 * nx * (1 - nx)
  return { dx: 0, dy: -b * factor * 0.5 }
}

function arcLowerWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Arc affecting only the lower half (ny > 0.5)
  const b = bend / 100
  const factor = 4 * nx * (1 - nx)
  const yFactor = Math.max(0, (ny - 0.5) * 2)
  return { dx: 0, dy: -b * factor * yFactor * 0.5 }
}

function arcUpperWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Arc affecting only the upper half (ny < 0.5)
  const b = bend / 100
  const factor = 4 * nx * (1 - nx)
  const yFactor = Math.max(0, (0.5 - ny) * 2)
  return { dx: 0, dy: -b * factor * yFactor * 0.5 }
}

function archWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Parabolic arch: x-based parabola, stronger at top
  const b = bend / 100
  const factor = 4 * nx * (1 - nx)
  const yFactor = 1 - ny
  return { dx: 0, dy: -b * factor * yFactor * 0.6 }
}

function bulgeWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Expand/contract from center
  const b = bend / 100
  const cx = nx - 0.5
  const cy = ny - 0.5
  const dist = Math.sqrt(cx * cx + cy * cy)
  const maxDist = Math.SQRT1_2
  const factor = 1 - Math.min(dist / maxDist, 1)
  return {
    dx: cx * b * factor * 0.6,
    dy: cy * b * factor * 0.6,
  }
}

function shellLowerWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Shell curve affecting bottom — concave at bottom
  const b = bend / 100
  const xFactor = 4 * nx * (1 - nx)
  const yFactor = ny * ny // stronger toward bottom
  return { dx: 0, dy: b * xFactor * yFactor * 0.5 }
}

function shellUpperWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Shell curve affecting top — concave at top
  const b = bend / 100
  const xFactor = 4 * nx * (1 - nx)
  const yFactor = (1 - ny) * (1 - ny) // stronger toward top
  return { dx: 0, dy: -b * xFactor * yFactor * 0.5 }
}

function flagWarp(nx: number, _ny: number, bend: number): { dx: number; dy: number } {
  // Progressive sinusoidal wave: amplitude increases with x
  const b = bend / 100
  const amplitude = nx // grows left-to-right
  const dy = b * amplitude * Math.sin(nx * Math.PI * 2) * 0.4
  return { dx: 0, dy }
}

function waveWarp(nx: number, _ny: number, bend: number): { dx: number; dy: number } {
  // Multi-period sine wave
  const b = bend / 100
  const dy = b * Math.sin(nx * Math.PI * 4) * 0.3
  const dx = b * Math.sin(nx * Math.PI * 3) * 0.1
  return { dx, dy }
}

function fishWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Fisheye lens — radial power curve
  const b = bend / 100
  const cx = nx - 0.5
  const cy = ny - 0.5
  const r = Math.sqrt(cx * cx + cy * cy)
  if (r === 0) return { dx: 0, dy: 0 }
  const maxR = Math.SQRT1_2
  const normR = r / maxR
  const power = 1 + b * 0.8
  const newR = Math.pow(normR, power) * maxR
  const scale = newR / r
  return {
    dx: cx * scale - cx,
    dy: cy * scale - cy,
  }
}

function riseWarp(nx: number, _ny: number, bend: number): { dx: number; dy: number } {
  // Linear vertical skew increasing left-to-right
  const b = bend / 100
  return { dx: 0, dy: -b * nx * 0.5 }
}

function fisheyeWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Barrel/pincushion distortion
  const b = bend / 100
  const cx = nx - 0.5
  const cy = ny - 0.5
  const r2 = cx * cx + cy * cy
  const factor = 1 + b * r2 * 4
  return {
    dx: cx * factor - cx,
    dy: cy * factor - cy,
  }
}

function inflateWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Push outward from center (opposite of squeeze)
  const b = bend / 100
  const cx = nx - 0.5
  const cy = ny - 0.5
  const dist = Math.sqrt(cx * cx + cy * cy)
  const maxDist = Math.SQRT1_2
  const factor = Math.max(0, 1 - dist / maxDist)
  return {
    dx: cx * b * factor * 0.5,
    dy: cy * b * factor * 0.5,
  }
}

function squeezeWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Horizontal compression at vertical center
  const b = bend / 100
  const yCenterFactor = 4 * ny * (1 - ny)
  const xDisplace = (nx - 0.5) * b * yCenterFactor * 0.4
  return { dx: -xDisplace, dy: 0 }
}

function twistWarp(nx: number, ny: number, bend: number): { dx: number; dy: number } {
  // Rotational distortion from center
  const b = bend / 100
  const cx = nx - 0.5
  const cy = ny - 0.5
  const dist = Math.sqrt(cx * cx + cy * cy)
  const angle = dist * b * Math.PI
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const newCx = cx * cosA - cy * sinA
  const newCy = cx * sinA + cy * cosA
  return {
    dx: newCx - cx,
    dy: newCy - cy,
  }
}

// ── Preset dispatch map ────────────────────────────────────────

const WARP_FUNCTIONS: Record<TextWarpPreset, WarpFunction> = {
  none: noneWarp,
  arc: arcWarp,
  'arc-lower': arcLowerWarp,
  'arc-upper': arcUpperWarp,
  arch: archWarp,
  bulge: bulgeWarp,
  'shell-lower': shellLowerWarp,
  'shell-upper': shellUpperWarp,
  flag: flagWarp,
  wave: waveWarp,
  fish: fishWarp,
  rise: riseWarp,
  fisheye: fisheyeWarp,
  inflate: inflateWarp,
  squeeze: squeezeWarp,
  twist: twistWarp,
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Create a mapping function that warps (x, y) coordinates based on the given
 * text warp configuration and text bounds.
 *
 * The returned function takes absolute coordinates (within the text bounds)
 * and returns warped absolute coordinates.
 *
 * @param textBounds - Bounding box of the text area
 * @param config - Warp configuration (preset + bend + distortion)
 * @returns A mapping function `(x, y) => { x, y }`
 */
export function applyTextWarp(textBounds: TextBounds, config: TextWarpConfig): (x: number, y: number) => WarpPoint {
  if (config.preset === 'none') {
    return (x, y) => ({ x, y })
  }

  const { width, height, x: bx, y: by } = textBounds
  if (width === 0 || height === 0) {
    return (x, y) => ({ x, y })
  }

  const warpFn = WARP_FUNCTIONS[config.preset]
  const { bend, distortH, distortV } = config

  return (x: number, y: number): WarpPoint => {
    // Normalize to 0-1 within text bounds
    const nx = (x - bx) / width
    const ny = (y - by) / height

    // Apply preset warp
    const { dx, dy } = warpFn(nx, ny, bend, distortH / 100, distortV / 100)

    // Apply horizontal/vertical distortion
    const hdx = (distortH / 100) * (ny - 0.5) * width
    const vdy = (distortV / 100) * (nx - 0.5) * height

    return {
      x: x + dx * width + hdx,
      y: y + dy * height + vdy,
    }
  }
}

/**
 * Warp a single point given text bounds and warp config.
 * Convenience wrapper around applyTextWarp for single-point usage.
 */
export function warpTextPoint(x: number, y: number, textBounds: TextBounds, config: TextWarpConfig): WarpPoint {
  return applyTextWarp(textBounds, config)(x, y)
}
