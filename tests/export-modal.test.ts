import { describe, test, expect } from 'bun:test'
import {
  type ExportSettings,
  DEFAULT_EXPORT_SETTINGS,
  loadExportSettings,
  saveExportSettings,
  formatFileSize,
  estimateExportDimensions,
} from '@/ui/quick-export'

describe('Export Settings', () => {
  test('DEFAULT_EXPORT_SETTINGS has correct defaults', () => {
    expect(DEFAULT_EXPORT_SETTINGS.format).toBe('png')
    expect(DEFAULT_EXPORT_SETTINGS.scale).toBe(2)
    expect(DEFAULT_EXPORT_SETTINGS.quality).toBe(85)
    expect(DEFAULT_EXPORT_SETTINGS.transparent).toBe(true)
    expect(DEFAULT_EXPORT_SETTINGS.embedICC).toBe(false)
    expect(DEFAULT_EXPORT_SETTINGS.progressive).toBe(false)
    expect(DEFAULT_EXPORT_SETTINGS.svgPrecision).toBe(2)
    expect(DEFAULT_EXPORT_SETTINGS.svgMinify).toBe(false)
    expect(DEFAULT_EXPORT_SETTINGS.svgEmbedFonts).toBe(false)
    expect(DEFAULT_EXPORT_SETTINGS.pdfDPI).toBe(150)
    expect(DEFAULT_EXPORT_SETTINGS.webpLossless).toBe(false)
    expect(DEFAULT_EXPORT_SETTINGS.region).toBe('artboard')
    expect(DEFAULT_EXPORT_SETTINGS.width).toBeNull()
    expect(DEFAULT_EXPORT_SETTINGS.height).toBeNull()
    expect(DEFAULT_EXPORT_SETTINGS.linkedDimensions).toBe(true)
  })

  test('loadExportSettings returns defaults when no localStorage', () => {
    // In test env localStorage may not persist, but function should not throw
    const settings = loadExportSettings()
    expect(settings.format).toBe('png')
    expect(settings.scale).toBe(2)
  })

  test('saveExportSettings and loadExportSettings round-trip', () => {
    // Skip if localStorage is not available (bun test environment)
    if (typeof globalThis.localStorage === 'undefined') {
      // Provide a minimal mock
      const store: Record<string, string> = {}
      ;(globalThis as any).localStorage = {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val },
        removeItem: (key: string) => { delete store[key] },
      }
    }
    const custom: ExportSettings = {
      ...DEFAULT_EXPORT_SETTINGS,
      format: 'jpeg',
      scale: 3,
      quality: 60,
    }
    saveExportSettings(custom)
    const loaded = loadExportSettings()
    expect(loaded.format).toBe('jpeg')
    expect(loaded.scale).toBe(3)
    expect(loaded.quality).toBe(60)
    // Restore default
    localStorage.removeItem('designer:export-settings')
  })
})

describe('formatFileSize', () => {
  test('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  test('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB')
  })

  test('formats megabytes', () => {
    expect(formatFileSize(1500000)).toBe('1.4 MB')
  })

  test('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })
})

describe('estimateExportDimensions', () => {
  test('uses scale when no custom dimensions', () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 2 }
    const dims = estimateExportDimensions(settings, 1920, 1080)
    expect(dims.width).toBe(3840)
    expect(dims.height).toBe(2160)
  })

  test('uses custom dimensions when set', () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, width: 800, height: 600 }
    const dims = estimateExportDimensions(settings, 1920, 1080)
    expect(dims.width).toBe(800)
    expect(dims.height).toBe(600)
  })

  test('uses scale at 0.5x', () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 0.5 }
    const dims = estimateExportDimensions(settings, 1920, 1080)
    expect(dims.width).toBe(960)
    expect(dims.height).toBe(540)
  })

  test('uses scale at 4x', () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 4 }
    const dims = estimateExportDimensions(settings, 100, 50)
    expect(dims.width).toBe(400)
    expect(dims.height).toBe(200)
  })
})

describe('Export Settings Validation', () => {
  test('all format types are valid', () => {
    const formats = ['png', 'jpeg', 'svg', 'pdf', 'webp'] as const
    for (const fmt of formats) {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, format: fmt }
      expect(settings.format).toBe(fmt)
    }
  })

  test('all region types are valid', () => {
    const regions = ['artboard', 'selection', 'all-artboards'] as const
    for (const region of regions) {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, region }
      expect(settings.region).toBe(region)
    }
  })

  test('quality range is valid (0-100)', () => {
    expect(DEFAULT_EXPORT_SETTINGS.quality).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_EXPORT_SETTINGS.quality).toBeLessThanOrEqual(100)
  })

  test('svgPrecision range is valid (1-6)', () => {
    expect(DEFAULT_EXPORT_SETTINGS.svgPrecision).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_EXPORT_SETTINGS.svgPrecision).toBeLessThanOrEqual(6)
  })

  test('pdfDPI is a standard value', () => {
    expect([72, 150, 300]).toContain(DEFAULT_EXPORT_SETTINGS.pdfDPI)
  })
})

describe('Store export modal state', () => {
  test('showExportModal defaults to false', async () => {
    // Dynamic import to avoid side effects
    const { useEditorStore } = await import('@/store/editor.store')
    expect(useEditorStore.getState().showExportModal).toBe(false)
  })

  test('openExportModal sets to true', async () => {
    const { useEditorStore } = await import('@/store/editor.store')
    useEditorStore.getState().openExportModal()
    expect(useEditorStore.getState().showExportModal).toBe(true)
    // Clean up
    useEditorStore.getState().closeExportModal()
  })

  test('closeExportModal sets to false', async () => {
    const { useEditorStore } = await import('@/store/editor.store')
    useEditorStore.getState().openExportModal()
    useEditorStore.getState().closeExportModal()
    expect(useEditorStore.getState().showExportModal).toBe(false)
  })
})
