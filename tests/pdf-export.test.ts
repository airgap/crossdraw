import { describe, it, expect, afterAll } from 'bun:test'

// Save originals
const origCreateImageBitmap = (globalThis as any).createImageBitmap
const origOffscreenCanvas = globalThis.OffscreenCanvas
const origDocument = (globalThis as any).document
const origURL = globalThis.URL

afterAll(() => {
  if (origCreateImageBitmap !== undefined) {
    ;(globalThis as any).createImageBitmap = origCreateImageBitmap
  } else {
    delete (globalThis as any).createImageBitmap
  }
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  } else {
    delete (globalThis as any).document
  }
  if (origURL !== undefined) {
    globalThis.URL = origURL
  } else {
    delete (globalThis as any).URL
  }
})

// pdf-export.ts has two exported functions:
// 1. exportArtboardToPDF - async, relies on createImageBitmap + OffscreenCanvas (browser APIs)
// 2. downloadPDF - async, relies on document.createElement (DOM API)
// 3. ascii85Encode - private function used internally
//
// We test the ascii85Encode logic by testing exportArtboardToPDF indirectly,
// but since the main function needs browser APIs, we'll mock them and also
// test the module's structure. We can extract and test ascii85Encode by
// re-implementing it or testing through the export function.

// Since ascii85Encode is private, let's test it via a known input/output approach
// by mocking the browser APIs and checking the PDF output.

// Mock OffscreenCanvas and createImageBitmap for the module
const mockImageData = {
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
  width: 2,
  height: 2,
}

const mockBitmap = {
  width: 2,
  height: 2,
  close: () => {},
}

// @ts-ignore
globalThis.createImageBitmap = async () => mockBitmap

// @ts-ignore
globalThis.OffscreenCanvas = class MockOffscreenCanvas {
  width: number
  height: number
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext() {
    return {
      drawImage: () => {},
      getImageData: () => mockImageData,
      putImageData: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      closePath: () => {},
      fillRect: () => {},
      clearRect: () => {},
      scale: () => {},
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      translate: () => {},
      rotate: () => {},
      clip: () => {},
      arc: () => {},
      rect: () => {},
      canvas: this,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
      textBaseline: 'top',
      textAlign: 'left',
      setLineDash: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
    }
  }
  convertToBlob(opts?: { type?: string; quality?: number }) {
    return Promise.resolve(new Blob(['mock-image'], { type: opts?.type ?? 'image/png' }))
  }
}

import { exportArtboardToPDF, downloadPDF } from '@/io/pdf-export'
import type { DesignDocument } from '@/types'

function createTestDoc(): DesignDocument {
  return {
    id: 'test-doc',
    metadata: {
      title: 'Test Doc',
      author: 'Test',
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      colorspace: 'srgb',
      width: 100,
      height: 100,
    },
    artboards: [
      {
        id: 'ab1',
        name: 'Main',
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
}

describe('exportArtboardToPDF', () => {
  it('should return a Blob with PDF mime type', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('should produce valid PDF header', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text.startsWith('%PDF-1.4')).toBe(true)
  })

  it('should contain PDF Catalog object', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('/Type /Catalog')
  })

  it('should contain Pages object', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('/Type /Pages')
  })

  it('should contain Page object with MediaBox', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('/Type /Page')
    // 100 * 0.75 = 75
    expect(text).toContain('/MediaBox [0 0 75 75]')
  })

  it('should contain image XObject', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('/Type /XObject')
    expect(text).toContain('/Subtype /Image')
    expect(text).toContain('/ColorSpace /DeviceRGB')
  })

  it('should contain cross-reference table', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('xref')
    expect(text).toContain('trailer')
    expect(text).toContain('startxref')
    expect(text).toContain('%%EOF')
  })

  it('should throw when no artboard found', async () => {
    const doc = createTestDoc()
    doc.artboards = []
    await expect(exportArtboardToPDF(doc)).rejects.toThrow('No artboard found')
  })

  it('should throw when specific artboard ID not found', async () => {
    const doc = createTestDoc()
    await expect(exportArtboardToPDF(doc, 'nonexistent')).rejects.toThrow('No artboard found')
  })

  it('should use specific artboard when artboardId provided', async () => {
    const doc = createTestDoc()
    doc.artboards.push({
      id: 'ab2',
      name: 'Second',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      backgroundColor: '#000000',
      layers: [],
    })
    const blob = await exportArtboardToPDF(doc, 'ab2')
    const text = await blob.text()
    // 200 * 0.75 = 150, 150 * 0.75 = 112.5
    expect(text).toContain('/MediaBox [0 0 150 112.5]')
  })

  it('should contain ASCII85 encoded data ending with ~>', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('~>')
    expect(text).toContain('/Filter /ASCII85Decode')
  })

  it('should contain content stream with image drawing commands', async () => {
    const doc = createTestDoc()
    const blob = await exportArtboardToPDF(doc)
    const text = await blob.text()
    expect(text).toContain('/Img0 Do')
    expect(text).toContain('cm')
  })
})

describe('downloadPDF', () => {
  it('should create and click a download link', async () => {
    let clickCalled = false
    let revokeURL = ''

    // @ts-ignore
    globalThis.document = {
      createElement: (_tag: string) =>
        ({
          href: '',
          download: '',
          click: () => {
            clickCalled = true
          },
        }) as any,
    }
    // @ts-ignore
    globalThis.URL = {
      createObjectURL: () => 'blob:test-url',
      revokeObjectURL: (url: string) => {
        revokeURL = url
      },
    }

    const doc = createTestDoc()
    await downloadPDF(doc, 'test.pdf')

    expect(clickCalled).toBe(true)
    expect(revokeURL).toBe('blob:test-url')

    // Clean up
    // @ts-ignore
    delete globalThis.document
    // @ts-ignore
    delete globalThis.URL
  })

  it('should use document title as default filename', async () => {
    let downloadName = ''

    // @ts-ignore
    globalThis.document = {
      createElement: (() => {
        const el = {
          href: '',
          _download: '',
          get download() {
            return el._download
          },
          set download(v: string) {
            el._download = v
            downloadName = v
          },
          click: () => {},
        }
        return el
      }) as any,
    }
    // @ts-ignore
    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    }

    const doc = createTestDoc()
    await downloadPDF(doc)

    expect(downloadName).toBe('Test Doc.pdf')

    // @ts-ignore
    delete globalThis.document
    // @ts-ignore
    delete globalThis.URL
  })
})
