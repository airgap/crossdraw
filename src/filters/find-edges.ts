/**
 * Find Edges filter for raster layers.
 *
 * Uses the Sobel operator to compute horizontal and vertical gradients,
 * then combines them as magnitude = sqrt(Gx^2 + Gy^2).  A threshold
 * parameter suppresses weak edges.  Returns a *new* ImageData — the
 * original is not modified.
 */

export interface FindEdgesParams {
  /** Edges with magnitude below this threshold are set to black (0-255). */
  threshold: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply Sobel edge detection to `imageData`.
 *
 * @returns A new ImageData with edges highlighted on a black background.
 */
export function applyFindEdges(imageData: ImageData, params: FindEdgesParams): ImageData {
  const { threshold } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  // Sobel kernels
  // Gx:                Gy:
  // [-1,  0,  1]       [-1, -2, -1]
  // [-2,  0,  2]       [ 0,  0,  0]
  // [-1,  0,  1]       [ 1,  2,  1]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gxR = 0,
        gxG = 0,
        gxB = 0
      let gyR = 0,
        gyG = 0,
        gyB = 0

      // Sample 3x3 neighbourhood
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.max(0, Math.min(w - 1, x + kx))
          const sy = Math.max(0, Math.min(h - 1, y + ky))
          const si = (sy * w + sx) * 4
          const r = src[si]!
          const g = src[si + 1]!
          const b = src[si + 2]!

          // Sobel X weights
          const wx = kx === 0 ? 0 : kx * (ky === 0 ? 2 : 1)
          gxR += r * wx
          gxG += g * wx
          gxB += b * wx

          // Sobel Y weights
          const wy = ky === 0 ? 0 : ky * (kx === 0 ? 2 : 1)
          gyR += r * wy
          gyG += g * wy
          gyB += b * wy
        }
      }

      // Magnitude per channel
      const magR = Math.sqrt(gxR * gxR + gyR * gyR)
      const magG = Math.sqrt(gxG * gxG + gyG * gyG)
      const magB = Math.sqrt(gxB * gxB + gyB * gyB)

      const idx = (y * w + x) * 4

      // Apply threshold: edges below threshold become black
      dst[idx] = magR >= threshold ? clamp255(magR) : 0
      dst[idx + 1] = magG >= threshold ? clamp255(magG) : 0
      dst[idx + 2] = magB >= threshold ? clamp255(magB) : 0
      dst[idx + 3] = src[idx + 3]! // Preserve alpha
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
