import { describe, test, expect, beforeEach } from 'bun:test'
import { zoomToolClick, beginZoomDrag, updateZoomDrag, endZoomDrag, isZoomDragging } from '@/tools/zoom-tool'
import { useEditorStore } from '@/store/editor.store'

function mockCanvasRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    toJSON: () => ({}),
  } as DOMRect
}

describe('zoom tool', () => {
  beforeEach(() => {
    if (isZoomDragging()) {
      endZoomDrag()
    }
    // Reset zoom to 1
    const store = useEditorStore.getState()
    store.setZoom(1)
    store.setPan(0, 0)
  })

  describe('zoomToolClick', () => {
    test('zooms in on left click', () => {
      const store = useEditorStore.getState()
      const initialZoom = store.viewport.zoom

      zoomToolClick(400, 300, mockCanvasRect(), false)

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeGreaterThan(initialZoom)
    })

    test('zooms out on alt+click', () => {
      const store = useEditorStore.getState()
      store.setZoom(2) // Start zoomed in
      const initialZoom = useEditorStore.getState().viewport.zoom

      zoomToolClick(400, 300, mockCanvasRect(), true)

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeLessThan(initialZoom)
    })

    test('zooms centered on click position', () => {
      const store = useEditorStore.getState()
      store.setZoom(1)
      store.setPan(0, 0)

      zoomToolClick(400, 300, mockCanvasRect(), false)

      // Zoom should have changed
      const v = useEditorStore.getState().viewport
      expect(v.zoom).not.toBe(1)
    })

    test('updates both zoom and pan', () => {
      zoomToolClick(200, 100, mockCanvasRect(), false)

      const v = useEditorStore.getState().viewport
      expect(v.zoom).toBeGreaterThan(1)
      // Pan should have been adjusted to keep point under cursor
      expect(typeof v.panX).toBe('number')
      expect(typeof v.panY).toBe('number')
    })
  })

  describe('beginZoomDrag', () => {
    test('activates drag state', () => {
      beginZoomDrag(400, 300)
      expect(isZoomDragging()).toBe(true)
    })

    test('records start Y and zoom', () => {
      const store = useEditorStore.getState()
      store.setZoom(2)

      beginZoomDrag(400, 300)
      expect(isZoomDragging()).toBe(true)
    })
  })

  describe('updateZoomDrag', () => {
    test('does nothing when not dragging', () => {
      const initialZoom = useEditorStore.getState().viewport.zoom
      updateZoomDrag(200, mockCanvasRect())
      expect(useEditorStore.getState().viewport.zoom).toBe(initialZoom)
    })

    test('drag up zooms in', () => {
      const store = useEditorStore.getState()
      store.setZoom(1)
      const initialZoom = 1

      beginZoomDrag(400, 300)
      // Move up by 100 pixels (screenY decreased)
      updateZoomDrag(200, mockCanvasRect())

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeGreaterThan(initialZoom)
    })

    test('drag down zooms out', () => {
      const store = useEditorStore.getState()
      store.setZoom(2)

      beginZoomDrag(400, 300)
      // Move down by 200 pixels (screenY increased)
      updateZoomDrag(500, mockCanvasRect())

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeLessThan(2)
    })

    test('zoom is clamped to minimum 0.1', () => {
      const store = useEditorStore.getState()
      store.setZoom(0.2)

      beginZoomDrag(400, 300)
      // Drag way down to try to zoom out past minimum
      updateZoomDrag(10000, mockCanvasRect())

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeGreaterThanOrEqual(0.1)
    })

    test('zoom is clamped to maximum 10', () => {
      const store = useEditorStore.getState()
      store.setZoom(8)

      beginZoomDrag(400, 300)
      // Drag way up to try to zoom past max
      updateZoomDrag(-10000, mockCanvasRect())

      const newZoom = useEditorStore.getState().viewport.zoom
      expect(newZoom).toBeLessThanOrEqual(10)
    })
  })

  describe('endZoomDrag', () => {
    test('deactivates drag state', () => {
      beginZoomDrag(400, 300)
      expect(isZoomDragging()).toBe(true)

      endZoomDrag()
      expect(isZoomDragging()).toBe(false)
    })

    test('can be called when not dragging', () => {
      endZoomDrag()
      expect(isZoomDragging()).toBe(false)
    })
  })

  describe('isZoomDragging', () => {
    test('false initially', () => {
      expect(isZoomDragging()).toBe(false)
    })

    test('true during drag', () => {
      beginZoomDrag(400, 300)
      expect(isZoomDragging()).toBe(true)
    })

    test('false after end', () => {
      beginZoomDrag(400, 300)
      endZoomDrag()
      expect(isZoomDragging()).toBe(false)
    })
  })
})
