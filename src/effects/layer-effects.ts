/**
 * Layer effects: Bevel & Emboss, Color Overlay, Gradient Overlay,
 * Pattern Overlay, and Satin.
 *
 * All functions operate on ImageData and return a new ImageData with the
 * effect applied, following the same conventions as the rest of the
 * filter pipeline.
 */

import type {
  BevelEmbossEffectParams,
  ColorOverlayEffectParams,
  GradientOverlayEffectParams,
  PatternOverlayEffectParams,
  SatinEffectParams,
} from '@/types'
import { boxBlur } from '@/filters/progressive-blur'

// ── Helpers ─────────────────────────────────────────────────────

function createImageData(w: number, h: number): ImageData {
  if (typeof globalThis.ImageData === 'function') {
    return new ImageData(w, h)
  }
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as ImageData
}

function cloneImageData(src: ImageData): ImageData {
  const out = createImageData(src.width, src.height)
  out.data.set(src.data)
  return out
}

/** Parse a hex color string (#RGB, #RRGGBB, or #RRGGBBAA) into [r, g, b, a]. */
function parseColor(hex: string): [number, number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  }
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) || 0 : 255
  return [r, g, b, a]
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// ── Extract and blur the alpha channel ──────────────────────────

/** Extract the alpha channel into a single-channel Uint8 array. */
function extractAlpha(src: ImageData): Uint8ClampedArray {
  const n = src.width * src.height
  const alpha = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    alpha[i] = src.data[i * 4 + 3]!
  }
  return alpha
}

/**
 * Blur a single-channel buffer using an iterated box blur (same as the
 * Gaussian approximation used elsewhere). We pack it into an ImageData,
 * blur all four channels, then extract the red channel.
 */
function blurAlphaChannel(alpha: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  if (radius <= 0) {
    const out = new Uint8ClampedArray(alpha.length)
    out.set(alpha)
    return out
  }
  // Pack into an ImageData (store alpha in all four channels)
  const tmp = createImageData(w, h)
  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i]!
    const idx = i * 4
    tmp.data[idx] = v
    tmp.data[idx + 1] = v
    tmp.data[idx + 2] = v
    tmp.data[idx + 3] = 255
  }
  const blurred = boxBlur(tmp, Math.round(radius))
  const out = new Uint8ClampedArray(alpha.length)
  for (let i = 0; i < alpha.length; i++) {
    out[i] = blurred.data[i * 4]!
  }
  return out
}

// ── Bevel & Emboss ──────────────────────────────────────────────

/**
 * Apply a bevel/emboss effect by computing a height map from the alpha
 * channel, blurring it, deriving surface normals from the gradients,
 * and then lighting with a directional light at (angle, altitude).
 */
export function applyBevelEmboss(imageData: ImageData, params: BevelEmbossEffectParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = cloneImageData(imageData)

  // 1. Build height map from alpha
  const rawAlpha = extractAlpha(imageData)
  const heightMap = blurAlphaChannel(rawAlpha, w, h, params.size)

  // 2. Optional soften pass
  const softened = params.soften > 0 ? blurAlphaChannel(heightMap, w, h, params.soften) : heightMap

  // 3. Compute light direction from angle and altitude
  const angleRad = (params.angle * Math.PI) / 180
  const altRad = (params.altitude * Math.PI) / 180
  const lx = Math.cos(angleRad) * Math.cos(altRad)
  const ly = Math.sin(angleRad) * Math.cos(altRad)
  const lz = Math.sin(altRad)

  // Depth scaling factor
  const depthScale = (params.depth / 100) * (params.direction === 'down' ? -1 : 1)

  const [hr, hg, hb] = parseColor(params.highlightColor)
  const [sr, sg, sb] = parseColor(params.shadowColor)

  // 4. Per-pixel: compute normal from height-map gradients, dot with light
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x

      // Sobel-like gradient approximation
      const left = x > 0 ? softened[idx - 1]! : softened[idx]!
      const right = x < w - 1 ? softened[idx + 1]! : softened[idx]!
      const top = y > 0 ? softened[idx - w]! : softened[idx]!
      const bottom = y < h - 1 ? softened[idx + w]! : softened[idx]!

      const dx = ((right - left) / 255) * depthScale
      const dy = ((bottom - top) / 255) * depthScale

      // Normal vector (not normalised for speed — we only need the sign and magnitude of the dot)
      const nz = 1.0
      const dot = -(dx * lx) - dy * ly + nz * lz
      const intensity = clamp(dot, -1, 1)

      const srcAlpha = imageData.data[idx * 4 + 3]!

      // Skip fully transparent pixels for inner styles
      if (params.style === 'inner-bevel' || params.style === 'pillow-emboss') {
        if (srcAlpha === 0) continue
      }

      const pIdx = idx * 4
      if (intensity > 0) {
        // Highlight
        const t = intensity * params.highlightOpacity
        out.data[pIdx] = clamp(Math.round(out.data[pIdx]! * (1 - t) + hr * t), 0, 255)
        out.data[pIdx + 1] = clamp(Math.round(out.data[pIdx + 1]! * (1 - t) + hg * t), 0, 255)
        out.data[pIdx + 2] = clamp(Math.round(out.data[pIdx + 2]! * (1 - t) + hb * t), 0, 255)
      } else {
        // Shadow
        const t = -intensity * params.shadowOpacity
        out.data[pIdx] = clamp(Math.round(out.data[pIdx]! * (1 - t) + sr * t), 0, 255)
        out.data[pIdx + 1] = clamp(Math.round(out.data[pIdx + 1]! * (1 - t) + sg * t), 0, 255)
        out.data[pIdx + 2] = clamp(Math.round(out.data[pIdx + 2]! * (1 - t) + sb * t), 0, 255)
      }
    }
  }

  return out
}

// ── Color Overlay ───────────────────────────────────────────────

/**
 * Fill the layer with a solid color, composited at the given opacity,
 * masked by the source alpha (only where the source has alpha > 0).
 */
export function applyColorOverlay(imageData: ImageData, params: ColorOverlayEffectParams): ImageData {
  const out = cloneImageData(imageData)
  const [cr, cg, cb] = parseColor(params.color)
  const t = clamp(params.opacity, 0, 1)

  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3]!
    if (a === 0) continue

    out.data[i] = clamp(Math.round(out.data[i]! * (1 - t) + cr * t), 0, 255)
    out.data[i + 1] = clamp(Math.round(out.data[i + 1]! * (1 - t) + cg * t), 0, 255)
    out.data[i + 2] = clamp(Math.round(out.data[i + 2]! * (1 - t) + cb * t), 0, 255)
  }

  return out
}

// ── Gradient Overlay ────────────────────────────────────────────

/**
 * Generate a gradient fill based on the style/angle/stops and composite
 * onto the source using the given opacity, masked by source alpha.
 */
export function applyGradientOverlay(imageData: ImageData, params: GradientOverlayEffectParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = cloneImageData(imageData)
  const t = clamp(params.opacity, 0, 1)

  // Sort stops by offset
  const stops = [...params.stops].sort((a, b) => a.offset - b.offset)
  if (stops.length === 0) return out

  const parsedStops = stops.map((s) => ({ offset: s.offset, color: parseColor(s.color) }))

  /** Sample the gradient at position 0-1, returning [r, g, b]. */
  function sampleGradient(pos: number): [number, number, number] {
    const p = clamp(pos, 0, 1)
    if (parsedStops.length === 1) {
      const c = parsedStops[0]!.color
      return [c[0], c[1], c[2]]
    }
    // Find the two surrounding stops
    let lo = parsedStops[0]!
    let hi = parsedStops[parsedStops.length - 1]!
    for (let i = 0; i < parsedStops.length - 1; i++) {
      if (p >= parsedStops[i]!.offset && p <= parsedStops[i + 1]!.offset) {
        lo = parsedStops[i]!
        hi = parsedStops[i + 1]!
        break
      }
    }
    const range = hi.offset - lo.offset
    const frac = range > 0 ? (p - lo.offset) / range : 0
    return [
      Math.round(lo.color[0] * (1 - frac) + hi.color[0] * frac),
      Math.round(lo.color[1] * (1 - frac) + hi.color[1] * frac),
      Math.round(lo.color[2] * (1 - frac) + hi.color[2] * frac),
    ]
  }

  const angleRad = (params.angle * Math.PI) / 180
  const cx = w / 2
  const cy = h / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const srcA = out.data[idx + 3]!
      if (srcA === 0) continue

      let pos: number

      if (params.style === 'radial') {
        // Distance from centre, normalised to half the diagonal
        const dx = (x - cx) / cx
        const dy = (y - cy) / cy
        pos = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2
      } else if (params.style === 'angle') {
        // Sweep angle around centre, normalised 0-1
        const a = Math.atan2(y - cy, x - cx) + angleRad
        pos = (((a / (2 * Math.PI)) % 1) + 1) % 1
      } else {
        // Linear: project onto the angle vector
        const cosA = Math.cos(angleRad)
        const sinA = Math.sin(angleRad)
        const dx = x - cx
        const dy = y - cy
        const maxProj = Math.abs(cosA * cx) + Math.abs(sinA * cy)
        pos = maxProj > 0 ? ((dx * cosA + dy * sinA) / maxProj) * 0.5 + 0.5 : 0.5
      }

      const [gr, gg, gb] = sampleGradient(pos)
      out.data[idx] = clamp(Math.round(out.data[idx]! * (1 - t) + gr * t), 0, 255)
      out.data[idx + 1] = clamp(Math.round(out.data[idx + 1]! * (1 - t) + gg * t), 0, 255)
      out.data[idx + 2] = clamp(Math.round(out.data[idx + 2]! * (1 - t) + gb * t), 0, 255)
    }
  }

  return out
}

// ── Pattern Overlay ─────────────────────────────────────────────

/**
 * Fill with a repeating checkerboard pattern at the given scale.
 * (A true pattern overlay requires external pattern data; we use a
 * built-in 8x8 checkerboard as the default repeating fill.)
 */
export function applyPatternOverlay(imageData: ImageData, params: PatternOverlayEffectParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = cloneImageData(imageData)
  const t = clamp(params.opacity, 0, 1)
  const cellSize = Math.max(1, Math.round(8 * clamp(params.scale, 0.01, 100)))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const srcA = out.data[idx + 3]!
      if (srcA === 0) continue

      const cellX = Math.floor(x / cellSize)
      const cellY = Math.floor(y / cellSize)
      const isLight = (cellX + cellY) % 2 === 0
      const pv = isLight ? 200 : 55

      out.data[idx] = clamp(Math.round(out.data[idx]! * (1 - t) + pv * t), 0, 255)
      out.data[idx + 1] = clamp(Math.round(out.data[idx + 1]! * (1 - t) + pv * t), 0, 255)
      out.data[idx + 2] = clamp(Math.round(out.data[idx + 2]! * (1 - t) + pv * t), 0, 255)
    }
  }

  return out
}

// ── Satin ───────────────────────────────────────────────────────

/**
 * Satin effect: duplicate the alpha channel, offset one copy in
 * the positive direction and another in the negative direction
 * (based on angle and distance), XOR the two copies, blur by size,
 * apply a contour curve, then fill with the satin color and composite.
 */
export function applySatin(imageData: ImageData, params: SatinEffectParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = cloneImageData(imageData)

  const alpha = extractAlpha(imageData)

  // Offset amounts
  const angleRad = (params.angle * Math.PI) / 180
  const dx = Math.round(params.distance * Math.cos(angleRad))
  const dy = Math.round(params.distance * Math.sin(angleRad))

  // Create XOR of two offset alpha copies
  const xorAlpha = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x

      // Positive offset sample
      const px1 = clamp(x + dx, 0, w - 1)
      const py1 = clamp(y + dy, 0, h - 1)
      const a1 = alpha[py1 * w + px1]!

      // Negative offset sample
      const px2 = clamp(x - dx, 0, w - 1)
      const py2 = clamp(y - dy, 0, h - 1)
      const a2 = alpha[py2 * w + px2]!

      // XOR
      xorAlpha[idx] = a1 ^ a2
    }
  }

  // Blur the XOR mask
  const blurred = params.size > 0 ? blurAlphaChannel(xorAlpha, w, h, params.size) : xorAlpha

  // Apply contour curve
  const contouredAlpha = new Uint8ClampedArray(w * h)
  for (let i = 0; i < blurred.length; i++) {
    const v = blurred[i]! / 255
    let curved: number
    switch (params.contour) {
      case 'gaussian':
        // Bell curve
        curved = Math.exp(-((v - 0.5) * (v - 0.5)) / 0.08)
        break
      case 'rounded':
        // Smooth step
        curved = v * v * (3 - 2 * v)
        break
      case 'linear':
      default:
        curved = v
        break
    }
    contouredAlpha[i] = clamp(Math.round(curved * 255), 0, 255)
  }

  // Composite satin color using the contoured alpha mask
  const [cr, cg, cb] = parseColor(params.color)
  const opacity = clamp(params.opacity, 0, 1)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const srcA = out.data[idx + 3]!
      if (srcA === 0) continue

      const satinA = (contouredAlpha[y * w + x]! / 255) * opacity
      out.data[idx] = clamp(Math.round(out.data[idx]! * (1 - satinA) + cr * satinA), 0, 255)
      out.data[idx + 1] = clamp(Math.round(out.data[idx + 1]! * (1 - satinA) + cg * satinA), 0, 255)
      out.data[idx + 2] = clamp(Math.round(out.data[idx + 2]! * (1 - satinA) + cb * satinA), 0, 255)
    }
  }

  return out
}
