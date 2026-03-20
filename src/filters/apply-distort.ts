/**
 * Glue between the distortion filter functions and the editor store.
 *
 * Each helper:
 * 1. Finds the first selected raster layer.
 * 2. Reads its pixel data from the raster store.
 * 3. Applies the requested distortion.
 * 4. Writes the result back and pushes an undo entry.
 */

import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, storeRasterData, updateRasterCache } from '@/store/raster-data'
import { applyWave, applyTwirl, applyPinch, applySphereize } from '@/filters/distort'
import type { RasterLayer } from '@/types/document'

export type DistortKind = 'wave' | 'twirl' | 'pinch' | 'spherize'

/**
 * Apply a distortion filter to the first selected raster layer using
 * reasonable defaults.
 */
export function applyDistortFilter(kind: DistortKind): void {
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

  // Clone source so we can compare for undo
  const beforeData = new ImageData(new Uint8ClampedArray(srcData.data), srcData.width, srcData.height)

  let result: ImageData

  switch (kind) {
    case 'wave':
      // Reasonable defaults: 10px amplitude, 3 cycles
      result = applyWave(srcData, 10, 10, 3, 3)
      break
    case 'twirl':
      // 90 degrees (pi/2), auto-radius
      result = applyTwirl(srcData, Math.PI / 2, 0)
      break
    case 'pinch':
      // Moderate pinch
      result = applyPinch(srcData, 0.5)
      break
    case 'spherize':
      // Moderate spherize
      result = applySphereize(srcData, 0.7)
      break
  }

  // Write the transformed pixels into the raster store
  storeRasterData(chunkId, result)
  updateRasterCache(chunkId)

  // Record undo entry
  const labels: Record<DistortKind, string> = {
    wave: 'Distort: Wave',
    twirl: 'Distort: Twirl',
    pinch: 'Distort: Pinch/Bulge',
    spherize: 'Distort: Spherize',
  }

  state.pushRasterHistory(labels[kind], chunkId, beforeData, result)
}
