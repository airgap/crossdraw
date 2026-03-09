import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData, getRasterData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer, BrushSettings } from '@/types'

const defaultBrush: BrushSettings = {
  size: 10,
  hardness: 0.8,
  opacity: 1,
  flow: 1,
  color: '#000000',
  spacing: 0.25,
}

let currentBrush: BrushSettings = { ...defaultBrush }

// Dab cache — avoids regenerating ImageData on every incremental paint call
let cachedDab: ImageData | null = null
let cachedDabKey = ''

function getDabCacheKey(size: number, hardness: number, color: string, opacity: number): string {
  return `${size.toFixed(2)}_${hardness.toFixed(2)}_${color}_${opacity.toFixed(3)}`
}

function getCachedDab(size: number, hardness: number, color: string, opacity: number): ImageData {
  const key = getDabCacheKey(size, hardness, color, opacity)
  if (cachedDab && cachedDabKey === key) return cachedDab
  cachedDab = createBrushDab(size, hardness, color, opacity)
  cachedDabKey = key
  return cachedDab
}

export function getBrushSettings(): BrushSettings {
  return { ...currentBrush }
}

export function setBrushSettings(settings: Partial<BrushSettings>) {
  Object.assign(currentBrush, settings)
  cachedDab = null // invalidate cache when settings change
}

/**
 * Generate a circular brush dab as ImageData.
 */
export function createBrushDab(size: number, hardness: number, color: string, opacity: number): ImageData {
  const dim = Math.ceil(size)
  const center = dim / 2
  const r = parseColor(color)
  const pixels = new Uint8ClampedArray(dim * dim * 4)

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const dx = x + 0.5 - center
      const dy = y + 0.5 - center
      const dist = Math.sqrt(dx * dx + dy * dy) / (size / 2)
      if (dist > 1) continue

      // Hardness controls falloff
      let alpha: number
      if (hardness >= 1) {
        alpha = 1
      } else {
        const edge = 1 - hardness
        alpha = dist < 1 - edge ? 1 : Math.max(0, 1 - (dist - (1 - edge)) / edge)
      }
      alpha *= opacity

      const idx = (y * dim + x) * 4
      pixels[idx] = r.r
      pixels[idx + 1] = r.g
      pixels[idx + 2] = r.b
      pixels[idx + 3] = Math.round(alpha * 255)
    }
  }

  return new ImageData(pixels, dim, dim)
}

function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
}

/**
 * Paint a series of points onto a raster layer.
 * Creates a new raster layer if the selected layer isn't a raster layer.
 *
 * @param pressure - Stylus pressure (0-1). Multiplied with brush opacity and
 *                   used to scale brush size. Defaults to 1 (full pressure).
 */
export function paintStroke(points: Array<{ x: number; y: number }>, brush?: Partial<BrushSettings>, pressure = 1) {
  const raw = { ...currentBrush, ...brush }
  // Apply pressure: scale size and opacity
  const p = Math.max(0, Math.min(1, pressure))
  const b = {
    ...raw,
    size: raw.size * (0.3 + 0.7 * p), // size ranges from 30%-100% based on pressure
    opacity: raw.opacity * p,
  }
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  // Find or create a raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer
  }

  if (!rasterLayer) {
    // Create a new raster layer covering the artboard
    const chunkId = uuid()
    const w = artboard.width
    const h = artboard.height
    const imageData = new ImageData(w, h)
    storeRasterData(chunkId, imageData)

    rasterLayer = {
      id: uuid(),
      name: 'Paint Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: chunkId,
      width: w,
      height: h,
    }
    store.addLayer(artboard.id, rasterLayer)
    store.selectLayer(rasterLayer.id)
  }

  // Get the pixel data
  const imageData = getRasterData(rasterLayer.imageChunkId)
  if (!imageData) return

  const dab = getCachedDab(b.size, b.hardness, b.color, b.opacity * b.flow)
  const dabSize = Math.ceil(b.size)
  const halfDab = dabSize / 2

  // Stamp dabs along the stroke path with spacing
  const spacingPx = Math.max(1, b.size * b.spacing)

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!
    if (i > 0) {
      const prev = points[i - 1]!
      const dx = pt.x - prev.x
      const dy = pt.y - prev.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const steps = Math.ceil(dist / spacingPx)
      for (let s = 0; s < steps; s++) {
        const t = s / steps
        const sx = prev.x + dx * t
        const sy = prev.y + dy * t
        stampDab(imageData, dab, dabSize, sx - halfDab, sy - halfDab)
      }
    }
    stampDab(imageData, dab, dabSize, pt.x - halfDab, pt.y - halfDab)
  }

  // Refresh the render cache in-place (avoids OffscreenCanvas reallocation)
  updateRasterCache(rasterLayer.imageChunkId)
}

function stampDab(target: ImageData, dab: ImageData, dabSize: number, ox: number, oy: number) {
  const ix = Math.round(ox)
  const iy = Math.round(oy)

  for (let dy = 0; dy < dabSize; dy++) {
    for (let dx = 0; dx < dabSize; dx++) {
      const tx = ix + dx
      const ty = iy + dy
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue

      const dabIdx = (dy * dabSize + dx) * 4
      const tgtIdx = (ty * target.width + tx) * 4
      const dabAlpha = dab.data[dabIdx + 3]! / 255

      if (dabAlpha === 0) continue

      // Alpha compositing (source over)
      const tgtAlpha = target.data[tgtIdx + 3]! / 255
      const outAlpha = dabAlpha + tgtAlpha * (1 - dabAlpha)
      if (outAlpha === 0) continue

      target.data[tgtIdx] = Math.round(
        (dab.data[dabIdx]! * dabAlpha + target.data[tgtIdx]! * tgtAlpha * (1 - dabAlpha)) / outAlpha,
      )
      target.data[tgtIdx + 1] = Math.round(
        (dab.data[dabIdx + 1]! * dabAlpha + target.data[tgtIdx + 1]! * tgtAlpha * (1 - dabAlpha)) / outAlpha,
      )
      target.data[tgtIdx + 2] = Math.round(
        (dab.data[dabIdx + 2]! * dabAlpha + target.data[tgtIdx + 2]! * tgtAlpha * (1 - dabAlpha)) / outAlpha,
      )
      target.data[tgtIdx + 3] = Math.round(outAlpha * 255)
    }
  }
}
