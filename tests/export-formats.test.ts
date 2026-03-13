import { describe, it, expect } from 'bun:test'
import { exportEPS, importEPS } from '@/io/eps-io'
import { isPSB, isPSD, exportPSB } from '@/io/psb-support'
import { isAVIFSupported, isHEIFSupported, resetSupportCache } from '@/io/avif-heif'
import type { DesignDocument, VectorLayer, RasterLayer, TextLayer } from '@/types'
import { v4 as uuid } from 'uuid'
import { storeRasterData } from '@/store/raster-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(width: number, height: number, data?: Uint8ClampedArray): ImageData {
  const pixelCount = width * height
  const d = data ?? new Uint8ClampedArray(pixelCount * 4)
  return {
    data: d,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeDoc(overrides?: Partial<DesignDocument>): DesignDocument {
  return {
    id: uuid(),
    metadata: {
      title: 'Test Document',
      author: 'Test',
      created: '2024-01-01T00:00:00Z',
      modified: '2024-01-01T00:00:00Z',
      colorspace: 'srgb',
      width: 200,
      height: 100,
    },
    artboards: [
      {
        id: uuid(),
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        backgroundColor: '#ffffff',
        layers: [],
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
    ...overrides,
  }
}

function makeVectorLayer(overrides?: Partial<VectorLayer>): VectorLayer {
  return {
    id: uuid(),
    name: 'Vector 1',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: uuid(),
        segments: [
          { type: 'move', x: 10, y: 20 },
          { type: 'line', x: 50, y: 20 },
          { type: 'line', x: 50, y: 60 },
          { type: 'close' },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function makeTextLayer(overrides?: Partial<TextLayer>): TextLayer {
  return {
    id: uuid(),
    name: 'Text 1',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 10, y: 30, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello World',
    fontFamily: 'Helvetica',
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

function makeRasterLayer(): RasterLayer {
  const chunkId = uuid()
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255])
  const imgData = makeImageData(2, 2, pixels)
  storeRasterData(chunkId, imgData)
  return {
    id: uuid(),
    name: 'Raster 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 5, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: 2,
    height: 2,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EPS Export
// ══════════════════════════════════════════════════════════════════════════════

describe('EPS Export', () => {
  it('should produce valid EPS header', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true)
  })

  it('should include BoundingBox comment', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps).toContain('%%BoundingBox: 0 0 200 100')
  })

  it('should include HiResBoundingBox comment', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps).toContain('%%HiResBoundingBox: 0 0 200 100')
  })

  it('should include Title comment', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps).toContain('%%Title: Test Document')
  })

  it('should include Creator comment', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps).toContain('%%Creator: Crossdraw')
  })

  it('should end with showpage and %%EOF', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    expect(eps).toContain('showpage')
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('should render background color', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    // White background: 1 1 1 setrgbcolor
    expect(eps).toContain('1 1 1 setrgbcolor')
    expect(eps).toContain('rectfill')
  })

  it('should render vector paths with moveto/lineto/closepath', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const eps = exportEPS(doc)

    expect(eps).toContain('moveto')
    expect(eps).toContain('lineto')
    expect(eps).toContain('closepath')
  })

  it('should set fill color for vector layers', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const eps = exportEPS(doc)
    // Red fill: 1 0 0 setrgbcolor
    expect(eps).toContain('1 0 0 setrgbcolor')
    expect(eps).toContain('fill')
  })

  it('should render stroke with setlinewidth', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [
      makeVectorLayer({
        fill: null,
        stroke: {
          width: 3,
          color: '#00ff00',
          opacity: 1,
          position: 'center',
          linecap: 'round',
          linejoin: 'bevel',
          miterLimit: 10,
        },
      }),
    ]
    const eps = exportEPS(doc)
    expect(eps).toContain('3 setlinewidth')
    expect(eps).toContain('1 setlinecap') // round
    expect(eps).toContain('2 setlinejoin') // bevel
    expect(eps).toContain('stroke')
  })

  it('should render dashed strokes', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [
      makeVectorLayer({
        fill: null,
        stroke: {
          width: 2,
          color: '#0000ff',
          opacity: 1,
          position: 'center',
          linecap: 'butt',
          linejoin: 'miter',
          miterLimit: 10,
          dasharray: [5, 3],
        },
      }),
    ]
    const eps = exportEPS(doc)
    expect(eps).toContain('[5 3] 0 setdash')
  })

  it('should render text with show command', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeTextLayer()]
    const eps = exportEPS(doc)
    expect(eps).toContain('findfont')
    expect(eps).toContain('scalefont setfont')
    expect(eps).toContain('(Hello World) show')
  })

  it('should escape special characters in text', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeTextLayer({ text: 'Hello (World)' })]
    const eps = exportEPS(doc)
    expect(eps).toContain('(Hello \\(World\\)) show')
  })

  it('should map font families to PostScript names', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeTextLayer({ fontFamily: 'Times New Roman', fontWeight: 'bold' })]
    const eps = exportEPS(doc)
    expect(eps).toContain('/Times-Bold findfont')
  })

  it('should render raster layers with colorimage', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeRasterLayer()]
    const eps = exportEPS(doc)
    expect(eps).toContain('colorimage')
  })

  it('should not render invisible layers', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer({ visible: false })]
    const eps = exportEPS(doc)
    // Should not contain path commands since layer is invisible
    expect(eps).not.toContain('moveto')
  })

  it('should render cubic curves as curveto', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [
      makeVectorLayer({
        paths: [
          {
            id: uuid(),
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'cubic', x: 100, y: 100, cp1x: 25, cp1y: 0, cp2x: 75, cp2y: 100 },
            ],
            closed: false,
          },
        ],
      }),
    ]
    const eps = exportEPS(doc)
    expect(eps).toContain('curveto')
  })

  it('should handle evenodd fill rule', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [
      makeVectorLayer({
        paths: [
          {
            id: uuid(),
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 100, y: 0 },
              { type: 'line', x: 100, y: 100 },
              { type: 'close' },
            ],
            closed: true,
            fillRule: 'evenodd',
          },
        ],
      }),
    ]
    const eps = exportEPS(doc)
    expect(eps).toContain('eofill')
  })

  it('should throw if no artboard found', () => {
    const doc = makeDoc()
    expect(() => exportEPS(doc, 'nonexistent')).toThrow('No artboard found')
  })

  it('should use gsave/grestore pairs', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const eps = exportEPS(doc)
    const gsaveCount = (eps.match(/gsave/g) || []).length
    const grestoreCount = (eps.match(/grestore/g) || []).length
    expect(gsaveCount).toBe(grestoreCount)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// EPS Import
// ══════════════════════════════════════════════════════════════════════════════

describe('EPS Import', () => {
  it('should extract BoundingBox dimensions', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 300 200
%%EndComments
showpage
%%EOF`
    const doc = importEPS(eps)
    expect(doc.metadata.width).toBe(300)
    expect(doc.metadata.height).toBe(200)
  })

  it('should use default dimensions when no BoundingBox', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%EndComments
showpage
%%EOF`
    const doc = importEPS(eps)
    expect(doc.metadata.width).toBe(612) // US Letter
    expect(doc.metadata.height).toBe(792)
  })

  it('should parse moveto/lineto/closepath into vector layers', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
newpath
10 90 moveto
50 90 lineto
50 50 lineto
closepath
1 0 0 setrgbcolor
fill
showpage
%%EOF`
    const doc = importEPS(eps)
    expect(doc.artboards[0]!.layers.length).toBe(1)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.type).toBe('vector')
    expect(layer.paths.length).toBe(1)
    expect(layer.paths[0]!.segments.length).toBe(4) // move, line, line, close
  })

  it('should parse fill color', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
0 1 0 setrgbcolor
newpath
10 90 moveto
50 90 lineto
closepath
fill
showpage
%%EOF`
    const doc = importEPS(eps)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill).not.toBeNull()
    expect(layer.fill!.color).toBe('#00ff00')
  })

  it('should parse stroke commands', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
0 0 1 setrgbcolor
2 setlinewidth
newpath
10 90 moveto
90 10 lineto
stroke
showpage
%%EOF`
    const doc = importEPS(eps)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.stroke).not.toBeNull()
    expect(layer.stroke!.color).toBe('#0000ff')
    expect(layer.stroke!.width).toBe(2)
  })

  it('should parse curveto as cubic segments', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
newpath
0 100 moveto
25 100 75 0 100 0 curveto
1 0 0 setrgbcolor
fill
showpage
%%EOF`
    const doc = importEPS(eps)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segments = layer.paths[0]!.segments
    const cubic = segments.find((s) => s.type === 'cubic')
    expect(cubic).toBeDefined()
    if (cubic && cubic.type === 'cubic') {
      expect(cubic.cp1x).toBe(25)
      expect(cubic.cp2x).toBe(75)
      expect(cubic.x).toBe(100)
    }
  })

  it('should handle eofill as evenodd fill rule', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
newpath
0 100 moveto
100 100 lineto
closepath
1 0 0 setrgbcolor
eofill
showpage
%%EOF`
    const doc = importEPS(eps)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.paths[0]!.fillRule).toBe('evenodd')
  })

  it('should create a valid DesignDocument', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
showpage
%%EOF`
    const doc = importEPS(eps)
    expect(doc.id).toBeDefined()
    expect(doc.metadata.title).toBe('EPS Import')
    expect(doc.artboards.length).toBe(1)
    expect(doc.assets).toBeDefined()
  })

  it('should handle multiple paths as separate layers', () => {
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 100 100
%%EndComments
1 0 0 setrgbcolor
newpath
0 100 moveto
50 100 lineto
closepath
fill
0 1 0 setrgbcolor
newpath
50 100 moveto
100 100 lineto
closepath
fill
showpage
%%EOF`
    const doc = importEPS(eps)
    expect(doc.artboards[0]!.layers.length).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// EPS Roundtrip
// ══════════════════════════════════════════════════════════════════════════════

describe('EPS Roundtrip', () => {
  it('should export and re-import preserving bounding box', () => {
    const doc = makeDoc()
    const eps = exportEPS(doc)
    const reimported = importEPS(eps)
    expect(reimported.metadata.width).toBe(200)
    expect(reimported.metadata.height).toBe(100)
  })

  it('should export and re-import preserving vector paths', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const eps = exportEPS(doc)
    const reimported = importEPS(eps)
    const layers = reimported.artboards[0]!.layers
    // Should have at least the fill layer (background rect may produce one too)
    const vectorLayers = layers.filter((l) => l.type === 'vector')
    expect(vectorLayers.length).toBeGreaterThanOrEqual(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PSB Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('PSB Detection', () => {
  it('should detect PSB (version 2)', () => {
    const buf = new ArrayBuffer(26)
    const view = new DataView(buf)
    // '8BPS'
    view.setUint8(0, 0x38) // 8
    view.setUint8(1, 0x42) // B
    view.setUint8(2, 0x50) // P
    view.setUint8(3, 0x53) // S
    // Version 2
    view.setUint16(4, 2, false)
    expect(isPSB(buf)).toBe(true)
  })

  it('should not detect PSD (version 1) as PSB', () => {
    const buf = new ArrayBuffer(26)
    const view = new DataView(buf)
    view.setUint8(0, 0x38)
    view.setUint8(1, 0x42)
    view.setUint8(2, 0x50)
    view.setUint8(3, 0x53)
    view.setUint16(4, 1, false)
    expect(isPSB(buf)).toBe(false)
  })

  it('should detect PSD (version 1)', () => {
    const buf = new ArrayBuffer(26)
    const view = new DataView(buf)
    view.setUint8(0, 0x38)
    view.setUint8(1, 0x42)
    view.setUint8(2, 0x50)
    view.setUint8(3, 0x53)
    view.setUint16(4, 1, false)
    expect(isPSD(buf)).toBe(true)
  })

  it('should not detect PSB as PSD', () => {
    const buf = new ArrayBuffer(26)
    const view = new DataView(buf)
    view.setUint8(0, 0x38)
    view.setUint8(1, 0x42)
    view.setUint8(2, 0x50)
    view.setUint8(3, 0x53)
    view.setUint16(4, 2, false)
    expect(isPSD(buf)).toBe(false)
  })

  it('should reject invalid signature', () => {
    const buf = new ArrayBuffer(26)
    const view = new DataView(buf)
    view.setUint8(0, 0x00)
    view.setUint8(1, 0x00)
    view.setUint8(2, 0x00)
    view.setUint8(3, 0x00)
    view.setUint16(4, 2, false)
    expect(isPSB(buf)).toBe(false)
    expect(isPSD(buf)).toBe(false)
  })

  it('should reject buffer too small', () => {
    const buf = new ArrayBuffer(4)
    expect(isPSB(buf)).toBe(false)
    expect(isPSD(buf)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PSB Export
// ══════════════════════════════════════════════════════════════════════════════

describe('PSB Export', () => {
  it('should produce valid PSB header with signature 8BPS', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    const view = new DataView(buf)
    const sig =
      String.fromCharCode(view.getUint8(0)) +
      String.fromCharCode(view.getUint8(1)) +
      String.fromCharCode(view.getUint8(2)) +
      String.fromCharCode(view.getUint8(3))
    expect(sig).toBe('8BPS')
  })

  it('should have version 2 for PSB', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    const view = new DataView(buf)
    expect(view.getUint16(4, false)).toBe(2)
  })

  it('should encode width and height correctly', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    const view = new DataView(buf)
    // After sig(4) + version(2) + reserved(6) + channels(2) = offset 14
    const height = view.getUint32(14, false)
    const width = view.getUint32(18, false)
    expect(width).toBe(200)
    expect(height).toBe(100)
  })

  it('should have 8-bit depth', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    const view = new DataView(buf)
    // offset 22
    expect(view.getUint16(22, false)).toBe(8)
  })

  it('should have RGB color mode (3)', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    const view = new DataView(buf)
    // offset 24
    expect(view.getUint16(24, false)).toBe(3)
  })

  it('should be detectable as PSB', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    expect(isPSB(buf)).toBe(true)
    expect(isPSD(buf)).toBe(false)
  })

  it('should throw if no artboard found', () => {
    const doc = makeDoc()
    doc.artboards = []
    expect(() => exportPSB(doc)).toThrow('No artboard found')
  })

  it('should export document with raster layers', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeRasterLayer()]
    const buf = exportPSB(doc)
    expect(isPSB(buf)).toBe(true)
    // Should have 4 channels (RGBA) for a doc with raster layers
    const view = new DataView(buf)
    expect(view.getUint16(12, false)).toBe(4)
  })

  it('should have composite image data at the end', () => {
    const doc = makeDoc()
    const buf = exportPSB(doc)
    // File should end with composite image data
    expect(buf.byteLength).toBeGreaterThan(26) // header alone is 26 bytes
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AVIF/HEIF Feature Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('AVIF/HEIF Feature Detection', () => {
  it('should report AVIF support as boolean', async () => {
    resetSupportCache()
    const supported = await isAVIFSupported()
    expect(typeof supported).toBe('boolean')
  })

  it('should report HEIF support as boolean', async () => {
    resetSupportCache()
    const supported = await isHEIFSupported()
    expect(typeof supported).toBe('boolean')
  })

  it('should cache AVIF detection result', async () => {
    resetSupportCache()
    const first = await isAVIFSupported()
    const second = await isAVIFSupported()
    expect(first).toBe(second)
  })

  it('should cache HEIF detection result', async () => {
    resetSupportCache()
    const first = await isHEIFSupported()
    const second = await isHEIFSupported()
    expect(first).toBe(second)
  })

  it('should reset cache correctly', async () => {
    await isAVIFSupported()
    await isHEIFSupported()
    resetSupportCache()
    // After reset, the function should still work
    const avif = await isAVIFSupported()
    const heif = await isHEIFSupported()
    expect(typeof avif).toBe('boolean')
    expect(typeof heif).toBe('boolean')
  })

  it('should return false for AVIF in non-browser (bun) environment', async () => {
    resetSupportCache()
    // In bun test, OffscreenCanvas is not available
    const supported = await isAVIFSupported()
    expect(supported).toBe(false)
  })

  it('should return false for HEIF in non-browser (bun) environment', async () => {
    resetSupportCache()
    const supported = await isHEIFSupported()
    expect(supported).toBe(false)
  })
})
