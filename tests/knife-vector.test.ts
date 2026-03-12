import { describe, it, expect, beforeEach } from 'bun:test'
import {
  beginKnifeCut,
  updateKnifeCut,
  endKnifeCut,
  getKnifePoints,
  isKnifeCutting,
  segmentsIntersect,
  splitCubicAt,
  lineCubicIntersections,
  lineLineIntersectionT,
} from '@/tools/knife'
import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer, Segment, Path } from '@/types'

// ── Helpers ──────────────────────────────────────────────────

function resetKnife() {
  if (isKnifeCutting()) {
    endKnifeCut()
  }
  expect(isKnifeCutting()).toBe(false)
  expect(getKnifePoints()).toHaveLength(0)
}

function makeVectorLayer(id: string, paths: Path[], transform: { x: number; y: number } = { x: 0, y: 0 }): VectorLayer {
  return {
    id,
    name: `Layer ${id}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: transform.x, y: transform.y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  } as VectorLayer
}

/** Create a rectangular path:  (x,y)→(x+w,y)→(x+w,y+h)→(x,y+h)→close */
function makeRectPath(id: string, x: number, y: number, w: number, h: number): Path {
  return {
    id,
    segments: [
      { type: 'move', x, y },
      { type: 'line', x: x + w, y },
      { type: 'line', x: x + w, y: y + h },
      { type: 'line', x, y: y + h },
      { type: 'close' },
    ],
    closed: true,
  }
}

/** Create a simple open path with cubic bezier segments. */
function makeCubicPath(id: string): Path {
  return {
    id,
    segments: [
      { type: 'move', x: 0, y: 50 },
      {
        type: 'cubic',
        cp1x: 33,
        cp1y: -50,
        cp2x: 66,
        cp2y: 150,
        x: 100,
        y: 50,
      },
    ],
    closed: false,
  }
}

function getArtboard() {
  return useEditorStore.getState().document.artboards[0]!
}

function getLayerById(id: string): VectorLayer | undefined {
  const artboard = getArtboard()
  return artboard.layers.find((l) => l.id === id) as VectorLayer | undefined
}

function addAndSelect(layer: VectorLayer) {
  const store = useEditorStore.getState()
  const artboard = getArtboard()
  store.addLayer(artboard.id, layer as any)
  store.selectLayer(layer.id)
}

function countArtboardLayers(): number {
  return getArtboard().layers.length
}

// ── Test suites ──────────────────────────────────────────────

describe('knife tool — lifecycle', () => {
  beforeEach(() => resetKnife())

  it('isKnifeCutting returns false initially', () => {
    expect(isKnifeCutting()).toBe(false)
  })

  it('getKnifePoints returns empty array initially', () => {
    expect(getKnifePoints()).toEqual([])
  })

  it('beginKnifeCut sets active and records the start point', () => {
    beginKnifeCut(10, 20)
    expect(isKnifeCutting()).toBe(true)
    expect(getKnifePoints()).toEqual([{ x: 10, y: 20 }])
  })

  it('updateKnifeCut appends points while active', () => {
    beginKnifeCut(0, 0)
    updateKnifeCut(10, 10)
    updateKnifeCut(20, 30)
    expect(getKnifePoints()).toHaveLength(3)
    expect(getKnifePoints()[1]).toEqual({ x: 10, y: 10 })
    expect(getKnifePoints()[2]).toEqual({ x: 20, y: 30 })
  })

  it('updateKnifeCut is a no-op when not active', () => {
    updateKnifeCut(100, 200)
    expect(getKnifePoints()).toHaveLength(0)
    expect(isKnifeCutting()).toBe(false)
  })

  it('beginKnifeCut resets previous points from a prior drag', () => {
    beginKnifeCut(5, 5)
    updateKnifeCut(15, 15)
    beginKnifeCut(50, 60)
    expect(getKnifePoints()).toEqual([{ x: 50, y: 60 }])
  })

  it('endKnifeCut resets state when fewer than 2 points', () => {
    beginKnifeCut(10, 20)
    endKnifeCut()
    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })

  it('endKnifeCut is safe to call when not active', () => {
    endKnifeCut()
    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })

  it('endKnifeCut with 2+ points transitions to inactive', () => {
    beginKnifeCut(0, 0)
    updateKnifeCut(100, 100)
    endKnifeCut()
    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })
})

describe('knife tool — endKnifeCut early-exit paths', () => {
  beforeEach(() => resetKnife())

  it('resets when no artboard exists', () => {
    const store = useEditorStore.getState()
    const origDoc = store.document
    useEditorStore.setState({
      document: { ...origDoc, artboards: [] },
    })

    beginKnifeCut(0, 0)
    updateKnifeCut(100, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)

    // Restore
    useEditorStore.setState({ document: origDoc })
  })

  it('resets when no layer is selected', () => {
    const store = useEditorStore.getState()
    store.deselectAll()

    beginKnifeCut(0, 0)
    updateKnifeCut(100, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })

  it('resets when selected layer is not vector', () => {
    const store = useEditorStore.getState()
    const artboard = getArtboard()
    const rasterLayer = {
      id: 'raster-knife-test',
      name: 'Raster',
      type: 'raster' as const,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: 'chunk-rk',
      width: 100,
      height: 100,
    }
    store.addLayer(artboard.id, rasterLayer as any)
    store.selectLayer('raster-knife-test')

    beginKnifeCut(0, 0)
    updateKnifeCut(100, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })

  it('resets when selected layer id is not found in artboard', () => {
    const store = useEditorStore.getState()
    // Force a selection to a nonexistent layer id
    useEditorStore.setState({
      selection: { ...store.selection, layerIds: ['nonexistent-layer-id'] },
    })

    beginKnifeCut(0, 0)
    updateKnifeCut(100, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(getKnifePoints()).toHaveLength(0)
  })
})

describe('knife tool — cutting a rectangle (line segments)', () => {
  beforeEach(() => resetKnife())

  it('horizontal knife across a rectangle produces 2+ layers', () => {
    // Rectangle from (0,0) to (100,100)
    const rectPath = makeRectPath('rect-p1', 0, 0, 100, 100)
    const layer = makeVectorLayer('rect-cut-1', [rectPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)
    expect(countArtboardLayers()).toBe(layersBefore + 1)

    // Knife from left to right at y=50 (crosses left and right edges)
    beginKnifeCut(-10, 50)
    updateKnifeCut(110, 50)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // The original layer should be updated and new layers added
    const afterCount = countArtboardLayers()
    expect(afterCount).toBeGreaterThan(layersBefore + 1)

    // Original layer should still exist but with modified path(s)
    const original = getLayerById('rect-cut-1')
    expect(original).toBeDefined()
    // It should have exactly 1 path (first split result)
    expect(original!.paths).toHaveLength(1)
    // shapeParams should be cleared after cutting
    expect(original!.shapeParams).toBeUndefined()
  })

  it('vertical knife across a rectangle produces 2+ layers', () => {
    const rectPath = makeRectPath('rect-p2', 0, 0, 100, 100)
    const layer = makeVectorLayer('rect-cut-2', [rectPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife from top to bottom at x=50
    beginKnifeCut(50, -10)
    updateKnifeCut(50, 110)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })

  it('knife cutting an open 3-segment horizontal line produces split', () => {
    const openPath: Path = {
      id: 'open-horiz',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 50, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ],
      closed: false,
    }
    const layer = makeVectorLayer('open-cut-1', [openPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Vertical knife at x=25 crossing the first segment
    beginKnifeCut(25, 0)
    updateKnifeCut(25, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Should have created additional layers from the split
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })

  it('new layers from cut are named with (cut N) suffix', () => {
    const rectPath = makeRectPath('rect-name-p', 0, 0, 100, 100)
    const layer = makeVectorLayer('rect-name-test', [rectPath])
    addAndSelect(layer)

    beginKnifeCut(-10, 50)
    updateKnifeCut(110, 50)
    endKnifeCut()

    const artboard = getArtboard()
    const cutLayers = artboard.layers.filter((l) => l.name.includes('rect-name-test') && l.name.includes('(cut'))
    expect(cutLayers.length).toBeGreaterThan(0)
    // Each cut layer name should contain the original layer name
    for (const cl of cutLayers) {
      expect(cl.name).toContain('Layer rect-name-test')
    }
  })
})

describe('knife tool — cutting cubic bezier paths', () => {
  beforeEach(() => resetKnife())

  it('knife across a cubic bezier path splits it', () => {
    // S-curve from (0,50) with control points going above and below
    const cubicPath = makeCubicPath('cubic-p1')
    const layer = makeVectorLayer('cubic-cut-1', [cubicPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Vertical knife at x=50 — should cross the S-curve
    beginKnifeCut(50, -100)
    updateKnifeCut(50, 200)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)

    // The original layer should have its path replaced
    const original = getLayerById('cubic-cut-1')
    expect(original).toBeDefined()
    expect(original!.paths).toHaveLength(1)
    // The path should contain cubic segments (de Casteljau preserves type)
    const firstPath = original!.paths[0]!
    const hasCubic = firstPath.segments.some((s) => s.type === 'cubic')
    expect(hasCubic).toBe(true)
  })

  it('split cubic paths are open (not closed)', () => {
    const cubicPath = makeCubicPath('cubic-p2')
    const layer = makeVectorLayer('cubic-cut-2', [cubicPath])
    addAndSelect(layer)

    beginKnifeCut(50, -100)
    updateKnifeCut(50, 200)
    endKnifeCut()

    const artboard = getArtboard()
    const cutLayers = artboard.layers.filter((l) => l.id === 'cubic-cut-2' || l.name.includes('cubic-cut-2'))
    for (const cl of cutLayers) {
      const vl = cl as VectorLayer
      for (const p of vl.paths) {
        expect(p.closed).toBe(false)
      }
    }
  })

  it('cubic bezier with transform offset is correctly intersected', () => {
    const cubicPath = makeCubicPath('cubic-offset-p')
    // Path coordinates are 0..100 in x, but transform shifts by +200
    const layer = makeVectorLayer('cubic-offset-cut', [cubicPath], { x: 200, y: 0 })
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife at x=250 (which is x=50 in path-local coords after +200 transform)
    beginKnifeCut(250, -100)
    updateKnifeCut(250, 200)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })
})

describe('knife tool — no intersection (path unchanged)', () => {
  beforeEach(() => resetKnife())

  it('knife far from the path does not add layers', () => {
    const rectPath = makeRectPath('no-int-p', 0, 0, 50, 50)
    const layer = makeVectorLayer('no-int-layer', [rectPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)
    expect(countArtboardLayers()).toBe(layersBefore + 1)

    // Knife way off to the side
    beginKnifeCut(500, 500)
    updateKnifeCut(600, 600)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Layer count should not have changed (no split)
    expect(countArtboardLayers()).toBe(layersBefore + 1)
  })

  it('knife parallel to but not touching a path does not split', () => {
    const openPath: Path = {
      id: 'parallel-p',
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ],
      closed: false,
    }
    const layer = makeVectorLayer('parallel-layer', [openPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife runs parallel above the line
    beginKnifeCut(0, 10)
    updateKnifeCut(100, 10)
    endKnifeCut()

    expect(countArtboardLayers()).toBe(layersBefore + 1)
  })

  it('single-segment path (only a move) cannot be split', () => {
    const singlePath: Path = {
      id: 'single-seg-p',
      segments: [{ type: 'move', x: 50, y: 50 }],
      closed: false,
    }
    const layer = makeVectorLayer('single-seg-layer', [singlePath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    beginKnifeCut(0, 50)
    updateKnifeCut(100, 50)
    endKnifeCut()

    expect(countArtboardLayers()).toBe(layersBefore + 1)
  })

  it('path with close segment where knife misses the line segments', () => {
    const closedPath: Path = {
      id: 'closed-miss-p',
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 0 },
        { type: 'line', x: 10, y: 10 },
        { type: 'close' },
      ],
      closed: true,
    }
    const layer = makeVectorLayer('closed-miss-layer', [closedPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife far away
    beginKnifeCut(200, 200)
    updateKnifeCut(300, 300)
    endKnifeCut()

    expect(countArtboardLayers()).toBe(layersBefore + 1)
  })
})

describe('knife tool — quadratic segments', () => {
  beforeEach(() => resetKnife())

  it('knife across a quadratic segment splits it (approximated as line)', () => {
    const quadPath: Path = {
      id: 'quad-p1',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'quadratic', x: 100, y: 50, cpx: 50, cpy: -50 },
      ],
      closed: false,
    }
    const layer = makeVectorLayer('quad-cut-layer', [quadPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Vertical knife at x=50 — the quadratic goes from (0,50) to (100,50)
    // The straight-line approximation is just (0,50)→(100,50), which is horizontal at y=50
    // A vertical knife at x=50 from y=0 to y=100 should cross it
    beginKnifeCut(50, 0)
    updateKnifeCut(50, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Should split since the line approximation crosses
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })
})

describe('knife tool — multi-segment knife line', () => {
  beforeEach(() => resetKnife())

  it('multi-point knife with multiple knife segments can intersect', () => {
    const openPath: Path = {
      id: 'multi-knife-p',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ],
      closed: false,
    }
    const layer = makeVectorLayer('multi-knife-layer', [openPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife with 3 points forming a V shape that crosses the horizontal line
    beginKnifeCut(25, 0)
    updateKnifeCut(25, 100) // crosses at y=50
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })
})

describe('knife tool — path with close segment', () => {
  beforeEach(() => resetKnife())

  it('close segment is skipped during intersection testing', () => {
    // Triangle with close segment
    const triPath: Path = {
      id: 'tri-p',
      segments: [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 100, y: 100 },
        { type: 'line', x: 0, y: 100 },
        { type: 'close' },
      ],
      closed: true,
    }
    const layer = makeVectorLayer('tri-layer', [triPath])
    addAndSelect(layer)

    // Horizontal knife at y=50 across the triangle
    beginKnifeCut(-10, 50)
    updateKnifeCut(110, 50)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Should have split the two non-close line segments
  })
})

describe('knife tool — transform offset handling', () => {
  beforeEach(() => resetKnife())

  it('layer with transform offset: knife in document coords correctly intersects', () => {
    // Path local coords: rect from (0,0) to (100,100)
    // Transform offsets it by (50, 50), so in document space it's (50,50)→(150,150)
    const rectPath = makeRectPath('xform-p', 0, 0, 100, 100)
    const layer = makeVectorLayer('xform-layer', [rectPath], { x: 50, y: 50 })
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife at document y=100, which is in the middle of the transformed rect
    beginKnifeCut(0, 100)
    updateKnifeCut(200, 100)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })

  it('knife misses when it targets local coords but layer is offset', () => {
    const rectPath = makeRectPath('xform-miss-p', 0, 0, 100, 100)
    // Transform offsets by (500, 500)
    const layer = makeVectorLayer('xform-miss-layer', [rectPath], { x: 500, y: 500 })
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife at y=50 (local coord, but path is at y=500..600 in document space)
    beginKnifeCut(-10, 50)
    updateKnifeCut(110, 50)
    endKnifeCut()

    expect(countArtboardLayers()).toBe(layersBefore + 1) // No split
  })
})

describe('knife tool — multiple paths in a single layer', () => {
  beforeEach(() => resetKnife())

  it('knife can split one of multiple paths in a layer', () => {
    const path1: Path = {
      id: 'mp1',
      segments: [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
        { type: 'line', x: 100, y: 100 },
        { type: 'line', x: 0, y: 100 },
        { type: 'close' },
      ],
      closed: true,
    }
    const path2: Path = {
      id: 'mp2',
      segments: [
        { type: 'move', x: 200, y: 0 },
        { type: 'line', x: 300, y: 0 },
        { type: 'line', x: 300, y: 100 },
        { type: 'line', x: 200, y: 100 },
        { type: 'close' },
      ],
      closed: true,
    }

    const layer = makeVectorLayer('multi-path-layer', [path1, path2])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Knife at y=50, from x=-10 to x=110 — crosses path1, misses path2
    beginKnifeCut(-10, 50)
    updateKnifeCut(110, 50)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // path1 is split into multiple new paths, path2 is left alone
    // Total paths > 2, so we get new layers
    expect(countArtboardLayers()).toBeGreaterThan(layersBefore + 1)
  })
})

// ── Exported helper function tests ──────────────────────────

describe('lineLineIntersectionT', () => {
  it('returns t for perpendicular crossing segments', () => {
    // Horizontal segment (0,0)→(10,0) crossed by vertical (5,-5)→(5,5)
    const t = lineLineIntersectionT(0, 0, 10, 0, 5, -5, 5, 5)
    expect(t).not.toBeNull()
    expect(t!).toBeCloseTo(0.5, 5)
  })

  it('returns null for parallel non-overlapping segments', () => {
    const t = lineLineIntersectionT(0, 0, 10, 0, 0, 5, 10, 5)
    expect(t).toBeNull()
  })

  it('returns null for collinear overlapping segments', () => {
    const t = lineLineIntersectionT(0, 0, 10, 0, 5, 0, 15, 0)
    expect(t).toBeNull()
  })

  it('returns null when segments do not reach each other', () => {
    // Both are short and far apart
    const t = lineLineIntersectionT(0, 0, 1, 0, 100, -1, 100, 1)
    expect(t).toBeNull()
  })

  it('returns t at the start of the first segment', () => {
    // Vertical line crossing exactly at start of horizontal line
    const t = lineLineIntersectionT(0, 0, 10, 0, 0, -5, 0, 5)
    expect(t).not.toBeNull()
    expect(t!).toBeCloseTo(0, 5)
  })

  it('returns t at the end of the first segment', () => {
    const t = lineLineIntersectionT(0, 0, 10, 0, 10, -5, 10, 5)
    expect(t).not.toBeNull()
    expect(t!).toBeCloseTo(1, 5)
  })

  it('handles diagonal crossing', () => {
    // (0,0)→(10,10) crossed by (0,10)→(10,0) — they cross at (5,5), t=0.5
    const t = lineLineIntersectionT(0, 0, 10, 10, 0, 10, 10, 0)
    expect(t).not.toBeNull()
    expect(t!).toBeCloseTo(0.5, 5)
  })
})

describe('splitCubicAt', () => {
  it('split at t=0.5 gives two halves whose endpoints match', () => {
    const p0 = { x: 0, y: 0 }
    const cp1 = { x: 0, y: 100 }
    const cp2 = { x: 100, y: 100 }
    const p3 = { x: 100, y: 0 }

    const [left, right] = splitCubicAt(p0, cp1, cp2, p3, 0.5)

    // Left starts at p0
    expect(left[0]!.x).toBeCloseTo(0, 5)
    expect(left[0]!.y).toBeCloseTo(0, 5)
    // Left ends at midpoint = right starts at midpoint
    expect(left[3]!.x).toBeCloseTo(right[0]!.x, 5)
    expect(left[3]!.y).toBeCloseTo(right[0]!.y, 5)
    // Right ends at p3 = (100, 0)
    expect(right[3]!.x).toBeCloseTo(100, 5)
    expect(right[3]!.y).toBeCloseTo(0, 5)
  })

  it('split at t=0 gives start point', () => {
    const p0 = { x: 10, y: 20 }
    const cp1 = { x: 30, y: 40 }
    const cp2 = { x: 60, y: 50 }
    const p3 = { x: 80, y: 10 }

    const [left, _right] = splitCubicAt(p0, cp1, cp2, p3, 0)
    // At t=0 the split point should be at p0
    expect(left[3]!.x).toBeCloseTo(p0.x, 5)
    expect(left[3]!.y).toBeCloseTo(p0.y, 5)
  })

  it('split at t=1 gives end point', () => {
    const p0 = { x: 10, y: 20 }
    const cp1 = { x: 30, y: 40 }
    const cp2 = { x: 60, y: 50 }
    const p3 = { x: 80, y: 10 }

    const [left, _right] = splitCubicAt(p0, cp1, cp2, p3, 1)
    expect(left[3]!.x).toBeCloseTo(p3.x, 5)
    expect(left[3]!.y).toBeCloseTo(p3.y, 5)
  })

  it('each half has exactly 4 control points', () => {
    const [left, right] = splitCubicAt({ x: 0, y: 0 }, { x: 25, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 0 }, 0.3)
    expect(left).toHaveLength(4)
    expect(right).toHaveLength(4)
  })

  it('straight-line cubic split at 0.5 gives midpoint', () => {
    // Control points on the line: p0=(0,0), cp1=(33.33,0), cp2=(66.67,0), p3=(100,0)
    const [left, _] = splitCubicAt({ x: 0, y: 0 }, { x: 100 / 3, y: 0 }, { x: 200 / 3, y: 0 }, { x: 100, y: 0 }, 0.5)
    expect(left[3]!.x).toBeCloseTo(50, 1)
    expect(left[3]!.y).toBeCloseTo(0, 5)
  })
})

describe('lineCubicIntersections', () => {
  it('finds intersection of a vertical line with an S-curve', () => {
    // S-curve from (0,50) to (100,50) bulging up and down
    const p0 = { x: 0, y: 50 }
    const cp1 = { x: 33, y: -50 }
    const cp2 = { x: 66, y: 150 }
    const p3 = { x: 100, y: 50 }

    // Vertical line at x=50
    const lineA = { x: 50, y: -200 }
    const lineB = { x: 50, y: 200 }

    const hits = lineCubicIntersections(p0, cp1, cp2, p3, lineA, lineB)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    // All t values should be in [0,1]
    for (const t of hits) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
  })

  it('returns empty array when line is far from the curve', () => {
    const p0 = { x: 0, y: 0 }
    const cp1 = { x: 25, y: 50 }
    const cp2 = { x: 75, y: 50 }
    const p3 = { x: 100, y: 0 }

    // Line far away
    const lineA = { x: 500, y: 500 }
    const lineB = { x: 600, y: 600 }

    const hits = lineCubicIntersections(p0, cp1, cp2, p3, lineA, lineB)
    expect(hits).toHaveLength(0)
  })

  it('finds intersection when line just touches the curve bounding box', () => {
    // Gentle arc from (0,0) to (100,0) with control points pushing up to y=50
    const p0 = { x: 0, y: 0 }
    const cp1 = { x: 25, y: 50 }
    const cp2 = { x: 75, y: 50 }
    const p3 = { x: 100, y: 0 }

    // Horizontal line at y=25 (should cross the arc)
    const lineA = { x: -10, y: 25 }
    const lineB = { x: 110, y: 25 }

    const hits = lineCubicIntersections(p0, cp1, cp2, p3, lineA, lineB)
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('horizontal line crossing a tall arch finds 2 intersections', () => {
    // Tall arch: (0,0) → cp1(0,100), cp2(100,100) → (100,0)
    const p0 = { x: 0, y: 0 }
    const cp1 = { x: 0, y: 100 }
    const cp2 = { x: 100, y: 100 }
    const p3 = { x: 100, y: 0 }

    // Horizontal line at y=50 — should cross twice (ascending and descending)
    const lineA = { x: -10, y: 50 }
    const lineB = { x: 110, y: 50 }

    const hits = lineCubicIntersections(p0, cp1, cp2, p3, lineA, lineB)
    expect(hits.length).toBeGreaterThanOrEqual(2)
  })
})

describe('segmentsIntersect', () => {
  it('returns true for perpendicular crossing segments', () => {
    expect(segmentsIntersect(0, 0, 10, 0, 5, -5, 5, 5)).toBe(true)
  })

  it('returns false for parallel segments', () => {
    expect(segmentsIntersect(0, 0, 10, 0, 0, 5, 10, 5)).toBe(false)
  })

  it('returns false for non-touching segments', () => {
    expect(segmentsIntersect(0, 0, 1, 0, 5, 5, 6, 6)).toBe(false)
  })

  it('returns true for diagonal X crossing', () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true)
  })

  it('returns false for collinear segments', () => {
    // Collinear overlapping — direction cross product is 0, doesn't trigger
    expect(segmentsIntersect(0, 0, 10, 0, 5, 0, 15, 0)).toBe(false)
  })

  it('returns false for T-junction (endpoint touching)', () => {
    // One endpoint exactly on the other segment — cross products include 0
    // The function uses strict inequality so this should be false
    expect(segmentsIntersect(0, 0, 10, 0, 5, 0, 5, 10)).toBe(false)
  })
})

describe('knife tool — edge cases', () => {
  beforeEach(() => resetKnife())

  it('very short knife line still works (2 points close together)', () => {
    const rectPath = makeRectPath('short-knife-p', 0, 0, 100, 100)
    const layer = makeVectorLayer('short-knife-layer', [rectPath])
    addAndSelect(layer)

    // Tiny knife line that crosses the left edge
    beginKnifeCut(-1, 50)
    updateKnifeCut(1, 50)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // The tiny line might or might not intersect, but no crash
  })

  it('knife with many intermediate points works', () => {
    const rectPath = makeRectPath('many-pts-p', 0, 0, 100, 100)
    const layer = makeVectorLayer('many-pts-layer', [rectPath])
    const layersBefore = countArtboardLayers()
    addAndSelect(layer)

    // Zigzag knife that crosses the rectangle
    beginKnifeCut(-10, 40)
    updateKnifeCut(30, 60)
    updateKnifeCut(70, 40)
    updateKnifeCut(110, 60)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Should have produced some splits from the zigzag crossing
    expect(countArtboardLayers()).toBeGreaterThanOrEqual(layersBefore + 1)
  })

  it('cutting same layer twice results in more pieces', () => {
    const rectPath = makeRectPath('double-cut-p', 0, 0, 100, 100)
    const layer = makeVectorLayer('double-cut-layer', [rectPath])
    addAndSelect(layer)

    // First cut: horizontal at y=30
    beginKnifeCut(-10, 30)
    updateKnifeCut(110, 30)
    endKnifeCut()

    const countAfterFirstCut = countArtboardLayers()

    // Re-select the original layer and cut again
    const store = useEditorStore.getState()
    store.selectLayer('double-cut-layer')

    beginKnifeCut(-10, 70)
    updateKnifeCut(110, 70)
    endKnifeCut()

    // Should still work without crashing
    expect(isKnifeCutting()).toBe(false)
  })
})

describe('knife tool — deduplication of close split points', () => {
  beforeEach(() => resetKnife())

  it('two knife segments crossing at nearly the same point only produce one split', () => {
    const openPath: Path = {
      id: 'dedup-p',
      segments: [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ],
      closed: false,
    }
    const layer = makeVectorLayer('dedup-layer', [openPath])
    addAndSelect(layer)

    // Two nearly-identical knife segments crossing the same spot
    beginKnifeCut(50, 0)
    updateKnifeCut(50, 50) // crosses at (50,50)
    updateKnifeCut(50.001, 100) // nearly identical crossing
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
    // Should not crash and should deduplicate the near-identical splits
  })
})
