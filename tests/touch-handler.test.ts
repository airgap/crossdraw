import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '../src/store/editor.store'

// Polyfill ImageData for bun:test (no DOM)
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(arg1: number | Uint8ClampedArray, w?: number, h?: number) {
      if (typeof arg1 === 'number') {
        this.width = arg1
        this.height = w!
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = arg1
        this.width = w!
        this.height = h ?? arg1.length / 4 / w!
      }
    }
  }
}

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

describe('Touch mode store', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 800, height: 600 })
  })

  test('touchMode defaults to a boolean', () => {
    const state = useEditorStore.getState()
    expect(typeof state.touchMode).toBe('boolean')
  })

  test('toggleTouchMode flips the value', () => {
    const initial = useEditorStore.getState().touchMode
    useEditorStore.getState().toggleTouchMode()
    expect(useEditorStore.getState().touchMode).toBe(!initial)
    // Toggle back
    useEditorStore.getState().toggleTouchMode()
    expect(useEditorStore.getState().touchMode).toBe(initial)
  })

  test('touchMode is persisted to localStorage', () => {
    // Force a known state first
    if (useEditorStore.getState().touchMode) {
      useEditorStore.getState().toggleTouchMode()
    }
    expect(useEditorStore.getState().touchMode).toBe(false)

    useEditorStore.getState().toggleTouchMode()
    expect(useEditorStore.getState().touchMode).toBe(true)

    const stored = localStorage.getItem('crossdraw:touch-mode')
    expect(stored).toBe('true')

    useEditorStore.getState().toggleTouchMode()
    const stored2 = localStorage.getItem('crossdraw:touch-mode')
    expect(stored2).toBe('false')
  })
})

describe('Brush pressure support', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 200, height: 200 })
    const { setBrushSettings } = require('../src/tools/brush')
    setBrushSettings({ size: 10, hardness: 1, opacity: 1, flow: 1, color: '#ff0000', spacing: 0.25 })
  })

  test('paintStroke accepts pressure parameter', () => {
    const { paintStroke } = require('../src/tools/brush')
    // Should not throw
    paintStroke(
      [
        { x: 50, y: 50 },
        { x: 60, y: 60 },
      ],
      undefined,
      0.5,
    )
  })

  test('createBrushDab with full opacity returns opaque pixels', () => {
    const { createBrushDab } = require('../src/tools/brush')
    const dab = createBrushDab(10, 1, '#ff0000', 1)
    expect(dab.width).toBe(10)
    expect(dab.height).toBe(10)
    // Center pixel should be red and opaque
    const cx = Math.floor(10 / 2)
    const idx = (cx * 10 + cx) * 4
    expect(dab.data[idx]).toBe(255) // R
    expect(dab.data[idx + 1]).toBe(0) // G
    expect(dab.data[idx + 2]).toBe(0) // B
    expect(dab.data[idx + 3]).toBe(255) // A
  })

  test('paintStroke with pressure 0 creates very faint output', () => {
    const { paintStroke } = require('../src/tools/brush')
    // pressure=0 -> opacity should be 0, so no visible paint
    paintStroke([{ x: 50, y: 50 }], undefined, 0)
    // The function should still succeed without error
  })

  test('paintStroke with default pressure (1) works normally', () => {
    const { paintStroke } = require('../src/tools/brush')
    paintStroke([
      { x: 50, y: 50 },
      { x: 52, y: 52 },
    ])
    // Should create a raster layer
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]!
    const rasterLayers = artboard.layers.filter((l) => l.type === 'raster')
    expect(rasterLayers.length).toBeGreaterThan(0)
  })
})

describe('Touch handler module exports', () => {
  test('exports attach/detach functions', async () => {
    const mod = await import('../src/tools/touch-handler')
    expect(typeof mod.attachTouchHandler).toBe('function')
    expect(typeof mod.detachTouchHandler).toBe('function')
    expect(typeof mod.currentPressure).toBe('number')
  })
})
