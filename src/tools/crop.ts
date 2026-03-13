import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'
import type { CropRegion, RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Interactive crop drag state
// ---------------------------------------------------------------------------

interface CropDragState {
  artboardId: string
  /** Starting document-space coordinate */
  startX: number
  startY: number
  /** Current document-space coordinate */
  curX: number
  curY: number
}

let cropDrag: CropDragState | null = null

export function beginCropDrag(docX: number, docY: number, artboardId: string) {
  cropDrag = { artboardId, startX: docX, startY: docY, curX: docX, curY: docY }
}

export function updateCropDrag(docX: number, docY: number) {
  if (!cropDrag) return
  cropDrag.curX = docX
  cropDrag.curY = docY
}

export function isCropDragging(): boolean {
  return cropDrag !== null
}

/** Get the current crop rectangle in document space (normalised so w/h > 0). */
export function getCropDragRect(): { x: number; y: number; w: number; h: number } | null {
  if (!cropDrag) return null
  const x = Math.min(cropDrag.startX, cropDrag.curX)
  const y = Math.min(cropDrag.startY, cropDrag.curY)
  const w = Math.abs(cropDrag.curX - cropDrag.startX)
  const h = Math.abs(cropDrag.curY - cropDrag.startY)
  if (w < 1 || h < 1) return null
  return { x, y, w, h }
}

/**
 * Finish the crop drag — apply the crop.
 *
 * If a raster layer is selected, crop its pixel data.
 * Otherwise crop the artboard (resize + offset all layer transforms).
 */
export function endCropDrag() {
  const d = cropDrag
  if (!d) return
  cropDrag = null

  const rect = getCropDragFromState(d)
  if (!rect) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
  if (!artboard) return

  // Check if a raster layer is selected
  const sel = store.selection
  if (sel.layerIds.length === 1) {
    const layer = artboard.layers.find((l) => l.id === sel.layerIds[0])
    if (layer && layer.type === 'raster') {
      applyRasterCrop(d.artboardId, layer.id, rect, artboard)
      return
    }
  }

  // Artboard crop: clamp rect to artboard bounds
  const cx = Math.max(artboard.x, rect.x)
  const cy = Math.max(artboard.y, rect.y)
  const cx2 = Math.min(artboard.x + artboard.width, rect.x + rect.w)
  const cy2 = Math.min(artboard.y + artboard.height, rect.y + rect.h)
  const cw = cx2 - cx
  const ch = cy2 - cy
  if (cw < 1 || ch < 1) return

  // Offset all layer transforms so their positions are preserved visually
  const dx = cx - artboard.x
  const dy = cy - artboard.y
  for (const layer of artboard.layers) {
    store.updateLayerSilent(d.artboardId, layer.id, {
      transform: { ...layer.transform, x: layer.transform.x - dx, y: layer.transform.y - dy },
    })
  }
  store.resizeArtboard(d.artboardId, Math.round(cw), Math.round(ch))
}

export function cancelCropDrag() {
  cropDrag = null
}

/** Helper to compute rect from raw state (avoids reading stale module var). */
function getCropDragFromState(d: CropDragState) {
  const x = Math.min(d.startX, d.curX)
  const y = Math.min(d.startY, d.curY)
  const w = Math.abs(d.curX - d.startX)
  const h = Math.abs(d.curY - d.startY)
  if (w < 1 || h < 1) return null
  return { x, y, w, h }
}

// ---------------------------------------------------------------------------
// Raster crop (destructive)
// ---------------------------------------------------------------------------

function applyRasterCrop(
  artboardId: string,
  layerId: string,
  rect: { x: number; y: number; w: number; h: number },
  artboard: { x: number; y: number },
) {
  const store = useEditorStore.getState()
  const layer = store.document.artboards.find((a) => a.id === artboardId)?.layers.find((l) => l.id === layerId) as
    | RasterLayer
    | undefined
  if (!layer) return

  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return

  // Convert document-space rect to layer-local pixel coordinates
  const t = layer.transform
  const sx = t.scaleX || 1
  const sy = t.scaleY || 1
  const localX = (rect.x - artboard.x - t.x) / sx
  const localY = (rect.y - artboard.y - t.y) / sy
  const localW = rect.w / Math.abs(sx)
  const localH = rect.h / Math.abs(sy)

  // Clamp to image bounds
  const x0 = Math.max(0, Math.round(localX))
  const y0 = Math.max(0, Math.round(localY))
  const x1 = Math.min(imageData.width, Math.round(localX + localW))
  const y1 = Math.min(imageData.height, Math.round(localY + localH))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return

  const cropped = new ImageData(w, h)
  for (let row = 0; row < h; row++) {
    const srcOff = ((y0 + row) * imageData.width + x0) * 4
    const dstOff = row * w * 4
    cropped.data.set(imageData.data.subarray(srcOff, srcOff + w * 4), dstOff)
  }

  storeRasterData(layer.imageChunkId, cropped)

  store.updateLayer(artboardId, layerId, {
    width: w,
    height: h,
    transform: {
      ...t,
      x: t.x + x0 * sx,
      y: t.y + y0 * sy,
    },
  } as Partial<RasterLayer>)
}

/**
 * Apply a crop region to a raster layer (legacy API).
 */
export function applyCrop(artboardId: string, layerId: string, region: CropRegion) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === layerId) as RasterLayer | undefined
  if (!layer || layer.type !== 'raster') return

  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return

  const x = Math.max(0, Math.round(region.x))
  const y = Math.max(0, Math.round(region.y))
  const w = Math.min(imageData.width - x, Math.round(region.width))
  const h = Math.min(imageData.height - y, Math.round(region.height))
  if (w <= 0 || h <= 0) return

  const cropped = new ImageData(w, h)
  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * imageData.width + x) * 4
    const dstOffset = row * w * 4
    cropped.data.set(imageData.data.subarray(srcOffset, srcOffset + w * 4), dstOffset)
  }

  storeRasterData(layer.imageChunkId, cropped)

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
