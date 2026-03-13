import { useEditorStore } from '@/store/editor.store'
import { getRasterData, updateRasterCache, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

export interface MixerBrushSettings {
  /** Brush diameter in pixels */
  size: number
  /** Brush hardness 0-1 */
  hardness: number
  /** How much paint on canvas mixes (0-100, 0=dry brush, 100=very wet) */
  wet: number
  /** How much paint the brush carries (0-100, refilled from color each dab) */
  load: number
  /** Ratio of brush color vs picked-up color (0-100) */
  mix: number
  /** Application rate per dab (0-100) */
  flow: number
  /** Brush color hex */
  color: string
  /** Dab spacing as fraction of brush size */
  spacing: number
}

const defaultSettings: MixerBrushSettings = {
  size: 30,
  hardness: 0.5,
  wet: 50,
  load: 50,
  mix: 50,
  flow: 50,
  color: '#000000',
  spacing: 0.25,
}

let currentSettings: MixerBrushSettings = { ...defaultSettings }

export function getMixerBrushSettings(): MixerBrushSettings {
  return { ...currentSettings }
}

export function setMixerBrushSettings(settings: Partial<MixerBrushSettings>) {
  Object.assign(currentSettings, settings)
}

// Stroke state
let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastStampX = 0
let lastStampY = 0
let distRemainder = 0
let strokeStarted = false

/** Float32 RGBA reservoir — carries paint across dabs */
let reservoir: Float32Array | null = null
let reservoirSize = 0 // diameter of the reservoir buffer

/** Parse a hex color string to RGB components */
function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
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
 * Initialize the reservoir with the brush color, scaled by the load setting.
 */
function initReservoir(diameter: number, color: string, load: number, hardness: number): void {
  const dim = Math.max(1, Math.ceil(diameter))
  const halfDim = dim / 2
  reservoirSize = dim
  reservoir = new Float32Array(dim * dim * 4)

  const rgb = parseColor(color)
  const loadFactor = load / 100

  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const dx = px + 0.5 - halfDim
      const dy = py + 0.5 - halfDim
      const dist = Math.sqrt(dx * dx + dy * dy) / (diameter / 2)

      const bufIdx = (py * dim + px) * 4

      if (dist > 1) {
        reservoir[bufIdx] = 0
        reservoir[bufIdx + 1] = 0
        reservoir[bufIdx + 2] = 0
        reservoir[bufIdx + 3] = 0
        continue
      }

      const ma = maskAlpha(dist, hardness)
      reservoir[bufIdx] = rgb.r
      reservoir[bufIdx + 1] = rgb.g
      reservoir[bufIdx + 2] = rgb.b
      reservoir[bufIdx + 3] = 255 * loadFactor * ma
    }
  }
}

/**
 * Apply a mixer brush dab at the given position.
 *
 * Algorithm per dab:
 * 1. Sample canvas pixels under brush into canvasSample
 * 2. Mix reservoir with canvas: reservoir = lerp(reservoir, canvasSample, wet/100)
 * 3. Mix reservoir with brush color: reservoir = lerp(reservoir, brushColor, mix/100)
 * 4. Apply: canvas = lerp(canvas, reservoir, flow/100 * brushMask)
 * 5. Deplete: reduce reservoir opacity by (1 - load/100) factor
 */
function mixerDab(imageData: ImageData, cx: number, cy: number, settings: MixerBrushSettings): void {
  if (!reservoir) return

  const dim = reservoirSize
  const halfDim = dim / 2
  const ix = Math.round(cx - halfDim)
  const iy = Math.round(cy - halfDim)

  const wetFactor = settings.wet / 100
  const mixFactor = settings.mix / 100
  const flowFactor = settings.flow / 100
  const depleteFactor = 1 - settings.load / 100
  const rgb = parseColor(settings.color)

  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const dx = px + 0.5 - halfDim
      const dy = py + 0.5 - halfDim
      const dist = Math.sqrt(dx * dx + dy * dy) / (settings.size / 2)
      if (dist > 1) continue

      const tx = ix + px
      const ty = iy + py
      if (tx < 0 || ty < 0 || tx >= imageData.width || ty >= imageData.height) continue

      const ma = maskAlpha(dist, settings.hardness)
      const bufIdx = (py * dim + px) * 4
      const srcIdx = (ty * imageData.width + tx) * 4

      // Current canvas pixel
      const canR = imageData.data[srcIdx]!
      const canG = imageData.data[srcIdx + 1]!
      const canB = imageData.data[srcIdx + 2]!
      const canA = imageData.data[srcIdx + 3]!

      // Current reservoir pixel
      let resR = reservoir[bufIdx]!
      let resG = reservoir[bufIdx + 1]!
      let resB = reservoir[bufIdx + 2]!
      let resA = reservoir[bufIdx + 3]!

      // Step 2: Mix reservoir with canvas sample (wet mixing)
      resR = resR + (canR - resR) * wetFactor
      resG = resG + (canG - resG) * wetFactor
      resB = resB + (canB - resB) * wetFactor
      resA = resA + (canA - resA) * wetFactor

      // Step 3: Mix reservoir with brush color
      resR = resR + (rgb.r - resR) * mixFactor
      resG = resG + (rgb.g - resG) * mixFactor
      resB = resB + (rgb.b - resB) * mixFactor
      // Keep alpha from reservoir mix, don't override with brush color alpha

      // Update reservoir
      reservoir[bufIdx] = resR
      reservoir[bufIdx + 1] = resG
      reservoir[bufIdx + 2] = resB
      reservoir[bufIdx + 3] = resA

      // Step 4: Apply reservoir to canvas
      const applyStrength = flowFactor * ma
      const newR = canR + (resR - canR) * applyStrength
      const newG = canG + (resG - canG) * applyStrength
      const newB = canB + (resB - canB) * applyStrength
      const newA = canA + (resA - canA) * applyStrength

      imageData.data[srcIdx] = Math.round(Math.max(0, Math.min(255, newR)))
      imageData.data[srcIdx + 1] = Math.round(Math.max(0, Math.min(255, newG)))
      imageData.data[srcIdx + 2] = Math.round(Math.max(0, Math.min(255, newB)))
      imageData.data[srcIdx + 3] = Math.round(Math.max(0, Math.min(255, newA)))

      // Step 5: Deplete reservoir
      reservoir[bufIdx + 3] = resA * (1 - depleteFactor * ma)
    }
  }
}

export function beginMixerStroke(): string | null {
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

  // If no raster layer selected, find first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  // No raster layer to paint on
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

  // Initialize the reservoir with brush color
  initReservoir(currentSettings.size, currentSettings.color, currentSettings.load, currentSettings.hardness)

  return activeChunkId
}

export function paintMixerStroke(points: Array<{ x: number; y: number }>) {
  if (!activeChunkId) {
    if (!beginMixerStroke()) return
  }

  const imageData = getRasterData(activeChunkId!)
  if (!imageData) return

  const brushSize = currentSettings.size
  const spacingPx = Math.max(1, brushSize * currentSettings.spacing)

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      // First point: apply first dab
      mixerDab(imageData, pt.x, pt.y, currentSettings)
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
      mixerDab(imageData, sx, sy, currentSettings)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }

  // Sync the modified ImageData to the OffscreenCanvas cache (browser only)
  if (hasOffscreenCanvas) {
    updateRasterCache(activeChunkId!)
  }
}

export function endMixerStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Mixer brush stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
  reservoir = null
  reservoirSize = 0
}
