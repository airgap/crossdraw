/**
 * Clarity filter — local contrast enhancement targeting midtones.
 *
 * Algorithm:
 * 1. Blur the image with a large radius (~20px) to approximate "midtone blur".
 * 2. Compute difference = original - blurred.
 * 3. Weight the difference by midtone proximity: w = 1 - |lum * 2 - 1|
 *    (peaks at mid-luminance, zero at pure black/white).
 * 4. Result = original + amount * weighted difference.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

import { boxBlur } from '@/filters/progressive-blur'

export interface ClarityParams {
  /** Clarity strength (-1 to 1 typical, higher = more local contrast). */
  amount: number
}

/** Clamp to 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/** Create an ImageData, with fallback for non-browser environments. */
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

/**
 * Apply clarity (local midtone contrast enhancement) to `imageData`.
 *
 * @returns A new ImageData with the clarity-enhanced result.
 */
export function applyClarity(imageData: ImageData, params: ClarityParams): ImageData {
  const { amount } = params
  const w = imageData.width
  const h = imageData.height

  // No change when amount is zero
  if (amount === 0) {
    const copy = createImageData(w, h)
    copy.data.set(imageData.data)
    return copy
  }

  // Step 1: Blur the image with a large radius to capture midtone structure
  const blurRadius = Math.max(1, Math.min(20, Math.round(Math.min(w, h) / 4)))
  const blurred = boxBlur(imageData, blurRadius)

  // Step 2 & 3: Build output with midtone-weighted local contrast boost
  const out = createImageData(w, h)
  const src = imageData.data
  const blur = blurred.data
  const dst = out.data
  const len = src.length

  for (let i = 0; i < len; i += 4) {
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!

    // Luminance in 0-1 range
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255

    // Midtone weight: peaks at lum=0.5, zero at 0 and 1
    const midWeight = 1 - Math.abs(lum * 2 - 1)

    for (let c = 0; c < 3; c++) {
      const orig = src[i + c]!
      const blurVal = blur[i + c]!
      const diff = orig - blurVal
      dst[i + c] = clamp255(orig + amount * midWeight * diff)
    }

    // Preserve alpha
    dst[i + 3] = src[i + 3]!
  }

  return out
}
