/**
 * Vector noise / texture fills.
 * Provides simplex, perlin, cellular (Voronoi), and white noise generation
 * for use as vector fill patterns. All noise is seeded for reproducibility.
 */

import type { NoiseFillConfig } from '@/types'

// ── Seeded PRNG (mulberry32) ──

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Simplex noise 2D ──

// Permutation table (seeded)
function buildPermutation(rng: () => number): Uint8Array {
  const perm = new Uint8Array(512)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = base[i]!
    base[i] = base[j]!
    base[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!
  return perm
}

// Gradient vectors for 2D simplex
const GRAD2 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function dot2(gx: number, gy: number, x: number, y: number): number {
  return gx * x + gy * y
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

/**
 * 2D simplex noise, returns value in [-1, 1].
 */
export function simplex2D(x: number, y: number, perm: Uint8Array): number {
  const s = (x + y) * F2
  const i = Math.floor(x + s)
  const j = Math.floor(y + s)
  const t = (i + j) * G2
  const X0 = i - t
  const Y0 = j - t
  const x0 = x - X0
  const y0 = y - Y0

  let i1: number, j1: number
  if (x0 > y0) {
    i1 = 1
    j1 = 0
  } else {
    i1 = 0
    j1 = 1
  }

  const x1 = x0 - i1 + G2
  const y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2
  const y2 = y0 - 1 + 2 * G2

  const ii = i & 255
  const jj = j & 255

  let n0 = 0,
    n1 = 0,
    n2 = 0

  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 >= 0) {
    t0 *= t0
    const gi0 = perm[(ii + perm[jj]!) & 511]! % 8
    const g = GRAD2[gi0]!
    n0 = t0 * t0 * dot2(g[0], g[1], x0, y0)
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 >= 0) {
    t1 *= t1
    const gi1 = perm[(ii + i1 + perm[(jj + j1) & 511]!) & 511]! % 8
    const g = GRAD2[gi1]!
    n1 = t1 * t1 * dot2(g[0], g[1], x1, y1)
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 >= 0) {
    t2 *= t2
    const gi2 = perm[(ii + 1 + perm[(jj + 1) & 511]!) & 511]! % 8
    const g = GRAD2[gi2]!
    n2 = t2 * t2 * dot2(g[0], g[1], x2, y2)
  }

  // Scale to [-1, 1]
  return 70 * (n0 + n1 + n2)
}

// ── Perlin noise 2D ──

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

/**
 * 2D Perlin noise, returns value in approximately [-1, 1].
 */
export function perlin2D(x: number, y: number, perm: Uint8Array): number {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)

  const u = fade(xf)
  const v = fade(yf)

  const aa = perm[(xi + perm[yi]!) & 511]! % 8
  const ab = perm[(xi + perm[(yi + 1) & 255]!) & 511]! % 8
  const ba = perm[((xi + 1) & 255) + perm[yi]!]! % 8
  const bb = perm[((xi + 1) & 255) + perm[(yi + 1) & 255]!]! % 8

  const gAA = GRAD2[aa]!
  const gAB = GRAD2[ab]!
  const gBA = GRAD2[ba]!
  const gBB = GRAD2[bb]!

  const n00 = dot2(gAA[0], gAA[1], xf, yf)
  const n10 = dot2(gBA[0], gBA[1], xf - 1, yf)
  const n01 = dot2(gAB[0], gAB[1], xf, yf - 1)
  const n11 = dot2(gBB[0], gBB[1], xf - 1, yf - 1)

  const nx0 = lerp(n00, n10, u)
  const nx1 = lerp(n01, n11, u)

  return lerp(nx0, nx1, v)
}

// ── Cellular / Voronoi noise ──

/**
 * 2D cellular (Voronoi) noise. Returns distance to nearest point, normalized to ~[0, 1].
 */
export function cellular2D(x: number, y: number, perm: Uint8Array, _rng: () => number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let minDist = Infinity

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx
      const cy = iy + dy
      // Deterministic point position within cell using permutation
      const hash = perm[((cx & 255) + perm[cy & 255]!) & 511]!
      const px = cx + hash / 255
      const hash2 = perm[(((cx + 37) & 255) + perm[(cy + 17) & 255]!) & 511]!
      const py = cy + hash2 / 255
      const ddx = x - px
      const ddy = y - py
      const dist = Math.sqrt(ddx * ddx + ddy * ddy)
      if (dist < minDist) minDist = dist
    }
  }

  // Normalize: typical max distance in a unit grid is ~sqrt(2)/2
  return Math.min(minDist / 0.707, 1)
}

// ── Fractal noise (octave layering) ──

type Noise2DFn = (x: number, y: number, perm: Uint8Array, rng: () => number) => number

function fractalNoise(
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  noiseFn: Noise2DFn,
  perm: Uint8Array,
  rng: () => number,
): number {
  let total = 0
  let amplitude = 1
  let frequency = 1
  let maxAmplitude = 0

  for (let i = 0; i < octaves; i++) {
    total += noiseFn(x * frequency, y * frequency, perm, rng) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  return total / maxAmplitude
}

// ── Color helpers ──

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ]
}

// ── Public API ──

/** Parameters for noise fill generation. */
export interface NoiseFillParams {
  noiseType: 'perlin' | 'simplex' | 'cellular' | 'white'
  scale: number
  octaves: number
  persistence: number
  seed: number
  color1: string
  color2: string
  opacity: number
}

/**
 * Generate a noise-filled ImageData.
 * Returns an ImageData with pixels interpolated between color1 and color2
 * based on the noise value at each pixel.
 */
export function generateNoiseFill(width: number, height: number, params: NoiseFillParams): ImageData {
  const { noiseType, scale, octaves, persistence, seed, color1, color2, opacity } = params
  const rng = mulberry32(seed)
  const perm = buildPermutation(mulberry32(seed))
  const c1 = parseHexColor(color1)
  const c2 = parseHexColor(color2)

  const data = new Uint8ClampedArray(width * height * 4)
  const invScale = 1 / Math.max(scale, 0.001)

  // Wrapping simplex/perlin for the Noise2DFn signature (they ignore rng)
  const simplexFn: Noise2DFn = (x, y, p, _r) => simplex2D(x, y, p)
  const perlinFn: Noise2DFn = (x, y, p, _r) => perlin2D(x, y, p)
  const cellularFn: Noise2DFn = (x, y, p, r) => cellular2D(x, y, p, r) * 2 - 1 // map [0,1] to [-1,1]

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4
      let noiseVal: number

      if (noiseType === 'white') {
        noiseVal = rng() * 2 - 1
      } else {
        const nx = px * invScale
        const ny = py * invScale

        const noiseFn = noiseType === 'simplex' ? simplexFn : noiseType === 'perlin' ? perlinFn : cellularFn

        noiseVal = fractalNoise(nx, ny, octaves, persistence, noiseFn, perm, rng)
      }

      // Map from [-1, 1] to [0, 1]
      const t = Math.max(0, Math.min(1, (noiseVal + 1) * 0.5))
      const color = lerpColor(c1, c2, t)

      data[idx] = color[0]
      data[idx + 1] = color[1]
      data[idx + 2] = color[2]
      data[idx + 3] = Math.round(opacity * 255)
    }
  }

  // Use native ImageData when available, otherwise return a compatible object
  if (typeof ImageData !== 'undefined') {
    return new ImageData(data, width, height)
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

/**
 * Create a CanvasPattern from noise fill config.
 * Generates the noise at the given dimensions and creates a repeating pattern.
 */
export function createNoisePattern(
  ctx: CanvasRenderingContext2D,
  config: NoiseFillConfig,
  width: number,
  height: number,
  fillOpacity: number,
): CanvasPattern | null {
  // Use a reasonable tile size (at least 1x1, cap at actual size for performance)
  const tileW = Math.max(1, Math.min(width, 512))
  const tileH = Math.max(1, Math.min(height, 512))

  const imageData = generateNoiseFill(tileW, tileH, {
    noiseType: config.noiseType,
    scale: config.scale,
    octaves: config.octaves,
    persistence: config.persistence,
    seed: config.seed,
    color1: config.color1,
    color2: config.color2,
    opacity: fillOpacity,
  })

  const offscreen = new OffscreenCanvas(tileW, tileH)
  const offCtx = offscreen.getContext('2d')!
  offCtx.putImageData(imageData, 0, 0)

  return ctx.createPattern(offscreen, 'repeat')
}
