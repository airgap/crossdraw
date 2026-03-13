/**
 * Gaussian blur filter for raster layers.
 *
 * Wraps the existing iterated box-blur from progressive-blur.ts (3-pass box
 * blur ≈ Gaussian) and exposes a simple `applyGaussianBlur(imageData, radius)`
 * API.  Returns a *new* ImageData — the original is not modified.
 */

import { boxBlur } from '@/filters/progressive-blur'

export interface GaussianBlurParams {
  /** Blur radius in pixels. 0 = no blur. */
  radius: number
}

/**
 * Apply a Gaussian blur approximation to `imageData`.
 *
 * @returns A new ImageData with the blurred result.
 */
export function applyGaussianBlur(imageData: ImageData, params: GaussianBlurParams): ImageData {
  if (params.radius <= 0) {
    const copy = createImageData(imageData.width, imageData.height)
    copy.data.set(imageData.data)
    return copy
  }
  return boxBlur(imageData, Math.round(params.radius))
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
