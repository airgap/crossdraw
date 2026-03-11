import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { getEyedropperState, sampleColor, applyColorToSelection, renderLoupe } from '@/tools/eyedropper'
import type { VectorLayer, TextLayer } from '@/types'

// Save originals
const origWindow = globalThis.window
const origNavigator = globalThis.navigator
const origDevicePixelRatio = (globalThis as any).devicePixelRatio

afterAll(() => {
  globalThis.window = origWindow
  globalThis.navigator = origNavigator
  if (origDevicePixelRatio !== undefined) {
    ;(globalThis as any).devicePixelRatio = origDevicePixelRatio
  } else {
    delete (globalThis as any).devicePixelRatio
  }
})

// Polyfills for browser globals not available in Bun
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = { devicePixelRatio: 1 }
}
// Ensure navigator.clipboard exists
if (typeof globalThis.navigator === 'undefined') {
  ;(globalThis as any).navigator = {}
}
if (!(globalThis as any).navigator.clipboard) {
  ;(globalThis as any).navigator.clipboard = {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  }
}

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: 'vec-test-1',
    name: 'Test Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  const layer: TextLayer = {
    id: 'text-test-1',
    name: 'Test Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.5,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

// Mock canvas for sampleColor testing
function makeMockCanvas(pixelData: number[]): HTMLCanvasElement {
  const imageData = {
    data: new Uint8ClampedArray(pixelData),
    width: 1,
    height: 1,
    colorSpace: 'srgb',
  }
  return {
    getContext: () => ({
      getImageData: () => imageData,
    }),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
    }),
  } as unknown as HTMLCanvasElement
}

// ── Tests ──

describe('Eyedropper Tool', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('getEyedropperState', () => {
    test('returns state object with expected properties', () => {
      const state = getEyedropperState()
      expect(state).toHaveProperty('lastColor')
      expect(state).toHaveProperty('lastOpacity')
      expect(state).toHaveProperty('tempMode')
      expect(state).toHaveProperty('returnTool')
    })

    test('tempMode defaults to false', () => {
      const state = getEyedropperState()
      expect(state.tempMode).toBe(false)
    })
  })

  describe('sampleColor', () => {
    test('samples red pixel correctly', () => {
      // Mock a canvas that returns pure red at (0,0)
      const canvas = makeMockCanvas([255, 0, 0, 255])
      // Simulate window.devicePixelRatio if needed
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#ff0000')
      expect(result.opacity).toBe(1)
    })

    test('samples green pixel correctly', () => {
      const canvas = makeMockCanvas([0, 255, 0, 255])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#00ff00')
      expect(result.opacity).toBe(1)
    })

    test('samples blue pixel correctly', () => {
      const canvas = makeMockCanvas([0, 0, 255, 255])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#0000ff')
      expect(result.opacity).toBe(1)
    })

    test('samples semi-transparent pixel', () => {
      const canvas = makeMockCanvas([128, 64, 32, 128])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#804020')
      expect(result.opacity).toBeCloseTo(128 / 255, 2)
    })

    test('samples fully transparent pixel', () => {
      const canvas = makeMockCanvas([0, 0, 0, 0])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#000000')
      expect(result.opacity).toBe(0)
    })

    test('returns black with zero opacity when context is null', () => {
      const canvas = {
        getContext: () => null,
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      } as unknown as HTMLCanvasElement

      const result = sampleColor(canvas, 10, 10)
      expect(result.hex).toBe('#000000')
      expect(result.opacity).toBe(0)
    })

    test('updates eyedropper state after sampling', () => {
      const canvas = makeMockCanvas([255, 128, 0, 255])
      ;(globalThis as any).devicePixelRatio = 1

      sampleColor(canvas, 50, 50)

      const state = getEyedropperState()
      expect(state.lastColor).toBe('#ff8000')
      expect(state.lastOpacity).toBe(1)
    })

    test('handles hex padding for low color values', () => {
      const canvas = makeMockCanvas([1, 2, 3, 255])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#010203')
    })

    test('samples white correctly', () => {
      const canvas = makeMockCanvas([255, 255, 255, 255])
      ;(globalThis as any).devicePixelRatio = 1

      const result = sampleColor(canvas, 50, 50)
      expect(result.hex).toBe('#ffffff')
      expect(result.opacity).toBe(1)
    })
  })

  describe('applyColorToSelection', () => {
    test('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: {
          ...useEditorStore.getState().document,
          artboards: [],
        },
      })
      // Should not throw
      applyColorToSelection('#ff0000', 1, false)
    })

    test('does nothing when no layer is selected (tries clipboard)', () => {
      // No selection, no errors
      applyColorToSelection('#ff0000', 1, false)
    })

    test('applies fill to selected vector layer without shift', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      applyColorToSelection('#00ff00', 0.8, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.fill).not.toBeNull()
        expect(updated.fill!.type).toBe('solid')
        if (updated.fill!.type === 'solid') {
          expect(updated.fill!.color).toBe('#00ff00')
        }
      }
    })

    test('applies stroke to selected vector layer with shift', () => {
      const layer = addVectorLayer()
      useEditorStore.getState().selectLayer(layer.id)

      applyColorToSelection('#0000ff', 1, true)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.stroke).not.toBeNull()
        expect(updated.stroke!.color).toBe('#0000ff')
      }
    })

    test('creates default stroke when applying shift to layer without stroke', () => {
      const layer = addVectorLayer({ stroke: null })
      useEditorStore.getState().selectLayer(layer.id)

      applyColorToSelection('#ff00ff', 0.5, true)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'vector') {
        expect(updated.stroke).not.toBeNull()
        expect(updated.stroke!.color).toBe('#ff00ff')
      }
    })

    test('applies color to text layer without shift', () => {
      const layer = addTextLayer()
      useEditorStore.getState().selectLayer(layer.id)

      applyColorToSelection('#aabbcc', 1, false)

      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)!
      if (updated.type === 'text') {
        expect(updated.color).toBe('#aabbcc')
      }
    })

    test('does not apply stroke to text layer with shift', () => {
      const layer = addTextLayer()
      useEditorStore.getState().selectLayer(layer.id)

      // Text layers don't support stroke in this code path
      applyColorToSelection('#aabbcc', 1, true)

      // No crash, text layer should still exist
      const artboard = useEditorStore.getState().document.artboards[0]!
      const updated = artboard.layers.find((l) => l.id === layer.id)
      expect(updated).toBeDefined()
    })

    test('does nothing when selected layer does not exist', () => {
      useEditorStore.setState({
        selection: { layerIds: ['nonexistent-layer'] },
      })
      // Should not throw
      applyColorToSelection('#ff0000', 1, false)
    })
  })

  describe('renderLoupe', () => {
    test('renders magnified loupe around cursor position', () => {
      ;(globalThis as any).devicePixelRatio = 1

      const calls: { method: string; args: any[] }[] = []
      const mockCtx = {
        save: () => calls.push({ method: 'save', args: [] }),
        restore: () => calls.push({ method: 'restore', args: [] }),
        fillRect: (...args: any[]) => calls.push({ method: 'fillRect', args }),
        strokeRect: (...args: any[]) => calls.push({ method: 'strokeRect', args }),
        beginPath: () => calls.push({ method: 'beginPath', args: [] }),
        fill: () => calls.push({ method: 'fill', args: [] }),
        stroke: () => calls.push({ method: 'stroke', args: [] }),
        fillText: (...args: any[]) => calls.push({ method: 'fillText', args }),
        roundRect: (...args: any[]) => calls.push({ method: 'roundRect', args }),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
      } as unknown as CanvasRenderingContext2D

      const mockCanvas = {
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          right: 200,
          bottom: 200,
          width: 200,
          height: 200,
          x: 0,
          y: 0,
        }),
      } as unknown as HTMLCanvasElement

      // Should not throw
      renderLoupe(mockCtx, mockCanvas, 100, 100)

      // Verify some drawing calls were made
      expect(calls.some((c) => c.method === 'save')).toBe(true)
      expect(calls.some((c) => c.method === 'restore')).toBe(true)
      expect(calls.some((c) => c.method === 'fillRect')).toBe(true)
      expect(calls.some((c) => c.method === 'fillText')).toBe(true)
      expect(calls.some((c) => c.method === 'strokeRect')).toBe(true)
    })

    test('renderLoupe handles edge of canvas gracefully', () => {
      ;(globalThis as any).devicePixelRatio = 2

      const mockCtx = {
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        roundRect: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
      } as unknown as CanvasRenderingContext2D

      const mockCanvas = {
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          right: 50,
          bottom: 50,
          width: 50,
          height: 50,
          x: 0,
          y: 0,
        }),
      } as unknown as HTMLCanvasElement

      // Should not throw even at edge coordinates
      renderLoupe(mockCtx, mockCanvas, 0, 0)
      renderLoupe(mockCtx, mockCanvas, 49, 49)
    })

    test('renderLoupe returns early when getImageData throws', () => {
      ;(globalThis as any).devicePixelRatio = 1

      let saveCount = 0
      const mockCtx = {
        save: () => {
          saveCount++
        },
        restore: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
        roundRect: () => {},
        getImageData: () => {
          throw new Error('Cross-origin')
        },
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
      } as unknown as CanvasRenderingContext2D

      const mockCanvas = {
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
        }),
      } as unknown as HTMLCanvasElement

      // Should not throw
      renderLoupe(mockCtx, mockCanvas, 50, 50)
    })

    test('renderLoupe shows correct hex in label', () => {
      ;(globalThis as any).devicePixelRatio = 1

      let labelText = ''
      // Create pixel data where center pixel is (255, 128, 0, 255)
      const gridSize = 9
      const pixelData = new Uint8ClampedArray(gridSize * gridSize * 4)
      // Fill with a known color
      for (let i = 0; i < pixelData.length; i += 4) {
        pixelData[i] = 255
        pixelData[i + 1] = 128
        pixelData[i + 2] = 0
        pixelData[i + 3] = 255
      }

      const mockCtx = {
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: (text: string) => {
          labelText = text
        },
        roundRect: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          if (w === 1 && h === 1) {
            // Center pixel query
            return {
              data: new Uint8ClampedArray([255, 128, 0, 255]),
              width: 1,
              height: 1,
            }
          }
          return {
            data: pixelData.slice(0, w * h * 4),
            width: w,
            height: h,
          }
        },
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
      } as unknown as CanvasRenderingContext2D

      const mockCanvas = {
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          right: 200,
          bottom: 200,
          width: 200,
          height: 200,
          x: 0,
          y: 0,
        }),
      } as unknown as HTMLCanvasElement

      renderLoupe(mockCtx, mockCanvas, 100, 100)
      expect(labelText).toContain('#FF8000')
    })
  })
})
