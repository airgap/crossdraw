/**
 * Background removal filters for raster layers.
 *
 * Three methods are available:
 * - **color**: Samples corner pixels to detect background colour, then removes
 *   pixels within tolerance of that colour. Applies feathering at edges.
 * - **edge**: Uses Sobel edge detection to find object boundaries, flood-fills
 *   from corners to identify background, then masks it out with feathering.
 * - **threshold**: Converts to luminance, thresholds to binary mask, applies
 *   to the alpha channel.
 *
 * All functions return a *new* ImageData — the original is not modified.
 */

// ── Types ────────────────────────────────────────────────────

export interface BackgroundRemovalParams {
  method: 'edge' | 'color' | 'threshold'
  /** Colour-distance tolerance (0-255). Higher = more aggressive removal. */
  tolerance: number
  /** Edge detection sensitivity multiplier (for 'edge' method). */
  edgeStrength: number
  /** Feather radius in pixels for smooth alpha transitions. */
  feather: number
}

export const DEFAULT_REMOVAL_PARAMS: BackgroundRemovalParams = {
  method: 'color',
  tolerance: 30,
  edgeStrength: 1.0,
  feather: 2,
}

// ── Public API ───────────────────────────────────────────────

/**
 * Remove the background from an image using the specified method.
 */
export function removeBackground(imageData: ImageData, params: BackgroundRemovalParams): ImageData {
  switch (params.method) {
    case 'color':
      return removeBackgroundByColor(imageData, params)
    case 'edge':
      return removeBackgroundByEdge(imageData, params)
    case 'threshold':
      return removeBackgroundByThreshold(imageData, params)
  }
}

// ── Color-based removal ──────────────────────────────────────

/**
 * Sample corner pixels to detect the background colour, then remove pixels
 * within tolerance of that colour.  Feathering is applied at the boundary.
 */
export function removeBackgroundByColor(imageData: ImageData, params: BackgroundRemovalParams): ImageData {
  const { tolerance, feather } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  // Detect background colour from corners
  const bgColor = sampleCornerColor(imageData)

  // Build a soft mask: 0 = background, 255 = foreground
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    const dist = colorDistance(src[idx]!, src[idx + 1]!, src[idx + 2]!, bgColor[0], bgColor[1], bgColor[2])
    if (dist <= tolerance) {
      mask[i] = 0
    } else if (dist <= tolerance + feather * 8 && feather > 0) {
      // Gradual transition
      const t = (dist - tolerance) / (feather * 8)
      mask[i] = Math.round(t * 255)
    } else {
      mask[i] = 255
    }
  }

  // Apply Gaussian feathering to smooth the mask
  const feathered = feather > 0 ? applyFeathering(mask, w, h, feather) : mask

  return applyMaskToImage(imageData, feathered)
}

// ── Edge-based removal ───────────────────────────────────────

/**
 * Use Sobel edge detection to find object boundaries, flood-fill from corners
 * to identify background, then mask it out with feathering.
 */
export function removeBackgroundByEdge(imageData: ImageData, params: BackgroundRemovalParams): ImageData {
  const { tolerance, edgeStrength, feather } = params
  const w = imageData.width
  const h = imageData.height

  // Step 1: Edge detection
  const edges = sobelEdgeDetect(imageData)

  // Step 2: Create an edge-aware cost map — edges act as barriers
  // Scale the edge threshold by edgeStrength
  const edgeThreshold = 30 / Math.max(0.1, edgeStrength)

  // Step 3: Flood fill from all four corners using colour similarity,
  // but blocked by strong edges
  const bgMask = new Uint8Array(w * h) // 1 = background
  const corners: [number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ]

  for (const [cx, cy] of corners) {
    edgeAwareFloodFill(imageData, edges, bgMask, cx, cy, tolerance, edgeThreshold)
  }

  // Step 4: Convert bgMask to an alpha mask (invert: bg=0, fg=255)
  const alphaMask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    alphaMask[i] = bgMask[i] ? 0 : 255
  }

  // Step 5: Feather the mask
  const feathered = feather > 0 ? applyFeathering(alphaMask, w, h, feather) : alphaMask

  return applyMaskToImage(imageData, feathered)
}

// ── Threshold-based removal ──────────────────────────────────

/**
 * Convert to luminance, threshold to binary mask, apply to alpha channel.
 * Pixels darker than the tolerance value become transparent.
 */
export function removeBackgroundByThreshold(imageData: ImageData, params: BackgroundRemovalParams): ImageData {
  const { tolerance, feather } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  // Build mask based on luminance threshold
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    // ITU-R BT.709 luminance
    const lum = 0.2126 * src[idx]! + 0.7152 * src[idx + 1]! + 0.0722 * src[idx + 2]!

    // Light pixels (above tolerance) are treated as background and removed
    if (lum >= 255 - tolerance) {
      mask[i] = 0
    } else if (lum >= 255 - tolerance - feather * 8 && feather > 0) {
      const t = (255 - tolerance - lum) / (feather * 8)
      mask[i] = Math.round(t * 255)
    } else {
      mask[i] = 255
    }
  }

  const feathered = feather > 0 ? applyFeathering(mask, w, h, feather) : mask

  return applyMaskToImage(imageData, feathered)
}

// ── Sobel Edge Detection ─────────────────────────────────────

/**
 * Compute Sobel edge magnitude for each pixel.
 * Returns a Float32Array of edge magnitudes (0+), one per pixel.
 */
export function sobelEdgeDetect(imageData: ImageData): Float32Array {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  // Convert to luminance first
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    lum[i] = 0.2126 * src[idx]! + 0.7152 * src[idx + 1]! + 0.0722 * src[idx + 2]!
  }

  const edges = new Float32Array(w * h)

  // Sobel kernels
  // Gx: [-1, 0, 1]   Gy: [-1, -2, -1]
  //     [-2, 0, 2]        [ 0,  0,  0]
  //     [-1, 0, 1]        [ 1,  2,  1]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = lum[(y - 1) * w + (x - 1)]!
      const tc = lum[(y - 1) * w + x]!
      const tr = lum[(y - 1) * w + (x + 1)]!
      const ml = lum[y * w + (x - 1)]!
      const mr = lum[y * w + (x + 1)]!
      const bl = lum[(y + 1) * w + (x - 1)]!
      const bc = lum[(y + 1) * w + x]!
      const br = lum[(y + 1) * w + (x + 1)]!

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br

      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  return edges
}

// ── Flood Fill Mask ──────────────────────────────────────────

/**
 * Flood fill from a seed point, returning a binary mask (Uint8Array) of the
 * connected region of similar-coloured pixels.
 *
 * @returns Uint8Array where 1 = part of region, 0 = outside
 */
export function floodFillMask(imageData: ImageData, startX: number, startY: number, tolerance: number): Uint8Array {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const mask = new Uint8Array(w * h)

  if (startX < 0 || startX >= w || startY < 0 || startY >= h) return mask

  const seedIdx = (startY * w + startX) * 4
  const seedR = src[seedIdx]!
  const seedG = src[seedIdx + 1]!
  const seedB = src[seedIdx + 2]!

  // BFS flood fill
  const queue: number[] = [startX, startY]
  mask[startY * w + startX] = 1

  while (queue.length > 0) {
    const cy = queue.pop()!
    const cx = queue.pop()!

    const neighbors: [number, number][] = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ]

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (mask[ni]) continue

      const nidx = ni * 4
      const dist = colorDistance(src[nidx]!, src[nidx + 1]!, src[nidx + 2]!, seedR, seedG, seedB)

      if (dist <= tolerance) {
        mask[ni] = 1
        queue.push(nx, ny)
      }
    }
  }

  return mask
}

// ── Feathering ───────────────────────────────────────────────

/**
 * Apply Gaussian-approximation feathering (box blur) to a mask.
 * Three passes of box blur approximate a Gaussian.
 *
 * @returns A new Uint8Array with the feathered mask.
 */
export function applyFeathering(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask)

  // Use float buffer for precision during blur passes
  let current = new Float32Array(mask.length) as Float32Array
  for (let i = 0; i < mask.length; i++) {
    current[i] = mask[i]!
  }

  // Three-pass box blur approximates Gaussian
  const passes = 3
  for (let pass = 0; pass < passes; pass++) {
    current = boxBlur1D(current, width, height, radius)
  }

  // Convert back to Uint8Array
  const result = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) {
    result[i] = Math.round(Math.max(0, Math.min(255, current[i]!)))
  }

  return result
}

// ── Internal helpers ─────────────────────────────────────────

/** Euclidean colour distance in RGB space. */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Sample the four corners of the image and compute the average colour.
 * Returns [r, g, b].
 */
function sampleCornerColor(imageData: ImageData): [number, number, number] {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  const corners = [
    0, // top-left
    (w - 1) * 4, // top-right
    (h - 1) * w * 4, // bottom-left
    ((h - 1) * w + w - 1) * 4, // bottom-right
  ]

  let rSum = 0,
    gSum = 0,
    bSum = 0
  for (const idx of corners) {
    rSum += src[idx]!
    gSum += src[idx + 1]!
    bSum += src[idx + 2]!
  }

  return [Math.round(rSum / 4), Math.round(gSum / 4), Math.round(bSum / 4)]
}

/** Export sampleCornerColor for testing */
export { sampleCornerColor }

/**
 * Edge-aware flood fill. Fills `bgMask` in-place from the seed point.
 * Blocked by colour difference > tolerance or strong edges.
 */
function edgeAwareFloodFill(
  imageData: ImageData,
  edges: Float32Array,
  bgMask: Uint8Array,
  startX: number,
  startY: number,
  tolerance: number,
  edgeThreshold: number,
): void {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  if (startX < 0 || startX >= w || startY < 0 || startY >= h) return

  const seedIdx = (startY * w + startX) * 4
  const seedR = src[seedIdx]!
  const seedG = src[seedIdx + 1]!
  const seedB = src[seedIdx + 2]!

  const startI = startY * w + startX
  if (bgMask[startI]) return // already filled

  const queue: number[] = [startX, startY]
  bgMask[startI] = 1

  while (queue.length > 0) {
    const cy = queue.pop()!
    const cx = queue.pop()!

    const neighbors: [number, number][] = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ]

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (bgMask[ni]) continue

      // Blocked by strong edge?
      if (edges[ni]! > edgeThreshold) continue

      const nidx = ni * 4
      const dist = colorDistance(src[nidx]!, src[nidx + 1]!, src[nidx + 2]!, seedR, seedG, seedB)

      if (dist <= tolerance) {
        bgMask[ni] = 1
        queue.push(nx, ny)
      }
    }
  }
}

/**
 * Apply a mask to an image, setting the alpha channel based on the mask.
 * mask[i] = 0 means fully transparent, 255 means original alpha preserved.
 */
function applyMaskToImage(imageData: ImageData, mask: Uint8Array): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    dst[idx] = src[idx]!
    dst[idx + 1] = src[idx + 1]!
    dst[idx + 2] = src[idx + 2]!
    // Multiply existing alpha by mask
    dst[idx + 3] = Math.round((src[idx + 3]! * mask[i]!) / 255)
  }

  return out
}

/**
 * Separable box blur (horizontal then vertical) on a Float32Array mask.
 */
function boxBlur1D(input: Float32Array, w: number, h: number, radius: number): Float32Array {
  const temp = new Float32Array(input.length)
  const output = new Float32Array(input.length)
  const kernelSize = radius * 2 + 1

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    let sum = 0
    // Initialize window
    for (let x = -radius; x <= radius; x++) {
      const clampedX = Math.max(0, Math.min(w - 1, x))
      sum += input[y * w + clampedX]!
    }
    temp[y * w] = sum / kernelSize

    for (let x = 1; x < w; x++) {
      const addX = Math.min(w - 1, x + radius)
      const removeX = Math.max(0, x - radius - 1)
      sum += input[y * w + addX]! - input[y * w + removeX]!
      temp[y * w + x] = sum / kernelSize
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) {
      const clampedY = Math.max(0, Math.min(h - 1, y))
      sum += temp[clampedY * w + x]!
    }
    output[x] = sum / kernelSize

    for (let y = 1; y < h; y++) {
      const addY = Math.min(h - 1, y + radius)
      const removeY = Math.max(0, y - radius - 1)
      sum += temp[addY * w + x]! - temp[removeY * w + x]!
      output[y * w + x] = sum / kernelSize
    }
  }

  return output
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
