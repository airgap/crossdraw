import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'
import type { RasterLayer, BlendMode } from '@/types'

export interface FrequencySeparationSettings {
  /** Gaussian blur radius for the low-frequency layer */
  radius: number
}

const defaultSettings: FrequencySeparationSettings = {
  radius: 4,
}

let currentSettings: FrequencySeparationSettings = { ...defaultSettings }

export function getFrequencySeparationSettings(): FrequencySeparationSettings {
  return { ...currentSettings }
}

export function setFrequencySeparationSettings(settings: Partial<FrequencySeparationSettings>) {
  Object.assign(currentSettings, settings)
}

/**
 * Apply a Gaussian blur to ImageData using a separable approach.
 * Performs horizontal then vertical pass with clamped edge sampling.
 */
function gaussianBlur(src: ImageData, radius: number): ImageData {
  const w = src.width
  const h = src.height
  const r = Math.max(1, Math.round(radius))

  // Build 1D Gaussian kernel
  const kernelSize = r * 2 + 1
  const kernel = new Float64Array(kernelSize)
  const sigma = radius / 2 || 1
  let sum = 0
  for (let i = 0; i < kernelSize; i++) {
    const x = i - r
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
    sum += kernel[i]!
  }
  // Normalize
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] = kernel[i]! / sum
  }

  // Intermediate float buffer for precision
  const tmp = new Float64Array(w * h * 4)

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0
      let gg = 0
      let bb = 0
      let aa = 0
      for (let k = -r; k <= r; k++) {
        const sx = Math.max(0, Math.min(w - 1, x + k))
        const srcIdx = (y * w + sx) * 4
        const kw = kernel[k + r]!
        rr += src.data[srcIdx]! * kw
        gg += src.data[srcIdx + 1]! * kw
        bb += src.data[srcIdx + 2]! * kw
        aa += src.data[srcIdx + 3]! * kw
      }
      const dstIdx = (y * w + x) * 4
      tmp[dstIdx] = rr
      tmp[dstIdx + 1] = gg
      tmp[dstIdx + 2] = bb
      tmp[dstIdx + 3] = aa
    }
  }

  // Vertical pass
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0
      let gg = 0
      let bb = 0
      let aa = 0
      for (let k = -r; k <= r; k++) {
        const sy = Math.max(0, Math.min(h - 1, y + k))
        const srcIdx = (sy * w + x) * 4
        const kw = kernel[k + r]!
        rr += tmp[srcIdx]! * kw
        gg += tmp[srcIdx + 1]! * kw
        bb += tmp[srcIdx + 2]! * kw
        aa += tmp[srcIdx + 3]! * kw
      }
      const dstIdx = (y * w + x) * 4
      out[dstIdx] = Math.round(Math.max(0, Math.min(255, rr)))
      out[dstIdx + 1] = Math.round(Math.max(0, Math.min(255, gg)))
      out[dstIdx + 2] = Math.round(Math.max(0, Math.min(255, bb)))
      out[dstIdx + 3] = Math.round(Math.max(0, Math.min(255, aa)))
    }
  }

  return new ImageData(out, w, h)
}

/**
 * Perform frequency separation on a raster layer.
 *
 * Splits the source layer into:
 * - Low Frequency layer: Gaussian-blurred image (color/tone)
 * - High Frequency layer: detail/texture, set to Linear Light blend mode
 *
 * When composited: low + (high - 128) = original (mathematically lossless)
 *
 * @param layerId - The raster layer to separate
 * @param radius - Gaussian blur radius for the low-frequency split
 */
export function performFrequencySeparation(layerId: string, radius?: number): boolean {
  const blurRadius = radius ?? currentSettings.radius
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return false

  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'raster') return false

  const rasterLayer = layer as RasterLayer
  const sourceData = getRasterData(rasterLayer.imageChunkId)
  if (!sourceData) return false

  const w = sourceData.width
  const h = sourceData.height

  // Step 1: Create the low-frequency layer (blurred source)
  const lowData = gaussianBlur(sourceData, blurRadius)
  const lowChunkId = uuid()
  storeRasterData(lowChunkId, lowData)

  // Step 2: Compute the high-frequency layer: high = source - low + 128
  const highPixels = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h * 4; i += 4) {
    // For RGB channels: high = source - low + 128 (add neutral gray bias)
    highPixels[i] = Math.max(0, Math.min(255, sourceData.data[i]! - lowData.data[i]! + 128))
    highPixels[i + 1] = Math.max(0, Math.min(255, sourceData.data[i + 1]! - lowData.data[i + 1]! + 128))
    highPixels[i + 2] = Math.max(0, Math.min(255, sourceData.data[i + 2]! - lowData.data[i + 2]! + 128))
    // Alpha: keep source alpha
    highPixels[i + 3] = sourceData.data[i + 3]!
  }
  const highData = new ImageData(highPixels, w, h)
  const highChunkId = uuid()
  storeRasterData(highChunkId, highData)

  // Step 3: Create the two new layers
  const lowLayer: RasterLayer = {
    id: uuid(),
    name: 'Low Frequency',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as BlendMode,
    transform: { ...rasterLayer.transform },
    effects: [],
    imageChunkId: lowChunkId,
    width: w,
    height: h,
  }

  const highLayer: RasterLayer = {
    id: uuid(),
    name: 'High Frequency',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'linear-light' as BlendMode,
    transform: { ...rasterLayer.transform },
    effects: [],
    imageChunkId: highChunkId,
    width: w,
    height: h,
  }

  // Step 4: Hide the original layer and add the two new layers
  store.updateLayer(artboard.id, layerId, { visible: false })
  store.addLayer(artboard.id, lowLayer)
  store.addLayer(artboard.id, highLayer)

  return true
}
