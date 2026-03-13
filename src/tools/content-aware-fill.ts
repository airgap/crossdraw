import type { SelectionMask } from '@/tools/raster-selection'

/**
 * Content-Aware Fill — fills a selected region with texture sampled from the
 * surrounding area using a simplified PatchMatch algorithm.
 *
 * Pipeline:
 *   1. Initialize: for each pixel in the selection, assign a random source
 *      offset pointing outside the selection.
 *   2. Propagation: check if a neighbor's offset works better for the current
 *      pixel (lower patch distance).
 *   3. Random search: try random offsets at decreasing radii.
 *   4. Repeat propagation + search for several iterations.
 *   5. Fill: copy pixels from best-matching source offsets.
 *   6. Blend: feather at selection edges for seamless compositing.
 */

export interface ContentAwareFillSettings {
  /** Where to sample replacement texture from. */
  sampleArea: 'auto' | 'custom'
  /** Feather radius (px) for blending at the selection boundary. 0–50. */
  blendAmount: number
  /** How strongly to adapt color from the destination surroundings. 0–1. */
  colorAdaptation: number
}

const defaultSettings: ContentAwareFillSettings = {
  sampleArea: 'auto',
  blendAmount: 4,
  colorAdaptation: 0.5,
}

let currentSettings: ContentAwareFillSettings = { ...defaultSettings }

export function getContentAwareFillSettings(): ContentAwareFillSettings {
  return { ...currentSettings }
}

export function setContentAwareFillSettings(patch: Partial<ContentAwareFillSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Internals ──

/** Half-size of the comparison patch (full patch = 2*HALF+1). */
const HALF_PATCH = 3 // 7×7

/** Number of PatchMatch iterations. */
const ITERATIONS = 5

/**
 * Compute the sum-of-squared-differences between two 7×7 patches centred on
 * (ax, ay) and (bx, by) in the given RGBA pixel buffer.  Only pixels that
 * fall within bounds are compared; out-of-bounds pixels are skipped and a
 * penalty is added so that border patches don't dominate.
 */
function patchDistance(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  let sum = 0
  let count = 0
  for (let dy = -HALF_PATCH; dy <= HALF_PATCH; dy++) {
    for (let dx = -HALF_PATCH; dx <= HALF_PATCH; dx++) {
      const x1 = ax + dx
      const y1 = ay + dy
      const x2 = bx + dx
      const y2 = by + dy
      if (x1 < 0 || y1 < 0 || x1 >= w || y1 >= h) continue
      if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) continue
      const i1 = (y1 * w + x1) * 4
      const i2 = (y2 * w + x2) * 4
      const dr = data[i1]! - data[i2]!
      const dg = data[i1 + 1]! - data[i2 + 1]!
      const db = data[i1 + 2]! - data[i2 + 2]!
      sum += dr * dr + dg * dg + db * db
      count++
    }
  }
  // Penalise patches that had few valid comparisons
  if (count === 0) return 1e9
  return (sum / count) * (HALF_PATCH * 2 + 1) ** 2
}

/**
 * Build a distance-to-boundary map for the selection mask.  Each selected
 * pixel gets its Chebyshev distance to the nearest unselected pixel so we can
 * feather the blending near the edges.
 */
function buildDistanceMap(mask: SelectionMask): Float32Array {
  const { width: w, height: h, data } = mask
  const dist = new Float32Array(w * h).fill(1e6)

  // Forward pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (data[idx]! === 0) {
        dist[idx] = 0
        continue
      }
      const up = y > 0 ? dist[(y - 1) * w + x]! + 1 : 0
      const left = x > 0 ? dist[y * w + (x - 1)]! + 1 : 0
      dist[idx] = Math.min(dist[idx]!, up, left)
    }
  }

  // Backward pass
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const idx = y * w + x
      if (data[idx]! === 0) continue
      const down = y < h - 1 ? dist[(y + 1) * w + x]! + 1 : 0
      const right = x < w - 1 ? dist[y * w + (x + 1)]! + 1 : 0
      dist[idx] = Math.min(dist[idx]!, down, right)
    }
  }

  return dist
}

/**
 * Collect a list of pixel indices that lie outside the selection mask — these
 * are valid source pixels for PatchMatch.
 */
function collectSourcePixels(mask: SelectionMask): number[] {
  const sources: number[] = []
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]! === 0) sources.push(i)
  }
  return sources
}

/**
 * Simple seeded PRNG (xorshift32) — deterministic and fast.
 */
function xorshift32(state: { s: number }): number {
  let s = state.s
  s ^= s << 13
  s ^= s >> 17
  s ^= s << 5
  state.s = s
  return (s >>> 0) / 0xffffffff
}

/**
 * Perform content-aware fill on the selected region of the image.
 *
 * @param imageData  The source ImageData (will NOT be mutated).
 * @param mask       Selection mask — pixels with value > 0 will be filled.
 * @param settings   Algorithm settings.
 * @returns A new ImageData with the fill applied.
 */
export function performContentAwareFill(
  imageData: ImageData,
  mask: SelectionMask,
  settings: ContentAwareFillSettings = currentSettings,
): ImageData {
  const w = imageData.width
  const h = imageData.height

  // Clone pixel data so we don't mutate the original
  const result = new Uint8ClampedArray(imageData.data)

  const sourcePixels = collectSourcePixels(mask)
  if (sourcePixels.length === 0) {
    // Nothing outside the selection to sample from — return as-is
    return new ImageData(result, w, h)
  }

  // Collect target (selected) pixel positions
  const targetPixels: number[] = []
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]! > 0) targetPixels.push(i)
  }
  if (targetPixels.length === 0) {
    return new ImageData(result, w, h)
  }

  // ── PatchMatch NNF (nearest neighbour field) ──

  // For each target pixel, store the best matching source pixel index
  const nnf = new Int32Array(w * h) // maps pixel-index → source pixel-index
  const nnfDist = new Float64Array(w * h).fill(1e18)

  const rng = { s: 12345 }

  // 1. Initialize: random source offset for each target pixel
  for (const tIdx of targetPixels) {
    const sIdx = sourcePixels[Math.floor(xorshift32(rng) * sourcePixels.length)]!
    nnf[tIdx] = sIdx
    const tx = tIdx % w
    const ty = (tIdx - tx) / w
    const sx = sIdx % w
    const sy = (sIdx - sx) / w
    nnfDist[tIdx] = patchDistance(imageData.data, w, h, tx, ty, sx, sy)
  }

  // Helper: try to improve the NNF entry for a target pixel
  function tryImprove(tIdx: number, candidateSrcIdx: number): void {
    if (candidateSrcIdx < 0 || candidateSrcIdx >= w * h) return
    if (mask.data[candidateSrcIdx]! > 0) return // must be outside selection

    const tx = tIdx % w
    const ty = (tIdx - tx) / w
    const sx = candidateSrcIdx % w
    const sy = (candidateSrcIdx - sx) / w

    const d = patchDistance(imageData.data, w, h, tx, ty, sx, sy)
    if (d < nnfDist[tIdx]!) {
      nnf[tIdx] = candidateSrcIdx
      nnfDist[tIdx] = d
    }
  }

  // 2–4. Iterate propagation + random search
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forward = iter % 2 === 0

    const order = forward ? targetPixels : [...targetPixels].reverse()

    for (const tIdx of order) {
      const tx = tIdx % w
      const ty = (tIdx - tx) / w

      // ── Propagation ──
      // Check if the neighbour's source offset produces a better match
      if (forward) {
        // Left neighbour
        if (tx > 0 && mask.data[tIdx - 1]! > 0) {
          const neighbourSrc = nnf[tIdx - 1]!
          const candidateSrc = neighbourSrc + 1 // shift right by 1
          tryImprove(tIdx, candidateSrc)
        }
        // Top neighbour
        if (ty > 0 && mask.data[tIdx - w]! > 0) {
          const neighbourSrc = nnf[tIdx - w]!
          const candidateSrc = neighbourSrc + w // shift down by 1 row
          tryImprove(tIdx, candidateSrc)
        }
      } else {
        // Right neighbour
        if (tx < w - 1 && mask.data[tIdx + 1]! > 0) {
          const neighbourSrc = nnf[tIdx + 1]!
          const candidateSrc = neighbourSrc - 1
          tryImprove(tIdx, candidateSrc)
        }
        // Bottom neighbour
        if (ty < h - 1 && mask.data[tIdx + w]! > 0) {
          const neighbourSrc = nnf[tIdx + w]!
          const candidateSrc = neighbourSrc - w
          tryImprove(tIdx, candidateSrc)
        }
      }

      // ── Random search ──
      let radius = Math.max(w, h)
      while (radius >= 1) {
        const rx = Math.floor(xorshift32(rng) * radius * 2 - radius)
        const ry = Math.floor(xorshift32(rng) * radius * 2 - radius)
        const bestSrc = nnf[tIdx]!
        const bsx = bestSrc % w
        const bsy = (bestSrc - bsx) / w
        const cx = Math.max(0, Math.min(w - 1, bsx + rx))
        const cy = Math.max(0, Math.min(h - 1, bsy + ry))
        tryImprove(tIdx, cy * w + cx)
        radius = Math.floor(radius / 2)
      }
    }
  }

  // 5. Fill: copy best-matching source pixels into the target area
  for (const tIdx of targetPixels) {
    const sIdx = nnf[tIdx]!
    const si = sIdx * 4
    const ti = tIdx * 4
    result[ti] = imageData.data[si]!
    result[ti + 1] = imageData.data[si + 1]!
    result[ti + 2] = imageData.data[si + 2]!
    result[ti + 3] = imageData.data[si + 3]!
  }

  // 6. Blend at selection edges (feather)
  const blendRadius = Math.max(0, settings.blendAmount)
  if (blendRadius > 0) {
    const distMap = buildDistanceMap(mask)

    for (const tIdx of targetPixels) {
      const d = distMap[tIdx]!
      if (d >= blendRadius) continue // fully inside — keep filled pixel

      // Linearly blend between original and filled pixel
      const alpha = d / blendRadius
      const ti = tIdx * 4
      result[ti] = Math.round(imageData.data[ti]! * (1 - alpha) + result[ti]! * alpha)
      result[ti + 1] = Math.round(imageData.data[ti + 1]! * (1 - alpha) + result[ti + 1]! * alpha)
      result[ti + 2] = Math.round(imageData.data[ti + 2]! * (1 - alpha) + result[ti + 2]! * alpha)
      result[ti + 3] = Math.round(imageData.data[ti + 3]! * (1 - alpha) + result[ti + 3]! * alpha)
    }
  }

  // Color adaptation: shift filled pixels towards the average border colour
  if (settings.colorAdaptation > 0) {
    // Compute average colour of pixels just outside the selection boundary
    let borderR = 0,
      borderG = 0,
      borderB = 0,
      borderCount = 0
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i]! > 0) continue // skip selected
      const x = i % w
      const y = (i - x) / w
      // Check if any neighbour is selected
      let adjacent = false
      if (x > 0 && mask.data[i - 1]! > 0) adjacent = true
      if (x < w - 1 && mask.data[i + 1]! > 0) adjacent = true
      if (y > 0 && mask.data[i - w]! > 0) adjacent = true
      if (y < h - 1 && mask.data[i + w]! > 0) adjacent = true
      if (adjacent) {
        const pi = i * 4
        borderR += imageData.data[pi]!
        borderG += imageData.data[pi + 1]!
        borderB += imageData.data[pi + 2]!
        borderCount++
      }
    }

    if (borderCount > 0) {
      const avgR = borderR / borderCount
      const avgG = borderG / borderCount
      const avgB = borderB / borderCount

      // Compute average of filled pixels
      let fillR = 0,
        fillG = 0,
        fillB = 0
      for (const tIdx of targetPixels) {
        const ti = tIdx * 4
        fillR += result[ti]!
        fillG += result[ti + 1]!
        fillB += result[ti + 2]!
      }
      fillR /= targetPixels.length
      fillG /= targetPixels.length
      fillB /= targetPixels.length

      // Shift each filled pixel
      const adapt = settings.colorAdaptation
      const shiftR = (avgR - fillR) * adapt
      const shiftG = (avgG - fillG) * adapt
      const shiftB = (avgB - fillB) * adapt

      for (const tIdx of targetPixels) {
        const ti = tIdx * 4
        result[ti] = Math.max(0, Math.min(255, Math.round(result[ti]! + shiftR)))
        result[ti + 1] = Math.max(0, Math.min(255, Math.round(result[ti + 1]! + shiftG)))
        result[ti + 2] = Math.max(0, Math.min(255, Math.round(result[ti + 2]! + shiftB)))
      }
    }
  }

  return new ImageData(result, w, h)
}
