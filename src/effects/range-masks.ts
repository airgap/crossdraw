/**
 * Range masks for filter/adjustment layers.
 *
 * Luminosity Range Mask: restricts an effect to specific tonal ranges.
 * Hue Range Mask: restricts an effect to specific hue ranges.
 *
 * Both produce a single-channel Uint8Array mask (0 = original, 255 = fully filtered).
 * The applyRangeMask function blends between original and filtered images using the mask.
 */

// ── Interfaces ───────────────────────────────────────────────

export interface LuminosityRangeMask {
  type: 'luminosity-range'
  /** Lower luminance bound (0-255). */
  min: number
  /** Upper luminance bound (0-255). */
  max: number
  /** Feather width (0-100) — soft transition at boundaries. */
  feather: number
}

export interface HueRangeMask {
  type: 'hue-range'
  /** Center of the hue range (0-360 degrees). */
  centerHue: number
  /** Half-width of the hue range (0-180 degrees). */
  range: number
  /** Soft transition width at range edges (0-60 degrees). */
  feather: number
}

export type RangeMask = LuminosityRangeMask | HueRangeMask

// ── Luminosity Mask ──────────────────────────────────────────

/**
 * Compute a luminosity-based mask. For each pixel, calculate BT.709 luminance
 * and produce a mask value:
 * - 255 if luminance is within [min, max]
 * - 0 if luminance is outside the feathered range
 * - Gradient in the feather zone
 */
export function computeLuminosityMask(imageData: ImageData, params: LuminosityRangeMask): Uint8Array {
  const { width, height, data } = imageData
  const pixelCount = width * height
  const mask = new Uint8Array(pixelCount)

  const lo = Math.max(0, params.min)
  const hi = Math.min(255, params.max)
  // Feather 0-100 maps to 0-100 luminance units
  const f = Math.max(0, params.feather)

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    // BT.709 luminance
    const lum = 0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!

    let value: number
    if (lum >= lo && lum <= hi) {
      value = 255
    } else if (f > 0) {
      if (lum < lo && lum >= lo - f) {
        value = Math.round(255 * (1 - (lo - lum) / f))
      } else if (lum > hi && lum <= hi + f) {
        value = Math.round(255 * (1 - (lum - hi) / f))
      } else {
        value = 0
      }
    } else {
      value = 0
    }

    mask[i] = value
  }

  return mask
}

// ── Hue Mask ─────────────────────────────────────────────────

/**
 * Compute a hue-based mask. For each pixel, extract the hue and produce
 * a mask value based on angular distance from centerHue within the specified range.
 * Achromatic pixels (very low saturation) get mask value 0.
 */
export function computeHueMask(imageData: ImageData, params: HueRangeMask): Uint8Array {
  const { width, height, data } = imageData
  const pixelCount = width * height
  const mask = new Uint8Array(pixelCount)

  const center = ((params.centerHue % 360) + 360) % 360
  const halfRange = Math.max(0, Math.min(180, params.range))
  const feather = Math.max(0, Math.min(60, params.feather))

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    const r = data[idx]! / 255
    const g = data[idx + 1]! / 255
    const b = data[idx + 2]! / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min

    // Skip achromatic pixels (too low saturation to have meaningful hue)
    if (chroma < 0.01) {
      mask[i] = 0
      continue
    }

    // Compute hue in degrees (0-360)
    let hue: number
    if (max === r) {
      hue = ((g - b) / chroma) * 60
    } else if (max === g) {
      hue = ((b - r) / chroma + 2) * 60
    } else {
      hue = ((r - g) / chroma + 4) * 60
    }
    if (hue < 0) hue += 360

    // Angular distance (0-180)
    let dist = Math.abs(hue - center)
    if (dist > 180) dist = 360 - dist

    let value: number
    if (dist <= halfRange) {
      value = 255
    } else if (feather > 0 && dist <= halfRange + feather) {
      value = Math.round(255 * (1 - (dist - halfRange) / feather))
    } else {
      value = 0
    }

    mask[i] = value
  }

  return mask
}

// ── Apply Range Mask ─────────────────────────────────────────

/**
 * Blend between original and filtered images using a range mask.
 * mask=255 → use filtered pixel, mask=0 → use original pixel,
 * intermediate values → linear interpolation.
 *
 * Returns a new ImageData with the blended result.
 */
export function applyRangeMask(original: ImageData, filtered: ImageData, mask: Uint8Array): ImageData {
  const w = original.width
  const h = original.height
  const out = createImageData(w, h)
  const dst = out.data
  const origData = original.data
  const filtData = filtered.data
  const pixelCount = w * h

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    const t = mask[i]! / 255

    if (t <= 0) {
      // Fully original
      dst[idx] = origData[idx]!
      dst[idx + 1] = origData[idx + 1]!
      dst[idx + 2] = origData[idx + 2]!
      dst[idx + 3] = origData[idx + 3]!
    } else if (t >= 1) {
      // Fully filtered
      dst[idx] = filtData[idx]!
      dst[idx + 1] = filtData[idx + 1]!
      dst[idx + 2] = filtData[idx + 2]!
      dst[idx + 3] = filtData[idx + 3]!
    } else {
      // Blend
      const inv = 1 - t
      dst[idx] = Math.round(origData[idx]! * inv + filtData[idx]! * t)
      dst[idx + 1] = Math.round(origData[idx + 1]! * inv + filtData[idx + 1]! * t)
      dst[idx + 2] = Math.round(origData[idx + 2]! * inv + filtData[idx + 2]! * t)
      dst[idx + 3] = Math.round(origData[idx + 3]! * inv + filtData[idx + 3]! * t)
    }
  }

  return out
}

// ── Convenience: compute mask from RangeMask union ───────────

/**
 * Compute a mask from any RangeMask variant.
 */
export function computeRangeMask(imageData: ImageData, rangeMask: RangeMask): Uint8Array {
  switch (rangeMask.type) {
    case 'luminosity-range':
      return computeLuminosityMask(imageData, rangeMask)
    case 'hue-range':
      return computeHueMask(imageData, rangeMask)
  }
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
