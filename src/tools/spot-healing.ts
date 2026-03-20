import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, updateRasterCache, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

/**
 * Spot Healing Brush — paint over a blemish and it automatically finds
 * source texture from the surrounding border region.
 *
 * Algorithm:
 *   1. User paints a stroke (like a normal brush) — we build a mask of painted pixels.
 *   2. On stroke end, for each pixel in the stroke mask we sample texture from a
 *      ring of pixels around the painted area (border region).
 *   3. Two modes:
 *      - proximity-match: for each stroke pixel, blend nearest border samples weighted by distance.
 *      - create-texture: average border texture into a tile and fill the stroke region.
 *   4. Apply luminance ratio transfer to match local tone (same technique as healing brush).
 */

export interface SpotHealingSettings {
  size: number
  hardness: number
  type: 'proximity-match' | 'create-texture'
}

const defaultSettings: SpotHealingSettings = {
  size: 20,
  hardness: 0.8,
  type: 'proximity-match',
}

let currentSettings: SpotHealingSettings = { ...defaultSettings }

export function getSpotHealingSettings(): SpotHealingSettings {
  return { ...currentSettings }
}

export function setSpotHealingSettings(settings: Partial<SpotHealingSettings>): void {
  Object.assign(currentSettings, settings)
}

// ── Stroke state ──

interface StrokeState {
  painting: boolean
  lastX: number
  lastY: number
  /** Mask of painted pixels: key = `${x},${y}`, value = brush alpha at that pixel */
  mask: Map<string, number>
  /** Bounding box of the mask */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const state: StrokeState = {
  painting: false,
  lastX: 0,
  lastY: 0,
  mask: new Map(),
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
}

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let distRemainder = 0

// ── Helpers ──

function findRasterChunkId(): string | null {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return null

  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') return (layer as RasterLayer).imageChunkId
  }
  const raster = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  return raster?.imageChunkId ?? null
}

/** Stamp the brush mask (not pixels) at a given position. */
function stampMask(cx: number, cy: number): void {
  const brushSize = currentSettings.size
  const halfBrush = brushSize / 2
  const hardness = currentSettings.hardness
  const dim = Math.max(1, Math.ceil(brushSize))
  const center = dim / 2

  const startX = Math.round(cx - halfBrush)
  const startY = Math.round(cy - halfBrush)

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const dx = x + 0.5 - center
      const dy = y + 0.5 - center
      const dist = Math.sqrt(dx * dx + dy * dy) / (brushSize / 2)
      if (dist > 1) continue

      let alpha: number
      if (hardness >= 1) {
        alpha = 1
      } else {
        const fade = dist <= hardness ? 1 : 1 - (dist - hardness) / (1 - hardness)
        alpha = fade * fade * fade
      }

      const px = startX + x
      const py = startY + y
      const key = `${px},${py}`
      const existing = state.mask.get(key) ?? 0
      state.mask.set(key, Math.min(1, Math.max(existing, alpha)))

      if (px < state.minX) state.minX = px
      if (py < state.minY) state.minY = py
      if (px > state.maxX) state.maxX = px
      if (py > state.maxY) state.maxY = py
    }
  }
}

// ── Public API ──

/**
 * Begin a spot healing stroke at the given artboard-local position.
 * Returns the active chunk ID, or null if no raster layer is available.
 */
export function beginSpotHealing(docX: number, docY: number, _artboardId: string): string | null {
  const chunkId = findRasterChunkId()
  if (!chunkId) return null

  activeChunkId = chunkId

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
  state.mask = new Map()
  state.minX = Infinity
  state.minY = Infinity
  state.maxX = -Infinity
  state.maxY = -Infinity
  distRemainder = 0

  // First dab
  stampMask(docX, docY)

  return activeChunkId
}

/**
 * Continue the spot healing stroke — records the brush mask along the path.
 */
export function paintSpotHealing(docX: number, docY: number): void {
  if (!state.painting || !activeChunkId) return

  const spacingPx = Math.max(1, currentSettings.size * 0.25)

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
    stampMask(sx, sy)
    d += spacingPx
  }
  distRemainder = segLen - (d - spacingPx)
  state.lastX = docX
  state.lastY = docY
}

/**
 * End the spot healing stroke — apply the healing algorithm and push undo.
 */
export function endSpotHealing(): void {
  if (!state.painting || !activeChunkId) {
    state.painting = false
    distRemainder = 0
    return
  }

  const imageData = preStrokeSnapshot
  if (!imageData || state.mask.size === 0) {
    cleanupStroke()
    return
  }

  const currentData = getRasterData(activeChunkId)
  if (!currentData) {
    cleanupStroke()
    return
  }

  const borderRadius = Math.max(3, Math.ceil(currentSettings.size / 2))

  // Collect border pixels — pixels NOT in the mask but within borderRadius of the mask boundary
  const borderPixels: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }> = []

  const expandMinX = Math.max(0, state.minX - borderRadius)
  const expandMinY = Math.max(0, state.minY - borderRadius)
  const expandMaxX = Math.min(imageData.width - 1, state.maxX + borderRadius)
  const expandMaxY = Math.min(imageData.height - 1, state.maxY + borderRadius)

  for (let y = expandMinY; y <= expandMaxY; y++) {
    for (let x = expandMinX; x <= expandMaxX; x++) {
      const key = `${x},${y}`
      if (state.mask.has(key)) continue
      if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) continue

      // Check if this pixel is within borderRadius of any mask pixel
      let nearMask = false
      // Check a small window instead of iterating all mask pixels
      const checkRange = borderRadius
      for (let dy = -checkRange; dy <= checkRange && !nearMask; dy++) {
        for (let dx = -checkRange; dx <= checkRange && !nearMask; dx++) {
          const checkKey = `${x + dx},${y + dy}`
          if (state.mask.has(checkKey)) {
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist <= borderRadius) nearMask = true
          }
        }
      }

      if (nearMask) {
        const idx = (y * imageData.width + x) * 4
        borderPixels.push({
          x,
          y,
          r: imageData.data[idx]!,
          g: imageData.data[idx + 1]!,
          b: imageData.data[idx + 2]!,
          a: imageData.data[idx + 3]!,
        })
      }
    }
  }

  if (borderPixels.length === 0) {
    cleanupStroke()
    return
  }

  // Apply healing based on mode
  if (currentSettings.type === 'create-texture') {
    applyCreateTexture(currentData, imageData, borderPixels)
  } else {
    applyProximityMatch(currentData, imageData, borderPixels)
  }

  updateRasterCache(activeChunkId)
  syncCanvasToImageData(activeChunkId)

  if (preStrokeSnapshot) {
    const afterData = getRasterData(activeChunkId)
    if (afterData) {
      useEditorStore.getState().pushRasterHistory('Spot healing brush', activeChunkId, preStrokeSnapshot, afterData)
    }
  }

  cleanupStroke()
}

function cleanupStroke(): void {
  preStrokeSnapshot = null
  activeChunkId = null
  state.painting = false
  state.mask.clear()
  distRemainder = 0
}

/**
 * Proximity-match mode: for each stroke pixel, blend border samples weighted
 * by inverse distance, then apply luminance ratio transfer.
 */
function applyProximityMatch(
  targetData: ImageData,
  sourceSnapshot: ImageData,
  borderPixels: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }>,
): void {
  for (const [key, maskAlpha] of state.mask) {
    const [pxStr, pyStr] = key.split(',')
    const px = parseInt(pxStr!, 10)
    const py = parseInt(pyStr!, 10)
    if (px < 0 || py < 0 || px >= targetData.width || py >= targetData.height) continue

    // Weighted average of border pixels by inverse distance
    let totalWeight = 0
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let sumA = 0

    for (const bp of borderPixels) {
      const dx = px - bp.x
      const dy = py - bp.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const weight = 1 / (1 + dist * dist)
      totalWeight += weight
      sumR += bp.r * weight
      sumG += bp.g * weight
      sumB += bp.b * weight
      sumA += bp.a * weight
    }

    if (totalWeight === 0) continue

    const srcR = sumR / totalWeight
    const srcG = sumG / totalWeight
    const srcB = sumB / totalWeight
    const srcA = sumA / totalWeight

    // Destination pixel from the original snapshot
    const dstIdx = (py * sourceSnapshot.width + px) * 4
    const dstR = sourceSnapshot.data[dstIdx]!
    const dstG = sourceSnapshot.data[dstIdx + 1]!
    const dstB = sourceSnapshot.data[dstIdx + 2]!

    // Luminance ratio transfer
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
      healedR = Math.round(srcR)
      healedG = Math.round(srcG)
      healedB = Math.round(srcB)
    }

    // Blend with mask alpha
    const tgtIdx = (py * targetData.width + px) * 4
    const origR = targetData.data[tgtIdx]!
    const origG = targetData.data[tgtIdx + 1]!
    const origB = targetData.data[tgtIdx + 2]!
    const origA = targetData.data[tgtIdx + 3]!

    targetData.data[tgtIdx] = Math.round(origR + (healedR - origR) * maskAlpha)
    targetData.data[tgtIdx + 1] = Math.round(origG + (healedG - origG) * maskAlpha)
    targetData.data[tgtIdx + 2] = Math.round(origB + (healedB - origB) * maskAlpha)
    targetData.data[tgtIdx + 3] = Math.round(origA + (srcA - origA) * maskAlpha)
  }
}

/**
 * Create-texture mode: average all border pixel colors into a single tile
 * and fill every stroke pixel with that averaged texture, applying luminance
 * ratio transfer.
 */
function applyCreateTexture(
  targetData: ImageData,
  sourceSnapshot: ImageData,
  borderPixels: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }>,
): void {
  // Compute average border color
  let avgR = 0
  let avgG = 0
  let avgB = 0
  let avgA = 0
  for (const bp of borderPixels) {
    avgR += bp.r
    avgG += bp.g
    avgB += bp.b
    avgA += bp.a
  }
  avgR /= borderPixels.length
  avgG /= borderPixels.length
  avgB /= borderPixels.length
  avgA /= borderPixels.length

  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB

  for (const [key, maskAlpha] of state.mask) {
    const [pxStr, pyStr] = key.split(',')
    const px = parseInt(pxStr!, 10)
    const py = parseInt(pyStr!, 10)
    if (px < 0 || py < 0 || px >= targetData.width || py >= targetData.height) continue

    // Destination pixel from original snapshot
    const dstIdx = (py * sourceSnapshot.width + px) * 4
    const dstR = sourceSnapshot.data[dstIdx]!
    const dstG = sourceSnapshot.data[dstIdx + 1]!
    const dstB = sourceSnapshot.data[dstIdx + 2]!

    // Luminance ratio transfer
    const dstLum = 0.299 * dstR + 0.587 * dstG + 0.114 * dstB

    let healedR: number
    let healedG: number
    let healedB: number

    if (dstLum > 0) {
      const ratio = avgLum / dstLum
      healedR = Math.min(255, Math.max(0, Math.round(dstR * ratio)))
      healedG = Math.min(255, Math.max(0, Math.round(dstG * ratio)))
      healedB = Math.min(255, Math.max(0, Math.round(dstB * ratio)))
    } else {
      healedR = Math.round(avgR)
      healedG = Math.round(avgG)
      healedB = Math.round(avgB)
    }

    // Blend with mask alpha
    const tgtIdx = (py * targetData.width + px) * 4
    const origR = targetData.data[tgtIdx]!
    const origG = targetData.data[tgtIdx + 1]!
    const origB = targetData.data[tgtIdx + 2]!
    const origA = targetData.data[tgtIdx + 3]!

    targetData.data[tgtIdx] = Math.round(origR + (healedR - origR) * maskAlpha)
    targetData.data[tgtIdx + 1] = Math.round(origG + (healedG - origG) * maskAlpha)
    targetData.data[tgtIdx + 2] = Math.round(origB + (healedB - origB) * maskAlpha)
    targetData.data[tgtIdx + 3] = Math.round(origA + (avgA - origA) * maskAlpha)
  }
}
