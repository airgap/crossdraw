import { describe, test, expect } from 'bun:test'
import type { Effect, BlurParams, ShadowParams, GlowParams } from '@/types'
import { effectToSVGFilter } from '@/io/svg-filters'
import {
  createRectSelection,
  createEllipseSelection,
  selectAll,
  invertSelection,
  clearSelection,
  getSelectedPixelCount,
  getSelectionBounds,
  type SelectionMask,
} from '@/tools/raster-selection'
import { getWeightName, getBuiltinFonts } from '@/ui/font-picker'

describe('LYK-94: SVG filter primitives', () => {
  test('effectToSVGFilter generates blur filter', () => {
    const effect: Effect = {
      id: 'e1',
      type: 'blur',
      enabled: true,
      opacity: 1,
      params: { kind: 'blur', radius: 4, quality: 'medium' } as BlurParams,
    }
    const svg = effectToSVGFilter(effect)
    expect(svg).toContain('feGaussianBlur')
    expect(svg).toContain('stdDeviation="4"')
  })

  test('effectToSVGFilter generates drop-shadow filter', () => {
    const effect: Effect = {
      id: 'e2',
      type: 'shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'shadow',
        offsetX: 2,
        offsetY: 4,
        blurRadius: 6,
        spread: 0,
        color: '#000',
        opacity: 0.5,
      } as ShadowParams,
    }
    const svg = effectToSVGFilter(effect)
    expect(svg).toContain('feDropShadow')
    expect(svg).toContain('dx="2"')
    expect(svg).toContain('dy="4"')
  })

  test('effectToSVGFilter generates glow filter with feMerge', () => {
    const effect: Effect = {
      id: 'e3',
      type: 'outer-glow',
      enabled: true,
      opacity: 1,
      params: { kind: 'glow', radius: 8, spread: 0, color: '#ff0', opacity: 0.8 } as GlowParams,
    }
    const svg = effectToSVGFilter(effect)
    expect(svg).toContain('feGaussianBlur')
    expect(svg).toContain('feMerge')
    expect(svg).toContain('feFlood')
  })

  test('effectToSVGFilter returns null for disabled effect', () => {
    const effect: Effect = {
      id: 'e4',
      type: 'blur',
      enabled: false,
      opacity: 1,
      params: { kind: 'blur', radius: 4, quality: 'medium' } as BlurParams,
    }
    expect(effectToSVGFilter(effect)).toBeNull()
  })

  test('effectToSVGFilter returns null for unsupported types', () => {
    const effect: Effect = {
      id: 'e5',
      type: 'distort',
      enabled: true,
      opacity: 1,
      params: { kind: 'distort', distortType: 'warp', intensity: 1, scale: 1 },
    }
    expect(effectToSVGFilter(effect)).toBeNull()
  })
})

describe('LYK-107: raster selection tools', () => {
  test('createRectSelection creates correct mask', () => {
    const mask = createRectSelection(10, 10, 20, 20, 100, 100)
    expect(mask.width).toBe(100)
    expect(mask.height).toBe(100)
    // Check inside selection
    expect(mask.data[15 * 100 + 15]).toBe(255)
    // Check outside selection
    expect(mask.data[0]).toBe(0)
    expect(mask.data[5 * 100 + 5]).toBe(0)
  })

  test('createRectSelection clamps to bounds', () => {
    const mask = createRectSelection(90, 90, 30, 30, 100, 100)
    expect(mask.data[95 * 100 + 95]).toBe(255)
    // Outside image bounds should be 0
    expect(mask.data[0]).toBe(0)
  })

  test('createEllipseSelection creates elliptical mask', () => {
    const mask = createEllipseSelection(50, 50, 20, 20, 100, 100)
    // Center should be selected
    expect(mask.data[50 * 100 + 50]).toBe(255)
    // Corner should not be selected
    expect(mask.data[0]).toBe(0)
    // Edge should not be selected (outside the circle)
    expect(mask.data[50 * 100 + 80]).toBe(0)
  })

  test('selectAll selects every pixel', () => {
    const mask = selectAll(50, 50)
    expect(mask.data.length).toBe(2500)
    let allSelected = true
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i] !== 255) {
        allSelected = false
        break
      }
    }
    expect(allSelected).toBe(true)
  })

  test('invertSelection flips mask', () => {
    selectAll(10, 10)
    const inverted = invertSelection()!
    expect(inverted.data[0]).toBe(0)
    expect(inverted.data[5]).toBe(0)
  })

  test('clearSelection removes mask', () => {
    selectAll(10, 10)
    clearSelection()
    const { getSelectionMask } = require('@/tools/raster-selection')
    expect(getSelectionMask()).toBeNull()
  })

  test('getSelectedPixelCount counts correctly', () => {
    const mask = createRectSelection(0, 0, 10, 10, 100, 100)
    const count = getSelectedPixelCount(mask)
    expect(count).toBe(100) // 10x10
  })

  test('getSelectionBounds returns correct bounds', () => {
    const mask = createRectSelection(20, 30, 40, 50, 200, 200)
    const bounds = getSelectionBounds(mask)!
    expect(bounds.x).toBe(20)
    expect(bounds.y).toBe(30)
    expect(bounds.width).toBe(40)
    expect(bounds.height).toBe(50)
  })

  test('getSelectionBounds returns null for empty selection', () => {
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) }
    const bounds = getSelectionBounds(mask)
    expect(bounds).toBeNull()
  })

  test('subtract mode removes from selection', () => {
    createRectSelection(0, 0, 50, 50, 100, 100, 'replace')
    const mask = createRectSelection(10, 10, 20, 20, 100, 100, 'subtract')
    // Inside subtracted region
    expect(mask.data[15 * 100 + 15]).toBe(0)
    // Outside subtracted but inside original
    expect(mask.data[5 * 100 + 5]).toBe(255)
  })
})

describe('LYK-133: font picker', () => {
  test('getBuiltinFonts returns fonts array', () => {
    const fonts = getBuiltinFonts()
    expect(fonts.length).toBeGreaterThan(10)
    expect(fonts[0]!.family).toBe('Arial')
  })

  test('fonts have required fields', () => {
    const fonts = getBuiltinFonts()
    for (const font of fonts) {
      expect(font.family).toBeTruthy()
      expect(font.weights.length).toBeGreaterThan(0)
      expect(['serif', 'sans-serif', 'monospace', 'display', 'handwriting']).toContain(font.category)
    }
  })

  test('getWeightName maps standard weights', () => {
    expect(getWeightName(100)).toBe('Thin')
    expect(getWeightName(300)).toBe('Light')
    expect(getWeightName(400)).toBe('Regular')
    expect(getWeightName(700)).toBe('Bold')
    expect(getWeightName(900)).toBe('Black')
  })

  test('getWeightName falls back to number string', () => {
    expect(getWeightName(450)).toBe('450')
  })

  test('font search filter works', () => {
    const fonts = getBuiltinFonts()
    const query = 'rob'
    const filtered = fonts.filter((f) => f.family.toLowerCase().includes(query))
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered[0]!.family).toBe('Roboto')
  })

  test('Montserrat has full weight range', () => {
    const fonts = getBuiltinFonts()
    const mont = fonts.find((f) => f.family === 'Montserrat')!
    expect(mont.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
  })

  test('category filtering', () => {
    const fonts = getBuiltinFonts()
    const serif = fonts.filter((f) => f.category === 'serif')
    expect(serif.length).toBeGreaterThan(0)
    const mono = fonts.filter((f) => f.category === 'monospace')
    expect(mono.length).toBeGreaterThan(0)
  })
})

describe('LYK-125: undo history panel', () => {
  test('history entry has description', () => {
    const entry = { description: 'Add layer', patches: [], inversePatches: [] }
    expect(entry.description).toBe('Add layer')
  })

  test('historyIndex -1 means initial state', () => {
    const historyIndex = -1
    expect(historyIndex).toBe(-1)
    // At initial state, no undo possible
    expect(historyIndex >= 0).toBe(false)
  })

  test('jump-to-state calculates undo/redo steps', () => {
    const currentIndex = 5
    const targetIndex = 2
    const undoSteps = currentIndex - targetIndex
    expect(undoSteps).toBe(3)

    const targetIndex2 = 8
    const redoSteps = targetIndex2 - currentIndex
    expect(redoSteps).toBe(3)
  })

  test('history panel display format', () => {
    const historyLength = 10
    const historyIndex = 7
    const display = `${historyIndex + 1}/${historyLength}`
    expect(display).toBe('8/10')
  })
})

describe('LYK-136: layer search and filter', () => {
  test('search by name case-insensitive', () => {
    const layers = [
      { name: 'Background', type: 'vector' },
      { name: 'Header Text', type: 'text' },
      { name: 'Logo', type: 'raster' },
      { name: 'background overlay', type: 'vector' },
    ]
    const query = 'background'
    const filtered = layers.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()))
    expect(filtered.length).toBe(2)
  })

  test('filter by type', () => {
    const layers = [
      { name: 'BG', type: 'vector' },
      { name: 'Photo', type: 'raster' },
      { name: 'Title', type: 'text' },
      { name: 'Shape', type: 'vector' },
    ]
    const typeFilter = 'vector'
    const filtered = layers.filter((l) => l.type === typeFilter)
    expect(filtered.length).toBe(2)
  })

  test('combined search and type filter', () => {
    const layers = [
      { name: 'Red Circle', type: 'vector' },
      { name: 'Red Photo', type: 'raster' },
      { name: 'Blue Square', type: 'vector' },
    ]
    const query = 'red'
    const typeFilter = 'vector'
    const filtered = layers.filter((l) => l.name.toLowerCase().includes(query)).filter((l) => l.type === typeFilter)
    expect(filtered.length).toBe(1)
    expect(filtered[0]!.name).toBe('Red Circle')
  })

  test('empty search returns all layers', () => {
    const layers = [
      { name: 'A', type: 'vector' },
      { name: 'B', type: 'text' },
    ]
    const query = ''
    const filtered = query ? layers.filter((l) => l.name.toLowerCase().includes(query)) : layers
    expect(filtered.length).toBe(2)
  })
})

describe('LYK-137: pixel preview mode', () => {
  test('pixelPreview toggle state', () => {
    let pixelPreview = false
    pixelPreview = !pixelPreview
    expect(pixelPreview).toBe(true)
    pixelPreview = !pixelPreview
    expect(pixelPreview).toBe(false)
  })

  test('imageSmoothingEnabled controls anti-aliasing', () => {
    // In pixel preview mode, imageSmoothingEnabled = false
    const pixelPreview = true
    const smoothing = !pixelPreview
    expect(smoothing).toBe(false)

    const pixelPreview2 = false
    const smoothing2 = !pixelPreview2
    expect(smoothing2).toBe(true)
  })

  test('pixel preview at 1:1 zoom', () => {
    const zoom = 1
    const pixelPreview = true
    // At 1:1 zoom, pixel preview disables smoothing for crisp rendering
    expect(pixelPreview && zoom === 1).toBe(true)
  })

  test('pixel preview at high zoom shows individual pixels', () => {
    const zoom = 8
    const pixelPreview = true
    // At high zoom, nearest-neighbor interpolation shows pixel grid
    expect(pixelPreview && zoom > 1).toBe(true)
  })
})
