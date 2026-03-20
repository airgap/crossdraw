/**
 * Generative Expand (Outpainting) — extend the canvas beyond its current
 * bounds using AI to seamlessly continue the image content.
 *
 * Uses the same inpainting endpoint as generative fill.  The newly-added
 * canvas region is marked as the "mask" while the existing pixels serve as
 * context.
 *
 * For large expansions the image is processed in overlapping tiles.
 */

import { isAIConfigured } from './ai-config'
import { requestInpainting, compositeResult } from './generative-fill'
import type { SelectionMask } from '@/tools/raster-selection'
import { getRasterData, storeRasterData, updateRasterCache } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { RasterLayer } from '@/types'

// ── Types ──

export type ExpandDirection = 'top' | 'bottom' | 'left' | 'right'

export interface GenerativeExpandSettings {
  direction: ExpandDirection
  /** Number of pixels to expand by. */
  expandPx: number
  /** Optional prompt to guide the generation. */
  prompt: string
}

const defaultSettings: GenerativeExpandSettings = {
  direction: 'right',
  expandPx: 256,
  prompt: '',
}

let currentSettings: GenerativeExpandSettings = { ...defaultSettings }

export function getGenerativeExpandSettings(): GenerativeExpandSettings {
  return { ...currentSettings }
}

export function setGenerativeExpandSettings(patch: Partial<GenerativeExpandSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Core logic ──

/** Maximum tile size before we split the expansion into multiple tiles. */
const MAX_TILE = 512

/** Overlap between adjacent tiles (in pixels). */
const TILE_OVERLAP = 64

/**
 * Build a new ImageData that is the original image expanded by `expandPx`
 * pixels in the given direction, plus a SelectionMask marking the new area.
 */
export function buildExpandedCanvas(
  original: ImageData,
  direction: ExpandDirection,
  expandPx: number,
): { expanded: ImageData; mask: SelectionMask; newWidth: number; newHeight: number } {
  const oW = original.width
  const oH = original.height

  let newW = oW
  let newH = oH
  let offsetX = 0
  let offsetY = 0

  switch (direction) {
    case 'right':
      newW = oW + expandPx
      break
    case 'left':
      newW = oW + expandPx
      offsetX = expandPx
      break
    case 'bottom':
      newH = oH + expandPx
      break
    case 'top':
      newH = oH + expandPx
      offsetY = expandPx
      break
  }

  // Create the expanded canvas and copy original pixels at the correct offset
  const expandedData = new Uint8ClampedArray(newW * newH * 4)
  for (let y = 0; y < oH; y++) {
    for (let x = 0; x < oW; x++) {
      const srcI = (y * oW + x) * 4
      const dstI = ((y + offsetY) * newW + (x + offsetX)) * 4
      expandedData[dstI] = original.data[srcI]!
      expandedData[dstI + 1] = original.data[srcI + 1]!
      expandedData[dstI + 2] = original.data[srcI + 2]!
      expandedData[dstI + 3] = original.data[srcI + 3]!
    }
  }

  const expanded = new ImageData(expandedData, newW, newH)

  // Build mask: new area = selected (255), existing area = 0
  const maskData = new Uint8Array(newW * newH)
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const inOriginal = x >= offsetX && x < offsetX + oW && y >= offsetY && y < offsetY + oH
      maskData[y * newW + x] = inOriginal ? 0 : 255
    }
  }

  const mask: SelectionMask = { width: newW, height: newH, data: maskData }

  return { expanded, mask, newWidth: newW, newHeight: newH }
}

/**
 * Split a large expansion into overlapping tiles.
 * Returns an array of tile bounds (in expanded-canvas coordinates).
 */
export function computeTiles(
  direction: ExpandDirection,
  expandPx: number,
  canvasW: number,
  canvasH: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (expandPx <= MAX_TILE) {
    return [{ x: 0, y: 0, w: canvasW, h: canvasH }]
  }

  const tiles: Array<{ x: number; y: number; w: number; h: number }> = []

  if (direction === 'left' || direction === 'right') {
    // Tile along the horizontal expansion
    const step = MAX_TILE - TILE_OVERLAP
    const perpSize = canvasH
    for (let offset = 0; offset < expandPx; offset += step) {
      const tileW = Math.min(MAX_TILE, expandPx - offset)
      const tileX = direction === 'right' ? canvasW - expandPx + offset : offset
      tiles.push({ x: tileX, y: 0, w: tileW + (canvasW - expandPx), h: perpSize })
    }
  } else {
    // Tile along the vertical expansion
    const step = MAX_TILE - TILE_OVERLAP
    const perpSize = canvasW
    for (let offset = 0; offset < expandPx; offset += step) {
      const tileH = Math.min(MAX_TILE, expandPx - offset)
      const tileY = direction === 'bottom' ? canvasH - expandPx + offset : offset
      tiles.push({ x: 0, y: tileY, w: perpSize, h: tileH + (canvasH - expandPx) })
    }
  }

  // Deduplicate / fallback: if we ended up with zero tiles send the whole thing
  return tiles.length > 0 ? tiles : [{ x: 0, y: 0, w: canvasW, h: canvasH }]
}

/**
 * Blend two ImageData arrays in the overlapping region.
 * Uses a simple linear cross-fade for the overlap strip.
 */
export function blendOverlap(
  base: ImageData,
  overlay: ImageData,
  overlapPx: number,
  direction: ExpandDirection,
): ImageData {
  const w = base.width
  const h = base.height
  const result = new Uint8ClampedArray(base.data)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t = 1.0 // blend factor: 0 = base, 1 = overlay

      if (overlapPx > 0) {
        if (direction === 'right' || direction === 'left') {
          const overlapStart = direction === 'right' ? w - overlapPx : 0
          const overlapEnd = direction === 'right' ? w : overlapPx
          if (x >= overlapStart && x < overlapEnd) {
            t = (x - overlapStart) / overlapPx
            if (direction === 'left') t = 1 - t
          }
        } else {
          const overlapStart = direction === 'bottom' ? h - overlapPx : 0
          const overlapEnd = direction === 'bottom' ? h : overlapPx
          if (y >= overlapStart && y < overlapEnd) {
            t = (y - overlapStart) / overlapPx
            if (direction === 'top') t = 1 - t
          }
        }
      }

      const i = (y * w + x) * 4
      result[i] = Math.round(base.data[i]! * (1 - t) + overlay.data[i]! * t)
      result[i + 1] = Math.round(base.data[i + 1]! * (1 - t) + overlay.data[i + 1]! * t)
      result[i + 2] = Math.round(base.data[i + 2]! * (1 - t) + overlay.data[i + 2]! * t)
      result[i + 3] = Math.round(base.data[i + 3]! * (1 - t) + overlay.data[i + 3]! * t)
    }
  }

  return new ImageData(result, w, h)
}

// ── Public API ──

/**
 * Full generative expand pipeline.
 *
 * 1. Build an expanded canvas with the existing image placed correctly.
 * 2. Mark the newly-added area as the inpainting mask.
 * 3. Send to the inpainting API (tiled if necessary).
 * 4. Composite and write back.
 */
export async function performGenerativeExpand(
  direction: ExpandDirection,
  expandPx: number,
  prompt?: string,
): Promise<ImageData> {
  if (!isAIConfigured()) {
    throw new Error('AI backend not configured. Open Preferences → AI to set endpoints.')
  }

  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) throw new Error('No artboard found.')

  // Find raster layer
  const selectedId = store.selection.layerIds[0]
  let rasterLayer: RasterLayer | undefined
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }
  if (!rasterLayer) throw new Error('No raster layer found.')

  const imageData = getRasterData(rasterLayer.imageChunkId)
  if (!imageData) throw new Error('No raster data for selected layer.')

  const beforeSnapshot = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)

  // Build expanded canvas
  const { expanded, mask, newWidth, newHeight } = buildExpandedCanvas(imageData, direction, expandPx)

  const croppedCtx = new ImageData(new Uint8ClampedArray(expanded.data), newWidth, newHeight)

  // Request from the inpainting API
  const results = await requestInpainting(croppedCtx, new Uint8Array(mask.data), prompt ?? currentSettings.prompt, 1)

  if (results.length === 0) {
    throw new Error('Inpainting API returned no results for expand.')
  }

  // Composite: the API result already covers the full expanded canvas
  const generated = results[0]!
  const composited = compositeResult(expanded, generated, mask, {
    x: 0,
    y: 0,
    w: newWidth,
    h: newHeight,
  })

  // Store the new (larger) image data
  storeRasterData(rasterLayer.imageChunkId, composited)
  updateRasterCache(rasterLayer.imageChunkId)

  // Update the raster layer dimensions
  store.updateLayer(artboard.id, rasterLayer.id, {
    width: newWidth,
    height: newHeight,
  } as Partial<RasterLayer>)

  store.pushRasterHistory('Generative Expand', rasterLayer.imageChunkId, beforeSnapshot, composited)

  return composited
}
