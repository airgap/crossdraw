import { describe, test, expect, beforeEach } from 'bun:test'
import { beginLasso, updateLasso, endLasso, getLassoPoints, isLassoActive } from '@/tools/lasso'
import { useEditorStore } from '@/store/editor.store'

function resetLasso() {
  try {
    if (isLassoActive()) {
      endLasso(false)
    }
  } catch {
    // Ignore errors from store state during parallel test runs
  }
}

function addVisibleVectorLayer(artboardId: string, id: string, x: number, y: number) {
  const store = useEditorStore.getState()
  const layer = {
    id,
    name: `Layer ${id}`,
    type: 'vector' as const,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: `path-${id}`,
        segments: [
          { type: 'move' as const, x: 0, y: 0 },
          { type: 'line' as const, x: 50, y: 0 },
          { type: 'line' as const, x: 50, y: 50 },
          { type: 'line' as const, x: 0, y: 50 },
          { type: 'close' as const },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 },
    stroke: null,
  }
  store.addLayer(artboardId, layer as any)
}

describe('lasso tool', () => {
  beforeEach(() => {
    resetLasso()
  })

  describe('beginLasso', () => {
    test('activates lasso and sets first point', () => {
      beginLasso(10, 20)
      expect(isLassoActive()).toBe(true)
      expect(getLassoPoints()).toEqual([{ x: 10, y: 20 }])
    })

    test('restarts lasso with new point', () => {
      beginLasso(5, 5)
      updateLasso(10, 10)
      beginLasso(50, 60)
      expect(getLassoPoints()).toEqual([{ x: 50, y: 60 }])
    })
  })

  describe('updateLasso', () => {
    test('adds points when active', () => {
      beginLasso(0, 0)
      updateLasso(10, 10)
      updateLasso(20, 20)
      expect(getLassoPoints()).toHaveLength(3)
    })

    test('does nothing when not active', () => {
      updateLasso(10, 10)
      expect(getLassoPoints()).toHaveLength(0)
    })
  })

  describe('endLasso', () => {
    test('resets state when fewer than 3 points', () => {
      beginLasso(0, 0)
      updateLasso(10, 10)
      endLasso(false)
      expect(isLassoActive()).toBe(false)
      expect(getLassoPoints()).toHaveLength(0)
    })

    test('resets state when not active', () => {
      endLasso(false)
      expect(isLassoActive()).toBe(false)
    })

    test('selects layers inside the lasso polygon', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Add a layer with its center at (25, 25)
      addVisibleVectorLayer(artboard.id, 'lasso-target', 0, 0)

      store.deselectAll()

      // Draw a lasso polygon that encompasses (25, 25)
      beginLasso(-10, -10)
      updateLasso(100, -10)
      updateLasso(100, 100)
      updateLasso(-10, 100)
      endLasso(false)

      expect(isLassoActive()).toBe(false)
      // Selection should include the layer
      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('lasso-target')).toBe(true)
    })

    test('does not select hidden layers', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer = {
        id: 'lasso-hidden',
        name: 'Hidden',
        type: 'vector' as const,
        visible: false,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'path-hidden',
            segments: [
              { type: 'move' as const, x: 0, y: 0 },
              { type: 'line' as const, x: 50, y: 0 },
              { type: 'line' as const, x: 50, y: 50 },
              { type: 'close' as const },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 },
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)
      store.deselectAll()

      beginLasso(-100, -100)
      updateLasso(200, -100)
      updateLasso(200, 200)
      updateLasso(-100, 200)
      endLasso(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('lasso-hidden')).toBe(false)
    })

    test('does not select locked layers', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer = {
        id: 'lasso-locked',
        name: 'Locked',
        type: 'vector' as const,
        visible: true,
        locked: true,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'path-locked',
            segments: [
              { type: 'move' as const, x: 0, y: 0 },
              { type: 'line' as const, x: 50, y: 0 },
              { type: 'line' as const, x: 50, y: 50 },
              { type: 'close' as const },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 },
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)
      store.deselectAll()

      beginLasso(-100, -100)
      updateLasso(200, -100)
      updateLasso(200, 200)
      updateLasso(-100, 200)
      endLasso(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('lasso-locked')).toBe(false)
    })

    test('addToSelection=true preserves existing selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addVisibleVectorLayer(artboard.id, 'lasso-add-a', 0, 0)
      addVisibleVectorLayer(artboard.id, 'lasso-add-b', 300, 300)

      store.selectLayer('lasso-add-a')

      // Lasso around B only
      beginLasso(280, 280)
      updateLasso(400, 280)
      updateLasso(400, 400)
      updateLasso(280, 400)
      endLasso(true)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('lasso-add-a')).toBe(true)
    })

    test('addToSelection=false deselects existing selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addVisibleVectorLayer(artboard.id, 'lasso-desel', 5000, 5000)
      store.selectLayer('lasso-desel')

      // Lasso far from the layer
      beginLasso(-500, -500)
      updateLasso(-400, -500)
      updateLasso(-400, -400)
      updateLasso(-500, -400)
      endLasso(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('lasso-desel')).toBe(false)
    })
  })

  describe('getLassoPoints', () => {
    test('returns empty array when not active', () => {
      expect(getLassoPoints()).toHaveLength(0)
    })

    test('returns accumulated points', () => {
      beginLasso(1, 2)
      updateLasso(3, 4)
      updateLasso(5, 6)
      const pts = getLassoPoints()
      expect(pts).toHaveLength(3)
      expect(pts[0]).toEqual({ x: 1, y: 2 })
      expect(pts[2]).toEqual({ x: 5, y: 6 })
    })
  })

  describe('isLassoActive', () => {
    test('false initially', () => {
      expect(isLassoActive()).toBe(false)
    })

    test('true after begin', () => {
      beginLasso(0, 0)
      expect(isLassoActive()).toBe(true)
    })

    test('false after end', () => {
      beginLasso(0, 0)
      updateLasso(10, 10)
      updateLasso(20, 20)
      endLasso(false)
      expect(isLassoActive()).toBe(false)
    })
  })
})
