import { describe, it, expect, afterAll } from 'bun:test'
import { createSlice } from '@/io/batch-export'

// Save originals for restore
const origDocument = globalThis.document
const origURL = globalThis.URL
const origOffscreenCanvas = globalThis.OffscreenCanvas
const origPath2D = globalThis.Path2D
const origCreateImageBitmap = (globalThis as any).createImageBitmap

afterAll(() => {
  if (origDocument !== undefined) {
    globalThis.document = origDocument
  } else {
    delete (globalThis as any).document
  }
  if (origURL !== undefined) {
    globalThis.URL = origURL
  } else {
    delete (globalThis as any).URL
  }
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
  if (origPath2D !== undefined) {
    globalThis.Path2D = origPath2D
  } else {
    delete (globalThis as any).Path2D
  }
  if (origCreateImageBitmap !== undefined) {
    ;(globalThis as any).createImageBitmap = origCreateImageBitmap
  } else {
    delete (globalThis as any).createImageBitmap
  }
})

// Set up mocks needed for batch export execution
if (typeof globalThis.Path2D === 'undefined') {
  // @ts-ignore
  globalThis.Path2D = class MockPath2D {
    constructor(_path?: string) {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    closePath() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  }
}

const mockImageData = {
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
}

if (typeof globalThis.OffscreenCanvas === 'undefined') {
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
        setLineDash: () => {},
        stroke: () => {},
        fill: () => {},
        fillText: () => {},
        canvas: { width: 100, height: 100 },
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
      }
    }
    convertToBlob(opts?: { type?: string; quality?: number }) {
      return Promise.resolve(new Blob(['mock'], { type: opts?.type ?? 'image/png' }))
    }
  }
}

if (typeof (globalThis as any).createImageBitmap === 'undefined') {
  ;(globalThis as any).createImageBitmap = async () => ({
    width: 100,
    height: 100,
    close: () => {},
  })
}

// We test the non-async functions directly. The async functions (batchExportSlices, downloadBatchExport)
// depend on browser APIs (OffscreenCanvas, createImageBitmap, document.createElement).
// We'll mock those and test them too.

describe('createSlice', () => {
  it('should create a slice with default format and scale', () => {
    const slice = createSlice('icon', 0, 0, 64, 64)

    expect(slice.name).toBe('icon')
    expect(slice.x).toBe(0)
    expect(slice.y).toBe(0)
    expect(slice.width).toBe(64)
    expect(slice.height).toBe(64)
    expect(slice.format).toBe('png')
    expect(slice.scale).toBe(1)
    expect(slice.id).toBeTruthy()
    expect(typeof slice.id).toBe('string')
  })

  it('should create a slice with custom format', () => {
    const slice = createSlice('photo', 10, 20, 200, 150, 'jpeg')

    expect(slice.format).toBe('jpeg')
    expect(slice.x).toBe(10)
    expect(slice.y).toBe(20)
    expect(slice.width).toBe(200)
    expect(slice.height).toBe(150)
  })

  it('should create a slice with custom scale', () => {
    const slice = createSlice('retina', 0, 0, 100, 100, 'png', 2)

    expect(slice.scale).toBe(2)
  })

  it('should create a slice with SVG format', () => {
    const slice = createSlice('vector', 0, 0, 300, 200, 'svg')

    expect(slice.format).toBe('svg')
  })

  it('should create a slice with GIF format', () => {
    const slice = createSlice('animation', 0, 0, 50, 50, 'gif')

    expect(slice.format).toBe('gif')
  })

  it('should create a slice with TIFF format', () => {
    const slice = createSlice('print', 0, 0, 1000, 800, 'tiff', 3)

    expect(slice.format).toBe('tiff')
    expect(slice.scale).toBe(3)
  })

  it('should create a slice with WebP format', () => {
    const slice = createSlice('web', 0, 0, 400, 300, 'webp')

    expect(slice.format).toBe('webp')
  })

  it('should generate unique IDs for different slices', () => {
    const s1 = createSlice('a', 0, 0, 10, 10)
    const s2 = createSlice('b', 0, 0, 10, 10)

    expect(s1.id).not.toBe(s2.id)
  })

  it('should handle fractional coordinates', () => {
    const slice = createSlice('precise', 0.5, 1.5, 99.9, 49.5)

    expect(slice.x).toBe(0.5)
    expect(slice.y).toBe(1.5)
    expect(slice.width).toBe(99.9)
    expect(slice.height).toBe(49.5)
  })

  it('should handle large dimensions', () => {
    const slice = createSlice('huge', 0, 0, 10000, 10000, 'png', 4)

    expect(slice.width).toBe(10000)
    expect(slice.height).toBe(10000)
    expect(slice.scale).toBe(4)
  })
})

describe('batchExportSlices', () => {
  it('should throw when no artboard found', async () => {
    // Lazy-import so mocks above are in place
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
        width: 100,
        height: 100,
      },
      artboards: [],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    await expect(batchExportSlices(doc)).rejects.toThrow('No artboard found')
  })

  it('should throw when no slices defined', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          backgroundColor: '#fff',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    await expect(batchExportSlices(doc)).rejects.toThrow('No export slices defined')
  })

  it('should throw when artboard has empty slices array', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          backgroundColor: '#fff',
          layers: [],
          slices: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    await expect(batchExportSlices(doc)).rejects.toThrow('No export slices defined')
  })
})

describe('batchExportSlices - execution', () => {
  it('should export SVG slices', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'icon', x: 0, y: 0, width: 100, height: 100, format: 'svg' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('icon')
    expect(results[0]!.format).toBe('svg')
    expect(results[0]!.blob).toBeInstanceOf(Blob)
    expect(results[0]!.blob.type).toBe('image/svg+xml')
  })

  it('should export PNG slices at full artboard size', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'full', x: 0, y: 0, width: 100, height: 100, format: 'png' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.format).toBe('png')
    expect(results[0]!.blob).toBeInstanceOf(Blob)
  })

  it('should export PNG slices with cropping', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
        width: 200,
        height: 200,
      },
      artboards: [
        {
          id: 'ab1',
          name: 'Main',
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          backgroundColor: '#ffffff',
          layers: [],
          slices: [
            { id: 's1', name: 'cropped', x: 10, y: 10, width: 50, height: 50, format: 'png' as const, scale: 2 },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('cropped')
    expect(results[0]!.scale).toBe(2)
  })

  it('should export JPEG slices with cropping', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'photo', x: 5, y: 5, width: 50, height: 50, format: 'jpeg' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.format).toBe('jpeg')
  })

  it('should export WebP slices with cropping', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'web', x: 10, y: 10, width: 30, height: 30, format: 'webp' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.format).toBe('webp')
  })

  it('should export GIF slices with cropping', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'anim', x: 5, y: 5, width: 20, height: 20, format: 'gif' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.format).toBe('gif')
  })

  it('should export TIFF slices with cropping', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [{ id: 's1', name: 'print', x: 5, y: 5, width: 30, height: 30, format: 'tiff' as const, scale: 1 }],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(1)
    expect(results[0]!.format).toBe('tiff')
  })

  it('should export multiple slices in order', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
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
          slices: [
            { id: 's1', name: 'icon', x: 0, y: 0, width: 32, height: 32, format: 'png' as const, scale: 1 },
            { id: 's2', name: 'icon', x: 0, y: 0, width: 32, height: 32, format: 'png' as const, scale: 2 },
            { id: 's3', name: 'banner', x: 0, y: 0, width: 100, height: 100, format: 'svg' as const, scale: 1 },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc)
    expect(results).toHaveLength(3)
    expect(results[0]!.name).toBe('icon')
    expect(results[0]!.scale).toBe(1)
    expect(results[1]!.name).toBe('icon')
    expect(results[1]!.scale).toBe(2)
    expect(results[2]!.name).toBe('banner')
    expect(results[2]!.format).toBe('svg')
  })

  it('should use specific artboard by ID', async () => {
    const { batchExportSlices } = await import('@/io/batch-export')
    const doc = {
      id: 'test',
      metadata: {
        title: 'Test',
        author: '',
        created: '',
        modified: '',
        colorspace: 'srgb' as const,
        width: 100,
        height: 100,
      },
      artboards: [
        {
          id: 'ab1',
          name: 'First',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#fff',
          layers: [],
          slices: [
            { id: 's0', name: 'first-slice', x: 0, y: 0, width: 100, height: 100, format: 'png' as const, scale: 1 },
          ],
        },
        {
          id: 'ab2',
          name: 'Second',
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          backgroundColor: '#000',
          layers: [],
          slices: [
            { id: 's1', name: 'second-slice', x: 0, y: 0, width: 200, height: 200, format: 'png' as const, scale: 1 },
          ],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }

    const results = await batchExportSlices(doc, 'ab2')
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('second-slice')
  })
})

describe('downloadBatchExport', () => {
  it('should create download links for each result', async () => {
    let clickCount = 0
    let revokeCount = 0
    const downloadNames: string[] = []

    // @ts-ignore
    globalThis.document = {
      createElement: () => {
        const el = {
          href: '',
          _download: '',
          get download() {
            return this._download
          },
          set download(v: string) {
            this._download = v
            downloadNames.push(v)
          },
          click: () => {
            clickCount++
          },
        }
        return el as any
      },
    }
    // @ts-ignore
    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {
        revokeCount++
      },
    }

    const { downloadBatchExport } = await import('@/io/batch-export')

    await downloadBatchExport([
      { name: 'icon', format: 'png', scale: 1, blob: new Blob() },
      { name: 'icon', format: 'png', scale: 2, blob: new Blob() },
      { name: 'photo', format: 'jpeg', scale: 1, blob: new Blob() },
    ])

    expect(clickCount).toBe(3)
    expect(revokeCount).toBe(3)
    expect(downloadNames).toContain('icon.png')
    expect(downloadNames).toContain('icon@2x.png')
    expect(downloadNames).toContain('photo.jpeg')

    // Restore (afterAll will also restore)
    globalThis.document = origDocument
    globalThis.URL = origURL
  })
})
