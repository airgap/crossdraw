/**
 * Surface blur (edge-preserving bilateral filter) for raster layers.
 *
 * For each pixel, averages neighbours within `radius` whose colour difference
 * is below `threshold`.  This smooths flat areas while preserving hard edges.
 * Returns a *new* ImageData — the original is not modified.
 */

export interface SurfaceBlurParams {
  /** Neighbourhood radius in pixels. */
  radius: number
  /** Colour difference threshold (0-255). Neighbours further away in colour space are excluded. */
  threshold: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply a surface blur (bilateral filter) to `imageData`.
 *
 * @returns A new ImageData with the blurred result.
 */
export function applySurfaceBlur(imageData: ImageData, params: SurfaceBlurParams): ImageData {
  const { radius, threshold } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  if (radius <= 0 || threshold <= 0) {
    dst.set(src)
    return out
  }

  const r = Math.round(radius)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const srcR = src[idx]!
      const srcG = src[idx + 1]!
      const srcB = src[idx + 2]!

      let sumR = 0
      let sumG = 0
      let sumB = 0
      let weight = 0

      const yMin = Math.max(0, y - r)
      const yMax = Math.min(h - 1, y + r)
      const xMin = Math.max(0, x - r)
      const xMax = Math.min(w - 1, x + r)

      for (let ny = yMin; ny <= yMax; ny++) {
        for (let nx = xMin; nx <= xMax; nx++) {
          const nIdx = (ny * w + nx) * 4
          const nR = src[nIdx]!
          const nG = src[nIdx + 1]!
          const nB = src[nIdx + 2]!

          // Colour distance (max of per-channel differences)
          const diff = Math.max(Math.abs(nR - srcR), Math.abs(nG - srcG), Math.abs(nB - srcB))

          if (diff <= threshold) {
            // Weight falls off linearly as diff approaches threshold
            const w = 1 - diff / threshold
            sumR += nR * w
            sumG += nG * w
            sumB += nB * w
            weight += w
          }
        }
      }

      if (weight > 0) {
        dst[idx] = clamp255(sumR / weight)
        dst[idx + 1] = clamp255(sumG / weight)
        dst[idx + 2] = clamp255(sumB / weight)
      } else {
        dst[idx] = srcR
        dst[idx + 1] = srcG
        dst[idx + 2] = srcB
      }
      // Preserve alpha
      dst[idx + 3] = src[idx + 3]!
    }
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
