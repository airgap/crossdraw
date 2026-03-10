/**
 * Colour adjustment filters for raster layers.
 *
 * All functions return a *new* ImageData — the original is not modified.
 */

// ── Posterize ─────────────────────────────────────────────────

export interface PosterizeParams {
  /** Number of colour levels per channel (2-256). */
  levels: number
}

/**
 * Reduce the number of distinct colour values per channel.
 */
export function applyPosterize(imageData: ImageData, params: PosterizeParams): ImageData {
  const levels = Math.max(2, Math.min(256, Math.round(params.levels)))
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  const factor = 255 / (levels - 1)

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = Math.round(Math.round((src[i]! / 255) * (levels - 1)) * factor)
    dst[i + 1] = Math.round(Math.round((src[i + 1]! / 255) * (levels - 1)) * factor)
    dst[i + 2] = Math.round(Math.round((src[i + 2]! / 255) * (levels - 1)) * factor)
    dst[i + 3] = src[i + 3]! // preserve alpha
  }

  return out
}

// ── Threshold ─────────────────────────────────────────────────

export interface ThresholdParams {
  /** Luminance threshold (0-255). Pixels brighter than this become white; darker become black. */
  value: number
}

/**
 * Convert to pure black or white based on luminance threshold.
 */
export function applyThreshold(imageData: ImageData, params: ThresholdParams): ImageData {
  const threshold = params.value
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    // ITU-R BT.709 luminance
    const lum = 0.2126 * src[i]! + 0.7152 * src[i + 1]! + 0.0722 * src[i + 2]!
    const v = lum >= threshold ? 255 : 0
    dst[i] = v
    dst[i + 1] = v
    dst[i + 2] = v
    dst[i + 3] = src[i + 3]! // preserve alpha
  }

  return out
}

// ── Invert ────────────────────────────────────────────────────

/**
 * Invert all colour channels (255 - value). Alpha is preserved.
 */
export function applyInvert(imageData: ImageData): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = 255 - src[i]!
    dst[i + 1] = 255 - src[i + 1]!
    dst[i + 2] = 255 - src[i + 2]!
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Desaturate ────────────────────────────────────────────────

/**
 * Convert to greyscale using ITU-R BT.709 luminosity coefficients.
 * Alpha is preserved.
 */
export function applyDesaturate(imageData: ImageData): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const lum = Math.round(0.2126 * src[i]! + 0.7152 * src[i + 1]! + 0.0722 * src[i + 2]!)
    dst[i] = lum
    dst[i + 1] = lum
    dst[i + 2] = lum
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Vibrance ──────────────────────────────────────────────────

export interface VibranceParams {
  /** Vibrance amount: -1 (desaturate) to 1 (maximum vibrance boost). */
  amount: number
}

/**
 * Selectively increase the saturation of less-saturated colours, leaving
 * already-saturated colours relatively untouched.  This avoids the clipping
 * that a flat saturation boost causes.
 */
export function applyVibrance(imageData: ImageData, params: VibranceParams): ImageData {
  const { amount } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255

    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC

    // Less-saturated pixels get a bigger boost.
    const boost = amount * (1 - sat)

    // Compute the average and shift each channel toward/away from it.
    const avg = (r + g + b) / 3
    dst[i] = clamp255((r + (r - avg) * boost) * 255)
    dst[i + 1] = clamp255((g + (g - avg) * boost) * 255)
    dst[i + 2] = clamp255((b + (b - avg) * boost) * 255)
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Channel Mixer ─────────────────────────────────────────────

export interface ChannelMixerParams {
  /** Output red = rr*R + rg*G + rb*B */
  rr: number
  rg: number
  rb: number
  /** Output green = gr*R + gg*G + gb*B */
  gr: number
  gg: number
  gb: number
  /** Output blue = br*R + bg*G + bb*B */
  br: number
  bg: number
  bb: number
}

/**
 * Remix colour channels using a 3x3 gain matrix.
 *
 * The identity matrix `{ rr:1, rg:0, rb:0, gr:0, gg:1, gb:0, br:0, bg:0, bb:1 }`
 * produces no change.
 */
export function applyChannelMixer(imageData: ImageData, params: ChannelMixerParams): ImageData {
  const { rr, rg, rb, gr, gg, gb, br, bg, bb } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!

    dst[i] = clamp255(rr * r + rg * g + rb * b)
    dst[i + 1] = clamp255(gr * r + gg * g + gb * b)
    dst[i + 2] = clamp255(br * r + bg * g + bb * b)
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Internal helpers ─────────────────────────────────────────

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/** Create an ImageData instance, with a fallback for non-browser environments. */
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
