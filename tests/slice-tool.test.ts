import { describe, test, expect, beforeEach } from 'bun:test'
import { beginSliceDrag, updateSliceDrag, endSliceDrag, getSliceDragRect, isSliceDragging } from '@/tools/slice-tool'
import { useEditorStore } from '@/store/editor.store'

function resetSlice() {
  if (isSliceDragging()) {
    endSliceDrag(0, 0)
  }
}

describe('slice tool', () => {
  beforeEach(() => {
    resetSlice()
  })

  describe('beginSliceDrag', () => {
    test('activates drag state', () => {
      beginSliceDrag(10, 20, 'artboard-1')
      expect(isSliceDragging()).toBe(true)
    })

    test('stores start position', () => {
      beginSliceDrag(100, 200, 'ab1')
      const rect = getSliceDragRect(150, 250)
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(100)
      expect(rect!.y).toBe(200)
      expect(rect!.w).toBe(50)
      expect(rect!.h).toBe(50)
    })
  })

  describe('updateSliceDrag', () => {
    test('does not crash (visual only)', () => {
      beginSliceDrag(10, 20, 'ab1')
      updateSliceDrag(50, 60)
      expect(isSliceDragging()).toBe(true)
    })
  })

  describe('endSliceDrag', () => {
    test('creates a slice when drag is large enough', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const slicesBefore = artboard.slices?.length ?? 0

      beginSliceDrag(artboard.x + 10, artboard.y + 10, artboard.id)
      endSliceDrag(artboard.x + 100, artboard.y + 100)

      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      expect(updated!.slices!.length).toBeGreaterThan(slicesBefore)
      expect(isSliceDragging()).toBe(false)
    })

    test('does not create a slice when drag is too small', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const slicesBefore = artboard.slices?.length ?? 0

      beginSliceDrag(artboard.x + 10, artboard.y + 10, artboard.id)
      endSliceDrag(artboard.x + 12, artboard.y + 12)

      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      const slicesAfter = updated?.slices?.length ?? 0
      expect(slicesAfter).toBe(slicesBefore)
      expect(isSliceDragging()).toBe(false)
    })

    test('does nothing when not active', () => {
      endSliceDrag(100, 100)
      expect(isSliceDragging()).toBe(false)
    })

    test('does nothing when artboard not found', () => {
      beginSliceDrag(10, 20, 'nonexistent-artboard')
      endSliceDrag(200, 200)
      expect(isSliceDragging()).toBe(false)
    })

    test('creates slice with correct properties', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      beginSliceDrag(artboard.x + 20, artboard.y + 30, artboard.id)
      endSliceDrag(artboard.x + 120, artboard.y + 130)

      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      const lastSlice = updated!.slices![updated!.slices!.length - 1]!
      expect(lastSlice.x).toBe(20)
      expect(lastSlice.y).toBe(30)
      expect(lastSlice.width).toBe(100)
      expect(lastSlice.height).toBe(100)
      expect(lastSlice.format).toBe('png')
      expect(lastSlice.scale).toBe(1)
      expect(lastSlice.name).toContain('Slice')
    })

    test('handles reversed drag direction', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      beginSliceDrag(artboard.x + 120, artboard.y + 130, artboard.id)
      endSliceDrag(artboard.x + 20, artboard.y + 30)

      const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)
      const lastSlice = updated!.slices![updated!.slices!.length - 1]!
      expect(lastSlice.x).toBe(20)
      expect(lastSlice.y).toBe(30)
      expect(lastSlice.width).toBe(100)
      expect(lastSlice.height).toBe(100)
    })
  })

  describe('getSliceDragRect', () => {
    test('returns null when not active', () => {
      expect(getSliceDragRect(0, 0)).toBeNull()
    })

    test('returns correct rect during drag', () => {
      beginSliceDrag(10, 20, 'ab1')
      const rect = getSliceDragRect(60, 80)
      expect(rect).toEqual({ x: 10, y: 20, w: 50, h: 60 })
    })

    test('handles reversed direction', () => {
      beginSliceDrag(60, 80, 'ab1')
      const rect = getSliceDragRect(10, 20)
      expect(rect).toEqual({ x: 10, y: 20, w: 50, h: 60 })
    })
  })

  describe('isSliceDragging', () => {
    test('false initially', () => {
      expect(isSliceDragging()).toBe(false)
    })

    test('true during drag', () => {
      beginSliceDrag(0, 0, 'ab1')
      expect(isSliceDragging()).toBe(true)
    })

    test('false after end', () => {
      beginSliceDrag(0, 0, 'ab1')
      endSliceDrag(100, 100)
      expect(isSliceDragging()).toBe(false)
    })
  })
})
