/**
 * Emboss filter for raster layers.
 *
 * Applies a directional 3x3 emboss convolution kernel that produces a
 * raised/chiselled appearance.  The kernel is rotated according to `angle`,
 * and the result is blended with a neutral grey (128) bias so flat areas
 * appear mid-grey.  Returns a *new* ImageData — the original is not modified.
 */

export interface EmbossParams {
  /** Direction angle in degrees (0 = top-left to bottom-right). */
  angle: number
  /** Emboss height / depth multiplier. */
  height: number
  /** Blend amount: 0 = original, 1 = fully embossed. */
  amount: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply an emboss filter to `imageData`.
 *
 * @returns A new ImageData with the embossed result.
 */
export function applyEmboss(imageData: ImageData, params: EmbossParams): ImageData {
  const { angle, height, amount } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  if (amount === 0) {
    dst.set(src)
    return out
  }

  // Build a rotated 3x3 emboss kernel.
  // Base kernel (top-left light, 45 degrees):
  //   [-2, -1,  0]
  //   [-1,  1,  1]
  //   [ 0,  1,  2]
  // We rotate by computing directional offsets.
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  // The 3x3 offsets (relative to centre):
  const offsets: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]

  // Base emboss kernel weights (zero-sum so flat areas → 0 + bias = neutral grey)
  const baseKernel = [-2, -1, 0, -1, 0, 1, 0, 1, 2]

  // Rotate the kernel: compute new weights by mapping each offset through rotation
  // and interpolating from the base kernel grid.
  const kernel: number[] = new Array(9)
  for (let i = 0; i < 9; i++) {
    const [ox, oy] = offsets[i]!
    // Rotate the offset
    const rx = ox * cos - oy * sin
    const ry = ox * sin + oy * cos
    // Bilinear sample from the base kernel grid
    const gx = rx + 1 // map [-1,1] to [0,2]
    const gy = ry + 1

    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const x1 = Math.min(x0 + 1, 2)
    const y1 = Math.min(y0 + 1, 2)
    const fx = gx - x0
    const fy = gy - y0

    const cx0 = Math.max(0, Math.min(2, x0))
    const cy0 = Math.max(0, Math.min(2, y0))
    const cx1 = Math.max(0, Math.min(2, x1))
    const cy1 = Math.max(0, Math.min(2, y1))

    const v00 = baseKernel[cy0 * 3 + cx0]!
    const v10 = baseKernel[cy0 * 3 + cx1]!
    const v01 = baseKernel[cy1 * 3 + cx0]!
    const v11 = baseKernel[cy1 * 3 + cx1]!

    kernel[i] = (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy) * height
  }

  // Apply convolution
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0

      for (let k = 0; k < 9; k++) {
        const [kx, ky] = offsets[k]!
        const sx = Math.max(0, Math.min(w - 1, x + kx))
        const sy = Math.max(0, Math.min(h - 1, y + ky))
        const si = (sy * w + sx) * 4
        const kw = kernel[k]!

        rSum += src[si]! * kw
        gSum += src[si + 1]! * kw
        bSum += src[si + 2]! * kw
      }

      // Add 128 bias for neutral grey
      const embR = rSum + 128
      const embG = gSum + 128
      const embB = bSum + 128

      const idx = (y * w + x) * 4
      const origR = src[idx]!
      const origG = src[idx + 1]!
      const origB = src[idx + 2]!

      // Blend between original and embossed based on amount
      dst[idx] = clamp255(origR + (embR - origR) * amount)
      dst[idx + 1] = clamp255(origG + (embG - origG) * amount)
      dst[idx + 2] = clamp255(origB + (embB - origB) * amount)
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
