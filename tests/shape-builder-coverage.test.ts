import { describe, test, expect, beforeEach } from 'bun:test'
import {
  computeRegions,
  initShapeBuilder,
  getShapeBuilderState,
  cancelShapeBuilder,
  isShapeBuilderActive,
  shapeBuilderHover,
  shapeBuilderMouseDown,
  shapeBuilderMouseDrag,
  shapeBuilderMouseUp,
  finalizeShapeBuilder,
  finalizeShapeBuilderWithRegions,
  renderShapeBuilderOverlay,
} from '@/tools/shape-builder'
import type { VectorLayer, Segment } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ── Helpers ──

function makeRect(x: number, y: number, w: number, h: number): Segment[] {
  return [
    { type: 'move', x, y },
    { type: 'line', x: x + w, y },
    { type: 'line', x: x + w, y: y + h },
    { type: 'line', x, y: y + h },
    { type: 'close' },
  ]
}

function makeVectorLayer(id: string, segments: Segment[], tx = 0, ty = 0): VectorLayer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: tx, y: ty, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [{ id: `${id}-path`, segments, closed: true }],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}

function mockCtx(w = 100, h = 100) {
  return {
    canvas: { width: w, height: h },
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
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
  } as unknown as CanvasRenderingContext2D
}

function setupOverlappingLayers() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]!
  const layerA = makeVectorLayer('sb-a', makeRect(0, 0, 100, 100))
  const layerB = makeVectorLayer('sb-b', makeRect(50, 0, 100, 100))
  store.addLayer(artboard.id, layerA)
  store.addLayer(artboard.id, layerB)
  return { artboard, layerA, layerB }
}

// ── Tests ──

describe('isShapeBuilderActive', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('returns false when not active', () => {
    expect(isShapeBuilderActive()).toBe(false)
  })

  test('returns true when active', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])
    expect(isShapeBuilderActive()).toBe(true)
    cancelShapeBuilder()
  })
})

describe('shapeBuilderHover', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    shapeBuilderHover(50, 50)
    expect(getShapeBuilderState().hoveredRegionId).toBeNull()
  })

  test('sets hovered region on hover', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    // Hover over a region that should exist in the exclusive area
    const region = state.regions[0]!
    const cx = region.bounds.x + region.bounds.w / 2
    const cy = region.bounds.y + region.bounds.h / 2
    shapeBuilderHover(cx, cy)
    expect(state.hoveredRegionId).not.toBeNull()

    cancelShapeBuilder()
  })

  test('sets null when hovering over empty space', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    shapeBuilderHover(9999, 9999)
    expect(getShapeBuilderState().hoveredRegionId).toBeNull()

    cancelShapeBuilder()
  })
})

describe('shapeBuilderMouseDown', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    shapeBuilderMouseDown(50, 50, false)
    // No crash
    expect(getShapeBuilderState().isDragging).toBe(false)
  })

  test('does nothing when clicking empty space', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])
    shapeBuilderMouseDown(9999, 9999, false)
    expect(getShapeBuilderState().isDragging).toBe(false)
    cancelShapeBuilder()
  })

  test('keeps region on normal click', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const region = state.regions[0]!
    const cx = region.bounds.x + region.bounds.w / 2
    const cy = region.bounds.y + region.bounds.h / 2
    shapeBuilderMouseDown(cx, cy, false)

    expect(state.regionStatus.get(region.id)).toBe('kept')
    expect(state.isDragging).toBe(true)
    expect(state.dragRegionIds).toContain(region.id)

    cancelShapeBuilder()
  })

  test('removes region on alt+click', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const region = state.regions[0]!
    const cx = region.bounds.x + region.bounds.w / 2
    const cy = region.bounds.y + region.bounds.h / 2
    shapeBuilderMouseDown(cx, cy, true)

    expect(state.regionStatus.get(region.id)).toBe('removed')
    // Alt+click doesn't start dragging
    expect(state.isDragging).toBe(false)

    cancelShapeBuilder()
  })
})

describe('shapeBuilderMouseDrag', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    shapeBuilderMouseDrag(50, 50)
    expect(getShapeBuilderState().isDragging).toBe(false)
  })

  test('does nothing when not dragging', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])
    shapeBuilderMouseDrag(50, 50)
    // isDragging should still be false
    expect(getShapeBuilderState().isDragging).toBe(false)
    cancelShapeBuilder()
  })

  test('adds regions during drag', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    // Start drag on first region
    const r0 = state.regions[0]!
    shapeBuilderMouseDown(r0.bounds.x + r0.bounds.w / 2, r0.bounds.y + r0.bounds.h / 2, false)

    // Drag to a different region
    if (state.regions.length > 1) {
      const r1 = state.regions[1]!
      shapeBuilderMouseDrag(r1.bounds.x + r1.bounds.w / 2, r1.bounds.y + r1.bounds.h / 2)
      expect(state.dragRegionIds.length).toBeGreaterThanOrEqual(2)
      expect(state.regionStatus.get(r1.id)).toBe('kept')
    }

    cancelShapeBuilder()
  })
})

describe('shapeBuilderMouseUp', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    shapeBuilderMouseUp()
    expect(getShapeBuilderState().isDragging).toBe(false)
  })

  test('merges regions when dragged across multiple', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const initialRegionCount = state.regions.length

    // Click first region
    const r0 = state.regions[0]!
    shapeBuilderMouseDown(r0.bounds.x + r0.bounds.w / 2, r0.bounds.y + r0.bounds.h / 2, false)

    // Drag to second region
    if (state.regions.length > 1) {
      const r1 = state.regions[1]!
      shapeBuilderMouseDrag(r1.bounds.x + r1.bounds.w / 2, r1.bounds.y + r1.bounds.h / 2)
      shapeBuilderMouseUp()

      // After merge, the two original regions should be replaced by one merged region
      expect(state.isDragging).toBe(false)
      expect(state.dragRegionIds).toEqual([])
      // Region count should decrease (2 removed, 1 merged added)
      expect(state.regions.length).toBeLessThan(initialRegionCount)
    }

    cancelShapeBuilder()
  })

  test('single-region click does not merge', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const initialRegionCount = state.regions.length

    const r0 = state.regions[0]!
    shapeBuilderMouseDown(r0.bounds.x + r0.bounds.w / 2, r0.bounds.y + r0.bounds.h / 2, false)
    shapeBuilderMouseUp()

    expect(state.isDragging).toBe(false)
    expect(state.regions.length).toBe(initialRegionCount)

    cancelShapeBuilder()
  })
})

describe('finalizeShapeBuilder', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    finalizeShapeBuilder()
    expect(isShapeBuilderActive()).toBe(false)
  })

  test('creates result layer and removes source layers', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    finalizeShapeBuilder()

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    // Source layers should be removed
    expect(artboard.layers.find((l) => l.id === 'sb-a')).toBeUndefined()
    expect(artboard.layers.find((l) => l.id === 'sb-b')).toBeUndefined()
    // A new result layer should exist
    const resultLayer = artboard.layers.find((l) => l.name === 'Shape Builder result')
    expect(resultLayer).toBeDefined()
    expect(isShapeBuilderActive()).toBe(false)
  })

  test('cancels when all regions are removed', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    // Mark all regions as removed
    for (const region of state.regions) {
      state.regionStatus.set(region.id, 'removed')
    }

    finalizeShapeBuilder()
    expect(isShapeBuilderActive()).toBe(false)
  })
})

describe('finalizeShapeBuilderWithRegions', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('returns null when not active', () => {
    const result = finalizeShapeBuilderWithRegions(['r1'], 'artboard-1')
    expect(result).toBeNull()
  })

  test('returns null for invalid artboard', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])
    const result = finalizeShapeBuilderWithRegions(['r1'], 'nonexistent')
    expect(result).toBeNull()
    cancelShapeBuilder()
  })

  test('returns null for empty kept regions', () => {
    const { artboard } = setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])
    const result = finalizeShapeBuilderWithRegions(['nonexistent-id'], artboard.id)
    expect(result).toBeNull()
    cancelShapeBuilder()
  })

  test('creates result layer with specified regions', () => {
    const { artboard } = setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const regionId = state.regions[0]!.id
    const result = finalizeShapeBuilderWithRegions([regionId], artboard.id)

    expect(result).not.toBeNull()
    expect(result!.type).toBe('vector')
    expect(result!.name).toBe('Shape Builder result')
    expect(result!.paths.length).toBeGreaterThan(0)
    expect(isShapeBuilderActive()).toBe(false)
  })
})

describe('renderShapeBuilderOverlay', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  test('does nothing when not active', () => {
    const ctx = mockCtx()
    renderShapeBuilderOverlay(ctx, 1)
    // No error
  })

  test('renders regions with correct fill styles', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    const fills: string[] = []
    const strokes: string[] = []
    const ctx = {
      ...mockCtx(),
      get fillStyle() {
        return '#000'
      },
      set fillStyle(v: string) {
        fills.push(v)
      },
      get strokeStyle() {
        return '#000'
      },
      set strokeStyle(v: string) {
        strokes.push(v)
      },
    } as unknown as CanvasRenderingContext2D

    renderShapeBuilderOverlay(ctx, 1)
    // Should have set fillStyle for each region
    expect(fills.length).toBeGreaterThanOrEqual(state.regions.length)

    cancelShapeBuilder()
  })

  test('renders kept region in green', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    state.regionStatus.set(state.regions[0]!.id, 'kept')

    const fills: string[] = []
    const ctx = {
      ...mockCtx(),
      get fillStyle() {
        return '#000'
      },
      set fillStyle(v: string) {
        fills.push(v)
      },
    } as unknown as CanvasRenderingContext2D

    renderShapeBuilderOverlay(ctx, 1)
    expect(fills.some((f) => f.includes('0, 200, 100'))).toBe(true)

    cancelShapeBuilder()
  })

  test('renders removed region in red', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    state.regionStatus.set(state.regions[0]!.id, 'removed')

    const fills: string[] = []
    const ctx = {
      ...mockCtx(),
      get fillStyle() {
        return '#000'
      },
      set fillStyle(v: string) {
        fills.push(v)
      },
    } as unknown as CanvasRenderingContext2D

    renderShapeBuilderOverlay(ctx, 1)
    expect(fills.some((f) => f.includes('255, 60, 60'))).toBe(true)

    cancelShapeBuilder()
  })

  test('renders hovered region in blue', () => {
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    const state = getShapeBuilderState()
    state.hoveredRegionId = state.regions[0]!.id

    const fills: string[] = []
    const ctx = {
      ...mockCtx(),
      get fillStyle() {
        return '#000'
      },
      set fillStyle(v: string) {
        fills.push(v)
      },
    } as unknown as CanvasRenderingContext2D

    renderShapeBuilderOverlay(ctx, 1)
    expect(fills.some((f) => f.includes('74, 125, 255'))).toBe(true)

    cancelShapeBuilder()
  })
})

describe('computeRegions with curves', () => {
  test('handles paths with cubic segments', () => {
    const cubicSegs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: -50, cp2x: 70, cp2y: -50 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const layerA = makeVectorLayer('a', cubicSegs)
    const layerB = makeVectorLayer('b', makeRect(30, 0, 100, 100))

    const regions = computeRegions([layerA, layerB])
    expect(regions.length).toBeGreaterThanOrEqual(1)
  })

  test('handles paths with quadratic segments', () => {
    const quadSegs: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: -50 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const layerA = makeVectorLayer('a', quadSegs)
    const layerB = makeVectorLayer('b', makeRect(30, 0, 100, 100))

    const regions = computeRegions([layerA, layerB])
    expect(regions.length).toBeGreaterThanOrEqual(1)
  })
})

describe('computeRegions with three layers', () => {
  test('computes regions for three overlapping layers', () => {
    const layerA = makeVectorLayer('a', makeRect(0, 0, 100, 100))
    const layerB = makeVectorLayer('b', makeRect(50, 0, 100, 100))
    const layerC = makeVectorLayer('c', makeRect(25, 25, 50, 50))

    const regions = computeRegions([layerA, layerB, layerC])
    // Should have multiple regions from pairwise intersections + exclusive portions
    expect(regions.length).toBeGreaterThanOrEqual(3)
  })
})

describe('cancelShapeBuilder resets state', () => {
  test('resets all state properties', () => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    setupOverlappingLayers()
    initShapeBuilder(['sb-a', 'sb-b'])

    cancelShapeBuilder()
    const state = getShapeBuilderState()
    expect(state.active).toBe(false)
    expect(state.selectedLayerIds).toEqual([])
    expect(state.regions).toEqual([])
    expect(state.hoveredRegionId).toBeNull()
    expect(state.isDragging).toBe(false)
    expect(state.dragRegionIds).toEqual([])
  })
})
