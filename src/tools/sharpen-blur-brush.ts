import { useEditorStore } from '@/store/editor.store'
import { getRasterData, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SharpenBlurMode = 'sharpen' | 'blur'

export interface SharpenBlurSettings {
  mode: SharpenBlurMode
  size: number
  strength: number // 0-1
  hardness: number // 0-1
  spacing: number
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastStampX = 0
let lastStampY = 0
let distRemainder = 0
let strokeStarted = false

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const defaultSettings: SharpenBlurSettings = {
  mode: 'blur',
  size: 20,
  strength: 0.5,
  hardness: 0.5,
  spacing: 0.25,
}

let currentSettings: SharpenBlurSettings = { ...defaultSettings }

export function getSharpenBlurSettings(): SharpenBlurSettings {
  return { ...currentSettings }
}

export function setSharpenBlurSettings(settings: Partial<SharpenBlurSettings>) {
  Object.assign(currentSettings, settings)
}

// ---------------------------------------------------------------------------
// Brush falloff
// ---------------------------------------------------------------------------

function brushAlpha(dist: number, hardness: number): number {
  if (dist > 1) return 0
  if (hardness >= 1) return 1
  if (dist <= hardness) return 1
  const t = 1 - (dist - hardness) / (1 - hardness)
  return t * t * t // cubic falloff
}

// ---------------------------------------------------------------------------
// Local box average computation
// ---------------------------------------------------------------------------

/**
 * Compute a local box-blur average for a pixel neighbourhood.
 * `kernelRadius` is the half-size of the averaging box (in pixels).
 */
function localAverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  kernelRadius: number,
): [number, number, number] {
  const kr = Math.max(1, Math.round(kernelRadius))
  const x0 = Math.max(0, cx - kr)
  const y0 = Math.max(0, cy - kr)
  const x1 = Math.min(width - 1, cx + kr)
  const y1 = Math.min(height - 1, cy + kr)

  let sumR = 0
  let sumG = 0
  let sumB = 0
  let count = 0

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const idx = (py * width + px) * 4
      sumR += data[idx]!
      sumG += data[idx + 1]!
      sumB += data[idx + 2]!
      count++
    }
  }

  if (count === 0) return [0, 0, 0]
  return [sumR / count, sumG / count, sumB / count]
}

// ---------------------------------------------------------------------------
// Dab stamping — pixel-level sharpen/blur
// ---------------------------------------------------------------------------

function stampSharpenBlur(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  mode: SharpenBlurMode,
  strength: number,
) {
  const { data, width, height } = imageData
  const r = Math.ceil(radius)
  const x0 = Math.max(0, Math.floor(cx - r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const x1 = Math.min(width - 1, Math.ceil(cx + r))
  const y1 = Math.min(height - 1, Math.ceil(cy + r))

  // Kernel radius for local averaging — scale with brush size
  const kernelRadius = Math.max(1, Math.round(radius * 0.3))

  // We read from a snapshot to avoid feedback loops within a single dab
  const snapshot = new Uint8ClampedArray(data)

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - cx
      const dy = py + 0.5 - cy
      const dist = Math.sqrt(dx * dx + dy * dy) / radius
      if (dist > 1) continue

      const alpha = brushAlpha(dist, hardness)
      if (alpha <= 0) continue

      const idx = (py * width + px) * 4
      const ca = snapshot[idx + 3]!
      if (ca === 0) continue

      const cr = snapshot[idx]!
      const cg = snapshot[idx + 1]!
      const cb = snapshot[idx + 2]!

      const [avgR, avgG, avgB] = localAverage(snapshot, width, height, px, py, kernelRadius)
      const effectStrength = strength * alpha

      if (mode === 'sharpen') {
        // Unsharp mask: result = pixel + (pixel - average) * strength
        data[idx] = Math.max(0, Math.min(255, Math.round(cr + (cr - avgR) * effectStrength)))
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(cg + (cg - avgG) * effectStrength)))
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(cb + (cb - avgB) * effectStrength)))
      } else {
        // Blur: result = average * strength + pixel * (1 - strength)
        data[idx] = Math.max(0, Math.min(255, Math.round(avgR * effectStrength + cr * (1 - effectStrength))))
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(avgG * effectStrength + cg * (1 - effectStrength))))
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(avgB * effectStrength + cb * (1 - effectStrength))))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stroke lifecycle
// ---------------------------------------------------------------------------

export function beginSharpenBlurStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  // Find selected raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  // Fallback: first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

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
  return activeChunkId
}

// ---------------------------------------------------------------------------
// Paint along points
// ---------------------------------------------------------------------------

export function paintSharpenBlur(points: Array<{ x: number; y: number }>) {
  if (!activeChunkId) {
    if (!beginSharpenBlurStroke()) return
  }

  const imageData = getRasterData(activeChunkId!)
  if (!imageData) return

  const s = currentSettings
  const brushSize = s.size
  const radius = brushSize / 2
  const spacingPx = Math.max(1, brushSize * s.spacing)
  const hardness = s.hardness
  const strength = s.strength
  const mode = s.mode

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      stampSharpenBlur(imageData, pt.x, pt.y, radius, hardness, mode, strength)
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
      stampSharpenBlur(imageData, sx, sy, radius, hardness, mode, strength)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }

  updateRasterCache(activeChunkId!)
}

// ---------------------------------------------------------------------------
// End stroke
// ---------------------------------------------------------------------------

export function endSharpenBlurStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Sharpen/Blur stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
}
