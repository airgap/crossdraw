/**
 * Smart Sharpen filter for raster layers.
 *
 * Improvements over basic unsharp mask:
 * 1. Uses Gaussian blur (iterated box blur) instead of single-pass box blur
 * 2. Tonal-range aware: separate shadow/highlight fade controls
 * 3. Noise reduction: suppresses sharpening in flat (low-variance) areas
 * 4. Edge-aware: sharpens more strongly at edges (high gradient magnitude)
 *
 * Returns a *new* ImageData -- the original is not modified.
 */

import { boxBlur } from '@/filters/progressive-blur'

export interface SmartSharpenParams {
  /** Sharpening strength multiplier (e.g. 0.5 = subtle, 2.0 = aggressive). */
  amount: number
  /** Gaussian blur radius used to build the unsharp mask (pixels). */
  radius: number
  /** Noise reduction: 0-100. Higher = more suppression of sharpening in flat areas. */
  noiseReduction: number
  /** Shadow fade amount: 0-100. Higher = less sharpening in shadow regions. */
  shadowFade: number
  /** Highlight fade amount: 0-100. Higher = less sharpening in highlight regions. */
  highlightFade: number
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Apply smart sharpen to `imageData`.
 *
 * @returns A new ImageData with the sharpened result.
 */
export function applySmartSharpen(imageData: ImageData, params: SmartSharpenParams): ImageData {
  const { amount, radius, noiseReduction, shadowFade, highlightFade } = params
  const w = imageData.width
  const h = imageData.height

  // If radius is zero or amount is zero, return a copy unchanged.
  if (radius <= 0 || amount === 0) {
    const copy = createImageData(w, h)
    copy.data.set(imageData.data)
    return copy
  }

  // Step 1: Create a Gaussian-blurred copy (iterated box blur = Gaussian approx).
  const blurred = boxBlur(imageData, Math.round(radius))

  // Step 2: Compute luminance array for tonal weighting.
  const src = imageData.data
  const blur = blurred.data
  const len = w * h

  const luminance = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const off = i * 4
    luminance[i] = (0.2126 * src[off]! + 0.7152 * src[off + 1]! + 0.0722 * src[off + 2]!) / 255
  }

  // Step 3: Compute local variance for noise detection (3x3 window).
  const localVariance = new Float32Array(len)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let sumSq = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            const lum = luminance[ny * w + nx]!
            sum += lum
            sumSq += lum * lum
            count++
          }
        }
      }
      const mean = sum / count
      localVariance[y * w + x] = sumSq / count - mean * mean
    }
  }

  // Step 4: Compute gradient magnitude for edge detection (Sobel-like).
  const gradient = new Float32Array(len)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      // Horizontal gradient
      const left = x > 0 ? luminance[idx - 1]! : luminance[idx]!
      const right = x < w - 1 ? luminance[idx + 1]! : luminance[idx]!
      const gx = right - left
      // Vertical gradient
      const top = y > 0 ? luminance[idx - w]! : luminance[idx]!
      const bottom = y < h - 1 ? luminance[idx + w]! : luminance[idx]!
      const gy = bottom - top
      gradient[idx] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  // Normalize gradient to 0-1 range.
  let maxGrad = 0
  for (let i = 0; i < len; i++) {
    if (gradient[i]! > maxGrad) maxGrad = gradient[i]!
  }
  if (maxGrad > 0) {
    for (let i = 0; i < len; i++) {
      gradient[i] = gradient[i]! / maxGrad
    }
  }

  // Step 5: Build the output with smart sharpening.
  const out = createImageData(w, h)
  const dst = out.data
  const noiseFactor = noiseReduction / 100
  const shadowFadeFactor = shadowFade / 100
  const highlightFadeFactor = highlightFade / 100

  for (let i = 0; i < len; i++) {
    const off = i * 4
    const lum = luminance[i]!

    // Tonal weight: reduce sharpening in shadows and highlights
    const shadowWeight = Math.max(0, 1 - lum * 3) // strong in darks, fades by 1/3 luminance
    const highlightWeight = Math.max(0, lum * 3 - 2) // strong in brights, fades by 2/3 luminance

    const tonalReduction = 1 - shadowWeight * shadowFadeFactor - highlightWeight * highlightFadeFactor
    const tonalScale = Math.max(0, tonalReduction)

    // Noise suppression: reduce sharpening where local variance is low
    const variance = localVariance[i]!
    // Variance threshold: map noiseReduction to a sensitivity curve
    const varianceThreshold = noiseFactor * 0.01 // 0 to 0.01 variance range
    const noiseScale = variance < varianceThreshold ? variance / Math.max(varianceThreshold, 1e-10) : 1

    // Edge-aware: boost sharpening at edges (0.5 base + 0.5 * gradient)
    const edgeScale = 0.5 + 0.5 * gradient[i]!

    // Combined modulation
    const modulation = tonalScale * noiseScale * edgeScale

    for (let c = 0; c < 3; c++) {
      const orig = src[off + c]!
      const blurVal = blur[off + c]!
      const diff = orig - blurVal
      dst[off + c] = clamp255(orig + diff * amount * modulation)
    }
    // Preserve alpha
    dst[off + 3] = src[off + 3]!
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
