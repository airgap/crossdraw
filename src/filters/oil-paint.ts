/**
 * Oil Paint filter for raster layers.
 *
 * Uses a Kuwahara-style algorithm: for each pixel, examine the neighbourhood
 * within `radius`, quantize each neighbour's intensity into one of `levels`
 * bins, and replace the output pixel with the average colour of the most
 * frequent bin.  This produces flat, painterly colour regions reminiscent of
 * oil painting.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

export interface OilPaintParams {
  /** Neighbourhood radius in pixels (1-10 typical). */
  radius: number
  /** Number of intensity bins (2-30). More levels = finer detail. */
  levels: number
}

/**
 * Apply an oil-paint effect to `imageData`.
 *
 * @returns A new ImageData with the oil-painted result.
 */
export function applyOilPaint(imageData: ImageData, params: OilPaintParams): ImageData {
  const { radius: rawRadius, levels: rawLevels } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  const radius = Math.max(1, Math.round(rawRadius))
  const levels = Math.max(2, Math.min(256, Math.round(rawLevels)))

  const out = createImageData(w, h)
  const dst = out.data

  // Pre-allocate per-bin accumulators (reused per pixel)
  const binCount = new Uint32Array(levels)
  const binR = new Float64Array(levels)
  const binG = new Float64Array(levels)
  const binB = new Float64Array(levels)
  const binA = new Float64Array(levels)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Reset bins
      binCount.fill(0)
      binR.fill(0)
      binG.fill(0)
      binB.fill(0)
      binA.fill(0)

      // Scan neighbourhood
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(w - 1, x + radius)
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(h - 1, y + radius)

      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const idx = (ny * w + nx) * 4
          const r = src[idx]!
          const g = src[idx + 1]!
          const b = src[idx + 2]!
          const a = src[idx + 3]!

          // ITU-R BT.709 intensity, quantized to bin
          const intensity = 0.2126 * r + 0.7152 * g + 0.0722 * b
          const bin = Math.min(levels - 1, Math.floor((intensity / 255) * levels))

          binCount[bin]!++
          binR[bin]! += r
          binG[bin]! += g
          binB[bin]! += b
          binA[bin]! += a
        }
      }

      // Find the most frequent bin
      let maxBin = 0
      let maxCount = 0
      for (let i = 0; i < levels; i++) {
        if (binCount[i]! > maxCount) {
          maxCount = binCount[i]!
          maxBin = i
        }
      }

      // Output = average colour of the most frequent bin
      const dstIdx = (y * w + x) * 4
      const cnt = maxCount || 1
      dst[dstIdx] = Math.round(binR[maxBin]! / cnt)
      dst[dstIdx + 1] = Math.round(binG[maxBin]! / cnt)
      dst[dstIdx + 2] = Math.round(binB[maxBin]! / cnt)
      dst[dstIdx + 3] = Math.round(binA[maxBin]! / cnt)
    }
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
