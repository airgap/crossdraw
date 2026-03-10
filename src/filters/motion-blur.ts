/**
 * Motion blur and radial blur filters for raster layers.
 *
 * - **Motion blur**: averages pixels along a straight line at a given angle.
 * - **Radial blur**: averages pixels along radial lines emanating from a centre.
 *
 * Both return a *new* ImageData — the original is not modified.
 */

export interface MotionBlurParams {
  /** Angle in degrees (0 = horizontal right, 90 = vertical down). */
  angle: number
  /** Length of the blur in pixels. */
  distance: number
}

export interface RadialBlurParams {
  /** Centre X coordinate (in pixels). */
  centerX: number
  /** Centre Y coordinate (in pixels). */
  centerY: number
  /** Blur strength — number of samples along each radial line. Higher = more blur. */
  amount: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply directional (motion) blur by averaging pixels along the line defined
 * by `angle` over `distance` pixels.
 */
export function applyMotionBlur(imageData: ImageData, params: MotionBlurParams): ImageData {
  const { angle, distance } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  const out = createImageData(w, h)
  const dst = out.data

  if (distance <= 0) {
    dst.set(src)
    return out
  }

  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)

  // Number of samples along the motion line (always odd for symmetry).
  const samples = Math.max(1, Math.round(distance)) | 1
  const halfSamples = (samples - 1) / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0

      for (let s = 0; s < samples; s++) {
        const offset = s - halfSamples
        const sx = Math.round(x + offset * dx)
        const sy = Math.round(y + offset * dy)

        // Clamp to image bounds
        const cx = Math.max(0, Math.min(w - 1, sx))
        const cy = Math.max(0, Math.min(h - 1, sy))
        const pi = (cy * w + cx) * 4

        rSum += src[pi]!
        gSum += src[pi + 1]!
        bSum += src[pi + 2]!
        aSum += src[pi + 3]!
      }

      const idx = (y * w + x) * 4
      dst[idx] = clamp255(rSum / samples)
      dst[idx + 1] = clamp255(gSum / samples)
      dst[idx + 2] = clamp255(bSum / samples)
      dst[idx + 3] = clamp255(aSum / samples)
    }
  }

  return out
}

/**
 * Apply radial blur: for each pixel, average along the radial direction from
 * `(centerX, centerY)` through the pixel.  The number of samples increases
 * with `amount`.
 */
export function applyRadialBlur(imageData: ImageData, params: RadialBlurParams): ImageData {
  const { centerX, centerY, amount } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  const out = createImageData(w, h)
  const dst = out.data

  const samples = Math.max(1, Math.round(amount))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 0.5 || samples <= 1) {
        // At the centre (or no blur), just copy the pixel.
        const pi = (y * w + x) * 4
        dst[pi] = src[pi]!
        dst[pi + 1] = src[pi + 1]!
        dst[pi + 2] = src[pi + 2]!
        dst[pi + 3] = src[pi + 3]!
        continue
      }

      // Normalised direction from centre through this pixel
      const ndx = dx / dist
      const ndy = dy / dist

      // Sample along the radial line, spread proportional to distance from centre.
      // The blur spread scales with distance so farther pixels get more blur.
      const spread = (dist / Math.max(w, h)) * samples

      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0

      const sampleCount = Math.max(1, Math.round(spread)) * 2 + 1
      const halfCount = (sampleCount - 1) / 2

      for (let s = 0; s < sampleCount; s++) {
        const offset = s - halfCount
        const sx = Math.max(0, Math.min(w - 1, Math.round(x + offset * ndx)))
        const sy = Math.max(0, Math.min(h - 1, Math.round(y + offset * ndy)))
        const pi = (sy * w + sx) * 4

        rSum += src[pi]!
        gSum += src[pi + 1]!
        bSum += src[pi + 2]!
        aSum += src[pi + 3]!
      }

      const idx = (y * w + x) * 4
      dst[idx] = clamp255(rSum / sampleCount)
      dst[idx + 1] = clamp255(gSum / sampleCount)
      dst[idx + 2] = clamp255(bSum / sampleCount)
      dst[idx + 3] = clamp255(aSum / sampleCount)
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
