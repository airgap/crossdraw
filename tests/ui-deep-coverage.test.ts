import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'bun:test'

// ── Polyfill ImageData for bun:test ─────────────────────────────

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
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      }
    }
  }
}

// ── Save/restore globals ────────────────────────────────────────

const origWindow = globalThis.window
const origLocalStorage = (globalThis as any).localStorage
const origOffscreenCanvas = globalThis.OffscreenCanvas
const origDocument = (globalThis as any).document
const origCreateImageBitmap = (globalThis as any).createImageBitmap

// Track keydown listeners
const keydownListeners: Array<(e: KeyboardEvent) => void> = []

beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as any).window = {
      addEventListener: (type: string, fn: any) => {
        if (type === 'keydown') keydownListeners.push(fn)
      },
      removeEventListener: (type: string, fn: any) => {
        if (type === 'keydown') {
          const idx = keydownListeners.indexOf(fn)
          if (idx >= 0) keydownListeners.splice(idx, 1)
        }
      },
      devicePixelRatio: 1,
      __openCanvasContextMenu: undefined,
      innerWidth: 1920,
      innerHeight: 1080,
    }
  } else {
    const origAdd = window.addEventListener.bind(window)
    const origRemove = window.removeEventListener.bind(window)
    ;(window as any).addEventListener = (type: string, fn: any, ...args: any[]) => {
      if (type === 'keydown') keydownListeners.push(fn)
      origAdd(type, fn, ...args)
    }
    ;(window as any).removeEventListener = (type: string, fn: any, ...args: any[]) => {
      if (type === 'keydown') {
        const idx = keydownListeners.indexOf(fn)
        if (idx >= 0) keydownListeners.splice(idx, 1)
      }
      origRemove(type, fn, ...args)
    }
  }

  if (typeof (globalThis as any).localStorage === 'undefined') {
    const store = new Map<string, string>()
    ;(globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    }
  }

  // Polyfill OffscreenCanvas
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

  // Polyfill document
  if (typeof (globalThis as any).document === 'undefined') {
    ;(globalThis as any).document = {
      createElement: () => ({
        href: '',
        download: '',
        click() {},
        style: { setProperty: () => {} },
        setAttribute() {},
        appendChild() {},
        removeChild() {},
      }),
      body: {
        appendChild() {},
        removeChild() {},
      },
    }
  }

  // Polyfill createImageBitmap
  if (typeof globalThis.createImageBitmap === 'undefined') {
    ;(globalThis as any).createImageBitmap = async () => ({
      width: 100,
      height: 100,
      close: () => {},
    })
  }
})

afterAll(() => {
  if (origWindow === undefined) delete (globalThis as any).window
  else globalThis.window = origWindow
  if (origLocalStorage === undefined) delete (globalThis as any).localStorage
  else (globalThis as any).localStorage = origLocalStorage
  if (origOffscreenCanvas === undefined) delete (globalThis as any).OffscreenCanvas
  else globalThis.OffscreenCanvas = origOffscreenCanvas
  if (origDocument === undefined) delete (globalThis as any).document
  else (globalThis as any).document = origDocument
  if (origCreateImageBitmap === undefined) delete (globalThis as any).createImageBitmap
  else (globalThis as any).createImageBitmap = origCreateImageBitmap
})

// ── Imports after stubs ─────────────────────────────────────────

import { openCanvasContextMenu } from '@/ui/context-menu'
import { getScrollThumbPosition } from '@/ui/scrollbars'
import { calcMinimapViewport } from '@/ui/minimap'
import { computeHistogram, type HistogramChannel } from '@/ui/histogram'
import {
  DEVICE_PRESETS,
  getPresetsByCategory,
  getPresetById,
  computeResponsiveLayout,
  calcPreviewScale,
} from '@/ui/device-preview'
import { getWeightName, getBuiltinFonts, enumerateSystemFonts } from '@/ui/font-picker'
import {
  initShortcuts,
  getBindings,
  rebindShortcut,
  resetShortcut,
  resetAllShortcuts,
  eventToCombo,
} from '@/ui/shortcut-registry'
import {
  DEFAULT_EXPORT_SETTINGS,
  loadExportSettings,
  saveExportSettings,
  formatFileSize,
  estimateExportDimensions,
  type ExportSettings,
} from '@/ui/quick-export'

// editor-core exports — import from built dist which has proper .d.ts
import { TOKEN_TO_CSS_VAR, applyThemeTokens } from '../packages/editor-core/dist/theme-contract.js'
import { getModeConfig as getModeConfigFromModule } from '../packages/editor-core/dist/mode-config.js'

// ── Helpers ─────────────────────────────────────────────────────

function makeImageData(
  w: number,
  h: number,
  fillFn?: (pixelIndex: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = fillFn ? fillFn(i) : [0, 0, 0, 255]
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return new ImageData(data, w, h)
}

function makeKeyEvent(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  let prevented = false
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.meta ?? false,
    preventDefault: () => {
      prevented = true
    },
    get defaultPrevented() {
      return prevented
    },
    target: { tagName: 'DIV', isContentEditable: false },
  } as unknown as KeyboardEvent
}

function makeLayer(id: string, x: number, y: number, extra: Record<string, any> = {}) {
  return {
    id,
    name: `Layer ${id}`,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    type: 'vector',
    paths: [],
    fill: null,
    stroke: null,
    ...extra,
  }
}

function makeArtboard(layers: any[] = [], w = 1920, h = 1080) {
  return {
    id: 'a1',
    name: 'Test',
    x: 0,
    y: 0,
    width: w,
    height: h,
    backgroundColor: '#ffffff',
    layers,
  }
}

// =====================================================================
// context-menu.tsx -- deep coverage
// =====================================================================

describe('context-menu deep', () => {
  test('openCanvasContextMenu with no callback registered (undefined)', () => {
    delete (window as any).__openCanvasContextMenu
    // Should not throw
    expect(() => openCanvasContextMenu(100, 200)).not.toThrow()
  })

  test('openCanvasContextMenu with string value (not a function)', () => {
    ;(window as any).__openCanvasContextMenu = 'hello'
    expect(() => openCanvasContextMenu(0, 0)).not.toThrow()
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu with null value', () => {
    ;(window as any).__openCanvasContextMenu = null
    expect(() => openCanvasContextMenu(0, 0)).not.toThrow()
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu with arrow function that throws', () => {
    ;(window as any).__openCanvasContextMenu = () => {
      throw new Error('boom')
    }
    // The function itself does not catch, so it should propagate
    expect(() => openCanvasContextMenu(1, 2)).toThrow('boom')
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu passes exact fractional values', () => {
    let receivedX = 0
    let receivedY = 0
    ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
      receivedX = x
      receivedY = y
    }
    openCanvasContextMenu(0.123456789, 999.999)
    expect(receivedX).toBe(0.123456789)
    expect(receivedY).toBe(999.999)
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu with NaN coords', () => {
    let receivedX: number | undefined
    ;(window as any).__openCanvasContextMenu = (x: number, _y: number) => {
      receivedX = x
    }
    openCanvasContextMenu(NaN, NaN)
    expect(Number.isNaN(receivedX)).toBe(true)
    delete (window as any).__openCanvasContextMenu
  })
})

// =====================================================================
// scrollbars.tsx -- deep coverage
// =====================================================================

describe('scrollbars deep', () => {
  test('getScrollThumbPosition with fractional zoom', () => {
    const result = getScrollThumbPosition(50, 600, 800, 0.75)
    // contentSize*zoom = 600, extent = max(600+600, 1200) = 1200
    // thumbSize = max(30, (600/1200)*600) = 300
    expect(result.size).toBeCloseTo(300)
    // offset = 600/2 + 50 = 350, pos = (350/1200) * (600-300) = 87.5
    expect(result.position).toBeCloseTo(87.5)
  })

  test('getScrollThumbPosition with extremely high zoom', () => {
    const result = getScrollThumbPosition(0, 500, 100, 100)
    // contentSize*zoom = 10000, extent = max(10000+500, 1000) = 10500
    // thumbSize = max(30, (500/10500)*500) = max(30, 23.8) = 30
    expect(result.size).toBe(30)
  })

  test('getScrollThumbPosition with 1x1 viewport', () => {
    const result = getScrollThumbPosition(0, 1, 1, 1)
    // extent = max(1+1, 2) = 2, thumbSize = max(30, (1/2)*1) = 30
    expect(result.size).toBe(30)
    // position clamped to max(0, min(1-30, ...)) => 0 (since viewportSize - thumbSize < 0)
    expect(result.position).toBe(0)
  })

  test('getScrollThumbPosition with matching viewport and content', () => {
    const result = getScrollThumbPosition(0, 500, 500, 1)
    // extent = max(500+500, 1000) = 1000
    // thumbSize = max(30, (500/1000)*500) = 250
    expect(result.size).toBeCloseTo(250)
  })

  test('getScrollThumbPosition monotonic position with increasing pan', () => {
    const positions: number[] = []
    for (let pan = -500; pan <= 500; pan += 100) {
      positions.push(getScrollThumbPosition(pan, 800, 1000, 1).position)
    }
    // Position should be monotonically non-decreasing
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]! - 0.01)
    }
  })

  test('getScrollThumbPosition size is always >= 30', () => {
    const testCases = [
      [0, 50, 10000, 10],
      [0, 100, 100000, 50],
      [0, 10, 999999, 100],
    ]
    for (const [pan, vp, content, zoom] of testCases) {
      const result = getScrollThumbPosition(pan!, vp!, content!, zoom!)
      expect(result.size).toBeGreaterThanOrEqual(30)
    }
  })

  test('getScrollThumbPosition position is always within bounds', () => {
    const testCases = [
      [999, 800, 1000, 2],
      [-999, 800, 1000, 2],
      [0, 100, 50, 0.1],
      [5000, 200, 300, 5],
    ]
    for (const [pan, vp, content, zoom] of testCases) {
      const result = getScrollThumbPosition(pan!, vp!, content!, zoom!)
      expect(result.position).toBeGreaterThanOrEqual(0)
      expect(result.position).toBeLessThanOrEqual(vp! - result.size + 0.01)
    }
  })
})

// =====================================================================
// minimap.tsx -- deep coverage
// =====================================================================

describe('minimap deep', () => {
  test('calcMinimapViewport with very small zoom', () => {
    const result = calcMinimapViewport(1000, 1000, 800, 600, 0.1, 0, 0, 150, 100)
    // scale = min(150/1000, 100/1000) = 0.1
    // w = (800/0.1)*0.1 = 800, h = (600/0.1)*0.1 = 600
    expect(result.w).toBeCloseTo(800)
    expect(result.h).toBeCloseTo(600)
  })

  test('calcMinimapViewport with asymmetric minimap dimensions', () => {
    const result = calcMinimapViewport(500, 500, 800, 600, 1, 0, 0, 300, 50)
    // scale = min(300/500, 50/500) = min(0.6, 0.1) = 0.1
    expect(result.w).toBeCloseTo(80) // 800 * 0.1
    expect(result.h).toBeCloseTo(60) // 600 * 0.1
  })

  test('calcMinimapViewport pan affects x and y correctly', () => {
    // panX = -200 => x = (-(-200)/1) * scale = 200 * scale
    const result = calcMinimapViewport(1000, 1000, 800, 600, 1, -200, -300, 100, 100)
    const scale = 0.1
    expect(result.x).toBeCloseTo(200 * scale) // 20
    expect(result.y).toBeCloseTo(300 * scale) // 30
  })

  test('calcMinimapViewport positive pan gives negative viewport offset', () => {
    const result = calcMinimapViewport(1000, 1000, 800, 600, 1, 200, 300, 100, 100)
    const scale = 0.1
    expect(result.x).toBeCloseTo(-200 * scale) // -20
    expect(result.y).toBeCloseTo(-300 * scale) // -30
  })

  test('calcMinimapViewport non-square artboard', () => {
    // artboard 2000x500, minimap 150x100
    const result = calcMinimapViewport(2000, 500, 800, 600, 1, 0, 0, 150, 100)
    // scale = min(150/2000, 100/500) = min(0.075, 0.2) = 0.075
    expect(result.w).toBeCloseTo(800 * 0.075)
    expect(result.h).toBeCloseTo(600 * 0.075)
  })

  test('calcMinimapViewport zoom of 10 makes viewport indicator very small', () => {
    const result = calcMinimapViewport(1000, 1000, 800, 600, 10, 0, 0, 100, 100)
    // scale = 0.1, w = (800/10)*0.1 = 8, h = (600/10)*0.1 = 6
    expect(result.w).toBeCloseTo(8)
    expect(result.h).toBeCloseTo(6)
  })

  test('calcMinimapViewport handles 1x1 artboard', () => {
    const result = calcMinimapViewport(1, 1, 800, 600, 1, 0, 0, 150, 100)
    // scale = min(150, 100) = 100
    expect(result.w).toBeCloseTo(800 * 100)
    expect(result.h).toBeCloseTo(600 * 100)
  })
})

// =====================================================================
// histogram.tsx -- deep coverage
// =====================================================================

describe('histogram deep', () => {
  test('computeHistogram with pure red image', () => {
    const img = makeImageData(10, 10, () => [255, 0, 0, 255])
    const result = computeHistogram(img)
    expect(result.red[255]).toBe(100)
    expect(result.green[0]).toBe(100)
    expect(result.blue[0]).toBe(100)
    // luminance = round(0.2126*255 + 0.7152*0 + 0.0722*0) = round(54.213) = 54
    expect(result.luminance[54]).toBe(100)
  })

  test('computeHistogram with pure green image', () => {
    const img = makeImageData(10, 10, () => [0, 255, 0, 255])
    const result = computeHistogram(img)
    expect(result.red[0]).toBe(100)
    expect(result.green[255]).toBe(100)
    expect(result.blue[0]).toBe(100)
    // luminance = round(0.7152*255) = round(182.376) = 182
    expect(result.luminance[182]).toBe(100)
  })

  test('computeHistogram with pure blue image', () => {
    const img = makeImageData(10, 10, () => [0, 0, 255, 255])
    const result = computeHistogram(img)
    expect(result.red[0]).toBe(100)
    expect(result.green[0]).toBe(100)
    expect(result.blue[255]).toBe(100)
    // luminance = round(0.0722*255) = round(18.411) = 18
    expect(result.luminance[18]).toBe(100)
  })

  test('computeHistogram with gradient image (R varies 0-255)', () => {
    // 256 pixels, each with unique R value
    const img = makeImageData(256, 1, (i) => [i % 256, 128, 64, 255])
    const result = computeHistogram(img)
    // Each red bin should have exactly 1 pixel
    for (let i = 0; i < 256; i++) {
      expect(result.red[i]).toBe(1)
    }
    // Green should all be at 128
    expect(result.green[128]).toBe(256)
    // Blue should all be at 64
    expect(result.blue[64]).toBe(256)
  })

  test('computeHistogram with single pixel image', () => {
    const img = makeImageData(1, 1, () => [100, 150, 200, 255])
    const result = computeHistogram(img)
    expect(result.red[100]).toBe(1)
    expect(result.green[150]).toBe(1)
    expect(result.blue[200]).toBe(1)
    // lum = round(0.2126*100 + 0.7152*150 + 0.0722*200) = round(21.26+107.28+14.44) = round(142.98) = 143
    expect(result.luminance[143]).toBe(1)
  })

  test('computeHistogram channel arrays are all length 256', () => {
    const img = makeImageData(5, 5)
    const result = computeHistogram(img)
    expect(result.red.length).toBe(256)
    expect(result.green.length).toBe(256)
    expect(result.blue.length).toBe(256)
    expect(result.luminance.length).toBe(256)
  })

  test('computeHistogram total pixel count matches across channels', () => {
    const w = 30
    const h = 20
    const img = makeImageData(w, h, (i) => [(i * 3) % 256, (i * 7) % 256, (i * 11) % 256, 255])
    const result = computeHistogram(img)
    const totalR = Array.from(result.red).reduce((a, b) => a + b, 0)
    const totalG = Array.from(result.green).reduce((a, b) => a + b, 0)
    const totalB = Array.from(result.blue).reduce((a, b) => a + b, 0)
    const totalL = Array.from(result.luminance).reduce((a, b) => a + b, 0)
    expect(totalR).toBe(w * h)
    expect(totalG).toBe(w * h)
    expect(totalB).toBe(w * h)
    expect(totalL).toBe(w * h)
  })

  test('computeHistogram with mid-gray yields luminance at 128', () => {
    const img = makeImageData(1, 1, () => [128, 128, 128, 255])
    const result = computeHistogram(img)
    // lum = round(0.2126*128 + 0.7152*128 + 0.0722*128) = round(128) = 128
    expect(result.luminance[128]).toBe(1)
  })

  test('HistogramData type fields are Uint32Array', () => {
    const img = makeImageData(2, 2)
    const result = computeHistogram(img)
    expect(result.red).toBeInstanceOf(Uint32Array)
    expect(result.green).toBeInstanceOf(Uint32Array)
    expect(result.blue).toBeInstanceOf(Uint32Array)
    expect(result.luminance).toBeInstanceOf(Uint32Array)
  })

  test('HistogramChannel type includes expected values', () => {
    // Type-level check - just ensure these are valid
    const channels: HistogramChannel[] = ['rgb', 'red', 'green', 'blue', 'luminance']
    expect(channels.length).toBe(5)
  })
})

// =====================================================================
// device-preview.tsx -- deep coverage
// =====================================================================

describe('device-preview deep', () => {
  describe('DEVICE_PRESETS data validation', () => {
    test('all IDs are unique', () => {
      const ids = DEVICE_PRESETS.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    test('all names are unique', () => {
      const names = DEVICE_PRESETS.map((p) => p.name)
      expect(new Set(names).size).toBe(names.length)
    })

    test('phone presets have dpr defined', () => {
      const phones = getPresetsByCategory('phone')
      for (const p of phones) {
        expect(p.dpr).toBeDefined()
        expect(p.dpr).toBeGreaterThan(0)
      }
    })

    test('tablet presets have dpr defined', () => {
      const tablets = getPresetsByCategory('tablet')
      for (const p of tablets) {
        expect(p.dpr).toBeDefined()
        expect(p.dpr).toBeGreaterThan(0)
      }
    })

    test('specific preset values match expected', () => {
      const iphone15 = getPresetById('iphone-15')!
      expect(iphone15.width).toBe(393)
      expect(iphone15.height).toBe(852)
      expect(iphone15.dpr).toBe(3)
      expect(iphone15.category).toBe('phone')

      const desktop4k = getPresetById('desktop-4k')!
      expect(desktop4k.width).toBe(3840)
      expect(desktop4k.height).toBe(2160)
      expect(desktop4k.category).toBe('desktop')
    })

    test('all presets have height > width (portrait) for phones', () => {
      const phones = getPresetsByCategory('phone')
      for (const p of phones) {
        expect(p.height).toBeGreaterThan(p.width)
      }
    })

    test('total count of presets', () => {
      expect(DEVICE_PRESETS.length).toBe(14)
    })
  })

  describe('getPresetsByCategory comprehensive', () => {
    test('returns correct count for each category', () => {
      expect(getPresetsByCategory('phone').length).toBe(5)
      expect(getPresetsByCategory('tablet').length).toBe(4)
      expect(getPresetsByCategory('desktop').length).toBe(5)
    })

    test('returned presets all belong to the requested category', () => {
      for (const cat of ['phone', 'tablet', 'desktop'] as const) {
        const presets = getPresetsByCategory(cat)
        for (const p of presets) {
          expect(p.category).toBe(cat)
        }
      }
    })
  })

  describe('getPresetById comprehensive', () => {
    test('returns undefined for empty string', () => {
      expect(getPresetById('')).toBeUndefined()
    })

    test('returns undefined for partial match', () => {
      expect(getPresetById('iphone')).toBeUndefined()
    })

    test('finds every preset by its ID', () => {
      for (const p of DEVICE_PRESETS) {
        const found = getPresetById(p.id)
        expect(found).toBeDefined()
        expect(found!.id).toBe(p.id)
        expect(found!.name).toBe(p.name)
      }
    })
  })

  describe('calcPreviewScale comprehensive', () => {
    test('returns 1 when device fits within container with padding', () => {
      // device 100x100, container 200x200, padding 20 => avail 160x160
      const scale = calcPreviewScale(100, 100, 200, 200, 20)
      expect(scale).toBe(1) // device fits, scale capped at 1
    })

    test('returns correct scale when width is limiting', () => {
      // device 1000x500, container 600x600, padding 0
      // widthRatio = 0.6, heightRatio = 1.2
      const scale = calcPreviewScale(1000, 500, 600, 600, 0)
      expect(scale).toBeCloseTo(0.6)
    })

    test('returns correct scale when height is limiting', () => {
      // device 500x1000, container 600x600, padding 0
      // widthRatio = 1.2, heightRatio = 0.6
      const scale = calcPreviewScale(500, 1000, 600, 600, 0)
      expect(scale).toBeCloseTo(0.6)
    })

    test('with default padding of 20', () => {
      // device 1000x1000, container 500x500, padding 20 (default)
      // avail = 460x460, scale = 0.46
      const scale = calcPreviewScale(1000, 1000, 500, 500)
      expect(scale).toBeCloseTo(0.46)
    })

    test('with zero container returns 0 scale', () => {
      const scale = calcPreviewScale(100, 100, 0, 0, 0)
      expect(scale).toBe(0)
    })
  })

  describe('computeResponsiveLayout comprehensive', () => {
    test('with empty layers returns empty array', () => {
      const artboard = makeArtboard([])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result).toEqual([])
    })

    test('with right-pinned constraint', () => {
      const layer = makeLayer('l1', 1800, 100, {
        constraints: { horizontal: 'right', vertical: 'top' },
      })
      const artboard = makeArtboard([layer])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.length).toBe(1)
      // x should be adjusted: 375 - (1920 - 1800) = 375 - 120 = 255
      expect(result[0]!.x).toBeCloseTo(255)
    })

    test('with scale constraint', () => {
      const layer = makeLayer('l1', 960, 540, {
        constraints: { horizontal: 'scale', vertical: 'scale' },
      })
      const artboard = makeArtboard([layer])
      const result = computeResponsiveLayout(artboard, 960, 540)
      expect(result.length).toBe(1)
      expect(typeof result[0]!.scaleX).toBe('number')
      expect(typeof result[0]!.scaleY).toBe('number')
    })

    test('with center constraint', () => {
      const layer = makeLayer('l1', 960, 540, {
        constraints: { horizontal: 'center', vertical: 'center' },
      })
      const artboard = makeArtboard([layer])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.length).toBe(1)
      // Center should reposition proportionally
      expect(typeof result[0]!.x).toBe('number')
    })

    test('multiple layers preserve order', () => {
      const layers = [makeLayer('first', 0, 0), makeLayer('second', 100, 100), makeLayer('third', 200, 200)]
      const artboard = makeArtboard(layers)
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result[0]!.layerId).toBe('first')
      expect(result[1]!.layerId).toBe('second')
      expect(result[2]!.layerId).toBe('third')
    })
  })
})

// =====================================================================
// font-picker.tsx -- deep coverage
// =====================================================================

describe('font-picker deep', () => {
  describe('getWeightName all standard weights', () => {
    test('100 is Thin', () => expect(getWeightName(100)).toBe('Thin'))
    test('200 is ExtraLight', () => expect(getWeightName(200)).toBe('ExtraLight'))
    test('300 is Light', () => expect(getWeightName(300)).toBe('Light'))
    test('400 is Regular', () => expect(getWeightName(400)).toBe('Regular'))
    test('500 is Medium', () => expect(getWeightName(500)).toBe('Medium'))
    test('600 is SemiBold', () => expect(getWeightName(600)).toBe('SemiBold'))
    test('700 is Bold', () => expect(getWeightName(700)).toBe('Bold'))
    test('800 is ExtraBold', () => expect(getWeightName(800)).toBe('ExtraBold'))
    test('900 is Black', () => expect(getWeightName(900)).toBe('Black'))
    test('0 returns "0"', () => expect(getWeightName(0)).toBe('0'))
    test('450 returns "450"', () => expect(getWeightName(450)).toBe('450'))
    test('1000 returns "1000"', () => expect(getWeightName(1000)).toBe('1000'))
  })

  describe('getBuiltinFonts data completeness', () => {
    test('contains expected number of fonts', () => {
      const fonts = getBuiltinFonts()
      expect(fonts.length).toBe(18)
    })

    test('contains all expected categories', () => {
      const fonts = getBuiltinFonts()
      const categories = new Set(fonts.map((f) => f.category))
      expect(categories.has('serif')).toBe(true)
      expect(categories.has('sans-serif')).toBe(true)
      expect(categories.has('monospace')).toBe(true)
      expect(categories.has('display')).toBe(true)
      expect(categories.has('handwriting')).toBe(true)
    })

    test('all fonts have at least one weight', () => {
      for (const font of getBuiltinFonts()) {
        expect(font.weights.length).toBeGreaterThan(0)
      }
    })

    test('all font weights are between 100 and 900', () => {
      for (const font of getBuiltinFonts()) {
        for (const w of font.weights) {
          expect(w).toBeGreaterThanOrEqual(100)
          expect(w).toBeLessThanOrEqual(900)
        }
      }
    })

    test('weights are sorted ascending for each font', () => {
      for (const font of getBuiltinFonts()) {
        for (let i = 1; i < font.weights.length; i++) {
          expect(font.weights[i]!).toBeGreaterThan(font.weights[i - 1]!)
        }
      }
    })

    test('Impact has only weight 400', () => {
      const impact = getBuiltinFonts().find((f) => f.family === 'Impact')
      expect(impact).toBeDefined()
      expect(impact!.weights).toEqual([400])
      expect(impact!.category).toBe('display')
    })

    test('Comic Sans MS is handwriting category', () => {
      const comic = getBuiltinFonts().find((f) => f.family === 'Comic Sans MS')
      expect(comic).toBeDefined()
      expect(comic!.category).toBe('handwriting')
    })

    test('Helvetica has weight 300', () => {
      const helvetica = getBuiltinFonts().find((f) => f.family === 'Helvetica')
      expect(helvetica).toBeDefined()
      expect(helvetica!.weights).toContain(300)
    })

    test('Montserrat has all 9 standard weights', () => {
      const montserrat = getBuiltinFonts().find((f) => f.family === 'Montserrat')
      expect(montserrat).toBeDefined()
      expect(montserrat!.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    })

    test('Times New Roman is serif', () => {
      const tnr = getBuiltinFonts().find((f) => f.family === 'Times New Roman')
      expect(tnr).toBeDefined()
      expect(tnr!.category).toBe('serif')
    })

    test('Courier New is monospace', () => {
      const cn = getBuiltinFonts().find((f) => f.family === 'Courier New')
      expect(cn).toBeDefined()
      expect(cn!.category).toBe('monospace')
    })
  })

  describe('enumerateSystemFonts style parsing', () => {
    test('parses "ExtraLight" as weight 200', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'ExtraLight' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(200)
      delete (window as any).queryLocalFonts
    })

    test('parses "UltraLight" as weight 200', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'UltraLight' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(200)
      delete (window as any).queryLocalFonts
    })

    test('parses "SemiBold" as weight 600', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'SemiBold' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(600)
      delete (window as any).queryLocalFonts
    })

    test('parses "DemiBold" as weight 600', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'DemiBold' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(600)
      delete (window as any).queryLocalFonts
    })

    test('parses "ExtraBold" as weight 800', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'ExtraBold' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(800)
      delete (window as any).queryLocalFonts
    })

    test('parses "UltraBold" as weight 800', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'UltraBold' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(800)
      delete (window as any).queryLocalFonts
    })

    test('parses "Black" as weight 900', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'Black' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(900)
      delete (window as any).queryLocalFonts
    })

    test('parses "Light" as weight 300', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'Light' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(300)
      delete (window as any).queryLocalFonts
    })

    test('parses "Medium" as weight 500', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'Medium' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(500)
      delete (window as any).queryLocalFonts
    })

    test('unknown style defaults to weight 400', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'TestFont', style: 'Oblique' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(400)
      delete (window as any).queryLocalFonts
    })

    test('multiple styles for same family merges and sorts weights', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'BigFont', style: 'Black' }, // 900
        { family: 'BigFont', style: 'Thin' }, // 100
        { family: 'BigFont', style: 'Bold' }, // 700
        { family: 'BigFont', style: 'Regular' }, // 400
        { family: 'BigFont', style: 'Light' }, // 300
        { family: 'BigFont', style: 'Medium' }, // 500
        { family: 'BigFont', style: 'ExtraBold' }, // 800
        { family: 'BigFont', style: 'ExtraLight' }, // 200
        { family: 'BigFont', style: 'SemiBold' }, // 600
      ]
      const fonts = await enumerateSystemFonts()
      expect(fonts.length).toBe(1)
      expect(fonts[0]!.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
      delete (window as any).queryLocalFonts
    })

    test('queryLocalFonts rejection returns builtins', async () => {
      ;(window as any).queryLocalFonts = async () => {
        throw new Error('Permission denied')
      }
      const fonts = await enumerateSystemFonts()
      // Should fallback to builtin fonts
      expect(fonts.length).toBe(18)
      delete (window as any).queryLocalFonts
    })

    test('no queryLocalFonts API returns builtins', async () => {
      // Make sure queryLocalFonts is not present
      delete (window as any).queryLocalFonts
      const fonts = await enumerateSystemFonts()
      expect(fonts.length).toBe(18)
    })

    test('all returned system fonts have category sans-serif', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'FontA', style: 'Regular' },
        { family: 'FontB', style: 'Bold' },
      ]
      const fonts = await enumerateSystemFonts()
      for (const f of fonts) {
        expect(f.category).toBe('sans-serif')
      }
      delete (window as any).queryLocalFonts
    })
  })
})

// =====================================================================
// quick-export.ts -- deep coverage
// =====================================================================

describe('quick-export deep', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('formatFileSize boundary cases', () => {
    test('0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })

    test('just over 1KB boundary', () => {
      expect(formatFileSize(1025)).toBe('1.0 KB')
    })

    test('just under 1MB boundary', () => {
      expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB')
    })

    test('just over 1MB boundary', () => {
      expect(formatFileSize(1024 * 1024 + 1)).toBe('1.0 MB')
    })

    test('500 bytes', () => {
      expect(formatFileSize(500)).toBe('500 B')
    })

    test('1.5 KB', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    test('10 MB', () => {
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB')
    })

    test('very large file (1 GB)', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1024.0 MB')
    })
  })

  describe('estimateExportDimensions comprehensive', () => {
    test('with scale 1 returns artboard dimensions', () => {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 1, width: null, height: null }
      const dims = estimateExportDimensions(settings, 800, 600)
      expect(dims.width).toBe(800)
      expect(dims.height).toBe(600)
    })

    test('with both custom dimensions set', () => {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, width: 100, height: 200 }
      const dims = estimateExportDimensions(settings, 9999, 9999)
      expect(dims.width).toBe(100)
      expect(dims.height).toBe(200)
    })

    test('with scale 3 and no custom dimensions', () => {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 3, width: null, height: null }
      const dims = estimateExportDimensions(settings, 100, 50)
      expect(dims.width).toBe(300)
      expect(dims.height).toBe(150)
    })

    test('rounds to nearest integer', () => {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, scale: 1.5, width: null, height: null }
      const dims = estimateExportDimensions(settings, 101, 77)
      expect(dims.width).toBe(Math.round(101 * 1.5))
      expect(dims.height).toBe(Math.round(77 * 1.5))
    })
  })

  describe('loadExportSettings comprehensive', () => {
    test('returns defaults when nothing stored', () => {
      const settings = loadExportSettings()
      expect(settings).toEqual(DEFAULT_EXPORT_SETTINGS)
    })

    test('invalid JSON returns defaults', () => {
      localStorage.setItem('crossdraw:export-settings', '{{bad')
      const settings = loadExportSettings()
      expect(settings.format).toBe('png')
      expect(settings.scale).toBe(2)
    })

    test('partial override merges correctly', () => {
      localStorage.setItem(
        'crossdraw:export-settings',
        JSON.stringify({
          format: 'webp',
          webpLossless: true,
        }),
      )
      const settings = loadExportSettings()
      expect(settings.format).toBe('webp')
      expect(settings.webpLossless).toBe(true)
      // Defaults still present
      expect(settings.scale).toBe(2)
      expect(settings.quality).toBe(85)
      expect(settings.transparent).toBe(true)
    })

    test('all format types can be stored and loaded', () => {
      for (const format of ['png', 'jpeg', 'svg', 'pdf', 'webp'] as const) {
        localStorage.setItem('crossdraw:export-settings', JSON.stringify({ format }))
        const settings = loadExportSettings()
        expect(settings.format).toBe(format)
      }
    })

    test('region types can be stored and loaded', () => {
      for (const region of ['artboard', 'selection', 'all-artboards'] as const) {
        localStorage.setItem('crossdraw:export-settings', JSON.stringify({ region }))
        const settings = loadExportSettings()
        expect(settings.region).toBe(region)
      }
    })
  })

  describe('saveExportSettings comprehensive', () => {
    test('round-trip: save then load', () => {
      const custom: ExportSettings = {
        format: 'webp',
        scale: 3,
        quality: 90,
        transparent: false,
        embedICC: true,
        progressive: true,
        svgPrecision: 4,
        svgMinify: true,
        svgEmbedFonts: true,
        pdfDPI: 300,
        webpLossless: true,
        region: 'all-artboards',
        width: 500,
        height: 400,
        linkedDimensions: false,
      }
      saveExportSettings(custom)
      const loaded = loadExportSettings()
      expect(loaded).toEqual(custom)
    })

    test('saves null dimensions', () => {
      const settings = { ...DEFAULT_EXPORT_SETTINGS, width: null, height: null }
      saveExportSettings(settings)
      const loaded = loadExportSettings()
      expect(loaded.width).toBeNull()
      expect(loaded.height).toBeNull()
    })
  })

  describe('DEFAULT_EXPORT_SETTINGS defaults', () => {
    test('default format is png', () => expect(DEFAULT_EXPORT_SETTINGS.format).toBe('png'))
    test('default scale is 2', () => expect(DEFAULT_EXPORT_SETTINGS.scale).toBe(2))
    test('default quality is 85', () => expect(DEFAULT_EXPORT_SETTINGS.quality).toBe(85))
    test('default transparent is true', () => expect(DEFAULT_EXPORT_SETTINGS.transparent).toBe(true))
    test('default embedICC is false', () => expect(DEFAULT_EXPORT_SETTINGS.embedICC).toBe(false))
    test('default progressive is false', () => expect(DEFAULT_EXPORT_SETTINGS.progressive).toBe(false))
    test('default svgPrecision is 2', () => expect(DEFAULT_EXPORT_SETTINGS.svgPrecision).toBe(2))
    test('default svgMinify is false', () => expect(DEFAULT_EXPORT_SETTINGS.svgMinify).toBe(false))
    test('default svgEmbedFonts is false', () => expect(DEFAULT_EXPORT_SETTINGS.svgEmbedFonts).toBe(false))
    test('default pdfDPI is 150', () => expect(DEFAULT_EXPORT_SETTINGS.pdfDPI).toBe(150))
    test('default webpLossless is false', () => expect(DEFAULT_EXPORT_SETTINGS.webpLossless).toBe(false))
    test('default region is artboard', () => expect(DEFAULT_EXPORT_SETTINGS.region).toBe('artboard'))
    test('default width is null', () => expect(DEFAULT_EXPORT_SETTINGS.width).toBeNull())
    test('default height is null', () => expect(DEFAULT_EXPORT_SETTINGS.height).toBeNull())
    test('default linkedDimensions is true', () => expect(DEFAULT_EXPORT_SETTINGS.linkedDimensions).toBe(true))
  })
})

// =====================================================================
// shortcut-registry.ts -- deep coverage
// =====================================================================

describe('shortcut-registry deep', () => {
  beforeEach(() => {
    localStorage.clear()
    keydownListeners.length = 0
  })

  describe('eventToCombo comprehensive', () => {
    test('modifier-only key presses return null', () => {
      expect(eventToCombo(makeKeyEvent('Control'))).toBeNull()
      expect(eventToCombo(makeKeyEvent('Shift'))).toBeNull()
      expect(eventToCombo(makeKeyEvent('Alt'))).toBeNull()
      expect(eventToCombo(makeKeyEvent('Meta'))).toBeNull()
    })

    test('space key', () => {
      expect(eventToCombo(makeKeyEvent(' '))).toBe(' ')
    })

    test('F1 key', () => {
      expect(eventToCombo(makeKeyEvent('F1'))).toBe('f1')
    })

    test('escape key', () => {
      expect(eventToCombo(makeKeyEvent('Escape'))).toBe('escape')
    })

    test('delete key', () => {
      expect(eventToCombo(makeKeyEvent('Delete'))).toBe('delete')
    })

    test('backspace key', () => {
      expect(eventToCombo(makeKeyEvent('Backspace'))).toBe('backspace')
    })

    test('enter key', () => {
      expect(eventToCombo(makeKeyEvent('Enter'))).toBe('enter')
    })

    test('arrow keys', () => {
      expect(eventToCombo(makeKeyEvent('ArrowUp'))).toBe('arrowup')
      expect(eventToCombo(makeKeyEvent('ArrowDown'))).toBe('arrowdown')
      expect(eventToCombo(makeKeyEvent('ArrowLeft'))).toBe('arrowleft')
      expect(eventToCombo(makeKeyEvent('ArrowRight'))).toBe('arrowright')
    })

    test('shift+arrow', () => {
      expect(eventToCombo(makeKeyEvent('ArrowUp', { shift: true }))).toBe('shift+arrowup')
    })

    test('ctrl+shift+alt+meta combo', () => {
      const result = eventToCombo(makeKeyEvent('a', { ctrl: true, shift: true, alt: true, meta: true }))
      // meta and ctrl both map to 'ctrl' prefix
      expect(result).toBe('ctrl+shift+alt+a')
    })

    test('number key', () => {
      expect(eventToCombo(makeKeyEvent('0', { ctrl: true }))).toBe('ctrl+0')
    })
  })

  describe('rebindShortcut comprehensive', () => {
    test('rebinding non-existent ID does nothing', () => {
      initShortcuts()
      const before = getBindings().map((b) => b.key)
      rebindShortcut('nonexistent.id', 'ctrl+z')
      const after = getBindings().map((b) => b.key)
      expect(before).toEqual(after)
    })

    test('rebinding converts key to lowercase', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'Ctrl+Shift+V')
      const binding = getBindings().find((b) => b.id === 'tool.select')
      expect(binding!.key).toBe('ctrl+shift+v')
      resetShortcut('tool.select')
    })

    test('rebinding multiple shortcuts persists all', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      rebindShortcut('tool.pen', 'ctrl+2')
      rebindShortcut('tool.rectangle', 'ctrl+3')

      const stored = JSON.parse(localStorage.getItem('crossdraw:shortcuts')!)
      expect(stored['tool.select']).toBe('ctrl+1')
      expect(stored['tool.pen']).toBe('ctrl+2')
      expect(stored['tool.rectangle']).toBe('ctrl+3')

      resetAllShortcuts()
    })

    test('rebinding back to default removes override', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      // Rebind back to default
      rebindShortcut('tool.select', 'v')
      const stored = localStorage.getItem('crossdraw:shortcuts')
      // Either null or doesn't contain tool.select
      if (stored) {
        const parsed = JSON.parse(stored)
        expect(parsed['tool.select']).toBeUndefined()
      }
      resetAllShortcuts()
    })
  })

  describe('resetShortcut comprehensive', () => {
    test('resetting non-existent ID is safe', () => {
      initShortcuts()
      expect(() => resetShortcut('nonexistent.action')).not.toThrow()
    })

    test('resetting already-default shortcut is safe', () => {
      initShortcuts()
      const binding = getBindings().find((b) => b.id === 'tool.select')!
      expect(binding.key).toBe(binding.defaultKey)
      resetShortcut('tool.select')
      expect(binding.key).toBe(binding.defaultKey)
    })
  })

  describe('resetAllShortcuts comprehensive', () => {
    test('restores all bindings to defaults', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      rebindShortcut('tool.pen', 'ctrl+2')
      rebindShortcut('edit.undo', 'ctrl+shift+y')

      resetAllShortcuts()
      for (const b of getBindings()) {
        expect(b.key).toBe(b.defaultKey)
      }
    })

    test('clears localStorage', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      resetAllShortcuts()
      expect(localStorage.getItem('crossdraw:shortcuts')).toBeNull()
    })
  })

  describe('initShortcuts binding completeness', () => {
    test('includes all tool shortcuts', () => {
      initShortcuts()
      const toolBindings = getBindings().filter((b) => b.category === 'tool')
      const toolIds = toolBindings.map((b) => b.id)
      expect(toolIds).toContain('tool.select')
      expect(toolIds).toContain('tool.pen')
      expect(toolIds).toContain('tool.rectangle')
      expect(toolIds).toContain('tool.ellipse')
      expect(toolIds).toContain('tool.polygon')
      expect(toolIds).toContain('tool.star')
      expect(toolIds).toContain('tool.cloneStamp')
      expect(toolIds).toContain('tool.text')
      expect(toolIds).toContain('tool.node')
      expect(toolIds).toContain('tool.eyedropper')
      expect(toolIds).toContain('tool.hand')
      expect(toolIds).toContain('tool.measure')
      expect(toolIds).toContain('tool.brush')
      expect(toolIds).toContain('tool.crop')
      expect(toolIds).toContain('tool.comment')
      expect(toolIds).toContain('tool.line')
      expect(toolIds).toContain('tool.pencil')
      expect(toolIds).toContain('tool.eraser')
      expect(toolIds).toContain('tool.gradient')
      expect(toolIds).toContain('tool.fill')
      expect(toolIds).toContain('tool.zoom')
      expect(toolIds).toContain('tool.lasso')
      expect(toolIds).toContain('tool.marquee')
      expect(toolIds).toContain('tool.knife')
      expect(toolIds).toContain('tool.artboard')
      expect(toolIds).toContain('tool.slice')
    })

    test('includes all edit shortcuts', () => {
      initShortcuts()
      const editBindings = getBindings().filter((b) => b.category === 'edit')
      const editIds = editBindings.map((b) => b.id)
      expect(editIds).toContain('edit.undo')
      expect(editIds).toContain('edit.redo')
      expect(editIds).toContain('edit.selectAll')
      expect(editIds).toContain('edit.deselect')
      expect(editIds).toContain('edit.delete')
      expect(editIds).toContain('edit.copy')
      expect(editIds).toContain('edit.paste')
      expect(editIds).toContain('edit.cut')
      expect(editIds).toContain('edit.copyStyle')
      expect(editIds).toContain('edit.pasteStyle')
      expect(editIds).toContain('edit.flipH')
      expect(editIds).toContain('edit.flipV')
      expect(editIds).toContain('edit.findReplace')
      expect(editIds).toContain('file.newFromClipboard')
      expect(editIds).toContain('file.open')
      expect(editIds).toContain('file.save')
      expect(editIds).toContain('file.saveAs')
      expect(editIds).toContain('file.export')
      expect(editIds).toContain('file.quickExport')
    })

    test('includes all nudge shortcuts', () => {
      initShortcuts()
      const ids = getBindings().map((b) => b.id)
      expect(ids).toContain('edit.nudgeLeft')
      expect(ids).toContain('edit.nudgeRight')
      expect(ids).toContain('edit.nudgeUp')
      expect(ids).toContain('edit.nudgeDown')
      expect(ids).toContain('edit.nudgeLeftBig')
      expect(ids).toContain('edit.nudgeRightBig')
      expect(ids).toContain('edit.nudgeUpBig')
      expect(ids).toContain('edit.nudgeDownBig')
    })

    test('includes view shortcuts', () => {
      initShortcuts()
      const viewBindings = getBindings().filter((b) => b.category === 'view')
      const viewIds = viewBindings.map((b) => b.id)
      expect(viewIds).toContain('view.zoomIn')
      expect(viewIds).toContain('view.zoomOut')
      expect(viewIds).toContain('view.zoomFit')
      expect(viewIds).toContain('view.zoomToSelection')
      expect(viewIds).toContain('view.toggleGrid')
      expect(viewIds).toContain('view.toggleSnap')
      expect(viewIds).toContain('view.toggleRulers')
      expect(viewIds).toContain('view.pixelPreview')
      expect(viewIds).toContain('view.quickMask')
    })

    test('includes layer shortcuts', () => {
      initShortcuts()
      const layerBindings = getBindings().filter((b) => b.category === 'layer')
      const layerIds = layerBindings.map((b) => b.id)
      expect(layerIds).toContain('layer.duplicate')
      expect(layerIds).toContain('layer.group')
      expect(layerIds).toContain('layer.ungroup')
      expect(layerIds).toContain('layer.bringToFront')
      expect(layerIds).toContain('layer.bringForward')
      expect(layerIds).toContain('layer.sendBackward')
      expect(layerIds).toContain('layer.sendToBack')
    })

    test('all bindings have non-empty labels', () => {
      initShortcuts()
      for (const b of getBindings()) {
        expect(b.label.length).toBeGreaterThan(0)
      }
    })

    test('all bindings have non-empty defaultKey', () => {
      initShortcuts()
      for (const b of getBindings()) {
        expect(b.defaultKey.length).toBeGreaterThan(0)
      }
    })

    test('all bindings have action functions', () => {
      initShortcuts()
      for (const b of getBindings()) {
        expect(typeof b.action).toBe('function')
      }
    })
  })

  describe('keydown handler with meta key (macOS-style)', () => {
    test('meta key acts like ctrl for shortcuts', () => {
      initShortcuts()
      const undoBinding = getBindings().find((b) => b.id === 'edit.undo')!
      let called = false
      const orig = undoBinding.action
      undoBinding.action = () => {
        called = true
      }

      const event = {
        key: 'z',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true, // meta instead of ctrl
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(called).toBe(true)
      undoBinding.action = orig
    })

    test('unmatched key with modifiers does not prevent default', () => {
      initShortcuts()
      let prevented = false
      const event = {
        key: '`', // unlikely shortcut
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
        metaKey: false,
        target: { tagName: 'CANVAS', isContentEditable: false },
        preventDefault: () => {
          prevented = true
        },
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(prevented).toBe(false)
    })
  })

  describe('loadCustomBindings with stored overrides for multiple shortcuts', () => {
    test('only overridden bindings change', () => {
      const overrides = {
        'tool.select': 'ctrl+shift+1',
        'tool.pen': 'ctrl+shift+2',
      }
      localStorage.setItem('crossdraw:shortcuts', JSON.stringify(overrides))
      initShortcuts()
      const bindings = getBindings()

      const sel = bindings.find((b) => b.id === 'tool.select')!
      expect(sel.key).toBe('ctrl+shift+1')
      expect(sel.defaultKey).toBe('v')

      const pen = bindings.find((b) => b.id === 'tool.pen')!
      expect(pen.key).toBe('ctrl+shift+2')
      expect(pen.defaultKey).toBe('p')

      // Non-overridden should stay default
      const rect = bindings.find((b) => b.id === 'tool.rectangle')!
      expect(rect.key).toBe(rect.defaultKey)

      resetAllShortcuts()
    })
  })
})

// =====================================================================
// editor-core -- theme-contract.ts
// =====================================================================

describe('editor-core theme-contract', () => {
  test('TOKEN_TO_CSS_VAR has all expected keys', () => {
    const expectedKeys = [
      'bgBase',
      'bgSurface',
      'bgElevated',
      'bgOverlay',
      'bgInput',
      'bgHover',
      'bgActive',
      'canvasBg',
      'borderSubtle',
      'borderDefault',
      'borderStrong',
      'textPrimary',
      'textSecondary',
      'textDisabled',
      'textAccent',
      'accent',
      'accentHover',
      'accentActive',
      'accentDisabled',
      'success',
      'warning',
      'error',
      'info',
    ]
    for (const key of expectedKeys) {
      expect(TOKEN_TO_CSS_VAR[key as keyof typeof TOKEN_TO_CSS_VAR]).toBeDefined()
    }
  })

  test('TOKEN_TO_CSS_VAR values are all CSS custom property format', () => {
    for (const [_key, value] of Object.entries(TOKEN_TO_CSS_VAR)) {
      expect(value).toMatch(/^--[a-z-]+$/)
    }
  })

  test('TOKEN_TO_CSS_VAR has correct mappings', () => {
    expect(TOKEN_TO_CSS_VAR.bgBase).toBe('--bg-base')
    expect(TOKEN_TO_CSS_VAR.bgSurface).toBe('--bg-surface')
    expect(TOKEN_TO_CSS_VAR.bgElevated).toBe('--bg-elevated')
    expect(TOKEN_TO_CSS_VAR.bgOverlay).toBe('--bg-overlay')
    expect(TOKEN_TO_CSS_VAR.bgInput).toBe('--bg-input')
    expect(TOKEN_TO_CSS_VAR.bgHover).toBe('--bg-hover')
    expect(TOKEN_TO_CSS_VAR.bgActive).toBe('--bg-active')
    expect(TOKEN_TO_CSS_VAR.canvasBg).toBe('--canvas-bg')
    expect(TOKEN_TO_CSS_VAR.borderSubtle).toBe('--border-subtle')
    expect(TOKEN_TO_CSS_VAR.borderDefault).toBe('--border-default')
    expect(TOKEN_TO_CSS_VAR.borderStrong).toBe('--border-strong')
    expect(TOKEN_TO_CSS_VAR.textPrimary).toBe('--text-primary')
    expect(TOKEN_TO_CSS_VAR.textSecondary).toBe('--text-secondary')
    expect(TOKEN_TO_CSS_VAR.textDisabled).toBe('--text-disabled')
    expect(TOKEN_TO_CSS_VAR.textAccent).toBe('--text-accent')
    expect(TOKEN_TO_CSS_VAR.accent).toBe('--accent')
    expect(TOKEN_TO_CSS_VAR.accentHover).toBe('--accent-hover')
    expect(TOKEN_TO_CSS_VAR.accentActive).toBe('--accent-active')
    expect(TOKEN_TO_CSS_VAR.accentDisabled).toBe('--accent-disabled')
    expect(TOKEN_TO_CSS_VAR.success).toBe('--success')
    expect(TOKEN_TO_CSS_VAR.warning).toBe('--warning')
    expect(TOKEN_TO_CSS_VAR.error).toBe('--error')
    expect(TOKEN_TO_CSS_VAR.info).toBe('--info')
  })

  test('applyThemeTokens sets CSS properties on element', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, {
      bgBase: '#1a1a2e',
      accent: '#ff6b6b',
      textPrimary: '#ffffff',
    })

    expect(setProps['--bg-base']).toBe('#1a1a2e')
    expect(setProps['--accent']).toBe('#ff6b6b')
    expect(setProps['--text-primary']).toBe('#ffffff')
    // Legacy alias
    expect(setProps['--bg']).toBe('#1a1a2e')
  })

  test('applyThemeTokens sets legacy aliases for bgSurface', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, { bgSurface: '#222244' })
    expect(setProps['--bg-surface']).toBe('#222244')
    expect(setProps['--bg-panel']).toBe('#222244')
  })

  test('applyThemeTokens sets legacy aliases for borderDefault', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, { borderDefault: '#444' })
    expect(setProps['--border-default']).toBe('#444')
    expect(setProps['--border']).toBe('#444')
  })

  test('applyThemeTokens sets legacy aliases for borderStrong', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, { borderStrong: '#888' })
    expect(setProps['--border-strong']).toBe('#888')
    expect(setProps['--border-light']).toBe('#888')
  })

  test('applyThemeTokens sets legacy aliases for textSecondary', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, { textSecondary: '#999' })
    expect(setProps['--text-secondary']).toBe('#999')
    expect(setProps['--text-muted']).toBe('#999')
  })

  test('applyThemeTokens with empty tokens does nothing', () => {
    let propSetCount = 0
    const mockElement = {
      style: {
        setProperty: () => {
          propSetCount++
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, {})
    expect(propSetCount).toBe(0)
  })

  test('applyThemeTokens with all tokens sets all properties', () => {
    const setProps: Record<string, string> = {}
    const mockElement = {
      style: {
        setProperty: (name: string, value: string) => {
          setProps[name] = value
        },
      },
    } as unknown as HTMLElement

    applyThemeTokens(mockElement, {
      bgBase: '#111',
      bgSurface: '#222',
      bgElevated: '#333',
      bgOverlay: '#444',
      bgInput: '#555',
      bgHover: '#666',
      bgActive: '#777',
      canvasBg: '#888',
      borderSubtle: '#999',
      borderDefault: '#aaa',
      borderStrong: '#bbb',
      textPrimary: '#ccc',
      textSecondary: '#ddd',
      textDisabled: '#eee',
      textAccent: '#fff',
      accent: '#f00',
      accentHover: '#0f0',
      accentActive: '#00f',
      accentDisabled: '#ff0',
      success: '#0ff',
      warning: '#f0f',
      error: '#f00',
      info: '#00f',
    })

    // Check a few main tokens
    expect(setProps['--bg-base']).toBe('#111')
    expect(setProps['--accent']).toBe('#f00')
    expect(setProps['--success']).toBe('#0ff')
    // Check legacy aliases
    expect(setProps['--bg']).toBe('#111')
    expect(setProps['--bg-panel']).toBe('#222')
    expect(setProps['--border']).toBe('#aaa')
    expect(setProps['--border-light']).toBe('#bbb')
    expect(setProps['--text-muted']).toBe('#ddd')
  })
})

// =====================================================================
// editor-core -- mode-config.ts
// =====================================================================

describe('editor-core mode-config', () => {
  test('getModeConfig full mode has all expected fields', () => {
    const config = getModeConfigFromModule('full')
    expect(config.menuBar).toBe(true)
    expect(config.statusBar).toBe(true)
    expect(config.breakpointBar).toBe(true)
    expect(config.toolOptionsBar).toBe(true)
    expect(config.maxFileSize).toBe(0)
    expect(config.tools.length).toBeGreaterThan(10)
    expect(config.panels.length).toBeGreaterThan(5)
  })

  test('getModeConfig pngtuber mode is restricted', () => {
    const config = getModeConfigFromModule('pngtuber')
    expect(config.menuBar).toBe(false)
    expect(config.statusBar).toBe(false)
    expect(config.breakpointBar).toBe(false)
    expect(config.toolOptionsBar).toBe(true)
    expect(config.maxFileSize).toBe(2_000_000)
    // Has fewer tools and panels
    expect(config.tools.length).toBeLessThan(getModeConfigFromModule('full').tools.length)
    expect(config.panels.length).toBeLessThan(getModeConfigFromModule('full').panels.length)
  })

  test('getModeConfig full mode includes select and pen tools', () => {
    const config = getModeConfigFromModule('full')
    expect(config.tools).toContain('select')
    expect(config.tools).toContain('pen')
    expect(config.tools).toContain('rectangle')
    expect(config.tools).toContain('ellipse')
    expect(config.tools).toContain('text')
  })

  test('getModeConfig pngtuber mode includes basic tools', () => {
    const config = getModeConfigFromModule('pngtuber')
    expect(config.tools).toContain('select')
    expect(config.tools).toContain('pen')
    expect(config.tools).toContain('brush')
    expect(config.tools).toContain('eraser')
  })

  test('getModeConfig full mode includes layers panel', () => {
    const config = getModeConfigFromModule('full')
    expect(config.panels).toContain('layers')
    expect(config.panels).toContain('properties')
    expect(config.panels).toContain('history')
  })

  test('getModeConfig pngtuber mode includes pngtuber panel', () => {
    const config = getModeConfigFromModule('pngtuber')
    expect(config.panels).toContain('pngtuber')
    expect(config.panels).toContain('layers')
    expect(config.panels).toContain('properties')
  })

  test('getModeConfig with overrides', () => {
    const config = getModeConfigFromModule('full', {
      menuBar: false,
      maxFileSize: 5_000_000,
    })
    expect(config.menuBar).toBe(false) // overridden
    expect(config.maxFileSize).toBe(5_000_000) // overridden
    expect(config.statusBar).toBe(true) // kept from base
  })

  test('getModeConfig pngtuber with overrides', () => {
    const config = getModeConfigFromModule('pngtuber', {
      statusBar: true,
      maxFileSize: 10_000_000,
    })
    expect(config.statusBar).toBe(true) // overridden
    expect(config.maxFileSize).toBe(10_000_000) // overridden
    expect(config.menuBar).toBe(false) // kept from pngtuber base
  })

  test('getModeConfig without overrides returns base config', () => {
    const config1 = getModeConfigFromModule('full')
    const config2 = getModeConfigFromModule('full', undefined)
    expect(config1).toEqual(config2)
  })

  test('getModeConfig overrides with tools array', () => {
    const config = getModeConfigFromModule('pngtuber', {
      tools: ['select', 'pen'],
    })
    expect(config.tools).toEqual(['select', 'pen'])
  })

  test('getModeConfig overrides with panels array', () => {
    const config = getModeConfigFromModule('full', {
      panels: ['layers'],
    })
    expect(config.panels).toEqual(['layers'])
  })

  test('getModeConfig returns a new object each time', () => {
    const a = getModeConfigFromModule('full')
    const b = getModeConfigFromModule('full')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
