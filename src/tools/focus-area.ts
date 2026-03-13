/**
 * Focus Area Selection — Select in-focus areas of an image.
 *
 * Useful for separating sharp foreground from blurry background.
 *
 * Algorithm:
 * 1. Compute local sharpness/focus map using Laplacian variance:
 *    - For each pixel, compute 3x3 Laplacian
 *    - In a window (e.g. 7x7), compute variance of Laplacian values
 *    - Higher variance = sharper / more in-focus
 * 2. Threshold the focus map: pixels above focusThreshold are selected
 * 3. Apply noise reduction to remove small isolated selections
 * 4. Smooth mask edges
 */
import { setSelectionMask, type SelectionMask } from '@/tools/raster-selection'

// ── Settings ──

export interface FocusAreaSettings {
  /** [min, max] focus values to select (0-100, mapped to variance range) */
  focusRange: [number, number]
  /** Noise reduction level (0 = none, higher = more smoothing) */
  noiseLevel: number
}

const settings: FocusAreaSettings = {
  focusRange: [30, 100],
  noiseLevel: 2,
}

export function getFocusAreaSettings(): FocusAreaSettings {
  return { focusRange: [...settings.focusRange], noiseLevel: settings.noiseLevel }
}

export function setFocusAreaSettings(patch: Partial<FocusAreaSettings>) {
  if (patch.focusRange !== undefined) {
    settings.focusRange = [
      Math.max(0, Math.min(100, patch.focusRange[0])),
      Math.max(0, Math.min(100, patch.focusRange[1])),
    ]
  }
  if (patch.noiseLevel !== undefined) settings.noiseLevel = Math.max(0, Math.min(20, patch.noiseLevel))
}

// ── Focus map computation ──

/**
 * Compute the Laplacian value at a single pixel using the 3x3 kernel:
 *   [0  1  0]
 *   [1 -4  1]
 *   [0  1  0]
 */
function laplacianAt(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) return 0
  const c = gray[y * w + x]!
  const t = gray[(y - 1) * w + x]!
  const b = gray[(y + 1) * w + x]!
  const l = gray[y * w + (x - 1)]!
  const r = gray[y * w + (x + 1)]!
  return t + b + l + r - 4 * c
}

/**
 * Compute focus map for the entire image.
 * Returns a Float32Array of per-pixel sharpness values (variance of Laplacian in a local window).
 * Higher values indicate sharper/more in-focus areas.
 */
export function computeFocusMap(imageData: ImageData): Float32Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data

  // Convert to grayscale
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    gray[i] = 0.299 * pixels[idx]! + 0.587 * pixels[idx + 1]! + 0.114 * pixels[idx + 2]!
  }

  // Compute Laplacian for each pixel
  const laplacian = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      laplacian[y * w + x] = laplacianAt(gray, w, h, x, y)
    }
  }

  // Compute local variance of Laplacian in a 7x7 window
  const windowRadius = 3
  const focusMap = new Float32Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let sumSq = 0
      let count = 0

      const y0 = Math.max(0, y - windowRadius)
      const y1 = Math.min(h - 1, y + windowRadius)
      const x0 = Math.max(0, x - windowRadius)
      const x1 = Math.min(w - 1, x + windowRadius)

      for (let wy = y0; wy <= y1; wy++) {
        for (let wx = x0; wx <= x1; wx++) {
          const val = laplacian[wy * w + wx]!
          sum += val
          sumSq += val * val
          count++
        }
      }

      const mean = sum / count
      const variance = sumSq / count - mean * mean
      focusMap[y * w + x] = Math.abs(variance)
    }
  }

  return focusMap
}

/**
 * Blur a Uint8Array mask in-place using box blur passes.
 */
function blurMask(data: Uint8Array, w: number, h: number, radius: number): void {
  if (radius <= 0) return
  const diam = radius * 2 + 1
  const inv = 1 / diam

  let src = new Float32Array(w * h)
  for (let i = 0; i < data.length; i++) src[i] = data[i]!
  let dst = new Float32Array(w * h)

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let dx = -radius; dx <= radius; dx++) {
        sum += src[y * w + Math.max(0, Math.min(w - 1, dx))]!
      }
      dst[y * w] = sum * inv
      for (let x = 1; x < w; x++) {
        sum += src[y * w + Math.min(x + radius, w - 1)]! - src[y * w + Math.max(x - radius - 1, 0)]!
        dst[y * w + x] = sum * inv
      }
    }
    ;[src, dst] = [dst, src]

    // Vertical
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = -radius; dy <= radius; dy++) {
        sum += src[Math.max(0, Math.min(h - 1, dy)) * w + x]!
      }
      dst[x] = sum * inv
      for (let y = 1; y < h; y++) {
        sum += src[Math.min(y + radius, h - 1) * w + x]! - src[Math.max(y - radius - 1, 0) * w + x]!
        dst[y * w + x] = sum * inv
      }
    }
    ;[src, dst] = [dst, src]
  }

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(src[i]!)))
  }
}

/**
 * Remove small isolated regions from a binary mask using morphological open/close.
 * Simple approach: erode then dilate (open) to remove noise.
 */
function removeNoise(data: Uint8Array, w: number, h: number, iterations: number): void {
  if (iterations <= 0) return

  const tmp = new Uint8Array(w * h)

  for (let iter = 0; iter < iterations; iter++) {
    // Erode
    tmp.fill(0)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const pos = y * w + x
        if (data[pos]! > 0 && data[pos - 1]! > 0 && data[pos + 1]! > 0 && data[pos - w]! > 0 && data[pos + w]! > 0) {
          tmp[pos] = 255
        }
      }
    }

    // Dilate
    data.fill(0)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const pos = y * w + x
        if (tmp[pos]! > 0) {
          data[pos] = 255
          data[pos - 1] = 255
          data[pos + 1] = 255
          data[pos - w] = 255
          data[pos + w] = 255
        }
      }
    }
  }
}

// ── Main selection function ──

/**
 * Select in-focus areas of the image.
 * Returns a selection mask where selected (in-focus) pixels = 255.
 */
export function performFocusAreaSelect(imageData: ImageData): SelectionMask {
  const w = imageData.width
  const h = imageData.height
  const maskData = new Uint8Array(w * h)

  if (w === 0 || h === 0) {
    const mask: SelectionMask = { width: w, height: h, data: maskData }
    setSelectionMask(mask)
    return mask
  }

  const { focusRange, noiseLevel } = settings

  // Step 1: Compute focus map
  const focusMap = computeFocusMap(imageData)

  // Step 2: Find the range of focus values for normalization
  let minFocus = Infinity
  let maxFocus = -Infinity
  for (let i = 0; i < focusMap.length; i++) {
    const v = focusMap[i]!
    if (v < minFocus) minFocus = v
    if (v > maxFocus) maxFocus = v
  }

  const range = maxFocus - minFocus
  if (range === 0) {
    // Uniform image — no focus variation. Select all if focusRange includes 0.
    if (focusRange[0] <= 0) {
      maskData.fill(255)
    }
    const mask: SelectionMask = { width: w, height: h, data: maskData }
    setSelectionMask(mask)
    return mask
  }

  // Step 3: Threshold — map focusRange (0-100) to actual variance range
  const threshLo = minFocus + (focusRange[0] / 100) * range
  const threshHi = minFocus + (focusRange[1] / 100) * range

  for (let i = 0; i < w * h; i++) {
    const v = focusMap[i]!
    if (v >= threshLo && v <= threshHi) {
      maskData[i] = 255
    }
  }

  // Step 4: Remove noise (small isolated selections)
  if (noiseLevel > 0) {
    removeNoise(maskData, w, h, Math.min(noiseLevel, 5))
  }

  // Step 5: Smooth mask edges
  blurMask(maskData, w, h, 1)
  // Re-threshold after blur
  for (let i = 0; i < maskData.length; i++) {
    maskData[i] = maskData[i]! >= 128 ? 255 : 0
  }

  const mask: SelectionMask = { width: w, height: h, data: maskData }
  setSelectionMask(mask)
  return mask
}
