import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, updateRasterCache } from '@/store/raster-data'
import { getSelectionMask, getSelectionBounds, type SelectionMask } from '@/tools/raster-selection'
import { performContentAwareFill, type ContentAwareFillSettings } from '@/tools/content-aware-fill'
import type { RasterLayer } from '@/types'

/**
 * Content-Aware Move — move (or extend/copy) a selected region to a new
 * position, automatically filling the hole left behind and blending the
 * placed content into its new surroundings using luminance-ratio matching.
 *
 * Workflow:
 *   1. User selects a region (marquee / lasso / magic-wand / etc.)
 *   2. User activates content-aware-move tool and drags the selection.
 *   3. On release:
 *      a. The selected pixels are copied to a buffer.
 *      b. The source hole is filled using content-aware fill.
 *      c. The buffer is placed at the new position.
 *      d. Edge blending via luminance-ratio matching smooths the seams.
 */

export type ContentAwareMoveMode = 'move' | 'extend'
export type ContentAwareAdaptation = 'very-strict' | 'strict' | 'medium' | 'loose' | 'very-loose'

export interface ContentAwareMoveSettings {
  /** 'move' erases the source; 'extend' keeps the source intact. */
  mode: ContentAwareMoveMode
  /** Controls how aggressively colors are adapted at the destination. */
  adaptation: ContentAwareAdaptation
}

const defaultSettings: ContentAwareMoveSettings = {
  mode: 'move',
  adaptation: 'medium',
}

let currentSettings: ContentAwareMoveSettings = { ...defaultSettings }

export function getContentAwareMoveSettings(): ContentAwareMoveSettings {
  return { ...currentSettings }
}

export function setContentAwareMoveSettings(patch: Partial<ContentAwareMoveSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Internal state ──

interface MoveState {
  active: boolean
  /** The chunk ID of the raster layer being operated on. */
  chunkId: string | null
  /** Snapshot of the image before any modification (for undo). */
  preSnapshot: ImageData | null
  /** The selection mask captured at drag-start. */
  mask: SelectionMask | null
  /** Bounding box of the selection. */
  bounds: { x: number; y: number; width: number; height: number } | null
  /** Extracted RGBA buffer of the selected pixels. */
  pixelBuffer: Uint8ClampedArray | null
  /** Current offset from the original position. */
  offsetX: number
  offsetY: number
  /** Drag start point (document coords). */
  startX: number
  startY: number
}

const state: MoveState = {
  active: false,
  chunkId: null,
  preSnapshot: null,
  mask: null,
  bounds: null,
  pixelBuffer: null,
  offsetX: 0,
  offsetY: 0,
  startX: 0,
  startY: 0,
}

// ── Adaptation → blend strength map ──

const adaptationStrength: Record<ContentAwareAdaptation, number> = {
  'very-strict': 0.1,
  strict: 0.25,
  medium: 0.5,
  loose: 0.75,
  'very-loose': 0.95,
}

// ── Public API ──

/**
 * Begin a content-aware move operation.  Captures the current selection and
 * extracts the selected pixels into an internal buffer.
 *
 * @returns `true` if the operation started successfully.
 */
export function beginContentAwareMove(docX: number, docY: number): boolean {
  const mask = getSelectionMask()
  if (!mask) return false

  const bounds = getSelectionBounds(mask)
  if (!bounds) return false

  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return false

  // Find the active raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }
  if (!rasterLayer) return false

  const existing = getRasterData(rasterLayer.imageChunkId)
  if (!existing) return false

  // Take a full snapshot for undo
  state.preSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  state.chunkId = rasterLayer.imageChunkId
  state.mask = { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) }
  state.bounds = bounds

  // Extract selected pixels into a buffer (RGBA, same size as the full image)
  const buf = new Uint8ClampedArray(existing.width * existing.height * 4)
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const mIdx = y * mask.width + x
      if (mask.data[mIdx]! === 0) continue
      const pi = (y * existing.width + x) * 4
      buf[pi] = existing.data[pi]!
      buf[pi + 1] = existing.data[pi + 1]!
      buf[pi + 2] = existing.data[pi + 2]!
      buf[pi + 3] = existing.data[pi + 3]!
    }
  }
  state.pixelBuffer = buf

  state.startX = docX
  state.startY = docY
  state.offsetX = 0
  state.offsetY = 0
  state.active = true

  return true
}

/**
 * Update the move offset while the user is dragging.
 */
export function updateContentAwareMove(docX: number, docY: number): void {
  if (!state.active) return
  state.offsetX = Math.round(docX - state.startX)
  state.offsetY = Math.round(docY - state.startY)
}

/**
 * Apply the content-aware move:
 *   1. Fill the source hole (unless mode === 'extend')
 *   2. Paste the buffer at the new offset
 *   3. Blend edges via luminance-ratio matching
 *   4. Push to undo history
 */
export function applyContentAwareMove(): boolean {
  if (!state.active || !state.chunkId || !state.preSnapshot || !state.mask || !state.bounds || !state.pixelBuffer) {
    cancelContentAwareMove()
    return false
  }

  const existing = getRasterData(state.chunkId)
  if (!existing) {
    cancelContentAwareMove()
    return false
  }

  const w = existing.width
  const h = existing.height

  // Start from the original snapshot
  const working = new Uint8ClampedArray(state.preSnapshot.data)

  // ── Step 1: Fill source hole (move mode only) ──
  if (currentSettings.mode === 'move') {
    const fillSettings: ContentAwareFillSettings = {
      sampleArea: 'auto',
      blendAmount: 4,
      colorAdaptation: 0.5,
    }
    const srcImage = new ImageData(new Uint8ClampedArray(state.preSnapshot.data), w, h)
    const filled = performContentAwareFill(srcImage, state.mask, fillSettings)
    // Copy filled pixels back into working buffer (only for selected region)
    for (let i = 0; i < state.mask.data.length; i++) {
      if (state.mask.data[i]! > 0) {
        const pi = i * 4
        working[pi] = filled.data[pi]!
        working[pi + 1] = filled.data[pi + 1]!
        working[pi + 2] = filled.data[pi + 2]!
        working[pi + 3] = filled.data[pi + 3]!
      }
    }
  }

  // ── Step 2: Paste buffer at new position ──
  const dx = state.offsetX
  const dy = state.offsetY
  const bounds = state.bounds
  const buf = state.pixelBuffer

  // Build a set of destination pixels (for edge blending later)
  const destMask = new Uint8Array(w * h)

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const mIdx = y * state.mask.width + x
      if (state.mask.data[mIdx]! === 0) continue

      const srcPI = (y * w + x) * 4
      const destX = x + dx
      const destY = y + dy
      if (destX < 0 || destX >= w || destY < 0 || destY >= h) continue

      const destPI = (destY * w + destX) * 4
      working[destPI] = buf[srcPI]!
      working[destPI + 1] = buf[srcPI + 1]!
      working[destPI + 2] = buf[srcPI + 2]!
      working[destPI + 3] = buf[srcPI + 3]!
      destMask[destY * w + destX] = 255
    }
  }

  // ── Step 3: Edge blending via luminance-ratio matching ──
  const strength = adaptationStrength[currentSettings.adaptation]
  const blendRadius = 3

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (destMask[idx]! === 0) continue

      // Check if this pixel is near the edge of the pasted region
      let minDistToBorder = blendRadius + 1
      for (let ky = -blendRadius; ky <= blendRadius; ky++) {
        for (let kx = -blendRadius; kx <= blendRadius; kx++) {
          const nx = x + kx
          const ny = y + ky
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
            minDistToBorder = Math.min(minDistToBorder, Math.max(Math.abs(kx), Math.abs(ky)))
            continue
          }
          if (destMask[ny * w + nx]! === 0) {
            minDistToBorder = Math.min(minDistToBorder, Math.max(Math.abs(kx), Math.abs(ky)))
          }
        }
      }

      if (minDistToBorder > blendRadius) continue // fully interior — no blending

      // Luminance-ratio matching: adapt the pasted pixel colour to the
      // local surroundings using the same technique as the healing brush.
      const pi = idx * 4
      const pastedR = working[pi]!
      const pastedG = working[pi + 1]!
      const pastedB = working[pi + 2]!

      // Gather average colour from non-pasted neighbours
      let sumR = 0,
        sumG = 0,
        sumB = 0,
        nCount = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (kx === 0 && ky === 0) continue
          const nx = x + kx
          const ny = y + ky
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          if (destMask[ny * w + nx]! > 0) continue
          const ni = (ny * w + nx) * 4
          sumR += working[ni]!
          sumG += working[ni + 1]!
          sumB += working[ni + 2]!
          nCount++
        }
      }

      if (nCount === 0) continue

      const avgR = sumR / nCount
      const avgG = sumG / nCount
      const avgB = sumB / nCount

      // Luminance-ratio blend
      const pastedLum = 0.299 * pastedR + 0.587 * pastedG + 0.114 * pastedB
      const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB

      let blendedR: number, blendedG: number, blendedB: number
      if (avgLum > 0) {
        const ratio = pastedLum / avgLum
        blendedR = avgR * ratio
        blendedG = avgG * ratio
        blendedB = avgB * ratio
      } else {
        blendedR = pastedR
        blendedG = pastedG
        blendedB = pastedB
      }

      // Mix based on distance to border and adaptation strength
      const borderFactor = 1 - minDistToBorder / (blendRadius + 1)
      const mixFactor = borderFactor * strength

      working[pi] = Math.max(0, Math.min(255, Math.round(pastedR + (blendedR - pastedR) * mixFactor)))
      working[pi + 1] = Math.max(0, Math.min(255, Math.round(pastedG + (blendedG - pastedG) * mixFactor)))
      working[pi + 2] = Math.max(0, Math.min(255, Math.round(pastedB + (blendedB - pastedB) * mixFactor)))
    }
  }

  // ── Step 4: Write result and push undo ──
  existing.data.set(working)
  updateRasterCache(state.chunkId)

  const afterData = new ImageData(new Uint8ClampedArray(working), w, h)
  useEditorStore
    .getState()
    .pushRasterHistory(
      currentSettings.mode === 'move' ? 'Content-aware move' : 'Content-aware extend',
      state.chunkId,
      state.preSnapshot,
      afterData,
    )

  // Reset
  resetState()
  return true
}

/**
 * Cancel an in-progress content-aware move without applying changes.
 */
export function cancelContentAwareMove(): void {
  resetState()
}

function resetState(): void {
  state.active = false
  state.chunkId = null
  state.preSnapshot = null
  state.mask = null
  state.bounds = null
  state.pixelBuffer = null
  state.offsetX = 0
  state.offsetY = 0
  state.startX = 0
  state.startY = 0
}

/**
 * Returns the current drag offset if a move is in progress.
 */
export function getContentAwareMoveOffset(): { x: number; y: number } | null {
  if (!state.active) return null
  return { x: state.offsetX, y: state.offsetY }
}

/** Returns true if a content-aware move is currently in progress. */
export function isContentAwareMoveActive(): boolean {
  return state.active
}
