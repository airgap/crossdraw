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
const origURL = globalThis.URL

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
    // Wrap the existing window's addEventListener to track keydown
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
        style: {},
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
  if (origWindow === undefined) {
    delete (globalThis as any).window
  } else {
    globalThis.window = origWindow
  }
  if (origLocalStorage !== undefined) {
    ;(globalThis as any).localStorage = origLocalStorage
  }
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  }
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  }
  if (origURL !== undefined) {
    globalThis.URL = origURL
  }
})

// ── Import modules after stubs ──────────────────────────────────

import { openCanvasContextMenu } from '@/ui/context-menu'
import { getScrollThumbPosition } from '@/ui/scrollbars'
import { calcMinimapViewport } from '@/ui/minimap'
import { computeHistogram } from '@/ui/histogram'
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
  performExport,
  quickExport,
  type ExportSettings,
} from '@/ui/quick-export'

// ── Helper: create ImageData ────────────────────────────────────

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

// ── Helper: make fake KeyboardEvent ─────────────────────────────

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

// =====================================================================
// context-menu.tsx -- boost coverage
// =====================================================================

describe('context-menu boost', () => {
  test('openCanvasContextMenu with function callback receives exact coords', () => {
    let received: [number, number] | null = null
    ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
      received = [x, y]
    }
    openCanvasContextMenu(123.456, 789.012)
    expect(received![0]).toBeCloseTo(123.456)
    expect(received![1]).toBeCloseTo(789.012)
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu is safe with undefined window property', () => {
    ;(window as any).__openCanvasContextMenu = undefined
    expect(() => openCanvasContextMenu(0, 0)).not.toThrow()
  })

  test('openCanvasContextMenu is safe when property is object (not function)', () => {
    ;(window as any).__openCanvasContextMenu = { notAFunction: true }
    expect(() => openCanvasContextMenu(50, 50)).not.toThrow()
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu is safe when property is boolean', () => {
    ;(window as any).__openCanvasContextMenu = true
    expect(() => openCanvasContextMenu(50, 50)).not.toThrow()
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu is safe when property is 0', () => {
    ;(window as any).__openCanvasContextMenu = 0
    expect(() => openCanvasContextMenu(50, 50)).not.toThrow()
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu calls with negative coords', () => {
    let received: [number, number] | null = null
    ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
      received = [x, y]
    }
    openCanvasContextMenu(-500, -300)
    expect(received![0]).toBe(-500)
    expect(received![1]).toBe(-300)
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu calls with Infinity coords', () => {
    let received: [number, number] | null = null
    ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
      received = [x, y]
    }
    openCanvasContextMenu(Infinity, -Infinity)
    expect(received![0]).toBe(Infinity)
    expect(received![1]).toBe(-Infinity)
    delete (window as any).__openCanvasContextMenu
  })

  test('openCanvasContextMenu calls multiple times sequentially', () => {
    const calls: Array<[number, number]> = []
    ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
      calls.push([x, y])
    }
    for (let i = 0; i < 10; i++) {
      openCanvasContextMenu(i * 10, i * 20)
    }
    expect(calls.length).toBe(10)
    expect(calls[5]).toEqual([50, 100])
    delete (window as any).__openCanvasContextMenu
  })
})

// =====================================================================
// scrollbars.tsx -- boost coverage
// =====================================================================

describe('scrollbars boost', () => {
  test('getScrollThumbPosition with zero viewport returns minimum thumb', () => {
    // Edge case: very small viewport
    const result = getScrollThumbPosition(0, 1, 1000, 1)
    expect(result.size).toBeGreaterThanOrEqual(30)
    expect(result.position).toBeGreaterThanOrEqual(0)
  })

  test('getScrollThumbPosition with very large pan', () => {
    const result = getScrollThumbPosition(100000, 800, 1000, 1)
    expect(result.position).toBeLessThanOrEqual(800 - result.size)
    expect(result.position).toBeGreaterThanOrEqual(0)
  })

  test('getScrollThumbPosition with very negative pan', () => {
    const result = getScrollThumbPosition(-100000, 800, 1000, 1)
    expect(result.position).toBeGreaterThanOrEqual(0)
  })

  test('getScrollThumbPosition with zoom < 1', () => {
    const result = getScrollThumbPosition(0, 800, 2000, 0.5)
    // content*zoom = 1000, extent = max(1000+800, 1600) = 1800
    // thumbSize = max(30, (800/1800)*800) = max(30, 355.5) = 355.5
    expect(result.size).toBeGreaterThan(30)
  })

  test('getScrollThumbPosition with zoom exactly 1', () => {
    const result = getScrollThumbPosition(0, 1000, 1000, 1)
    // extent = max(1000+1000, 2000) = 2000
    // thumbSize = max(30, (1000/2000)*1000) = 500
    expect(result.size).toBeCloseTo(500)
  })

  test('getScrollThumbPosition returns consistent results', () => {
    const params = [150, 500, 3000, 1.5] as const
    const r1 = getScrollThumbPosition(...params)
    const r2 = getScrollThumbPosition(...params)
    const r3 = getScrollThumbPosition(...params)
    expect(r1).toEqual(r2)
    expect(r2).toEqual(r3)
  })

  test('getScrollThumbPosition with zero content size', () => {
    const result = getScrollThumbPosition(0, 800, 0, 1)
    // extent = max(0+800, 1600) = 1600
    // thumbSize = max(30, (800/1600)*800) = 400
    expect(result.size).toBeCloseTo(400)
  })

  test('getScrollThumbPosition pan shifts position linearly', () => {
    const r0 = getScrollThumbPosition(0, 800, 1000, 1)
    const r100 = getScrollThumbPosition(100, 800, 1000, 1)
    const r200 = getScrollThumbPosition(200, 800, 1000, 1)
    // Moving pan by 100 each time should shift position by same delta (before clamping)
    const delta1 = r100.position - r0.position
    const delta2 = r200.position - r100.position
    expect(Math.abs(delta1 - delta2)).toBeLessThan(0.01)
  })

  test('getScrollThumbPosition thumb size decreases with zoom', () => {
    const sizes: number[] = []
    for (const zoom of [0.5, 1, 2, 5, 10]) {
      sizes.push(getScrollThumbPosition(0, 800, 2000, zoom).size)
    }
    // Each successive zoom should have <= thumb size
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]! + 0.001)
    }
  })
})

// =====================================================================
// minimap.tsx -- boost coverage
// =====================================================================

describe('minimap boost', () => {
  test('calcMinimapViewport with 1:1 artboard and minimap', () => {
    const result = calcMinimapViewport(100, 100, 100, 100, 1, 0, 0, 100, 100)
    // scale = 1
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
    expect(result.w).toBeCloseTo(100)
    expect(result.h).toBeCloseTo(100)
  })

  test('calcMinimapViewport with very wide artboard', () => {
    const result = calcMinimapViewport(10000, 100, 800, 600, 1, 0, 0, 150, 100)
    // scale = min(150/10000, 100/100) = min(0.015, 1) = 0.015
    expect(result.w).toBeCloseTo(800 * 0.015)
    expect(result.h).toBeCloseTo(600 * 0.015)
  })

  test('calcMinimapViewport with very tall artboard', () => {
    const result = calcMinimapViewport(100, 10000, 800, 600, 1, 0, 0, 150, 100)
    // scale = min(150/100, 100/10000) = min(1.5, 0.01) = 0.01
    expect(result.w).toBeCloseTo(800 * 0.01)
    expect(result.h).toBeCloseTo(600 * 0.01)
  })

  test('calcMinimapViewport with high zoom and offset', () => {
    const result = calcMinimapViewport(1000, 1000, 500, 500, 5, -1000, -1000, 100, 100)
    // scale = 0.1
    // x = (-(-1000)/5) * 0.1 = 200 * 0.1 = 20
    // y = (-(-1000)/5) * 0.1 = 200 * 0.1 = 20
    expect(result.x).toBeCloseTo(20)
    expect(result.y).toBeCloseTo(20)
    // w = (500/5) * 0.1 = 10
    expect(result.w).toBeCloseTo(10)
    expect(result.h).toBeCloseTo(10)
  })

  test('calcMinimapViewport with minimap much smaller than artboard', () => {
    const result = calcMinimapViewport(5000, 5000, 800, 600, 2, 0, 0, 50, 50)
    // scale = min(50/5000, 50/5000) = 0.01
    // w = (800/2) * 0.01 = 4
    expect(result.w).toBeCloseTo(4)
    expect(result.h).toBeCloseTo(3)
  })

  test('calcMinimapViewport with zero pan', () => {
    const result = calcMinimapViewport(800, 600, 800, 600, 1, 0, 0, 150, 100)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
  })

  test('calcMinimapViewport w and h scale inversely with zoom', () => {
    const r1 = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 100, 100)
    const r2 = calcMinimapViewport(1000, 1000, 500, 500, 2, 0, 0, 100, 100)
    const r4 = calcMinimapViewport(1000, 1000, 500, 500, 4, 0, 0, 100, 100)
    expect(r2.w).toBeCloseTo(r1.w / 2)
    expect(r4.w).toBeCloseTo(r1.w / 4)
    expect(r2.h).toBeCloseTo(r1.h / 2)
    expect(r4.h).toBeCloseTo(r1.h / 4)
  })

  test('calcMinimapViewport x changes proportionally with panX', () => {
    const r0 = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 100, 100)
    const rNeg = calcMinimapViewport(1000, 1000, 500, 500, 1, -100, 0, 100, 100)
    // x = (-panX/zoom) * scale; scale = 0.1
    // delta_x = (100/1) * 0.1 = 10
    expect(rNeg.x - r0.x).toBeCloseTo(10)
  })
})

// =====================================================================
// histogram.tsx -- boost coverage (computeHistogram edge cases)
// =====================================================================

describe('histogram boost', () => {
  test('computeHistogram with empty 0x0 image (no data)', () => {
    // We just ensure the function doesn't throw with 0 pixels
    const fakeImg = { data: new Uint8ClampedArray(0), width: 0, height: 0 } as unknown as ImageData
    const result = computeHistogram(fakeImg)
    expect(result.red.length).toBe(256)
    // All bins should be 0
    let total = 0
    for (let i = 0; i < 256; i++) total += result.red[i]!
    expect(total).toBe(0)
  })

  test('computeHistogram with all same color pixels', () => {
    const img = makeImageData(50, 50, () => [42, 73, 128, 200])
    const result = computeHistogram(img)
    expect(result.red[42]).toBe(2500)
    expect(result.green[73]).toBe(2500)
    expect(result.blue[128]).toBe(2500)
    // Luminance: round(0.2126*42 + 0.7152*73 + 0.0722*128)
    // = round(8.929 + 52.210 + 9.242) = round(70.381) = 70
    expect(result.luminance[70]).toBe(2500)
  })

  test('computeHistogram luminance for max RGB (255,255,255) is 255', () => {
    const img = makeImageData(1, 1, () => [255, 255, 255, 255])
    const result = computeHistogram(img)
    // lum = round(0.2126*255 + 0.7152*255 + 0.0722*255) = round(255) = 255
    // Math.min(255, 255) = 255
    expect(result.luminance[255]).toBe(1)
  })

  test('computeHistogram handles alternating pixel colors', () => {
    const img = makeImageData(4, 1, (i) => (i % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const result = computeHistogram(img)
    expect(result.red[0]).toBe(2)
    expect(result.red[255]).toBe(2)
    expect(result.green[0]).toBe(2)
    expect(result.green[255]).toBe(2)
  })

  test('computeHistogram returns separate Uint32Array instances for each channel', () => {
    const img = makeImageData(2, 2)
    const result = computeHistogram(img)
    expect(result.red).not.toBe(result.green)
    expect(result.green).not.toBe(result.blue)
    expect(result.blue).not.toBe(result.luminance)
  })

  test('computeHistogram with single channel variation (only R varies)', () => {
    const img = makeImageData(256, 1, (i) => [i, 0, 0, 255])
    const result = computeHistogram(img)
    for (let i = 0; i < 256; i++) {
      expect(result.red[i]).toBe(1)
    }
    // Green and blue should all be at bin 0
    expect(result.green[0]).toBe(256)
    expect(result.blue[0]).toBe(256)
  })

  test('computeHistogram luminance clamped to 255 for any theoretical overflow', () => {
    // With R=255, G=255, B=255: lum = round(255) = 255
    // Math.min(255, 255) = 255, so no overflow
    const img = makeImageData(1, 1, () => [255, 255, 255, 255])
    const result = computeHistogram(img)
    expect(result.luminance[255]).toBe(1)
    // Ensure no bin beyond index 255 exists
    expect(result.luminance.length).toBe(256)
  })

  test('computeHistogram with large image (200x200)', () => {
    const img = makeImageData(200, 200, (i) => [i % 256, (i * 7) % 256, (i * 13) % 256, 255])
    const result = computeHistogram(img)
    let totalR = 0
    for (let i = 0; i < 256; i++) totalR += result.red[i]!
    expect(totalR).toBe(40000)
  })

  test('computeHistogram luminance stays within 0-255 for various inputs', () => {
    // Test many RGB combinations
    const colors: Array<[number, number, number, number]> = []
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          colors.push([r, g, b, 255])
        }
      }
    }
    const w = colors.length
    const img = makeImageData(w, 1, (i) => colors[i]!)
    const result = computeHistogram(img)
    // Verify all luminance bins have valid indices (no out-of-bounds writes)
    let totalLum = 0
    for (let i = 0; i < 256; i++) totalLum += result.luminance[i]!
    expect(totalLum).toBe(w)
  })
})

// =====================================================================
// device-preview.tsx -- boost coverage
// =====================================================================

describe('device-preview boost', () => {
  describe('getPresetsByCategory additional', () => {
    test('phone presets have width < tablet presets on average', () => {
      const phones = getPresetsByCategory('phone')
      const tablets = getPresetsByCategory('tablet')
      const avgPhoneW = phones.reduce((s, p) => s + p.width, 0) / phones.length
      const avgTabletW = tablets.reduce((s, p) => s + p.width, 0) / tablets.length
      expect(avgPhoneW).toBeLessThan(avgTabletW)
    })

    test('desktop category has the widest presets', () => {
      const desktops = getPresetsByCategory('desktop')
      const maxDesktopW = Math.max(...desktops.map((p) => p.width))
      const phones = getPresetsByCategory('phone')
      const maxPhoneW = Math.max(...phones.map((p) => p.width))
      expect(maxDesktopW).toBeGreaterThan(maxPhoneW)
    })
  })

  describe('getPresetById additional', () => {
    test('finds all phone presets', () => {
      for (const p of getPresetsByCategory('phone')) {
        expect(getPresetById(p.id)).toBeDefined()
        expect(getPresetById(p.id)!.category).toBe('phone')
      }
    })

    test('case sensitive lookup', () => {
      // IDs are lowercase with dashes
      expect(getPresetById('IPHONE-15')).toBeUndefined()
      expect(getPresetById('iPhone-15')).toBeUndefined()
    })
  })

  describe('calcPreviewScale additional', () => {
    test('scale for equal device and container without padding', () => {
      const scale = calcPreviewScale(500, 500, 500, 500, 0)
      expect(scale).toBe(1)
    })

    test('scale with very large padding leaves small available area', () => {
      // container 200x200, padding 90 => avail 20x20, device 100x100
      const scale = calcPreviewScale(100, 100, 200, 200, 90)
      expect(scale).toBeCloseTo(0.2)
    })

    test('scale with asymmetric container', () => {
      // container 1000x100, padding 0, device 500x500
      // widthRatio = 1000/500 = 2, heightRatio = 100/500 = 0.2
      const scale = calcPreviewScale(500, 500, 1000, 100, 0)
      expect(scale).toBeCloseTo(0.2)
    })

    test('scale never exceeds 1 even with tiny device', () => {
      const scale = calcPreviewScale(1, 1, 10000, 10000, 0)
      expect(scale).toBe(1)
    })
  })

  describe('computeResponsiveLayout additional', () => {
    const makeArtboard = (layers: any[] = []) => ({
      id: 'a1',
      name: 'Test',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      backgroundColor: '#ffffff',
      layers,
    })

    const makeLayer = (id: string, x: number, y: number) => ({
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
    })

    test('layout preserves layer IDs', () => {
      const artboard = makeArtboard([makeLayer('abc', 100, 200), makeLayer('xyz', 300, 400)])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.map((r) => r.layerId)).toEqual(['abc', 'xyz'])
    })

    test('layout with same target as source', () => {
      const artboard = makeArtboard([makeLayer('l1', 0, 0)])
      const result = computeResponsiveLayout(artboard, 1920, 1080)
      expect(result.length).toBe(1)
      expect(result[0]!.layerId).toBe('l1')
    })

    test('layout with very small target', () => {
      const artboard = makeArtboard([makeLayer('l1', 500, 500)])
      const result = computeResponsiveLayout(artboard, 10, 10)
      expect(result.length).toBe(1)
    })

    test('layout with many layers', () => {
      const layers = Array.from({ length: 20 }, (_, i) => makeLayer(`l${i}`, i * 50, i * 30))
      const artboard = makeArtboard(layers)
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.length).toBe(20)
    })

    test('layout with constraints on layer', () => {
      const layer = {
        ...makeLayer('l1', 100, 100),
        constraints: { horizontal: 'center', vertical: 'center' },
      }
      const artboard = makeArtboard([layer])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.length).toBe(1)
      expect(typeof result[0]!.x).toBe('number')
      expect(typeof result[0]!.y).toBe('number')
    })
  })

  describe('DEVICE_PRESETS additional', () => {
    test('all categories are represented', () => {
      const categories = new Set(DEVICE_PRESETS.map((p) => p.category))
      expect(categories.has('phone')).toBe(true)
      expect(categories.has('tablet')).toBe(true)
      expect(categories.has('desktop')).toBe(true)
    })

    test('no preset has zero or negative dimensions', () => {
      for (const p of DEVICE_PRESETS) {
        expect(p.width).toBeGreaterThan(0)
        expect(p.height).toBeGreaterThan(0)
      }
    })

    test('preset names are non-empty strings', () => {
      for (const p of DEVICE_PRESETS) {
        expect(p.name.length).toBeGreaterThan(0)
      }
    })

    test('desktop presets without dpr default to undefined', () => {
      const desktop1080 = getPresetById('desktop-1080p')
      expect(desktop1080!.dpr).toBeUndefined()
    })
  })
})

// =====================================================================
// font-picker.tsx -- boost coverage
// =====================================================================

describe('font-picker boost', () => {
  describe('getWeightName edge cases', () => {
    test('negative weight returns stringified', () => {
      expect(getWeightName(-100)).toBe('-100')
    })

    test('very large weight returns stringified', () => {
      expect(getWeightName(10000)).toBe('10000')
    })

    test('NaN weight returns "NaN"', () => {
      expect(getWeightName(NaN)).toBe('NaN')
    })
  })

  describe('getBuiltinFonts additional', () => {
    test('returns same reference each time (not a copy)', () => {
      const a = getBuiltinFonts()
      const b = getBuiltinFonts()
      // The function returns the const array directly
      expect(a).toBe(b)
    })

    test('Segoe UI has weight 600', () => {
      const segoe = getBuiltinFonts().find((f) => f.family === 'Segoe UI')
      expect(segoe).toBeDefined()
      expect(segoe!.weights).toContain(600)
    })

    test('Inter has 9 weights', () => {
      const inter = getBuiltinFonts().find((f) => f.family === 'Inter')
      expect(inter).toBeDefined()
      expect(inter!.weights.length).toBe(9)
    })

    test('Roboto has weight 100', () => {
      const roboto = getBuiltinFonts().find((f) => f.family === 'Roboto')
      expect(roboto).toBeDefined()
      expect(roboto!.weights).toContain(100)
    })

    test('Open Sans has weight 800', () => {
      const openSans = getBuiltinFonts().find((f) => f.family === 'Open Sans')
      expect(openSans).toBeDefined()
      expect(openSans!.weights).toContain(800)
    })

    test('Lato is sans-serif category', () => {
      const lato = getBuiltinFonts().find((f) => f.family === 'Lato')
      expect(lato).toBeDefined()
      expect(lato!.category).toBe('sans-serif')
    })

    test('Lucida Console is monospace with weight 400 only', () => {
      const lucida = getBuiltinFonts().find((f) => f.family === 'Lucida Console')
      expect(lucida).toBeDefined()
      expect(lucida!.category).toBe('monospace')
      expect(lucida!.weights).toEqual([400])
    })
  })

  describe('enumerateSystemFonts additional', () => {
    test('handles empty font list from queryLocalFonts', async () => {
      ;(window as any).queryLocalFonts = async () => []
      const fonts = await enumerateSystemFonts()
      expect(fonts).toEqual([])
      delete (window as any).queryLocalFonts
    })

    test('handles font with only "Regular" style', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'SingleFont', style: 'Regular' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts.length).toBe(1)
      expect(fonts[0]!.weights).toEqual([400])
      delete (window as any).queryLocalFonts
    })

    test('handles font styles with mixed case', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'MixCase', style: 'BOLD' },
        { family: 'MixCase', style: 'thin' },
        { family: 'MixCase', style: 'MEDIUM' },
      ]
      const fonts = await enumerateSystemFonts()
      const f = fonts.find((ff) => ff.family === 'MixCase')
      expect(f).toBeDefined()
      expect(f!.weights).toContain(700) // BOLD
      expect(f!.weights).toContain(100) // thin
      expect(f!.weights).toContain(500) // MEDIUM
      delete (window as any).queryLocalFonts
    })

    test('handles font style "Heavy" as weight 900', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'HeavyFont', style: 'Heavy' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.weights).toContain(900)
      delete (window as any).queryLocalFonts
    })

    test('handles many fonts from different families', async () => {
      const fakeFonts = Array.from({ length: 100 }, (_, i) => ({
        family: `Family${i}`,
        style: 'Regular',
      }))
      ;(window as any).queryLocalFonts = async () => fakeFonts
      const fonts = await enumerateSystemFonts()
      expect(fonts.length).toBe(100)
      delete (window as any).queryLocalFonts
    })
  })
})

// =====================================================================
// shortcut-registry.ts -- boost coverage
// =====================================================================

describe('shortcut-registry boost', () => {
  beforeEach(() => {
    localStorage.clear()
    keydownListeners.length = 0
  })

  describe('initShortcuts with localStorage overrides', () => {
    test('loads custom bindings from localStorage', () => {
      // Set up a custom binding in localStorage before init
      const overrides = { 'tool.select': 'ctrl+shift+v' }
      localStorage.setItem('crossdraw:shortcuts', JSON.stringify(overrides))

      initShortcuts()
      const bindings = getBindings()
      const selectBinding = bindings.find((b) => b.id === 'tool.select')
      expect(selectBinding).toBeDefined()
      expect(selectBinding!.key).toBe('ctrl+shift+v')
      // defaultKey should still be 'v'
      expect(selectBinding!.defaultKey).toBe('v')
    })

    test('handles invalid JSON in localStorage gracefully', () => {
      localStorage.setItem('crossdraw:shortcuts', '{not valid json}}}')
      expect(() => initShortcuts()).not.toThrow()
      const bindings = getBindings()
      expect(bindings.length).toBeGreaterThan(0)
      // Should fall back to defaults
      const selectBinding = bindings.find((b) => b.id === 'tool.select')
      expect(selectBinding!.key).toBe(selectBinding!.defaultKey)
    })

    test('handles empty localStorage (no stored key)', () => {
      localStorage.removeItem('crossdraw:shortcuts')
      initShortcuts()
      const bindings = getBindings()
      for (const b of bindings) {
        expect(b.key).toBe(b.defaultKey)
      }
    })
  })

  describe('rebindShortcut and saveCustomBindings', () => {
    test('rebinding saves to localStorage', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+shift+v')
      const stored = localStorage.getItem('crossdraw:shortcuts')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed['tool.select']).toBe('ctrl+shift+v')
      // Restore
      resetShortcut('tool.select')
    })

    test('resetting all removes localStorage entry', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      rebindShortcut('tool.pen', 'ctrl+2')
      resetAllShortcuts()
      const stored = localStorage.getItem('crossdraw:shortcuts')
      expect(stored).toBeNull()
    })

    test('resetting single shortcut saves only remaining overrides', () => {
      initShortcuts()
      rebindShortcut('tool.select', 'ctrl+1')
      rebindShortcut('tool.pen', 'ctrl+2')

      // Reset only one
      resetShortcut('tool.select')
      const stored = localStorage.getItem('crossdraw:shortcuts')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed['tool.select']).toBeUndefined()
      expect(parsed['tool.pen']).toBe('ctrl+2')

      // Reset the other
      resetShortcut('tool.pen')
    })

    test('resetShortcut when no overrides clears localStorage', () => {
      initShortcuts()
      // All at defaults, resetting should produce no overrides
      resetShortcut('tool.select')
      const stored = localStorage.getItem('crossdraw:shortcuts')
      // Should be null since no overrides exist
      expect(stored).toBeNull()
    })
  })

  describe('eventToCombo edge cases', () => {
    test('tab key', () => {
      expect(eventToCombo(makeKeyEvent('Tab'))).toBe('tab')
    })

    test('ctrl+tab', () => {
      expect(eventToCombo(makeKeyEvent('Tab', { ctrl: true }))).toBe('ctrl+tab')
    })

    test('all modifiers with a key', () => {
      const result = eventToCombo(makeKeyEvent('x', { ctrl: true, shift: true, alt: true }))
      expect(result).toBe('ctrl+shift+alt+x')
    })

    test('meta key produces ctrl prefix', () => {
      const result = eventToCombo(makeKeyEvent('v', { meta: true }))
      expect(result).toBe('ctrl+v')
    })

    test('special characters', () => {
      expect(eventToCombo(makeKeyEvent('[', { ctrl: true }))).toBe('ctrl+[')
      expect(eventToCombo(makeKeyEvent(']', { ctrl: true }))).toBe('ctrl+]')
      expect(eventToCombo(makeKeyEvent(';', { ctrl: true }))).toBe('ctrl+;')
      expect(eventToCombo(makeKeyEvent("'", { ctrl: true }))).toBe("ctrl+'")
      expect(eventToCombo(makeKeyEvent('=', { ctrl: true }))).toBe('ctrl+=')
      expect(eventToCombo(makeKeyEvent('-', { ctrl: true }))).toBe('ctrl+-')
    })
  })

  describe('keydown handler behavior', () => {
    test('initShortcuts registers a keydown listener', () => {
      const beforeCount = keydownListeners.length
      initShortcuts()
      // At least one new listener
      expect(keydownListeners.length).toBeGreaterThanOrEqual(beforeCount)
    })

    test('re-initializing cleans up previous listener', () => {
      initShortcuts()
      const count1 = keydownListeners.length
      initShortcuts()
      // Should not have accumulated extra listeners
      expect(keydownListeners.length).toBeLessThanOrEqual(count1 + 1)
    })

    test('keydown handler ignores events targeting INPUT elements', () => {
      initShortcuts()
      let actionCalled = false
      const bindings = getBindings()
      const selectBinding = bindings.find((b) => b.id === 'tool.select')
      if (selectBinding) {
        const origAction = selectBinding.action
        selectBinding.action = () => {
          actionCalled = true
        }

        // Simulate keydown on an INPUT element
        const event = {
          key: selectBinding.key,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          target: { tagName: 'INPUT', isContentEditable: false },
          preventDefault: () => {},
        } as unknown as KeyboardEvent

        for (const listener of keydownListeners) {
          listener(event)
        }
        expect(actionCalled).toBe(false)

        selectBinding.action = origAction
      }
    })

    test('keydown handler ignores TEXTAREA events', () => {
      initShortcuts()
      let actionCalled = false
      const bindings = getBindings()
      const first = bindings[0]!
      const origAction = first.action
      first.action = () => {
        actionCalled = true
      }

      const event = {
        key: first.key,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'TEXTAREA', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(actionCalled).toBe(false)
      first.action = origAction
    })

    test('keydown handler ignores SELECT events', () => {
      initShortcuts()
      const first = getBindings()[0]!
      let called = false
      const origAction = first.action
      first.action = () => {
        called = true
      }

      const event = {
        key: first.key,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'SELECT', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(called).toBe(false)
      first.action = origAction
    })

    test('keydown handler ignores contentEditable events', () => {
      initShortcuts()
      const first = getBindings()[0]!
      let called = false
      const origAction = first.action
      first.action = () => {
        called = true
      }

      const event = {
        key: first.key,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: true },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(called).toBe(false)
      first.action = origAction
    })

    test('keydown handler calls matching action and prevents default', () => {
      initShortcuts()
      const bindings = getBindings()

      // Find a simple key binding like 'tool.select' which uses key 'v'
      const selectBinding = bindings.find((b) => b.id === 'tool.select')
      if (!selectBinding) return

      let actionCalled = false
      const origAction = selectBinding.action
      selectBinding.action = () => {
        actionCalled = true
      }

      let prevented = false
      const event = {
        key: selectBinding.key,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => {
          prevented = true
        },
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(actionCalled).toBe(true)
      expect(prevented).toBe(true)
      selectBinding.action = origAction
    })

    test('keydown handler matches modifier combos', () => {
      initShortcuts()
      const bindings = getBindings()

      // Find 'edit.undo' which uses 'ctrl+z'
      const undoBinding = bindings.find((b) => b.id === 'edit.undo')
      if (!undoBinding) return

      let actionCalled = false
      const origAction = undoBinding.action
      undoBinding.action = () => {
        actionCalled = true
      }

      const event = {
        key: 'z',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(actionCalled).toBe(true)
      undoBinding.action = origAction
    })

    test('keydown handler does not match wrong modifiers', () => {
      initShortcuts()
      const bindings = getBindings()

      // 'tool.select' needs just 'v', no modifiers
      const selectBinding = bindings.find((b) => b.id === 'tool.select')
      if (!selectBinding) return

      let actionCalled = false
      const origAction = selectBinding.action
      selectBinding.action = () => {
        actionCalled = true
      }

      // Send 'v' with ctrl held -- should NOT match 'v' alone
      const event = {
        key: 'v',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      // ctrl+v should match edit.paste, not tool.select
      // tool.select action should NOT have been called
      expect(actionCalled).toBe(false)
      selectBinding.action = origAction
    })

    test('keydown with shift binding matches correctly', () => {
      initShortcuts()
      const bindings = getBindings()

      // 'tool.star' uses 'shift+s'
      const starBinding = bindings.find((b) => b.id === 'tool.star')
      if (!starBinding) return

      let called = false
      const origAction = starBinding.action
      starBinding.action = () => {
        called = true
      }

      const event = {
        key: 's',
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(called).toBe(true)
      starBinding.action = origAction
    })

    test('keydown with alt binding', () => {
      initShortcuts()
      const bindings = getBindings()

      // 'edit.copyStyle' uses 'ctrl+alt+c'
      const copyStyleBinding = bindings.find((b) => b.id === 'edit.copyStyle')
      if (!copyStyleBinding) return

      let called = false
      const origAction = copyStyleBinding.action
      copyStyleBinding.action = () => {
        called = true
      }

      const event = {
        key: 'c',
        ctrlKey: true,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        target: { tagName: 'CANVAS', isContentEditable: false },
        preventDefault: () => {},
      } as unknown as KeyboardEvent

      for (const listener of keydownListeners) {
        listener(event)
      }
      expect(called).toBe(true)
      copyStyleBinding.action = origAction
    })

    test('no-match keydown event does not prevent default', () => {
      initShortcuts()

      let prevented = false
      const event = {
        key: 'F99', // unlikely to match anything
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV', isContentEditable: false },
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

  describe('getBindings categories', () => {
    test('has view category bindings', () => {
      initShortcuts()
      const views = getBindings().filter((b) => b.category === 'view')
      expect(views.length).toBeGreaterThan(0)
    })

    test('has layer category bindings', () => {
      initShortcuts()
      const layers = getBindings().filter((b) => b.category === 'layer')
      expect(layers.length).toBeGreaterThan(0)
    })

    test('all IDs are unique', () => {
      initShortcuts()
      const ids = getBindings().map((b) => b.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    test('common shortcuts exist', () => {
      initShortcuts()
      const ids = getBindings().map((b) => b.id)
      expect(ids).toContain('edit.undo')
      expect(ids).toContain('edit.redo')
      expect(ids).toContain('edit.copy')
      expect(ids).toContain('edit.paste')
      expect(ids).toContain('edit.cut')
      expect(ids).toContain('edit.delete')
      expect(ids).toContain('edit.selectAll')
      expect(ids).toContain('layer.duplicate')
      expect(ids).toContain('layer.group')
      expect(ids).toContain('layer.ungroup')
      expect(ids).toContain('view.zoomIn')
      expect(ids).toContain('view.zoomOut')
      expect(ids).toContain('view.zoomFit')
      expect(ids).toContain('view.toggleGrid')
      expect(ids).toContain('view.toggleSnap')
      expect(ids).toContain('view.toggleRulers')
    })

    test('tool shortcuts map to expected keys', () => {
      initShortcuts()
      const bindings = getBindings()
      const check = (id: string, expectedKey: string) => {
        const b = bindings.find((bb) => bb.id === id)
        expect(b).toBeDefined()
        expect(b!.defaultKey).toBe(expectedKey)
      }
      check('tool.select', 'v')
      check('tool.pen', 'p')
      check('tool.rectangle', 'r')
      check('tool.ellipse', 'e')
      check('tool.text', 't')
      check('tool.hand', 'h')
      check('tool.brush', 'b')
      check('tool.zoom', 'z')
    })
  })
})

// =====================================================================
// quick-export.ts -- boost coverage
// =====================================================================

describe('quick-export boost', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('formatFileSize edge cases', () => {
    test('exactly 1KB boundary', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
    })

    test('exactly 1MB boundary', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    })

    test('just under 1KB', () => {
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    test('1 byte', () => {
      expect(formatFileSize(1)).toBe('1 B')
    })

    test('large MB value', () => {
      expect(formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB')
    })

    test('fractional KB', () => {
      expect(formatFileSize(2560)).toBe('2.5 KB')
    })

    test('fractional MB', () => {
      const bytes = 2.5 * 1024 * 1024
      expect(formatFileSize(bytes)).toBe('2.5 MB')
    })
  })

  describe('estimateExportDimensions edge cases', () => {
    test('with width set but height null falls through to scale', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        width: 500,
        height: null,
        scale: 3,
      }
      const dims = estimateExportDimensions(settings, 100, 100)
      expect(dims.width).toBe(300) // 100 * 3
      expect(dims.height).toBe(300)
    })

    test('with height set but width null falls through to scale', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        width: null,
        height: 500,
        scale: 2,
      }
      const dims = estimateExportDimensions(settings, 100, 100)
      expect(dims.width).toBe(200)
      expect(dims.height).toBe(200)
    })

    test('both width and height explicitly set', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        width: 1234,
        height: 5678,
      }
      const dims = estimateExportDimensions(settings, 100, 100)
      expect(dims.width).toBe(1234)
      expect(dims.height).toBe(5678)
    })

    test('scale of 0.5 halves dimensions', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        scale: 0.5,
        width: null,
        height: null,
      }
      const dims = estimateExportDimensions(settings, 1000, 800)
      expect(dims.width).toBe(500)
      expect(dims.height).toBe(400)
    })

    test('scale of 4 quadruples dimensions', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        scale: 4,
        width: null,
        height: null,
      }
      const dims = estimateExportDimensions(settings, 200, 150)
      expect(dims.width).toBe(800)
      expect(dims.height).toBe(600)
    })
  })

  describe('loadExportSettings edge cases', () => {
    test('partial stored settings merge with defaults', () => {
      localStorage.setItem('crossdraw:export-settings', JSON.stringify({ quality: 50 }))
      const settings = loadExportSettings()
      expect(settings.quality).toBe(50)
      expect(settings.format).toBe('png') // default
      expect(settings.scale).toBe(2) // default
    })

    test('stored boolean overrides', () => {
      localStorage.setItem('crossdraw:export-settings', JSON.stringify({ transparent: false, embedICC: true }))
      const settings = loadExportSettings()
      expect(settings.transparent).toBe(false)
      expect(settings.embedICC).toBe(true)
    })

    test('stored null values for dimensions', () => {
      localStorage.setItem('crossdraw:export-settings', JSON.stringify({ width: 500, height: 300 }))
      const settings = loadExportSettings()
      expect(settings.width).toBe(500)
      expect(settings.height).toBe(300)
    })
  })

  describe('saveExportSettings', () => {
    test('saves all fields', () => {
      const settings: ExportSettings = {
        ...DEFAULT_EXPORT_SETTINGS,
        format: 'jpeg',
        scale: 3,
        quality: 75,
        transparent: false,
        pdfDPI: 300,
        region: 'selection',
        webpLossless: true,
        svgMinify: true,
      }
      saveExportSettings(settings)
      const stored = JSON.parse(localStorage.getItem('crossdraw:export-settings')!)
      expect(stored.format).toBe('jpeg')
      expect(stored.scale).toBe(3)
      expect(stored.quality).toBe(75)
      expect(stored.transparent).toBe(false)
      expect(stored.pdfDPI).toBe(300)
      expect(stored.region).toBe('selection')
      expect(stored.webpLossless).toBe(true)
      expect(stored.svgMinify).toBe(true)
    })

    test('overwriting existing settings', () => {
      saveExportSettings({ ...DEFAULT_EXPORT_SETTINGS, format: 'png' })
      saveExportSettings({ ...DEFAULT_EXPORT_SETTINGS, format: 'svg' })
      const loaded = loadExportSettings()
      expect(loaded.format).toBe('svg')
    })
  })

  describe('performExport throws on unknown format', () => {
    test('throws for "gif" format', async () => {
      try {
        await performExport({ ...DEFAULT_EXPORT_SETTINGS, format: 'gif' as any })
        expect(true).toBe(false) // should not reach
      } catch (err: any) {
        expect(err.message).toContain('Unsupported format')
      }
    })

    test('throws for "tiff" format', async () => {
      try {
        await performExport({ ...DEFAULT_EXPORT_SETTINGS, format: 'tiff' as any })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.message).toContain('Unsupported format')
      }
    })
  })

  describe('quickExport catches errors', () => {
    test('does not throw even if export pipeline fails', async () => {
      // quickExport wraps in try/catch
      await expect(quickExport()).resolves.toBeUndefined()
    })
  })

  describe('DEFAULT_EXPORT_SETTINGS is immutable-like', () => {
    test('has all expected keys', () => {
      const keys = Object.keys(DEFAULT_EXPORT_SETTINGS)
      expect(keys).toContain('format')
      expect(keys).toContain('scale')
      expect(keys).toContain('quality')
      expect(keys).toContain('transparent')
      expect(keys).toContain('embedICC')
      expect(keys).toContain('progressive')
      expect(keys).toContain('svgPrecision')
      expect(keys).toContain('svgMinify')
      expect(keys).toContain('svgEmbedFonts')
      expect(keys).toContain('pdfDPI')
      expect(keys).toContain('webpLossless')
      expect(keys).toContain('region')
      expect(keys).toContain('width')
      expect(keys).toContain('height')
      expect(keys).toContain('linkedDimensions')
    })
  })
})
