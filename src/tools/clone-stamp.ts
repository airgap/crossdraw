import { useEditorStore } from '@/store/editor.store'
import { getRasterData, getRasterCanvasCtx, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer, BrushSettings } from '@/types'

/**
 * Clone Stamp tool — samples pixels from a source area and paints them
 * at the destination using a circular brush mask.
 *
 * Workflow:
 *   1. Alt+Click to set the source sampling origin.
 *   2. Click+Drag to paint: copies pixels from source area to destination
 *      maintaining a fixed offset between source and destination.
 */

export interface CloneStampState {
  sourceSet: boolean
  sourceX: number
  sourceY: number
  offsetX: number
  offsetY: number
  painting: boolean
  lastX: number
  lastY: number
}

const state: CloneStampState = {
  sourceSet: false,
  sourceX: 0,
  sourceY: 0,
  offsetX: 0,
  offsetY: 0,
  painting: false,
  lastX: 0,
  lastY: 0,
}

const defaultSettings: BrushSettings = {
  size: 20,
  hardness: 0.8,
  opacity: 1,
  flow: 1,
  color: '#000000',
  spacing: 0.25,
}

let currentSettings: BrushSettings = { ...defaultSettings }

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let distRemainder = 0

export function getCloneStampSettings(): BrushSettings {
  return { ...currentSettings }
}

export function setCloneStampSettings(settings: Partial<BrushSettings>) {
  Object.assign(currentSettings, settings)
}

/**
 * Set the clone source point (Alt+Click).
 * docX/docY are in artboard-local coordinates.
 */
export function setCloneSource(docX: number, docY: number): void {
  state.sourceX = docX
  state.sourceY = docY
  state.sourceSet = true
  // Reset offset — it will be computed on the first paint click
  state.offsetX = 0
  state.offsetY = 0
}

/**
 * Begin a clone stamp stroke at the given artboard-local position.
 * Returns the active chunk ID, or null if no raster layer is available.
 */
export function beginCloneStamp(docX: number, docY: number, _artboardId: string): string | null {
  if (!state.sourceSet) return null

  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  // Find existing raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  // Fallback: find first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  // No raster layer to clone from — nothing to do
  if (!rasterLayer) return null

  activeChunkId = rasterLayer.imageChunkId

  // Compute fixed offset: source - destination
  state.offsetX = state.sourceX - docX
  state.offsetY = state.sourceY - docY

  // Snapshot raster data before painting for undo
  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }

  state.painting = true
  state.lastX = docX
  state.lastY = docY
  distRemainder = 0

  // Paint the first dab
  stampClone(docX, docY)

  return activeChunkId
}

/**
 * Continue painting a clone stamp stroke.
 * Walks from the last position to the new one with spacing-based dabs.
 */
export function paintCloneStamp(docX: number, docY: number): void {
  if (!state.painting || !activeChunkId) return

  const spacingPx = Math.max(1, currentSettings.size * currentSettings.spacing)

  const dx = docX - state.lastX
  const dy = docY - state.lastY
  const segLen = Math.sqrt(dx * dx + dy * dy)
  if (segLen < 0.5) return

  const ux = dx / segLen
  const uy = dy / segLen

  let d = spacingPx - distRemainder
  while (d <= segLen) {
    const sx = state.lastX + ux * d
    const sy = state.lastY + uy * d
    stampClone(sx, sy)
    d += spacingPx
  }
  distRemainder = segLen - (d - spacingPx)
  state.lastX = docX
  state.lastY = docY
}

/**
 * Stamp a single clone dab at the given destination position.
 * Reads pixels from (destX + offsetX, destY + offsetY) in the source
 * and paints them at (destX, destY).
 */
function stampClone(destX: number, destY: number): void {
  if (!activeChunkId) return

  const ctx = getRasterCanvasCtx(activeChunkId)
  if (!ctx) return

  // We need the source pixel data — read from the pre-stroke snapshot
  // so we don't sample from already-painted pixels.
  const sourceData = preStrokeSnapshot
  if (!sourceData) return

  const brushSize = currentSettings.size
  const halfBrush = brushSize / 2
  const hardness = currentSettings.hardness
  const opacity = currentSettings.opacity * currentSettings.flow
  const dim = Math.max(1, Math.ceil(brushSize))

  // Source center
  const srcCX = destX + state.offsetX
  const srcCY = destY + state.offsetY

  // Create a temporary canvas with the sampled pixels masked to a circle
  const tmpCanvas = new OffscreenCanvas(dim, dim)
  const tmpCtx = tmpCanvas.getContext('2d')!

  // Extract source region into an ImageData
  const srcStartX = Math.round(srcCX - halfBrush)
  const srcStartY = Math.round(srcCY - halfBrush)

  const tmpData = tmpCtx.createImageData(dim, dim)
  const center = dim / 2

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      // Check circular mask
      const dx = x + 0.5 - center
      const dy = y + 0.5 - center
      const dist = Math.sqrt(dx * dx + dy * dy) / (brushSize / 2)
      if (dist > 1) continue

      // Hardness falloff
      let alpha: number
      if (hardness >= 1) {
        alpha = 1
      } else {
        const fade = dist <= hardness ? 1 : 1 - (dist - hardness) / (1 - hardness)
        alpha = fade * fade * fade // cubic falloff
      }
      alpha *= opacity

      // Read from source
      const sx = srcStartX + x
      const sy = srcStartY + y
      if (sx < 0 || sy < 0 || sx >= sourceData.width || sy >= sourceData.height) continue

      const srcIdx = (sy * sourceData.width + sx) * 4
      const dstIdx = (y * dim + x) * 4
      tmpData.data[dstIdx] = sourceData.data[srcIdx]!
      tmpData.data[dstIdx + 1] = sourceData.data[srcIdx + 1]!
      tmpData.data[dstIdx + 2] = sourceData.data[srcIdx + 2]!
      tmpData.data[dstIdx + 3] = Math.round(sourceData.data[srcIdx + 3]! * alpha)
    }
  }

  tmpCtx.putImageData(tmpData, 0, 0)

  // Paint onto the destination
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(tmpCanvas, Math.round(destX - halfBrush), Math.round(destY - halfBrush))
}

/**
 * End the clone stamp stroke — sync canvas to ImageData and push undo.
 */
export function endCloneStamp(): void {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Clone stamp stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  state.painting = false
  distRemainder = 0
}

/** Returns true if currently in a clone stamp stroke. */
export function isCloneStamping(): boolean {
  return state.painting
}

/** Returns true if a source point has been set. */
export function hasCloneSource(): boolean {
  return state.sourceSet
}

/** Returns the current clone source point, or null if not set. */
export function getCloneSource(): { x: number; y: number } | null {
  if (!state.sourceSet) return null
  return { x: state.sourceX, y: state.sourceY }
}
