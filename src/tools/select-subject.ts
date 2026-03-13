/**
 * Select Subject — One-click auto-select the main subject in the entire image.
 *
 * With AI backend: sends the full image to a segmentation endpoint and
 * receives a mask of the detected subject(s).
 *
 * Without AI backend (local heuristic):
 * 1. Compute a saliency map combining:
 *    - Edge density (Sobel magnitude, blurred)
 *    - Color contrast (Euclidean distance from the image mean color, normalized)
 *    - Center bias (Gaussian centered on image, sigma = min(w,h)/3)
 *    - Saliency = 0.4 * edges + 0.4 * colorContrast + 0.2 * centerBias
 * 2. Threshold with Otsu's method
 * 3. Clean up: fill small holes, remove small connected components
 */
import { setSelectionMask, type SelectionMask } from '@/tools/raster-selection'
import { getAIConfig, isAIConfigured } from '@/ai/ai-config'

// ── Saliency Map Computation ──

/**
 * Compute a saliency map for the given image.
 * Returns a Float32Array of per-pixel saliency values in [0, 1].
 */
export function computeSaliencyMap(imageData: ImageData): Float32Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data
  const total = w * h

  if (total === 0) return new Float32Array(0)

  // ── 1. Edge density via Sobel ──
  const edgeRaw = new Float32Array(total)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0
      let gy = 0
      for (let c = 0; c < 3; c++) {
        const tl = pixels[((y - 1) * w + (x - 1)) * 4 + c]!
        const tc = pixels[((y - 1) * w + x) * 4 + c]!
        const tr = pixels[((y - 1) * w + (x + 1)) * 4 + c]!
        const ml = pixels[(y * w + (x - 1)) * 4 + c]!
        const mr = pixels[(y * w + (x + 1)) * 4 + c]!
        const bl = pixels[((y + 1) * w + (x - 1)) * 4 + c]!
        const bc = pixels[((y + 1) * w + x) * 4 + c]!
        const br = pixels[((y + 1) * w + (x + 1)) * 4 + c]!

        const sx = -tl + tr - 2 * ml + 2 * mr - bl + br
        const sy = -tl - 2 * tc - tr + bl + 2 * bc + br
        gx += sx * sx
        gy += sy * sy
      }
      edgeRaw[y * w + x] = Math.sqrt((gx + gy) / 3)
    }
  }

  // Blur edge density with a small box blur (radius 3, 2 passes)
  const edgeBlurred = blurFloat32(edgeRaw, w, h, 3, 2)

  // Normalize edge density to [0, 1]
  const edges = normalizeFloat32(edgeBlurred)

  // ── 2. Color contrast from image mean ──
  let meanR = 0
  let meanG = 0
  let meanB = 0
  for (let i = 0; i < total; i++) {
    meanR += pixels[i * 4]!
    meanG += pixels[i * 4 + 1]!
    meanB += pixels[i * 4 + 2]!
  }
  meanR /= total
  meanG /= total
  meanB /= total

  const colorContrastRaw = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const dr = pixels[i * 4]! - meanR
    const dg = pixels[i * 4 + 1]! - meanG
    const db = pixels[i * 4 + 2]! - meanB
    colorContrastRaw[i] = Math.sqrt(dr * dr + dg * dg + db * db)
  }
  const colorContrast = normalizeFloat32(colorContrastRaw)

  // ── 3. Center bias (Gaussian) ──
  const cx = w / 2
  const cy = h / 2
  const sigma = Math.min(w, h) / 3
  const invSigma2 = 1 / (2 * sigma * sigma)
  const centerBias = new Float32Array(total)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      centerBias[y * w + x] = Math.exp(-(dx * dx + dy * dy) * invSigma2)
    }
  }

  // ── 4. Combine ──
  const saliency = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    saliency[i] = 0.4 * edges[i]! + 0.4 * colorContrast[i]! + 0.2 * centerBias[i]!
  }

  return saliency
}

// ── Otsu's threshold ──

function otsuThreshold(values: Float32Array): number {
  const numBins = 256
  const histogram = new Float64Array(numBins)
  const n = values.length

  if (n === 0) return 0.5

  // Build histogram (map [0,1] to bins)
  for (let i = 0; i < n; i++) {
    const bin = Math.min(numBins - 1, Math.floor(values[i]! * numBins))
    histogram[bin] = histogram[bin]! + 1
  }

  let bestThreshold = 0
  let bestVariance = -1

  let w0 = 0
  let sum0 = 0
  let totalSum = 0
  for (let i = 0; i < numBins; i++) {
    totalSum += i * histogram[i]!
  }

  for (let t = 0; t < numBins; t++) {
    w0 += histogram[t]!
    if (w0 === 0) continue

    const w1 = n - w0
    if (w1 === 0) break

    sum0 += t * histogram[t]!
    const mean0 = sum0 / w0
    const mean1 = (totalSum - sum0) / w1

    const variance = w0 * w1 * (mean0 - mean1) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      bestThreshold = t
    }
  }

  return bestThreshold / numBins
}

// ── Cleanup: fill small holes and remove small components ──

function cleanupMask(data: Uint8Array, w: number, h: number): void {
  const total = w * h
  const minComponentSize = Math.max(4, Math.floor(total * 0.001))

  // Remove small foreground components
  removeSmallComponents(data, w, h, minComponentSize, 255)

  // Fill small holes (invert → remove small components → invert back)
  const inverted = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    inverted[i] = data[i]! ? 0 : 255
  }
  removeSmallComponents(inverted, w, h, minComponentSize, 255)
  for (let i = 0; i < total; i++) {
    data[i] = inverted[i]! ? 0 : 255
  }
}

function removeSmallComponents(data: Uint8Array, w: number, h: number, minSize: number, targetValue: number): void {
  const total = w * h
  const visited = new Uint8Array(total)

  for (let i = 0; i < total; i++) {
    if (visited[i] || data[i] !== targetValue) continue

    // Flood fill to find the connected component
    const component: number[] = []
    const stack: number[] = [i]
    visited[i] = 1

    while (stack.length > 0) {
      const pos = stack.pop()!
      component.push(pos)
      const x = pos % w
      const y = Math.floor(pos / w)

      const neighbors = [x > 0 ? pos - 1 : -1, x < w - 1 ? pos + 1 : -1, y > 0 ? pos - w : -1, y < h - 1 ? pos + w : -1]

      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && data[n] === targetValue) {
          visited[n] = 1
          stack.push(n)
        }
      }
    }

    // Remove if too small
    if (component.length < minSize) {
      for (const pos of component) {
        data[pos] = targetValue === 255 ? 0 : 255
      }
    }
  }
}

// ── Float32 helpers ──

function blurFloat32(src: Float32Array, w: number, h: number, radius: number, passes: number): Float32Array {
  let input = new Float32Array(src)
  let output = new Float32Array(w * h)
  const diam = radius * 2 + 1
  const inv = 1 / diam

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let dx = -radius; dx <= radius; dx++) {
        sum += input[y * w + Math.max(0, Math.min(w - 1, dx))]!
      }
      output[y * w] = sum * inv
      for (let x = 1; x < w; x++) {
        sum += input[y * w + Math.min(x + radius, w - 1)]! - input[y * w + Math.max(x - radius - 1, 0)]!
        output[y * w + x] = sum * inv
      }
    }
    ;[input, output] = [output, input]

    // Vertical
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = -radius; dy <= radius; dy++) {
        sum += input[Math.max(0, Math.min(h - 1, dy)) * w + x]!
      }
      output[x] = sum * inv
      for (let y = 1; y < h; y++) {
        sum += input[Math.min(y + radius, h - 1) * w + x]! - input[Math.max(y - radius - 1, 0) * w + x]!
        output[y * w + x] = sum * inv
      }
    }
    ;[input, output] = [output, input]
  }

  return input
}

function normalizeFloat32(arr: Float32Array): Float32Array {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! < min) min = arr[i]!
    if (arr[i]! > max) max = arr[i]!
  }
  const range = max - min
  const result = new Float32Array(arr.length)
  if (range === 0) {
    // Everything is the same value — return 0
    return result
  }
  for (let i = 0; i < arr.length; i++) {
    result[i] = (arr[i]! - min) / range
  }
  return result
}

// ── AI backend ──

async function aiSelectSubject(imageData: ImageData): Promise<Uint8Array | null> {
  if (!isAIConfigured()) return null

  const cfg = getAIConfig()
  if (!cfg.visionEndpoint) return null

  try {
    const w = imageData.width
    const h = imageData.height
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null
    if (!canvas) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.putImageData(imageData, 0, 0)

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

    const response = await fetch(cfg.visionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        task: 'select_subject',
        image: base64,
        width: w,
        height: h,
      }),
      signal: AbortSignal.timeout(cfg.timeout),
    })

    if (!response.ok) return null

    const result = (await response.json()) as { mask?: number[] }
    if (!result.mask || result.mask.length !== w * h) return null

    const mask = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) {
      mask[i] = result.mask[i]! > 0.5 ? 255 : 0
    }
    return mask
  } catch {
    return null
  }
}

// ── Main API ──

/**
 * Perform one-click subject selection on the given image.
 * Tries AI backend first; falls back to saliency-based local heuristic.
 */
export async function performSelectSubject(imageData: ImageData): Promise<SelectionMask> {
  const w = imageData.width
  const h = imageData.height

  if (w === 0 || h === 0) {
    const mask: SelectionMask = { width: w, height: h, data: new Uint8Array(0) }
    setSelectionMask(mask)
    return mask
  }

  // Try AI backend first
  const aiMask = await aiSelectSubject(imageData)
  if (aiMask) {
    const mask: SelectionMask = { width: w, height: h, data: aiMask }
    setSelectionMask(mask)
    return mask
  }

  // Local heuristic fallback
  const saliency = computeSaliencyMap(imageData)

  // Otsu's threshold
  const threshold = otsuThreshold(saliency)

  // Apply threshold
  const maskData = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    maskData[i] = saliency[i]! >= threshold ? 255 : 0
  }

  // Cleanup: remove small components, fill small holes
  cleanupMask(maskData, w, h)

  const mask: SelectionMask = { width: w, height: h, data: maskData }
  setSelectionMask(mask)
  return mask
}
