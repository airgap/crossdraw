import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getInfiniteArtboardBounds } from '@/math/bbox'
import type { Artboard, VectorLayer, Transform } from '@/types'

// Save originals
const origDocument = (globalThis as any).document

afterAll(() => {
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  } else {
    delete (globalThis as any).document
  }
})

// Ensure document.documentElement exists for toggleTouchMode
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = {
    documentElement: { classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
  }
} else if (!globalThis.document.documentElement) {
  ;(globalThis.document as any).documentElement = {
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    style: {},
  }
}

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument()
}

function getState() {
  return useEditorStore.getState()
}

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides }
}

function makeArtboard(overrides: Partial<Artboard> = {}): Artboard {
  return {
    id: 'ab-test',
    name: 'Test Artboard',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    layers: [],
    ...overrides,
  }
}

// ── getActiveArtboard ──

describe('getActiveArtboard', () => {
  beforeEach(resetStore)

  test('returns first artboard in overview mode', () => {
    const ab = getActiveArtboard()
    expect(ab).not.toBeNull()
    expect(ab!.id).toBe(getState().document.artboards[0]!.id)
  })

  test('returns first non-infinite artboard in overview mode', () => {
    const state = getState()
    // Add an infinite artboard as the first artboard
    state.addInfiniteArtboard('Infinite 1')
    // Reset tab to overview
    state.switchTab('overview')

    const ab = getActiveArtboard()
    expect(ab).not.toBeNull()
    expect(ab!.isInfinite).toBeFalsy()
  })

  test('returns the infinite artboard when its tab is active', () => {
    const state = getState()
    state.addInfiniteArtboard('Infinite 1')

    // addInfiniteArtboard auto-switches to the new tab
    const ab = getActiveArtboard()
    expect(ab).not.toBeNull()
    expect(ab!.isInfinite).toBe(true)
    expect(ab!.name).toBe('Infinite 1')
  })

  test('returns null for non-existent tab id', () => {
    useEditorStore.setState({ activeTabId: 'non-existent-id' })
    const ab = getActiveArtboard()
    expect(ab).toBeNull()
  })

  test('falls back to artboards[0] when all artboards are infinite in overview', () => {
    const state = getState()
    // Toggle the default artboard to infinite
    const defaultId = state.document.artboards[0]!.id
    state.toggleArtboardInfinite(defaultId)
    // Go to overview
    state.switchTab('overview')

    const ab = getActiveArtboard()
    // Should fall back to artboards[0] even though it's infinite
    expect(ab).not.toBeNull()
  })
})

// ── switchTab ──

describe('switchTab', () => {
  beforeEach(resetStore)

  test('switches activeTabId', () => {
    getState().addInfiniteArtboard('Infinite 1')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    expect(getState().activeTabId).toBe(infId) // auto-switched

    getState().switchTab('overview')
    expect(getState().activeTabId).toBe('overview')

    getState().switchTab(infId)
    expect(getState().activeTabId).toBe(infId)
  })

  test('saves and restores viewport per tab', () => {
    // Create infinite artboard first (auto-switches to it)
    getState().addInfiniteArtboard('Infinite 1')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    // Set viewport in infinite tab
    getState().setZoom(0.5)
    getState().setPan(300, 400)

    // Switch to overview (saves infinite tab viewport)
    getState().switchTab('overview')

    // Set viewport in overview
    getState().setZoom(2)
    getState().setPan(100, 200)

    // Switch to infinite tab — should restore its viewport
    getState().switchTab(infId)
    expect(getState().viewport.zoom).toBe(0.5)
    expect(getState().viewport.panX).toBe(300)
    expect(getState().viewport.panY).toBe(400)

    // Switch back to overview — should restore overview viewport
    getState().switchTab('overview')
    expect(getState().viewport.zoom).toBe(2)
    expect(getState().viewport.panX).toBe(100)
    expect(getState().viewport.panY).toBe(200)
  })

  test('clears selection on tab switch', () => {
    const state = getState()
    const abId = state.document.artboards[0]!.id
    const layer: VectorLayer = {
      id: 'v1',
      name: 'Vec',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform(),
      paths: [],
      fill: null,
      stroke: null,
    }
    state.addLayer(abId, layer)
    state.selectLayer('v1')
    expect(getState().selection.layerIds).toContain('v1')

    state.addInfiniteArtboard('Infinite 1')
    // Selection should be cleared after tab switch
    expect(getState().selection.layerIds).toHaveLength(0)
  })

  test('sets viewport.artboardId on tab switch', () => {
    const state = getState()
    state.addInfiniteArtboard('Infinite 1')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    expect(getState().viewport.artboardId).toBe(infId)

    getState().switchTab('overview')
    expect(getState().viewport.artboardId).toBeNull()
  })

  test('no-op when switching to current tab', () => {
    const state = getState()
    state.setPan(42, 84)
    state.switchTab('overview') // already on overview
    expect(getState().viewport.panX).toBe(42)
    expect(getState().viewport.panY).toBe(84)
  })
})

// ── addInfiniteArtboard ──

describe('addInfiniteArtboard', () => {
  beforeEach(resetStore)

  test('creates an infinite artboard with correct properties', () => {
    getState().addInfiniteArtboard('My Canvas')

    const inf = getState().document.artboards.find((a) => a.isInfinite)
    expect(inf).toBeDefined()
    expect(inf!.name).toBe('My Canvas')
    expect(inf!.isInfinite).toBe(true)
    expect(inf!.width).toBe(0)
    expect(inf!.height).toBe(0)
    expect(inf!.backgroundColor).toBe('#2a2a2a')
    expect(inf!.layers).toHaveLength(0)
  })

  test('auto-switches to the new infinite tab', () => {
    getState().addInfiniteArtboard('My Canvas')

    const inf = getState().document.artboards.find((a) => a.isInfinite)!
    expect(getState().activeTabId).toBe(inf.id)
  })

  test('preserves existing artboards', () => {
    const countBefore = getState().document.artboards.length
    getState().addInfiniteArtboard('Canvas')
    expect(getState().document.artboards.length).toBe(countBefore + 1)
  })
})

// ── toggleArtboardInfinite ──

describe('toggleArtboardInfinite', () => {
  beforeEach(resetStore)

  test('toggles bounded artboard to infinite', () => {
    const abId = getState().document.artboards[0]!.id
    getState().toggleArtboardInfinite(abId)

    const ab = getState().document.artboards.find((a) => a.id === abId)!
    expect(ab.isInfinite).toBe(true)
    expect(ab.width).toBe(0)
    expect(ab.height).toBe(0)
    expect(ab.backgroundColor).toBe('#2a2a2a')
  })

  test('toggles infinite artboard back to bounded with sensible defaults', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    getState().toggleArtboardInfinite(infId)

    const ab = getState().document.artboards.find((a) => a.id === infId)!
    expect(ab.isInfinite).toBe(false)
    expect(ab.width).toBe(1920)
    expect(ab.height).toBe(1080)
    expect(ab.backgroundColor).toBe('#ffffff')
  })

  test('switches to infinite tab when toggling to infinite', () => {
    const abId = getState().document.artboards[0]!.id
    getState().toggleArtboardInfinite(abId)
    expect(getState().activeTabId).toBe(abId)
  })

  test('switches back to overview when toggling active infinite tab to bounded', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id
    expect(getState().activeTabId).toBe(infId)

    getState().toggleArtboardInfinite(infId)
    expect(getState().activeTabId).toBe('overview')
  })

  test('preserves non-default background when toggling to bounded', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    // Manually set background to something other than #2a2a2a
    const { document: doc } = getState()
    const idx = doc.artboards.findIndex((a) => a.id === infId)
    const updated = { ...doc.artboards[idx]!, backgroundColor: '#ff0000' }
    const newArtboards = [...doc.artboards]
    newArtboards[idx] = updated
    useEditorStore.setState({ document: { ...doc, artboards: newArtboards } })

    getState().toggleArtboardInfinite(infId)
    const ab = getState().document.artboards.find((a) => a.id === infId)!
    // Should preserve custom background (only resets #2a2a2a -> #ffffff)
    expect(ab.backgroundColor).toBe('#ff0000')
  })
})

// ── deleteArtboard with infinite tabs ──

describe('deleteArtboard with infinite tabs', () => {
  beforeEach(resetStore)

  test('switches to overview when deleting active infinite tab', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id
    expect(getState().activeTabId).toBe(infId)

    getState().deleteArtboard(infId)
    expect(getState().activeTabId).toBe('overview')
    expect(getState().document.artboards.find((a) => a.id === infId)).toBeUndefined()
  })

  test('stays on current tab when deleting a different artboard', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id
    expect(getState().activeTabId).toBe(infId)

    // Delete the bounded artboard while viewing infinite tab
    const boundedId = getState().document.artboards.find((a) => !a.isInfinite)!.id
    getState().deleteArtboard(boundedId)
    expect(getState().activeTabId).toBe(infId)
  })
})

// ── zoomToFit with infinite artboards ──

describe('zoomToFit with infinite artboards', () => {
  beforeEach(resetStore)

  test('zooms to layer content bounds for infinite artboard', () => {
    getState().addInfiniteArtboard('Canvas')
    const infId = getState().document.artboards.find((a) => a.isInfinite)!.id

    // Add a vector layer with content
    const layer: VectorLayer = {
      id: 'v1',
      name: 'Shape',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform({ x: 100, y: 100 }),
      paths: [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 200, y: 0 },
            { type: 'line', x: 200, y: 200 },
            { type: 'line', x: 0, y: 200 },
            { type: 'close' },
          ],
          closed: true,
        },
      ],
      fill: null,
      stroke: null,
    }
    getState().addLayer(infId, layer)

    // zoomToFit should work without crashing
    getState().zoomToFit(1000, 800)
    expect(getState().viewport.zoom).toBeGreaterThan(0)
    expect(getState().viewport.zoom).toBeLessThanOrEqual(10)
  })

  test('uses fallback bounds for empty infinite artboard', () => {
    getState().addInfiniteArtboard('Empty Canvas')

    // Should not crash with empty artboard
    getState().zoomToFit(1000, 800)
    expect(getState().viewport.zoom).toBeGreaterThan(0)
  })
})

// ── getInfiniteArtboardBounds ──

describe('getInfiniteArtboardBounds', () => {
  test('returns fallback 1920x1080 for empty artboard', () => {
    const ab = makeArtboard({ isInfinite: true, width: 0, height: 0, layers: [] })
    const bounds = getInfiniteArtboardBounds(ab)
    expect(bounds.width).toBe(1920)
    expect(bounds.height).toBe(1080)
  })

  test('returns fallback when all layers are hidden', () => {
    const layer: VectorLayer = {
      id: 'v1',
      name: 'Hidden',
      type: 'vector',
      visible: false,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform({ x: 50, y: 50 }),
      paths: [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 100, y: 100 },
          ],
          closed: false,
        },
      ],
      fill: null,
      stroke: null,
    }
    const ab = makeArtboard({ isInfinite: true, width: 0, height: 0, layers: [layer] })
    const bounds = getInfiniteArtboardBounds(ab)
    expect(bounds.width).toBe(1920)
    expect(bounds.height).toBe(1080)
  })

  test('computes union bounds with padding for visible layers', () => {
    const layer: VectorLayer = {
      id: 'v1',
      name: 'Shape',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform({ x: 100, y: 200 }),
      paths: [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 300, y: 0 },
            { type: 'line', x: 300, y: 150 },
            { type: 'line', x: 0, y: 150 },
            { type: 'close' },
          ],
          closed: true,
        },
      ],
      fill: null,
      stroke: null,
    }
    const ab = makeArtboard({ isInfinite: true, width: 0, height: 0, layers: [layer] })
    const bounds = getInfiniteArtboardBounds(ab)

    // Layer extends from (100,200) to (400,350) in artboard-relative coords
    // With 20px padding on each side
    expect(bounds.width).toBe(340) // 300 + 40 padding
    expect(bounds.height).toBe(190) // 150 + 40 padding
    expect(bounds.offsetX).toBe(80) // 100 - 20 padding
    expect(bounds.offsetY).toBe(180) // 200 - 20 padding
  })

  test('computes union across multiple layers', () => {
    const layer1: VectorLayer = {
      id: 'v1',
      name: 'Left',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform({ x: 0, y: 0 }),
      paths: [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 50, y: 50 },
          ],
          closed: false,
        },
      ],
      fill: null,
      stroke: null,
    }
    const layer2: VectorLayer = {
      id: 'v2',
      name: 'Right',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      effects: [],
      transform: makeTransform({ x: 500, y: 500 }),
      paths: [
        {
          id: 'p2',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 100, y: 100 },
          ],
          closed: false,
        },
      ],
      fill: null,
      stroke: null,
    }
    const ab = makeArtboard({ isInfinite: true, width: 0, height: 0, layers: [layer1, layer2] })
    const bounds = getInfiniteArtboardBounds(ab)

    // Union spans from (0,0) to (600,600), plus 20px padding
    expect(bounds.width).toBe(640)
    expect(bounds.height).toBe(640)
    expect(bounds.offsetX).toBe(-20)
    expect(bounds.offsetY).toBe(-20)
  })
})

// ── EditorState initial tab values ──

describe('EditorState initial tab values', () => {
  beforeEach(resetStore)

  test('starts with overview tab and empty tabViewports', () => {
    expect(getState().activeTabId).toBe('overview')
    expect(getState().tabViewports).toEqual({})
  })
})
