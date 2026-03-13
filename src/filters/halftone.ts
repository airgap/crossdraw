/**
 * Halftone filter for raster layers.
 *
 * Divides the image into cells of `dotSize x dotSize`, computes the average
 * luminance per cell, then renders a shape (circle, diamond, line, or cross)
 * sized proportional to that luminance.  Anti-aliasing is achieved via signed
 * distance functions.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

export interface HalftoneParams {
  /** Cell size in pixels. */
  dotSize: number
  /** Rotation angle of the halftone grid in degrees. */
  angle: number
  /** Dot shape. */
  shape: 'circle' | 'diamond' | 'line' | 'cross'
}

/**
 * Apply a halftone effect to `imageData`.
 *
 * @returns A new ImageData with the halftone result.
 */
export function applyHalftone(imageData: ImageData, params: HalftoneParams): ImageData {
  const { dotSize: rawDotSize, angle, shape } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  const dotSize = Math.max(2, Math.round(rawDotSize))

  const out = createImageData(w, h)
  const dst = out.data

  // Pre-compute rotation
  const rad = (angle * Math.PI) / 180
  const cosA = Math.cos(rad)
  const sinA = Math.sin(rad)
  const halfCell = dotSize / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Rotate (x, y) into halftone grid space
      const rx = cosA * x + sinA * y
      const ry = -sinA * x + cosA * y

      // Find cell centre in rotated space
      const cellX = Math.floor(rx / dotSize) * dotSize + halfCell
      const cellY = Math.floor(ry / dotSize) * dotSize + halfCell

      // Rotate cell centre back to image space
      const cx = cosA * cellX - sinA * cellY
      const cy = sinA * cellX + cosA * cellY

      // Compute average luminance of the cell by sampling the cell area
      // For efficiency, sample a limited neighbourhood around the cell centre
      const sampleRadius = Math.ceil(dotSize / 2)
      let lumSum = 0
      let lumCount = 0

      const sx0 = Math.max(0, Math.round(cx) - sampleRadius)
      const sx1 = Math.min(w - 1, Math.round(cx) + sampleRadius)
      const sy0 = Math.max(0, Math.round(cy) - sampleRadius)
      const sy1 = Math.min(h - 1, Math.round(cy) + sampleRadius)

      for (let sy = sy0; sy <= sy1; sy++) {
        for (let sx = sx0; sx <= sx1; sx++) {
          const idx = (sy * w + sx) * 4
          lumSum += 0.2126 * src[idx]! + 0.7152 * src[idx + 1]! + 0.0722 * src[idx + 2]!
          lumCount++
        }
      }

      const avgLum = lumCount > 0 ? lumSum / lumCount / 255 : 0

      // Offset from cell centre (in rotated space)
      const dx = rx - cellX
      const dy = ry - cellY

      // Compute signed distance for the chosen shape
      let dist: number
      const maxRadius = halfCell * Math.sqrt(avgLum)

      switch (shape) {
        case 'circle': {
          const r = Math.sqrt(dx * dx + dy * dy)
          dist = r - maxRadius
          break
        }
        case 'diamond': {
          const r = Math.abs(dx) + Math.abs(dy)
          dist = r - maxRadius * 1.2
          break
        }
        case 'line': {
          // Horizontal lines in grid space, thickness proportional to luminance
          dist = Math.abs(dy) - maxRadius
          break
        }
        case 'cross': {
          const dMin = Math.min(Math.abs(dx), Math.abs(dy))
          dist = dMin - maxRadius * 0.6
          break
        }
      }

      // Anti-aliased fill: smooth step over 1px transition
      const fill = smoothstep(0.5, -0.5, dist)

      // Preserve original alpha
      const srcIdx = (y * w + x) * 4
      const a = src[srcIdx + 3]!

      const v = Math.round(fill * 255)
      dst[srcIdx] = v
      dst[srcIdx + 1] = v
      dst[srcIdx + 2] = v
      dst[srcIdx + 3] = a
    }
  }

  return out
}

// ── Internal helpers ─────────────────────────────────────────

/** Hermite smooth step for anti-aliasing. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

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
