import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'
import type { CropRegion, RasterLayer } from '@/types'

/**
 * Apply a crop region to a raster layer.
 * This actually modifies the pixel data (destructive crop).
 */
export function applyCrop(artboardId: string, layerId: string, region: CropRegion) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find(a => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find(l => l.id === layerId) as RasterLayer | undefined
  if (!layer || layer.type !== 'raster') return

  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return

  // Clamp crop region to image bounds
  const x = Math.max(0, Math.round(region.x))
  const y = Math.max(0, Math.round(region.y))
  const w = Math.min(imageData.width - x, Math.round(region.width))
  const h = Math.min(imageData.height - y, Math.round(region.height))

  if (w <= 0 || h <= 0) return

  // Extract the cropped region
  const cropped = new ImageData(w, h)
  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * imageData.width + x) * 4
    const dstOffset = row * w * 4
    cropped.data.set(
      imageData.data.subarray(srcOffset, srcOffset + w * 4),
      dstOffset,
    )
  }

  // Store cropped data
  storeRasterData(layer.imageChunkId, cropped)

  // Update layer dimensions and adjust transform
  store.updateLayer(artboardId, layerId, {
    width: w,
    height: h,
    transform: {
      ...layer.transform,
      x: layer.transform.x + x * layer.transform.scaleX,
      y: layer.transform.y + y * layer.transform.scaleY,
    },
  } as Partial<RasterLayer>)
}

/**
 * Set a non-destructive crop region on a raster layer.
 */
export function setCropRegion(artboardId: string, layerId: string, region: CropRegion) {
  const store = useEditorStore.getState()
  store.updateLayer(artboardId, layerId, { cropRegion: region } as Partial<RasterLayer>)
}

/**
 * Remove the crop region from a raster layer.
 */
export function clearCropRegion(artboardId: string, layerId: string) {
  const store = useEditorStore.getState()
  store.updateLayer(artboardId, layerId, { cropRegion: undefined } as Partial<RasterLayer>)
}

/**
 * Get the effective dimensions of a raster layer (considering crop region).
 */
export function getEffectiveDimensions(layer: RasterLayer): { width: number; height: number } {
  if (layer.cropRegion) {
    return { width: layer.cropRegion.width, height: layer.cropRegion.height }
  }
  return { width: layer.width, height: layer.height }
}
