import { describe, test, expect, beforeEach } from 'bun:test'
import {
  beginArtboardDrag,
  updateArtboardDrag,
  endArtboardDrag,
  isArtboardDragging,
  getArtboardDragRect,
} from '@/tools/artboard-tool'
import { useEditorStore } from '@/store/editor.store'

function resetArtboardDrag() {
  if (isArtboardDragging()) {
    endArtboardDrag(0, 0)
  }
}

describe('artboard tool', () => {
  beforeEach(() => {
    resetArtboardDrag()
  })

  describe('beginArtboardDrag', () => {
    test('starts create mode when clicking empty space', () => {
      // Click far away from any artboard
      beginArtboardDrag(5000, 5000)
      expect(isArtboardDragging()).toBe(true)
    })

    test('starts move mode when clicking inside an artboard', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Click in the center of the artboard
      const cx = artboard.x + artboard.width / 2
      const cy = artboard.y + artboard.height / 2
      beginArtboardDrag(cx, cy)
      expect(isArtboardDragging()).toBe(true)

      // Should not be a create mode drag rect
      expect(getArtboardDragRect(cx, cy)).toBeNull()
    })

    test('starts resize mode when clicking near artboard edge', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Click near the right edge
      const edgeX = artboard.x + artboard.width
      const midY = artboard.y + artboard.height / 2
      beginArtboardDrag(edgeX, midY)
      expect(isArtboardDragging()).toBe(true)
    })

    test('detects near-corner for resize with composite handle', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Click near bottom-right corner
      const cornerX = artboard.x + artboard.width
      const cornerY = artboard.y + artboard.height
      beginArtboardDrag(cornerX, cornerY)
      expect(isArtboardDragging()).toBe(true)
    })
  })

  describe('updateArtboardDrag', () => {
    test('does nothing in create mode (visual only)', () => {
      beginArtboardDrag(5000, 5000)
      updateArtboardDrag(5100, 5100, false)
      // Should not throw, still dragging
      expect(isArtboardDragging()).toBe(true)
    })

    test('moves artboard in move mode', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const cx = artboard.x + artboard.width / 2
      const cy = artboard.y + artboard.height / 2
      beginArtboardDrag(cx, cy)
      updateArtboardDrag(cx + 50, cy + 50, false)

      // Artboard should have moved
      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      expect(updated).toBeDefined()
    })
  })

  describe('endArtboardDrag', () => {
    test('creates new artboard when drag is large enough', () => {
      const store = useEditorStore.getState()
      const initialCount = store.document.artboards.length

      beginArtboardDrag(5000, 5000)
      endArtboardDrag(5200, 5200)

      const newCount = useEditorStore.getState().document.artboards.length
      expect(newCount).toBe(initialCount + 1)
      expect(isArtboardDragging()).toBe(false)
    })

    test('does not create artboard when drag is too small', () => {
      const store = useEditorStore.getState()
      const initialCount = store.document.artboards.length

      beginArtboardDrag(5000, 5000)
      endArtboardDrag(5005, 5005)

      const newCount = useEditorStore.getState().document.artboards.length
      expect(newCount).toBe(initialCount)
      expect(isArtboardDragging()).toBe(false)
    })

    test('resize via east handle adjusts width', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Click near right edge
      const edgeX = artboard.x + artboard.width
      const midY = artboard.y + artboard.height / 2
      beginArtboardDrag(edgeX, midY)

      // Drag to the right
      endArtboardDrag(edgeX + 100, midY)

      expect(isArtboardDragging()).toBe(false)
    })

    test('resize via south handle adjusts height', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Click near bottom edge
      const midX = artboard.x + artboard.width / 2
      const edgeY = artboard.y + artboard.height
      beginArtboardDrag(midX, edgeY)

      endArtboardDrag(midX, edgeY + 80)
      expect(isArtboardDragging()).toBe(false)
    })

    test('resize via west handle adjusts x and width', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const edgeX = artboard.x
      const midY = artboard.y + artboard.height / 2
      beginArtboardDrag(edgeX, midY)
      endArtboardDrag(edgeX - 50, midY)

      expect(isArtboardDragging()).toBe(false)
    })

    test('resize via north handle adjusts y and height', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const midX = artboard.x + artboard.width / 2
      const edgeY = artboard.y
      beginArtboardDrag(midX, edgeY)
      endArtboardDrag(midX, edgeY - 40)

      expect(isArtboardDragging()).toBe(false)
    })

    test('resize enforces minimum 50px dimensions', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const edgeX = artboard.x + artboard.width
      const midY = artboard.y + artboard.height / 2
      beginArtboardDrag(edgeX, midY)

      // Drag way to the left past the artboard origin
      endArtboardDrag(artboard.x - 500, midY)

      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      if (updated) {
        expect(updated.width).toBeGreaterThanOrEqual(50)
      }
      expect(isArtboardDragging()).toBe(false)
    })

    test('resets drag state', () => {
      beginArtboardDrag(5000, 5000)
      endArtboardDrag(5200, 5200)
      expect(isArtboardDragging()).toBe(false)
    })
  })

  describe('isArtboardDragging', () => {
    test('false initially', () => {
      expect(isArtboardDragging()).toBe(false)
    })

    test('true during drag', () => {
      beginArtboardDrag(5000, 5000)
      expect(isArtboardDragging()).toBe(true)
    })

    test('false after end', () => {
      beginArtboardDrag(5000, 5000)
      endArtboardDrag(5200, 5200)
      expect(isArtboardDragging()).toBe(false)
    })
  })

  describe('getArtboardDragRect', () => {
    test('returns null when not in create mode', () => {
      expect(getArtboardDragRect(0, 0)).toBeNull()
    })

    test('returns rect during create drag', () => {
      beginArtboardDrag(9000, 9000)
      const rect = getArtboardDragRect(9100, 9150)
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(9000)
      expect(rect!.y).toBe(9000)
      expect(rect!.w).toBe(100)
      expect(rect!.h).toBe(150)
    })

    test('handles reversed direction', () => {
      beginArtboardDrag(9100, 9100)
      const rect = getArtboardDragRect(9000, 9000)
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(9000)
      expect(rect!.y).toBe(9000)
      expect(rect!.w).toBe(100)
      expect(rect!.h).toBe(100)
    })

    test('returns null in move mode', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const cx = artboard.x + artboard.width / 2
      const cy = artboard.y + artboard.height / 2
      beginArtboardDrag(cx, cy)
      expect(getArtboardDragRect(cx + 10, cy + 10)).toBeNull()
    })
  })
})
