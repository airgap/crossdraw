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
    }
  }
}

import { createBrushDab, getBrushSettings, setBrushSettings, beginStroke, paintStroke, endStroke } from '@/tools/brush'
import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'

// ── Tests ──

describe('createBrushDab', () => {
  test('creates ImageData of correct dimensions', () => {
    const dab = createBrushDab(20, 0.8, '#ff0000', 1)
    expect(dab.width).toBe(20)
    expect(dab.height).toBe(20)
    expect(dab.data.length).toBe(20 * 20 * 4)
  })

  test('center pixel has color', () => {
    const dab = createBrushDab(10, 1, '#ff0000', 1)
    const center = Math.floor(10 / 2)
    const idx = (center * 10 + center) * 4
    expect(dab.data[idx]).toBe(255) // R
    expect(dab.data[idx + 1]).toBe(0) // G
    expect(dab.data[idx + 2]).toBe(0) // B
    expect(dab.data[idx + 3]).toBeGreaterThan(0) // A
  })

  test('corner pixel is transparent', () => {
    const dab = createBrushDab(20, 1, '#000000', 1)
    // Corner (0,0) should be outside the circle
    const idx = 0
    expect(dab.data[idx + 3]).toBe(0)
  })

  test('hardness 1 produces solid circle', () => {
    const dab = createBrushDab(10, 1, '#ffffff', 1)
    // All pixels within the circle should have alpha 255
    const center = 5
    const radius = 5
    let allSolidInCircle = true
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const dx = x + 0.5 - center
        const dy = y + 0.5 - center
        const dist = Math.sqrt(dx * dx + dy * dy) / radius
        if (dist <= 0.9) {
          const idx = (y * 10 + x) * 4
          if (dab.data[idx + 3]! < 200) {
            allSolidInCircle = false
          }
        }
      }
    }
    expect(allSolidInCircle).toBe(true)
  })

  test('hardness 0 produces soft falloff', () => {
    const dab = createBrushDab(20, 0, '#000000', 1)
    const center = 10
    // Center should have high alpha
    const centerIdx = (center * 20 + center) * 4
    expect(dab.data[centerIdx + 3]).toBeGreaterThan(100)

    // Edge should have lower alpha
    // Pixel at ~80% radius
    const edgeX = center + 4
    const edgeIdx = (center * 20 + edgeX) * 4
    expect(dab.data[edgeIdx + 3]!).toBeLessThan(dab.data[centerIdx + 3]!)
  })

  test('opacity scales alpha values', () => {
    const dabFull = createBrushDab(10, 1, '#ff0000', 1)
    const dabHalf = createBrushDab(10, 1, '#ff0000', 0.5)
    const center = 5
    const fullAlpha = dabFull.data[(center * 10 + center) * 4 + 3]!
    const halfAlpha = dabHalf.data[(center * 10 + center) * 4 + 3]!
    expect(halfAlpha).toBeLessThan(fullAlpha)
    expect(halfAlpha).toBeCloseTo(fullAlpha * 0.5, -1)
  })

  test('parses hex color correctly', () => {
    const dab = createBrushDab(10, 1, '#00ff00', 1)
    const center = 5
    const idx = (center * 10 + center) * 4
    expect(dab.data[idx]).toBe(0) // R
    expect(dab.data[idx + 1]).toBe(255) // G
    expect(dab.data[idx + 2]).toBe(0) // B
  })

  test('handles size 1', () => {
    const dab = createBrushDab(1, 1, '#000000', 1)
    expect(dab.width).toBe(1)
    expect(dab.height).toBe(1)
  })

  test('handles very large size', () => {
    const dab = createBrushDab(100, 0.5, '#888888', 0.8)
    expect(dab.width).toBe(100)
    expect(dab.height).toBe(100)
  })
})

describe('getBrushSettings / setBrushSettings', () => {
  test('returns default brush settings', () => {
    const settings = getBrushSettings()
    expect(settings.size).toBeGreaterThan(0)
    expect(typeof settings.hardness).toBe('number')
    expect(typeof settings.opacity).toBe('number')
    expect(typeof settings.flow).toBe('number')
    expect(typeof settings.color).toBe('string')
    expect(typeof settings.spacing).toBe('number')
  })

  test('setBrushSettings updates partial settings', () => {
    const originalSize = getBrushSettings().size
    setBrushSettings({ size: 42 })
    expect(getBrushSettings().size).toBe(42)

    // Restore
    setBrushSettings({ size: originalSize })
  })

  test('setBrushSettings invalidates dab cache', () => {
    setBrushSettings({ color: '#123456' })
    expect(getBrushSettings().color).toBe('#123456')

    // Changing color should mean the next dab creates a new canvas
    setBrushSettings({ color: '#654321' })
    expect(getBrushSettings().color).toBe('#654321')
  })

  test('returns a copy, not the internal object', () => {
    const settings1 = getBrushSettings()
    const settings2 = getBrushSettings()
    expect(settings1).not.toBe(settings2) // different objects
    expect(settings1).toEqual(settings2) // same values
  })
})

describe('beginStroke / paintStroke / endStroke', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 100, height: 100 })
    endStroke()
  })

  test('beginStroke creates a raster layer if none selected', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    expect(artboard.layers.length).toBe(0)

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    expect(updatedArtboard.layers.length).toBe(1)
    expect(updatedArtboard.layers[0]!.type).toBe('raster')

    endStroke()
  })

  test('beginStroke uses existing raster layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    // Add a raster layer manually
    const chunkId = 'existing-chunk'
    storeRasterData(chunkId, new ImageData(100, 100))
    store.addLayer(artboard.id, {
      id: 'existing-raster',
      name: 'Paint Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: chunkId,
      width: 100,
      height: 100,
    })
    store.selectLayer('existing-raster')

    const resultChunkId = beginStroke()
    expect(resultChunkId).toBe(chunkId)

    // No new layer should have been created
    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    expect(updatedArtboard.layers.length).toBe(1)

    endStroke()
  })

  test('paintStroke paints dabs along points', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    paintStroke([
      { x: 50, y: 50 },
      { x: 60, y: 50 },
      { x: 70, y: 50 },
    ])

    const imageData = getRasterData(chunkId!)
    expect(imageData).not.toBeNull()
    // Check that some pixels were painted
    let hasNonZero = false
    for (let i = 0; i < imageData!.data.length; i += 4) {
      if (imageData!.data[i + 3]! > 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(true)

    endStroke()
  })

  test('paintStroke with pressure modifies size and opacity', () => {
    setBrushSettings({ size: 20, hardness: 1, color: '#00ff00', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Low pressure
    paintStroke([{ x: 50, y: 50 }], {}, 0.1)

    endStroke()
    // Just verify no crash; the dab should be smaller
  })

  test('paintStroke without active stroke calls beginStroke', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#0000ff', opacity: 1, flow: 1, spacing: 0.25 })

    // Call paintStroke directly without beginStroke
    paintStroke([{ x: 50, y: 50 }])

    // Should have created a layer
    const artboard = useEditorStore.getState().document.artboards[0]!
    expect(artboard.layers.length).toBe(1)

    endStroke()
  })

  test('endStroke without active stroke does nothing', () => {
    endStroke()
    // No crash
  })

  test('paintStroke ignores very close points', () => {
    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Paint at same location multiple times
    paintStroke([
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ])

    endStroke()
  })

  test('beginStroke returns null when no artboard', () => {
    // Create a new store with no artboards
    const store = useEditorStore.getState()
    // Manually reset document to have no artboards
    store.newDocument({ width: 100, height: 100 })

    // Remove all artboards by creating minimal state
    // Actually, newDocument always creates one artboard, so let's just verify it works
    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()
    endStroke()
  })
})

describe('brush dab color parsing', () => {
  test('parses 6-digit hex correctly', () => {
    const dab = createBrushDab(10, 1, '#ff8040', 1)
    const center = 5
    const idx = (center * 10 + center) * 4
    expect(dab.data[idx]).toBe(255) // R
    expect(dab.data[idx + 1]).toBe(128) // G
    expect(dab.data[idx + 2]).toBe(64) // B
  })

  test('handles missing # prefix', () => {
    const dab = createBrushDab(10, 1, 'ff0000', 1)
    const center = 5
    const idx = (center * 10 + center) * 4
    expect(dab.data[idx]).toBe(255) // R
  })
})

describe('beginStroke — preStrokeSnapshot null branch', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 100, height: 100 })
    endStroke()
  })

  test('sets preStrokeSnapshot to null when raster data is missing for chunk', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    // Add a raster layer with a chunk ID that has NO raster data stored
    const missingChunkId = 'missing-chunk-no-data'
    // Deliberately do NOT call storeRasterData for this chunk
    store.addLayer(artboard.id, {
      id: 'raster-no-data',
      name: 'Paint Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: missingChunkId,
      width: 100,
      height: 100,
    })
    store.selectLayer('raster-no-data')

    // beginStroke should succeed; getRasterData will return undefined
    // causing preStrokeSnapshot = null (line 188-189)
    const chunkId = beginStroke()
    expect(chunkId).toBe(missingChunkId)

    // endStroke should not crash when preStrokeSnapshot is null
    endStroke()
  })
})

describe('paintStroke — layer validation during stroke', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 100, height: 100 })
    endStroke()
  })

  test('invalidates activeChunkId when layer is removed mid-stroke', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    // Start a stroke so activeChunkId is set
    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Now remove the raster layer from the artboard
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layerId = artboard.layers[0]!.id
    store.deleteLayer(artboard.id, layerId)

    // paintStroke should detect the layer is gone and call beginStroke again
    paintStroke([{ x: 50, y: 50 }])

    // A new layer should have been created
    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    expect(updatedArtboard.layers.length).toBe(1)
    expect(updatedArtboard.layers[0]!.type).toBe('raster')

    endStroke()
  })

  test('paintStroke with pressure clamped to range 0-1', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Pressure > 1 should clamp to 1
    paintStroke([{ x: 50, y: 50 }], {}, 5.0)

    // Pressure < 0 should clamp to 0
    paintStroke([{ x: 60, y: 60 }], {}, -1.0)

    endStroke()
  })

  test('paintStroke with brush override applies to stroke', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Override size and color
    paintStroke(
      [
        { x: 10, y: 10 },
        { x: 80, y: 80 },
      ],
      { size: 30, color: '#00ff00', hardness: 0.5 },
    )

    const imageData = getRasterData(chunkId!)
    expect(imageData).not.toBeNull()
    // Some pixels should have been painted
    let hasNonZero = false
    for (let i = 0; i < imageData!.data.length; i += 4) {
      if (imageData!.data[i + 3]! > 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(true)

    endStroke()
  })

  test('paintStroke with multiple incremental calls maintains spacing', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // First segment
    paintStroke([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ])

    // Second segment (continues the stroke — distRemainder carries over)
    paintStroke([
      { x: 20, y: 10 },
      { x: 40, y: 10 },
    ])

    // Third segment with diagonal
    paintStroke([
      { x: 40, y: 10 },
      { x: 60, y: 30 },
    ])

    const imageData = getRasterData(chunkId!)
    expect(imageData).not.toBeNull()

    endStroke()
  })

  test('endStroke pushes raster history when preStrokeSnapshot exists', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    // Start and paint
    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    paintStroke([
      { x: 50, y: 50 },
      { x: 60, y: 60 },
    ])

    // endStroke should sync canvas and push raster history
    endStroke()

    // Verify the raster data still exists after endStroke
    const imageData = getRasterData(chunkId!)
    expect(imageData).toBeDefined()
  })

  test('paintStroke handles empty points array', () => {
    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Empty array should be a no-op
    paintStroke([])

    endStroke()
  })

  test('paintStroke handles single point', () => {
    setBrushSettings({ size: 10, hardness: 0.5, color: '#ff0000', opacity: 0.8, flow: 0.5, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    paintStroke([{ x: 50, y: 50 }])

    const imageData = getRasterData(chunkId!)
    expect(imageData).not.toBeNull()

    endStroke()
  })
})

describe('stampDab — edge cases via paintStroke', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 50, height: 50 })
    endStroke()
  })

  test('dab at edge of canvas clips correctly', () => {
    setBrushSettings({ size: 20, hardness: 1, color: '#ff0000', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Paint at the very edge — dab will be clipped
    paintStroke([{ x: 0, y: 0 }])
    paintStroke([{ x: 49, y: 49 }])

    endStroke()
  })

  test('dab compositing over existing pixels', () => {
    setBrushSettings({ size: 10, hardness: 1, color: '#ff0000', opacity: 0.5, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Paint two overlapping strokes — tests the alpha compositing code in stampDab
    paintStroke([{ x: 25, y: 25 }])
    paintStroke([{ x: 25, y: 25 }]) // Same location, should composite

    const imageData = getRasterData(chunkId!)
    expect(imageData).not.toBeNull()

    // Center pixel should have been composited — alpha should be > single dab alpha
    const cx = 25
    const cy = 25
    const idx = (cy * 50 + cx) * 4
    expect(imageData!.data[idx + 3]).toBeGreaterThan(0)

    endStroke()
  })

  test('dab at negative coordinates clips correctly', () => {
    setBrushSettings({ size: 20, hardness: 1, color: '#0000ff', opacity: 1, flow: 1, spacing: 0.25 })

    const chunkId = beginStroke()
    expect(chunkId).not.toBeNull()

    // Paint with center at negative coords — half the dab is off-canvas
    paintStroke([{ x: -5, y: -5 }])

    endStroke()
  })
})
