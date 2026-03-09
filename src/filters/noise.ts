/**
 * Noise / grain filters for raster layers.
 * All functions operate on ImageData in-place and clamp to 0-255.
 */

// ── Seeded PRNG (mulberry32) ──

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate a gaussian-distributed random number using the Box-Muller transform.
 * Returns a value with mean 0 and standard deviation 1.
 */
function gaussianRandom(rng: () => number): number {
  let u1 = rng()
  // Avoid log(0)
  while (u1 === 0) u1 = rng()
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0
}

// ── Public API ──

/**
 * Add gaussian-distributed noise to each pixel.
 * @param imageData - The ImageData to modify in-place.
 * @param amount    - Noise strength, 0-100. Maps linearly to sigma (0 = none, 100 = sigma 80).
 * @param monochrome - If true, the same noise value is applied to R, G, and B.
 * @param seed      - Seed for the PRNG so results are reproducible.
 */
export function applyGaussianNoise(imageData: ImageData, amount: number, monochrome: boolean, seed: number): void {
  const data = imageData.data
  const len = data.length
  const sigma = (amount / 100) * 80
  const rng = mulberry32(seed)

  for (let i = 0; i < len; i += 4) {
    if (monochrome) {
      const noise = gaussianRandom(rng) * sigma
      data[i] = clamp255(data[i]! + noise)
      data[i + 1] = clamp255(data[i + 1]! + noise)
      data[i + 2] = clamp255(data[i + 2]! + noise)
      // Alpha unchanged
    } else {
      data[i] = clamp255(data[i]! + gaussianRandom(rng) * sigma)
      data[i + 1] = clamp255(data[i + 1]! + gaussianRandom(rng) * sigma)
      data[i + 2] = clamp255(data[i + 2]! + gaussianRandom(rng) * sigma)
    }
  }
}

/**
 * Add uniformly-distributed noise to each pixel.
 * @param imageData - The ImageData to modify in-place.
 * @param amount    - Noise strength, 0-100. Maps to a +/- range (0 = none, 100 = +/-128).
 * @param monochrome - If true, the same noise value is applied to R, G, and B.
 * @param seed      - Seed for the PRNG.
 */
export function applyUniformNoise(imageData: ImageData, amount: number, monochrome: boolean, seed: number): void {
  const data = imageData.data
  const len = data.length
  const range = (amount / 100) * 128
  const rng = mulberry32(seed)

  for (let i = 0; i < len; i += 4) {
    if (monochrome) {
      const noise = (rng() * 2 - 1) * range
      data[i] = clamp255(data[i]! + noise)
      data[i + 1] = clamp255(data[i + 1]! + noise)
      data[i + 2] = clamp255(data[i + 2]! + noise)
    } else {
      data[i] = clamp255(data[i]! + (rng() * 2 - 1) * range)
      data[i + 1] = clamp255(data[i + 1]! + (rng() * 2 - 1) * range)
      data[i + 2] = clamp255(data[i + 2]! + (rng() * 2 - 1) * range)
    }
  }
}

/**
 * Realistic film grain effect: gaussian noise blurred to create grain clumps.
 * @param imageData - The ImageData to modify in-place.
 * @param amount    - Grain intensity, 0-100 (maps to sigma up to 60).
 * @param size      - Grain size, 1-5. Controls the blur radius applied to the noise field.
 * @param seed      - Seed for the PRNG.
 */
export function applyFilmGrain(imageData: ImageData, amount: number, size: number, seed: number): void {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const sigma = (amount / 100) * 60
  const rng = mulberry32(seed)

  // Step 1: Generate a monochrome gaussian noise field.
  const noiseField = new Float32Array(w * h)
  for (let i = 0; i < noiseField.length; i++) {
    noiseField[i] = gaussianRandom(rng) * sigma
  }

  // Step 2: Apply a box blur to the noise field to create larger grain clumps.
  // Repeat the blur pass `size - 1` times (size=1 means no blur).
  const blurRadius = Math.max(0, Math.min(size, 5) - 1)
  if (blurRadius > 0) {
    boxBlurField(noiseField, w, h, blurRadius)
  }

  // Step 3: Add the blurred noise to each pixel (monochrome grain).
  for (let y = 0; y < h; y++) {
    const rowOff = y * w
    for (let x = 0; x < w; x++) {
      const noise = noiseField[rowOff + x]!
      const pi = (rowOff + x) * 4
      data[pi] = clamp255(data[pi]! + noise)
      data[pi + 1] = clamp255(data[pi + 1]! + noise)
      data[pi + 2] = clamp255(data[pi + 2]! + noise)
      // Alpha unchanged
    }
  }
}

// ── Internal helpers ──

/**
 * In-place separable box blur on a Float32Array representing a 2D field.
 * Uses two passes (horizontal then vertical) for O(n) per pixel regardless of radius.
 */
function boxBlurField(field: Float32Array, w: number, h: number, radius: number): void {
  const tmp = new Float32Array(field.length)
  const diam = radius * 2 + 1

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w
    let sum = 0
    // Initialise the window with clamped left edge
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.max(0, Math.min(w - 1, dx))
      sum += field[rowOff + x]!
    }
    tmp[rowOff] = sum / diam

    for (let x = 1; x < w; x++) {
      const addX = Math.min(x + radius, w - 1)
      const subX = Math.max(x - radius - 1, 0)
      sum += field[rowOff + addX]! - field[rowOff + subX]!
      tmp[rowOff + x] = sum / diam
    }
  }

  // Vertical pass (read from tmp, write back to field)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.max(0, Math.min(h - 1, dy))
      sum += tmp[y * w + x]!
    }
    field[x] = sum / diam

    for (let y = 1; y < h; y++) {
      const addY = Math.min(y + radius, h - 1)
      const subY = Math.max(y - radius - 1, 0)
      sum += tmp[addY * w + x]! - tmp[subY * w + x]!
      field[y * w + x] = sum / diam
    }
  }
}
