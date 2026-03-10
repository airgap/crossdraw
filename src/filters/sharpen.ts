/**
 * Sharpen / Unsharp Mask filter for raster layers.
 *
 * The unsharp mask algorithm:
 * 1. Blur a copy of the image (box blur approximation).
 * 2. Compute the difference between original and blurred.
 * 3. If the absolute difference exceeds `threshold`, amplify it by `amount`
 *    and add it back to the original pixel.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

import { boxBlur } from '@/filters/progressive-blur'

export interface SharpenParams {
  /** Sharpening strength multiplier (e.g. 0.5 = subtle, 2.0 = aggressive). */
  amount: number
  /** Blur radius used to build the unsharp mask (pixels). */
  radius: number
  /** Per-channel difference threshold below which sharpening is not applied (0-255). */
  threshold: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply an unsharp-mask sharpen to `imageData`.
 *
 * @returns A new ImageData with the sharpened result.
 */
export function applySharpen(imageData: ImageData, params: SharpenParams): ImageData {
  const { amount, radius, threshold } = params
  const w = imageData.width
  const h = imageData.height

  // If radius is zero or amount is zero, return a copy unchanged.
  if (radius <= 0 || amount === 0) {
    const copy = createImageData(w, h)
    copy.data.set(imageData.data)
    return copy
  }

  // Step 1: Create a blurred copy.
  const blurred = boxBlur(imageData, Math.round(radius))

  // Step 2: Build the output by adding the amplified difference.
  const out = createImageData(w, h)
  const src = imageData.data
  const blur = blurred.data
  const dst = out.data
  const len = src.length

  for (let i = 0; i < len; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = src[i + c]!
      const blurVal = blur[i + c]!
      const diff = orig - blurVal

      if (Math.abs(diff) >= threshold) {
        dst[i + c] = clamp255(orig + diff * amount)
      } else {
        dst[i + c] = orig
      }
    }
    // Preserve alpha
    dst[i + 3] = src[i + 3]!
  }

  return out
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
