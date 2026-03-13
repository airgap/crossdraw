/**
 * Content-Aware Scale — resize an image while preserving important content
 * using seam carving (Avidan & Shamir, 2007).
 *
 * Algorithm:
 *   1. Compute energy map using Sobel gradient magnitude per pixel.
 *   2. Find minimum-energy vertical seam via dynamic programming.
 *   3. To shrink width by 1: remove the lowest-energy seam.
 *   4. To grow width by 1: duplicate the lowest-energy seam (offset by 1px).
 *   5. Repeat for target width; transpose and repeat for height.
 *
 * If a protect mask is provided, energy values in the masked area are boosted
 * to prevent those regions from being carved.
 */

export interface ContentAwareScaleSettings {
  /** Whether to use the current selection as a protection mask. */
  protectMask: boolean
}

const defaultSettings: ContentAwareScaleSettings = {
  protectMask: false,
}

let currentSettings: ContentAwareScaleSettings = { ...defaultSettings }

export function getContentAwareScaleSettings(): ContentAwareScaleSettings {
  return { ...currentSettings }
}

export function setContentAwareScaleSettings(patch: Partial<ContentAwareScaleSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Energy computation ──

/**
 * Compute an energy map from the image using Sobel gradient magnitude.
 * Returns a Float32Array of length width*height, where each entry is the
 * gradient magnitude at that pixel (sqrt(Gx^2 + Gy^2) summed across RGB).
 */
export function computeEnergyMap(imageData: ImageData): Float32Array {
  const { width: w, height: h, data } = imageData
  const energy = new Float32Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = 0
      let gy = 0

      // For each color channel (R, G, B), compute Sobel gradients
      for (let c = 0; c < 3; c++) {
        // Sample 3x3 neighbourhood with clamped boundaries
        const x0 = Math.max(0, x - 1)
        const x2 = Math.min(w - 1, x + 1)
        const y0 = Math.max(0, y - 1)
        const y2 = Math.min(h - 1, y + 1)

        const tl = data[(y0 * w + x0) * 4 + c]!
        const tc = data[(y0 * w + x) * 4 + c]!
        const tr = data[(y0 * w + x2) * 4 + c]!
        const ml = data[(y * w + x0) * 4 + c]!
        const mr = data[(y * w + x2) * 4 + c]!
        const bl = data[(y2 * w + x0) * 4 + c]!
        const bc = data[(y2 * w + x) * 4 + c]!
        const br = data[(y2 * w + x2) * 4 + c]!

        // Sobel Gx = [-1 0 1; -2 0 2; -1 0 1]
        const channelGx = -tl + tr - 2 * ml + 2 * mr - bl + br
        // Sobel Gy = [-1 -2 -1; 0 0 0; 1 2 1]
        const channelGy = -tl - 2 * tc - tr + bl + 2 * bc + br

        gx += channelGx * channelGx
        gy += channelGy * channelGy
      }

      energy[y * w + x] = Math.sqrt(gx + gy)
    }
  }

  return energy
}

// ── Seam finding ──

/**
 * Find the minimum-energy vertical seam using dynamic programming.
 * Returns an array of length `height`, where seam[y] is the x-coordinate
 * of the seam at row y.
 */
export function findMinSeam(energyMap: Float32Array, width: number, height: number): number[] {
  // Build cumulative energy matrix
  const M = new Float32Array(width * height)

  // First row = energy
  for (let x = 0; x < width; x++) {
    M[x] = energyMap[x]!
  }

  // Fill rows top to bottom
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const above = M[(y - 1) * width + x]!
      const aboveLeft = x > 0 ? M[(y - 1) * width + (x - 1)]! : Infinity
      const aboveRight = x < width - 1 ? M[(y - 1) * width + (x + 1)]! : Infinity
      M[idx] = energyMap[idx]! + Math.min(above, aboveLeft, aboveRight)
    }
  }

  // Backtrack from the minimum of the last row
  const seam = new Array<number>(height)
  let minVal = Infinity
  let minX = 0
  const lastRow = (height - 1) * width
  for (let x = 0; x < width; x++) {
    if (M[lastRow + x]! < minVal) {
      minVal = M[lastRow + x]!
      minX = x
    }
  }
  seam[height - 1] = minX

  for (let y = height - 2; y >= 0; y--) {
    const prevX = seam[y + 1]!
    let bestX = prevX
    let bestVal = M[y * width + prevX]!

    if (prevX > 0 && M[y * width + (prevX - 1)]! < bestVal) {
      bestVal = M[y * width + (prevX - 1)]!
      bestX = prevX - 1
    }
    if (prevX < width - 1 && M[y * width + (prevX + 1)]! < bestVal) {
      bestX = prevX + 1
    }

    seam[y] = bestX
  }

  return seam
}

// ── Seam removal (shrink by 1 column) ──

function removeVerticalSeam(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seam: number[],
): { data: Uint8ClampedArray; width: number } {
  const newW = width - 1
  const newData = new Uint8ClampedArray(newW * height * 4)

  for (let y = 0; y < height; y++) {
    const seamX = seam[y]!
    let destX = 0
    for (let x = 0; x < width; x++) {
      if (x === seamX) continue
      const srcIdx = (y * width + x) * 4
      const dstIdx = (y * newW + destX) * 4
      newData[dstIdx] = data[srcIdx]!
      newData[dstIdx + 1] = data[srcIdx + 1]!
      newData[dstIdx + 2] = data[srcIdx + 2]!
      newData[dstIdx + 3] = data[srcIdx + 3]!
      destX++
    }
  }

  return { data: newData, width: newW }
}

// ── Seam insertion (grow by 1 column) ──

function insertVerticalSeam(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seam: number[],
): { data: Uint8ClampedArray; width: number } {
  const newW = width + 1
  const newData = new Uint8ClampedArray(newW * height * 4)

  for (let y = 0; y < height; y++) {
    const seamX = seam[y]!
    let destX = 0
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = (y * newW + destX) * 4
      newData[dstIdx] = data[srcIdx]!
      newData[dstIdx + 1] = data[srcIdx + 1]!
      newData[dstIdx + 2] = data[srcIdx + 2]!
      newData[dstIdx + 3] = data[srcIdx + 3]!
      destX++

      if (x === seamX) {
        // Duplicate: average with right neighbour (or copy if at edge)
        const rightX = Math.min(x + 1, width - 1)
        const rightIdx = (y * width + rightX) * 4
        const dupIdx = (y * newW + destX) * 4
        newData[dupIdx] = ((data[srcIdx]! + data[rightIdx]!) / 2) | 0
        newData[dupIdx + 1] = ((data[srcIdx + 1]! + data[rightIdx + 1]!) / 2) | 0
        newData[dupIdx + 2] = ((data[srcIdx + 2]! + data[rightIdx + 2]!) / 2) | 0
        newData[dupIdx + 3] = ((data[srcIdx + 3]! + data[rightIdx + 3]!) / 2) | 0
        destX++
      }
    }
  }

  return { data: newData, width: newW }
}

// ── Transpose helpers ──

function transposePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const newData = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = (x * height + y) * 4
      newData[dstIdx] = data[srcIdx]!
      newData[dstIdx + 1] = data[srcIdx + 1]!
      newData[dstIdx + 2] = data[srcIdx + 2]!
      newData[dstIdx + 3] = data[srcIdx + 3]!
    }
  }
  return { data: newData, width: height, height: width }
}

function transposeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const newMask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      newMask[x * height + y] = mask[y * width + x]!
    }
  }
  return newMask
}

// ── Protect mask energy boost ──

const PROTECT_ENERGY_BOOST = 1e5

function applyProtectMask(energy: Float32Array, mask: Uint8Array, width: number, height: number): void {
  for (let i = 0; i < width * height; i++) {
    if (mask[i]! > 0) {
      energy[i] = energy[i]! + PROTECT_ENERGY_BOOST
    }
  }
}

// ── Remove seam from mask ──

function removeSeamFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  seam: number[],
): { mask: Uint8Array; width: number } {
  const newW = width - 1
  const newMask = new Uint8Array(newW * height)
  for (let y = 0; y < height; y++) {
    const seamX = seam[y]!
    let dx = 0
    for (let x = 0; x < width; x++) {
      if (x === seamX) continue
      newMask[y * newW + dx] = mask[y * width + x]!
      dx++
    }
  }
  return { mask: newMask, width: newW }
}

function insertSeamInMask(
  mask: Uint8Array,
  width: number,
  height: number,
  seam: number[],
): { mask: Uint8Array; width: number } {
  const newW = width + 1
  const newMask = new Uint8Array(newW * height)
  for (let y = 0; y < height; y++) {
    const seamX = seam[y]!
    let dx = 0
    for (let x = 0; x < width; x++) {
      newMask[y * newW + dx] = mask[y * width + x]!
      dx++
      if (x === seamX) {
        newMask[y * newW + dx] = mask[y * width + x]!
        dx++
      }
    }
  }
  return { mask: newMask, width: newW }
}

// ── Internal: resize width only ──

function resizeWidth(
  pixelData: Uint8ClampedArray,
  curWidth: number,
  curHeight: number,
  targetWidth: number,
  mask: Uint8Array | null,
): { data: Uint8ClampedArray; width: number; mask: Uint8Array | null } {
  let data = pixelData
  let w = curWidth
  const h = curHeight
  let currentMask = mask

  if (targetWidth < w) {
    // Shrink: remove seams
    while (w > targetWidth) {
      const imgDataLike = { data, width: w, height: h } as unknown as ImageData
      const energy = computeEnergyMap(imgDataLike)
      if (currentMask) applyProtectMask(energy, currentMask, w, h)
      const seam = findMinSeam(energy, w, h)
      const result = removeVerticalSeam(data, w, h, seam)
      data = result.data
      if (currentMask) {
        const maskResult = removeSeamFromMask(currentMask, w, h, seam)
        currentMask = maskResult.mask
      }
      w = result.width
    }
  } else if (targetWidth > w) {
    // Grow: find seams to duplicate, then insert them all
    // Strategy: find k seams on the original, then insert them from
    // right to left so indices don't shift. For simplicity, we insert
    // one at a time, recomputing energy each time.
    while (w < targetWidth) {
      const imgDataLike = { data, width: w, height: h } as unknown as ImageData
      const energy = computeEnergyMap(imgDataLike)
      if (currentMask) applyProtectMask(energy, currentMask, w, h)
      const seam = findMinSeam(energy, w, h)
      const result = insertVerticalSeam(data, w, h, seam)
      data = result.data
      if (currentMask) {
        const maskResult = insertSeamInMask(currentMask, w, h, seam)
        currentMask = maskResult.mask
      }
      w = result.width
    }
  }

  return { data, width: w, mask: currentMask }
}

// ── Public API ──

/**
 * Perform content-aware scale on an image.
 *
 * @param imageData     Source ImageData (not mutated).
 * @param targetWidth   Desired output width.
 * @param targetHeight  Desired output height.
 * @param protectMask   Optional mask — pixels with value > 0 are protected from removal.
 *                      Must have length = imageData.width * imageData.height.
 * @returns A new ImageData of size targetWidth x targetHeight.
 */
export function performContentAwareScale(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  protectMask?: Uint8Array,
): ImageData {
  const origW = imageData.width
  const origH = imageData.height

  // Validate
  if (targetWidth < 1 || targetHeight < 1) {
    throw new Error('Target dimensions must be at least 1x1')
  }

  // Bail early if nothing changes
  if (targetWidth === origW && targetHeight === origH) {
    return new ImageData(new Uint8ClampedArray(imageData.data), origW, origH)
  }

  let data = new Uint8ClampedArray(imageData.data)
  let w = origW
  let h = origH
  let mask: Uint8Array | null = protectMask ? new Uint8Array(protectMask) : null

  // Step 1: resize width
  if (targetWidth !== w) {
    const result = resizeWidth(data, w, h, targetWidth, mask)
    data = new Uint8ClampedArray(result.data)
    w = result.width
    mask = result.mask
  }

  // Step 2: resize height by transposing, resizing "width", then transposing back
  if (targetHeight !== h) {
    const transposed = transposePixels(data, w, h)
    const tMask: Uint8Array | null = mask ? transposeMask(mask, w, h) : null

    const result = resizeWidth(transposed.data, transposed.width, transposed.height, targetHeight, tMask)

    // Transpose back
    const final = transposePixels(result.data, result.width, transposed.height)
    data = new Uint8ClampedArray(final.data)
    w = final.width
    h = final.height
  }

  return new ImageData(data, w, h)
}
