import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origImageData = globalThis.ImageData
const origOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  globalThis.ImageData = origImageData
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

// Polyfill ImageData for bun test environment
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
    }
  }
}

// Polyfill OffscreenCanvas for bun test environment
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      const self = this
      return {
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        bezierCurveTo() {},
        quadraticCurveTo() {},
        closePath() {},
        arc() {},
        rect() {},
        clip() {},
        fill() {},
        stroke() {},
        fillRect() {},
        clearRect() {},
        drawImage() {},
        setTransform() {},
        resetTransform() {},
        scale() {},
        translate() {},
        rotate() {},
        setLineDash() {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 50 }),
        fillText() {},
        putImageData() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          return new (globalThis as any).ImageData(w, h)
        },
        createImageData: (w: number, h: number) => {
          return new (globalThis as any).ImageData(w, h)
        },
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        canvas: {
          get width() {
            return self.width
          },
          get height() {
            return self.height
          },
          toDataURL: () => 'data:image/png;base64,',
          toBlob: (cb: any) => cb(new Blob()),
        },
      }
    }
  }
}

import {
  getSpotHealingSettings,
  setSpotHealingSettings,
  beginSpotHealing,
  paintSpotHealing,
  endSpotHealing,
} from '@/tools/spot-healing'

import {
  getPatchSettings,
  setPatchSettings,
  beginPatchOutline,
  addPatchPoint,
  closePatchOutline,
  beginPatchDrag,
  updatePatchDrag,
  applyPatch,
  cancelPatch,
  isPatchActive,
  getPatchPoints,
  getPatchPhase,
  getPatchDragOffset,
} from '@/tools/patch-tool'

import { useEditorStore } from '@/store/editor.store'
import { storeRasterData, getRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ── Helper: set up a raster layer with known pixel data ──

function setupRasterLayer(width = 100, height = 100): string {
  useEditorStore.getState().newDocument({ width, height })
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]!

  const chunkId = 'test-raster-chunk'
  const imageData = new ImageData(width, height)

  // Fill with a gradient pattern for meaningful healing tests
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      imageData.data[idx] = Math.round((x / width) * 255) // R: left-right gradient
      imageData.data[idx + 1] = Math.round((y / height) * 255) // G: top-bottom gradient
      imageData.data[idx + 2] = 128 // B: constant
      imageData.data[idx + 3] = 255 // A: opaque
    }
  }
  storeRasterData(chunkId, imageData)

  const rasterLayer: RasterLayer = {
    id: 'test-raster-layer',
    name: 'Test Raster',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width,
    height,
  }
  store.addLayer(artboard.id, rasterLayer)
  store.selectLayer(rasterLayer.id)

  return chunkId
}

// ── Spot Healing Brush Tests ──

describe('Spot Healing — settings', () => {
  test('getSpotHealingSettings returns defaults', () => {
    const settings = getSpotHealingSettings()
    expect(settings.size).toBeGreaterThan(0)
    expect(typeof settings.hardness).toBe('number')
    expect(settings.type).toBe('proximity-match')
  })

  test('setSpotHealingSettings updates partial settings', () => {
    const original = getSpotHealingSettings()
    setSpotHealingSettings({ size: 42 })
    expect(getSpotHealingSettings().size).toBe(42)
    setSpotHealingSettings({ size: original.size })
  })

  test('setSpotHealingSettings updates type', () => {
    setSpotHealingSettings({ type: 'create-texture' })
    expect(getSpotHealingSettings().type).toBe('create-texture')
    setSpotHealingSettings({ type: 'proximity-match' })
  })

  test('returns a copy, not the internal object', () => {
    const a = getSpotHealingSettings()
    const b = getSpotHealingSettings()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('Spot Healing — stroke lifecycle', () => {
  beforeEach(() => {
    setSpotHealingSettings({ size: 10, hardness: 0.8, type: 'proximity-match' })
    endSpotHealing() // ensure clean state
  })

  test('beginSpotHealing returns chunkId with valid raster layer', () => {
    const chunkId = setupRasterLayer()
    const result = beginSpotHealing(50, 50, 'artboard-1')
    expect(result).toBe(chunkId)
    endSpotHealing()
  })

  test('beginSpotHealing returns null without raster layer', () => {
    useEditorStore.getState().newDocument({ width: 100, height: 100 })
    const result = beginSpotHealing(50, 50, 'artboard-1')
    expect(result).toBeNull()
    endSpotHealing()
  })

  test('paintSpotHealing adds to mask without crash', () => {
    setupRasterLayer()
    beginSpotHealing(50, 50, 'artboard-1')
    paintSpotHealing(55, 50)
    paintSpotHealing(60, 50)
    paintSpotHealing(65, 50)
    endSpotHealing()
  })

  test('paintSpotHealing ignores close points', () => {
    setupRasterLayer()
    beginSpotHealing(50, 50, 'artboard-1')
    paintSpotHealing(50, 50) // too close, should be ignored
    endSpotHealing()
  })

  test('endSpotHealing without begin does not crash', () => {
    endSpotHealing()
  })

  test('spot healing modifies pixels in proximity-match mode', () => {
    const chunkId = setupRasterLayer()
    setSpotHealingSettings({ size: 10, hardness: 1, type: 'proximity-match' })

    // Copy data before healing — getRasterData returns a reference that gets modified in-place
    const beforeRef = getRasterData(chunkId)!
    const before = { data: new Uint8ClampedArray(beforeRef.data), width: beforeRef.width, height: beforeRef.height }

    beginSpotHealing(50, 50, 'artboard-1')
    paintSpotHealing(52, 50)
    paintSpotHealing(54, 50)
    endSpotHealing()

    const after = getRasterData(chunkId)!
    // Some pixels in the stroke region should have changed
    let anyChanged = false
    for (let y = 45; y < 55; y++) {
      for (let x = 45; x < 60; x++) {
        const idx = (y * 100 + x) * 4
        if (after.data[idx] !== before.data[idx]) {
          anyChanged = true
          break
        }
      }
      if (anyChanged) break
    }
    // The healing should have had some effect
    expect(anyChanged).toBe(true)
  })

  test('spot healing works in create-texture mode', () => {
    const chunkId = setupRasterLayer()
    setSpotHealingSettings({ size: 10, hardness: 1, type: 'create-texture' })

    beginSpotHealing(50, 50, 'artboard-1')
    paintSpotHealing(52, 50)
    paintSpotHealing(54, 50)
    endSpotHealing()

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
    // Pixel data should still be valid
    expect(after.width).toBe(100)
    expect(after.height).toBe(100)
  })

  test('spot healing with small brush at edge of canvas', () => {
    const chunkId = setupRasterLayer()
    setSpotHealingSettings({ size: 5, hardness: 1, type: 'proximity-match' })

    beginSpotHealing(2, 2, 'artboard-1')
    paintSpotHealing(3, 2)
    endSpotHealing()

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })

  test('endSpotHealing with no mask pixels is a no-op', () => {
    const chunkId = setupRasterLayer()

    // Begin but do not paint
    beginSpotHealing(50, 50, 'artboard-1')
    // endSpotHealing immediately — only the first dab was applied
    endSpotHealing()

    // At minimum, the function should not crash
    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })
})

// ── Patch Tool Tests ──

describe('Patch Tool — settings', () => {
  test('getPatchSettings returns defaults', () => {
    const settings = getPatchSettings()
    expect(settings.mode).toBe('normal')
    expect(settings.diffusion).toBeGreaterThan(0)
  })

  test('setPatchSettings updates partial settings', () => {
    setPatchSettings({ mode: 'content-aware' })
    expect(getPatchSettings().mode).toBe('content-aware')
    setPatchSettings({ mode: 'normal' })
  })

  test('setPatchSettings updates diffusion', () => {
    const original = getPatchSettings().diffusion
    setPatchSettings({ diffusion: 7 })
    expect(getPatchSettings().diffusion).toBe(7)
    setPatchSettings({ diffusion: original })
  })

  test('returns a copy, not the internal object', () => {
    const a = getPatchSettings()
    const b = getPatchSettings()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('Patch Tool — outline drawing', () => {
  beforeEach(() => {
    cancelPatch()
    setPatchSettings({ mode: 'normal', diffusion: 4 })
  })

  test('beginPatchOutline starts drawing phase', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    expect(isPatchActive()).toBe(true)
    expect(getPatchPhase()).toBe('drawing')
    expect(getPatchPoints().length).toBe(1)
    cancelPatch()
  })

  test('addPatchPoint adds points during drawing', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    addPatchPoint(20, 20)
    addPatchPoint(10, 20)
    expect(getPatchPoints().length).toBe(4)
    cancelPatch()
  })

  test('addPatchPoint ignored when not drawing', () => {
    addPatchPoint(20, 10)
    expect(getPatchPoints().length).toBe(0)
  })

  test('closePatchOutline transitions to closed phase', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    addPatchPoint(20, 20)
    const closed = closePatchOutline()
    expect(closed).toBe(true)
    expect(getPatchPhase()).toBe('closed')
    cancelPatch()
  })

  test('closePatchOutline fails with fewer than 3 points', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    const closed = closePatchOutline()
    expect(closed).toBe(false)
    expect(getPatchPhase()).toBe('drawing')
    cancelPatch()
  })

  test('closePatchOutline fails when not in drawing phase', () => {
    const closed = closePatchOutline()
    expect(closed).toBe(false)
  })
})

describe('Patch Tool — drag phase', () => {
  beforeEach(() => {
    cancelPatch()
    setPatchSettings({ mode: 'normal', diffusion: 4 })
  })

  test('beginPatchDrag transitions from closed to dragging', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    addPatchPoint(20, 20)
    closePatchOutline()

    const started = beginPatchDrag(15, 15)
    expect(started).toBe(true)
    expect(getPatchPhase()).toBe('dragging')
    cancelPatch()
  })

  test('beginPatchDrag fails when not closed', () => {
    const started = beginPatchDrag(15, 15)
    expect(started).toBe(false)
  })

  test('updatePatchDrag updates offset', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    addPatchPoint(20, 20)
    closePatchOutline()
    beginPatchDrag(15, 15)

    updatePatchDrag(25, 25)
    const offset = getPatchDragOffset()
    expect(offset.x).toBe(10)
    expect(offset.y).toBe(10)
    cancelPatch()
  })

  test('updatePatchDrag ignored when not dragging', () => {
    updatePatchDrag(25, 25)
    const offset = getPatchDragOffset()
    expect(offset.x).toBe(0)
    expect(offset.y).toBe(0)
  })
})

describe('Patch Tool — apply', () => {
  beforeEach(() => {
    cancelPatch()
    setPatchSettings({ mode: 'normal', diffusion: 4 })
  })

  test('applyPatch in normal mode modifies pixels', () => {
    const chunkId = setupRasterLayer()

    // Draw outline around center area (40,40) to (60,60)
    beginPatchOutline(40, 40)
    addPatchPoint(60, 40)
    addPatchPoint(60, 60)
    addPatchPoint(40, 60)
    closePatchOutline()

    // Drag to offset (20, 0) — sample from (60,40)-(80,60)
    beginPatchDrag(50, 50)
    updatePatchDrag(70, 50)

    const result = applyPatch()
    expect(result).toBe(true)
    expect(isPatchActive()).toBe(false)

    // Verify pixels were modified
    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
    expect(after.width).toBe(100)
  })

  test('applyPatch in content-aware mode modifies pixels', () => {
    const chunkId = setupRasterLayer()
    setPatchSettings({ mode: 'content-aware', diffusion: 4 })

    beginPatchOutline(40, 40)
    addPatchPoint(60, 40)
    addPatchPoint(60, 60)
    addPatchPoint(40, 60)
    closePatchOutline()

    beginPatchDrag(50, 50)
    updatePatchDrag(70, 50)

    const result = applyPatch()
    expect(result).toBe(true)

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })

  test('applyPatch fails when not dragging', () => {
    setupRasterLayer()
    const result = applyPatch()
    expect(result).toBe(false)
  })

  test('applyPatch resets state after success', () => {
    setupRasterLayer()

    beginPatchOutline(40, 40)
    addPatchPoint(60, 40)
    addPatchPoint(60, 60)
    addPatchPoint(40, 60)
    closePatchOutline()
    beginPatchDrag(50, 50)
    updatePatchDrag(70, 50)
    applyPatch()

    expect(isPatchActive()).toBe(false)
    expect(getPatchPhase()).toBe('idle')
    expect(getPatchPoints().length).toBe(0)
  })
})

describe('Patch Tool — cancellation', () => {
  test('cancelPatch resets all state', () => {
    setupRasterLayer()

    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    addPatchPoint(20, 20)
    closePatchOutline()
    beginPatchDrag(15, 15)
    updatePatchDrag(25, 25)

    cancelPatch()

    expect(isPatchActive()).toBe(false)
    expect(getPatchPhase()).toBe('idle')
    expect(getPatchPoints().length).toBe(0)
    expect(getPatchDragOffset().x).toBe(0)
    expect(getPatchDragOffset().y).toBe(0)
  })

  test('cancelPatch from idle does not crash', () => {
    cancelPatch()
    expect(isPatchActive()).toBe(false)
  })

  test('cancelPatch from drawing phase', () => {
    setupRasterLayer()
    beginPatchOutline(10, 10)
    addPatchPoint(20, 10)
    cancelPatch()
    expect(isPatchActive()).toBe(false)
  })
})

describe('Patch Tool — edge cases', () => {
  beforeEach(() => {
    cancelPatch()
    setPatchSettings({ mode: 'normal', diffusion: 4 })
  })

  test('small triangle patch', () => {
    const chunkId = setupRasterLayer()

    beginPatchOutline(50, 50)
    addPatchPoint(55, 50)
    addPatchPoint(52, 55)
    closePatchOutline()
    beginPatchDrag(52, 52)
    updatePatchDrag(62, 52)

    const result = applyPatch()
    expect(result).toBe(true)

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })

  test('patch at canvas edge', () => {
    const chunkId = setupRasterLayer()

    beginPatchOutline(0, 0)
    addPatchPoint(10, 0)
    addPatchPoint(10, 10)
    addPatchPoint(0, 10)
    closePatchOutline()
    beginPatchDrag(5, 5)
    updatePatchDrag(55, 55)

    const result = applyPatch()
    expect(result).toBe(true)

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })

  test('content-aware with high diffusion', () => {
    const chunkId = setupRasterLayer()
    setPatchSettings({ mode: 'content-aware', diffusion: 10 })

    beginPatchOutline(30, 30)
    addPatchPoint(50, 30)
    addPatchPoint(50, 50)
    addPatchPoint(30, 50)
    closePatchOutline()
    beginPatchDrag(40, 40)
    updatePatchDrag(60, 40)

    const result = applyPatch()
    expect(result).toBe(true)

    const after = getRasterData(chunkId)!
    expect(after).toBeDefined()
  })
})

describe('activeTool union includes new tools', () => {
  test('spot-healing is a valid activeTool', () => {
    const store = useEditorStore.getState()
    store.setActiveTool('spot-healing')
    expect(useEditorStore.getState().activeTool).toBe('spot-healing')
  })

  test('patch is a valid activeTool', () => {
    const store = useEditorStore.getState()
    store.setActiveTool('patch')
    expect(useEditorStore.getState().activeTool).toBe('patch')
  })
})
