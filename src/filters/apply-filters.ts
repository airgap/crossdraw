/**
 * Glue between the new filter functions and the editor store.
 *
 * Each helper:
 * 1. Finds the first selected raster layer.
 * 2. Reads its pixel data from the raster store.
 * 3. Applies the requested filter.
 * 4. Writes the result back and pushes an undo entry.
 */

import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData, updateRasterCache } from '@/store/raster-data'
import { applySharpen } from '@/filters/sharpen'
import { applyMotionBlur, applyRadialBlur } from '@/filters/motion-blur'
import {
  applyPosterize,
  applyThreshold,
  applyInvert,
  applyDesaturate,
  applyVibrance,
  applyChannelMixer,
} from '@/filters/color-adjust'
import type { RasterLayer } from '@/types/document'

// ── Helpers ──────────────────────────────────────────────────

/** Resolve the first selected raster layer's chunk data, or null. */
function getSelectedRasterChunk(): { chunkId: string; srcData: ImageData } | null {
  const state = useEditorStore.getState()
  const artboard = state.document.artboards[0]
  if (!artboard) return null

  const layerId = state.selection.layerIds[0]
  if (!layerId) return null

  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'raster') return null

  const rasterLayer = layer as RasterLayer
  const chunkId = rasterLayer.imageChunkId
  const srcData = getRasterData(chunkId)
  if (!srcData) return null

  return { chunkId, srcData }
}

/** Clone an ImageData for undo snapshot. */
function cloneImageData(img: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)
}

/** Write result into raster store, refresh cache, and push undo. */
function commitResult(label: string, chunkId: string, beforeData: ImageData, result: ImageData): void {
  storeRasterData(chunkId, result)
  updateRasterCache(chunkId)
  useEditorStore.getState().pushRasterHistory(label, chunkId, beforeData, result)
}

// ── Sharpen ──────────────────────────────────────────────────

export function applySharpenFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applySharpen(srcData, { amount: 1.5, radius: 1, threshold: 0 })
  commitResult('Filter: Sharpen', chunkId, beforeData, result)
}

export function applyUnsharpMaskFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applySharpen(srcData, { amount: 0.5, radius: 3, threshold: 4 })
  commitResult('Filter: Unsharp Mask', chunkId, beforeData, result)
}

// ── Motion / Radial Blur ─────────────────────────────────────

export function applyMotionBlurFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyMotionBlur(srcData, { angle: 0, distance: 15 })
  commitResult('Filter: Motion Blur', chunkId, beforeData, result)
}

export function applyRadialBlurFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyRadialBlur(srcData, {
    centerX: srcData.width / 2,
    centerY: srcData.height / 2,
    amount: 10,
  })
  commitResult('Filter: Radial Blur', chunkId, beforeData, result)
}

// ── Colour Adjustments ───────────────────────────────────────

export function applyPosterizeFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyPosterize(srcData, { levels: 4 })
  commitResult('Filter: Posterize', chunkId, beforeData, result)
}

export function applyThresholdFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyThreshold(srcData, { value: 128 })
  commitResult('Filter: Threshold', chunkId, beforeData, result)
}

export function applyInvertFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyInvert(srcData)
  commitResult('Filter: Invert', chunkId, beforeData, result)
}

export function applyDesaturateFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyDesaturate(srcData)
  commitResult('Filter: Desaturate', chunkId, beforeData, result)
}

export function applyVibranceFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  const result = applyVibrance(srcData, { amount: 0.5 })
  commitResult('Filter: Vibrance', chunkId, beforeData, result)
}

export function applyChannelMixerFilter(): void {
  const resolved = getSelectedRasterChunk()
  if (!resolved) return
  const { chunkId, srcData } = resolved
  const beforeData = cloneImageData(srcData)
  // Default: identity matrix (no change) — users would customise via a dialog.
  const result = applyChannelMixer(srcData, {
    rr: 1,
    rg: 0,
    rb: 0,
    gr: 0,
    gg: 1,
    gb: 0,
    br: 0,
    bg: 0,
    bb: 1,
  })
  commitResult('Filter: Channel Mixer', chunkId, beforeData, result)
}
