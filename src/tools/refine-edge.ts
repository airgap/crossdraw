import { getSelectionMask, setSelectionMask, type SelectionMask } from '@/tools/raster-selection'

/**
 * Select & Mask / Refine Edge workspace.
 *
 * Provides non-destructive refinement of a selection mask with:
 * smooth, feather, contrast, shift-edge, and color decontamination.
 * Multiple view modes let the user preview the mask in context.
 */

export type RefineEdgeViewMode = 'marching-ants' | 'overlay' | 'on-black' | 'on-white' | 'black-white' | 'on-layers'

export interface RefineEdgeSettings {
  /** 0-100 — Gaussian smooth of mask edges */
  smooth: number
  /** 0-250px — feather radius */
  feather: number
  /** 0-100% — sharpen mask edges (levels adjustment on mask) */
  contrast: number
  /** -100 to +100% — expand (>0) or contract (<0) edge */
  shift: number
  /** Remove colour fringe at edges */
  decontaminate: boolean
  /** 0-100% — strength of decontamination */
  decontaminateAmount: number
  /** Visualisation mode for preview */
  viewMode: RefineEdgeViewMode
}

const defaultSettings: RefineEdgeSettings = {
  smooth: 0,
  feather: 0,
  contrast: 0,
  shift: 0,
  decontaminate: false,
  decontaminateAmount: 50,
  viewMode: 'marching-ants',
}

let settings: RefineEdgeSettings = { ...defaultSettings }

/** The original mask captured on enter (never mutated). */
let originalMask: SelectionMask | null = null

/** Whether the refine-edge workspace is active. */
let active = false

// ── Public getters / setters ───────────────────────────────────────────

export function getRefineEdgeSettings(): RefineEdgeSettings {
  return { ...settings }
}

export function setRefineEdgeSettings(s: Partial<RefineEdgeSettings>): void {
  Object.assign(settings, s)
}

export function isRefineEdgeActive(): boolean {
  return active
}

// ── Enter / exit ───────────────────────────────────────────────────────

/**
 * Enter the Select & Mask workspace.
 * Snapshots the current selection mask so all adjustments are non-destructive.
 */
export function enterRefineEdge(): void {
  const mask = getSelectionMask()
  if (mask) {
    originalMask = { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) }
  } else {
    originalMask = null
  }
  settings = { ...defaultSettings }
  active = true
}

/**
 * Exit the Select & Mask workspace.
 * @param apply `true` — apply the refined mask as the new selection;
 *              `false` — discard changes and restore the original selection.
 */
export function exitRefineEdge(apply: boolean): void {
  if (apply && originalMask) {
    const refined = computeRefinedMask(originalMask, settings)
    setSelectionMask(refined)
  } else if (!apply) {
    // Restore original
    if (originalMask) {
      setSelectionMask({
        width: originalMask.width,
        height: originalMask.height,
        data: new Uint8Array(originalMask.data),
      })
    } else {
      setSelectionMask(null)
    }
  }
  originalMask = null
  active = false
}

/**
 * Update settings and recompute the refined mask (live preview).
 * Returns the refined mask or null if no original mask exists.
 */
export function updateRefineEdge(s: Partial<RefineEdgeSettings>): SelectionMask | null {
  Object.assign(settings, s)
  if (!originalMask) return null
  return computeRefinedMask(originalMask, settings)
}

// ── Preview generation ─────────────────────────────────────────────────

/**
 * Generate a preview ImageData for the given view mode.
 *
 * @param imageData  The source layer pixels
 * @param viewMode   How to visualise the mask
 * @returns An RGBA ImageData suitable for compositing onto the viewport.
 */
export function getRefineEdgePreview(imageData: ImageData, viewMode: RefineEdgeViewMode): ImageData | null {
  if (!originalMask) return null
  const mask = computeRefinedMask(originalMask, settings)
  return renderPreview(imageData, mask, viewMode)
}

// ── Core algorithm ─────────────────────────────────────────────────────

/**
 * Apply the full refine-edge pipeline to a copy of `src`.
 * Pipeline order: smooth → feather → contrast → shift → (decontaminate is pixel-level, handled at preview time).
 */
export function computeRefinedMask(src: SelectionMask, cfg: RefineEdgeSettings): SelectionMask {
  const { width: w, height: h } = src
  // Start with a copy
  let data = new Float32Array(w * h)
  for (let i = 0; i < src.data.length; i++) data[i] = src.data[i]!

  // 1. Smooth — Gaussian blur via 3-pass box blur
  if (cfg.smooth > 0) {
    data = boxBlur3Pass(data, w, h, cfg.smooth)
  }

  // 2. Feather — additional blur pass
  if (cfg.feather > 0) {
    data = boxBlur3Pass(data, w, h, cfg.feather)
  }

  // 3. Contrast — levels-like adjustment
  if (cfg.contrast > 0) {
    const factor = 1 + cfg.contrast / 100
    for (let i = 0; i < data.length; i++) {
      data[i] = clamp255((data[i]! - 128) * factor + 128)
    }
  }

  // 4. Shift edge — expand (>0) or contract (<0)
  if (cfg.shift !== 0) {
    data = shiftEdge(data, w, h, cfg.shift)
  }

  // Write result
  const out = new Uint8Array(w * h)
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(data[i]!)))
  }
  return { width: w, height: h, data: out }
}

// ── Internal helpers ───────────────────────────────────────────────────

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * 3-pass separable box blur (approximates Gaussian).
 */
function boxBlur3Pass(src: Float32Array<ArrayBuffer>, w: number, h: number, radius: number): Float32Array<ArrayBuffer> {
  let a: Float32Array<ArrayBuffer> = src
  let b: Float32Array<ArrayBuffer> = new Float32Array(w * h)
  const r = Math.max(1, Math.round(radius))
  const diam = r * 2 + 1
  const inv = 1 / diam

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let dx = -r; dx <= r; dx++) {
        sum += a[y * w + Math.max(0, Math.min(w - 1, dx))]!
      }
      b[y * w] = sum * inv
      for (let x = 1; x < w; x++) {
        sum += a[y * w + Math.min(x + r, w - 1)]! - a[y * w + Math.max(x - r - 1, 0)]!
        b[y * w + x] = sum * inv
      }
    }
    ;[a, b] = [b, a]

    // Vertical
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = -r; dy <= r; dy++) {
        sum += a[Math.max(0, Math.min(h - 1, dy)) * w + x]!
      }
      b[x] = sum * inv
      for (let y = 1; y < h; y++) {
        sum += a[Math.min(y + r, h - 1) * w + x]! - a[Math.max(y - r - 1, 0) * w + x]!
        b[y * w + x] = sum * inv
      }
    }
    ;[a, b] = [b, a]
  }

  return a
}

/**
 * Shift the mask edge by dilating (positive) or eroding (negative).
 * `shift` is -100..+100 percentage. We map that to pixel radius proportional to mask size.
 */
function shiftEdge(data: Float32Array<ArrayBuffer>, w: number, h: number, shift: number): Float32Array<ArrayBuffer> {
  // Map shift percentage to pixel radius: max radius = min(w,h) * 0.05
  const maxRadius = Math.max(1, Math.round(Math.min(w, h) * 0.05))
  const absRadius = Math.max(1, Math.round((Math.abs(shift) / 100) * maxRadius))
  const out = new Float32Array(w * h)

  if (shift > 0) {
    // Dilate: for each pixel, take the max within radius
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let maxVal = 0
        for (let dy = -absRadius; dy <= absRadius; dy++) {
          for (let dx = -absRadius; dx <= absRadius; dx++) {
            if (dx * dx + dy * dy <= absRadius * absRadius) {
              const nx = Math.max(0, Math.min(w - 1, x + dx))
              const ny = Math.max(0, Math.min(h - 1, y + dy))
              const v = data[ny * w + nx]!
              if (v > maxVal) maxVal = v
            }
          }
        }
        out[y * w + x] = maxVal
      }
    }
  } else {
    // Erode: for each pixel, take the min within radius
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let minVal = 255
        for (let dy = -absRadius; dy <= absRadius; dy++) {
          for (let dx = -absRadius; dx <= absRadius; dx++) {
            if (dx * dx + dy * dy <= absRadius * absRadius) {
              const nx = Math.max(0, Math.min(w - 1, x + dx))
              const ny = Math.max(0, Math.min(h - 1, y + dy))
              const v = data[ny * w + nx]!
              if (v < minVal) minVal = v
            }
          }
        }
        out[y * w + x] = minVal
      }
    }
  }

  return out
}

/**
 * Decontaminate edge pixels: replace color of partially-selected pixels with the
 * nearest fully-selected pixel color.
 * Only affects pixels whose mask value is between `lo` and `hi`.
 */
function decontaminatePixels(imageData: ImageData, mask: SelectionMask, amount: number): ImageData {
  const w = mask.width
  const h = mask.height
  const pixels = new Uint8ClampedArray(imageData.data)
  const mdata = mask.data
  const strength = amount / 100

  // Threshold range for "edge" pixels
  const lo = 10
  const hi = 245

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * w + x
      const mv = mdata[mi]!
      if (mv < lo || mv > hi) continue

      // Find nearest fully-selected pixel (mask >= 250) via expanding search
      let found = false
      let sr = 0,
        sg = 0,
        sb = 0
      for (let r = 1; r <= 10 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue // only perimeter
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
            if (mdata[ny * w + nx]! >= 250) {
              const pi = (ny * w + nx) * 4
              sr = pixels[pi]!
              sg = pixels[pi + 1]!
              sb = pixels[pi + 2]!
              found = true
            }
          }
        }
      }

      if (found) {
        const pi = mi * 4
        pixels[pi] = Math.round(pixels[pi]! * (1 - strength) + sr * strength)
        pixels[pi + 1] = Math.round(pixels[pi + 1]! * (1 - strength) + sg * strength)
        pixels[pi + 2] = Math.round(pixels[pi + 2]! * (1 - strength) + sb * strength)
      }
    }
  }

  return new ImageData(pixels, w, h)
}

/**
 * Render the mask preview for a given view mode.
 */
function renderPreview(imageData: ImageData, mask: SelectionMask, viewMode: RefineEdgeViewMode): ImageData {
  const w = mask.width
  const h = mask.height

  // Optionally decontaminate first
  let srcPixels = imageData
  if (settings.decontaminate && settings.decontaminateAmount > 0) {
    srcPixels = decontaminatePixels(imageData, mask, settings.decontaminateAmount)
  }

  const out = new Uint8ClampedArray(w * h * 4)
  const src = srcPixels.data

  for (let i = 0; i < w * h; i++) {
    const mv = mask.data[i]!
    const pi = i * 4
    const r = src[pi]!
    const g = src[pi + 1]!
    const b = src[pi + 2]!
    const a = src[pi + 3]!
    const t = mv / 255 // 0 = unselected, 1 = selected

    switch (viewMode) {
      case 'marching-ants':
        // Pass through original image; marching ants are rendered separately
        out[pi] = r
        out[pi + 1] = g
        out[pi + 2] = b
        out[pi + 3] = a
        break

      case 'overlay': {
        // Semi-transparent red overlay on unselected areas
        const overlayR = 255
        const overlayG = 0
        const overlayB = 0
        const overlayA = 0.5
        const blend = 1 - t
        out[pi] = Math.round(r * (1 - blend * overlayA) + overlayR * blend * overlayA)
        out[pi + 1] = Math.round(g * (1 - blend * overlayA) + overlayG * blend * overlayA)
        out[pi + 2] = Math.round(b * (1 - blend * overlayA) + overlayB * blend * overlayA)
        out[pi + 3] = 255
        break
      }

      case 'on-black':
        // Selected areas show image, unselected is black
        out[pi] = Math.round(r * t)
        out[pi + 1] = Math.round(g * t)
        out[pi + 2] = Math.round(b * t)
        out[pi + 3] = 255
        break

      case 'on-white':
        // Selected areas show image, unselected is white
        out[pi] = Math.round(r * t + 255 * (1 - t))
        out[pi + 1] = Math.round(g * t + 255 * (1 - t))
        out[pi + 2] = Math.round(b * t + 255 * (1 - t))
        out[pi + 3] = 255
        break

      case 'black-white':
        // Mask as grayscale: white = selected, black = unselected
        out[pi] = mv
        out[pi + 1] = mv
        out[pi + 2] = mv
        out[pi + 3] = 255
        break

      case 'on-layers':
        // Show image with mask as alpha
        out[pi] = r
        out[pi + 1] = g
        out[pi + 2] = b
        out[pi + 3] = mv
        break
    }
  }

  return new ImageData(out, w, h)
}
