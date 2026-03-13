/**
 * Select Sky — Automatically detect and select sky regions in photographs.
 *
 * Algorithm:
 * 1. Sample colors along the top edge to establish sky color palette
 * 2. Flood fill downward from top edge, including pixels matching the palette (tolerance-based)
 * 3. Edge detection: stop expansion at strong edges (Sobel gradient > threshold)
 * 4. Hue constraint: sky typically blue (180-260) or gray, but also handles sunset (orange/pink)
 * 5. Smooth the resulting mask edges
 */
import { setSelectionMask, type SelectionMask } from '@/tools/raster-selection'

// ── Settings ──

export interface SelectSkySettings {
  tolerance: number
  edgeThreshold: number
  refineMask: boolean
}

const settings: SelectSkySettings = {
  tolerance: 40,
  edgeThreshold: 30,
  refineMask: true,
}

export function getSelectSkySettings(): SelectSkySettings {
  return { ...settings }
}

export function setSelectSkySettings(patch: Partial<SelectSkySettings>) {
  if (patch.tolerance !== undefined) settings.tolerance = Math.max(0, Math.min(255, patch.tolerance))
  if (patch.edgeThreshold !== undefined) settings.edgeThreshold = Math.max(0, Math.min(255, patch.edgeThreshold))
  if (patch.refineMask !== undefined) settings.refineMask = patch.refineMask
}

// ── Internal helpers ──

/** Convert RGB to HSL. Returns [h (0-360), s (0-1), l (0-1)]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60

  return [h, s, l]
}

/** Compute Sobel gradient magnitude for the image (grayscale). */
function computeSobelGradient(pixels: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    gray[i] = 0.299 * pixels[idx]! + 0.587 * pixels[idx + 1]! + 0.114 * pixels[idx + 2]!
  }

  const gradient = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)]!
      const tc = gray[(y - 1) * w + x]!
      const tr = gray[(y - 1) * w + (x + 1)]!
      const ml = gray[y * w + (x - 1)]!
      const mr = gray[y * w + (x + 1)]!
      const bl = gray[(y + 1) * w + (x - 1)]!
      const bc = gray[(y + 1) * w + x]!
      const br = gray[(y + 1) * w + (x + 1)]!

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      gradient[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  return gradient
}

/** Check if a hue value is within a typical sky range. */
function isSkyHue(h: number, s: number, l: number): boolean {
  // Gray/white/very light — could be overcast sky
  if (s < 0.1) return true
  // Blue sky range: 180-260
  if (h >= 180 && h <= 260) return true
  // Sunset/sunrise sky: orange/pink/red range with moderate-high lightness
  if ((h >= 0 && h <= 40) || (h >= 320 && h <= 360)) {
    if (l > 0.4) return true
  }
  // Purple/violet sunset
  if (h >= 260 && h <= 320 && l > 0.4) return true
  return false
}

/**
 * Blur a Uint8Array mask in-place using 3 passes of box blur (approximates Gaussian).
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

// ── Main selection function ──

/**
 * Detect and select sky region in the given image data.
 * Returns a selection mask where selected pixels = 255.
 */
export function performSelectSky(imageData: ImageData): SelectionMask {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data
  const maskData = new Uint8Array(w * h)
  const { tolerance, edgeThreshold, refineMask } = settings

  if (w === 0 || h === 0) {
    const mask: SelectionMask = { width: w, height: h, data: maskData }
    setSelectionMask(mask)
    return mask
  }

  // Step 1: Sample sky colors from the top row
  const skySamples: Array<{ r: number; g: number; b: number; h: number; s: number; l: number }> = []
  const sampleStep = Math.max(1, Math.floor(w / 20))
  for (let x = 0; x < w; x += sampleStep) {
    const idx = x * 4
    const r = pixels[idx]!
    const g = pixels[idx + 1]!
    const b = pixels[idx + 2]!
    const [hue, sat, lit] = rgbToHsl(r, g, b)
    if (isSkyHue(hue, sat, lit)) {
      skySamples.push({ r, g, b, h: hue, s: sat, l: lit })
    }
  }

  // If no sky-like pixels found in top row, try top 5% of image
  if (skySamples.length === 0) {
    const topRows = Math.max(1, Math.floor(h * 0.05))
    for (let y = 0; y < topRows; y++) {
      for (let x = 0; x < w; x += sampleStep) {
        const idx = (y * w + x) * 4
        const r = pixels[idx]!
        const g = pixels[idx + 1]!
        const b = pixels[idx + 2]!
        const [hue, sat, lit] = rgbToHsl(r, g, b)
        if (isSkyHue(hue, sat, lit)) {
          skySamples.push({ r, g, b, h: hue, s: sat, l: lit })
        }
      }
    }
  }

  // If still no sky samples found, return empty mask
  if (skySamples.length === 0) {
    const mask: SelectionMask = { width: w, height: h, data: maskData }
    setSelectionMask(mask)
    return mask
  }

  // Step 2: Compute edge gradient
  const gradient = computeSobelGradient(pixels, w, h)

  // Step 3: Flood fill from top edge
  const visited = new Uint8Array(w * h)
  const stack: number[] = []

  // Seed from all top-edge pixels that match sky palette
  for (let x = 0; x < w; x++) {
    const idx = x * 4
    const r = pixels[idx]!
    const g = pixels[idx + 1]!
    const b = pixels[idx + 2]!
    if (matchesSkySamples(r, g, b, skySamples, tolerance)) {
      stack.push(x) // y=0 so pos = 0 * w + x = x
    }
  }

  while (stack.length > 0) {
    const pos = stack.pop()!
    if (visited[pos]) continue
    visited[pos] = 1

    const px = pos % w
    const py = Math.floor(pos / w)
    const pixIdx = pos * 4

    const r = pixels[pixIdx]!
    const g = pixels[pixIdx + 1]!
    const b = pixels[pixIdx + 2]!

    // Check edge threshold — stop at strong edges
    if (gradient[pos]! > edgeThreshold * 4) continue

    // Check color similarity to sky samples
    if (!matchesSkySamples(r, g, b, skySamples, tolerance)) continue

    // Check hue constraint
    const [hue, sat, lit] = rgbToHsl(r, g, b)
    if (!isSkyHue(hue, sat, lit)) continue

    maskData[pos] = 255

    // Expand in 4 directions
    if (px > 0 && !visited[pos - 1]) stack.push(pos - 1)
    if (px < w - 1 && !visited[pos + 1]) stack.push(pos + 1)
    if (py > 0 && !visited[pos - w]) stack.push(pos - w)
    if (py < h - 1 && !visited[pos + w]) stack.push(pos + w)
  }

  // Step 4: Optionally refine (smooth) the mask edges
  if (refineMask) {
    blurMask(maskData, w, h, 2)
    // Re-threshold after blur to keep mask mostly binary
    for (let i = 0; i < maskData.length; i++) {
      maskData[i] = maskData[i]! >= 128 ? 255 : 0
    }
  }

  const mask: SelectionMask = { width: w, height: h, data: maskData }
  setSelectionMask(mask)
  return mask
}

/** Check if an RGB color is close to any of the sky samples within tolerance. */
function matchesSkySamples(
  r: number,
  g: number,
  b: number,
  samples: Array<{ r: number; g: number; b: number }>,
  tolerance: number,
): boolean {
  for (const s of samples) {
    const dr = Math.abs(r - s.r)
    const dg = Math.abs(g - s.g)
    const db = Math.abs(b - s.b)
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    if (dist <= tolerance * 2) return true
  }
  return false
}
