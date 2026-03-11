import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origLocalStorage = globalThis.localStorage
const origOffscreenCanvas = globalThis.OffscreenCanvas
const origDocument = (globalThis as any).document
const origURL = globalThis.URL

// Mock OffscreenCanvas for quickExport tests
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        drawImage: () => {},
        fillRect: () => {},
        clearRect: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        putImageData: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        scale: () => {},
        translate: () => {},
        rotate: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 50 }),
        fillText: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
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
    toBlob(cb: any) {
      cb(new Blob())
    }
    convertToBlob() {
      return Promise.resolve(new Blob())
    }
  }
}

afterAll(() => {
  if (origLocalStorage !== undefined) {
    globalThis.localStorage = origLocalStorage
  } else {
    delete (globalThis as any).localStorage
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

// Polyfill localStorage for bun:test
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

// Polyfill document for downloadBlob — ensure createElement exists
if (typeof (globalThis as any).document === 'undefined') {
  ;(globalThis as any).document = {
    createElement: () => ({
      href: '',
      download: '',
      click() {},
    }),
  }
} else if (typeof (globalThis as any).document?.createElement !== 'function') {
  ;(globalThis as any).document.createElement = () => ({
    href: '',
    download: '',
    click() {},
  })
}

import {
  DEFAULT_EXPORT_SETTINGS,
  loadExportSettings,
  saveExportSettings,
  formatFileSize,
  estimateExportDimensions,
  performExport,
  quickExport,
  type ExportSettings,
} from '@/ui/quick-export'

describe('quick-export', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // ── DEFAULT_EXPORT_SETTINGS ──

  describe('DEFAULT_EXPORT_SETTINGS', () => {
    test('has correct format', () => {
      expect(DEFAULT_EXPORT_SETTINGS.format).toBe('png')
    })

    test('has correct scale', () => {
      expect(DEFAULT_EXPORT_SETTINGS.scale).toBe(2)
    })

    test('has correct quality', () => {
      expect(DEFAULT_EXPORT_SETTINGS.quality).toBe(85)
    })

    test('transparent is true by default', () => {
      expect(DEFAULT_EXPORT_SETTINGS.transparent).toBe(true)
    })

    test('embedICC is false by default', () => {
      expect(DEFAULT_EXPORT_SETTINGS.embedICC).toBe(false)
    })

    test('progressive is false by default', () => {
      expect(DEFAULT_EXPORT_SETTINGS.progressive).toBe(false)
    })

    test('svgPrecision is 2', () => {
      expect(DEFAULT_EXPORT_SETTINGS.svgPrecision).toBe(2)
    })

    test('svgMinify is false', () => {
      expect(DEFAULT_EXPORT_SETTINGS.svgMinify).toBe(false)
    })

    test('svgEmbedFonts is false', () => {
      expect(DEFAULT_EXPORT_SETTINGS.svgEmbedFonts).toBe(false)
    })

    test('pdfDPI is 150', () => {
      expect(DEFAULT_EXPORT_SETTINGS.pdfDPI).toBe(150)
    })

    test('webpLossless is false', () => {
      expect(DEFAULT_EXPORT_SETTINGS.webpLossless).toBe(false)
    })

    test('region is artboard', () => {
      expect(DEFAULT_EXPORT_SETTINGS.region).toBe('artboard')
    })

    test('width and height are null', () => {
      expect(DEFAULT_EXPORT_SETTINGS.width).toBeNull()
      expect(DEFAULT_EXPORT_SETTINGS.height).toBeNull()
    })

    test('linkedDimensions is true', () => {
      expect(DEFAULT_EXPORT_SETTINGS.linkedDimensions).toBe(true)
    })
  })

  // ── loadExportSettings ──

  describe('loadExportSettings', () => {
    test('returns defaults when nothing stored', () => {
      const settings = loadExportSettings()
      expect(settings).toEqual(DEFAULT_EXPORT_SETTINGS)
    })

    test('returns a copy, not the same object', () => {
      const s1 = loadExportSettings()
      const s2 = loadExportSettings()
      expect(s1).not.toBe(s2)
      expect(s1).toEqual(s2)
    })

    test('loads stored settings', () => {
      const custom: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        format: 'jpeg',
        scale: 3,
        quality: 90,
      }
      localStorage.setItem('crossdraw:export-settings', JSON.stringify(custom))
      const loaded = loadExportSettings()
      expect(loaded.format).toBe('jpeg')
      expect(loaded.scale).toBe(3)
      expect(loaded.quality).toBe(90)
    })

    test('merges stored settings with defaults', () => {
      localStorage.setItem('crossdraw:export-settings', JSON.stringify({ format: 'svg' }))
      const loaded = loadExportSettings()
      expect(loaded.format).toBe('svg')
      // Other fields should come from defaults
      expect(loaded.scale).toBe(DEFAULT_EXPORT_SETTINGS.scale)
      expect(loaded.quality).toBe(DEFAULT_EXPORT_SETTINGS.quality)
    })

    test('returns defaults on invalid JSON', () => {
      localStorage.setItem('crossdraw:export-settings', 'not json')
      const loaded = loadExportSettings()
      expect(loaded).toEqual(DEFAULT_EXPORT_SETTINGS)
    })
  })

  // ── saveExportSettings ──

  describe('saveExportSettings', () => {
    test('saves settings to localStorage', () => {
      const settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS, format: 'webp', scale: 4 }
      saveExportSettings(settings)
      const stored = localStorage.getItem('crossdraw:export-settings')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.format).toBe('webp')
      expect(parsed.scale).toBe(4)
    })

    test('round-trip save/load', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        format: 'pdf',
        pdfDPI: 300,
        region: 'selection',
      }
      saveExportSettings(settings)
      const loaded = loadExportSettings()
      expect(loaded.format).toBe('pdf')
      expect(loaded.pdfDPI).toBe(300)
      expect(loaded.region).toBe('selection')
    })
  })

  // ── formatFileSize ──

  describe('formatFileSize', () => {
    test('formats bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(100)).toBe('100 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    test('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(10240)).toBe('10.0 KB')
    })

    test('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    })

    test('boundary between KB and MB', () => {
      const justUnderMB = 1024 * 1024 - 1
      expect(formatFileSize(justUnderMB)).toContain('KB')
      expect(formatFileSize(1024 * 1024)).toContain('MB')
    })
  })

  // ── estimateExportDimensions ──

  describe('estimateExportDimensions', () => {
    test('uses explicit width and height when set', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        width: 800,
        height: 600,
      }
      const dims = estimateExportDimensions(settings, 1920, 1080)
      expect(dims.width).toBe(800)
      expect(dims.height).toBe(600)
    })

    test('computes dimensions from artboard and scale', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        scale: 2,
        width: null,
        height: null,
      }
      const dims = estimateExportDimensions(settings, 1920, 1080)
      expect(dims.width).toBe(3840)
      expect(dims.height).toBe(2160)
    })

    test('rounds to nearest pixel', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        scale: 1.5,
        width: null,
        height: null,
      }
      const dims = estimateExportDimensions(settings, 101, 201)
      expect(dims.width).toBe(Math.round(101 * 1.5))
      expect(dims.height).toBe(Math.round(201 * 1.5))
    })

    test('1x scale returns artboard dimensions', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        scale: 1,
        width: null,
        height: null,
      }
      const dims = estimateExportDimensions(settings, 500, 400)
      expect(dims.width).toBe(500)
      expect(dims.height).toBe(400)
    })

    test('uses explicit dimensions even if only partially specified with both', () => {
      // Only uses explicit if BOTH width AND height are set (due to && check)
      const settingsWidthOnly: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        width: 800,
        height: null,
      }
      const dims = estimateExportDimensions(settingsWidthOnly, 1920, 1080)
      // Since height is null, falls through to scale-based calculation
      expect(dims.width).toBe(Math.round(1920 * DEFAULT_EXPORT_SETTINGS.scale))
    })
  })

  // ── performExport ──

  describe('performExport', () => {
    test('is an async function', () => {
      expect(typeof performExport).toBe('function')
    })

    test('throws on unsupported format', async () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        format: 'bmp' as any,
      }
      try {
        await performExport(settings)
        // Should not reach here
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.message).toContain('Unsupported format')
        expect(err.message).toContain('bmp')
      }
    })
  })

  // ── quickExport ──

  describe('quickExport', () => {
    test('is an async function', () => {
      expect(typeof quickExport).toBe('function')
    })

    test('does not throw when called (catches errors internally)', async () => {
      // quickExport wraps everything in try/catch, so even if the store
      // or export functions fail, it should not throw.
      await expect(quickExport()).resolves.toBeUndefined()
    })
  })
})
