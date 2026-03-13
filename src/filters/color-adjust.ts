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

// ── Brightness / Contrast ────────────────────────────────────

export interface BrightnessContrastParams {
  /** Brightness shift: -100 (black) to 100 (white). Maps to a -255..255 offset. */
  brightness: number
  /** Contrast: -100 (flat grey) to 100 (maximum). Uses linear scaling around midpoint. */
  contrast: number
}

/**
 * Adjust brightness and contrast.
 *
 * Brightness adds a flat offset to every channel.
 * Contrast scales the distance from the midpoint (128).
 */
export function applyBrightnessContrast(imageData: ImageData, params: BrightnessContrastParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  const bOffset = (params.brightness / 100) * 255
  // Map contrast -100..100 to multiplier 0..~3
  const cFactor =
    params.contrast >= 0
      ? 1 + (params.contrast / 100) * 2 // 0→1, 100→3
      : 1 + params.contrast / 100 // -100→0, 0→1

  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = src[i + c]!
      // Apply brightness then contrast around midpoint
      dst[i + c] = clamp255((v + bOffset - 128) * cFactor + 128)
    }
    dst[i + 3] = src[i + 3]! // preserve alpha
  }

  return out
}

// ── Shadow / Highlight Recovery ──────────────────────────────

export interface ShadowHighlightParams {
  /** Shadow recovery: -100 to 100.  Positive = lighten shadows. */
  shadows: number
  /** Highlight recovery: -100 to 100.  Positive = darken highlights. */
  highlights: number
}

/**
 * Recover detail in shadows and highlights by selectively adjusting
 * tonal ranges without affecting midtones.
 */
export function applyShadowHighlight(imageData: ImageData, params: ShadowHighlightParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  const sAmount = params.shadows / 100
  const hAmount = params.highlights / 100

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

    // Shadow weight: strongest in dark areas, fades out by mid
    const shadowW = Math.max(0, 1 - lum * 2.5)
    // Highlight weight: strongest in bright areas, fades out by mid
    const highlightW = Math.max(0, lum * 2.5 - 1.5)

    const lift = sAmount * shadowW * 80 - hAmount * highlightW * 80

    dst[i] = clamp255(r + lift)
    dst[i + 1] = clamp255(g + lift)
    dst[i + 2] = clamp255(b + lift)
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Exposure ─────────────────────────────────────────────────

export interface ExposureParams {
  /** Exposure value in stops: -5 to +5 */
  exposure: number
  /** Offset: -0.5 to 0.5 (added after exposure multiply) */
  offset: number
  /** Gamma correction: 0.01 to 10 */
  gamma: number
}

/**
 * Adjust exposure using photographic EV stops.
 * exposure = 0, offset = 0, gamma = 1 produces no change.
 */
export function applyExposure(imageData: ImageData, params: ExposureParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  const mult = Math.pow(2, params.exposure)
  const invGamma = 1 / Math.max(0.01, params.gamma)

  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = src[i + c]! / 255
      v = v * mult + params.offset
      v = Math.max(0, Math.min(1, v))
      v = Math.pow(v, invGamma)
      dst[i + c] = clamp255(v * 255)
    }
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Photo Filter (warming/cooling) ──────────────────────────

export interface PhotoFilterParams {
  /** Filter color (hex). */
  color: string
  /** Density: 0-100 (blend strength). */
  density: number
  /** Preserve luminosity. */
  preserveLuminosity: boolean
}

/**
 * Apply a colour overlay (warming/cooling filter) to the image.
 */
export function applyPhotoFilter(imageData: ImageData, params: PhotoFilterParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  const hex = params.color.replace('#', '')
  const fr = parseInt(hex.substring(0, 2), 16) || 0
  const fg = parseInt(hex.substring(2, 4), 16) || 0
  const fb = parseInt(hex.substring(4, 6), 16) || 0
  const t = Math.max(0, Math.min(1, params.density / 100))

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]! * (1 - t) + fr * t
    let g = src[i + 1]! * (1 - t) + fg * t
    let b = src[i + 2]! * (1 - t) + fb * t

    if (params.preserveLuminosity) {
      const origLum = 0.2126 * src[i]! + 0.7152 * src[i + 1]! + 0.0722 * src[i + 2]!
      const newLum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (newLum > 0) {
        const scale = origLum / newLum
        r *= scale
        g *= scale
        b *= scale
      }
    }

    dst[i] = clamp255(r)
    dst[i + 1] = clamp255(g)
    dst[i + 2] = clamp255(b)
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Black & White Mixer ─────────────────────────────────────

export interface BlackWhiteMixerParams {
  reds: number // -200 to 300
  yellows: number
  greens: number
  cyans: number
  blues: number
  magentas: number
}

/**
 * Convert to black & white with per-hue luminosity control.
 * Each slider controls how bright that hue range appears in the output.
 * Default 0 = neutral B&W, positive = brighter, negative = darker.
 */
export function applyBlackWhiteMixer(imageData: ImageData, params: BlackWhiteMixerParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255

    // BT.709 base luminance
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    // Determine hue weights (simplified 6-sector model)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min

    if (chroma > 0.001) {
      let hue: number
      if (max === r) hue = ((g - b) / chroma + 6) % 6
      else if (max === g) hue = (b - r) / chroma + 2
      else hue = (r - g) / chroma + 4

      // Map hue sector to adjustment amount
      const sector = hue // 0-6
      let adj: number
      if (sector < 1) adj = lerp(params.reds, params.yellows, sector)
      else if (sector < 2) adj = lerp(params.yellows, params.greens, sector - 1)
      else if (sector < 3) adj = lerp(params.greens, params.cyans, sector - 2)
      else if (sector < 4) adj = lerp(params.cyans, params.blues, sector - 3)
      else if (sector < 5) adj = lerp(params.blues, params.magentas, sector - 4)
      else adj = lerp(params.magentas, params.reds, sector - 5)

      lum += (adj / 100) * chroma * 0.5
    }

    const v = clamp255(lum * 255)
    dst[i] = v
    dst[i + 1] = v
    dst[i + 2] = v
    dst[i + 3] = src[i + 3]!
  }

  return out
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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
