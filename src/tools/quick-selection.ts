/**
 * Quick Selection tool — brush-based selection that automatically expands
 * to follow edges as you paint. Each brush dab samples colors and grows
 * the selection to include similar, connected pixels using edge-aware
 * flood fill.
 */
import { getSelectionMask, setSelectionMask, type SelectionMask } from '@/tools/raster-selection'

// ── Settings ──

export interface QuickSelectionSettings {
  brushSize: number
  autoEnhance: boolean
  sampleAllLayers: boolean
}

const settings: QuickSelectionSettings = {
  brushSize: 20,
  autoEnhance: true,
  sampleAllLayers: false,
}

export function getQuickSelectionSettings(): QuickSelectionSettings {
  return { ...settings }
}

export function setQuickSelectionSettings(patch: Partial<QuickSelectionSettings>) {
  if (patch.brushSize !== undefined) settings.brushSize = Math.max(1, Math.min(500, patch.brushSize))
  if (patch.autoEnhance !== undefined) settings.autoEnhance = patch.autoEnhance
  if (patch.sampleAllLayers !== undefined) settings.sampleAllLayers = patch.sampleAllLayers
}

// ── Module state ──

let active = false
let currentMask: SelectionMask | null = null
let currentMode: 'add' | 'subtract' = 'add'

/** Cached gradient magnitude for the current image (lazily computed). */
let gradientMag: Float32Array | null = null
let gradientImageData: ImageData | null = null

export function isQuickSelectionActive(): boolean {
  return active
}

// ── Gradient computation ──

/**
 * Compute gradient magnitude for edge detection using Sobel operator.
 * Returns a Float32Array where each entry is the gradient magnitude (0–255+).
 */
function computeGradientMagnitude(imageData: ImageData): Float32Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data
  const mag = new Float32Array(w * h)

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      // Compute luminance for the 3x3 neighborhood
      let gx = 0
      let gy = 0

      // Sobel kernels applied to luminance
      for (let c = 0; c < 3; c++) {
        const tl = pixels[((y - 1) * w + (x - 1)) * 4 + c]!
        const tc = pixels[((y - 1) * w + x) * 4 + c]!
        const tr = pixels[((y - 1) * w + (x + 1)) * 4 + c]!
        const ml = pixels[(y * w + (x - 1)) * 4 + c]!
        const mr = pixels[(y * w + (x + 1)) * 4 + c]!
        const bl = pixels[((y + 1) * w + (x - 1)) * 4 + c]!
        const bc = pixels[((y + 1) * w + x) * 4 + c]!
        const br = pixels[((y + 1) * w + (x + 1)) * 4 + c]!

        // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
        const sx = -tl + tr - 2 * ml + 2 * mr - bl + br
        // Sobel Y: [-1 -2 -1; 0 0 0; 1 2 1]
        const sy = -tl - 2 * tc - tr + bl + 2 * bc + br

        gx += sx * sx
        gy += sy * sy
      }

      mag[y * w + x] = Math.sqrt((gx + gy) / 3)
    }
  }

  return mag
}

function ensureGradient(imageData: ImageData): Float32Array {
  if (gradientMag && gradientImageData === imageData) return gradientMag
  gradientMag = computeGradientMagnitude(imageData)
  gradientImageData = imageData
  return gradientMag
}

// ── Edge-aware flood fill ──

/**
 * Perform an edge-aware flood fill from (cx, cy) within the given brush radius.
 * Returns a Uint8Array mask of the filled region (255 = filled, 0 = not).
 *
 * The fill considers:
 * - Color similarity to the seed color (Euclidean distance in RGB)
 * - Edge strength: stops when gradient magnitude exceeds threshold
 * - Distance from brush center: favors pixels closer to the brush path
 */
function edgeAwareFloodFill(cx: number, cy: number, imageData: ImageData, brushRadius: number): Uint8Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data
  const gradient = ensureGradient(imageData)
  const result = new Uint8Array(w * h)

  const sx = Math.round(cx)
  const sy = Math.round(cy)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return result

  // Sample seed color
  const seedIdx = (sy * w + sx) * 4
  const sr = pixels[seedIdx]!
  const sg = pixels[seedIdx + 1]!
  const sb = pixels[seedIdx + 2]!

  // Adaptive tolerance based on brush size (larger brush = more tolerant)
  const baseTolerance = 25 + brushRadius * 0.5
  const edgeThreshold = 40

  // Search radius: expand beyond brush to find natural edges
  const searchRadius = brushRadius * 2

  const visited = new Uint8Array(w * h)
  const queue: number[] = [sy * w + sx]
  visited[sy * w + sx] = 1

  while (queue.length > 0) {
    const pos = queue.shift()!
    const px = pos % w
    const py = Math.floor(pos / w)

    // Distance from brush center
    const dx = px - cx
    const dy = py - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Skip pixels too far from brush center
    if (dist > searchRadius) continue

    // Color distance
    const pidx = pos * 4
    const dr = pixels[pidx]! - sr
    const dg = pixels[pidx + 1]! - sg
    const db = pixels[pidx + 2]! - sb
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db)

    // Distance falloff: tolerance decreases as we move away from brush center
    const distFactor = dist <= brushRadius ? 1.0 : 1.0 - (dist - brushRadius) / brushRadius
    const adjustedTolerance = baseTolerance * Math.max(0, distFactor)

    // Edge check: gradient magnitude at this pixel
    const edgeStrength = gradient[pos]!

    // Accept pixel if color is similar and edge strength is low
    if (colorDist > adjustedTolerance || edgeStrength > edgeThreshold) continue

    result[pos] = 255

    // Enqueue 4-connected neighbors
    if (px > 0 && !visited[pos - 1]) {
      visited[pos - 1] = 1
      queue.push(pos - 1)
    }
    if (px < w - 1 && !visited[pos + 1]) {
      visited[pos + 1] = 1
      queue.push(pos + 1)
    }
    if (py > 0 && !visited[pos - w]) {
      visited[pos - w] = 1
      queue.push(pos - w)
    }
    if (py < h - 1 && !visited[pos + w]) {
      visited[pos + w] = 1
      queue.push(pos + w)
    }
  }

  return result
}

// ── Auto-enhance: small feather to smooth jagged edges ──

function applySmallFeather(mask: SelectionMask): void {
  const { width: w, height: h, data } = mask
  const src = new Float32Array(w * h)
  for (let i = 0; i < data.length; i++) src[i] = data[i]!

  const dst = new Float32Array(w * h)
  const radius = 1
  const diam = radius * 2 + 1
  const inv = 1 / diam

  // Single pass of separable box blur (lightweight smoothing)
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

  // Vertical (read from dst, write to src)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let dy = -radius; dy <= radius; dy++) {
      sum += dst[Math.max(0, Math.min(h - 1, dy)) * w + x]!
    }
    src[x] = sum * inv
    for (let y = 1; y < h; y++) {
      sum += dst[Math.min(y + radius, h - 1) * w + x]! - dst[Math.max(y - radius - 1, 0) * w + x]!
      src[y * w + x] = sum * inv
    }
  }

  // Write back, threshold at 128 to keep selection crisp but smoothed
  for (let i = 0; i < data.length; i++) {
    data[i] = src[i]! >= 128 ? 255 : 0
  }
}

// ── Public API ──

/**
 * Begin a quick selection stroke at (x, y).
 * Creates an initial seed region via edge-aware flood fill from the point.
 */
export function beginQuickSelection(
  x: number,
  y: number,
  imageData: ImageData,
  mode: 'add' | 'subtract' = 'add',
): SelectionMask | null {
  const w = imageData.width
  const h = imageData.height
  if (w === 0 || h === 0) return null

  active = true
  currentMode = mode

  // Start from existing selection mask or create new one
  const existing = getSelectionMask()
  if (existing && existing.width === w && existing.height === h) {
    currentMask = { width: w, height: h, data: new Uint8Array(existing.data) }
  } else {
    currentMask = { width: w, height: h, data: new Uint8Array(w * h) }
  }

  // Perform initial edge-aware flood fill
  const region = edgeAwareFloodFill(x, y, imageData, settings.brushSize / 2)
  mergeRegion(region)

  // Set mask so it's visible during painting
  setSelectionMask(currentMask)
  return currentMask
}

/**
 * Continue the quick selection stroke at a new position.
 * Samples color at the new position and merges new region into the current mask.
 */
export function paintQuickSelection(x: number, y: number, imageData: ImageData): SelectionMask | null {
  if (!active || !currentMask) return null

  const region = edgeAwareFloodFill(x, y, imageData, settings.brushSize / 2)
  mergeRegion(region)

  setSelectionMask(currentMask)
  return currentMask
}

/**
 * End the quick selection stroke.
 * If autoEnhance is enabled, applies a small feather to smooth jagged edges.
 */
export function endQuickSelection(): SelectionMask | null {
  if (!active || !currentMask) {
    active = false
    return null
  }

  if (settings.autoEnhance) {
    applySmallFeather(currentMask)
  }

  setSelectionMask(currentMask)
  active = false

  // Clear cached gradient data
  gradientMag = null
  gradientImageData = null

  return currentMask
}

// ── Internal helpers ──

function mergeRegion(region: Uint8Array): void {
  if (!currentMask) return
  const data = currentMask.data
  if (currentMode === 'add') {
    for (let i = 0; i < region.length; i++) {
      if (region[i]!) data[i] = 255
    }
  } else {
    // subtract
    for (let i = 0; i < region.length; i++) {
      if (region[i]!) data[i] = 0
    }
  }
}
