import { useEditorStore } from '@/store/editor.store'
import { getRasterData, getRasterCanvasCtx, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer, BrushSettings } from '@/types'

/**
 * Healing Brush tool — samples texture from a source area and blends it
 * with the destination color, preserving the local color while transferring
 * the source luminance/detail.
 *
 * Workflow:
 *   1. Alt+Click to set the source sampling origin.
 *   2. Click+Drag to paint: blends source texture with destination color
 *      maintaining a fixed offset between source and destination.
 */

export interface HealingBrushState {
  sourceSet: boolean
  sourceX: number
  sourceY: number
  offsetX: number
  offsetY: number
  painting: boolean
  lastX: number
  lastY: number
}

const state: HealingBrushState = {
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

export function getHealingBrushSettings(): BrushSettings {
  return { ...currentSettings }
}

export function setHealingBrushSettings(settings: Partial<BrushSettings>) {
  Object.assign(currentSettings, settings)
}

/**
 * Set the healing source point (Alt+Click).
 * docX/docY are in artboard-local coordinates.
 */
export function setHealingSource(docX: number, docY: number): void {
  state.sourceX = docX
  state.sourceY = docY
  state.sourceSet = true
  // Reset offset — it will be computed on the first paint click
  state.offsetX = 0
  state.offsetY = 0
}

/**
 * Begin a healing brush stroke at the given artboard-local position.
 * Returns the active chunk ID, or null if no raster layer is available.
 */
export function beginHealingStroke(docX: number, docY: number, _artboardId: string): string | null {
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

  // No raster layer — nothing to do
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
  stampHealing(docX, docY)

  return activeChunkId
}

/**
 * Continue painting a healing brush stroke.
 * Walks from the last position to the new one with spacing-based dabs.
 */
export function paintHealingStroke(docX: number, docY: number): void {
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
    stampHealing(sx, sy)
    d += spacingPx
  }
  distRemainder = segLen - (d - spacingPx)
  state.lastX = docX
  state.lastY = docY
}

/**
 * Stamp a single healing dab at the given destination position.
 * Reads source pixels from the pre-stroke snapshot, reads destination pixels
 * from the current ImageData, then blends source luminance with destination
 * color to produce a healed result.
 */
function stampHealing(destX: number, destY: number): void {
  if (!activeChunkId) return

  const ctx = getRasterCanvasCtx(activeChunkId)
  if (!ctx) return

  // Source pixel data from the pre-stroke snapshot
  const sourceData = preStrokeSnapshot
  if (!sourceData) return

  // Current destination pixel data (may include previous dabs in this stroke)
  const destData = getRasterData(activeChunkId)
  if (!destData) return

  const brushSize = currentSettings.size
  const halfBrush = brushSize / 2
  const hardness = currentSettings.hardness
  const opacity = currentSettings.opacity * currentSettings.flow
  const dim = Math.max(1, Math.ceil(brushSize))

  // Source center
  const srcCX = destX + state.offsetX
  const srcCY = destY + state.offsetY

  // Dest start position
  const destStartX = Math.round(destX - halfBrush)
  const destStartY = Math.round(destY - halfBrush)

  // Source start position
  const srcStartX = Math.round(srcCX - halfBrush)
  const srcStartY = Math.round(srcCY - halfBrush)

  const center = dim / 2

  // Build the healed dab into a temporary ImageData
  const tmpCanvas = new OffscreenCanvas(dim, dim)
  const tmpCtx = tmpCanvas.getContext('2d')!
  const tmpData = tmpCtx.createImageData(dim, dim)

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

      // Source pixel coords (from pre-stroke snapshot)
      const sx = srcStartX + x
      const sy = srcStartY + y
      if (sx < 0 || sy < 0 || sx >= sourceData.width || sy >= sourceData.height) continue

      // Destination pixel coords (from current image data)
      const dstPx = destStartX + x
      const dstPy = destStartY + y
      if (dstPx < 0 || dstPy < 0 || dstPx >= destData.width || dstPy >= destData.height) continue

      const srcIdx = (sy * sourceData.width + sx) * 4
      const dstIdx = (dstPy * destData.width + dstPx) * 4

      const srcR = sourceData.data[srcIdx]!
      const srcG = sourceData.data[srcIdx + 1]!
      const srcB = sourceData.data[srcIdx + 2]!
      const srcA = sourceData.data[srcIdx + 3]!

      const dstR = destData.data[dstIdx]!
      const dstG = destData.data[dstIdx + 1]!
      const dstB = destData.data[dstIdx + 2]!
      const dstA = destData.data[dstIdx + 3]!

      // Compute luminance-based healing:
      // Transfer source luminance to destination color
      const srcLum = 0.299 * srcR + 0.587 * srcG + 0.114 * srcB
      const dstLum = 0.299 * dstR + 0.587 * dstG + 0.114 * dstB

      let healedR: number
      let healedG: number
      let healedB: number

      if (dstLum > 0) {
        const ratio = srcLum / dstLum
        healedR = Math.min(255, Math.max(0, Math.round(dstR * ratio)))
        healedG = Math.min(255, Math.max(0, Math.round(dstG * ratio)))
        healedB = Math.min(255, Math.max(0, Math.round(dstB * ratio)))
      } else {
        // Destination is black — fall back to source pixels
        healedR = srcR
        healedG = srcG
        healedB = srcB
      }

      // Blend healed pixel with destination using mask alpha
      const maskAlpha = alpha
      const finalR = Math.round(dstR + (healedR - dstR) * maskAlpha)
      const finalG = Math.round(dstG + (healedG - dstG) * maskAlpha)
      const finalB = Math.round(dstB + (healedB - dstB) * maskAlpha)
      const finalA = Math.round(dstA + (srcA - dstA) * maskAlpha)

      const tmpIdx = (y * dim + x) * 4
      tmpData.data[tmpIdx] = finalR
      tmpData.data[tmpIdx + 1] = finalG
      tmpData.data[tmpIdx + 2] = finalB
      tmpData.data[tmpIdx + 3] = finalA
    }
  }

  // Write the healed dab directly to the canvas using 'copy' so we replace
  // pixels rather than compositing on top
  tmpCtx.putImageData(tmpData, 0, 0)

  // We need to draw only the non-zero pixels from tmpCanvas onto the destination.
  // Because the healed pixels already include the blended result, we write them
  // directly by drawing a rect of the dest area first, then compositing.
  // Simpler approach: put the healed pixels directly into the destination ImageData.
  const currentData = getRasterData(activeChunkId)
  if (!currentData) return

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const tmpIdx = (y * dim + x) * 4
      const tA = tmpData.data[tmpIdx + 3]!
      if (tA === 0) continue

      const dstPx = destStartX + x
      const dstPy = destStartY + y
      if (dstPx < 0 || dstPy < 0 || dstPx >= currentData.width || dstPy >= currentData.height) continue

      const dstIdx = (dstPy * currentData.width + dstPx) * 4
      currentData.data[dstIdx] = tmpData.data[tmpIdx]!
      currentData.data[dstIdx + 1] = tmpData.data[tmpIdx + 1]!
      currentData.data[dstIdx + 2] = tmpData.data[tmpIdx + 2]!
      currentData.data[dstIdx + 3] = tmpData.data[tmpIdx + 3]!
    }
  }

  updateRasterCache(activeChunkId)
}

/**
 * End the healing brush stroke — sync canvas to ImageData and push undo.
 */
export function endHealingStroke(): void {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Healing brush stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  state.painting = false
  distRemainder = 0
}

/** Returns true if a source point has been set. */
export function hasHealingSource(): boolean {
  return state.sourceSet
}

/** Returns the current healing source point, or null if not set. */
export function getHealingSource(): { x: number; y: number } | null {
  if (!state.sourceSet) return null
  return { x: state.sourceX, y: state.sourceY }
}
