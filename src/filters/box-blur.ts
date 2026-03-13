/**
 * Box blur filter for raster layers.
 *
 * Thin wrapper around the single-pass box blur from progressive-blur.ts.
 * Unlike the Gaussian blur (which uses 3 iterated box blur passes), this
 * applies a single-pass box average — faster but with more visible box
 * artefacts.  Returns a *new* ImageData — the original is not modified.
 */

import { boxBlur } from '@/filters/progressive-blur'

export interface BoxBlurParams {
  /** Blur radius in pixels. 0 = no blur. */
  radius: number
}

/**
 * Apply a single-pass box blur to `imageData`.
 *
 * @returns A new ImageData with the blurred result.
 */
export function applyBoxBlur(imageData: ImageData, params: BoxBlurParams): ImageData {
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
