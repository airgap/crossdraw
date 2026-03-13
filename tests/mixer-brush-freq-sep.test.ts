import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origImageData = globalThis.ImageData

afterAll(() => {
  globalThis.ImageData = origImageData
})

// Polyfill ImageData for bun test environment
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
      this.colorSpace = 'srgb'
    }
  }
}

import {
  getMixerBrushSettings,
  setMixerBrushSettings,
  beginMixerStroke,
  paintMixerStroke,
  endMixerStroke,
} from '@/tools/mixer-brush'
import {
  getFrequencySeparationSettings,
  setFrequencySeparationSettings,
  performFrequencySeparation,
} from '@/tools/frequency-separation'
import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ── Helpers ──

function createTestArtboardWithRaster(
  w = 100,
  h = 100,
  fillColor?: { r: number; g: number; b: number; a: number },
): { artboardId: string; layerId: string; chunkId: string } {
  const store = useEditorStore.getState()
  const chunkId = `chunk-${Date.now()}-${Math.random()}`
  const pixels = new Uint8ClampedArray(w * h * 4)
  if (fillColor) {
    for (let i = 0; i < w * h * 4; i += 4) {
      pixels[i] = fillColor.r
      pixels[i + 1] = fillColor.g
      pixels[i + 2] = fillColor.b
      pixels[i + 3] = fillColor.a
    }
  }
  const imageData = new ImageData(pixels, w, h)
  storeRasterData(chunkId, imageData)

  const layerId = `layer-${Date.now()}-${Math.random()}`
  const rasterLayer: RasterLayer = {
    id: layerId,
    name: 'Test Raster',
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

  // Ensure artboard exists
  if (!store.document.artboards[0]) {
    store.addArtboard('Test', w, h)
  }
  const ab = store.document.artboards[0]!
  store.addLayer(ab.id, rasterLayer)
  store.selectLayer(layerId)

  return { artboardId: ab.id, layerId, chunkId }
}

function resetStore() {
  useEditorStore.getState().newDocument()
}

// ── Mixer Brush Tests ──

describe('Mixer Brush', () => {
  beforeEach(() => {
    resetStore()
    setMixerBrushSettings({
      size: 30,
      hardness: 0.5,
      wet: 50,
      load: 50,
      mix: 50,
      flow: 50,
      color: '#000000',
      spacing: 0.25,
    })
  })

  test('get/set settings', () => {
    const defaults = getMixerBrushSettings()
    expect(defaults.size).toBe(30)
    expect(defaults.wet).toBe(50)
    expect(defaults.load).toBe(50)
    expect(defaults.mix).toBe(50)
    expect(defaults.flow).toBe(50)

    setMixerBrushSettings({ size: 50, wet: 80 })
    const updated = getMixerBrushSettings()
    expect(updated.size).toBe(50)
    expect(updated.wet).toBe(80)
    expect(updated.mix).toBe(50) // unchanged
  })

  test('settings are immutable copies', () => {
    const s1 = getMixerBrushSettings()
    const s2 = getMixerBrushSettings()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })

  test('beginMixerStroke returns null with no raster layer', () => {
    const result = beginMixerStroke()
    expect(result).toBeNull()
  })

  test('beginMixerStroke returns chunkId with raster layer', () => {
    const { chunkId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 128, b: 128, a: 255 })
    const result = beginMixerStroke()
    expect(result).toBe(chunkId)
    endMixerStroke()
  })

  test('paintMixerStroke modifies pixel data', () => {
    const { chunkId } = createTestArtboardWithRaster(50, 50, { r: 200, g: 100, b: 50, a: 255 })
    setMixerBrushSettings({ size: 10, wet: 100, load: 100, mix: 100, flow: 100, color: '#000000' })

    beginMixerStroke()

    // Paint a stroke across the image
    const points = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ]
    paintMixerStroke(points)
    endMixerStroke()

    // Check that pixels along the stroke path were modified
    const data = getRasterData(chunkId)
    expect(data).toBeDefined()

    // Center pixel at (20, 10) should be darker than the original (200, 100, 50)
    // since we painted with black
    const idx = (10 * 50 + 20) * 4
    expect(data!.data[idx]!).toBeLessThan(200) // R should be reduced
  })

  test('dry brush (wet=0) applies reservoir color without picking up canvas', () => {
    const { chunkId } = createTestArtboardWithRaster(50, 50, { r: 255, g: 0, b: 0, a: 255 })
    setMixerBrushSettings({ size: 10, wet: 0, load: 100, mix: 100, flow: 100, color: '#0000ff', hardness: 1 })

    beginMixerStroke()
    paintMixerStroke([{ x: 25, y: 25 }])
    endMixerStroke()

    const data = getRasterData(chunkId)!
    const idx = (25 * 50 + 25) * 4
    // With wet=0, mix=100, flow=100, the brush color (blue) should dominate
    expect(data.data[idx + 2]!).toBeGreaterThan(data.data[idx]!) // Blue > Red
  })

  test('full wet (wet=100) picks up canvas color heavily', () => {
    // Create a red canvas, paint with blue at full wet
    const { chunkId } = createTestArtboardWithRaster(50, 50, { r: 255, g: 0, b: 0, a: 255 })
    setMixerBrushSettings({ size: 10, wet: 100, load: 100, mix: 0, flow: 100, color: '#0000ff', hardness: 1 })

    beginMixerStroke()
    // First dab picks up the canvas (red), then applies back
    paintMixerStroke([
      { x: 25, y: 25 },
      { x: 35, y: 25 },
    ])
    endMixerStroke()

    const data = getRasterData(chunkId)!
    // With mix=0, the brush color is not mixed in - it only carries what it picks up
    // So the result should still be close to red (the reservoir picks up canvas color)
    const idx = (25 * 50 + 35) * 4
    expect(data.data[idx]!).toBeGreaterThan(100) // Red should still be present
  })

  test('endMixerStroke pushes undo history', () => {
    createTestArtboardWithRaster(50, 50, { r: 128, g: 128, b: 128, a: 255 })
    setMixerBrushSettings({ size: 10, flow: 100, color: '#ff0000' })

    const historyBefore = useEditorStore.getState().history.length

    beginMixerStroke()
    paintMixerStroke([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ])
    endMixerStroke()

    const historyAfter = useEditorStore.getState().history.length
    expect(historyAfter).toBeGreaterThan(historyBefore)
  })

  test('zero flow produces no visible change', () => {
    const { chunkId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 128, b: 128, a: 255 })
    setMixerBrushSettings({ size: 10, wet: 50, load: 50, mix: 50, flow: 0, color: '#ff0000', hardness: 1 })

    // Snapshot before
    const dataBefore = getRasterData(chunkId)!
    const pixelBefore = dataBefore.data[(25 * 50 + 25) * 4]

    beginMixerStroke()
    paintMixerStroke([{ x: 25, y: 25 }])
    endMixerStroke()

    const dataAfter = getRasterData(chunkId)!
    const pixelAfter = dataAfter.data[(25 * 50 + 25) * 4]
    expect(pixelAfter).toBe(pixelBefore)
  })

  test('paintMixerStroke auto-begins stroke if not started', () => {
    createTestArtboardWithRaster(50, 50, { r: 128, g: 128, b: 128, a: 255 })
    setMixerBrushSettings({ size: 10, flow: 50, color: '#ff0000' })

    // Call paintMixerStroke without calling beginMixerStroke first
    paintMixerStroke([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ])
    endMixerStroke()

    // Should not throw — auto-begin should work
  })
})

// ── Frequency Separation Tests ──

describe('Frequency Separation', () => {
  beforeEach(() => {
    resetStore()
    setFrequencySeparationSettings({ radius: 4 })
  })

  test('get/set settings', () => {
    const defaults = getFrequencySeparationSettings()
    expect(defaults.radius).toBe(4)

    setFrequencySeparationSettings({ radius: 8 })
    expect(getFrequencySeparationSettings().radius).toBe(8)
  })

  test('settings are immutable copies', () => {
    const s1 = getFrequencySeparationSettings()
    const s2 = getFrequencySeparationSettings()
    expect(s1).not.toBe(s2)
    expect(s1).toEqual(s2)
  })

  test('returns false with no artboard', () => {
    const result = performFrequencySeparation('nonexistent', 4)
    expect(result).toBe(false)
  })

  test('returns false with non-raster layer', () => {
    const store = useEditorStore.getState()
    store.addArtboard('Test', 100, 100)
    const ab = store.document.artboards[0]!
    store.addLayer(ab.id, {
      id: 'vec-1',
      name: 'Vector',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [],
      fill: null,
      stroke: null,
      effects: [],
    })
    const result = performFrequencySeparation('vec-1', 4)
    expect(result).toBe(false)
  })

  test('creates low and high frequency layers', () => {
    const { layerId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 64, b: 32, a: 255 })

    const result = performFrequencySeparation(layerId, 4)
    expect(result).toBe(true)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layers = artboard.layers

    // Should have at least 3 layers: original (hidden), low freq, high freq
    expect(layers.length).toBeGreaterThanOrEqual(3)

    const lowLayer = layers.find((l) => l.name === 'Low Frequency')
    const highLayer = layers.find((l) => l.name === 'High Frequency')

    expect(lowLayer).toBeDefined()
    expect(highLayer).toBeDefined()
    expect(lowLayer!.type).toBe('raster')
    expect(highLayer!.type).toBe('raster')
    expect(highLayer!.blendMode).toBe('linear-light')
  })

  test('original layer is hidden after separation', () => {
    const { layerId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 64, b: 32, a: 255 })

    performFrequencySeparation(layerId, 4)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const original = artboard.layers.find((l) => l.id === layerId)
    expect(original).toBeDefined()
    expect(original!.visible).toBe(false)
  })

  test('low frequency layer contains blurred data', () => {
    // Create an image with a sharp edge
    const w = 50
    const h = 50
    const store = useEditorStore.getState()
    store.addArtboard('Test', w, h)
    const ab = store.document.artboards[0]!

    const chunkId = `chunk-sharp-${Date.now()}`
    const pixels = new Uint8ClampedArray(w * h * 4)
    // Left half white, right half black
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const val = x < w / 2 ? 255 : 0
        pixels[i] = val
        pixels[i + 1] = val
        pixels[i + 2] = val
        pixels[i + 3] = 255
      }
    }
    storeRasterData(chunkId, new ImageData(pixels, w, h))

    const layerId = `sharp-layer-${Date.now()}`
    store.addLayer(ab.id, {
      id: layerId,
      name: 'Sharp Layer',
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
    } as RasterLayer)
    store.selectLayer(layerId)

    performFrequencySeparation(layerId, 6)

    const updatedStore = useEditorStore.getState()
    const updatedAb = updatedStore.document.artboards[0]!
    const lowLayer = updatedAb.layers.find((l) => l.name === 'Low Frequency') as RasterLayer
    expect(lowLayer).toBeDefined()

    const lowData = getRasterData(lowLayer.imageChunkId)
    expect(lowData).toBeDefined()

    // At the edge (x=25, y=25), the blurred low layer should have intermediate values
    // (not pure 255 or pure 0 like the sharp original)
    const edgeIdx = (25 * w + 25) * 4
    const edgeVal = lowData!.data[edgeIdx]!
    // Should be somewhere between 0 and 255 due to blurring
    expect(edgeVal).toBeGreaterThan(10)
    expect(edgeVal).toBeLessThan(245)
  })

  test('high frequency layer has neutral gray bias', () => {
    const { layerId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 128, b: 128, a: 255 })

    performFrequencySeparation(layerId, 2)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const highLayer = artboard.layers.find((l) => l.name === 'High Frequency') as RasterLayer
    expect(highLayer).toBeDefined()

    const highData = getRasterData(highLayer.imageChunkId)
    expect(highData).toBeDefined()

    // For a uniform-color image, high = source - low + 128
    // Since source == low (uniform), high should be ~128 everywhere
    const centerIdx = (25 * 50 + 25) * 4
    expect(highData!.data[centerIdx]!).toBeGreaterThanOrEqual(125)
    expect(highData!.data[centerIdx]!).toBeLessThanOrEqual(131)
  })

  test('mathematical reconstruction: low + (high - 128) ~ original', () => {
    // Create a non-uniform image
    const w = 30
    const h = 30
    const store = useEditorStore.getState()
    store.addArtboard('Test', w, h)
    const ab = store.document.artboards[0]!

    const chunkId = `chunk-grad-${Date.now()}`
    const pixels = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        pixels[i] = Math.round((x / w) * 255)
        pixels[i + 1] = Math.round((y / h) * 255)
        pixels[i + 2] = 128
        pixels[i + 3] = 255
      }
    }
    const originalData = new ImageData(new Uint8ClampedArray(pixels), w, h)
    storeRasterData(chunkId, new ImageData(pixels, w, h))

    const layerId = `grad-layer-${Date.now()}`
    store.addLayer(ab.id, {
      id: layerId,
      name: 'Gradient Layer',
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
    } as RasterLayer)
    store.selectLayer(layerId)

    performFrequencySeparation(layerId, 2)

    const updatedStore = useEditorStore.getState()
    const updatedAb = updatedStore.document.artboards[0]!
    const lowLayer = updatedAb.layers.find((l) => l.name === 'Low Frequency') as RasterLayer
    const highLayer = updatedAb.layers.find((l) => l.name === 'High Frequency') as RasterLayer

    const lowData = getRasterData(lowLayer.imageChunkId)!
    const highData = getRasterData(highLayer.imageChunkId)!

    // Check reconstruction at interior points (avoid edges where blur padding causes drift)
    let maxError = 0
    for (let y = 5; y < h - 5; y++) {
      for (let x = 5; x < w - 5; x++) {
        const i = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          const origVal = originalData.data[i + c]!
          const reconstructed = lowData.data[i + c]! + (highData.data[i + c]! - 128)
          const error = Math.abs(reconstructed - origVal)
          if (error > maxError) maxError = error
        }
      }
    }
    // Allow small rounding error from blur approximation, but should be close
    expect(maxError).toBeLessThanOrEqual(5)
  })

  test('accepts explicit radius parameter', () => {
    const { layerId } = createTestArtboardWithRaster(50, 50, { r: 128, g: 64, b: 32, a: 255 })

    const result = performFrequencySeparation(layerId, 10)
    expect(result).toBe(true)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    expect(artboard.layers.filter((l) => l.name === 'Low Frequency').length).toBe(1)
    expect(artboard.layers.filter((l) => l.name === 'High Frequency').length).toBe(1)
  })

  test('low and high layers have raster data stored', () => {
    const { layerId } = createTestArtboardWithRaster(50, 50, { r: 100, g: 150, b: 200, a: 255 })

    performFrequencySeparation(layerId, 4)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const lowLayer = artboard.layers.find((l) => l.name === 'Low Frequency') as RasterLayer
    const highLayer = artboard.layers.find((l) => l.name === 'High Frequency') as RasterLayer

    expect(getRasterData(lowLayer.imageChunkId)).toBeDefined()
    expect(getRasterData(highLayer.imageChunkId)).toBeDefined()
    expect(getRasterData(lowLayer.imageChunkId)!.width).toBe(50)
    expect(getRasterData(highLayer.imageChunkId)!.height).toBe(50)
  })
})
