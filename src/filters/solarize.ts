/**
 * Solarize filter for raster layers.
 *
 * Inverts pixel channels that exceed a given threshold, producing the
 * classic Sabattier / solarization darkroom effect.  Returns a *new*
 * ImageData — the original is not modified.
 */

export interface SolarizeParams {
  /** Channel values above this threshold are inverted (0-255). */
  threshold: number
}

/**
 * Apply a solarize effect to `imageData`.
 *
 * @returns A new ImageData with the solarized result.
 */
export function applySolarize(imageData: ImageData, params: SolarizeParams): ImageData {
  const { threshold } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    // Solarize each RGB channel independently
    for (let c = 0; c < 3; c++) {
      const val = src[i + c]!
      dst[i + c] = val > threshold ? 255 - val : val
    }
    // Preserve alpha
    dst[i + 3] = src[i + 3]!
  }

  return out
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
