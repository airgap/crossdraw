/**
 * Denoise filter — simplified non-local means denoising.
 *
 * For each pixel, searches a local window (11x11) for patches (3x3) that
 * are similar to the current patch.  Each candidate is weighted by patch
 * similarity:  w = exp(-dist^2 / strength^2).  The output pixel is the
 * weighted average of the centre pixels of all matching patches.
 *
 * The `detail` parameter (0-1) limits denoising in high-gradient areas so
 * that edges and fine detail are preserved.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

export interface DenoiseParams {
  /** Denoising strength — higher values remove more noise but may lose detail. */
  strength: number
  /** Detail preservation (0-1). Higher values keep more edge detail. */
  detail: number
}

/** Clamp to 0-255. */
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
 * Apply non-local means denoising to `imageData`.
 *
 * @returns A new ImageData with the denoised result.
 */
export function applyDenoise(imageData: ImageData, params: DenoiseParams): ImageData {
  const { strength, detail } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  // No-op if strength is zero
  if (strength <= 0) {
    const copy = createImageData(w, h)
    copy.data.set(src)
    return copy
  }

  const out = createImageData(w, h)
  const dst = out.data

  // Parameters
  const SEARCH_RADIUS = 5 // 11x11 search window
  const PATCH_RADIUS = 1 // 3x3 patch
  const hSq = strength * strength // filter parameter squared

  // Pre-compute luminance for gradient detection (detail preservation)
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4
    lum[i] = src[pi]! * 0.299 + src[pi + 1]! * 0.587 + src[pi + 2]! * 0.114
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Compute local gradient magnitude for detail preservation
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const gx = Math.abs(lum[y * w + xp]! - lum[y * w + xm]!)
      const gy = Math.abs(lum[yp * w + x]! - lum[ym * w + x]!)
      const gradient = Math.sqrt(gx * gx + gy * gy) / 255

      // Detail factor: reduce denoising in high-gradient areas
      // At detail=0, full denoising everywhere; at detail=1, edges are fully preserved
      const detailFactor = 1 - detail * Math.min(1, gradient * 4)
      if (detailFactor <= 0.01) {
        // Preserve this pixel as-is
        const pi = (y * w + x) * 4
        dst[pi] = src[pi]!
        dst[pi + 1] = src[pi + 1]!
        dst[pi + 2] = src[pi + 2]!
        dst[pi + 3] = src[pi + 3]!
        continue
      }

      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumW = 0

      // Search window
      const sy0 = Math.max(PATCH_RADIUS, y - SEARCH_RADIUS)
      const sy1 = Math.min(h - 1 - PATCH_RADIUS, y + SEARCH_RADIUS)
      const sx0 = Math.max(PATCH_RADIUS, x - SEARCH_RADIUS)
      const sx1 = Math.min(w - 1 - PATCH_RADIUS, x + SEARCH_RADIUS)

      for (let sy = sy0; sy <= sy1; sy++) {
        for (let sx = sx0; sx <= sx1; sx++) {
          // Compute patch distance (sum of squared differences)
          let patchDist = 0
          for (let py = -PATCH_RADIUS; py <= PATCH_RADIUS; py++) {
            for (let px = -PATCH_RADIUS; px <= PATCH_RADIUS; px++) {
              // Clamp coordinates (patches near edges)
              const cy1 = Math.max(0, Math.min(h - 1, y + py))
              const cx1 = Math.max(0, Math.min(w - 1, x + px))
              const cy2 = Math.max(0, Math.min(h - 1, sy + py))
              const cx2 = Math.max(0, Math.min(w - 1, sx + px))

              const rpi1 = (cy1 * w + cx1) * 4
              const rpi2 = (cy2 * w + cx2) * 4

              const dr = src[rpi1]! - src[rpi2]!
              const dg = src[rpi1 + 1]! - src[rpi2 + 1]!
              const db = src[rpi1 + 2]! - src[rpi2 + 2]!
              patchDist += dr * dr + dg * dg + db * db
            }
          }

          // Normalise by patch size (9 pixels * 3 channels)
          const patchSize = (2 * PATCH_RADIUS + 1) * (2 * PATCH_RADIUS + 1) * 3
          patchDist /= patchSize

          // Weight by similarity
          const weight = Math.exp(-patchDist / hSq)
          const cpi = (sy * w + sx) * 4
          sumR += weight * src[cpi]!
          sumG += weight * src[cpi + 1]!
          sumB += weight * src[cpi + 2]!
          sumW += weight
        }
      }

      const pi = (y * w + x) * 4
      if (sumW > 0) {
        // Blend between original and denoised based on detailFactor
        const denR = sumR / sumW
        const denG = sumG / sumW
        const denB = sumB / sumW
        dst[pi] = clamp255(src[pi]! + detailFactor * (denR - src[pi]!))
        dst[pi + 1] = clamp255(src[pi + 1]! + detailFactor * (denG - src[pi + 1]!))
        dst[pi + 2] = clamp255(src[pi + 2]! + detailFactor * (denB - src[pi + 2]!))
      } else {
        dst[pi] = src[pi]!
        dst[pi + 1] = src[pi + 1]!
        dst[pi + 2] = src[pi + 2]!
      }
      dst[pi + 3] = src[pi + 3]!
    }
  }

  return out
}
