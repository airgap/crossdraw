/**
 * Render filters: Clouds, Lens Flare, and Lighting effects.
 *
 * These are "generative" filters that create or overlay visual effects
 * onto existing image data.  Each function returns a *new* ImageData.
 */

// ── Public interfaces ────────────────────────────────────────

export interface CloudsParams {
  /** Noise frequency (higher = smaller features). */
  scale: number
  /** Seed for repeatable randomness. */
  seed: number
  /** When true, use |noise| for turbulent cloud appearance. */
  turbulence: boolean
}

export interface LensFlareParams {
  /** Flare source x position (pixels). */
  x: number
  /** Flare source y position (pixels). */
  y: number
  /** Overall brightness multiplier (0-1+). */
  brightness: number
  /** Lens type affects reflection count and arrangement. */
  lensType: 'standard' | 'zoom' | 'movie'
}

export interface LightingParams {
  /** Light source x position (pixels). */
  lightX: number
  /** Light source y position (pixels). */
  lightY: number
  /** Light intensity multiplier. */
  intensity: number
  /** Ambient light level (0-1). */
  ambientLight: number
  /** Surface height multiplier for the luminance height-map. */
  surfaceHeight: number
}

// ── Internal helpers ─────────────────────────────────────────

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

function cloneImageData(img: ImageData): ImageData {
  const clone = createImageData(img.width, img.height)
  clone.data.set(img.data)
  return clone
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

// ── Value noise with hash-based permutation ──────────────────

/** Simple integer hash for noise permutation (no external deps). */
function hash(x: number, y: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return h
}

/** Value noise: returns a value in [-1, 1]. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)

  // Hash at four corners, normalised to [-1, 1]
  const n00 = ((hash(ix, iy, seed) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const n10 = ((hash(ix + 1, iy, seed) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const n01 = ((hash(ix, iy + 1, seed) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const n11 = ((hash(ix + 1, iy + 1, seed) & 0x7fffffff) / 0x7fffffff) * 2 - 1

  const nx0 = n00 + sx * (n10 - n00)
  const nx1 = n01 + sx * (n11 - n01)
  return nx0 + sy * (nx1 - nx0)
}

/** Multi-octave fractional Brownian motion noise. */
function fbm(x: number, y: number, seed: number, octaves: number, turbulence: boolean): number {
  let value = 0
  let amplitude = 1
  let frequency = 1
  let maxAmp = 0

  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * frequency, y * frequency, seed + i * 31)
    value += amplitude * (turbulence ? Math.abs(n) : n)
    maxAmp += amplitude
    amplitude *= 0.5
    frequency *= 2
  }

  return value / maxAmp
}

// ── Clouds ───────────────────────────────────────────────────

/**
 * Generate a cloud pattern filling the image using value noise with 4 octaves.
 * The result is a grayscale pattern written over the existing image data.
 */
export function applyClouds(imageData: ImageData, params: CloudsParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = createImageData(w, h)
  const dst = out.data
  const freq = Math.max(0.001, params.scale) / 100
  const octaves = 4

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = fbm(x * freq, y * freq, params.seed, octaves, params.turbulence)
      // Map from [-1,1] or [0,1] (turbulence) to [0,255]
      if (params.turbulence) {
        n = Math.max(0, Math.min(1, n))
      } else {
        n = (n + 1) * 0.5
        n = Math.max(0, Math.min(1, n))
      }
      const v = Math.round(n * 255)
      const pi = (y * w + x) * 4
      dst[pi] = v
      dst[pi + 1] = v
      dst[pi + 2] = v
      dst[pi + 3] = 255
    }
  }

  return out
}

// ── Lens Flare ───────────────────────────────────────────────

interface FlareElement {
  /** Position along the axis from source to center (0 = source, 1 = center, >1 = opposite side). */
  t: number
  /** Radius relative to image diagonal. */
  radius: number
  /** Brightness multiplier. */
  brightness: number
}

function getFlareElements(lensType: 'standard' | 'zoom' | 'movie'): FlareElement[] {
  switch (lensType) {
    case 'standard':
      return [
        { t: 0, radius: 0.08, brightness: 1.0 },
        { t: 0.3, radius: 0.03, brightness: 0.4 },
        { t: 0.5, radius: 0.05, brightness: 0.3 },
        { t: 0.7, radius: 0.02, brightness: 0.5 },
        { t: 1.0, radius: 0.04, brightness: 0.2 },
        { t: 1.3, radius: 0.06, brightness: 0.15 },
      ]
    case 'zoom':
      return [
        { t: 0, radius: 0.12, brightness: 1.0 },
        { t: 0.2, radius: 0.04, brightness: 0.6 },
        { t: 0.4, radius: 0.06, brightness: 0.5 },
        { t: 0.6, radius: 0.03, brightness: 0.4 },
        { t: 0.8, radius: 0.08, brightness: 0.3 },
        { t: 1.0, radius: 0.05, brightness: 0.25 },
        { t: 1.2, radius: 0.07, brightness: 0.2 },
        { t: 1.5, radius: 0.1, brightness: 0.15 },
      ]
    case 'movie':
      return [
        { t: 0, radius: 0.1, brightness: 1.0 },
        { t: 0.15, radius: 0.02, brightness: 0.7 },
        { t: 0.35, radius: 0.04, brightness: 0.5 },
        { t: 0.55, radius: 0.03, brightness: 0.45 },
        { t: 0.75, radius: 0.05, brightness: 0.35 },
        { t: 0.95, radius: 0.02, brightness: 0.6 },
        { t: 1.15, radius: 0.04, brightness: 0.25 },
        { t: 1.35, radius: 0.06, brightness: 0.2 },
        { t: 1.55, radius: 0.03, brightness: 0.15 },
        { t: 1.8, radius: 0.08, brightness: 0.1 },
      ]
  }
}

/**
 * Apply a lens flare effect: additive blending of circular bright spots
 * along the axis from (x, y) to the image center.
 */
export function applyLensFlare(imageData: ImageData, params: LensFlareParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const out = cloneImageData(imageData)
  const dst = out.data

  const cx = w / 2
  const cy = h / 2
  const diag = Math.sqrt(w * w + h * h)

  const elements = getFlareElements(params.lensType)

  // Axis from source to center
  const axisX = cx - params.x
  const axisY = cy - params.y

  for (const elem of elements) {
    const ex = params.x + axisX * elem.t
    const ey = params.y + axisY * elem.t
    const r = elem.radius * diag
    const bright = elem.brightness * params.brightness * 255

    if (r < 1) continue

    // Only iterate over bounding box of this element
    const x0 = Math.max(0, Math.floor(ex - r))
    const x1 = Math.min(w - 1, Math.ceil(ex + r))
    const y0 = Math.max(0, Math.floor(ey - r))
    const y1 = Math.min(h - 1, Math.ceil(ey + r))
    const rSq = r * r

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - ex
        const dy = py - ey
        const distSq = dx * dx + dy * dy
        if (distSq > rSq) continue

        // Smooth radial falloff (quadratic)
        const falloff = 1 - distSq / rSq
        const add = bright * falloff * falloff
        const pi = (py * w + px) * 4

        dst[pi] = clamp255(dst[pi]! + add)
        dst[pi + 1] = clamp255(dst[pi + 1]! + add * 0.95) // slightly warm tint
        dst[pi + 2] = clamp255(dst[pi + 2]! + add * 0.85)
      }
    }
  }

  return out
}

// ── Lighting ─────────────────────────────────────────────────

/**
 * Directional lighting effect using the image luminance as a height map.
 * Computes surface normals via Sobel-like gradients and applies Phong-like
 * ambient + diffuse shading.
 */
export function applyLighting(imageData: ImageData, params: LightingParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = cloneImageData(imageData)
  const dst = out.data

  // Pre-compute luminance for the height map
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4
    lum[i] = (src[pi]! * 0.299 + src[pi + 1]! * 0.587 + src[pi + 2]! * 0.114) / 255
  }

  const surfH = params.surfaceHeight

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel-like gradient for surface normal
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)

      const dzdx = (lum[y * w + xp]! - lum[y * w + xm]!) * surfH
      const dzdy = (lum[yp * w + x]! - lum[ym * w + x]!) * surfH

      // Surface normal (unnormalised: (-dzdx, -dzdy, 1))
      const nx = -dzdx
      const ny = -dzdy
      const nz = 1.0
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)

      // Light direction (from pixel to light source)
      const lx = params.lightX - x
      const ly = params.lightY - y
      const lz = 50 // fixed height above surface
      const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz)

      // Normalise and compute dot product (diffuse term)
      const dot = (nx * lx + ny * ly + nz * lz) / (nLen * lLen)
      const diffuse = Math.max(0, dot)

      // Distance-based falloff (inverse-distance, clamped)
      const dist = Math.sqrt(lx * lx + ly * ly)
      const maxDist = Math.sqrt(w * w + h * h)
      const falloff = 1 - Math.min(1, dist / maxDist)

      // Final illumination
      const illum = params.ambientLight + diffuse * params.intensity * falloff

      const pi = (y * w + x) * 4
      dst[pi] = clamp255(src[pi]! * illum)
      dst[pi + 1] = clamp255(src[pi + 1]! * illum)
      dst[pi + 2] = clamp255(src[pi + 2]! * illum)
      // Alpha unchanged
      dst[pi + 3] = src[pi + 3]!
    }
  }

  return out
}
