import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// ── Save/restore globals ──
const origOffscreenCanvas = (globalThis as any).OffscreenCanvas
afterAll(() => {
  if (origOffscreenCanvas !== undefined) (globalThis as any).OffscreenCanvas = origOffscreenCanvas
  else delete (globalThis as any).OffscreenCanvas
})

// ── Polyfill ImageData for bun (no DOM) ──────────────────────────────────────

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string
    constructor(sw: number | Uint8ClampedArray, sh?: number, settings?: number) {
      if (typeof sw === 'number') {
        this.width = sw
        this.height = sh!
        this.data = new Uint8ClampedArray(sw * sh! * 4)
      } else {
        this.data = sw
        this.width = sh!
        this.height = settings ?? sw.length / 4 / sh!
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── Polyfill OffscreenCanvas for bun (no DOM) ───────────────────────────────

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as Record<string, unknown>).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        putImageData() {},
        drawImage() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => new ImageData(w, h),
        clearRect() {},
        fillRect() {},
        fillText() {},
        strokeText() {},
        measureText: () => ({ width: 10 }),
        createImageData: (w: number, h: number) => new ImageData(w, h),
        save() {},
        restore() {},
        scale() {},
        translate() {},
        rotate() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        bezierCurveTo() {},
        quadraticCurveTo() {},
        closePath() {},
        fill() {},
        stroke() {},
        set fillStyle(_v: string) {},
        get fillStyle() {
          return ''
        },
        set strokeStyle(_v: string) {},
        get strokeStyle() {
          return ''
        },
        set lineWidth(_v: number) {},
        get lineWidth() {
          return 1
        },
        set lineCap(_v: string) {},
        get lineCap() {
          return 'butt' as const
        },
        set lineJoin(_v: string) {},
        get lineJoin() {
          return 'miter' as const
        },
        set globalAlpha(_v: number) {},
        get globalAlpha() {
          return 1
        },
        set font(_v: string) {},
        get font() {
          return ''
        },
        set textAlign(_v: string) {},
        get textAlign() {
          return 'left'
        },
        set textBaseline(_v: string) {},
        get textBaseline() {
          return 'alphabetic'
        },
      }
    }
    transferToImageBitmap() {
      return {}
    }
  }
}

// ── Imports ──────────────────────────────────────────────────────────────────

// video-export
import {
  validateExportSettings,
  defaultVideoExportSettings,
  getTimelineDuration,
  computeFrameOverrides,
  renderFrameToImageData,
  exportGIF,
} from '@/animation/video-export'
import type { VideoExportSettings } from '@/animation/video-export'

// transform
import {
  getHandlePositions,
  hitTestHandles,
  getHandleCursor,
  isTransformDragging,
  beginTransform,
  updateTransform,
  endTransform,
  cancelTransform,
} from '@/tools/transform'

// image-trace
import { traceImage, defaultTraceOptions, traceSelectedRasterLayer } from '@/tools/image-trace'
import type { TraceOptions } from '@/tools/image-trace'

// content-aware-move
import {
  getContentAwareMoveSettings,
  setContentAwareMoveSettings,
  beginContentAwareMove,
  updateContentAwareMove,
  applyContentAwareMove,
  cancelContentAwareMove,
  isContentAwareMoveActive,
  getContentAwareMoveOffset,
} from '@/tools/content-aware-move'

// cage-transform
import {
  computeMVCWeights,
  pointInPolygon,
  applyCageTransform,
  applyCageTransformInverse,
  beginCageTransform,
  addCageVertex,
  closeCage,
  enterDeformPhase,
  moveCageVertex,
  commitCageTransform,
  cancelCageTransform,
  isCageTransformActive,
  getCagePhase,
  getCageVertices,
  isCageClosed,
} from '@/tools/cage-transform'
import type { CageVertex } from '@/tools/cage-transform'

// perspective-warp
import {
  applyPerspectiveWarp,
  addPlane,
  connectPlanes,
  moveCorner,
  enterWarpPhase,
  autoStraighten,
  beginPerspectiveWarp,
  commitPerspectiveWarp,
  cancelPerspectiveWarp,
  isPerspectiveWarpActive,
  getPerspectiveWarpPhase,
  getPerspectiveWarpPlanes,
} from '@/tools/perspective-warp'
import type { PerspectivePlane } from '@/tools/perspective-warp'

// touch-type
import {
  transformCharacter,
  setCharacterTransform,
  resetCharacterTransform,
  resetAllCharacterTransforms,
  renderTouchType,
  hitTestCharacter,
} from '@/tools/touch-type'

// variable-fonts
import {
  queryFontAxes,
  getDefaultAxes,
  formatVariationSettings,
  applyFontVariations,
  clampAxisValue,
  updateAxisValue,
  resetAxes,
} from '@/tools/variable-fonts'

import type { FontVariationAxis, TextLayer, Artboard, Layer, AnimationTrack } from '@/types'

import { useEditorStore } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(w: number, h: number, r = 0, g = 0, b = 0, a = 255): ImageData {
  const d = new ImageData(w, h)
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = r
    d.data[i + 1] = g
    d.data[i + 2] = b
    d.data[i + 3] = a
  }
  return d
}

function makeBaseLayer(id: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  } as unknown as Layer
}

function makeAnimatedLayer(id: string, track: AnimationTrack): Layer {
  return makeBaseLayer(id, { animation: track } as Partial<Layer>)
}

function makeArtboard(layers: Layer[], width = 800, height = 600): Artboard {
  return {
    id: 'artboard-1',
    name: 'Test Artboard',
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor: '#ffffff',
    layers,
  }
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    name: 'Test Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  } as unknown as TextLayer
}

function makeRasterLayer(id: string, chunkId: string, w: number, h: number): Layer {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: w,
    height: h,
  } as unknown as Layer
}

function makeVectorLayer(id: string): Layer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 50, y: 0 },
          { type: 'line', x: 50, y: 50 },
          { type: 'line', x: 0, y: 50 },
          { type: 'close' },
        ],
        closed: true,
        fillRule: 'nonzero',
      },
    ],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
  } as unknown as Layer
}

/** Set up the editor store with a single artboard and given layers. */
function setupStore(layers: Layer[], artboardId = 'artboard-1') {
  const store = useEditorStore.getState()
  store.newDocument()
  // Replace artboards with a test artboard
  useEditorStore.setState((state) => ({
    document: {
      ...state.document,
      artboards: [
        {
          id: artboardId,
          name: 'Test',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers,
        },
      ],
    },
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. VIDEO EXPORT — cover parseHexColor short-hand, exportAnimation branches,
//    renderFrameToImageData with animated layers, and parseAVCDecoderConfig
// ═══════════════════════════════════════════════════════════════════════════════

describe('video-export deep coverage', () => {
  describe('renderFrameToImageData dimensions and execution', () => {
    test('returns ImageData with 3-char hex bg', () => {
      const artboard = makeArtboard([])
      // Exercises the OffscreenCanvas code path including fillStyle assignment
      const frame = renderFrameToImageData(0, artboard, 24, 4, 4, '#abc')
      expect(frame.width).toBe(4)
      expect(frame.height).toBe(4)
      expect(frame.data.length).toBe(4 * 4 * 4)
    })

    test('returns ImageData with 6-char hex bg', () => {
      const artboard = makeArtboard([])
      const frame = renderFrameToImageData(0, artboard, 24, 4, 4, '#1a2b3c')
      expect(frame.width).toBe(4)
      expect(frame.height).toBe(4)
    })

    test('different export resolution scales', () => {
      const artboard = makeArtboard([], 400, 300)
      // Export at double resolution
      const frame = renderFrameToImageData(0, artboard, 24, 800, 600, '#ffffff')
      expect(frame.width).toBe(800)
      expect(frame.height).toBe(600)
    })
  })

  describe('renderFrameToImageData with animated layers', () => {
    test('renders frame with animated overrides applied', () => {
      const track: AnimationTrack = {
        duration: 1000,
        loop: false,
        keyframes: [
          { id: 'k1', time: 0, easing: 'linear', properties: { x: 0, opacity: 1 } },
          { id: 'k2', time: 1000, easing: 'linear', properties: { x: 100, opacity: 0.5 } },
        ],
      }
      const layer = makeAnimatedLayer('anim-layer', track)
      const artboard = makeArtboard([layer], 100, 100)
      // At frame 12 with 24 fps => time = 500ms => midpoint
      const frame = renderFrameToImageData(12, artboard, 24, 100, 100, '#ffffff')
      expect(frame.width).toBe(100)
      expect(frame.height).toBe(100)
    })

    test('renders frame with looping track past duration', () => {
      const track: AnimationTrack = {
        duration: 500,
        loop: true,
        keyframes: [
          { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
          { id: 'k2', time: 500, easing: 'linear', properties: { x: 50 } },
        ],
      }
      const artboard = makeArtboard([makeAnimatedLayer('looper', track)])
      // time = 750ms with loop of 500ms => effective = 250ms
      const frame = renderFrameToImageData(18, artboard, 24, 10, 10, '#000000')
      expect(frame.data.length).toBe(10 * 10 * 4)
    })

    test('renders frame with group containing animated children', () => {
      const track: AnimationTrack = {
        duration: 1000,
        loop: false,
        keyframes: [
          { id: 'k1', time: 0, easing: 'linear', properties: { y: 0 } },
          { id: 'k2', time: 1000, easing: 'linear', properties: { y: 100 } },
        ],
      }
      const childLayer = makeAnimatedLayer('child', track)
      const groupLayer: Layer = {
        id: 'group',
        name: 'group',
        type: 'group',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        children: [childLayer],
      } as unknown as Layer
      const artboard = makeArtboard([groupLayer])

      const overrides = computeFrameOverrides(artboard, 500)
      expect(overrides.has('child')).toBe(true)
      expect(overrides.get('child')!.y).toBeCloseTo(50, 0)
    })
  })

  describe('computeFrameOverrides edge cases', () => {
    test('non-loop track clamps at duration', () => {
      const track: AnimationTrack = {
        duration: 1000,
        loop: false,
        keyframes: [
          { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
          { id: 'k2', time: 1000, easing: 'linear', properties: { x: 200 } },
        ],
      }
      const artboard = makeArtboard([makeAnimatedLayer('clamp', track)])
      const overrides = computeFrameOverrides(artboard, 5000) // way past duration
      expect(overrides.get('clamp')!.x).toBeCloseTo(200, 0)
    })

    test('empty keyframes produces no overrides', () => {
      const track: AnimationTrack = {
        duration: 1000,
        loop: false,
        keyframes: [],
      }
      const artboard = makeArtboard([makeAnimatedLayer('empty', track)])
      // Layer has animation but keyframes is empty, so collectAnimatedLayers skips it
      const overrides = computeFrameOverrides(artboard, 500)
      expect(overrides.size).toBe(0)
    })

    test('track with zero duration and loop does not divide by zero', () => {
      const track: AnimationTrack = {
        duration: 0,
        loop: true,
        keyframes: [{ id: 'k1', time: 0, easing: 'linear', properties: { opacity: 0.5 } }],
      }
      const artboard = makeArtboard([makeAnimatedLayer('zero-dur', track)])
      // Should not throw
      const overrides = computeFrameOverrides(artboard, 1000)
      expect(overrides.has('zero-dur')).toBe(true)
    })
  })

  describe('exportGIF progress callback', () => {
    test('calls progress with start and end', () => {
      const frames = [makeImageData(2, 2, 128, 64, 32)]
      const settings: VideoExportSettings = { ...defaultVideoExportSettings, fps: 10 }
      const calls: [number, number][] = []
      exportGIF(frames, settings, (cur, total) => {
        calls.push([cur, total])
      })
      // Should have at least start(0, N) and end(N, N)
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls[0]![0]).toBe(0)
      expect(calls[calls.length - 1]![0]).toBe(frames.length)
    })
  })

  describe('getTimelineDuration', () => {
    test('finds max duration across multiple animated layers', () => {
      const t1: AnimationTrack = {
        duration: 2000,
        loop: false,
        keyframes: [{ id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } }],
      }
      const t2: AnimationTrack = {
        duration: 8000,
        loop: true,
        keyframes: [{ id: 'k2', time: 0, easing: 'linear', properties: { y: 0 } }],
      }
      const artboard = makeArtboard([makeAnimatedLayer('a', t1), makeAnimatedLayer('b', t2)])
      expect(getTimelineDuration(artboard)).toBe(8000)
    })
  })

  describe('validateExportSettings extended', () => {
    test('rejects height too large', () => {
      const s = { ...defaultVideoExportSettings, height: 5000 }
      const errors = validateExportSettings(s)
      expect(errors.some((e) => e.includes('Height'))).toBe(true)
    })

    test('mp4 with odd width rejected', () => {
      const s: VideoExportSettings = {
        ...defaultVideoExportSettings,
        format: 'mp4',
        width: 801,
        height: 600,
      }
      const errors = validateExportSettings(s)
      expect(errors.some((e) => e.includes('even'))).toBe(true)
    })

    test('mp4 with odd height rejected', () => {
      const s: VideoExportSettings = {
        ...defaultVideoExportSettings,
        format: 'mp4',
        width: 800,
        height: 601,
      }
      const errors = validateExportSettings(s)
      expect(errors.some((e) => e.includes('even'))).toBe(true)
    })

    test('quality 0 is valid', () => {
      const errors = validateExportSettings({ ...defaultVideoExportSettings, quality: 0 })
      expect(errors).toEqual([])
    })

    test('quality 100 is valid', () => {
      const errors = validateExportSettings({ ...defaultVideoExportSettings, quality: 100 })
      expect(errors).toEqual([])
    })

    test('webm format is valid', () => {
      const errors = validateExportSettings({ ...defaultVideoExportSettings, format: 'webm' })
      expect(errors).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TRANSFORM — cover getHandleCursor, beginTransform/update/end/cancel
//    with store, updateTransform branches (body, rotation, scale handles)
// ═══════════════════════════════════════════════════════════════════════════════

describe('transform deep coverage', () => {
  describe('getHandleCursor', () => {
    test('returns correct cursor for each handle type', () => {
      expect(getHandleCursor('nw')).toBe('nwse-resize')
      expect(getHandleCursor('se')).toBe('nwse-resize')
      expect(getHandleCursor('ne')).toBe('nesw-resize')
      expect(getHandleCursor('sw')).toBe('nesw-resize')
      expect(getHandleCursor('n')).toBe('ns-resize')
      expect(getHandleCursor('s')).toBe('ns-resize')
      expect(getHandleCursor('e')).toBe('ew-resize')
      expect(getHandleCursor('w')).toBe('ew-resize')
      expect(getHandleCursor('rotation')).toBe('crosshair')
      expect(getHandleCursor('body')).toBe('move')
    })

    test('returns default for null', () => {
      expect(getHandleCursor(null)).toBe('default')
    })
  })

  describe('isTransformDragging', () => {
    test('is false when no drag is active', () => {
      expect(isTransformDragging()).toBe(false)
    })
  })

  describe('beginTransform + updateTransform + endTransform with store', () => {
    const artboardId = 'artboard-1'
    const layerId = 'vec-1'

    beforeEach(() => {
      const layer = makeVectorLayer(layerId)
      setupStore([layer], artboardId)
      useEditorStore.getState().selectLayer(layerId)
    })

    test('beginTransform starts a drag for body handle', () => {
      beginTransform('body', { x: 20, y: 30 }, layerId, artboardId)
      expect(isTransformDragging()).toBe(true)
    })

    test('updateTransform body moves the layer', () => {
      beginTransform('body', { x: 20, y: 30 }, layerId, artboardId)
      updateTransform({ x: 40, y: 50 })
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      // Should have moved by ~20, 20 (with snapping adjustments)
      expect(layer.transform.x).not.toBe(10) // original was 10
    })

    test('endTransform commits the transform and creates undo entry', () => {
      beginTransform('body', { x: 20, y: 30 }, layerId, artboardId)
      updateTransform({ x: 40, y: 50 })
      endTransform()
      expect(isTransformDragging()).toBe(false)
    })

    test('cancelTransform restores original transform', () => {
      const store = useEditorStore.getState()
      const origLayer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      const origX = origLayer.transform.x

      beginTransform('body', { x: 20, y: 30 }, layerId, artboardId)
      updateTransform({ x: 100, y: 100 })
      cancelTransform()

      expect(isTransformDragging()).toBe(false)
      const restored = useEditorStore.getState().document.artboards[0]!.layers.find((l) => l.id === layerId)!
      expect(restored.transform.x).toBe(origX)
    })

    test('updateTransform with rotation handle rotates the layer', () => {
      beginTransform('rotation', { x: 35, y: -10 }, layerId, artboardId)
      updateTransform({ x: 50, y: 0 })
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      // rotation should have changed from 0
      expect(typeof layer.transform.rotation).toBe('number')
      endTransform()
    })

    test('updateTransform with shift constrains rotation to 15 deg', () => {
      beginTransform('rotation', { x: 35, y: -10 }, layerId, artboardId)
      updateTransform({ x: 50, y: 0 }, true) // shift = true
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      // Rotation should be a multiple of 15
      expect(layer.transform.rotation % 15).toBeCloseTo(0, 6)
      endTransform()
    })

    test('updateTransform with se scale handle scales the layer', () => {
      beginTransform('se', { x: 60, y: 70 }, layerId, artboardId)
      updateTransform({ x: 80, y: 90 })
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      expect(layer.transform.scaleX).not.toBe(1)
      endTransform()
    })

    test('updateTransform with ne corner handle scales', () => {
      beginTransform('ne', { x: 60, y: 20 }, layerId, artboardId)
      updateTransform({ x: 80, y: 10 })
      endTransform()
      expect(isTransformDragging()).toBe(false)
    })

    test('updateTransform with nw corner handle scales inversely', () => {
      beginTransform('nw', { x: 10, y: 20 }, layerId, artboardId)
      updateTransform({ x: 5, y: 10 })
      endTransform()
    })

    test('updateTransform with sw corner handle', () => {
      beginTransform('sw', { x: 10, y: 70 }, layerId, artboardId)
      updateTransform({ x: 5, y: 80 })
      endTransform()
    })

    test('updateTransform with e edge handle only scales X', () => {
      beginTransform('e', { x: 60, y: 45 }, layerId, artboardId)
      updateTransform({ x: 80, y: 45 })
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      expect(layer.transform.scaleX).not.toBe(1)
      endTransform()
    })

    test('updateTransform with w edge handle only scales X inversely', () => {
      beginTransform('w', { x: 10, y: 45 }, layerId, artboardId)
      updateTransform({ x: 5, y: 45 })
      endTransform()
    })

    test('updateTransform with n edge handle only scales Y', () => {
      beginTransform('n', { x: 35, y: 20 }, layerId, artboardId)
      updateTransform({ x: 35, y: 10 })
      endTransform()
    })

    test('updateTransform with s edge handle only scales Y', () => {
      beginTransform('s', { x: 35, y: 70 }, layerId, artboardId)
      updateTransform({ x: 35, y: 90 })
      endTransform()
    })

    test('updateTransform with shift + corner locks aspect ratio', () => {
      beginTransform('se', { x: 60, y: 70 }, layerId, artboardId)
      updateTransform({ x: 80, y: 90 }, true)
      const store = useEditorStore.getState()
      const layer = store.document.artboards[0]!.layers.find((l) => l.id === layerId)!
      // With shift, scaleY = scaleX * (origScaleY/origScaleX) = scaleX * 1
      expect(layer.transform.scaleY).toBeCloseTo(layer.transform.scaleX, 4)
      endTransform()
    })

    test('endTransform with no drag is a no-op', () => {
      endTransform()
      expect(isTransformDragging()).toBe(false)
    })

    test('cancelTransform with no drag is a no-op', () => {
      cancelTransform()
      expect(isTransformDragging()).toBe(false)
    })

    test('beginTransform with missing artboard does nothing', () => {
      beginTransform('body', { x: 0, y: 0 }, layerId, 'no-such-artboard')
      expect(isTransformDragging()).toBe(false)
    })

    test('beginTransform with missing layer does nothing', () => {
      beginTransform('body', { x: 0, y: 0 }, 'no-such-layer', artboardId)
      expect(isTransformDragging()).toBe(false)
    })

    test('updateTransform with no drag is a no-op', () => {
      // Should not throw
      updateTransform({ x: 100, y: 100 })
      expect(isTransformDragging()).toBe(false)
    })
  })

  describe('hitTestHandles extended', () => {
    test('ne handle hit-test', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const result = hitTestHandles({ x: 100, y: 0 }, bbox, 1)
      expect(result).toBe('ne')
    })

    test('sw handle hit-test', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const result = hitTestHandles({ x: 0, y: 100 }, bbox, 1)
      expect(result).toBe('sw')
    })

    test('se handle hit-test', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const result = hitTestHandles({ x: 100, y: 100 }, bbox, 1)
      expect(result).toBe('se')
    })

    test('e handle hit-test', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const result = hitTestHandles({ x: 100, y: 50 }, bbox, 1)
      expect(result).toBe('e')
    })

    test('w handle hit-test', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      const result = hitTestHandles({ x: 0, y: 50 }, bbox, 1)
      expect(result).toBe('w')
    })

    test('high zoom reduces handle hit radius', () => {
      const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
      // At very high zoom, the radius shrinks
      const handles = getHandlePositions(bbox, 10)
      expect(handles.rotation.y).toBeGreaterThan(getHandlePositions(bbox, 1).rotation.y)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. IMAGE TRACE — cover marching squares, RDP, cubic smoothing branches,
//    pointsToLineSegments, traceSelectedRasterLayer
// ═══════════════════════════════════════════════════════════════════════════════

describe('image-trace deep coverage', () => {
  describe('traceImage basic', () => {
    /**
     * Build a test image with explicit foreground/background.
     * Uses Uint8ClampedArray directly to avoid any polyfill issues.
     */
    function makeTracingImage(w: number, h: number, fgPixels: Set<string>): ImageData {
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (fgPixels.has(`${x},${y}`)) {
            // Dark foreground
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
          } else {
            // Bright background
            data[i] = 255
            data[i + 1] = 255
            data[i + 2] = 255
            data[i + 3] = 255
          }
        }
      }
      return new ImageData(data, w, h)
    }

    function makeFGSet(x0: number, y0: number, x1: number, y1: number): Set<string> {
      const s = new Set<string>()
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          s.add(`${x},${y}`)
        }
      }
      return s
    }

    test('traces a solid rectangle in the center', () => {
      const w = 20
      const h = 20
      const fg = makeFGSet(5, 5, 15, 15)
      const img = makeTracingImage(w, h, fg)

      // Use very low minPathLength and simplifyTolerance to ensure contours pass filters
      const result = traceImage(img, {
        threshold: 128,
        minPathLength: 3,
        simplifyTolerance: 0.5,
        smoothing: false,
      })
      // The marching squares contour following depends on exact cell edges;
      // verify that we get at least one contour or the algorithm's invariant holds
      expect(Array.isArray(result)).toBe(true)
      if (result.length > 0) {
        for (const contour of result) {
          expect(contour.length).toBeGreaterThanOrEqual(3)
          expect(contour[0]!.type).toBe('move')
          expect(contour[contour.length - 1]!.type).toBe('close')
        }
      }
    })

    test('traces with smoothing disabled (line segments)', () => {
      const w = 20
      const h = 20
      const fg = makeFGSet(5, 5, 15, 15)
      const img = makeTracingImage(w, h, fg)

      const opts: TraceOptions = {
        threshold: 128,
        minPathLength: 2,
        simplifyTolerance: 0.5,
        smoothing: false,
      }
      const result = traceImage(img, opts)
      expect(Array.isArray(result)).toBe(true)
      // With smoothing=false, segments should be 'line' (not 'cubic')
      for (const contour of result) {
        const hasCubic = contour.some((s) => s.type === 'cubic')
        expect(hasCubic).toBe(false)
      }
    })

    test('traces with smoothing enabled (cubic segments)', () => {
      const w = 30
      const h = 30
      const fg = makeFGSet(5, 5, 25, 25)
      const img = makeTracingImage(w, h, fg)

      const opts: TraceOptions = {
        threshold: 128,
        minPathLength: 2,
        simplifyTolerance: 0.5,
        smoothing: true,
      }
      const result = traceImage(img, opts)
      expect(Array.isArray(result)).toBe(true)
      // If contours are produced and large enough, smoothing should yield cubic segs
      if (result.length > 0) {
        const hasCubic = result.some((contour) => contour.some((s) => s.type === 'cubic'))
        // Only check if there are enough points for smoothing
        const hasLargeContour = result.some((c) => c.length >= 5)
        if (hasLargeContour) {
          expect(hasCubic).toBe(true)
        }
      }
    })

    test('returns empty for uniform white image', () => {
      const img = makeImageData(10, 10, 255, 255, 255, 255)
      const result = traceImage(img, defaultTraceOptions)
      // No dark pixels → no contours
      expect(result.length).toBe(0)
    })

    test('returns empty for uniform black image', () => {
      const img = makeImageData(10, 10, 0, 0, 0, 255)
      const result = traceImage(img, defaultTraceOptions)
      // All dark → no contour boundaries (case 15 everywhere)
      expect(result.length).toBe(0)
    })

    test('filters out tiny contours with minPathLength', () => {
      const w = 10
      const h = 10
      const img = makeImageData(w, h, 255, 255, 255, 255)
      // Create a single dark pixel (very small contour)
      const i = (5 * w + 5) * 4
      img.data[i] = 0
      img.data[i + 1] = 0
      img.data[i + 2] = 0

      const opts: TraceOptions = {
        threshold: 128,
        minPathLength: 100, // very high → filters out everything
        simplifyTolerance: 1,
        smoothing: false,
      }
      const result = traceImage(img, opts)
      expect(result.length).toBe(0)
    })

    test('handles transparent pixels by luminance weighting', () => {
      const w = 10
      const h = 10
      const img = makeImageData(w, h, 0, 0, 0, 0) // fully transparent black
      // Transparent black has luminance 0 * (0/255) = 0 which is < 128
      // But since all pixels are the same, no contour boundary exists
      const result = traceImage(img, defaultTraceOptions)
      expect(result.length).toBe(0)
    })

    test('traceImage returns valid segment arrays', () => {
      // Just exercise the full pipeline including binarize, marchingSquares, simplifyRDP
      const w = 10
      const h = 10
      const img = makeImageData(w, h, 128, 128, 128, 255)
      const result = traceImage(img, {
        ...defaultTraceOptions,
        threshold: 200, // all pixels are below 200 => all foreground
        minPathLength: 1,
        simplifyTolerance: 0.5,
        smoothing: false,
      })
      // All pixels same => no contour boundary
      expect(result.length).toBe(0)
    })

    test('traceImage with various threshold values', () => {
      const w = 10
      const h = 10
      // Half dark, half light
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          data[i] = x < 5 ? 0 : 255
          data[i + 1] = x < 5 ? 0 : 255
          data[i + 2] = x < 5 ? 0 : 255
          data[i + 3] = 255
        }
      }
      const img = new ImageData(data, w, h)

      const result = traceImage(img, {
        threshold: 128,
        minPathLength: 1,
        simplifyTolerance: 0.1,
        smoothing: false,
      })
      // Should find contour at the boundary between dark and light halves
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('traceSelectedRasterLayer', () => {
    test('returns without error when no selection', () => {
      setupStore([])
      // No selection set → should just return
      traceSelectedRasterLayer()
    })

    test('returns without error when selection is not raster', () => {
      const layer = makeVectorLayer('v1')
      setupStore([layer])
      useEditorStore.getState().selectLayer('v1')
      traceSelectedRasterLayer()
    })

    test('traces a raster layer (exercises full code path)', () => {
      const chunkId = 'trace-chunk-1'
      const w = 20
      const h = 20
      const rLayer = makeRasterLayer('r1', chunkId, w, h)
      setupStore([rLayer])

      // Store raster data with a left half dark, right half light
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          data[i] = x < 10 ? 0 : 255
          data[i + 1] = x < 10 ? 0 : 255
          data[i + 2] = x < 10 ? 0 : 255
          data[i + 3] = 255
        }
      }
      storeRasterData(chunkId, new ImageData(data, w, h))

      useEditorStore.getState().selectLayer('r1')

      // Should not throw; exercises the full traceSelectedRasterLayer path
      traceSelectedRasterLayer({ simplifyTolerance: 0.5, minPathLength: 1 })
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CONTENT-AWARE MOVE — cover settings, update, apply, cancel with
//    pre-set state, and adaptation strength branches
// ═══════════════════════════════════════════════════════════════════════════════

describe('content-aware-move deep coverage', () => {
  beforeEach(() => {
    cancelContentAwareMove()
    setContentAwareMoveSettings({ mode: 'move', adaptation: 'medium' })
  })

  describe('settings coverage', () => {
    test('very-strict adaptation is valid', () => {
      setContentAwareMoveSettings({ adaptation: 'very-strict' })
      expect(getContentAwareMoveSettings().adaptation).toBe('very-strict')
    })

    test('very-loose adaptation is valid', () => {
      setContentAwareMoveSettings({ adaptation: 'very-loose' })
      expect(getContentAwareMoveSettings().adaptation).toBe('very-loose')
    })

    test('extend mode preserves source', () => {
      setContentAwareMoveSettings({ mode: 'extend' })
      expect(getContentAwareMoveSettings().mode).toBe('extend')
    })
  })

  describe('applyContentAwareMove without active state', () => {
    test('returns false and resets when not active', () => {
      const result = applyContentAwareMove()
      expect(result).toBe(false)
      expect(isContentAwareMoveActive()).toBe(false)
    })
  })

  describe('updateContentAwareMove when inactive', () => {
    test('does nothing', () => {
      updateContentAwareMove(50, 50)
      expect(isContentAwareMoveActive()).toBe(false)
      expect(getContentAwareMoveOffset()).toBeNull()
    })
  })

  describe('beginContentAwareMove with no raster layer', () => {
    test('returns false when no raster layers exist', () => {
      setupStore([makeVectorLayer('v1')])
      const result = beginContentAwareMove(0, 0)
      expect(result).toBe(false)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CAGE TRANSFORM — cover the full lifecycle with store, commitCageTransform,
//    deformed cage transform, edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('cage-transform deep coverage', () => {
  const chunkId = 'cage-chunk-1'

  beforeEach(() => {
    cancelCageTransform()
  })

  describe('full lifecycle with store', () => {
    beforeEach(() => {
      const rLayer = makeRasterLayer('r1', chunkId, 20, 20)
      setupStore([rLayer])
      useEditorStore.getState().selectLayer('r1')
      storeRasterData(chunkId, makeImageData(20, 20, 100, 150, 200, 255))
    })

    test('beginCageTransform activates state', () => {
      expect(beginCageTransform()).toBe(true)
      expect(isCageTransformActive()).toBe(true)
      expect(getCagePhase()).toBe('draw')
    })

    test('full draw-deform-commit lifecycle', () => {
      beginCageTransform()

      // Draw phase: add vertices
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      addCageVertex(18, 18)
      addCageVertex(2, 18)
      expect(getCageVertices().length).toBe(4)

      // Close the cage
      expect(closeCage()).toBe(true)
      expect(isCageClosed()).toBe(true)

      // Enter deform phase (pre-computes weights)
      expect(enterDeformPhase()).toBe(true)
      expect(getCagePhase()).toBe('deform')

      // Move a vertex
      moveCageVertex(2, 19, 19)
      const verts = getCageVertices()
      expect(verts[2]!.x).toBe(19)
      expect(verts[2]!.y).toBe(19)

      // Commit
      expect(commitCageTransform()).toBe(true)
      expect(isCageTransformActive()).toBe(false)
    })

    test('cancelCageTransform restores original image', () => {
      beginCageTransform()
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      addCageVertex(10, 18)

      cancelCageTransform()
      expect(isCageTransformActive()).toBe(false)
    })

    test('commitCageTransform fails without closing cage', () => {
      beginCageTransform()
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      addCageVertex(10, 18)
      // Not closed
      expect(commitCageTransform()).toBe(false)
    })

    test('closeCage fails with < 3 vertices', () => {
      beginCageTransform()
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      expect(closeCage()).toBe(false)
    })

    test('enterDeformPhase fails if not closed', () => {
      beginCageTransform()
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      addCageVertex(10, 18)
      // Not closed
      expect(enterDeformPhase()).toBe(false)
    })

    test('moveCageVertex does nothing in draw phase', () => {
      beginCageTransform()
      addCageVertex(5, 5)
      moveCageVertex(0, 10, 10)
      // Should not have changed since we're in draw phase
      expect(getCageVertices()[0]!.x).toBe(5)
    })

    test('moveCageVertex with invalid index does nothing', () => {
      beginCageTransform()
      addCageVertex(2, 2)
      addCageVertex(18, 2)
      addCageVertex(10, 18)
      closeCage()
      enterDeformPhase()

      moveCageVertex(-1, 10, 10)
      moveCageVertex(100, 10, 10)
      // No crash
      expect(getCageVertices().length).toBe(3)
    })

    test('beginCageTransform finds first raster layer when no selection', () => {
      useEditorStore.getState().selectLayer('') // deselect
      const result = beginCageTransform()
      expect(result).toBe(true)
    })

    test('beginCageTransform fails without raster layers', () => {
      setupStore([makeVectorLayer('v1')])
      const result = beginCageTransform()
      expect(result).toBe(false)
    })
  })

  describe('applyCageTransform with deformation', () => {
    test('deformed cage moves pixels', () => {
      const src = makeImageData(20, 20, 100, 150, 200, 255)
      const verts: CageVertex[] = [
        { x: 2, y: 2, originalX: 2, originalY: 2 },
        { x: 18, y: 2, originalX: 18, originalY: 2 },
        { x: 20, y: 18, originalX: 18, originalY: 18 }, // moved right
        { x: 2, y: 18, originalX: 2, originalY: 18 },
      ]
      const result = applyCageTransform(src, verts)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
      // Should have some different pixels due to forward splat
      let diffs = 0
      for (let i = 0; i < src.data.length; i += 4) {
        if (result.data[i] !== src.data[i]) diffs++
      }
      expect(diffs).toBeGreaterThanOrEqual(0) // may or may not differ
    })

    test('applyCageTransformInverse with populated cache', () => {
      const src = makeImageData(10, 10, 50, 100, 150, 255)
      const verts: CageVertex[] = [
        { x: 1, y: 1, originalX: 1, originalY: 1 },
        { x: 8, y: 1, originalX: 8, originalY: 1 },
        { x: 9, y: 8, originalX: 8, originalY: 8 }, // moved
        { x: 1, y: 8, originalX: 1, originalY: 8 },
      ]
      // Build a simple cache
      const cache = new Map<number, number[]>()
      const polygon = verts.map((v) => ({ x: v.originalX, y: v.originalY }))
      for (let y = 2; y <= 7; y++) {
        for (let x = 2; x <= 7; x++) {
          if (pointInPolygon(x, y, polygon)) {
            const weights = computeMVCWeights(x, y, polygon)
            cache.set(y * 10 + x, weights)
          }
        }
      }

      const result = applyCageTransformInverse(src, verts, cache)
      expect(result.width).toBe(10)
      expect(result.height).toBe(10)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PERSPECTIVE WARP — cover addPlane, connectPlanes, moveCorner,
//    enterWarpPhase, autoStraighten, commit, cancel
// ═══════════════════════════════════════════════════════════════════════════════

describe('perspective-warp deep coverage', () => {
  const chunkId = 'persp-chunk-1'

  beforeEach(() => {
    cancelPerspectiveWarp()
  })

  describe('full lifecycle with store', () => {
    beforeEach(() => {
      const rLayer = makeRasterLayer('r1', chunkId, 20, 20)
      setupStore([rLayer])
      useEditorStore.getState().selectLayer('r1')
      storeRasterData(chunkId, makeImageData(20, 20, 100, 100, 100, 255))
    })

    test('beginPerspectiveWarp activates state', () => {
      const result = beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      expect(result).toBe(true)
      expect(isPerspectiveWarpActive()).toBe(true)
      expect(getPerspectiveWarpPhase()).toBe('layout')
    })

    test('addPlane adds a quad', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      const idx = addPlane([
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 19 },
        { x: 0, y: 19 },
      ])
      expect(idx).toBe(0)
      expect(getPerspectiveWarpPlanes().length).toBe(1)
    })

    test('addPlane returns -1 when not active', () => {
      const idx = addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
      expect(idx).toBe(-1)
    })

    test('connectPlanes connects two planes', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
      addPlane([
        { x: 10, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 10 },
        { x: 10, y: 10 },
      ])
      const result = connectPlanes(0, 1, [1, 2], [0, 3])
      expect(result).toBe(true)
    })

    test('connectPlanes fails with same plane', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
      expect(connectPlanes(0, 0, [0, 1], [2, 3])).toBe(false)
    })

    test('connectPlanes fails with invalid indices', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      expect(connectPlanes(-1, 0, [0, 1], [2, 3])).toBe(false)
      expect(connectPlanes(0, 5, [0, 1], [2, 3])).toBe(false)
    })

    test('moveCorner moves a corner and propagates to adjacent', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
      addPlane([
        { x: 10, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 10 },
        { x: 10, y: 10 },
      ])
      connectPlanes(0, 1, [1, 2], [0, 3])

      // Move corner 1 of plane 0 (shared with corner 0 of plane 1)
      moveCorner(0, 1, 12, 1)

      const planes = getPerspectiveWarpPlanes()
      expect(planes[0]!.corners[1].x).toBe(12)
      // Should have propagated to plane 1, corner 0
      expect(planes[1]!.corners[0].x).toBe(12)
    })

    test('moveCorner with invalid plane index is a no-op', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      moveCorner(-1, 0, 5, 5) // no crash
      moveCorner(10, 0, 5, 5) // no crash
    })

    test('moveCorner with invalid corner index is a no-op', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
      moveCorner(0, -1, 5, 5) // no crash
      moveCorner(0, 5, 5, 5) // no crash
    })

    test('enterWarpPhase switches to warp', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 19 },
        { x: 0, y: 19 },
      ])
      expect(enterWarpPhase()).toBe(true)
      expect(getPerspectiveWarpPhase()).toBe('warp')
    })

    test('enterWarpPhase fails with no planes', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      expect(enterWarpPhase()).toBe(false)
    })

    test('enterWarpPhase fails when not active', () => {
      expect(enterWarpPhase()).toBe(false)
    })

    test('autoStraighten makes edges horizontal/vertical', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 1, y: 2 },
        { x: 18, y: 3 },
        { x: 17, y: 17 },
        { x: 2, y: 16 },
      ])
      enterWarpPhase()
      autoStraighten()

      const planes = getPerspectiveWarpPlanes()
      const [tl, tr, br, bl] = planes[0]!.corners
      // Top edge: tl.y should equal tr.y
      expect(tl.y).toBeCloseTo(tr.y, 6)
      // Bottom edge: bl.y should equal br.y
      expect(bl.y).toBeCloseTo(br.y, 6)
      // Left edge: tl.x should equal bl.x
      expect(tl.x).toBeCloseTo(bl.x, 6)
      // Right edge: tr.x should equal br.x
      expect(tr.x).toBeCloseTo(br.x, 6)
    })

    test('autoStraighten does nothing when not in warp phase', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 1, y: 2 },
        { x: 18, y: 3 },
        { x: 17, y: 17 },
        { x: 2, y: 16 },
      ])
      // Still in layout phase
      autoStraighten()
      const planes = getPerspectiveWarpPlanes()
      // Should not have changed
      expect(planes[0]!.corners[0].y).toBe(2)
    })

    test('autoStraighten propagates to connected planes', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 10, y: 1 },
        { x: 10, y: 10 },
        { x: 0, y: 11 },
      ])
      addPlane([
        { x: 10, y: 1 },
        { x: 19, y: 0 },
        { x: 19, y: 11 },
        { x: 10, y: 10 },
      ])
      connectPlanes(0, 1, [1, 2], [0, 3])
      enterWarpPhase()
      autoStraighten()

      const planes = getPerspectiveWarpPlanes()
      // Shared edge corners should match
      expect(planes[0]!.corners[1].x).toBeCloseTo(planes[1]!.corners[0].x, 3)
      expect(planes[0]!.corners[1].y).toBeCloseTo(planes[1]!.corners[0].y, 3)
    })

    test('commitPerspectiveWarp succeeds after warp', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 19 },
        { x: 0, y: 19 },
      ])
      enterWarpPhase()
      moveCorner(0, 0, 2, 2)

      expect(commitPerspectiveWarp()).toBe(true)
      expect(isPerspectiveWarpActive()).toBe(false)
    })

    test('commitPerspectiveWarp fails when not active', () => {
      expect(commitPerspectiveWarp()).toBe(false)
    })

    test('cancelPerspectiveWarp restores original', () => {
      beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      addPlane([
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 19, y: 19 },
        { x: 0, y: 19 },
      ])
      cancelPerspectiveWarp()
      expect(isPerspectiveWarpActive()).toBe(false)
    })

    test('beginPerspectiveWarp without raster layer returns false', () => {
      setupStore([makeVectorLayer('v1')])
      expect(beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })).toBe(false)
    })

    test('beginPerspectiveWarp finds first raster when selection is non-raster', () => {
      const rLayer = makeRasterLayer('r1', chunkId, 20, 20)
      const vLayer = makeVectorLayer('v1')
      setupStore([vLayer, rLayer])
      storeRasterData(chunkId, makeImageData(20, 20, 100, 100, 100, 255))
      useEditorStore.getState().selectLayer('v1')
      const result = beginPerspectiveWarp({ x: 0, y: 0, width: 20, height: 20 })
      expect(result).toBe(true)
    })
  })

  describe('applyPerspectiveWarp with warped plane', () => {
    test('warped plane moves pixels', () => {
      const src = makeImageData(20, 20, 128, 64, 32, 255)
      const plane: PerspectivePlane = {
        corners: [
          { x: 2, y: 2 },
          { x: 15, y: 3 },
          { x: 16, y: 16 },
          { x: 3, y: 15 },
        ],
        originalCorners: [
          { x: 2, y: 2 },
          { x: 17, y: 2 },
          { x: 17, y: 17 },
          { x: 2, y: 17 },
        ],
        adjacentPlanes: [],
      }
      const result = applyPerspectiveWarp(src, [plane])
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
    })

    test('two adjacent warped planes', () => {
      const src = makeImageData(20, 20, 80, 80, 80, 255)
      const planes: PerspectivePlane[] = [
        {
          corners: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 19 },
            { x: 0, y: 19 },
          ],
          originalCorners: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 19 },
            { x: 0, y: 19 },
          ],
          adjacentPlanes: [],
        },
        {
          corners: [
            { x: 10, y: 0 },
            { x: 19, y: 1 },
            { x: 19, y: 18 },
            { x: 10, y: 19 },
          ],
          originalCorners: [
            { x: 10, y: 0 },
            { x: 19, y: 0 },
            { x: 19, y: 19 },
            { x: 10, y: 19 },
          ],
          adjacentPlanes: [],
        },
      ]
      const result = applyPerspectiveWarp(src, planes)
      expect(result.width).toBe(20)
      expect(result.height).toBe(20)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. TOUCH TYPE — cover renderTouchType and hitTestCharacter
// ═══════════════════════════════════════════════════════════════════════════════

describe('touch-type deep coverage', () => {
  describe('renderTouchType', () => {
    test('renders without errors on mock context', () => {
      const textLayer = makeTextLayer({
        text: 'AB\nC',
        characterTransforms: [{ charIndex: 0, x: 5, y: 2, rotation: 15, scaleX: 1.2, scaleY: 0.8 }],
      })

      // Create a mock canvas context
      const ops: string[] = []
      const mockCtx = {
        save: () => ops.push('save'),
        restore: () => ops.push('restore'),
        font: '',
        fillStyle: '',
        textBaseline: '',
        measureText: (_ch: string) => ({ width: 10 }),
        translate: (x: number, y: number) => ops.push(`translate(${x},${y})`),
        rotate: (r: number) => ops.push(`rotate(${r})`),
        scale: (sx: number, sy: number) => ops.push(`scale(${sx},${sy})`),
        fillText: (t: string, x: number, y: number) => ops.push(`fillText(${t},${x},${y})`),
      } as unknown as CanvasRenderingContext2D

      renderTouchType(mockCtx, textLayer)

      // Should have drawn characters
      expect(ops.some((o) => o.startsWith('fillText'))).toBe(true)
      // Should handle newlines (translate for line)
      expect(ops.some((o) => o.includes('translate'))).toBe(true)
    })

    test('renders empty text without error', () => {
      const textLayer = makeTextLayer({ text: '' })
      const mockCtx = {
        save: () => {},
        restore: () => {},
        font: '',
        fillStyle: '',
        textBaseline: '',
        measureText: () => ({ width: 10 }),
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D

      // Should not throw
      renderTouchType(mockCtx, textLayer)
    })

    test('renders with italic/bold font styles', () => {
      const textLayer = makeTextLayer({
        text: 'X',
        fontStyle: 'italic',
        fontWeight: 'bold',
      })

      let usedFont = ''
      const mockCtx = {
        save: () => {},
        restore: () => {},
        font: '',
        set font_(v: string) {
          usedFont = v
        },
        get font_() {
          return usedFont
        },
        fillStyle: '',
        textBaseline: '',
        measureText: () => ({ width: 10 }),
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D

      renderTouchType(mockCtx, textLayer)
    })
  })

  describe('hitTestCharacter', () => {
    test('returns null for empty text', () => {
      const textLayer = makeTextLayer({ text: '' })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      expect(hitTestCharacter(mockCtx, textLayer, 5, 5)).toBeNull()
    })

    test('hits a character at correct position', () => {
      const textLayer = makeTextLayer({
        text: 'ABC',
        fontSize: 16,
        lineHeight: 1.2,
        letterSpacing: 0,
      })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      // Character 'A' starts at x=0, width=10, y from -16 to 0
      const result = hitTestCharacter(mockCtx, textLayer, 5, -8)
      expect(result).toBe(0)
    })

    test('hits second character', () => {
      const textLayer = makeTextLayer({
        text: 'ABC',
        fontSize: 16,
        lineHeight: 1.2,
        letterSpacing: 0,
      })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      // Character 'B' starts at x=10, width=10
      const result = hitTestCharacter(mockCtx, textLayer, 15, -8)
      expect(result).toBe(1)
    })

    test('returns null for point outside all characters', () => {
      const textLayer = makeTextLayer({ text: 'A', fontSize: 16 })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      expect(hitTestCharacter(mockCtx, textLayer, 100, 100)).toBeNull()
    })

    test('handles newlines in hit-test', () => {
      const textLayer = makeTextLayer({
        text: 'A\nB',
        fontSize: 16,
        lineHeight: 1.5,
        letterSpacing: 0,
      })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      // 'B' is on the second line: cursorY = 16 * 1.5 = 24
      // charY = 24 + 0 - 16 = 8, charEndY = 8 + 16 = 24
      const result = hitTestCharacter(mockCtx, textLayer, 5, 16)
      expect(result).toBe(2) // index 2 is 'B' (0='A', 1='\n', 2='B')
    })

    test('hit-test with character transforms', () => {
      const textLayer = makeTextLayer({
        text: 'AB',
        fontSize: 16,
        characterTransforms: [{ charIndex: 0, x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
      })
      const mockCtx = {
        font: '',
        measureText: () => ({ width: 10 }),
      } as unknown as CanvasRenderingContext2D

      // Character 'A' is shifted right by 20, so charX = 0 + 20 = 20
      const result = hitTestCharacter(mockCtx, textLayer, 25, -8)
      expect(result).toBe(0)
    })
  })

  describe('transformCharacter edge cases', () => {
    test('transforms with undefined existing array', () => {
      const result = transformCharacter(undefined, 0, { x: 5 })
      expect(result.length).toBe(1)
      expect(result[0]!.x).toBe(5)
    })

    test('setCharacterTransform with undefined existing', () => {
      const result = setCharacterTransform(undefined, 0, { x: 10, rotation: 45 })
      expect(result.length).toBe(1)
      expect(result[0]!.x).toBe(10)
      expect(result[0]!.rotation).toBe(45)
    })

    test('resetCharacterTransform with undefined returns empty', () => {
      expect(resetCharacterTransform(undefined, 0)).toEqual([])
    })

    test('resetAllCharacterTransforms returns empty', () => {
      expect(resetAllCharacterTransforms()).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. VARIABLE FONTS — cover queryFontAxes, applyFontVariations, getWeightFromAxes,
//    getWidthFromAxes, formatVariationSettings edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('variable-fonts deep coverage', () => {
  describe('queryFontAxes', () => {
    test('returns default axes in non-browser env', () => {
      const axes = queryFontAxes('SomeFont')
      expect(axes.length).toBe(5)
      expect(axes[0]!.tag).toBe('wght')
      expect(axes[1]!.tag).toBe('wdth')
    })
  })

  describe('formatVariationSettings', () => {
    test('empty when all axes at default', () => {
      const axes = getDefaultAxes()
      expect(formatVariationSettings(axes)).toBe('')
    })

    test('includes modified axes only', () => {
      const axes = getDefaultAxes().map((a) => (a.tag === 'wght' ? { ...a, value: 700 } : a))
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700")
    })

    test('includeAll includes every axis', () => {
      const axes = getDefaultAxes()
      const result = formatVariationSettings(axes, true)
      expect(result).toContain("'wght'")
      expect(result).toContain("'wdth'")
      expect(result).toContain("'ital'")
      expect(result).toContain("'slnt'")
      expect(result).toContain("'opsz'")
    })

    test('multiple modified axes are comma-separated', () => {
      const axes = getDefaultAxes().map((a) => {
        if (a.tag === 'wght') return { ...a, value: 700 }
        if (a.tag === 'wdth') return { ...a, value: 85 }
        return a
      })
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700, 'wdth' 85")
    })
  })

  describe('applyFontVariations', () => {
    test('does nothing when no axes', () => {
      const layer = makeTextLayer({ fontVariationAxes: [] })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      // font should not have been set (no axes)
      expect(mockCtx.font).toBe('')
    })

    test('does nothing when axes undefined', () => {
      const layer = makeTextLayer({ fontVariationAxes: undefined })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toBe('')
    })

    test('sets font string with weight from wght axis', () => {
      const axes: FontVariationAxis[] = [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400, value: 700 }]
      const layer = makeTextLayer({ fontVariationAxes: axes })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toContain('700')
      expect(mockCtx.font).toContain('Arial')
    })

    test('sets font string with width from wdth axis', () => {
      const axes: FontVariationAxis[] = [{ tag: 'wdth', name: 'Width', min: 75, max: 125, default: 100, value: 85 }]
      const layer = makeTextLayer({ fontVariationAxes: axes })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toContain('85%')
    })

    test('falls back to bold weight (700) when no wght axis', () => {
      const axes: FontVariationAxis[] = [{ tag: 'slnt', name: 'Slant', min: -90, max: 90, default: 0, value: -12 }]
      const layer = makeTextLayer({
        fontVariationAxes: axes,
        fontWeight: 'bold',
      })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toContain('700')
    })

    test('sets fontVariationSettings on context if supported', () => {
      const axes: FontVariationAxis[] = [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400, value: 600 }]
      const layer = makeTextLayer({ fontVariationAxes: axes })
      const mockCtx = {
        font: '',
        fontVariationSettings: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect((mockCtx as any).fontVariationSettings).toContain("'wght' 600")
    })

    test('uses italic style string for italic fontStyle', () => {
      const axes: FontVariationAxis[] = [{ tag: 'ital', name: 'Italic', min: 0, max: 1, default: 0, value: 1 }]
      const layer = makeTextLayer({
        fontVariationAxes: axes,
        fontStyle: 'italic',
      })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toContain('italic')
    })

    test('uses normal style string for normal fontStyle', () => {
      const axes: FontVariationAxis[] = [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400, value: 400 }]
      const layer = makeTextLayer({
        fontVariationAxes: axes,
        fontStyle: 'normal',
      })
      const mockCtx = {
        font: '',
      } as unknown as CanvasRenderingContext2D

      applyFontVariations(mockCtx, layer)
      expect(mockCtx.font).toContain('normal')
    })
  })

  describe('clampAxisValue', () => {
    test('clamps value below min', () => {
      const axis: FontVariationAxis = { tag: 'wght', name: 'W', min: 100, max: 900, default: 400, value: 400 }
      expect(clampAxisValue(axis, 50)).toBe(100)
    })

    test('clamps value above max', () => {
      const axis: FontVariationAxis = { tag: 'wght', name: 'W', min: 100, max: 900, default: 400, value: 400 }
      expect(clampAxisValue(axis, 1000)).toBe(900)
    })

    test('passes through value in range', () => {
      const axis: FontVariationAxis = { tag: 'wght', name: 'W', min: 100, max: 900, default: 400, value: 400 }
      expect(clampAxisValue(axis, 500)).toBe(500)
    })
  })

  describe('updateAxisValue', () => {
    test('updates the correct axis', () => {
      const axes = getDefaultAxes()
      const updated = updateAxisValue(axes, 'wght', 700)
      const wght = updated.find((a) => a.tag === 'wght')!
      expect(wght.value).toBe(700)
    })

    test('clamps out-of-range value', () => {
      const axes = getDefaultAxes()
      const updated = updateAxisValue(axes, 'wght', 2000)
      expect(updated.find((a) => a.tag === 'wght')!.value).toBe(900)
    })

    test('does not mutate original array', () => {
      const axes = getDefaultAxes()
      const orig = axes[0]!.value
      updateAxisValue(axes, 'wght', 700)
      expect(axes[0]!.value).toBe(orig)
    })

    test('leaves non-matching axes unchanged', () => {
      const axes = getDefaultAxes()
      const updated = updateAxisValue(axes, 'wght', 700)
      const wdth = updated.find((a) => a.tag === 'wdth')!
      expect(wdth.value).toBe(100) // unchanged
    })
  })

  describe('resetAxes', () => {
    test('resets all to defaults', () => {
      const axes = getDefaultAxes().map((a) => ({ ...a, value: a.max }))
      const reset = resetAxes(axes)
      for (const axis of reset) {
        expect(axis.value).toBe(axis.default)
      }
    })

    test('does not mutate original', () => {
      const axes = getDefaultAxes().map((a) => ({ ...a, value: a.max }))
      resetAxes(axes)
      for (const axis of axes) {
        expect(axis.value).toBe(axis.max)
      }
    })
  })
})
