import { describe, it, expect } from 'bun:test'
import { v4 as uuid } from 'uuid'
import type { DesignDocument, VectorLayer, TextLayer } from '@/types'
// store used indirectly by makeRasterLayer if needed
// import { storeRasterData } from '@/store/raster-data'

// AI Import
import { isAIFile, importAI } from '@/io/ai-import'

// RAW Import
import { isRAWFile, detectRAWFormat, extractRAWPreview, DEFAULT_RAW_SETTINGS } from '@/io/raw-import'

// PDF/X Export
import { exportPDFX, DEFAULT_PDFX_SETTINGS } from '@/io/pdfx-export'
import type { PDFXSettings } from '@/io/pdfx-export'

// Color Separation
import {
  exportSeparations,
  exportSeparationAsTIFF,
  compositeSeparations,
  DEFAULT_SEPARATION_PROFILE,
} from '@/io/color-separation'
import type { SeparationProfile } from '@/io/color-separation'

// OpenEXR / HDR
import {
  encodeRGBE,
  decodeRGBE,
  exportHDR,
  importHDR,
  exportOpenEXR,
  importOpenEXR,
  isOpenEXR,
  isHDR,
  floatToHalf,
  halfToFloat,
  toneMap,
  toneMapBuffer,
} from '@/io/openexr-hdr'

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

function makeColoredImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200 // R
    data[i + 1] = 100 // G
    data[i + 2] = 50 // B
    data[i + 3] = 255 // A
  }
  return makeImageData(width, height, data)
}

// ══════════════════════════════════════════════════════════════════════════════
// AI Import (#86)
// ══════════════════════════════════════════════════════════════════════════════

describe('AI Import', () => {
  it('should detect PostScript-based AI files', () => {
    const header = '%!PS-Adobe-3.1\n%%Creator: Adobe Illustrator 10\n%%Title: test.ai\n'
    const buf = new TextEncoder().encode(header).buffer as ArrayBuffer
    expect(isAIFile(buf)).toBe(true)
  })

  it('should detect PDF-based AI files', () => {
    const header = '%PDF-1.5\n%Illustrator AIPrivateData\n'
    const buf = new TextEncoder().encode(header).buffer as ArrayBuffer
    expect(isAIFile(buf)).toBe(true)
  })

  it('should reject non-AI files', () => {
    const header = 'This is not an AI file'
    const buf = new TextEncoder().encode(header).buffer as ArrayBuffer
    expect(isAIFile(buf)).toBe(false)
  })

  it('should reject pure PDF without AI markers', () => {
    const header = '%PDF-1.4\nSome regular PDF content here without illustrator markers\n'
    const buf = new TextEncoder().encode(header).buffer as ArrayBuffer
    expect(isAIFile(buf)).toBe(false)
  })

  it('should import PDF-based AI with path data', () => {
    const pdfAI = [
      '%PDF-1.5',
      '%Illustrator',
      '1 0 obj << /Type /Catalog >> endobj',
      '2 0 obj << /MediaBox [0 0 612 792] >> endobj',
      '3 0 obj << /Length 100 >>',
      'stream',
      '1 0 0 rg',
      '100 700 m',
      '200 700 l',
      '200 600 l',
      'h',
      'f',
      '',
      'endstream',
      'endobj',
    ].join('\n')
    const buf = new TextEncoder().encode(pdfAI).buffer as ArrayBuffer
    const doc = importAI(buf)
    expect(doc.metadata.title).toBe('AI Import')
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.width).toBe(612)
    expect(doc.artboards[0]!.height).toBe(792)
    // Should have extracted at least one vector layer from the content stream
    expect(doc.artboards[0]!.layers.length).toBeGreaterThan(0)
  })

  it('should import legacy PostScript-based AI', () => {
    const psAI = [
      '%!PS-Adobe-3.0',
      '%%Creator: Adobe Illustrator 8',
      '%%BoundingBox: 0 0 400 300',
      '%%EndComments',
      '',
      '1 0 0 setrgbcolor',
      'newpath',
      '10 280 moveto',
      '100 280 lineto',
      '100 200 lineto',
      'closepath',
      'fill',
      '',
      'showpage',
      '%%EOF',
    ].join('\n')
    const buf = new TextEncoder().encode(psAI).buffer as ArrayBuffer
    const doc = importAI(buf)
    expect(doc.artboards[0]!.width).toBe(400)
    expect(doc.artboards[0]!.height).toBe(300)
    expect(doc.artboards[0]!.layers.length).toBeGreaterThan(0)
    const vectorLayer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(vectorLayer.type).toBe('vector')
    expect(vectorLayer.fill).not.toBeNull()
  })

  it('should parse PDF stroke operators', () => {
    const pdfAI = [
      '%PDF-1.5',
      '%AIMetaData',
      '1 0 obj << /MediaBox [0 0 200 200] >> endobj',
      '2 0 obj << /Length 80 >>',
      'stream',
      '0 0 1 RG',
      '2 w',
      '10 190 m',
      '50 190 l',
      'S',
      '',
      'endstream',
      'endobj',
    ].join('\n')
    const buf = new TextEncoder().encode(pdfAI).buffer as ArrayBuffer
    const doc = importAI(buf)
    expect(doc.artboards[0]!.layers.length).toBeGreaterThan(0)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.stroke).not.toBeNull()
    expect(layer.stroke!.color).toBe('#0000ff')
  })

  it('should parse PDF rectangle operator (re)', () => {
    const pdfAI = [
      '%PDF-1.5',
      '%Illustrator',
      '1 0 obj << /MediaBox [0 0 300 300] >> endobj',
      '2 0 obj << /Length 50 >>',
      'stream',
      '0.5 0.5 0.5 rg',
      '20 280 100 50 re',
      'f',
      '',
      'endstream',
      'endobj',
    ].join('\n')
    const buf = new TextEncoder().encode(pdfAI).buffer as ArrayBuffer
    const doc = importAI(buf)
    expect(doc.artboards[0]!.layers.length).toBeGreaterThan(0)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.paths[0]!.segments.length).toBeGreaterThanOrEqual(5) // move + 3 lines + close
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RAW Import (#89)
// ══════════════════════════════════════════════════════════════════════════════

describe('RAW Import', () => {
  describe('Format detection', () => {
    it('should detect CR2 files', () => {
      const buf = new ArrayBuffer(16)
      const view = new DataView(buf)
      const bytes = new Uint8Array(buf)
      // TIFF header II + magic 42
      view.setUint16(0, 0x4949)
      view.setUint16(2, 42, true)
      // CR2 signature at byte 8
      bytes[8] = 0x43 // 'C'
      bytes[9] = 0x52 // 'R'
      bytes[10] = 0x02 // version 2
      bytes[11] = 0x00
      expect(isRAWFile(buf)).toBe(true)
      expect(detectRAWFormat(buf)).toBe('CR2')
    })

    it('should detect RAF files (Fujifilm)', () => {
      const header = 'FUJIFILMCCD-RAW 0200'
      const buf = new TextEncoder().encode(header).buffer as ArrayBuffer
      expect(isRAWFile(buf)).toBe(true)
      expect(detectRAWFormat(buf)).toBe('RAF')
    })

    it('should detect ORF files (Olympus)', () => {
      const buf = new ArrayBuffer(16)
      const view = new DataView(buf)
      // Olympus ORF: 'II' + 0x524F
      view.setUint16(0, 0x4949)
      view.setUint16(2, 0x524f, true)
      expect(isRAWFile(buf)).toBe(true)
      expect(detectRAWFormat(buf)).toBe('ORF')
    })

    it('should detect RW2 files (Panasonic)', () => {
      const buf = new ArrayBuffer(16)
      const view = new DataView(buf)
      view.setUint16(0, 0x4949)
      view.setUint16(2, 0x0055, true)
      expect(isRAWFile(buf)).toBe(true)
      expect(detectRAWFormat(buf)).toBe('RW2')
    })

    it('should reject non-RAW files', () => {
      const buf = new TextEncoder().encode('Just a text file').buffer as ArrayBuffer
      expect(isRAWFile(buf)).toBe(false)
      expect(detectRAWFormat(buf)).toBeNull()
    })

    it('should reject empty buffers', () => {
      const buf = new ArrayBuffer(4)
      expect(isRAWFile(buf)).toBe(false)
    })
  })

  describe('JPEG preview extraction', () => {
    it('should extract embedded JPEG from RAW data', () => {
      // Build fake RAW file with embedded JPEG
      const prefix = new Uint8Array(64) // fake header
      const jpegData = new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe0, // SOI + APP0
        0x00,
        0x10,
        0x4a,
        0x46, // JFIF header
        0x49,
        0x46,
        0x00,
        0x01,
        0x01,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0xff,
        0xd9, // EOI
      ])
      const combined = new Uint8Array(prefix.length + jpegData.length)
      combined.set(prefix)
      combined.set(jpegData, prefix.length)

      const preview = extractRAWPreview(combined.buffer as ArrayBuffer)
      // Should start with JPEG SOI marker
      expect(preview[0]).toBe(0xff)
      expect(preview[1]).toBe(0xd8)
      // Should end with JPEG EOI marker
      expect(preview[preview.length - 2]).toBe(0xff)
      expect(preview[preview.length - 1]).toBe(0xd9)
    })

    it('should throw if no JPEG preview found', () => {
      const buf = new Uint8Array(128).buffer as ArrayBuffer
      expect(() => extractRAWPreview(buf)).toThrow('No embedded JPEG preview found')
    })
  })

  describe('Default settings', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RAW_SETTINGS.usePreview).toBe(false)
      expect(DEFAULT_RAW_SETTINGS.whiteBalance).toBe('auto')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PDF/X Export (#90)
// ══════════════════════════════════════════════════════════════════════════════

describe('PDF/X Export', () => {
  it('should produce valid PDF header', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 10))
    expect(text.startsWith('%PDF-')).toBe(true)
  })

  it('should include cross-reference table and trailer', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('xref')
    expect(text).toContain('trailer')
    expect(text).toContain('startxref')
    expect(text).toContain('%%EOF')
  })

  it('should include TrimBox and BleedBox', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('/TrimBox')
    expect(text).toContain('/BleedBox')
  })

  it('should include OutputIntent for PDF/X compliance', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('/OutputIntent')
    expect(text).toContain('/OutputConditionIdentifier')
  })

  it('should include MediaBox', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('/MediaBox')
  })

  it('should include PDF/X version info', () => {
    const doc = makeDoc()
    const settings: PDFXSettings = { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-4' }
    const buf = exportPDFX(doc, settings)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('PDF/X-4')
  })

  it('should include crop marks in content stream when enabled', () => {
    const doc = makeDoc()
    const settings: PDFXSettings = { ...DEFAULT_PDFX_SETTINGS, cropMarks: true }
    const buf = exportPDFX(doc, settings)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    // Crop marks use CMYK black and 'S' (stroke) operator
    expect(text).toContain('0 0 0 1 K') // CMYK black
  })

  it('should include color bars when enabled', () => {
    const doc = makeDoc()
    const settings: PDFXSettings = { ...DEFAULT_PDFX_SETTINGS, colorBars: true }
    const buf = exportPDFX(doc, settings)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    // Color bars use rectangles (re f)
    expect(text).toContain('re f')
  })

  it('should render vector layers in content stream', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    // PDF path operators
    expect(text).toContain(' m') // moveto
    expect(text).toContain(' l') // lineto
    expect(text).toContain(' f') // fill
  })

  it('should render text layers in content stream', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeTextLayer()]
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('BT') // begin text
    expect(text).toContain('ET') // end text
    expect(text).toContain('Tj') // show text
    expect(text).toContain('Hello World')
  })

  it('should use CMYK color operators for PDF/X-1a', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const settings: PDFXSettings = { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-1a' }
    const buf = exportPDFX(doc, settings)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    // CMYK non-stroking color: c m y k k
    expect(text).toContain(' k') // CMYK color operator
    expect(text).toContain('PDF/X-1a')
  })

  it('should use RGB color operators for PDF/X-4', () => {
    const doc = makeDoc()
    doc.artboards[0]!.layers = [makeVectorLayer()]
    const settings: PDFXSettings = { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-4' }
    const buf = exportPDFX(doc, settings)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    // RGB non-stroking color: r g b rg
    expect(text).toContain(' rg') // RGB color operator
  })

  it('should include Creator in info dictionary', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('/Creator (Crossdraw)')
    expect(text).toContain('/Producer (Crossdraw PDF/X Export)')
  })

  it('should include document title', () => {
    const doc = makeDoc()
    const buf = exportPDFX(doc)
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf))
    expect(text).toContain('/Title (Test Document)')
  })

  it('should produce different output for each standard', () => {
    const doc = makeDoc()
    const x1a = exportPDFX(doc, { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-1a' })
    const x3 = exportPDFX(doc, { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-3' })
    const x4 = exportPDFX(doc, { ...DEFAULT_PDFX_SETTINGS, standard: 'PDF/X-4' })
    const t1 = new TextDecoder('latin1').decode(new Uint8Array(x1a))
    const t3 = new TextDecoder('latin1').decode(new Uint8Array(x3))
    const t4 = new TextDecoder('latin1').decode(new Uint8Array(x4))
    expect(t1).toContain('PDF/X-1a:2003')
    expect(t3).toContain('PDF/X-3:2003')
    expect(t4).toContain('PDF/X-4')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Color Separation (#91)
// ══════════════════════════════════════════════════════════════════════════════

describe('Color Separation', () => {
  it('should produce four CMYK plates', () => {
    const img = makeColoredImageData(4, 4)
    const plates = exportSeparations(img)
    expect(plates.cyan).toBeDefined()
    expect(plates.magenta).toBeDefined()
    expect(plates.yellow).toBeDefined()
    expect(plates.black).toBeDefined()
    expect(plates.cyan.width).toBe(4)
    expect(plates.cyan.height).toBe(4)
  })

  it('should produce grayscale plates (R=G=B for each pixel)', () => {
    const img = makeColoredImageData(2, 2)
    const plates = exportSeparations(img)
    // Each pixel in each plate should have R=G=B (grayscale)
    for (let i = 0; i < plates.cyan.data.length; i += 4) {
      expect(plates.cyan.data[i]).toBe(plates.cyan.data[i + 1])
      expect(plates.cyan.data[i + 1]).toBe(plates.cyan.data[i + 2])
      expect(plates.cyan.data[i + 3]).toBe(255) // alpha
    }
  })

  it('should produce zero cyan for pure red', () => {
    // Pure red (255, 0, 0) → C=0, M=1, Y=1, K=0
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    const img = makeImageData(1, 1, data)
    const plates = exportSeparations(img, { ...DEFAULT_SEPARATION_PROFILE, gcrAmount: 0, ucrAmount: 0 })
    // Cyan should be 0 for pure red
    expect(plates.cyan.data[0]).toBe(0)
  })

  it('should produce non-zero magenta and yellow for pure red', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    const img = makeImageData(1, 1, data)
    const plates = exportSeparations(img, { ...DEFAULT_SEPARATION_PROFILE, gcrAmount: 0, ucrAmount: 0 })
    // Magenta and Yellow should be high for pure red
    expect(plates.magenta.data[0]).toBeGreaterThan(200)
    expect(plates.yellow.data[0]).toBeGreaterThan(200)
  })

  it('should produce high K for pure black', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255])
    const img = makeImageData(1, 1, data)
    const plates = exportSeparations(img)
    // Black plate should be high
    expect(plates.black.data[0]).toBeGreaterThan(100)
  })

  it('should produce zero values for pure white', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255])
    const img = makeImageData(1, 1, data)
    const plates = exportSeparations(img)
    expect(plates.cyan.data[0]).toBe(0)
    expect(plates.magenta.data[0]).toBe(0)
    expect(plates.yellow.data[0]).toBe(0)
    expect(plates.black.data[0]).toBe(0)
  })

  it('should extract spot color plates', () => {
    // Create an image with a specific spot color
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255])
    const img = makeImageData(2, 1, data)
    const profile: SeparationProfile = {
      ...DEFAULT_SEPARATION_PROFILE,
      spotColors: [{ name: 'Spot Red', targetRGB: [255, 0, 0], tolerance: 10 }],
    }
    const plates = exportSeparations(img, profile)
    expect(plates.spotPlates).toBeDefined()
    expect(plates.spotPlates!.has('Spot Red')).toBe(true)
    const spotPlate = plates.spotPlates!.get('Spot Red')!
    // First pixel (pure red) should match, second (blue) should not
    expect(spotPlate.data[0]).toBeGreaterThan(200) // high intensity for matching pixel
    expect(spotPlate.data[4]).toBe(0) // zero for non-matching pixel
  })

  it('should export a plate as TIFF', () => {
    const data = new Uint8ClampedArray([128, 128, 128, 255])
    const plate = makeImageData(1, 1, data)
    const tiff = exportSeparationAsTIFF(plate, 'cyan')
    expect(tiff.byteLength).toBeGreaterThan(0)
    // Check TIFF magic bytes
    const bytes = new Uint8Array(tiff)
    expect(bytes[0]).toBe(0x49) // 'I'
    expect(bytes[1]).toBe(0x49) // 'I'
  })

  it('should composite plates back to RGB', () => {
    const img = makeColoredImageData(4, 4)
    const plates = exportSeparations(img)
    const composite = compositeSeparations(plates)
    expect(composite.width).toBe(4)
    expect(composite.height).toBe(4)
    // Composite should produce valid pixel data
    for (let i = 0; i < composite.data.length; i += 4) {
      expect(composite.data[i]!).toBeGreaterThanOrEqual(0)
      expect(composite.data[i]!).toBeLessThanOrEqual(255)
      expect(composite.data[i + 3]).toBe(255) // alpha
    }
  })

  it('should enforce total ink limit', () => {
    // A dark, saturated color would have high ink coverage
    const data = new Uint8ClampedArray([10, 10, 10, 255])
    const img = makeImageData(1, 1, data)
    const profile: SeparationProfile = {
      totalInkLimit: 200, // very restrictive
      ucrAmount: 0.5,
      gcrAmount: 0.5,
    }
    const plates = exportSeparations(img, profile)
    // Total ink should be under or at the limit
    const c = plates.cyan.data[0]! / 255
    const m = plates.magenta.data[0]! / 255
    const y = plates.yellow.data[0]! / 255
    const k = plates.black.data[0]! / 255
    const totalInk = (c + m + y + k) * 100
    expect(totalInk).toBeLessThanOrEqual(215) // allow rounding in ink limit enforcement
  })

  it('should use default separation profile values', () => {
    expect(DEFAULT_SEPARATION_PROFILE.totalInkLimit).toBe(320)
    expect(DEFAULT_SEPARATION_PROFILE.ucrAmount).toBe(0.5)
    expect(DEFAULT_SEPARATION_PROFILE.gcrAmount).toBe(0.5)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// OpenEXR / HDR (#92)
// ══════════════════════════════════════════════════════════════════════════════

describe('OpenEXR/HDR', () => {
  // ── Tone mapping ──

  describe('Tone mapping', () => {
    it('should map 0 to 0', () => {
      expect(toneMap(0, 1.0)).toBe(0)
    })

    it('should map high values close to 255', () => {
      const result = toneMap(10.0, 1.0)
      expect(result).toBeGreaterThan(250)
      expect(result).toBeLessThanOrEqual(255)
    })

    it('should produce higher output with higher exposure', () => {
      const low = toneMap(0.5, 0.5)
      const high = toneMap(0.5, 2.0)
      expect(high).toBeGreaterThan(low)
    })

    it('should tone map a buffer', () => {
      const hdr = new Float32Array([1.0, 0.5, 0.2, 1.0, 0.0, 0.0, 0.0, 1.0])
      const result = toneMapBuffer(hdr, 2, 1, 1.0)
      expect(result.width).toBe(2)
      expect(result.height).toBe(1)
      expect(result.data[0]!).toBeGreaterThan(100) // R of first pixel (1.0 linear)
      expect(result.data[4]).toBe(0) // R of second pixel (0.0 linear)
      expect(result.data[3]).toBe(255) // alpha
    })
  })

  // ── RGBE ──

  describe('RGBE encoding/decoding', () => {
    it('should round-trip a color through RGBE', () => {
      const r = 1.5,
        g = 0.7,
        b = 0.3
      const [rm, gm, bm, e] = encodeRGBE(r, g, b)
      const [dr, dg, db] = decodeRGBE(rm, gm, bm, e)
      expect(Math.abs(dr - r)).toBeLessThan(0.02)
      expect(Math.abs(dg - g)).toBeLessThan(0.02)
      expect(Math.abs(db - b)).toBeLessThan(0.02)
    })

    it('should encode black as all zeros', () => {
      const [rm, gm, bm, e] = encodeRGBE(0, 0, 0)
      expect(rm).toBe(0)
      expect(gm).toBe(0)
      expect(bm).toBe(0)
      expect(e).toBe(0)
    })

    it('should decode all-zero RGBE as black', () => {
      const [r, g, b] = decodeRGBE(0, 0, 0, 0)
      expect(r).toBe(0)
      expect(g).toBe(0)
      expect(b).toBe(0)
    })

    it('should handle very bright values', () => {
      const [rm, gm, bm, e] = encodeRGBE(100, 50, 25)
      const [dr, dg, db] = decodeRGBE(rm, gm, bm, e)
      expect(Math.abs(dr - 100) / 100).toBeLessThan(0.05)
      expect(Math.abs(dg - 50) / 50).toBeLessThan(0.05)
      expect(Math.abs(db - 25) / 25).toBeLessThan(0.05)
    })
  })

  // ── Float16 ──

  describe('Float16 conversion', () => {
    it('should round-trip common values', () => {
      const values = [0, 0.5, 1.0, 2.0, 0.001, 65504] // 65504 is max half
      for (const val of values) {
        const half = floatToHalf(val)
        const result = halfToFloat(half)
        if (val === 0) {
          expect(result).toBe(0)
        } else {
          expect(Math.abs(result - val) / val).toBeLessThan(0.01)
        }
      }
    })

    it('should handle infinity', () => {
      const half = floatToHalf(Infinity)
      expect(halfToFloat(half)).toBe(Infinity)
    })

    it('should handle negative infinity', () => {
      const half = floatToHalf(-Infinity)
      expect(halfToFloat(half)).toBe(-Infinity)
    })

    it('should handle NaN', () => {
      const half = floatToHalf(NaN)
      expect(Number.isNaN(halfToFloat(half))).toBe(true)
    })

    it('should handle negative zero', () => {
      const half = floatToHalf(-0)
      const result = halfToFloat(half)
      expect(Object.is(result, -0)).toBe(true)
    })
  })

  // ── HDR export/import ──

  describe('HDR format', () => {
    it('should produce valid HDR header', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportHDR(img)
      const text = new TextDecoder('ascii').decode(new Uint8Array(buf, 0, 64))
      expect(text.startsWith('#?RADIANCE')).toBe(true)
      expect(text).toContain('FORMAT=32-bit_rle_rgbe')
    })

    it('should include resolution string', () => {
      const img = makeColoredImageData(16, 8)
      const buf = exportHDR(img)
      const bytes = new Uint8Array(buf)
      const text = new TextDecoder('ascii').decode(bytes.slice(0, Math.min(bytes.length, 256)))
      expect(text).toContain('-Y 8 +X 16')
    })

    it('should round-trip through export/import', () => {
      const img = makeColoredImageData(16, 16)
      const buf = exportHDR(img)
      const imported = importHDR(buf)
      expect(imported.width).toBe(16)
      expect(imported.height).toBe(16)
      // Tone-mapped values should be reasonable (not all black or all white)
      let hasNonZero = false
      for (let i = 0; i < imported.data.length; i += 4) {
        if (imported.data[i]! > 0) hasNonZero = true
      }
      expect(hasNonZero).toBe(true)
    })

    it('should detect HDR files', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportHDR(img)
      expect(isHDR(buf)).toBe(true)
    })

    it('should reject non-HDR files', () => {
      const buf = new TextEncoder().encode('Not an HDR file').buffer as ArrayBuffer
      expect(isHDR(buf)).toBe(false)
    })

    it('should handle small images (no RLE)', () => {
      // Width < 8 triggers flat RGBE path
      const img = makeColoredImageData(4, 4)
      const buf = exportHDR(img)
      expect(buf.byteLength).toBeGreaterThan(0)
    })
  })

  // ── OpenEXR export/import ──

  describe('OpenEXR format', () => {
    it('should produce valid EXR magic number', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportOpenEXR(img)
      const view = new DataView(buf)
      expect(view.getUint32(0, true)).toBe(20000630)
    })

    it('should detect EXR files', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportOpenEXR(img)
      expect(isOpenEXR(buf)).toBe(true)
    })

    it('should reject non-EXR files', () => {
      const buf = new TextEncoder().encode('Not an EXR file').buffer as ArrayBuffer
      expect(isOpenEXR(buf)).toBe(false)
    })

    it('should include channel list in header', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportOpenEXR(img)
      const text = new TextDecoder('ascii').decode(new Uint8Array(buf, 0, 256))
      // Channel names B, G, R should be present
      expect(text).toContain('channels')
    })

    it('should include dataWindow and displayWindow', () => {
      const img = makeColoredImageData(4, 4)
      const buf = exportOpenEXR(img)
      const bytes = new Uint8Array(buf)
      const text = new TextDecoder('ascii').decode(bytes.slice(0, Math.min(bytes.length, 512)))
      expect(text).toContain('dataWindow')
      expect(text).toContain('displayWindow')
    })

    it('should round-trip through export/import', () => {
      const img = makeColoredImageData(8, 8)
      const buf = exportOpenEXR(img)
      const imported = importOpenEXR(buf)
      expect(imported.width).toBe(8)
      expect(imported.height).toBe(8)
      // Check we got non-zero pixel data
      let hasNonZero = false
      for (let i = 0; i < imported.data.length; i += 4) {
        if (imported.data[i]! > 0) hasNonZero = true
      }
      expect(hasNonZero).toBe(true)
    })

    it('should preserve relative channel intensities', () => {
      // Create image with known color: R=200, G=100, B=50
      const img = makeColoredImageData(4, 4)
      const buf = exportOpenEXR(img)
      const imported = importOpenEXR(buf, 1.0)
      // After tone mapping, R should still be > G > B
      const r = imported.data[0]!
      const g = imported.data[1]!
      const b = imported.data[2]!
      expect(r).toBeGreaterThan(g)
      expect(g).toBeGreaterThan(b)
    })

    it('should throw on invalid EXR data', () => {
      const buf = new ArrayBuffer(16)
      const view = new DataView(buf)
      view.setUint32(0, 12345, true) // wrong magic
      expect(() => importOpenEXR(buf)).toThrow('Invalid OpenEXR file')
    })
  })
})
