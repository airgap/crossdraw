/**
 * Wind filter for raster layers.
 *
 * Creates horizontal streaking / motion effects.  Three methods:
 *  - **wind**: smooth linear trailing streaks
 *  - **blast**: stronger, more random displacement
 *  - **stagger**: jagged, staircase-like displacement
 *
 * Returns a *new* ImageData — the original is not modified.
 */

export interface WindParams {
  /** Streak length / strength in pixels (1-100). */
  strength: number
  /** Direction the wind blows from. */
  direction: 'left' | 'right'
  /** Rendering method. */
  method: 'wind' | 'blast' | 'stagger'
}

/**
 * Apply a wind streaking effect to `imageData`.
 *
 * @returns A new ImageData with the wind result.
 */
export function applyWind(imageData: ImageData, params: WindParams): ImageData {
  const { strength, direction, method } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  // Start with a copy
  dst.set(src)

  if (strength <= 0) return out

  // Simple seeded PRNG for deterministic results
  let seed = 12345
  function rand(): number {
    seed = (seed * 16807 + 0) % 2147483647
    return (seed - 1) / 2147483646
  }

  const maxLen = Math.round(strength)
  const dir = direction === 'right' ? 1 : -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      // Determine streak length for this pixel
      let streakLen: number
      switch (method) {
        case 'wind':
          streakLen = Math.round(rand() * maxLen)
          break
        case 'blast':
          // Stronger, more uniform streaks
          streakLen = Math.round((0.5 + rand() * 0.5) * maxLen)
          break
        case 'stagger':
          // Quantised to steps of 3-5 pixels for jagged look
          streakLen = Math.round(rand() * maxLen)
          streakLen = Math.round(streakLen / 4) * 4
          break
      }

      if (streakLen <= 0) continue

      // Blend along the streak direction
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let count = 0

      for (let s = 0; s <= streakLen; s++) {
        const sx = x - dir * s
        if (sx < 0 || sx >= w) break
        const si = (y * w + sx) * 4

        // Weight falls off with distance
        const weight = 1 - s / (streakLen + 1)
        rSum += src[si]! * weight
        gSum += src[si + 1]! * weight
        bSum += src[si + 2]! * weight
        count += weight
      }

      if (count > 0) {
        dst[idx] = clamp255(rSum / count)
        dst[idx + 1] = clamp255(gSum / count)
        dst[idx + 2] = clamp255(bSum / count)
      }
      // Alpha unchanged (already copied)
    }
  }

  return out
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
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
