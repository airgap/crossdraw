/**
 * Remove Tool — AI-powered object removal via brush-based mask painting.
 *
 * Workflow:
 *   1. User activates the remove tool and paints over unwanted objects.
 *   2. On commit: the painted mask is sent to the inpainting API with an
 *      empty / removal prompt.  If no AI backend is configured, falls back
 *      to the local content-aware fill algorithm.
 *   3. The result is composited back onto the original image.
 */

import { getAIConfig, isAIConfigured } from './ai-config'
import { requestInpainting, compositeResult } from './generative-fill'
import type { SelectionMask } from '@/tools/raster-selection'
import { getSelectionBounds } from '@/tools/raster-selection'
import { getRasterData, updateRasterCache } from '@/store/raster-data'
import { useEditorStore } from '@/store/editor.store'
import { performContentAwareFill } from '@/tools/content-aware-fill'
import type { RasterLayer } from '@/types'

// ── Settings ──

export interface RemoveToolSettings {
  /** Brush radius in pixels. */
  brushRadius: number
  /** Feather radius for compositing. */
  featherRadius: number
}

const defaultSettings: RemoveToolSettings = {
  brushRadius: 20,
  featherRadius: 4,
}

let currentSettings: RemoveToolSettings = { ...defaultSettings }

export function getRemoveToolSettings(): RemoveToolSettings {
  return { ...currentSettings }
}

export function setRemoveToolSettings(patch: Partial<RemoveToolSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Internal state ──

interface RemoveState {
  active: boolean
  /** The mask being painted by the user. */
  mask: SelectionMask | null
  /** Chunk ID of the raster layer being operated on. */
  chunkId: string | null
  /** Pre-operation snapshot for undo. */
  preSnapshot: ImageData | null
}

const state: RemoveState = {
  active: false,
  mask: null,
  chunkId: null,
  preSnapshot: null,
}

// ── Public API ──

/**
 * Begin painting the remove brush.  Creates a fresh mask covering the
 * active raster layer's dimensions.
 */
export function beginRemoveBrush(x: number, y: number): boolean {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return false

  const selectedId = store.selection.layerIds[0]
  let rasterLayer: RasterLayer | undefined
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }
  if (!rasterLayer) return false

  const imageData = getRasterData(rasterLayer.imageChunkId)
  if (!imageData) return false

  state.chunkId = rasterLayer.imageChunkId
  state.preSnapshot = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
  state.mask = {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8Array(imageData.width * imageData.height),
  }
  state.active = true

  // Paint the first dab
  paintRemoveBrush(x, y)
  return true
}

/**
 * Continue painting the remove mask at the given position.
 * Stamps a filled circle of `brushRadius` into the mask.
 */
export function paintRemoveBrush(x: number, y: number): void {
  if (!state.active || !state.mask) return

  const r = currentSettings.brushRadius
  const w = state.mask.width
  const h = state.mask.height
  const cx = Math.round(x)
  const cy = Math.round(y)

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || px >= w || py < 0 || py >= h) continue
      state.mask.data[py * w + px] = 255
    }
  }
}

/**
 * Commit the removal: send to inpainting API or fall back to content-aware
 * fill, then composite the result.
 */
export async function commitRemove(): Promise<boolean> {
  if (!state.active || !state.mask || !state.chunkId || !state.preSnapshot) {
    cancelRemove()
    return false
  }

  const mask = state.mask
  const chunkId = state.chunkId
  const preSnapshot = state.preSnapshot

  const existing = getRasterData(chunkId)
  if (!existing) {
    cancelRemove()
    return false
  }

  const bounds = getSelectionBounds(mask)
  if (!bounds) {
    cancelRemove()
    return false
  }

  let resultImage: ImageData

  if (isAIConfigured() && getAIConfig().inpaintingEndpoint) {
    // AI path: send to inpainting with an empty/removal prompt
    try {
      const results = await requestInpainting(
        new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height),
        new Uint8Array(mask.data),
        '', // empty prompt → removal
        1,
      )
      if (results.length > 0) {
        resultImage = compositeResult(
          existing,
          results[0]!,
          mask,
          { x: 0, y: 0, w: existing.width, h: existing.height },
          currentSettings.featherRadius,
        )
      } else {
        // Fallback if API returns nothing
        resultImage = performContentAwareFill(existing, mask)
      }
    } catch {
      // Fallback on error
      resultImage = performContentAwareFill(existing, mask)
    }
  } else {
    // Local fallback: content-aware fill
    resultImage = performContentAwareFill(existing, mask)
  }

  // Write result
  existing.data.set(resultImage.data)
  updateRasterCache(chunkId)

  useEditorStore.getState().pushRasterHistory('Remove Tool', chunkId, preSnapshot, resultImage)

  resetState()
  return true
}

/**
 * Cancel an in-progress remove operation without applying changes.
 */
export function cancelRemove(): void {
  resetState()
}

/** Whether a remove brush operation is currently active. */
export function isRemoveActive(): boolean {
  return state.active
}

/** Get the current remove mask (for rendering preview). */
export function getRemoveMask(): SelectionMask | null {
  return state.mask
}

// ── Internal ──

function resetState(): void {
  state.active = false
  state.mask = null
  state.chunkId = null
  state.preSnapshot = null
}
