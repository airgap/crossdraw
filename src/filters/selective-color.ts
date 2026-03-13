/**
 * Selective Color adjustment filter for raster layers.
 *
 * Classifies each pixel by its dominant hue (reds, yellows, greens, cyans,
 * blues, magentas) or by luminance (whites, neutrals, blacks), then applies
 * per-channel CMYK adjustments within the classified range.
 *
 * This uses the same 6-sector hue model as the black-white mixer in
 * `color-adjust.ts`.
 *
 * Returns a *new* ImageData -- the original is not modified.
 */

export interface CMYKAdjustment {
  /** Cyan adjustment: -100 to 100 */
  cyan: number
  /** Magenta adjustment: -100 to 100 */
  magenta: number
  /** Yellow adjustment: -100 to 100 */
  yellow: number
  /** Black adjustment: -100 to 100 */
  black: number
}

export interface SelectiveColorParams {
  reds: CMYKAdjustment
  yellows: CMYKAdjustment
  greens: CMYKAdjustment
  cyans: CMYKAdjustment
  blues: CMYKAdjustment
  magentas: CMYKAdjustment
  whites: CMYKAdjustment
  neutrals: CMYKAdjustment
  blacks: CMYKAdjustment
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Create a default (identity) selective color params object with all adjustments at 0.
 */
export function defaultSelectiveColorParams(): SelectiveColorParams {
  const zero = (): CMYKAdjustment => ({ cyan: 0, magenta: 0, yellow: 0, black: 0 })
  return {
    reds: zero(),
    yellows: zero(),
    greens: zero(),
    cyans: zero(),
    blues: zero(),
    magentas: zero(),
    whites: zero(),
    neutrals: zero(),
    blacks: zero(),
  }
}

/**
 * Apply selective color adjustment to `imageData`.
 *
 * For each pixel:
 * 1. Determine the hue sector and luminance class
 * 2. Compute the weight of each classification
 * 3. Accumulate CMYK adjustments weighted by classification strength
 * 4. Convert CMYK adjustments back to RGB modifications
 *
 * @returns A new ImageData with the selective color result.
 */
export function applySelectiveColor(imageData: ImageData, params: SelectiveColorParams): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    // Accumulate CMYK adjustments
    let cAdj = 0
    let mAdj = 0
    let yAdj = 0
    let kAdj = 0

    // --- Hue-based classification (6-sector model) ---
    if (chroma > 0.001) {
      let hue: number
      if (max === r) hue = ((g - b) / chroma + 6) % 6
      else if (max === g) hue = (b - r) / chroma + 2
      else hue = (r - g) / chroma + 4

      // Weight is based on chroma (saturation strength)
      const satWeight = chroma

      // Determine which hue sectors this pixel belongs to (with smooth transitions)
      // Each sector spans 1.0 in hue space, with soft falloff at edges
      const hueWeights = computeHueWeights(hue)

      const hueChannels: [string, CMYKAdjustment][] = [
        ['reds', params.reds],
        ['yellows', params.yellows],
        ['greens', params.greens],
        ['cyans', params.cyans],
        ['blues', params.blues],
        ['magentas', params.magentas],
      ]

      for (let ci = 0; ci < 6; ci++) {
        const weight = hueWeights[ci]! * satWeight
        if (weight > 0) {
          const adj = hueChannels[ci]![1]
          cAdj += adj.cyan * weight
          mAdj += adj.magenta * weight
          yAdj += adj.yellow * weight
          kAdj += adj.black * weight
        }
      }
    }

    // --- Luminance-based classification ---
    // Whites: strong in bright, low-chroma areas
    const whiteWeight = Math.max(0, lum * 3 - 2) * (1 - Math.min(1, chroma * 3))
    // Blacks: strong in dark areas
    const blackWeight = Math.max(0, 1 - lum * 3) * (1 - Math.min(1, chroma * 3))
    // Neutrals: midtone, low-chroma areas
    const neutralWeight = Math.max(0, 1 - Math.abs(lum - 0.5) * 4) * (1 - Math.min(1, chroma * 3))

    if (whiteWeight > 0) {
      cAdj += params.whites.cyan * whiteWeight
      mAdj += params.whites.magenta * whiteWeight
      yAdj += params.whites.yellow * whiteWeight
      kAdj += params.whites.black * whiteWeight
    }
    if (blackWeight > 0) {
      cAdj += params.blacks.cyan * blackWeight
      mAdj += params.blacks.magenta * blackWeight
      yAdj += params.blacks.yellow * blackWeight
      kAdj += params.blacks.black * blackWeight
    }
    if (neutralWeight > 0) {
      cAdj += params.neutrals.cyan * neutralWeight
      mAdj += params.neutrals.magenta * neutralWeight
      yAdj += params.neutrals.yellow * neutralWeight
      kAdj += params.neutrals.black * neutralWeight
    }

    // --- Convert CMYK adjustments to RGB ---
    // CMYK adjustments map to RGB as follows:
    // Cyan affects R (negative = more cyan = less red)
    // Magenta affects G (negative = more magenta = less green)
    // Yellow affects B (negative = more yellow = less blue)
    // Black affects all channels equally (positive = darker)
    const scale = 1 / 100 // adjustments are -100 to 100

    let outR = r - cAdj * scale * r
    let outG = g - mAdj * scale * g
    let outB = b - yAdj * scale * b

    // Apply black adjustment (proportional darkening/lightening)
    const kScale = 1 - kAdj * scale
    outR *= kScale
    outG *= kScale
    outB *= kScale

    dst[i] = clamp255(outR * 255)
    dst[i + 1] = clamp255(outG * 255)
    dst[i + 2] = clamp255(outB * 255)
    dst[i + 3] = src[i + 3]!
  }

  return out
}

/**
 * Compute per-sector hue weights for a given hue (0-6).
 * Returns an array of 6 weights: [reds, yellows, greens, cyans, blues, magentas].
 * Each sector is centered on its canonical hue with smooth falloff.
 */
function computeHueWeights(hue: number): number[] {
  const weights = new Array<number>(6)
  // Sector centers: reds=0, yellows=1, greens=2, cyans=3, blues=4, magentas=5
  for (let i = 0; i < 6; i++) {
    // Distance on circular hue wheel
    let dist = Math.abs(hue - i)
    if (dist > 3) dist = 6 - dist
    // Triangular weight: 1 at center, 0 at +-1
    weights[i] = Math.max(0, 1 - dist)
  }
  return weights
}

// ── Internal helpers ─────────────────────────────────────────

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
