/**
 * Glue between the progressive-blur filter and the editor store.
 *
 * 1. Finds the first selected raster layer.
 * 2. Reads its pixel data from the raster store.
 * 3. Applies the progressive blur with reasonable defaults.
 * 4. Writes the result back and pushes an undo entry.
 */

import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, storeRasterData, updateRasterCache } from '@/store/raster-data'
import { applyProgressiveBlur } from '@/filters/progressive-blur'
import type { RasterLayer } from '@/types/document'
import type { ProgressiveBlurParams } from '@/filters/progressive-blur'

/**
 * Apply progressive blur to the first selected raster layer using
 * reasonable defaults (linear, 90 degrees, radius 0 -> 20).
 */
export function applyProgressiveBlurFilter(): void {
  const state = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const layerId = state.selection.layerIds[0]
  if (!layerId) return

  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'raster') return

  const rasterLayer = layer as RasterLayer
  const chunkId = rasterLayer.imageChunkId
  const srcData = getRasterData(chunkId)
  if (!srcData) return

  // Clone source so we can keep a before snapshot for undo
  const beforeData = new ImageData(new Uint8ClampedArray(srcData.data), srcData.width, srcData.height)

  const params: ProgressiveBlurParams = {
    kind: 'progressive-blur',
    direction: 'linear',
    angle: 90,
    startRadius: 0,
    endRadius: 20,
    startPosition: 0,
    endPosition: 1,
  }

  const result = applyProgressiveBlur(srcData, params)

  // Write the result into the raster store
  storeRasterData(chunkId, result)
  updateRasterCache(chunkId)

  // Record undo entry
  state.pushRasterHistory('Filter: Progressive Blur', chunkId, beforeData, result)
}
