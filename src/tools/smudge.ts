import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

export interface SmudgeSettings {
  size: number // brush diameter
  hardness: number // 0-1
  strength: number // 0-1 (how much color is picked up vs blended)
  spacing: number // dab spacing fraction
}

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastStampX = 0
let lastStampY = 0
let distRemainder = 0
let strokeStarted = false

/** Float32 RGBA buffer representing the "paint on the finger" */
let pickupBuffer: Float32Array | null = null
let pickupSize = 0 // diameter of the pickup buffer

const defaultSmudge: SmudgeSettings = {
  size: 20,
  hardness: 0.5,
  strength: 0.6,
  spacing: 0.25,
}

let currentSmudge: SmudgeSettings = { ...defaultSmudge }

export function getSmudgeSettings(): SmudgeSettings {
  return { ...currentSmudge }
}

export function setSmudgeSettings(settings: Partial<SmudgeSettings>) {
  Object.assign(currentSmudge, settings)
}

export function beginSmudgeStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return null

  // Find existing raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  // If no raster layer selected, find first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  // No raster layer to smudge — nothing to do
  if (!rasterLayer) return null

  activeChunkId = rasterLayer.imageChunkId

  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }
  strokeStarted = false
  distRemainder = 0
  pickupBuffer = null
  pickupSize = 0
  return activeChunkId
}

/**
 * Compute hardness-based circular mask alpha for a pixel at distance `dist`
 * from center (normalized 0-1). Uses cubic falloff matching brush.ts.
 */
function maskAlpha(dist: number, hardness: number): number {
  if (dist > 1) return 0
  if (hardness >= 1) return 1
  if (dist <= hardness) return 1
  const fade = 1 - (dist - hardness) / (1 - hardness)
  return fade * fade * fade // cubic falloff
}

/**
 * Sample pixels under the brush circle into the pickupBuffer (Float32Array RGBA).
 */
function samplePickup(imageData: ImageData, cx: number, cy: number, diameter: number, hardness: number): void {
  const dim = Math.max(1, Math.ceil(diameter))
  const halfDim = dim / 2
  pickupSize = dim
  pickupBuffer = new Float32Array(dim * dim * 4)

  const ix = Math.round(cx - halfDim)
  const iy = Math.round(cy - halfDim)

  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const dx = px + 0.5 - halfDim
      const dy = py + 0.5 - halfDim
      const dist = Math.sqrt(dx * dx + dy * dy) / (diameter / 2)

      const bufIdx = (py * dim + px) * 4

      if (dist > 1) {
        // Outside brush circle
        pickupBuffer[bufIdx] = 0
        pickupBuffer[bufIdx + 1] = 0
        pickupBuffer[bufIdx + 2] = 0
        pickupBuffer[bufIdx + 3] = 0
        continue
      }

      const tx = ix + px
      const ty = iy + py
      if (tx < 0 || ty < 0 || tx >= imageData.width || ty >= imageData.height) {
        pickupBuffer[bufIdx] = 0
        pickupBuffer[bufIdx + 1] = 0
        pickupBuffer[bufIdx + 2] = 0
        pickupBuffer[bufIdx + 3] = 0
        continue
      }

      const srcIdx = (ty * imageData.width + tx) * 4
      const ma = maskAlpha(dist, hardness)
      pickupBuffer[bufIdx] = imageData.data[srcIdx]! * ma
      pickupBuffer[bufIdx + 1] = imageData.data[srcIdx + 1]! * ma
      pickupBuffer[bufIdx + 2] = imageData.data[srcIdx + 2]! * ma
      pickupBuffer[bufIdx + 3] = imageData.data[srcIdx + 3]! * ma
    }
  }
}

/**
 * Apply a smudge dab: blend pickup buffer into the image, then update
 * the pickup buffer by picking up color from the current surface.
 */
function smudgeDab(
  imageData: ImageData,
  cx: number,
  cy: number,
  diameter: number,
  hardness: number,
  strength: number,
): void {
  if (!pickupBuffer) return

  const dim = pickupSize
  const halfDim = dim / 2
  const ix = Math.round(cx - halfDim)
  const iy = Math.round(cy - halfDim)

  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const dx = px + 0.5 - halfDim
      const dy = py + 0.5 - halfDim
      const dist = Math.sqrt(dx * dx + dy * dy) / (diameter / 2)
      if (dist > 1) continue

      const tx = ix + px
      const ty = iy + py
      if (tx < 0 || ty < 0 || tx >= imageData.width || ty >= imageData.height) continue

      const ma = maskAlpha(dist, hardness)
      const blendFactor = strength * ma

      const bufIdx = (py * dim + px) * 4
      const srcIdx = (ty * imageData.width + tx) * 4

      // Current pixel values
      const curR = imageData.data[srcIdx]!
      const curG = imageData.data[srcIdx + 1]!
      const curB = imageData.data[srcIdx + 2]!
      const curA = imageData.data[srcIdx + 3]!

      // Pickup pixel values (stored pre-scaled by mask, unscale for blending)
      const pickR = pickupBuffer[bufIdx]!
      const pickG = pickupBuffer[bufIdx + 1]!
      const pickB = pickupBuffer[bufIdx + 2]!
      const pickA = pickupBuffer[bufIdx + 3]!

      // Blend: newPixel = lerp(currentPixel, pickupPixel, strength * maskAlpha)
      const newR = curR + (pickR - curR) * blendFactor
      const newG = curG + (pickG - curG) * blendFactor
      const newB = curB + (pickB - curB) * blendFactor
      const newA = curA + (pickA - curA) * blendFactor

      imageData.data[srcIdx] = Math.round(Math.max(0, Math.min(255, newR)))
      imageData.data[srcIdx + 1] = Math.round(Math.max(0, Math.min(255, newG)))
      imageData.data[srcIdx + 2] = Math.round(Math.max(0, Math.min(255, newB)))
      imageData.data[srcIdx + 3] = Math.round(Math.max(0, Math.min(255, newA)))

      // Update pickup: finger also picks up color as it moves
      // pickupPixel = lerp(pickupPixel, currentPixel, 0.5)
      pickupBuffer[bufIdx] = pickR + (curR - pickR) * 0.5
      pickupBuffer[bufIdx + 1] = pickG + (curG - pickG) * 0.5
      pickupBuffer[bufIdx + 2] = pickB + (curB - pickB) * 0.5
      pickupBuffer[bufIdx + 3] = pickA + (curA - pickA) * 0.5
    }
  }
}

export function paintSmudge(points: Array<{ x: number; y: number }>) {
  if (!activeChunkId) {
    if (!beginSmudgeStroke()) return
  }

  const imageData = getRasterData(activeChunkId!)
  if (!imageData) return

  const smudgeSize = currentSmudge.size
  const spacingPx = Math.max(1, smudgeSize * currentSmudge.spacing)

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      // First point: sample the pickup buffer, no blending yet
      samplePickup(imageData, pt.x, pt.y, smudgeSize, currentSmudge.hardness)
      lastStampX = pt.x
      lastStampY = pt.y
      distRemainder = 0
      strokeStarted = true
      continue
    }

    const dx = pt.x - lastStampX
    const dy = pt.y - lastStampY
    const segLen = Math.sqrt(dx * dx + dy * dy)
    if (segLen < 0.5) continue

    const ux = dx / segLen
    const uy = dy / segLen

    let d = spacingPx - distRemainder
    while (d <= segLen) {
      const sx = lastStampX + ux * d
      const sy = lastStampY + uy * d
      smudgeDab(imageData, sx, sy, smudgeSize, currentSmudge.hardness, currentSmudge.strength)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }

  // Sync the modified ImageData to the OffscreenCanvas cache
  updateRasterCache(activeChunkId!)
}

export function endSmudgeStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Smudge stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
  pickupBuffer = null
  pickupSize = 0
}
