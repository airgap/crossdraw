/**
 * AI Object Selection — Draw a rectangle or lasso around an object,
 * and AI (or a local heuristic fallback) detects its precise boundary.
 *
 * With AI backend: sends the cropped region to a vision/segmentation endpoint,
 * receives a binary mask, and converts it to a SelectionMask.
 *
 * Without AI backend (local heuristic):
 * 1. Sobel edge detection within the drawn region
 * 2. Flood fill from region center, respecting detected edges
 * 3. GrabCut-like iterative refinement:
 *    - Initial foreground = center region, background = border pixels
 *    - Each iteration: expand foreground where colors match center,
 *      contract where colors match border
 */
import { setSelectionMask, type SelectionMask } from '@/tools/raster-selection'
import { getAIConfig, isAIConfigured } from '@/ai/ai-config'

// ── Settings ──

export interface ObjectSelectionSettings {
  mode: 'rectangle' | 'lasso'
  refinementIterations: number
}

const settings: ObjectSelectionSettings = {
  mode: 'rectangle',
  refinementIterations: 4,
}

export function getObjectSelectionSettings(): ObjectSelectionSettings {
  return { ...settings }
}

export function setObjectSelectionSettings(patch: Partial<ObjectSelectionSettings>): void {
  if (patch.mode !== undefined) settings.mode = patch.mode
  if (patch.refinementIterations !== undefined) {
    settings.refinementIterations = Math.max(1, Math.min(10, patch.refinementIterations))
  }
}

// ── Module state ──

let active = false

interface SelectionRegion {
  /** Bounding box in image coordinates */
  x: number
  y: number
  width: number
  height: number
  /** For lasso mode: array of [x, y] points forming the lasso polygon */
  lassoPoints: Array<[number, number]> | null
}

let region: SelectionRegion | null = null

export function isObjectSelectionActive(): boolean {
  return active
}

// ── Sobel edge detection ──

function computeSobelMagnitude(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Float32Array {
  const mag = new Float32Array(rw * rh)

  for (let ly = 1; ly < rh - 1; ly++) {
    for (let lx = 1; lx < rw - 1; lx++) {
      const iy = ry + ly
      const ix = rx + lx
      if (iy <= 0 || iy >= h - 1 || ix <= 0 || ix >= w - 1) continue

      let gx = 0
      let gy = 0

      for (let c = 0; c < 3; c++) {
        const tl = pixels[((iy - 1) * w + (ix - 1)) * 4 + c]!
        const tc = pixels[((iy - 1) * w + ix) * 4 + c]!
        const tr = pixels[((iy - 1) * w + (ix + 1)) * 4 + c]!
        const ml = pixels[(iy * w + (ix - 1)) * 4 + c]!
        const mr = pixels[(iy * w + (ix + 1)) * 4 + c]!
        const bl = pixels[((iy + 1) * w + (ix - 1)) * 4 + c]!
        const bc = pixels[((iy + 1) * w + ix) * 4 + c]!
        const br = pixels[((iy + 1) * w + (ix + 1)) * 4 + c]!

        const sx = -tl + tr - 2 * ml + 2 * mr - bl + br
        const sy = -tl - 2 * tc - tr + bl + 2 * bc + br
        gx += sx * sx
        gy += sy * sy
      }

      mag[ly * rw + lx] = Math.sqrt((gx + gy) / 3)
    }
  }

  return mag
}

// ── Color sampling helpers ──

function sampleMeanColor(
  pixels: Uint8ClampedArray,
  w: number,
  mask: Uint8Array,
  rw: number,
  rh: number,
  rx: number,
  ry: number,
): [number, number, number] {
  let sr = 0
  let sg = 0
  let sb = 0
  let count = 0

  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      if (mask[ly * rw + lx]!) {
        const idx = ((ry + ly) * w + (rx + lx)) * 4
        sr += pixels[idx]!
        sg += pixels[idx + 1]!
        sb += pixels[idx + 2]!
        count++
      }
    }
  }

  if (count === 0) return [128, 128, 128]
  return [sr / count, sg / count, sb / count]
}

// ── GrabCut-like refinement ──

function grabCutRefine(
  pixels: Uint8ClampedArray,
  w: number,
  rw: number,
  rh: number,
  rx: number,
  ry: number,
  edgeMag: Float32Array,
  iterations: number,
): Uint8Array {
  const total = rw * rh
  const fgMask = new Uint8Array(total)
  const bgMask = new Uint8Array(total)

  // Initial foreground: center 50% region
  const marginX = Math.floor(rw * 0.25)
  const marginY = Math.floor(rh * 0.25)
  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      const pos = ly * rw + lx
      if (lx >= marginX && lx < rw - marginX && ly >= marginY && ly < rh - marginY) {
        fgMask[pos] = 1
      } else {
        bgMask[pos] = 1
      }
    }
  }

  // Edge threshold: normalized
  let maxEdge = 0
  for (let i = 0; i < edgeMag.length; i++) {
    if (edgeMag[i]! > maxEdge) maxEdge = edgeMag[i]!
  }
  const edgeThresh = maxEdge * 0.3

  for (let iter = 0; iter < iterations; iter++) {
    // Sample foreground and background mean colors
    const fgColor = sampleMeanColor(pixels, w, fgMask, rw, rh, rx, ry)
    const bgColor = sampleMeanColor(pixels, w, bgMask, rw, rh, rx, ry)

    // Reclassify each pixel
    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        const pos = ly * rw + lx
        const idx = ((ry + ly) * w + (rx + lx)) * 4
        const pr = pixels[idx]!
        const pg = pixels[idx + 1]!
        const pb = pixels[idx + 2]!

        const fgDist = Math.sqrt((pr - fgColor[0]) ** 2 + (pg - fgColor[1]) ** 2 + (pb - fgColor[2]) ** 2)
        const bgDist = Math.sqrt((pr - bgColor[0]) ** 2 + (pg - bgColor[1]) ** 2 + (pb - bgColor[2]) ** 2)

        // Edge penalty: if on an edge, harder to change classification
        const edgePenalty = edgeMag[pos]! > edgeThresh ? 0.7 : 1.0

        if (fgDist * edgePenalty < bgDist) {
          fgMask[pos] = 1
          bgMask[pos] = 0
        } else {
          fgMask[pos] = 0
          bgMask[pos] = 1
        }
      }
    }
  }

  // Convert to 255/0 mask
  const result = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    result[i] = fgMask[i]! ? 255 : 0
  }

  return result
}

// ── Lasso point-in-polygon test ──

function isInsideLasso(x: number, y: number, points: Array<[number, number]>): boolean {
  let inside = false
  const n = points.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i]![0]
    const yi = points[i]![1]
    const xj = points[j]![0]
    const yj = points[j]![1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ── AI backend helpers ──

async function aiObjectSelect(
  imageData: ImageData,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Promise<Uint8Array | null> {
  if (!isAIConfigured()) return null

  const cfg = getAIConfig()
  if (!cfg.visionEndpoint) return null

  try {
    // Encode the cropped region as raw RGBA base64
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(rw, rh) : null
    if (!canvas) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Copy cropped region
    const cropped = ctx.createImageData(rw, rh)
    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        const srcIdx = ((ry + ly) * imageData.width + (rx + lx)) * 4
        const dstIdx = (ly * rw + lx) * 4
        cropped.data[dstIdx] = imageData.data[srcIdx]!
        cropped.data[dstIdx + 1] = imageData.data[srcIdx + 1]!
        cropped.data[dstIdx + 2] = imageData.data[srcIdx + 2]!
        cropped.data[dstIdx + 3] = imageData.data[srcIdx + 3]!
      }
    }
    ctx.putImageData(cropped, 0, 0)

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
        task: 'segment_object',
        image: base64,
        width: rw,
        height: rh,
      }),
      signal: AbortSignal.timeout(cfg.timeout),
    })

    if (!response.ok) return null

    const result = (await response.json()) as { mask?: number[] }
    if (!result.mask || result.mask.length !== rw * rh) return null

    const mask = new Uint8Array(rw * rh)
    for (let i = 0; i < rw * rh; i++) {
      mask[i] = result.mask[i]! > 0.5 ? 255 : 0
    }
    return mask
  } catch {
    return null
  }
}

// ── Local heuristic fallback ──

function localObjectSelect(
  imageData: ImageData,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  lassoPoints: Array<[number, number]> | null,
): Uint8Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data

  // Step 1: Sobel edge detection within the region
  const edgeMag = computeSobelMagnitude(pixels, w, h, rx, ry, rw, rh)

  // Step 2: If lasso mode, mask out pixels outside the lasso
  if (lassoPoints && lassoPoints.length >= 3) {
    const inRegion = new Uint8Array(rw * rh)
    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        if (isInsideLasso(rx + lx, ry + ly, lassoPoints)) {
          inRegion[ly * rw + lx] = 1
        }
      }
    }
    // Zero out edges outside lasso
    for (let i = 0; i < rw * rh; i++) {
      if (!inRegion[i]) edgeMag[i] = 999
    }
  }

  // Step 3: GrabCut-like refinement
  const result = grabCutRefine(pixels, w, rw, rh, rx, ry, edgeMag, settings.refinementIterations)

  // Step 4: If lasso mode, clip to lasso polygon
  if (lassoPoints && lassoPoints.length >= 3) {
    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        if (!isInsideLasso(rx + lx, ry + ly, lassoPoints)) {
          result[ly * rw + lx] = 0
        }
      }
    }
  }

  return result
}

// ── Public API ──

/**
 * Begin an object selection. Records the starting point and initializes the region.
 */
export function beginObjectSelection(x: number, y: number, _imageData: ImageData): void {
  active = true
  if (settings.mode === 'lasso') {
    region = { x, y, width: 0, height: 0, lassoPoints: [[x, y]] }
  } else {
    region = { x, y, width: 0, height: 0, lassoPoints: null }
  }
}

/**
 * Update the selection region as the user drags (rectangle) or moves (lasso).
 */
export function updateObjectSelection(x: number, y: number): void {
  if (!active || !region) return

  if (settings.mode === 'lasso' && region.lassoPoints) {
    region.lassoPoints.push([x, y])
    // Update bounding box
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [px, py] of region.lassoPoints) {
      if (px < minX) minX = px
      if (py < minY) minY = py
      if (px > maxX) maxX = px
      if (py > maxY) maxY = py
    }
    region.x = minX
    region.y = minY
    region.width = maxX - minX
    region.height = maxY - minY
  } else {
    // Rectangle mode: update width/height from starting point
    region.width = x - region.x
    region.height = y - region.y
  }
}

/**
 * Commit the object selection: run AI or local heuristic to detect the object boundary.
 * Returns the resulting SelectionMask or null on failure.
 */
export async function commitObjectSelection(imageData: ImageData): Promise<SelectionMask | null> {
  if (!active || !region) {
    active = false
    return null
  }

  const w = imageData.width
  const h = imageData.height

  // Normalize region (handle negative width/height from dragging left/up)
  let rx = region.x
  let ry = region.y
  let rw = region.width
  let rh = region.height

  if (rw < 0) {
    rx += rw
    rw = -rw
  }
  if (rh < 0) {
    ry += rh
    rh = -rh
  }

  // Clamp to image bounds
  rx = Math.max(0, Math.round(rx))
  ry = Math.max(0, Math.round(ry))
  rw = Math.min(w - rx, Math.round(rw))
  rh = Math.min(h - ry, Math.round(rh))

  if (rw <= 0 || rh <= 0) {
    active = false
    region = null
    return null
  }

  // Try AI backend first, fall back to local heuristic
  let regionMask = await aiObjectSelect(imageData, rx, ry, rw, rh)
  if (!regionMask) {
    regionMask = localObjectSelect(imageData, rx, ry, rw, rh, region.lassoPoints)
  }

  // Place the region mask into the full-image mask
  const fullMask = new Uint8Array(w * h)
  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      if (regionMask[ly * rw + lx]!) {
        const imgIdx = (ry + ly) * w + (rx + lx)
        fullMask[imgIdx] = 255
      }
    }
  }

  const mask: SelectionMask = { width: w, height: h, data: fullMask }
  setSelectionMask(mask)

  active = false
  region = null
  return mask
}

/**
 * Cancel the current object selection without applying it.
 */
export function cancelObjectSelection(): void {
  active = false
  region = null
}
