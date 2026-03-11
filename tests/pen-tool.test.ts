import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  getPenState,
  getPenPreviewState,
  resetPen,
  penMouseDown,
  penMouseDrag,
  penMouseMove,
  penMouseUp,
  penKeyDown,
} from '@/tools/pen'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function makeCanvasRect(): DOMRect {
  return {
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function makeMouseEvent(x: number, y: number, opts: Partial<MouseEvent> = {}): MouseEvent {
  return {
    clientX: x,
    clientY: y,
    button: 0,
    altKey: false,
    ...opts,
  } as unknown as MouseEvent
}

function makeKeyEvent(key: string): KeyboardEvent {
  return { key } as unknown as KeyboardEvent
}

// ── Tests ──

describe('Pen Tool', () => {
  beforeEach(() => {
    resetStore()
    resetPen()
  })

  describe('getPenState', () => {
    test('returns initial state', () => {
      const state = getPenState()
      expect(state.isDrawing).toBe(false)
      expect(state.currentPath).toEqual([])
      expect(state.lastPoint).toBeNull()
      expect(state.lastHandle).toBeNull()
      expect(state.layerId).toBeNull()
      expect(state.artboardId).toBeNull()
      expect(state.previewPoint).toBeNull()
      expect(state.isDragging).toBe(false)
      expect(state.dragHandle).toBeNull()
    })
  })

  describe('getPenPreviewState', () => {
    test('returns subset of state for preview', () => {
      const preview = getPenPreviewState()
      expect(preview).toHaveProperty('isDrawing')
      expect(preview).toHaveProperty('isDragging')
      expect(preview).toHaveProperty('lastPoint')
      expect(preview).toHaveProperty('lastHandle')
      expect(preview).toHaveProperty('dragHandle')
      expect(preview).toHaveProperty('currentPath')
      expect(preview).toHaveProperty('previewPoint')
    })
  })

  describe('resetPen', () => {
    test('resets state back to initial', () => {
      // Mutate state via mouse down
      const rect = makeCanvasRect()
      const e = makeMouseEvent(50, 50)
      penMouseDown(e, rect)
      expect(getPenState().isDrawing).toBe(true)

      resetPen()
      const state = getPenState()
      expect(state.isDrawing).toBe(false)
      expect(state.currentPath).toEqual([])
      expect(state.layerId).toBeNull()
    })
  })

  describe('penMouseDown', () => {
    test('ignores non-left-button clicks', () => {
      const rect = makeCanvasRect()
      const e = makeMouseEvent(50, 50, { button: 2 } as Partial<MouseEvent>)
      penMouseDown(e, rect)
      expect(getPenState().isDrawing).toBe(false)
    })

    test('starts drawing on first click', () => {
      const rect = makeCanvasRect()
      const e = makeMouseEvent(50, 50)
      penMouseDown(e, rect)

      const state = getPenState()
      expect(state.isDrawing).toBe(true)
      expect(state.artboardId).toBe(artboardId())
      expect(state.layerId).not.toBeNull()
      expect(state.currentPath.length).toBe(1)
      expect(state.currentPath[0]!.type).toBe('move')
    })

    test('creates a vector layer with stroke on first click', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)

      const state = getPenState()
      const artboard = useEditorStore.getState().document.artboards[0]!
      const layer = artboard.layers.find((l) => l.id === state.layerId)
      expect(layer).toBeDefined()
      expect(layer!.type).toBe('vector')
      if (layer!.type === 'vector') {
        expect(layer!.stroke).not.toBeNull()
        expect(layer!.fill).toBeNull()
      }
    })

    test('adds line segment on second click', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseUp()
      penMouseDown(makeMouseEvent(50, 50), rect)

      const state = getPenState()
      expect(state.currentPath.length).toBe(2)
      expect(state.currentPath[1]!.type).toBe('line')
    })

    test('adds cubic segment when lastHandle exists', () => {
      const rect = makeCanvasRect()
      // First click
      penMouseDown(makeMouseEvent(10, 10), rect)
      // Drag to create handle
      penMouseDrag(makeMouseEvent(30, 30), rect)
      penMouseUp()
      // Second click - should create cubic
      penMouseDown(makeMouseEvent(80, 80), rect)

      const state = getPenState()
      expect(state.currentPath.length).toBe(2)
      expect(state.currentPath[1]!.type).toBe('cubic')
    })

    test('sets lastPoint on click', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(25, 35), rect)
      const state = getPenState()
      expect(state.lastPoint).not.toBeNull()
      expect(state.lastPoint!.x).toBeCloseTo(25, 0)
      expect(state.lastPoint!.y).toBeCloseTo(35, 0)
    })
  })

  describe('penMouseDrag', () => {
    test('does nothing when not drawing', () => {
      const rect = makeCanvasRect()
      penMouseDrag(makeMouseEvent(50, 50), rect)
      expect(getPenState().isDragging).toBe(false)
    })

    test('sets drag state when drawing', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseDrag(makeMouseEvent(30, 30), rect)

      const state = getPenState()
      expect(state.isDragging).toBe(true)
      expect(state.dragHandle).not.toBeNull()
      expect(state.lastHandle).not.toBeNull()
    })

    test('converts line to cubic on drag', () => {
      const rect = makeCanvasRect()
      // First point
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseUp()
      // Second click creates a line
      penMouseDown(makeMouseEvent(50, 50), rect)
      // Drag converts line to cubic
      penMouseDrag(makeMouseEvent(70, 30), rect)

      const state = getPenState()
      const lastSeg = state.currentPath[state.currentPath.length - 1]!
      expect(lastSeg.type).toBe('cubic')
    })
  })

  describe('penMouseMove', () => {
    test('does nothing when not drawing', () => {
      const rect = makeCanvasRect()
      penMouseMove(makeMouseEvent(50, 50), rect)
      expect(getPenState().previewPoint).toBeNull()
    })

    test('updates preview point when drawing', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseMove(makeMouseEvent(60, 40), rect)

      const state = getPenState()
      expect(state.previewPoint).not.toBeNull()
    })
  })

  describe('penMouseUp', () => {
    test('clears drag state', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseDrag(makeMouseEvent(30, 30), rect)
      expect(getPenState().isDragging).toBe(true)

      penMouseUp()
      expect(getPenState().isDragging).toBe(false)
      expect(getPenState().dragHandle).toBeNull()
    })
  })

  describe('penKeyDown', () => {
    test('does nothing when not drawing', () => {
      penKeyDown(makeKeyEvent('Escape'))
      expect(getPenState().isDrawing).toBe(false)
    })

    test('Escape cancels drawing and deletes layer', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      const layerId = getPenState().layerId

      penKeyDown(makeKeyEvent('Escape'))
      expect(getPenState().isDrawing).toBe(false)
      expect(getPenState().layerId).toBeNull()

      // Layer should be removed
      const artboard = useEditorStore.getState().document.artboards[0]!
      const found = artboard.layers.find((l) => l.id === layerId)
      expect(found).toBeUndefined()
    })

    test('Enter finishes path without closing', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseUp()
      penMouseDown(makeMouseEvent(50, 50), rect)
      penMouseUp()

      penKeyDown(makeKeyEvent('Enter'))
      expect(getPenState().isDrawing).toBe(false)
    })

    test('other keys do nothing', () => {
      const rect = makeCanvasRect()
      penMouseDown(makeMouseEvent(10, 10), rect)
      penKeyDown(makeKeyEvent('a'))
      expect(getPenState().isDrawing).toBe(true)
    })
  })

  describe('close path detection', () => {
    test('clicking near first point with enough segments closes the path', () => {
      const rect = makeCanvasRect()
      // First point at (10, 10)
      penMouseDown(makeMouseEvent(10, 10), rect)
      penMouseUp()
      // Second point
      penMouseDown(makeMouseEvent(80, 10), rect)
      penMouseUp()
      // Third point
      penMouseDown(makeMouseEvent(80, 80), rect)
      penMouseUp()

      // Click near first point - within 8 / zoom threshold
      penMouseDown(makeMouseEvent(11, 11), rect)

      // Path should be closed and pen should be reset
      expect(getPenState().isDrawing).toBe(false)
    })
  })
})
