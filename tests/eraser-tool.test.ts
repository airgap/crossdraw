import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { getEraserSettings, setEraserSettings, beginEraserStroke, paintEraser, endEraserStroke } from '@/tools/eraser'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// Save originals
const origImageData = globalThis.ImageData
const origOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

// Polyfill ImageData for Bun (not available outside browser)
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, heightOrUndef?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = heightOrUndef!
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// Polyfill OffscreenCanvas for Bun
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        bezierCurveTo() {},
        quadraticCurveTo() {},
        closePath() {},
        arc() {},
        rect() {},
        clip() {},
        fill() {},
        stroke() {},
        fillRect() {},
        clearRect() {},
        drawImage() {},
        setTransform() {},
        resetTransform() {},
        scale() {},
        translate() {},
        rotate() {},
        setLineDash() {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 50 }),
        fillText() {},
        putImageData() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          return new (globalThis as any).ImageData(w, h)
        },
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        canvas: {
          width: 100,
          height: 100,
          toDataURL: () => 'data:image/png;base64,',
          toBlob: (cb: any) => cb(new Blob()),
        },
      }
    }
  }
}

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 100, height: 100 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function addRasterLayer(chunkId: string): RasterLayer {
  const layer: RasterLayer = {
    id: `raster-${chunkId}`,
    name: 'Test Raster',
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
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function createTestImageData(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  // Fill with opaque red
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 // R
    data[i + 1] = 0 // G
    data[i + 2] = 0 // B
    data[i + 3] = 255 // A
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData
}

// ── Tests ──

describe('Eraser Tool', () => {
  beforeEach(() => {
    resetStore()
    endEraserStroke()
    // Reset eraser settings to default
    setEraserSettings({ size: 20, hardness: 1, opacity: 1, flow: 1, color: '#000000', spacing: 0.25 })
  })

  describe('getEraserSettings', () => {
    test('returns default settings', () => {
      const settings = getEraserSettings()
      expect(settings.size).toBe(20)
      expect(settings.hardness).toBe(1)
      expect(settings.opacity).toBe(1)
      expect(settings.flow).toBe(1)
      expect(settings.color).toBe('#000000')
      expect(settings.spacing).toBe(0.25)
    })

    test('returns a copy, not a reference', () => {
      const s1 = getEraserSettings()
      const s2 = getEraserSettings()
      s1.size = 999
      expect(s2.size).toBe(20)
    })
  })

  describe('setEraserSettings', () => {
    test('updates size', () => {
      setEraserSettings({ size: 50 })
      expect(getEraserSettings().size).toBe(50)
    })

    test('updates multiple settings', () => {
      setEraserSettings({ size: 30, hardness: 0.5, opacity: 0.8 })
      const s = getEraserSettings()
      expect(s.size).toBe(30)
      expect(s.hardness).toBe(0.5)
      expect(s.opacity).toBe(0.8)
    })

    test('partial update preserves other settings', () => {
      setEraserSettings({ size: 40 })
      const s = getEraserSettings()
      expect(s.size).toBe(40)
      expect(s.hardness).toBe(1) // unchanged
      expect(s.flow).toBe(1) // unchanged
    })

    test('updates spacing', () => {
      setEraserSettings({ spacing: 0.5 })
      expect(getEraserSettings().spacing).toBe(0.5)
    })

    test('updates color', () => {
      setEraserSettings({ color: '#ff0000' })
      expect(getEraserSettings().color).toBe('#ff0000')
    })
  })

  describe('beginEraserStroke', () => {
    test('returns null when no artboard', () => {
      // Create a store with no artboards
      useEditorStore.setState({
        document: {
          ...useEditorStore.getState().document,
          artboards: [],
        },
      })
      const result = beginEraserStroke()
      expect(result).toBeNull()
    })

    test('returns null when no raster layer exists', () => {
      // Default document has no raster layers
      const result = beginEraserStroke()
      expect(result).toBeNull()
    })

    test('returns chunkId when raster layer exists', () => {
      const chunkId = 'test-chunk-1'
      const imageData = createTestImageData(100, 100)
      storeRasterData(chunkId, imageData)
      addRasterLayer(chunkId)

      const result = beginEraserStroke()
      expect(result).toBe(chunkId)
    })

    test('prefers selected raster layer', () => {
      const chunkId1 = 'chunk-a'
      const chunkId2 = 'chunk-b'
      storeRasterData(chunkId1, createTestImageData(100, 100))
      storeRasterData(chunkId2, createTestImageData(100, 100))
      const layer1 = addRasterLayer(chunkId1)
      addRasterLayer(chunkId2)

      // Select the first layer
      useEditorStore.getState().selectLayer(layer1.id)

      const result = beginEraserStroke()
      expect(result).toBe(chunkId1)
    })
  })

  describe('paintEraser', () => {
    test('does nothing with no active chunk and no raster layer', () => {
      // Should not throw
      paintEraser([{ x: 10, y: 10 }])
    })

    test('accepts custom size parameter', () => {
      const chunkId = 'eraser-size-test'
      storeRasterData(chunkId, createTestImageData(100, 100))
      addRasterLayer(chunkId)
      beginEraserStroke()

      // Should not throw
      paintEraser([{ x: 10, y: 10 }], 50)
    })

    test('processes multiple points', () => {
      const chunkId = 'eraser-multi-test'
      storeRasterData(chunkId, createTestImageData(100, 100))
      addRasterLayer(chunkId)
      beginEraserStroke()

      // Should not throw
      paintEraser([
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
        { x: 40, y: 40 },
      ])
    })

    test('handles very close points without issue', () => {
      const chunkId = 'eraser-close-test'
      storeRasterData(chunkId, createTestImageData(100, 100))
      addRasterLayer(chunkId)
      beginEraserStroke()

      // Points very close together (segLen < 0.5)
      paintEraser([
        { x: 10, y: 10 },
        { x: 10.1, y: 10.1 },
        { x: 10.2, y: 10.2 },
      ])
    })
  })

  describe('endEraserStroke', () => {
    test('does not throw when called without active stroke', () => {
      endEraserStroke()
      // No error
    })

    test('resets stroke state', () => {
      const chunkId = 'eraser-end-test'
      storeRasterData(chunkId, createTestImageData(100, 100))
      addRasterLayer(chunkId)
      beginEraserStroke()
      paintEraser([{ x: 10, y: 10 }])
      endEraserStroke()
      // Can start a new stroke without issue
      const result = beginEraserStroke()
      expect(result).toBe(chunkId)
    })
  })

  describe('full erase workflow', () => {
    test('begin -> paint -> end completes successfully', () => {
      const chunkId = 'eraser-workflow'
      storeRasterData(chunkId, createTestImageData(100, 100))
      addRasterLayer(chunkId)

      const result = beginEraserStroke()
      expect(result).toBe(chunkId)

      paintEraser([
        { x: 10, y: 10 },
        { x: 20, y: 15 },
        { x: 30, y: 20 },
      ])

      endEraserStroke()
    })
  })
})
