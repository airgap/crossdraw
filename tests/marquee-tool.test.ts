import { describe, test, expect, beforeEach } from 'bun:test'
import { beginMarquee, updateMarquee, endMarquee, getMarqueeRect, isMarqueeActive } from '@/tools/marquee-tool'
import { useEditorStore } from '@/store/editor.store'

function resetMarquee() {
  if (isMarqueeActive()) {
    endMarquee(false)
  }
}

describe('marquee tool', () => {
  beforeEach(() => {
    resetMarquee()
  })

  describe('beginMarquee', () => {
    test('activates marquee and sets start/end to same point', () => {
      beginMarquee(10, 20)
      expect(isMarqueeActive()).toBe(true)
      const rect = getMarqueeRect()
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(10)
      expect(rect!.y).toBe(20)
      expect(rect!.w).toBe(0)
      expect(rect!.h).toBe(0)
    })
  })

  describe('updateMarquee', () => {
    test('updates end position', () => {
      beginMarquee(0, 0)
      updateMarquee(50, 30, false)
      const rect = getMarqueeRect()
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(0)
      expect(rect!.y).toBe(0)
      expect(rect!.w).toBe(50)
      expect(rect!.h).toBe(30)
    })

    test('handles negative direction (end < start)', () => {
      beginMarquee(50, 50)
      updateMarquee(10, 20, false)
      const rect = getMarqueeRect()
      expect(rect).not.toBeNull()
      expect(rect!.x).toBe(10)
      expect(rect!.y).toBe(20)
      expect(rect!.w).toBe(40)
      expect(rect!.h).toBe(30)
    })

    test('shift constrains to square', () => {
      beginMarquee(0, 0)
      updateMarquee(100, 50, true)
      const rect = getMarqueeRect()
      expect(rect).not.toBeNull()
      // The larger dimension (100) should be used for both
      expect(rect!.w).toBe(100)
      expect(rect!.h).toBe(100)
    })

    test('shift constrains to square with negative direction', () => {
      beginMarquee(100, 100)
      updateMarquee(60, 80, true)
      const rect = getMarqueeRect()
      expect(rect).not.toBeNull()
      // dx = -40, dy = -20, size = max(40, 20) = 40
      // endX = 100 + sign(-40)*40 = 60, endY = 100 + sign(-20)*40 = 60
      expect(rect!.w).toBe(40)
      expect(rect!.h).toBe(40)
    })

    test('does nothing when not active', () => {
      updateMarquee(50, 50, false)
      expect(getMarqueeRect()).toBeNull()
    })
  })

  describe('endMarquee', () => {
    test('deactivates marquee', () => {
      beginMarquee(0, 0)
      updateMarquee(50, 50, false)
      endMarquee(false)
      expect(isMarqueeActive()).toBe(false)
      expect(getMarqueeRect()).toBeNull()
    })

    test('does not select when marquee is too small (< 2px)', () => {
      const store = useEditorStore.getState()
      store.deselectAll()

      beginMarquee(10, 10)
      updateMarquee(11, 11, false)
      endMarquee(false)
      expect(isMarqueeActive()).toBe(false)
    })

    test('selects layers within marquee bounds', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Add a layer at (10, 10) with 50x50 bbox
      const layer = {
        id: 'marquee-target',
        name: 'Target',
        type: 'vector' as const,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'mp1',
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
        fill: { type: 'solid' as const, color: '#000', opacity: 1 },
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)
      store.deselectAll()

      beginMarquee(0, 0)
      updateMarquee(100, 100, false)
      endMarquee(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('marquee-target')).toBe(true)
    })

    test('does not select hidden layers', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer = {
        id: 'marquee-hidden',
        name: 'Hidden',
        type: 'vector' as const,
        visible: false,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'mph1',
            segments: [
              { type: 'move' as const, x: 0, y: 0 },
              { type: 'line' as const, x: 50, y: 0 },
              { type: 'line' as const, x: 50, y: 50 },
              { type: 'close' as const },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid' as const, color: '#000', opacity: 1 },
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)
      store.deselectAll()

      beginMarquee(-10, -10)
      updateMarquee(200, 200, false)
      endMarquee(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('marquee-hidden')).toBe(false)
    })

    test('does not select locked layers', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer = {
        id: 'marquee-locked',
        name: 'Locked',
        type: 'vector' as const,
        visible: true,
        locked: true,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'mpl1',
            segments: [
              { type: 'move' as const, x: 0, y: 0 },
              { type: 'line' as const, x: 50, y: 0 },
              { type: 'line' as const, x: 50, y: 50 },
              { type: 'close' as const },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid' as const, color: '#000', opacity: 1 },
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)
      store.deselectAll()

      beginMarquee(-10, -10)
      updateMarquee(200, 200, false)
      endMarquee(false)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('marquee-locked')).toBe(false)
    })

    test('addToSelection=true preserves previous selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layerA = {
        id: 'marquee-a',
        name: 'A',
        type: 'vector' as const,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'mpa',
            segments: [
              { type: 'move' as const, x: 0, y: 0 },
              { type: 'line' as const, x: 50, y: 50 },
            ],
            closed: false,
          },
        ],
        fill: null,
        stroke: null,
      }
      store.addLayer(artboard.id, layerA as any)
      store.selectLayer('marquee-a')

      // Marquee far away with addToSelection
      beginMarquee(9000, 9000)
      updateMarquee(9100, 9100, false)
      endMarquee(true)

      const sel = useEditorStore.getState().selection.layerIds
      expect(sel.includes('marquee-a')).toBe(true)
    })

    test('does nothing when not active', () => {
      endMarquee(false)
      expect(isMarqueeActive()).toBe(false)
    })
  })

  describe('getMarqueeRect', () => {
    test('returns null when not active', () => {
      expect(getMarqueeRect()).toBeNull()
    })

    test('returns correct rect during marquee', () => {
      beginMarquee(10, 20)
      updateMarquee(60, 70, false)
      const rect = getMarqueeRect()
      expect(rect).toEqual({ x: 10, y: 20, w: 50, h: 50 })
    })

    test('returns correct rect when dragging in reverse', () => {
      beginMarquee(60, 70)
      updateMarquee(10, 20, false)
      const rect = getMarqueeRect()
      expect(rect).toEqual({ x: 10, y: 20, w: 50, h: 50 })
    })
  })

  describe('isMarqueeActive', () => {
    test('false initially', () => {
      expect(isMarqueeActive()).toBe(false)
    })

    test('true after begin', () => {
      beginMarquee(0, 0)
      expect(isMarqueeActive()).toBe(true)
    })

    test('false after end', () => {
      beginMarquee(0, 0)
      updateMarquee(50, 50, false)
      endMarquee(false)
      expect(isMarqueeActive()).toBe(false)
    })
  })
})
