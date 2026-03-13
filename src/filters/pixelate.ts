/**
 * Pixelate filter for raster layers.
 *
 * Three modes:
 * - **mosaic**: Divide into cellSize x cellSize blocks, each block = average colour.
 * - **crystallize**: Voronoi-based — random seed points per cell, assign pixels
 *   to nearest seed, average colour per Voronoi cell.
 * - **pointillize**: Like crystallize but render as circles on a background.
 *
 * Returns a *new* ImageData — the original is not modified.
 */

export interface PixelateParams {
  /** Cell size in pixels. */
  cellSize: number
  /** Pixelation mode. */
  mode: 'mosaic' | 'crystallize' | 'pointillize'
}

/**
 * Apply a pixelate effect to `imageData`.
 *
 * @returns A new ImageData with the pixelated result.
 */
export function applyPixelate(imageData: ImageData, params: PixelateParams): ImageData {
  const { cellSize: rawCellSize, mode } = params
  const cellSize = Math.max(2, Math.round(rawCellSize))

  switch (mode) {
    case 'mosaic':
      return applyMosaic(imageData, cellSize)
    case 'crystallize':
      return applyCrystallize(imageData, cellSize)
    case 'pointillize':
      return applyPointillize(imageData, cellSize)
  }
}

// ── Mosaic ─────────────────────────────────────────────────────

function applyMosaic(imageData: ImageData, cellSize: number): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let cy = 0; cy < h; cy += cellSize) {
    for (let cx = 0; cx < w; cx += cellSize) {
      // Compute average colour for this block
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0
      const bw = Math.min(cellSize, w - cx)
      const bh = Math.min(cellSize, h - cy)

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((cy + dy) * w + (cx + dx)) * 4
          rSum += src[idx]!
          gSum += src[idx + 1]!
          bSum += src[idx + 2]!
          aSum += src[idx + 3]!
          count++
        }
      }

      const avgR = Math.round(rSum / count)
      const avgG = Math.round(gSum / count)
      const avgB = Math.round(bSum / count)
      const avgA = Math.round(aSum / count)

      // Fill block with average colour
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const idx = ((cy + dy) * w + (cx + dx)) * 4
          dst[idx] = avgR
          dst[idx + 1] = avgG
          dst[idx + 2] = avgB
          dst[idx + 3] = avgA
        }
      }
    }
  }

  return out
}

// ── Crystallize (Voronoi) ──────────────────────────────────────

function applyCrystallize(imageData: ImageData, cellSize: number): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  // Generate seed points — one per grid cell with a deterministic offset
  const seeds: Array<{ x: number; y: number }> = []
  const seedIndex = new Int32Array(w * h) // which seed each pixel belongs to

  const cellsX = Math.ceil(w / cellSize)
  const cellsY = Math.ceil(h / cellSize)

  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      // Deterministic pseudo-random offset within cell using simple hash
      const hash = simpleHash(cx, cy)
      const ox = (hash & 0xff) / 255
      const oy = ((hash >> 8) & 0xff) / 255
      const sx = Math.min(w - 1, Math.floor(cx * cellSize + ox * cellSize))
      const sy = Math.min(h - 1, Math.floor(cy * cellSize + oy * cellSize))
      seeds.push({ x: sx, y: sy })
    }
  }

  // Assign each pixel to nearest seed
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Only check seeds in nearby cells for performance
      const gcx = Math.floor(x / cellSize)
      const gcy = Math.floor(y / cellSize)

      let bestDist = Infinity
      let bestSeed = 0

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ncx = gcx + dx
          const ncy = gcy + dy
          if (ncx < 0 || ncx >= cellsX || ncy < 0 || ncy >= cellsY) continue
          const si = ncy * cellsX + ncx
          const seed = seeds[si]!
          const ddx = x - seed.x
          const ddy = y - seed.y
          const dist = ddx * ddx + ddy * ddy
          if (dist < bestDist) {
            bestDist = dist
            bestSeed = si
          }
        }
      }

      seedIndex[y * w + x] = bestSeed
    }
  }

  // Accumulate colour per seed
  const seedR = new Float64Array(seeds.length)
  const seedG = new Float64Array(seeds.length)
  const seedB = new Float64Array(seeds.length)
  const seedA = new Float64Array(seeds.length)
  const seedCount = new Uint32Array(seeds.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = seedIndex[y * w + x]!
      const idx = (y * w + x) * 4
      seedR[si] = seedR[si]! + src[idx]!
      seedG[si] = seedG[si]! + src[idx + 1]!
      seedB[si] = seedB[si]! + src[idx + 2]!
      seedA[si] = seedA[si]! + src[idx + 3]!
      seedCount[si] = seedCount[si]! + 1
    }
  }

  // Fill output with average colour per Voronoi cell
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = seedIndex[y * w + x]!
      const cnt = seedCount[si]! || 1
      const idx = (y * w + x) * 4
      dst[idx] = Math.round(seedR[si]! / cnt)
      dst[idx + 1] = Math.round(seedG[si]! / cnt)
      dst[idx + 2] = Math.round(seedB[si]! / cnt)
      dst[idx + 3] = Math.round(seedA[si]! / cnt)
    }
  }

  return out
}

// ── Pointillize ────────────────────────────────────────────────

function applyPointillize(imageData: ImageData, cellSize: number): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  // Start with white background, preserving original alpha
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 255
    dst[i + 1] = 255
    dst[i + 2] = 255
    dst[i + 3] = src[i + 3]!
  }

  // Generate seed points (same as crystallize)
  const seeds: Array<{ x: number; y: number }> = []
  const cellsX = Math.ceil(w / cellSize)
  const cellsY = Math.ceil(h / cellSize)

  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const hash = simpleHash(cx, cy)
      const ox = (hash & 0xff) / 255
      const oy = ((hash >> 8) & 0xff) / 255
      const sx = Math.min(w - 1, Math.floor(cx * cellSize + ox * cellSize))
      const sy = Math.min(h - 1, Math.floor(cy * cellSize + oy * cellSize))
      seeds.push({ x: sx, y: sy })
    }
  }

  // Assign pixels to seeds and compute average colour per seed
  const seedIndex = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gcx = Math.floor(x / cellSize)
      const gcy = Math.floor(y / cellSize)

      let bestDist = Infinity
      let bestSeed = 0

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ncx = gcx + dx
          const ncy = gcy + dy
          if (ncx < 0 || ncx >= cellsX || ncy < 0 || ncy >= cellsY) continue
          const si = ncy * cellsX + ncx
          const seed = seeds[si]!
          const ddx = x - seed.x
          const ddy = y - seed.y
          const dist = ddx * ddx + ddy * ddy
          if (dist < bestDist) {
            bestDist = dist
            bestSeed = si
          }
        }
      }

      seedIndex[y * w + x] = bestSeed
    }
  }

  // Accumulate per seed
  const seedR = new Float64Array(seeds.length)
  const seedG = new Float64Array(seeds.length)
  const seedB = new Float64Array(seeds.length)
  const seedCount = new Uint32Array(seeds.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = seedIndex[y * w + x]!
      const idx = (y * w + x) * 4
      seedR[si] = seedR[si]! + src[idx]!
      seedG[si] = seedG[si]! + src[idx + 1]!
      seedB[si] = seedB[si]! + src[idx + 2]!
      seedCount[si] = seedCount[si]! + 1
    }
  }

  // Draw circles at each seed point
  const radius = cellSize * 0.45 // slightly less than half cell for visual spacing

  for (let si = 0; si < seeds.length; si++) {
    const seed = seeds[si]!
    const cnt = seedCount[si]! || 1
    const avgR = Math.round(seedR[si]! / cnt)
    const avgG = Math.round(seedG[si]! / cnt)
    const avgB = Math.round(seedB[si]! / cnt)

    // Draw a circle around each seed point
    const ir = Math.ceil(radius)
    const x0 = Math.max(0, seed.x - ir)
    const x1 = Math.min(w - 1, seed.x + ir)
    const y0 = Math.max(0, seed.y - ir)
    const y1 = Math.min(h - 1, seed.y + ir)

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const ddx = px - seed.x
        const ddy = py - seed.y
        const dist = Math.sqrt(ddx * ddx + ddy * ddy)

        if (dist <= radius + 0.5) {
          // Anti-alias the edge
          const alpha = dist > radius - 0.5 ? smoothstep(radius + 0.5, radius - 0.5, dist) : 1
          const idx = (py * w + px) * 4
          // Blend with background (which is white)
          dst[idx] = Math.round(avgR * alpha + dst[idx]! * (1 - alpha))
          dst[idx + 1] = Math.round(avgG * alpha + dst[idx + 1]! * (1 - alpha))
          dst[idx + 2] = Math.round(avgB * alpha + dst[idx + 2]! * (1 - alpha))
          // Alpha is preserved from original
        }
      }
    }
  }

  return out
}

// ── Internal helpers ─────────────────────────────────────────

/** Simple deterministic hash for seed placement. */
function simpleHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + 1234567) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return h >>> 0
}

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
