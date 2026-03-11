import { describe, test, expect, beforeEach } from 'bun:test'
import {
  generateRectangle,
  generateEllipse,
  generatePolygon,
  generateStar,
  beginShapeDrag,
  updateShapeDrag,
  endShapeDrag,
  isShapeDragging,
} from '@/tools/shapes'
import { useEditorStore } from '@/store/editor.store'

// ── Tests covering lines 170-298 (shape tool interaction) ──

describe('generateRectangle corner radius edge cases', () => {
  test('per-corner radius array [TL, TR, BR, BL]', () => {
    const segs = generateRectangle(0, 0, 200, 100, [10, 20, 30, 0])
    // Should have cubic segments for rounded corners (3 corners with radius > 0)
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBe(3) // TL=10, TR=20, BR=30 get cubics; BL=0 doesn't
  })

  test('radius clamped to half of smaller dimension', () => {
    // 50x20 rect, radius 100 should clamp to min(25, 10) = 10
    const segs = generateRectangle(0, 0, 50, 20, 100)
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBe(4)
    // Check that the radius didn't overflow by verifying segments exist
    expect(segs.length).toBeGreaterThan(5)
  })

  test('zero radius returns simple rectangle', () => {
    const segs = generateRectangle(0, 0, 100, 100, 0)
    expect(segs.length).toBe(5)
    expect(segs.filter((s) => s.type === 'cubic').length).toBe(0)
  })

  test('negative radius clamped to 0', () => {
    const segs = generateRectangle(0, 0, 100, 100, -10)
    expect(segs.length).toBe(5) // Simple rectangle
  })
})

describe('isShapeDragging', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    endShapeDrag()
  })

  test('returns false when not dragging', () => {
    expect(isShapeDragging()).toBe(false)
  })

  test('returns true during drag', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    beginShapeDrag(50, 50, artboard.id)
    expect(isShapeDragging()).toBe(true)
    endShapeDrag()
  })
})

describe('beginShapeDrag', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    endShapeDrag()
  })

  test('starts drag state', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    beginShapeDrag(100, 200, artboard.id)
    expect(isShapeDragging()).toBe(true)
    endShapeDrag()
  })
})

describe('updateShapeDrag', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    endShapeDrag()
  })

  test('does nothing when not dragging', () => {
    updateShapeDrag(100, 100, false, false)
    // No error
  })

  test('creates rectangle layer on first update', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('rectangle')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 110, artboard.y + 110, false, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const newLayer = updatedArtboard.layers.find((l) => l.name.startsWith('rectangle'))
    expect(newLayer).toBeDefined()
    expect(newLayer!.type).toBe('vector')

    endShapeDrag()
  })

  test('creates ellipse layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('ellipse')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 110, artboard.y + 60, false, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const newLayer = updatedArtboard.layers.find((l) => l.name.startsWith('ellipse'))
    expect(newLayer).toBeDefined()

    endShapeDrag()
  })

  test('creates polygon layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('polygon')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 110, artboard.y + 110, false, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const newLayer = updatedArtboard.layers.find((l) => l.name.startsWith('polygon'))
    expect(newLayer).toBeDefined()

    endShapeDrag()
  })

  test('creates star layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('star')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 110, artboard.y + 110, false, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const newLayer = updatedArtboard.layers.find((l) => l.name.startsWith('star'))
    expect(newLayer).toBeDefined()

    endShapeDrag()
  })

  test('shift key constrains proportions to square', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('rectangle')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    // Non-square drag with shift
    updateShapeDrag(artboard.x + 210, artboard.y + 110, true, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const layer = updatedArtboard.layers.find((l) => l.type === 'vector') as any
    if (layer?.shapeParams) {
      // With shift, width and height should be equal (constrained)
      expect(Math.abs(layer.shapeParams.width)).toBe(Math.abs(layer.shapeParams.height))
    }

    endShapeDrag()
  })

  test('alt key draws from center', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('rectangle')

    beginShapeDrag(artboard.x + 50, artboard.y + 50, artboard.id)
    updateShapeDrag(artboard.x + 100, artboard.y + 100, false, true)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const layer = updatedArtboard.layers.find((l) => l.type === 'vector') as any
    if (layer?.shapeParams) {
      // With alt, width and height should be doubled
      expect(Math.abs(layer.shapeParams.width)).toBe(100) // 50*2
    }

    endShapeDrag()
  })

  test('second update modifies existing layer silently', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('rectangle')

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 60, artboard.y + 60, false, false)
    // Second update should update the same layer, not create a new one
    updateShapeDrag(artboard.x + 110, artboard.y + 110, false, false)

    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    const rectLayers = updatedArtboard.layers.filter((l) => l.name.startsWith('rectangle'))
    expect(rectLayers.length).toBe(1) // Only one rectangle created

    endShapeDrag()
  })

  test('returns early for unrecognized tool', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    store.setActiveTool('select' as any)

    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    updateShapeDrag(artboard.x + 110, artboard.y + 110, false, false)

    // No layer should have been created
    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    expect(updatedArtboard.layers.length).toBe(0)

    endShapeDrag()
  })

  test('returns early for invalid artboard', () => {
    const store = useEditorStore.getState()
    store.setActiveTool('rectangle')

    beginShapeDrag(10, 10, 'nonexistent-artboard')
    updateShapeDrag(110, 110, false, false)

    // No layer should have been created
    const updatedArtboard = useEditorStore.getState().document.artboards[0]!
    expect(updatedArtboard.layers.length).toBe(0)

    endShapeDrag()
  })
})

describe('endShapeDrag', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    endShapeDrag()
  })

  test('does nothing when not dragging', () => {
    endShapeDrag()
    expect(isShapeDragging()).toBe(false)
  })

  test('cleans up drag state', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    beginShapeDrag(artboard.x + 10, artboard.y + 10, artboard.id)
    expect(isShapeDragging()).toBe(true)
    endShapeDrag()
    expect(isShapeDragging()).toBe(false)
  })
})

describe('generatePolygon additional tests', () => {
  test('vertices lie on the expected radius', () => {
    const cx = 100
    const cy = 100
    const radius = 50
    const segs = generatePolygon(cx, cy, radius, 5)
    for (const seg of segs) {
      if ('x' in seg) {
        const dist = Math.hypot(seg.x - cx, seg.y - cy)
        expect(dist).toBeCloseTo(radius, 5)
      }
    }
  })
})

describe('generateStar additional tests', () => {
  test('clamps points to 3-12', () => {
    const tooFew = generateStar(0, 0, 50, 0.5, 1)
    // 3 points minimum => 6 total points (alternating) + close = 7
    expect(tooFew.length).toBe(7)

    const tooMany = generateStar(0, 0, 50, 0.5, 20)
    // 12 points maximum => 24 total points + close = 25
    expect(tooMany.length).toBe(25)
  })

  test('inner ratio clamped to 0.1-0.95', () => {
    // Very low inner ratio
    const low = generateStar(0, 0, 100, 0.01, 5)
    // Inner points should be at 0.1 * 100 = 10
    for (let i = 1; i < low.length - 1; i += 2) {
      const seg = low[i]!
      if ('x' in seg) {
        const dist = Math.hypot(seg.x, seg.y)
        expect(dist).toBeCloseTo(10, 0)
      }
    }

    // Very high inner ratio
    const high = generateStar(0, 0, 100, 1.5, 5)
    // Inner points should be at 0.95 * 100 = 95
    for (let i = 1; i < high.length - 1; i += 2) {
      const seg = high[i]!
      if ('x' in seg) {
        const dist = Math.hypot(seg.x, seg.y)
        expect(dist).toBeCloseTo(95, 0)
      }
    }
  })
})

describe('generateEllipse additional tests', () => {
  test('generates correct geometry for circle', () => {
    const segs = generateEllipse(0, 0, 50, 50)
    expect(segs.length).toBe(6)
    // First point (move) should be at (50, 0)
    const move = segs[0]!
    if ('x' in move) {
      expect(move.x).toBe(50)
      expect(move.y).toBe(0)
    }
    // Last cubic should return to start
    const lastCubic = segs[4]!
    if ('x' in lastCubic) {
      expect(lastCubic.x).toBe(50)
      expect(lastCubic.y).toBeCloseTo(0, 5)
    }
  })

  test('handles zero radius', () => {
    const segs = generateEllipse(0, 0, 0, 0)
    expect(segs.length).toBe(6) // Still generates structure
  })
})
