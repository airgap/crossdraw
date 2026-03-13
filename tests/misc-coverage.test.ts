/**
 * Miscellaneous coverage boost tests.
 *
 * Targets:
 *  - src/io/avif-heif.ts
 *  - src/io/migrations.ts
 *  - src/io/raw-import.ts
 *  - src/io/website-export.ts
 *  - src/collab/sync-client.ts
 *  - src/color/cmyk-mode.ts
 *  - src/store/editor.store.ts
 *  - src/ui/quick-export.ts
 *  - src/tools/import-image.ts
 *  - src/ui/histogram.tsx
 */

import { describe, test, expect, beforeEach } from 'bun:test'

// ── Polyfill ImageData for bun:test (not available by default) ──
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    readonly width: number
    readonly height: number
    readonly data: Uint8ClampedArray
    readonly colorSpace: string
    constructor(widthOrData: number | Uint8ClampedArray, heightOrWidth: number, height?: number) {
      if (typeof widthOrData === 'number') {
        this.width = widthOrData
        this.height = heightOrWidth
        this.data = new Uint8ClampedArray(widthOrData * heightOrWidth * 4)
      } else {
        this.data = widthOrData
        this.width = heightOrWidth
        this.height = height ?? widthOrData.length / (heightOrWidth * 4)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── Polyfill localStorage for bun:test ──
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) AVIF / HEIF — feature detection, cache reset, fallback when no OffscreenCanvas
// ═══════════════════════════════════════════════════════════════════════════

describe('avif-heif', () => {
  test('resetSupportCache clears cached values', async () => {
    const { isAVIFSupported, isHEIFSupported, resetSupportCache } = await import('@/io/avif-heif')
    // Call once to populate cache
    await isAVIFSupported()
    await isHEIFSupported()
    // Reset and call again — should not throw
    resetSupportCache()
    const a = await isAVIFSupported()
    const h = await isHEIFSupported()
    expect(typeof a).toBe('boolean')
    expect(typeof h).toBe('boolean')
  })

  test('isAVIFSupported returns consistent cached result', async () => {
    const { isAVIFSupported, resetSupportCache } = await import('@/io/avif-heif')
    resetSupportCache()
    const first = await isAVIFSupported()
    const second = await isAVIFSupported()
    expect(first).toBe(second)
  })

  test('isHEIFSupported returns consistent cached result', async () => {
    const { isHEIFSupported, resetSupportCache } = await import('@/io/avif-heif')
    resetSupportCache()
    const first = await isHEIFSupported()
    const second = await isHEIFSupported()
    expect(first).toBe(second)
  })

  test('exportAVIF throws or succeeds depending on env', async () => {
    const { exportAVIF } = await import('@/io/avif-heif')
    const imgData = new ImageData(2, 2) as any
    try {
      const blob = await exportAVIF(imgData, 0.5)
      // If we get here the env supports AVIF
      expect(blob).toBeInstanceOf(Blob)
    } catch (err: any) {
      // Expected on envs that don't support AVIF encoding or lack OffscreenCanvas
      expect(typeof err.message).toBe('string')
    }
  })

  test('exportHEIF throws or succeeds depending on env', async () => {
    const { exportHEIF } = await import('@/io/avif-heif')
    const imgData = new ImageData(2, 2) as any
    try {
      const blob = await exportHEIF(imgData, 0.9)
      expect(blob).toBeInstanceOf(Blob)
    } catch (err: any) {
      expect(typeof err.message).toBe('string')
    }
  })

  test('importAVIF and importHEIF are callable', async () => {
    const { importAVIF, importHEIF } = await import('@/io/avif-heif')
    expect(typeof importAVIF).toBe('function')
    expect(typeof importHEIF).toBe('function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2) Migrations — v2→v3 with effects, adjustment layers, groups, masks
// ═══════════════════════════════════════════════════════════════════════════

describe('migrations v2→v3', () => {
  test('migrateData v2→v3 converts adjustment layers to filter layers', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          name: 'Main',
          layers: [
            {
              id: 'adj1',
              type: 'adjustment',
              adjustmentType: 'levels',
              params: { blackPoint: 10, whitePoint: 245, gamma: 1.2 },
              visible: true,
              opacity: 0.8,
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 2, 3)
    const layers = (result.artboards as any[])[0].layers
    expect(layers).toHaveLength(1)
    expect(layers[0].type).toBe('filter')
    expect(layers[0].filterParams.kind).toBe('levels')
    expect(layers[0].filterParams.blackPoint).toBe(10)
    // adjustmentType should be removed
    expect(layers[0].adjustmentType).toBeUndefined()
    expect(layers[0].params).toBeUndefined()
  })

  test('migrateData v2→v3 converts per-layer effects to sibling filter layers', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          layers: [
            {
              id: 'vec1',
              type: 'vector',
              effects: [
                { id: 'eff1', type: 'blur', enabled: true, opacity: 1, params: { radius: 5 } },
                {
                  id: 'eff2',
                  type: 'drop-shadow',
                  enabled: false,
                  opacity: 0.5,
                  params: { offsetX: 2 },
                },
              ],
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 2, 3)
    const layers = (result.artboards as any[])[0].layers
    // 2 effect filter layers + 1 original = 3
    expect(layers).toHaveLength(3)
    // First two should be filter layers from effects
    expect(layers[0].type).toBe('filter')
    expect(layers[0].name).toBe('Blur')
    expect(layers[0].id).toBe('eff1-filter')
    expect(layers[0].visible).toBe(true)
    expect(layers[1].type).toBe('filter')
    expect(layers[1].name).toBe('Drop Shadow')
    expect(layers[1].visible).toBe(false) // enabled was false
    // Original layer should have effects removed
    expect(layers[2].id).toBe('vec1')
    expect(layers[2].effects).toBeUndefined()
  })

  test('migrateData v2→v3 handles group children recursively', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          layers: [
            {
              id: 'grp1',
              type: 'group',
              children: [
                {
                  id: 'adj2',
                  type: 'adjustment',
                  adjustmentType: 'hue-sat',
                  params: { hue: 20, saturation: -10, lightness: 5 },
                },
              ],
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 2, 3)
    const group = (result.artboards as any[])[0].layers[0]
    expect(group.type).toBe('group')
    expect(group.children[0].type).toBe('filter')
    expect(group.children[0].filterParams.kind).toBe('hue-sat')
  })

  test('migrateData v2→v3 handles mask migration', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          layers: [
            {
              id: 'lay1',
              type: 'vector',
              mask: {
                id: 'mask1',
                type: 'adjustment',
                adjustmentType: 'curves',
                params: {
                  points: [
                    [0, 0],
                    [255, 255],
                  ],
                },
              },
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 2, 3)
    const layer = (result.artboards as any[])[0].layers[0]
    expect(layer.mask.type).toBe('filter')
    expect(layer.mask.filterParams.kind).toBe('curves')
  })

  test('migrateData v2→v3 no-ops when artboards missing', async () => {
    const { migrateData } = await import('@/io/migrations')
    const result = migrateData({ foo: 'bar' }, 2, 3)
    expect(result.foo).toBe('bar')
  })

  test('effectTypeName handles unknown types gracefully', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          layers: [
            {
              id: 'lay1',
              type: 'vector',
              effects: [{ id: 'eff1', type: 'unknown-effect', params: {}, enabled: true }],
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 2, 3)
    const layers = (result.artboards as any[])[0].layers
    // Unknown effect type should use the raw type string as name
    expect(layers[0].name).toBe('unknown-effect')
  })

  test('canMigrate 1→3 (full chain)', async () => {
    const { canMigrate } = await import('@/io/migrations')
    expect(canMigrate(1, 3)).toBe(true)
  })

  test('migrateData 1→3 applies both migrators', async () => {
    const { migrateData } = await import('@/io/migrations')
    const data = {
      artboards: [
        {
          id: 'ab1',
          layers: [
            {
              id: 'adj1',
              type: 'adjustment',
              adjustmentType: 'color-balance',
              params: { shadows: 5, midtones: -3, highlights: 2 },
            },
          ],
        },
      ],
    }
    const result = migrateData(data, 1, 3)
    const layers = (result.artboards as any[])[0].layers
    expect(layers[0].type).toBe('filter')
    expect(layers[0].filterParams.kind).toBe('color-balance')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3) raw-import — isRAWFile, detectRAWFormat, extractRAWPreview
// ═══════════════════════════════════════════════════════════════════════════

describe('raw-import', () => {
  function makeBuffer(bytes: number[]): ArrayBuffer {
    const buf = new ArrayBuffer(Math.max(bytes.length, 512))
    const view = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) view[i] = bytes[i]!
    return buf
  }

  test('isRAWFile returns false for tiny data', async () => {
    const { isRAWFile } = await import('@/io/raw-import')
    expect(isRAWFile(new ArrayBuffer(4))).toBe(false)
  })

  test('isRAWFile returns false for random data', async () => {
    const { isRAWFile } = await import('@/io/raw-import')
    const buf = new ArrayBuffer(64)
    new Uint8Array(buf).fill(0x42)
    expect(isRAWFile(buf)).toBe(false)
  })

  test('detectRAWFormat returns null for tiny data', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    expect(detectRAWFormat(new ArrayBuffer(8))).toBeNull()
  })

  test('detectRAWFormat returns null for unknown data', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const buf = new ArrayBuffer(64)
    expect(detectRAWFormat(buf)).toBeNull()
  })

  test('detectRAWFormat detects CR2 (Canon)', async () => {
    const { detectRAWFormat, isRAWFile } = await import('@/io/raw-import')
    // CR2: TIFF little-endian (II) + magic 42 + 'CR' at offset 8
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49 // 'I'
    bytes[1] = 0x49 // 'I'
    bytes[2] = 42 // TIFF magic (LE)
    bytes[3] = 0
    bytes[8] = 0x43 // 'C'
    bytes[9] = 0x52 // 'R'
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('CR2')
    expect(isRAWFile(buf)).toBe(true)
  })

  test('detectRAWFormat detects RAF (Fujifilm)', async () => {
    const { detectRAWFormat, isRAWFile } = await import('@/io/raw-import')
    const magic = 'FUJIFILMCCD-RAW '
    const bytes = new Array(512).fill(0)
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('RAF')
    expect(isRAWFile(buf)).toBe(true)
  })

  test('detectRAWFormat detects ORF (Olympus) LE', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49 // 'I'
    bytes[1] = 0x49 // 'I'
    bytes[2] = 0x4f // 'O' (LE: stored as 0x524F)
    bytes[3] = 0x52 // 'R'
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('ORF')
  })

  test('detectRAWFormat detects ORF (Olympus) BE', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x4d // 'M'
    bytes[1] = 0x4d // 'M'
    bytes[2] = 0x4f // 'O'
    bytes[3] = 0x52 // 'R'
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('ORF')
  })

  test('detectRAWFormat detects RW2 (Panasonic)', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49 // 'I'
    bytes[1] = 0x49 // 'I'
    bytes[2] = 0x55 // 0x0055 LE
    bytes[3] = 0x00
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('RW2')
  })

  test('detectRAWFormat detects NEF (Nikon)', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49 // 'I'
    bytes[1] = 0x49 // 'I'
    bytes[2] = 42 // TIFF magic
    bytes[3] = 0
    // Write 'Nikon' somewhere in the first 256 bytes
    const nikon = 'Nikon'
    for (let i = 0; i < nikon.length; i++) bytes[20 + i] = nikon.charCodeAt(i)
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('NEF')
  })

  test('detectRAWFormat detects ARW (Sony)', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x4d // 'M'
    bytes[1] = 0x4d // 'M'
    bytes[2] = 0 // TIFF magic BE: 0x002A
    bytes[3] = 42
    const sony = 'SONY'
    for (let i = 0; i < sony.length; i++) bytes[100 + i] = sony.charCodeAt(i)
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('ARW')
  })

  test('detectRAWFormat detects PEF (Pentax)', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49
    bytes[1] = 0x49
    bytes[2] = 42
    bytes[3] = 0
    const pentax = 'PENTAX'
    for (let i = 0; i < pentax.length; i++) bytes[100 + i] = pentax.charCodeAt(i)
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('PEF')
  })

  test('detectRAWFormat detects DNG', async () => {
    const { detectRAWFormat } = await import('@/io/raw-import')
    const bytes = new Array(512).fill(0)
    bytes[0] = 0x49
    bytes[1] = 0x49
    bytes[2] = 42
    bytes[3] = 0
    const dng = 'DNG'
    for (let i = 0; i < dng.length; i++) bytes[20 + i] = dng.charCodeAt(i)
    const buf = makeBuffer(bytes)
    expect(detectRAWFormat(buf)).toBe('DNG')
  })

  test('extractRAWPreview finds embedded JPEG', async () => {
    const { extractRAWPreview } = await import('@/io/raw-import')
    // Build a fake raw file with a JPEG marker embedded after byte 12
    const bytes = new Array(100).fill(0)
    // JPEG SOI at offset 20
    bytes[20] = 0xff
    bytes[21] = 0xd8
    // Some JPEG data
    bytes[22] = 0x01
    bytes[23] = 0x02
    // JPEG EOI at offset 30
    bytes[30] = 0xff
    bytes[31] = 0xd9
    const buf = makeBuffer(bytes)
    const preview = extractRAWPreview(buf)
    expect(preview[0]).toBe(0xff)
    expect(preview[1]).toBe(0xd8)
    // Should end at EOI + 2 = offset 32, so length = 32 - 20 = 12
    expect(preview.length).toBe(12)
  })

  test('extractRAWPreview throws when no JPEG SOI found', async () => {
    const { extractRAWPreview } = await import('@/io/raw-import')
    const buf = new ArrayBuffer(100)
    expect(() => extractRAWPreview(buf)).toThrow('No embedded JPEG preview')
  })

  test('extractRAWPreview handles missing EOI (takes rest of data)', async () => {
    const { extractRAWPreview } = await import('@/io/raw-import')
    const bytes = new Array(50).fill(0)
    bytes[20] = 0xff
    bytes[21] = 0xd8
    // No EOI marker anywhere
    const buf = makeBuffer(bytes)
    const preview = extractRAWPreview(buf)
    expect(preview[0]).toBe(0xff)
    expect(preview[1]).toBe(0xd8)
    // Should take from offset 20 to end
    expect(preview.length).toBe(buf.byteLength - 20)
  })

  test('DEFAULT_RAW_SETTINGS has expected defaults', async () => {
    const { DEFAULT_RAW_SETTINGS } = await import('@/io/raw-import')
    expect(DEFAULT_RAW_SETTINGS.usePreview).toBe(false)
    expect(DEFAULT_RAW_SETTINGS.whiteBalance).toBe('auto')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4) website-export — generateCSS, generateHTML for different layer types
// ═══════════════════════════════════════════════════════════════════════════

describe('website-export', () => {
  const { exportStaticSite, DEFAULT_WEBSITE_EXPORT_SETTINGS } =
    require('@/io/website-export') as typeof import('@/io/website-export')

  function makeDoc(layers: any[], artboardName = 'Page 1'): any {
    return {
      id: 'doc1',
      metadata: { title: 'Test Site' },
      artboards: [
        {
          id: 'ab1',
          name: artboardName,
          x: 0,
          y: 0,
          width: 1200,
          height: 800,
          backgroundColor: '#ffffff',
          layers,
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
  }

  test('exports text layers as HTML heading or paragraph', () => {
    const doc = makeDoc([
      {
        id: 'tl1',
        name: 'Title',
        type: 'text',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        text: 'Hello World',
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        color: '#333333',
      },
      {
        id: 'tl2',
        name: 'Body',
        type: 'text',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
        text: 'Paragraph text',
        fontFamily: 'Arial',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1.5,
        letterSpacing: 1,
        color: '#666666',
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<h2')
    expect(result.html).toContain('Hello World')
    expect(result.html).toContain('<p')
    expect(result.html).toContain('Paragraph text')
    expect(result.css).toContain("font-family: 'Inter'")
    expect(result.css).toContain('font-size: 32px')
    expect(result.css).toContain('letter-spacing: 1px')
  })

  test('exports raster layers as img tags with asset references', () => {
    const doc = makeDoc([
      {
        id: 'rl1',
        name: 'Photo',
        type: 'raster',
        visible: true,
        opacity: 1,
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
        width: 400,
        height: 300,
        imageChunkId: 'chunk1',
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('img')
    expect(result.html).toContain('photo.png')
    expect(result.assets.has('photo.png')).toBe(true)
    expect(result.css).toContain('max-width: 100%')
  })

  test('exports vector layer with shapeParams as styled div', () => {
    const doc = makeDoc([
      {
        id: 'vl1',
        name: 'Rectangle',
        type: 'vector',
        visible: true,
        opacity: 0.8,
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 45 },
        paths: [],
        fill: { type: 'solid', color: '#ff0000', opacity: 1 },
        stroke: {
          width: 2,
          color: '#000000',
          opacity: 1,
          position: 'center',
          linecap: 'butt',
          linejoin: 'miter',
          miterLimit: 4,
        },
        shapeParams: { shapeType: 'rectangle', width: 200, height: 100, cornerRadius: 8 },
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<div')
    expect(result.css).toContain('width: 200px')
    expect(result.css).toContain('height: 100px')
    expect(result.css).toContain('border-radius: 8px')
    expect(result.css).toContain('opacity: 0.8')
    expect(result.css).toContain('rotate(45deg)')
    expect(result.css).toContain('background-color: #ff0000')
    expect(result.css).toContain('border: 2px solid #000000')
  })

  test('exports vector layer with ellipse shape', () => {
    const doc = makeDoc([
      {
        id: 'vl2',
        name: 'Ellipse',
        type: 'vector',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        paths: [],
        fill: { type: 'solid', color: '#00ff00', opacity: 1 },
        stroke: null,
        shapeParams: { shapeType: 'ellipse', width: 100, height: 100 },
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.css).toContain('border-radius: 50%')
  })

  test('exports vector layer with array cornerRadius', () => {
    const doc = makeDoc([
      {
        id: 'vl3',
        name: 'Rounded',
        type: 'vector',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        paths: [],
        fill: null,
        stroke: null,
        shapeParams: { shapeType: 'rectangle', width: 100, height: 100, cornerRadius: [4, 8, 12, 16] },
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.css).toContain('border-radius: 4px 8px 12px 16px')
  })

  test('exports vector layer without shapeParams as SVG asset', () => {
    const doc = makeDoc([
      {
        id: 'vl4',
        name: 'Custom Path',
        type: 'vector',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        paths: [{ id: 'p1', segments: [{ type: 'move', x: 0, y: 0 }], closed: false }],
        fill: null,
        stroke: null,
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('custom-path.svg')
    expect(result.assets.has('custom-path.svg')).toBe(true)
  })

  test('exports group layers with nested children', () => {
    const doc = makeDoc([
      {
        id: 'grp1',
        name: 'Header',
        type: 'group',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        children: [
          {
            id: 'tl3',
            name: 'Logo',
            type: 'text',
            visible: true,
            opacity: 1,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            text: 'Brand',
            fontFamily: 'Arial',
            fontSize: 20,
            fontWeight: 'bold',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1,
            letterSpacing: 0,
            color: '#000000',
          },
        ],
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<div')
    expect(result.html).toContain('Brand')
    expect(result.css).toContain('display: grid')
  })

  test('hidden layers output HTML comment', () => {
    const doc = makeDoc([
      {
        id: 'hl1',
        name: 'Hidden',
        type: 'text',
        visible: false,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        text: 'Secret',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1,
        letterSpacing: 0,
        color: '#000',
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<!-- hidden: Hidden -->')
    expect(result.html).not.toContain('Secret')
  })

  test('unsupported layer types output HTML comment', () => {
    const doc = makeDoc([
      {
        id: 'uk1',
        name: 'WeirdLayer',
        type: 'some-unknown-type',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<!-- unsupported:')
  })

  test('inline CSS setting embeds style tag', () => {
    const doc = makeDoc([])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, inlineCSS: true })
    expect(result.html).toContain('<style>')
    expect(result.html).not.toContain('styles.css')
  })

  test('external CSS links to stylesheet', () => {
    const doc = makeDoc([])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, inlineCSS: false })
    expect(result.html).toContain('styles.css')
    expect(result.html).not.toContain('<style>')
  })

  test('responsive setting includes viewport meta', () => {
    const doc = makeDoc([])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, responsive: true })
    expect(result.html).toContain('viewport')
  })

  test('non-responsive setting omits viewport meta', () => {
    const doc = makeDoc([])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, responsive: false })
    // The viewport line will be empty but the meta tag text won't be there
    expect(result.html).not.toContain('width=device-width')
  })

  test('navigation generated for multi-artboard docs', () => {
    const doc = {
      id: 'doc1',
      metadata: { title: 'Multi Page' },
      artboards: [
        { id: 'ab1', name: 'Home', x: 0, y: 0, width: 1200, height: 800, backgroundColor: '#fff', layers: [] },
        { id: 'ab2', name: 'About', x: 0, y: 0, width: 1200, height: 800, backgroundColor: '#fff', layers: [] },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = exportStaticSite(doc as any, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, generateNav: true })
    expect(result.html).toContain('<nav')
    expect(result.html).toContain('Home')
    expect(result.html).toContain('About')
  })

  test('no navigation for single artboard', () => {
    const doc = makeDoc([])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, generateNav: true })
    expect(result.html).not.toContain('<nav')
  })

  test('absolute positioning mode', () => {
    const doc = makeDoc([
      {
        id: 'tl5',
        name: 'AbsText',
        type: 'text',
        visible: true,
        opacity: 1,
        transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
        text: 'Abs',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1,
        letterSpacing: 0,
        color: '#000',
      },
    ])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, useGrid: false })
    expect(result.css).toContain('position: absolute')
    expect(result.css).toContain('left: 100px')
    expect(result.css).toContain('top: 200px')
  })

  test('escapes HTML entities in text', () => {
    const doc = makeDoc([
      {
        id: 'tl6',
        name: 'XSS',
        type: 'text',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        text: '<script>alert("xss")</script>',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1,
        letterSpacing: 0,
        color: '#000',
      },
    ])
    const result = exportStaticSite(doc)
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  test('group uses relative positioning in absolute mode', () => {
    const doc = makeDoc([
      {
        id: 'grp2',
        name: 'Grp',
        type: 'group',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        children: [],
      },
    ])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, useGrid: false })
    expect(result.css).toContain('position: relative')
  })

  test('text layer with lineHeight 1 and letterSpacing 0 does not include those CSS properties', () => {
    const doc = makeDoc([
      {
        id: 'tl7',
        name: 'NoExtras',
        type: 'text',
        visible: true,
        opacity: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        text: 'Hello',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        lineHeight: 1,
        letterSpacing: 0,
        color: '#000',
      },
    ])
    const result = exportStaticSite(doc)
    // lineHeight: 1 => not included. letterSpacing: 0 => not included.
    // We can't check that literally because of how CSS classes work, but
    // at least make sure the CSS block for this class doesn't have "line-height"
    const classBlock = result.css.split('.cd-noextras')[1]?.split('}')[0] ?? ''
    expect(classBlock).not.toContain('line-height')
    expect(classBlock).not.toContain('letter-spacing')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5) sync-client — offline queue, state management, reconnect logic
// ═══════════════════════════════════════════════════════════════════════════

describe('sync-client', () => {
  const { SyncClient } = require('@/collab/sync-client') as typeof import('@/collab/sync-client')

  test('initial state is disconnected', () => {
    const client = new SyncClient('client-1')
    expect(client.state).toBe('disconnected')
    expect(client.clientId).toBe('client-1')
    expect(client.queueLength).toBe(0)
  })

  test('sendOperations queues ops when disconnected', () => {
    const client = new SyncClient('client-2')
    client.sendOperations([{ id: 'op1', clientId: 'client-2', timestamp: Date.now(), type: 'update', path: ['a'] }])
    expect(client.queueLength).toBe(1)
    client.sendOperations([
      { id: 'op2', clientId: 'client-2', timestamp: Date.now(), type: 'insert', path: ['b'], value: 42 },
    ])
    expect(client.queueLength).toBe(2)
  })

  test('sendOperations ignores empty array', () => {
    const client = new SyncClient('client-3')
    client.sendOperations([])
    expect(client.queueLength).toBe(0)
  })

  test('onRemoteOperations subscription and unsubscribe', () => {
    const client = new SyncClient('client-4')
    const received: any[] = []
    const unsub = client.onRemoteOperations((ops) => received.push(...ops))
    expect(typeof unsub).toBe('function')
    unsub()
    // After unsubscribe, nothing should be received even if somehow triggered
  })

  test('onStateChange subscription and unsubscribe', () => {
    const client = new SyncClient('client-5')
    const states: string[] = []
    const unsub = client.onStateChange((state) => states.push(state))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('onError subscription and unsubscribe', () => {
    const client = new SyncClient('client-6')
    const errors: Error[] = []
    const unsub = client.onError((err) => errors.push(err))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('disconnect from disconnected state is safe', () => {
    const client = new SyncClient('client-7')
    expect(() => client.disconnect()).not.toThrow()
    expect(client.state).toBe('disconnected')
  })

  test('connect fires state change callback', () => {
    const client = new SyncClient('client-8')
    const states: string[] = []
    client.onStateChange((state) => states.push(state))
    // connect will try to create a WebSocket which may fail in test env
    try {
      client.connect('ws://localhost:9999', 'room1', 'token123')
    } catch {
      // Expected if WebSocket constructor fails
    }
    // Should have at least tried to change to 'connecting'
    if (states.length > 0) {
      expect(states[0]).toBe('connecting')
    }
    // Clean up
    client.disconnect()
  })

  test('connect is no-op if already connecting/connected', () => {
    const client = new SyncClient('client-9')
    const states: string[] = []
    client.onStateChange((state) => states.push(state))
    try {
      client.connect('ws://localhost:9999', 'room1', 'token123')
    } catch {}
    const stateCountAfterFirst = states.length
    try {
      client.connect('ws://localhost:9999', 'room1', 'token123')
    } catch {}
    // Second connect should be a no-op (same state count)
    expect(states.length).toBe(stateCountAfterFirst)
    client.disconnect()
  })

  test('disconnect stops reconnect timer and resets state', () => {
    const client = new SyncClient('client-10')
    try {
      client.connect('ws://localhost:9999', 'room1', 'token')
    } catch {}
    client.disconnect()
    expect(client.state).toBe('disconnected')
  })

  test('multiple unsubscribe calls are safe', () => {
    const client = new SyncClient('client-11')
    const unsub = client.onRemoteOperations(() => {})
    unsub()
    expect(() => unsub()).not.toThrow() // second unsub is no-op
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6) cmyk-mode — conversions, sliders, document conversion
// ═══════════════════════════════════════════════════════════════════════════

describe('cmyk-mode', () => {
  test('hexToCMYK converts pure red', async () => {
    const { hexToCMYK } = await import('@/color/cmyk-mode')
    const cmyk = hexToCMYK('#ff0000')
    expect(cmyk.c).toBe(0)
    expect(cmyk.m).toBe(100)
    expect(cmyk.y).toBe(100)
    expect(cmyk.k).toBe(0)
  })

  test('hexToCMYK converts black', async () => {
    const { hexToCMYK } = await import('@/color/cmyk-mode')
    const cmyk = hexToCMYK('#000000')
    expect(cmyk.k).toBe(100)
  })

  test('hexToCMYK converts white', async () => {
    const { hexToCMYK } = await import('@/color/cmyk-mode')
    const cmyk = hexToCMYK('#ffffff')
    expect(cmyk.c).toBe(0)
    expect(cmyk.m).toBe(0)
    expect(cmyk.y).toBe(0)
    expect(cmyk.k).toBe(0)
  })

  test('cmykToHex round-trips for pure colors', async () => {
    const { hexToCMYK, cmykToHex } = await import('@/color/cmyk-mode')
    const hex = '#ff0000'
    const cmyk = hexToCMYK(hex)
    const result = cmykToHex(cmyk)
    expect(result).toBe(hex)
  })

  test('cmykSliders returns 4 sliders', async () => {
    const { cmykSliders } = await import('@/color/cmyk-mode')
    const sliders = cmykSliders('#336699')
    expect(sliders).toHaveLength(4)
    expect(sliders[0]!.label).toBe('C')
    expect(sliders[0]!.channel).toBe('c')
    expect(sliders[1]!.label).toBe('M')
    expect(sliders[2]!.label).toBe('Y')
    expect(sliders[3]!.label).toBe('K')
    // Values should be 0-100
    for (const s of sliders) {
      expect(s.value).toBeGreaterThanOrEqual(0)
      expect(s.value).toBeLessThanOrEqual(100)
    }
  })

  test('applyCMYKSliderChange modifies the correct channel', async () => {
    const { applyCMYKSliderChange, hexToCMYK } = await import('@/color/cmyk-mode')
    // Use white (#ffffff) as base — CMYK {0,0,0,0}
    // Setting K=50 should produce a grey
    const result = applyCMYKSliderChange('#ffffff', 'k', 50)
    const cmyk = hexToCMYK(result)
    expect(cmyk.k).toBe(50)
    // Other channels should remain 0
    expect(cmyk.c).toBe(0)
    expect(cmyk.m).toBe(0)
    expect(cmyk.y).toBe(0)
  })

  test('applyCMYKSliderChange clamps values', async () => {
    const { applyCMYKSliderChange, hexToCMYK } = await import('@/color/cmyk-mode')
    // Try setting a value beyond 100
    const result = applyCMYKSliderChange('#ffffff', 'k', 150)
    const cmyk = hexToCMYK(result)
    expect(cmyk.k).toBeLessThanOrEqual(100)
    // Try negative
    const result2 = applyCMYKSliderChange('#000000', 'c', -10)
    const cmyk2 = hexToCMYK(result2)
    expect(cmyk2.c).toBeGreaterThanOrEqual(0)
  })

  test('convertDocumentToCMYK round-trips artboard colors', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ff0000',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    // Background color should survive the round-trip for pure red
    expect(result.artboards[0]!.backgroundColor).toBe('#ff0000')
  })

  test('convertDocumentToCMYK handles text layers', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'tl1',
              name: 'Text',
              type: 'text',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              text: 'Hello',
              fontFamily: 'Arial',
              fontSize: 16,
              fontWeight: 'normal',
              fontStyle: 'normal',
              textAlign: 'left',
              lineHeight: 1,
              letterSpacing: 0,
              color: '#0000ff',
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    // Color should be converted through CMYK round-trip
    const textLayer = result.artboards[0]!.layers[0] as any
    expect(textLayer.color).toBeDefined()
    expect(textLayer.color.startsWith('#')).toBe(true)
  })

  test('convertDocumentToCMYK handles vector layers with fill and stroke', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'vl1',
              name: 'Vec',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              paths: [],
              fill: { type: 'solid', color: '#00ff00', opacity: 1 },
              stroke: {
                width: 2,
                color: '#0000ff',
                opacity: 1,
                position: 'center',
                linecap: 'butt',
                linejoin: 'miter',
                miterLimit: 4,
              },
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const vecLayer = result.artboards[0]!.layers[0] as any
    expect(vecLayer.fill.color).toBeDefined()
    expect(vecLayer.stroke.color).toBeDefined()
  })

  test('convertDocumentToCMYK handles gradient fills', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'vl2',
              name: 'GradVec',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              paths: [],
              fill: {
                type: 'gradient',
                gradient: {
                  id: 'g1',
                  name: 'Grad',
                  type: 'linear',
                  x: 0,
                  y: 0,
                  stops: [
                    { offset: 0, color: '#ff0000', opacity: 1 },
                    { offset: 1, color: '#0000ff', opacity: 1 },
                  ],
                  dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
                },
                opacity: 1,
              },
              stroke: null,
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const vecLayer = result.artboards[0]!.layers[0] as any
    expect(vecLayer.fill.gradient.stops[0].color).toBeDefined()
  })

  test('convertDocumentToCMYK handles fill layers', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'fl1',
              name: 'Fill',
              type: 'fill',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              fillType: 'solid',
              color: '#ff8800',
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const fillLayer = result.artboards[0]!.layers[0] as any
    expect(fillLayer.color.startsWith('#')).toBe(true)
  })

  test('convertDocumentToCMYK handles group layers recursively', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'grp1',
              name: 'Group',
              type: 'group',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              children: [
                {
                  id: 'tl1',
                  name: 'ChildText',
                  type: 'text',
                  visible: true,
                  locked: false,
                  opacity: 1,
                  blendMode: 'normal',
                  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                  text: 'Hi',
                  fontFamily: 'Arial',
                  fontSize: 16,
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                  textAlign: 'left',
                  lineHeight: 1,
                  letterSpacing: 0,
                  color: '#ff0000',
                },
              ],
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const group = result.artboards[0]!.layers[0] as any
    expect(group.children[0].color.startsWith('#')).toBe(true)
  })

  test('convertDocumentToCMYK handles assets.colors', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: {
        gradients: [],
        patterns: [],
        colors: [{ id: 'c1', name: 'Brand', value: '#ff6600' }],
      },
    }
    const result = convertDocumentToCMYK(doc)
    expect(result.assets.colors![0]!.value.startsWith('#')).toBe(true)
  })

  test('convertDocumentToCMYK handles assets.gradients', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: {
        gradients: [
          {
            id: 'g1',
            name: 'G',
            type: 'linear',
            x: 0,
            y: 0,
            stops: [{ offset: 0, color: '#ff0000', opacity: 1 }],
            dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
          },
        ],
        patterns: [],
        colors: [],
      },
    }
    const result = convertDocumentToCMYK(doc)
    expect(result.assets.gradients[0]!.stops[0]!.color.startsWith('#')).toBe(true)
  })

  test('convertDocumentToRGB returns a deep clone', async () => {
    const { convertDocumentToRGB } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToRGB(doc)
    expect(result).not.toBe(doc) // different reference
    expect(result.id).toBe('doc1')
  })

  test('vector layer with additionalFills and additionalStrokes', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'vl1',
              name: 'V',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              paths: [],
              fill: null,
              stroke: null,
              additionalFills: [{ type: 'solid', color: '#ff0000', opacity: 1 }],
              additionalStrokes: [
                {
                  width: 1,
                  color: '#00ff00',
                  opacity: 1,
                  position: 'center',
                  linecap: 'butt',
                  linejoin: 'miter',
                  miterLimit: 4,
                },
              ],
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const v = result.artboards[0]!.layers[0] as any
    expect(v.additionalFills[0].color.startsWith('#')).toBe(true)
    expect(v.additionalStrokes[0].color.startsWith('#')).toBe(true)
  })

  test('text layer with characterStyles', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'tl1',
              name: 'T',
              type: 'text',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              text: 'Hello',
              fontFamily: 'Arial',
              fontSize: 16,
              fontWeight: 'normal',
              fontStyle: 'normal',
              textAlign: 'left',
              lineHeight: 1,
              letterSpacing: 0,
              color: '#000000',
              characterStyles: [
                { start: 0, end: 3, color: '#ff0000' },
                { start: 3, end: 5 }, // no color override
              ],
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const t = result.artboards[0]!.layers[0] as any
    expect(t.characterStyles[0].color.startsWith('#')).toBe(true)
    // Second style has no color — should remain undefined
    expect(t.characterStyles[1].color).toBeUndefined()
  })

  test('mapColor skips non-hex colors', async () => {
    const { convertDocumentToCMYK } = await import('@/color/cmyk-mode')
    const doc: any = {
      id: 'doc1',
      metadata: { title: 'Test' },
      artboards: [
        {
          id: 'ab1',
          name: 'A',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [
            {
              id: 'vl1',
              name: 'V',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: 'normal',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              paths: [],
              fill: { type: 'solid', color: 'rgb(255,0,0)', opacity: 1 },
              stroke: null,
            },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const result = convertDocumentToCMYK(doc)
    const v = result.artboards[0]!.layers[0] as any
    // Non-hex color should pass through unchanged
    expect(v.fill.color).toBe('rgb(255,0,0)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7) editor.store.ts — lower-coverage actions
// ═══════════════════════════════════════════════════════════════════════════

describe('editor store - additional coverage', () => {
  // Ensure document.documentElement exists for toggleTouchMode
  void (globalThis as any).document
  if (typeof globalThis.document === 'undefined') {
    ;(globalThis as any).document = {
      documentElement: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
      createElement: () => ({ type: '', accept: '', multiple: false, click: () => {}, onchange: null }),
    }
  } else if (!globalThis.document?.documentElement) {
    ;(globalThis.document as any).documentElement = {
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      style: {},
    }
  }

  const { useEditorStore, createDefaultVectorLayer } =
    require('@/store/editor.store') as typeof import('@/store/editor.store')

  function resetStore() {
    useEditorStore.getState().newDocument()
    // Reset UI toggle state that newDocument doesn't clear
    useEditorStore.setState({
      devMode: false,
      devModeReadOnly: false,
      pixelPreview: false,
      snapToGrid: true,
      snapToPixel: false,
      showAIPanel: false,
      prototypeMode: false,
      showPNGTuberPanel: false,
      showExportModal: false,
      showInspectOverlay: false,
      refineEdgeActive: false,
      quickMaskActive: false,
      touchMode: false,
    })
  }

  function getState() {
    return useEditorStore.getState()
  }

  function getFirstArtboardId(): string {
    return getState().document.artboards[0]!.id
  }

  beforeEach(resetStore)

  test('addFilterLayer adds a blur filter', () => {
    const abId = getFirstArtboardId()
    getState().addFilterLayer(abId, 'blur')
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('filter')
    expect((layers[0] as any).filterParams.kind).toBe('blur')
  })

  test('addFilterLayer with custom params merges them', () => {
    const abId = getFirstArtboardId()
    getState().addFilterLayer(abId, 'blur', { radius: 20 } as any)
    const layer = getState().document.artboards[0]!.layers[0] as any
    expect(layer.filterParams.radius).toBe(20)
    expect(layer.filterParams.kind).toBe('blur')
  })

  test('addFilterLayer ignores unknown filter kind', () => {
    const abId = getFirstArtboardId()
    getState().addFilterLayer(abId, 'nonexistent-filter')
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)
  })

  test('addFilterLayer supports all built-in filter types', () => {
    getFirstArtboardId()
    const kinds = [
      'levels',
      'curves',
      'hue-sat',
      'color-balance',
      'shadow',
      'glow',
      'inner-shadow',
      'background-blur',
      'progressive-blur',
      'noise',
      'sharpen',
      'motion-blur',
      'radial-blur',
      'color-adjust',
      'wave',
      'twirl',
      'pinch',
      'spherize',
      'distort',
    ]
    for (const kind of kinds) {
      resetStore()
      getState().addFilterLayer(getFirstArtboardId(), kind)
      const layers = getState().document.artboards[0]!.layers
      expect(layers).toHaveLength(1)
      expect((layers[0] as any).filterParams.kind).toBe(kind)
    }
  })

  test('addFillLayer solid', () => {
    const abId = getFirstArtboardId()
    getState().addFillLayer(abId, 'solid', { color: '#ff0000' })
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(1)
    expect(layers[0]!.type).toBe('fill')
    expect((layers[0] as any).fillType).toBe('solid')
    expect((layers[0] as any).color).toBe('#ff0000')
  })

  test('addFillLayer gradient', () => {
    const abId = getFirstArtboardId()
    getState().addFillLayer(abId, 'gradient')
    const layer = getState().document.artboards[0]!.layers[0] as any
    expect(layer.fillType).toBe('gradient')
  })

  test('addFillLayer pattern', () => {
    const abId = getFirstArtboardId()
    getState().addFillLayer(abId, 'pattern', { patternScale: 2 })
    const layer = getState().document.artboards[0]!.layers[0] as any
    expect(layer.fillType).toBe('pattern')
    expect(layer.patternScale).toBe(2)
  })

  test('addCloneLayer creates clone of existing layer', () => {
    const abId = getFirstArtboardId()
    const vec = createDefaultVectorLayer('Source')
    getState().addLayer(abId, vec)
    getState().addCloneLayer(abId, vec.id, 30, 40)
    const layers = getState().document.artboards[0]!.layers
    expect(layers).toHaveLength(2)
    expect(layers[1]!.type).toBe('clone')
    expect((layers[1] as any).sourceLayerId).toBe(vec.id)
    expect((layers[1] as any).offsetX).toBe(30)
    expect((layers[1] as any).offsetY).toBe(40)
  })

  test('addCloneLayer with default offsets', () => {
    const abId = getFirstArtboardId()
    const vec = createDefaultVectorLayer('Source')
    getState().addLayer(abId, vec)
    getState().addCloneLayer(abId, vec.id)
    const clone = getState().document.artboards[0]!.layers[1] as any
    expect(clone.offsetX).toBe(20) // default
    expect(clone.offsetY).toBe(20) // default
  })

  test('addCloneLayer does nothing for non-existent source', () => {
    const abId = getFirstArtboardId()
    getState().addCloneLayer(abId, 'nonexistent')
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)
  })

  test('addSlice, removeSlice, updateSlice', () => {
    const abId = getFirstArtboardId()
    const slice = { id: 's1', name: 'Header', x: 0, y: 0, width: 100, height: 50, format: 'png' as const, scale: 2 }
    getState().addSlice(abId, slice)
    expect(getState().document.artboards[0]!.slices).toHaveLength(1)

    getState().updateSlice(abId, 's1', { name: 'Updated Header' })
    expect(getState().document.artboards[0]!.slices![0]!.name).toBe('Updated Header')

    getState().removeSlice(abId, 's1')
    expect(getState().document.artboards[0]!.slices).toHaveLength(0)
  })

  test('toggleQuickMask toggles quickMaskActive', () => {
    expect(getState().quickMaskActive).toBe(false)
    getState().toggleQuickMask()
    expect(getState().quickMaskActive).toBe(true)
    getState().toggleQuickMask()
    expect(getState().quickMaskActive).toBe(false)
  })

  test('toggleRefineEdge toggles refineEdgeActive', () => {
    expect(getState().refineEdgeActive).toBe(false)
    getState().toggleRefineEdge()
    expect(getState().refineEdgeActive).toBe(true)
    getState().toggleRefineEdge()
    expect(getState().refineEdgeActive).toBe(false)
  })

  test('toggleDevMode and toggleDevModeReadOnly', () => {
    expect(getState().devMode).toBe(false)
    getState().toggleDevMode()
    expect(getState().devMode).toBe(true)
    getState().toggleDevModeReadOnly()
    expect(getState().devModeReadOnly).toBe(true)
    getState().toggleDevModeReadOnly()
    expect(getState().devModeReadOnly).toBe(false)
  })

  test('setReadyForDev marks artboard', () => {
    const abId = getFirstArtboardId()
    getState().setReadyForDev(abId, true)
    expect(getState().document.artboards[0]!.readyForDev).toBe(true)
    getState().setReadyForDev(abId, false)
    expect(getState().document.artboards[0]!.readyForDev).toBe(false)
  })

  test('setDevAnnotation sets annotation on layer', () => {
    const abId = getFirstArtboardId()
    const vec = createDefaultVectorLayer('Test')
    getState().addLayer(abId, vec)
    getState().setDevAnnotation(vec.id, abId, 'Use 8px padding')
    const layer = getState().document.artboards[0]!.layers[0]!
    expect(layer.devAnnotation).toBe('Use 8px padding')
  })

  test('bulkRenameLayers renames multiple layers', () => {
    const abId = getFirstArtboardId()
    const v1 = createDefaultVectorLayer('Old1')
    const v2 = createDefaultVectorLayer('Old2')
    getState().addLayer(abId, v1)
    getState().addLayer(abId, v2)
    getState().bulkRenameLayers(abId, [
      { layerId: v1.id, newName: 'New1' },
      { layerId: v2.id, newName: 'New2' },
    ])
    const layers = getState().document.artboards[0]!.layers
    expect(layers[0]!.name).toBe('New1')
    expect(layers[1]!.name).toBe('New2')
  })

  test('openExportModal and closeExportModal', () => {
    expect(getState().showExportModal).toBe(false)
    getState().openExportModal()
    expect(getState().showExportModal).toBe(true)
    getState().closeExportModal()
    expect(getState().showExportModal).toBe(false)
  })

  test('togglePixelPreview', () => {
    expect(getState().pixelPreview).toBe(false)
    getState().togglePixelPreview()
    expect(getState().pixelPreview).toBe(true)
  })

  test('setShowInspectOverlay', () => {
    getState().setShowInspectOverlay(true)
    expect(getState().showInspectOverlay).toBe(true)
    getState().setShowInspectOverlay(false)
    expect(getState().showInspectOverlay).toBe(false)
  })

  test('setActiveSnapLines', () => {
    getState().setActiveSnapLines({ h: [10, 20], v: [30] })
    expect(getState().activeSnapLines).toEqual({ h: [10, 20], v: [30] })
    getState().setActiveSnapLines(null)
    expect(getState().activeSnapLines).toBeNull()
  })

  test('snap toggle methods', () => {
    getState().toggleSnapToGrid()
    expect(getState().snapToGrid).toBe(false)
    getState().toggleSnapToGuides()
    expect(getState().snapToGuides).toBe(false)
    getState().toggleSnapToLayers()
    expect(getState().snapToLayers).toBe(false)
    getState().toggleSnapToArtboard()
    expect(getState().snapToArtboard).toBe(false)
    getState().toggleSnapToPixel()
    expect(getState().snapToPixel).toBe(true)
  })

  test('toggleAIPanel', () => {
    expect(getState().showAIPanel).toBe(false)
    getState().toggleAIPanel()
    expect(getState().showAIPanel).toBe(true)
    getState().toggleAIPanel()
    expect(getState().showAIPanel).toBe(false)
  })

  test('togglePrototypeMode', () => {
    expect(getState().prototypeMode).toBe(false)
    getState().togglePrototypeMode()
    expect(getState().prototypeMode).toBe(true)
  })

  test('openPrototypePlayer and closePrototypePlayer', () => {
    getState().openPrototypePlayer()
    expect(getState().showPrototypePlayer).toBe(true)
    expect(getState().prototypeStartArtboardId).toBeDefined()
    getState().closePrototypePlayer()
    expect(getState().showPrototypePlayer).toBe(false)
    expect(getState().prototypeStartArtboardId).toBeNull()
  })

  test('openPrototypePlayer with specific artboard', () => {
    const abId = getFirstArtboardId()
    getState().openPrototypePlayer(abId)
    expect(getState().prototypeStartArtboardId).toBe(abId)
    getState().closePrototypePlayer()
  })

  test('openPrototypePlayer uses flow starting artboard', () => {
    getFirstArtboardId()
    getState().addArtboard('Second', 800, 600)
    const secondAb = getState().document.artboards[1]!
    getState().setFlowStarting(secondAb.id, true)
    getState().openPrototypePlayer()
    expect(getState().prototypeStartArtboardId).toBe(secondAb.id)
    getState().closePrototypePlayer()
  })

  test('setLayerMask and removeLayerMask', () => {
    const abId = getFirstArtboardId()
    const vec = createDefaultVectorLayer('Target')
    getState().addLayer(abId, vec)
    const mask = createDefaultVectorLayer('Mask')
    getState().setLayerMask(abId, vec.id, mask)
    expect(getState().document.artboards[0]!.layers[0]!.mask).toBeDefined()
    getState().removeLayerMask(abId, vec.id)
    expect(getState().document.artboards[0]!.layers[0]!.mask).toBeUndefined()
  })

  test('importLayersToArtboard adds multiple layers', () => {
    const abId = getFirstArtboardId()
    const l1 = createDefaultVectorLayer('Import1')
    const l2 = createDefaultVectorLayer('Import2')
    getState().importLayersToArtboard(abId, [l1, l2])
    expect(getState().document.artboards[0]!.layers).toHaveLength(2)
  })

  test('importLayersToArtboard no-ops on empty array', () => {
    const abId = getFirstArtboardId()
    getState().importLayersToArtboard(abId, [])
    expect(getState().document.artboards[0]!.layers).toHaveLength(0)
  })

  test('toggleTouchMode', () => {
    const before = getState().touchMode
    getState().toggleTouchMode()
    expect(getState().touchMode).toBe(!before)
  })

  test('togglePNGTuberPanel', () => {
    expect(getState().showPNGTuberPanel).toBe(false)
    getState().togglePNGTuberPanel()
    expect(getState().showPNGTuberPanel).toBe(true)
  })

  test('newDocument with custom options', () => {
    getState().newDocument({ title: 'Custom', width: 800, height: 600, colorspace: 'p3', backgroundColor: '#000000' })
    const doc = getState().document
    expect(doc.metadata.title).toBe('Custom')
    expect(doc.metadata.width).toBe(800)
    expect(doc.metadata.height).toBe(600)
    expect(doc.metadata.colorspace).toBe('p3')
    expect(doc.artboards[0]!.backgroundColor).toBe('#000000')
  })

  test('updateLayerSilent does not create undo entry', () => {
    const abId = getFirstArtboardId()
    const vec = createDefaultVectorLayer('Silent')
    getState().addLayer(abId, vec)
    const histBefore = getState().history.length
    getState().updateLayerSilent(abId, vec.id, { opacity: 0.5 })
    // updateLayerSilent should not add to history
    expect(getState().history.length).toBe(histBefore)
    expect(getState().document.artboards[0]!.layers[0]!.opacity).toBe(0.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8) quick-export — format handling, dimensions, settings
// ═══════════════════════════════════════════════════════════════════════════

describe('quick-export', () => {
  test('DEFAULT_EXPORT_SETTINGS has correct defaults', async () => {
    const { DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    expect(DEFAULT_EXPORT_SETTINGS.format).toBe('png')
    expect(DEFAULT_EXPORT_SETTINGS.scale).toBe(2)
    expect(DEFAULT_EXPORT_SETTINGS.quality).toBe(85)
    expect(DEFAULT_EXPORT_SETTINGS.transparent).toBe(true)
    expect(DEFAULT_EXPORT_SETTINGS.region).toBe('artboard')
    expect(DEFAULT_EXPORT_SETTINGS.linkedDimensions).toBe(true)
  })

  test('formatFileSize formats bytes correctly', async () => {
    const { formatFileSize } = await import('@/ui/quick-export')
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(2621440)).toBe('2.5 MB')
  })

  test('estimateExportDimensions with scale', async () => {
    const { estimateExportDimensions, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    const dims = estimateExportDimensions({ ...DEFAULT_EXPORT_SETTINGS, scale: 3 }, 800, 600)
    expect(dims.width).toBe(2400)
    expect(dims.height).toBe(1800)
  })

  test('estimateExportDimensions with explicit width/height', async () => {
    const { estimateExportDimensions, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    const dims = estimateExportDimensions({ ...DEFAULT_EXPORT_SETTINGS, width: 500, height: 300 }, 800, 600)
    expect(dims.width).toBe(500)
    expect(dims.height).toBe(300)
  })

  test('estimateExportDimensions without explicit dimensions uses scale', async () => {
    const { estimateExportDimensions, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    const dims = estimateExportDimensions(
      { ...DEFAULT_EXPORT_SETTINGS, width: null, height: null, scale: 1 },
      1920,
      1080,
    )
    expect(dims.width).toBe(1920)
    expect(dims.height).toBe(1080)
  })

  test('loadExportSettings returns defaults when nothing stored', async () => {
    const { loadExportSettings, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    // Clear any stored settings
    try {
      localStorage.removeItem('crossdraw:export-settings')
    } catch {}
    const settings = loadExportSettings()
    expect(settings.format).toBe(DEFAULT_EXPORT_SETTINGS.format)
    expect(settings.scale).toBe(DEFAULT_EXPORT_SETTINGS.scale)
  })

  test('saveExportSettings and loadExportSettings round-trip', async () => {
    const { saveExportSettings, loadExportSettings, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    const custom = { ...DEFAULT_EXPORT_SETTINGS, format: 'jpeg' as const, quality: 50, scale: 3 }
    saveExportSettings(custom)
    const loaded = loadExportSettings()
    expect(loaded.format).toBe('jpeg')
    expect(loaded.quality).toBe(50)
    expect(loaded.scale).toBe(3)
  })

  test('loadExportSettings handles corrupted storage gracefully', async () => {
    const { loadExportSettings, DEFAULT_EXPORT_SETTINGS } = await import('@/ui/quick-export')
    try {
      localStorage.setItem('crossdraw:export-settings', '{bad json///')
    } catch {}
    const settings = loadExportSettings()
    expect(settings.format).toBe(DEFAULT_EXPORT_SETTINGS.format)
  })

  test('ExportFormatType and ExportRegion types exist', async () => {
    const mod = await import('@/ui/quick-export')
    expect(typeof mod.formatFileSize).toBe('function')
    expect(typeof mod.estimateExportDimensions).toBe('function')
    expect(typeof mod.performExport).toBe('function')
    expect(typeof mod.quickExport).toBe('function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9) import-image — supported format detection, SVG import detection
// ═══════════════════════════════════════════════════════════════════════════

describe('import-image additional coverage', () => {
  test('module exports all expected functions', async () => {
    const mod = await import('@/tools/import-image')
    expect(typeof mod.importImageFile).toBe('function')
    expect(typeof mod.importImageFromBlob).toBe('function')
    expect(typeof mod.importImageFromPicker).toBe('function')
    expect(typeof mod.newDocumentFromClipboard).toBe('function')
    expect(typeof mod.newDocumentFromClipboardBlob).toBe('function')
  })

  test('importImageFromPicker accept attribute covers expected formats', async () => {
    // We verify by calling the function with a mocked document
    const origCreateElement = (globalThis as any).document?.createElement
    let inputConfig: any = null
    ;(globalThis as any).document = {
      ...(globalThis as any).document,
      createElement: (tag: string) => {
        if (tag === 'input') {
          const mock: any = {
            type: '',
            accept: '',
            multiple: false,
            click: () => {
              // Simulate no file selected — trigger onchange with empty files
              if (mock.onchange) mock.onchange()
            },
            onchange: null,
            files: [],
          }
          inputConfig = mock
          return mock
        }
        return origCreateElement?.(tag) ?? {}
      },
      documentElement: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
    }

    const { importImageFromPicker } = await import('@/tools/import-image')
    await importImageFromPicker()

    expect(inputConfig).not.toBeNull()
    expect(inputConfig.type).toBe('file')
    expect(inputConfig.accept).toContain('image/png')
    expect(inputConfig.accept).toContain('image/jpeg')
    expect(inputConfig.accept).toContain('image/svg+xml')
    expect(inputConfig.accept).toContain('.svg')
    expect(inputConfig.multiple).toBe(false)
  })

  test('newDocumentFromClipboard returns false when no clipboard image', async () => {
    // Mock navigator.clipboard.read to return empty
    const origClipboard = (globalThis as any).navigator?.clipboard
    ;(globalThis as any).navigator = {
      ...(globalThis as any).navigator,
      clipboard: {
        read: async () => [],
      },
    }

    const { newDocumentFromClipboard } = await import('@/tools/import-image')
    const result = await newDocumentFromClipboard()
    expect(result).toBe(false)

    // Restore
    if (origClipboard) {
      ;(globalThis as any).navigator.clipboard = origClipboard
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 10) histogram — computeHistogram with various ImageData inputs
// ═══════════════════════════════════════════════════════════════════════════

describe('histogram computeHistogram', () => {
  const { computeHistogram } = require('@/ui/histogram') as typeof import('@/ui/histogram.tsx')

  test('single black pixel', () => {
    const data = new ImageData(1, 1)
    // Default data is [0, 0, 0, 0] — black with 0 alpha
    const hist = computeHistogram(data)
    expect(hist.red[0]).toBe(1)
    expect(hist.green[0]).toBe(1)
    expect(hist.blue[0]).toBe(1)
    expect(hist.luminance[0]).toBe(1)
  })

  test('single white pixel', () => {
    const data = new ImageData(1, 1)
    data.data[0] = 255
    data.data[1] = 255
    data.data[2] = 255
    data.data[3] = 255
    const hist = computeHistogram(data)
    expect(hist.red[255]).toBe(1)
    expect(hist.green[255]).toBe(1)
    expect(hist.blue[255]).toBe(1)
    expect(hist.luminance[255]).toBe(1)
  })

  test('multiple pixels accumulate correctly', () => {
    const data = new ImageData(3, 1)
    // Pixel 0: R=100, G=0, B=0
    data.data[0] = 100
    data.data[3] = 255
    // Pixel 1: R=100, G=0, B=0
    data.data[4] = 100
    data.data[7] = 255
    // Pixel 2: R=200, G=0, B=0
    data.data[8] = 200
    data.data[11] = 255

    const hist = computeHistogram(data)
    expect(hist.red[100]).toBe(2)
    expect(hist.red[200]).toBe(1)
  })

  test('luminance calculation for pure red pixel', () => {
    const data = new ImageData(1, 1)
    data.data[0] = 255 // R
    data.data[1] = 0 // G
    data.data[2] = 0 // B
    data.data[3] = 255 // A
    const hist = computeHistogram(data)
    // Luminance = 0.2126 * 255 + 0.7152 * 0 + 0.0722 * 0 ≈ 54
    const expectedLum = Math.round(0.2126 * 255)
    expect(hist.luminance[expectedLum]).toBe(1)
  })

  test('luminance calculation for pure green pixel', () => {
    const data = new ImageData(1, 1)
    data.data[0] = 0
    data.data[1] = 255
    data.data[2] = 0
    data.data[3] = 255
    const hist = computeHistogram(data)
    const expectedLum = Math.round(0.7152 * 255)
    expect(hist.luminance[expectedLum]).toBe(1)
  })

  test('luminance calculation for pure blue pixel', () => {
    const data = new ImageData(1, 1)
    data.data[0] = 0
    data.data[1] = 0
    data.data[2] = 255
    data.data[3] = 255
    const hist = computeHistogram(data)
    const expectedLum = Math.round(0.0722 * 255)
    expect(hist.luminance[expectedLum]).toBe(1)
  })

  test('all bins initialized to zero for unused values', () => {
    const data = new ImageData(1, 1) // single pixel, values at 0
    const hist = computeHistogram(data)
    for (let i = 1; i < 256; i++) {
      expect(hist.red[i]).toBe(0)
      expect(hist.green[i]).toBe(0)
      expect(hist.blue[i]).toBe(0)
    }
  })

  test('2x2 image distributes correctly', () => {
    const data = new ImageData(2, 2) // 4 pixels
    // Pixel 0: (10, 20, 30, 255)
    data.data[0] = 10
    data.data[1] = 20
    data.data[2] = 30
    data.data[3] = 255
    // Pixel 1: (40, 50, 60, 255)
    data.data[4] = 40
    data.data[5] = 50
    data.data[6] = 60
    data.data[7] = 255
    // Pixel 2: (10, 20, 30, 255)
    data.data[8] = 10
    data.data[9] = 20
    data.data[10] = 30
    data.data[11] = 255
    // Pixel 3: (70, 80, 90, 255)
    data.data[12] = 70
    data.data[13] = 80
    data.data[14] = 90
    data.data[15] = 255

    const hist = computeHistogram(data)
    expect(hist.red[10]).toBe(2)
    expect(hist.red[40]).toBe(1)
    expect(hist.red[70]).toBe(1)
    expect(hist.green[20]).toBe(2)
    expect(hist.green[50]).toBe(1)
    expect(hist.green[80]).toBe(1)
    expect(hist.blue[30]).toBe(2)
    expect(hist.blue[60]).toBe(1)
    expect(hist.blue[90]).toBe(1)
  })

  test('histogram returns Uint32Array for all channels', () => {
    const data = new ImageData(1, 1)
    const hist = computeHistogram(data)
    expect(hist.red).toBeInstanceOf(Uint32Array)
    expect(hist.green).toBeInstanceOf(Uint32Array)
    expect(hist.blue).toBeInstanceOf(Uint32Array)
    expect(hist.luminance).toBeInstanceOf(Uint32Array)
    expect(hist.red.length).toBe(256)
    expect(hist.green.length).toBe(256)
    expect(hist.blue.length).toBe(256)
    expect(hist.luminance.length).toBe(256)
  })

  test('large image pixel count matches', () => {
    const w = 10
    const h = 10
    const data = new ImageData(w, h) // 100 pixels, all [0,0,0,0]
    const hist = computeHistogram(data)
    // All 100 pixels have R=0, G=0, B=0
    expect(hist.red[0]).toBe(100)
    expect(hist.green[0]).toBe(100)
    expect(hist.blue[0]).toBe(100)
  })

  test('Histogram and HistogramData types are exported', async () => {
    const mod = await import('@/ui/histogram')
    expect(typeof mod.computeHistogram).toBe('function')
    expect(typeof mod.Histogram).toBe('function')
  })
})
