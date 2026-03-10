/**
 * Glue between the background removal filter and the editor store.
 *
 * 1. Finds the first selected raster layer.
 * 2. Reads its pixel data from the raster store.
 * 3. Applies background removal with the given params.
 * 4. Writes the result back and pushes an undo entry.
 */

import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData, updateRasterCache } from '@/store/raster-data'
import { removeBackground, DEFAULT_REMOVAL_PARAMS } from '@/filters/background-removal'
import type { BackgroundRemovalParams } from '@/filters/background-removal'
import type { RasterLayer } from '@/types/document'

/**
 * Apply background removal to the first selected raster layer.
 *
 * @param params  Optional overrides for the removal parameters.
 */
export function applyBackgroundRemovalFilter(params: Partial<BackgroundRemovalParams> = {}): void {
  const state = useEditorStore.getState()
  const artboard = state.document.artboards[0]
  if (!artboard) return

  const layerId = state.selection.layerIds[0]
  if (!layerId) return

  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'raster') return

  const rasterLayer = layer as RasterLayer
  const chunkId = rasterLayer.imageChunkId
  const srcData = getRasterData(chunkId)
  if (!srcData) return

  // Clone source for undo
  const beforeData = new ImageData(new Uint8ClampedArray(srcData.data), srcData.width, srcData.height)

  const fullParams: BackgroundRemovalParams = {
    ...DEFAULT_REMOVAL_PARAMS,
    ...params,
  }

  const result = removeBackground(srcData, fullParams)

  // Write the result into the raster store
  storeRasterData(chunkId, result)
  updateRasterCache(chunkId)

  // Record undo entry
  state.pushRasterHistory('Filter: Remove Background', chunkId, beforeData, result)
}
