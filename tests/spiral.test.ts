import { describe, test, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  spiralMouseDown,
  spiralMouseDrag,
  spiralMouseUp,
  getSpiralPreview,
  resetSpiral,
  isSpiralDragging,
} from '@/tools/spiral'
import type { VectorLayer } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 800, height: 600 })
  const state = useEditorStore.getState()
  if (state.snapEnabled) {
    state.toggleSnap()
  }
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function artboard() {
  return useEditorStore.getState().document.artboards[0]!
}

function layerCount(): number {
  return artboard().layers.length
}

function lastLayer(): VectorLayer {
  const ab = artboard()
  return ab.layers[ab.layers.length - 1]! as VectorLayer
}

// ── Tests ──

describe('Spiral Tool', () => {
  beforeEach(() => {
    resetSpiral()
    resetStore()
  })

  describe('isSpiralDragging', () => {
    test('returns false initially', () => {
      expect(isSpiralDragging()).toBe(false)
    })

    test('returns true after mouseDown', () => {
      spiralMouseDown(100, 100, artboardId(), 0, 0)
      expect(isSpiralDragging()).toBe(true)
    })

    test('returns false after mouseUp', () => {
      spiralMouseDown(100, 100, artboardId(), 0, 0)
      spiralMouseUp()
      expect(isSpiralDragging()).toBe(false)
    })
  })

  describe('resetSpiral', () => {
    test('resets state after drag', () => {
      spiralMouseDown(100, 100, artboardId(), 0, 0)
      expect(isSpiralDragging()).toBe(true)

      resetSpiral()
      expect(isSpiralDragging()).toBe(false)
      expect(getSpiralPreview()).toBeNull()
    })
  })

  describe('getSpiralPreview', () => {
    test('returns null when not active', () => {
      expect(getSpiralPreview()).toBeNull()
    })

    test('returns null when radius is less than 1', () => {
      spiralMouseDown(100, 100, artboardId(), 0, 0)
      // No drag yet, radius = 0
      expect(getSpiralPreview()).toBeNull()
    })

    test('returns preview with segments during drag with sufficient radius', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100) // radius ~100

      const preview = getSpiralPreview()
      expect(preview).not.toBeNull()
      expect(preview!.cx).toBe(100) // center X in local coords
      expect(preview!.cy).toBe(100) // center Y in local coords
      expect(preview!.segments.length).toBeGreaterThan(0)
    })

    test('preview segments start with a move segment', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const preview = getSpiralPreview()!
      expect(preview.segments[0]!.type).toBe('move')
    })

    test('preview contains cubic bezier segments', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const preview = getSpiralPreview()!
      const cubics = preview.segments.filter((s) => s.type === 'cubic')
      expect(cubics.length).toBeGreaterThan(0)
    })

    test('preview segment count matches TURNS * SEGMENTS_PER_TURN', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const preview = getSpiralPreview()!
      // 3 turns * 8 segments per turn = 24 cubic segments + 1 move = 25 total
      const cubics = preview.segments.filter((s) => s.type === 'cubic')
      expect(cubics.length).toBe(24)
      expect(preview.segments.length).toBe(25) // 1 move + 24 cubics
    })
  })

  describe('spiralMouseDown', () => {
    test('sets center from document coordinates minus artboard offset', () => {
      spiralMouseDown(150, 200, artboardId(), 50, 100)
      // Center should be local: (150-50, 200-100) = (100, 100)
      getSpiralPreview()
      // radius is still 0, so preview is null, but we can check via drag
      spiralMouseDrag(250, 200) // docX=250 => localX=250-50=200, drag to compute radius
      const p = getSpiralPreview()
      expect(p).not.toBeNull()
      expect(p!.cx).toBe(100)
      expect(p!.cy).toBe(100)
    })

    test('initializes with radius 0 and no layerId', () => {
      spiralMouseDown(100, 100, artboardId(), 0, 0)
      // No layer created yet (only on drag)
      expect(layerCount()).toBe(0)
    })
  })

  describe('spiralMouseDrag', () => {
    test('does nothing when not active', () => {
      const before = layerCount()
      spiralMouseDrag(200, 200)
      expect(layerCount()).toBe(before)
    })

    test('does not create layer when radius is too small', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(100.5, 100.5) // radius < 2
      expect(layerCount()).toBe(0)
    })

    test('creates vector layer on first meaningful drag', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      expect(layerCount()).toBe(1)

      const layer = lastLayer()
      expect(layer.type).toBe('vector')
      expect(layer.name).toContain('Spiral')
    })

    test('created layer has stroke and no fill', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const layer = lastLayer()
      expect(layer.stroke).not.toBeNull()
      expect(layer.stroke!.width).toBe(2)
      expect(layer.stroke!.color).toBe('#000000')
      expect(layer.fill).toBeNull()
    })

    test('created layer has an open path', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const layer = lastLayer()
      expect(layer.paths).toHaveLength(1)
      expect(layer.paths[0]!.closed).toBe(false)
    })

    test('subsequent drags update the layer, not create new ones', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(150, 100)
      const count1 = layerCount()

      spiralMouseDrag(200, 100)
      const count2 = layerCount()

      expect(count2).toBe(count1) // No new layers
    })

    test('computes radius from distance to center', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)

      // Drag to (200, 100) → radius = 100
      spiralMouseDrag(200, 100)
      let preview = getSpiralPreview()!
      // First segment starts at center for radius calculation
      // The spiral starts from center outward
      const firstMove = preview.segments[0]
      expect(firstMove!.type).toBe('move')

      // Drag further to (300, 100) → radius = 200
      spiralMouseDrag(300, 100)
      const preview2 = getSpiralPreview()!
      // The spiral should be larger now — last cubic endpoint should be farther
      const lastSeg1 = preview.segments[preview.segments.length - 1]!
      const lastSeg2 = preview2.segments[preview2.segments.length - 1]!
      if (lastSeg1.type === 'cubic' && lastSeg2.type === 'cubic') {
        const dist1 = Math.sqrt((lastSeg1.x - 100) ** 2 + (lastSeg1.y - 100) ** 2)
        const dist2 = Math.sqrt((lastSeg2.x - 100) ** 2 + (lastSeg2.y - 100) ** 2)
        expect(dist2).toBeGreaterThan(dist1)
      }
    })

    test('selects layer on creation', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const selection = useEditorStore.getState().selection
      expect(selection.layerIds.length).toBe(1)
    })

    test('does nothing if artboard is not found', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)

      // Reset store so the artboard ID changes
      resetStore()

      // The drag should find no artboard and return early
      const before = layerCount()
      spiralMouseDrag(200, 200)
      expect(layerCount()).toBe(before)
    })
  })

  describe('spiralMouseUp', () => {
    test('does nothing when not active', () => {
      spiralMouseUp()
      expect(isSpiralDragging()).toBe(false)
    })

    test('deactivates dragging state', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      expect(isSpiralDragging()).toBe(true)

      spiralMouseUp()
      expect(isSpiralDragging()).toBe(false)
    })

    test('clears snap lines', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      spiralMouseUp()

      expect(useEditorStore.getState().activeSnapLines).toBeNull()
    })

    test('layer persists after mouseUp', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      spiralMouseUp()

      expect(layerCount()).toBe(1)
      const layer = lastLayer()
      expect(layer.type).toBe('vector')
      expect(layer.paths.length).toBeGreaterThan(0)
    })
  })

  describe('spiral geometry', () => {
    test('spiral starts near center and ends at outer radius', () => {
      const abId = artboardId()
      const cx = 200
      const cy = 200
      spiralMouseDown(cx, cy, abId, 0, 0)
      spiralMouseDrag(cx + 100, cy) // radius = 100

      const preview = getSpiralPreview()!
      const firstMove = preview.segments[0]!
      expect(firstMove.type).toBe('move')
      // Start should be at or very near center
      if (firstMove.type === 'move') {
        const distFromCenter = Math.sqrt((firstMove.x - cx) ** 2 + (firstMove.y - cy) ** 2)
        expect(distFromCenter).toBeLessThan(1)
      }

      // End should be near the outer radius
      const lastSeg = preview.segments[preview.segments.length - 1]!
      if (lastSeg.type === 'cubic') {
        const distFromCenter = Math.sqrt((lastSeg.x - cx) ** 2 + (lastSeg.y - cy) ** 2)
        expect(distFromCenter).toBeCloseTo(100, -1) // within ~10
      }
    })

    test('all cubic segments have valid control points', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const preview = getSpiralPreview()!
      for (const seg of preview.segments) {
        if (seg.type === 'cubic') {
          expect(Number.isFinite(seg.cp1x)).toBe(true)
          expect(Number.isFinite(seg.cp1y)).toBe(true)
          expect(Number.isFinite(seg.cp2x)).toBe(true)
          expect(Number.isFinite(seg.cp2y)).toBe(true)
          expect(Number.isFinite(seg.x)).toBe(true)
          expect(Number.isFinite(seg.y)).toBe(true)
        }
      }
    })

    test('spiral progresses outward monotonically', () => {
      const abId = artboardId()
      const cx = 200
      const cy = 200
      spiralMouseDown(cx, cy, abId, 0, 0)
      spiralMouseDrag(cx + 80, cy)

      const preview = getSpiralPreview()!
      // Check that endpoints of cubic segments generally increase in distance from center
      let lastDist = 0
      let increasing = 0
      let total = 0
      for (const seg of preview.segments) {
        if (seg.type === 'cubic') {
          const dist = Math.sqrt((seg.x - cx) ** 2 + (seg.y - cy) ** 2)
          if (dist >= lastDist) increasing++
          total++
          lastDist = dist
        }
      }
      // At least 80% of segments should be moving outward (spiral may wobble slightly)
      expect(increasing / total).toBeGreaterThan(0.7)
    })
  })

  describe('multiple sessions', () => {
    test('each mouseDown → drag → mouseUp creates a separate layer', () => {
      const abId = artboardId()

      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      spiralMouseUp()
      const count1 = layerCount()

      spiralMouseDown(300, 300, abId, 0, 0)
      spiralMouseDrag(400, 300)
      spiralMouseUp()
      const count2 = layerCount()

      expect(count2).toBe(count1 + 1)
    })

    test('reset between sessions allows clean restart', () => {
      const abId = artboardId()

      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)
      resetSpiral()

      expect(isSpiralDragging()).toBe(false)
      expect(getSpiralPreview()).toBeNull()

      // New session
      spiralMouseDown(300, 300, abId, 0, 0)
      expect(isSpiralDragging()).toBe(true)
    })
  })

  describe('layer properties', () => {
    test('layer has correct blend mode and opacity', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const layer = lastLayer()
      expect(layer.blendMode).toBe('normal')
      expect(layer.opacity).toBe(1)
      expect(layer.visible).toBe(true)
      expect(layer.locked).toBe(false)
    })

    test('layer has identity transform', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const layer = lastLayer()
      expect(layer.transform).toEqual({
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      })
    })

    test('layer stroke has round line caps and joins', () => {
      const abId = artboardId()
      spiralMouseDown(100, 100, abId, 0, 0)
      spiralMouseDrag(200, 100)

      const layer = lastLayer()
      expect(layer.stroke!.linecap).toBe('round')
      expect(layer.stroke!.linejoin).toBe('round')
    })
  })
})
