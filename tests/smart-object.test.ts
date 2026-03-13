import { describe, test, expect } from 'bun:test'
import {
  createSmartObject,
  editSmartObject,
  updateSmartObject,
  rasterizeSmartObject,
  relinkSmartObject,
  duplicateSmartObject,
  addSmartFilter,
  removeSmartFilter,
  toggleSmartFilter,
  rasterizeToRasterLayer,
  imageDataToBase64,
  base64ToImageData,
} from '../src/layers/smart-object'
import type { VectorLayer, RasterLayer, TextLayer, GroupLayer, SmartObjectLayer, Effect } from '../src/types'

// Polyfill ImageData for headless test environment
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight!
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function makeVectorLayer(overrides?: Partial<VectorLayer>): VectorLayer {
  return {
    id: 'vec-1',
    name: 'Rectangle',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'multiply',
    transform: { x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 45 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function makeRasterLayer(overrides?: Partial<RasterLayer>): RasterLayer {
  return {
    id: 'raster-1',
    name: 'Photo',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: 'chunk-abc',
    width: 200,
    height: 150,
    ...overrides,
  }
}

function makeTextLayer(overrides?: Partial<TextLayer>): TextLayer {
  return {
    id: 'text-1',
    name: 'Heading',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 50, y: 60, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

function makeGroupLayer(overrides?: Partial<GroupLayer>): GroupLayer {
  return {
    id: 'group-1',
    name: 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children: [],
    ...overrides,
  }
}

function makeSmartObject(overrides?: Partial<SmartObjectLayer>): SmartObjectLayer {
  return {
    id: 'smart-1',
    name: 'Smart Object (Test)',
    type: 'smart-object',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    sourceType: 'embedded',
    embeddedData: {
      format: 'png',
      data: '',
      originalWidth: 100,
      originalHeight: 100,
    },
    cachedWidth: 100,
    cachedHeight: 100,
    smartFilters: [],
    ...overrides,
  }
}

function makeEffect(id: string, enabled = true): Effect {
  return {
    id,
    type: 'blur',
    enabled,
    opacity: 1,
    params: { kind: 'blur', radius: 5, quality: 'medium' },
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('createSmartObject', () => {
  test('creates smart object from vector layer', () => {
    const vec = makeVectorLayer()
    const smart = createSmartObject(vec)

    expect(smart.type).toBe('smart-object')
    expect(smart.sourceType).toBe('embedded')
    expect(smart.name).toBe('Smart Object (Rectangle)')
    expect(smart.opacity).toBe(0.8)
    expect(smart.blendMode).toBe('multiply')
    expect(smart.transform.x).toBe(10)
    expect(smart.transform.y).toBe(20)
    expect(smart.transform.rotation).toBe(45)
    expect(smart.embeddedData).toBeDefined()
    expect(smart.embeddedData!.format).toBe('png')
    expect(smart.cachedWidth).toBeGreaterThan(0)
    expect(smart.cachedHeight).toBeGreaterThan(0)
    expect(smart.smartFilters).toEqual([])
  })

  test('creates smart object from raster layer', () => {
    const raster = makeRasterLayer()
    const smart = createSmartObject(raster)

    expect(smart.type).toBe('smart-object')
    expect(smart.cachedWidth).toBe(200)
    expect(smart.cachedHeight).toBe(150)
    expect(smart.embeddedData!.originalWidth).toBe(200)
    expect(smart.embeddedData!.originalHeight).toBe(150)
  })

  test('creates smart object from text layer', () => {
    const text = makeTextLayer()
    const smart = createSmartObject(text)

    expect(smart.type).toBe('smart-object')
    expect(smart.name).toBe('Smart Object (Heading)')
    expect(smart.cachedWidth).toBeGreaterThan(0)
    expect(smart.cachedHeight).toBeGreaterThan(0)
  })

  test('creates smart object from group layer', () => {
    const group = makeGroupLayer()
    const smart = createSmartObject(group)

    expect(smart.type).toBe('smart-object')
    expect(smart.name).toBe('Smart Object (Group)')
  })

  test('generated smart object has unique id', () => {
    const vec = makeVectorLayer()
    const s1 = createSmartObject(vec)
    const s2 = createSmartObject(vec)
    expect(s1.id).not.toBe(s2.id)
  })
})

describe('editSmartObject', () => {
  test('returns a DesignDocument with embedded data', () => {
    const smart = makeSmartObject({
      embeddedData: { format: 'png', data: 'AAAA', originalWidth: 50, originalHeight: 50 },
    })
    const doc = editSmartObject(smart)

    expect(doc).not.toBeNull()
    expect(doc!.artboards.length).toBe(1)
    expect(doc!.artboards[0]!.width).toBe(50)
    expect(doc!.artboards[0]!.height).toBe(50)
    expect(doc!.artboards[0]!.layers.length).toBe(1)
    expect(doc!.artboards[0]!.layers[0]!.type).toBe('raster')
  })

  test('returns null when no embedded data', () => {
    const smart = makeSmartObject({ embeddedData: undefined })
    const doc = editSmartObject(smart)
    expect(doc).toBeNull()
  })
})

describe('updateSmartObject', () => {
  test('updates embedded data with new content', () => {
    const smart = makeSmartObject()
    const updated = updateSmartObject(smart, 'bmV3ZGF0YQ==', 300, 200)

    expect(updated.embeddedData!.data).toBe('bmV3ZGF0YQ==')
    expect(updated.embeddedData!.originalWidth).toBe(300)
    expect(updated.embeddedData!.originalHeight).toBe(200)
    expect(updated.cachedWidth).toBe(300)
    expect(updated.cachedHeight).toBe(200)
  })

  test('preserves format from original', () => {
    const smart = makeSmartObject({
      embeddedData: { format: 'svg', data: '', originalWidth: 100, originalHeight: 100 },
    })
    const updated = updateSmartObject(smart, 'data', 100, 100)
    expect(updated.embeddedData!.format).toBe('svg')
  })

  test('defaults to png when no original format', () => {
    const smart = makeSmartObject({ embeddedData: undefined })
    const updated = updateSmartObject(smart, 'data', 100, 100)
    expect(updated.embeddedData!.format).toBe('png')
  })
})

describe('rasterizeSmartObject', () => {
  test('returns null for empty data', () => {
    const smart = makeSmartObject()
    const result = rasterizeSmartObject(smart)
    expect(result).toBeNull()
  })

  test('returns null when no embeddedData', () => {
    const smart = makeSmartObject({ embeddedData: undefined })
    const result = rasterizeSmartObject(smart)
    expect(result).toBeNull()
  })

  test('decodes valid base64 RGBA data to ImageData', () => {
    // Create a 2x2 image (16 bytes of RGBA)
    const w = 2
    const h = 2
    const rgba = new Uint8Array(w * h * 4)
    rgba[0] = 255 // R
    rgba[3] = 255 // A
    rgba[7] = 255 // A of second pixel
    let binary = ''
    for (let i = 0; i < rgba.length; i++) {
      binary += String.fromCharCode(rgba[i]!)
    }
    const b64 = btoa(binary)

    const smart = makeSmartObject({
      embeddedData: { format: 'png', data: b64, originalWidth: w, originalHeight: h },
      cachedWidth: w,
      cachedHeight: h,
    })
    const result = rasterizeSmartObject(smart)
    expect(result).not.toBeNull()
    expect(result!.width).toBe(2)
    expect(result!.height).toBe(2)
    expect(result!.data[0]).toBe(255) // R channel
    expect(result!.data[3]).toBe(255) // A channel
  })
})

describe('relinkSmartObject', () => {
  test('updates path and sets sourceType to linked', () => {
    const smart = makeSmartObject()
    const relinked = relinkSmartObject(smart, '/path/to/image.psd')

    expect(relinked.sourceType).toBe('linked')
    expect(relinked.linkedPath).toBe('/path/to/image.psd')
    expect(relinked.linkedHash).toBeUndefined()
  })

  test('clears previous hash', () => {
    const smart = makeSmartObject({ linkedHash: 'abc123' })
    const relinked = relinkSmartObject(smart, '/new/path.png')
    expect(relinked.linkedHash).toBeUndefined()
  })
})

describe('duplicateSmartObject', () => {
  test('creates independent copy when not linked', () => {
    const smart = makeSmartObject({
      embeddedData: { format: 'png', data: 'somedata', originalWidth: 100, originalHeight: 100 },
    })
    const dup = duplicateSmartObject(smart, false)

    expect(dup.id).not.toBe(smart.id)
    expect(dup.name).toBe('Smart Object (Test) copy')
    expect(dup.transform.x).toBe(smart.transform.x + 20)
    expect(dup.transform.y).toBe(smart.transform.y + 20)
    expect(dup.embeddedData).toBeDefined()
    expect(dup.embeddedData!.data).toBe('somedata')
  })

  test('creates linked copy sharing embedded data reference', () => {
    const smart = makeSmartObject({
      embeddedData: { format: 'png', data: 'shared', originalWidth: 100, originalHeight: 100 },
    })
    const dup = duplicateSmartObject(smart, true)

    expect(dup.id).not.toBe(smart.id)
    // For linked mode, embeddedData should be the same reference
    expect(dup.embeddedData).toBe(smart.embeddedData)
  })

  test('duplicated smart filters get new IDs', () => {
    const smart = makeSmartObject({
      smartFilters: [makeEffect('f1'), makeEffect('f2')],
    })
    const dup = duplicateSmartObject(smart, false)

    expect(dup.smartFilters!.length).toBe(2)
    expect(dup.smartFilters![0]!.id).not.toBe('f1')
    expect(dup.smartFilters![1]!.id).not.toBe('f2')
  })
})

describe('smart filters', () => {
  test('addSmartFilter appends a filter', () => {
    const smart = makeSmartObject()
    const effect = makeEffect('e1')
    const updated = addSmartFilter(smart, effect)

    expect(updated.smartFilters!.length).toBe(1)
    expect(updated.smartFilters![0]!.id).toBe('e1')
  })

  test('addSmartFilter to existing filters', () => {
    const smart = makeSmartObject({ smartFilters: [makeEffect('e1')] })
    const updated = addSmartFilter(smart, makeEffect('e2'))

    expect(updated.smartFilters!.length).toBe(2)
    expect(updated.smartFilters![1]!.id).toBe('e2')
  })

  test('removeSmartFilter removes by ID', () => {
    const smart = makeSmartObject({ smartFilters: [makeEffect('e1'), makeEffect('e2'), makeEffect('e3')] })
    const updated = removeSmartFilter(smart, 'e2')

    expect(updated.smartFilters!.length).toBe(2)
    expect(updated.smartFilters!.map((f) => f.id)).toEqual(['e1', 'e3'])
  })

  test('removeSmartFilter no-op for non-existent ID', () => {
    const smart = makeSmartObject({ smartFilters: [makeEffect('e1')] })
    const updated = removeSmartFilter(smart, 'nonexistent')

    expect(updated.smartFilters!.length).toBe(1)
  })

  test('toggleSmartFilter toggles enabled state', () => {
    const smart = makeSmartObject({ smartFilters: [makeEffect('e1', true)] })
    const toggled = toggleSmartFilter(smart, 'e1')

    expect(toggled.smartFilters![0]!.enabled).toBe(false)

    const toggledBack = toggleSmartFilter(toggled, 'e1')
    expect(toggledBack.smartFilters![0]!.enabled).toBe(true)
  })

  test('toggleSmartFilter does not affect other filters', () => {
    const smart = makeSmartObject({ smartFilters: [makeEffect('e1', true), makeEffect('e2', false)] })
    const toggled = toggleSmartFilter(smart, 'e1')

    expect(toggled.smartFilters![0]!.enabled).toBe(false)
    expect(toggled.smartFilters![1]!.enabled).toBe(false) // unchanged
  })
})

describe('rasterizeToRasterLayer', () => {
  test('converts smart object to raster layer', () => {
    const smart = makeSmartObject({ name: 'Smart Object (Photo)' })
    const raster = rasterizeToRasterLayer(smart)

    expect(raster.type).toBe('raster')
    expect(raster.name).toBe('Photo')
    expect(raster.width).toBe(100)
    expect(raster.height).toBe(100)
    expect(raster.visible).toBe(true)
    expect(raster.opacity).toBe(1)
    expect(raster.imageChunkId).toContain('rasterized-')
  })

  test('preserves visibility, opacity, blend mode', () => {
    const smart = makeSmartObject({
      name: 'Smart Object (Layer)',
      visible: false,
      locked: true,
      opacity: 0.5,
      blendMode: 'screen',
    })
    const raster = rasterizeToRasterLayer(smart)

    expect(raster.visible).toBe(false)
    expect(raster.locked).toBe(true)
    expect(raster.opacity).toBe(0.5)
    expect(raster.blendMode).toBe('screen')
  })

  test('uses full name when no parens wrapper', () => {
    const smart = makeSmartObject({ name: 'My Layer' })
    const raster = rasterizeToRasterLayer(smart)
    expect(raster.name).toBe('My Layer')
  })
})

describe('imageDataToBase64 / base64ToImageData roundtrip', () => {
  test('roundtrip preserves pixel data', () => {
    const w = 3
    const h = 2
    const data = new Uint8ClampedArray(w * h * 4)
    // Fill with known pattern
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }
    const imageData = new ImageData(data, w, h)

    const b64 = imageDataToBase64(imageData)
    expect(b64.length).toBeGreaterThan(0)

    const restored = base64ToImageData(b64, w, h)
    expect(restored).not.toBeNull()
    expect(restored!.width).toBe(w)
    expect(restored!.height).toBe(h)
    for (let i = 0; i < data.length; i++) {
      expect(restored!.data[i]).toBe(data[i])
    }
  })

  test('base64ToImageData returns null for empty string', () => {
    expect(base64ToImageData('', 10, 10)).toBeNull()
  })

  test('base64ToImageData returns null for wrong dimensions', () => {
    const w = 2
    const h = 2
    const data = new Uint8ClampedArray(w * h * 4)
    const imageData = new ImageData(data, w, h)
    const b64 = imageDataToBase64(imageData)

    // Try to decode with wrong dimensions
    const result = base64ToImageData(b64, 3, 3)
    expect(result).toBeNull()
  })
})

describe('SmartObjectLayer type', () => {
  test('smart-object layer has correct type discriminant', () => {
    const layer: SmartObjectLayer = makeSmartObject()
    expect(layer.type).toBe('smart-object')
  })

  test('sourceType can be embedded or linked', () => {
    const embedded = makeSmartObject({ sourceType: 'embedded' })
    expect(embedded.sourceType).toBe('embedded')

    const linked = makeSmartObject({ sourceType: 'linked', linkedPath: '/foo.psd' })
    expect(linked.sourceType).toBe('linked')
    expect(linked.linkedPath).toBe('/foo.psd')
  })

  test('smart object with smart filters', () => {
    const smart = makeSmartObject({
      smartFilters: [
        makeEffect('f1'),
        {
          id: 'f2',
          type: 'shadow',
          enabled: true,
          opacity: 0.8,
          params: { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
        },
      ],
    })
    expect(smart.smartFilters!.length).toBe(2)
    expect(smart.smartFilters![0]!.type).toBe('blur')
    expect(smart.smartFilters![1]!.type).toBe('shadow')
  })
})
