import { getSelectionMask, setSelectionMask, type SelectionMask } from '@/tools/raster-selection'

/**
 * Quick Mask mode: toggle into a mode where the selection mask is displayed
 * as a semi-transparent red overlay. The user can paint on it with brush/eraser
 * to refine the selection. Painting with value=255 adds to mask (selected),
 * painting with value=0 removes from mask (unselected).
 */

export interface QuickMaskSettings {
  /** Overlay color for masked (unselected) areas [r,g,b] */
  maskColor: [number, number, number]
  /** Overlay opacity 0-1 */
  maskOpacity: number
}

let settings: QuickMaskSettings = {
  maskColor: [255, 0, 0],
  maskOpacity: 0.5,
}

/** The mask being edited in quick-mask mode. Separate from the selection mask. */
let editMask: SelectionMask | null = null

// Stroke tracking state
let strokeActive = false
let lastStampX = 0
let lastStampY = 0
let strokeStarted = false
let distRemainder = 0
let strokeValue = 255
let strokeRadius = 10
let strokeHardness = 0.8

export function getQuickMaskSettings(): QuickMaskSettings {
  return { ...settings }
}

export function setQuickMaskSettings(s: Partial<QuickMaskSettings>) {
  Object.assign(settings, s)
}

/**
 * Enter Quick Mask mode. If there is an existing selection mask, copy it
 * as the editable mask. If there is no selection, create a fully transparent
 * (all-unselected) mask.
 */
export function enterQuickMask(width: number, height: number): SelectionMask {
  const existing = getSelectionMask()
  if (existing) {
    // Copy the current selection mask as the editable mask
    editMask = {
      width: existing.width,
      height: existing.height,
      data: new Uint8Array(existing.data),
    }
  } else {
    // No selection: create fully transparent (unselected) mask
    editMask = {
      width,
      height,
      data: new Uint8Array(width * height),
    }
  }
  return editMask
}

/**
 * Exit Quick Mask mode. Convert the painted mask back to a selection mask.
 * Returns the resulting selection mask, or null if quick mask was empty.
 */
export function exitQuickMask(): SelectionMask | null {
  if (!editMask) return null
  // Check if mask has any selected pixels
  let hasSelection = false
  for (let i = 0; i < editMask.data.length; i++) {
    if (editMask.data[i]! > 0) {
      hasSelection = true
      break
    }
  }
  if (hasSelection) {
    setSelectionMask({
      width: editMask.width,
      height: editMask.height,
      data: new Uint8Array(editMask.data),
    })
  } else {
    setSelectionMask(null)
  }
  const result = editMask
  editMask = null
  return result
}

/**
 * Get the current editable mask (only valid during quick mask mode).
 */
export function getEditMask(): SelectionMask | null {
  return editMask
}

/**
 * Paint onto the mask's Uint8Array directly at a single point.
 * value=0 means remove from selection (erase mask)
 * value=255 means add to selection (paint mask)
 * Supports hardness for soft-edged brush.
 */
export function paintQuickMask(x: number, y: number, radius: number, value: number, hardness: number): void {
  if (!editMask) return
  const { width, height, data } = editMask
  const cx = Math.round(x)
  const cy = Math.round(y)
  const r = Math.ceil(radius)

  const x0 = Math.max(0, cx - r)
  const x1 = Math.min(width - 1, cx + r)
  const y0 = Math.max(0, cy - r)
  const y1 = Math.min(height - 1, cy + r)

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x
      const dy = py - y
      const dist = Math.sqrt(dx * dx + dy * dy) / radius
      if (dist > 1) continue

      let alpha: number
      if (hardness >= 1) {
        alpha = 1
      } else {
        const fade = dist <= hardness ? 1 : 1 - (dist - hardness) / (1 - hardness)
        alpha = fade * fade * fade // cubic falloff like brush tool
      }

      const idx = py * width + px
      if (value > 0) {
        // Add to mask: blend towards value
        const current = data[idx]!
        data[idx] = Math.min(255, Math.round(current + alpha * (value - current)))
      } else {
        // Remove from mask: blend towards 0
        const current = data[idx]!
        data[idx] = Math.max(0, Math.round(current * (1 - alpha)))
      }
    }
  }
}

/**
 * Begin a quick mask paint stroke.
 * value: 255 to add to selection (paint), 0 to remove (erase)
 */
export function beginQuickMaskStroke(
  x: number,
  y: number,
  radius: number,
  value: number,
  hardness: number = 0.8,
): void {
  strokeActive = true
  strokeStarted = false
  distRemainder = 0
  strokeValue = value
  strokeRadius = radius
  strokeHardness = hardness

  // First dab
  paintQuickMask(x, y, radius, value, hardness)
  lastStampX = x
  lastStampY = y
  strokeStarted = true
}

/**
 * Continue the quick mask paint stroke to a new point.
 * Interpolates dabs along the path with consistent spacing.
 */
export function paintQuickMaskStroke(x: number, y: number): void {
  if (!strokeActive || !strokeStarted) return

  const spacingPx = Math.max(1, strokeRadius * 0.25)
  const dx = x - lastStampX
  const dy = y - lastStampY
  const segLen = Math.sqrt(dx * dx + dy * dy)
  if (segLen < 0.5) return

  const ux = dx / segLen
  const uy = dy / segLen

  let d = spacingPx - distRemainder
  while (d <= segLen) {
    const sx = lastStampX + ux * d
    const sy = lastStampY + uy * d
    paintQuickMask(sx, sy, strokeRadius, strokeValue, strokeHardness)
    d += spacingPx
  }
  distRemainder = segLen - (d - spacingPx)
  lastStampX = x
  lastStampY = y
}

/**
 * End the quick mask paint stroke.
 */
export function endQuickMaskStroke(): void {
  strokeActive = false
  strokeStarted = false
  distRemainder = 0
}

/**
 * Returns whether a quick mask stroke is currently active.
 */
export function isQuickMaskStrokeActive(): boolean {
  return strokeActive
}

/**
 * Generate an overlay ImageData for rendering the quick mask.
 * - Where mask=0 (unselected): shows the overlay color at maskOpacity
 * - Where mask=255 (selected): transparent (no overlay)
 * - Intermediate values blend proportionally
 */
export function getQuickMaskOverlay(width: number, height: number): ImageData | null {
  if (!editMask) return null

  const { maskColor, maskOpacity } = settings
  const [cr, cg, cb] = maskColor
  const baseAlpha = Math.round(maskOpacity * 255)

  const pixels = new Uint8ClampedArray(width * height * 4)
  const mw = editMask.width
  const mh = editMask.height

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = (y * width + x) * 4

      // If outside the mask bounds, treat as unselected (show overlay)
      if (x >= mw || y >= mh) {
        pixels[pIdx] = cr
        pixels[pIdx + 1] = cg
        pixels[pIdx + 2] = cb
        pixels[pIdx + 3] = baseAlpha
        continue
      }

      const maskVal = editMask.data[y * mw + x]!
      // maskVal=255 → fully selected → transparent overlay
      // maskVal=0 → fully unselected → full overlay
      const overlayAlpha = Math.round(((255 - maskVal) / 255) * baseAlpha)
      pixels[pIdx] = cr
      pixels[pIdx + 1] = cg
      pixels[pIdx + 2] = cb
      pixels[pIdx + 3] = overlayAlpha
    }
  }

  return new ImageData(pixels, width, height)
}
