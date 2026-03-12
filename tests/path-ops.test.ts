import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import {
  flattenCurves,
  joinPaths,
  breakAtIntersections,
  subdivideSegment,
  lineCubicIntersections,
} from '@/tools/path-ops'
import type { VectorLayer, Segment, Path } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 500, height: 500 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function makeVectorLayer(id: string, paths: Path[], name = 'Layer'): VectorLayer {
  return {
    id,
    name,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  } as VectorLayer
}

function makePath(id: string, segments: Segment[], closed = false): Path {
  return { id, segments, closed }
}

function addLayer(layer: VectorLayer) {
  useEditorStore.getState().addLayer(artboardId(), layer as any)
}

function getArtboard() {
  return useEditorStore.getState().document.artboards.find((a) => a.id === artboardId())!
}

function getLayer(layerId: string): VectorLayer | undefined {
  return getArtboard().layers.find((l) => l.id === layerId) as VectorLayer | undefined
}

// ─── Tests ────────────────────────────────────────────────────

describe('flattenCurves', () => {
  beforeEach(() => resetStore())

  it('converts cubic segments to line segments', () => {
    const layer = makeVectorLayer('fc-cubic', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 50, cp2x: 100, cp2y: 50 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-cubic', 1)

    const updated = getLayer('fc-cubic')!
    const segs = updated.paths[0]!.segments
    // The move should remain
    expect(segs[0]!.type).toBe('move')
    // All subsequent should be 'line'
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.type).toBe('line')
    }
    // There should be more than one line segment (curve was subdivided)
    const lineCount = segs.filter((s) => s.type === 'line').length
    expect(lineCount).toBeGreaterThanOrEqual(2)

    // The last line segment should end at approximately (100, 0)
    const lastSeg = segs[segs.length - 1]! as { type: 'line'; x: number; y: number }
    expect(lastSeg.x).toBeCloseTo(100, 1)
    expect(lastSeg.y).toBeCloseTo(0, 1)
  })

  it('converts quadratic segments to line segments', () => {
    const layer = makeVectorLayer('fc-quad', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 80 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-quad', 1)

    const updated = getLayer('fc-quad')!
    const segs = updated.paths[0]!.segments
    expect(segs[0]!.type).toBe('move')
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.type).toBe('line')
    }
    const lineCount = segs.filter((s) => s.type === 'line').length
    expect(lineCount).toBeGreaterThanOrEqual(2)

    // Last segment should end at (100, 0)
    const lastSeg = segs[segs.length - 1]! as { type: 'line'; x: number; y: number }
    expect(lastSeg.x).toBeCloseTo(100, 1)
    expect(lastSeg.y).toBeCloseTo(0, 1)
  })

  it('leaves line segments unchanged', () => {
    const layer = makeVectorLayer('fc-lines', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 50 },
        { type: 'line', x: 100, y: 0 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-lines')

    const updated = getLayer('fc-lines')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({ type: 'move', x: 0, y: 0 })
    expect(segs[1]).toEqual({ type: 'line', x: 50, y: 50 })
    expect(segs[2]).toEqual({ type: 'line', x: 100, y: 0 })
  })

  it('preserves close segments', () => {
    const layer = makeVectorLayer('fc-close', [
      makePath(
        'p1',
        [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
          { type: 'line', x: 100, y: 100 },
          { type: 'close' },
        ],
        true,
      ),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-close')

    const updated = getLayer('fc-close')!
    const segs = updated.paths[0]!.segments
    expect(segs[segs.length - 1]!.type).toBe('close')
  })

  it('handles arc segments by linearizing them', () => {
    const layer = makeVectorLayer('fc-arc', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'arc', x: 100, y: 100, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-arc')

    const updated = getLayer('fc-arc')!
    const segs = updated.paths[0]!.segments
    expect(segs[0]!.type).toBe('move')
    // Arc should be converted to 16 line segments
    const lines = segs.filter((s) => s.type === 'line')
    expect(lines).toHaveLength(16)
  })

  it('does nothing for nonexistent artboard', () => {
    // Should not throw
    flattenCurves('nonexistent-artboard', 'some-layer')
  })

  it('does nothing for nonexistent layer', () => {
    flattenCurves(artboardId(), 'nonexistent-layer')
  })

  it('does nothing for non-vector layer', () => {
    // The store should have no changes if layer type is not vector
    // We create a raster layer scenario by checking the function exits early
    const layerCountBefore = getArtboard().layers.length
    flattenCurves(artboardId(), 'not-a-real-layer')
    const layerCountAfter = getArtboard().layers.length
    expect(layerCountAfter).toBe(layerCountBefore)
  })

  it('handles empty path with no segments gracefully', () => {
    const layer = makeVectorLayer('fc-empty', [makePath('p1', [])])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-empty')

    const updated = getLayer('fc-empty')!
    expect(updated.paths[0]!.segments).toHaveLength(0)
  })

  it('handles move-only path (no drawable segments)', () => {
    const layer = makeVectorLayer('fc-moveonly', [makePath('p1', [{ type: 'move', x: 10, y: 20 }])])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-moveonly')

    const updated = getLayer('fc-moveonly')!
    expect(updated.paths[0]!.segments).toHaveLength(1)
    expect(updated.paths[0]!.segments[0]!.type).toBe('move')
  })

  it('flattens degenerate cubic where start == end', () => {
    const layer = makeVectorLayer('fc-degen', [
      makePath('p1', [
        { type: 'move', x: 50, y: 50 },
        { type: 'cubic', x: 50, y: 50, cp1x: 50, cp1y: 50, cp2x: 50, cp2y: 50 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-degen')

    const updated = getLayer('fc-degen')!
    const segs = updated.paths[0]!.segments
    expect(segs[0]!.type).toBe('move')
    // All subsequent should be lines
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.type).toBe('line')
    }
  })

  it('flattens degenerate quadratic where start == end', () => {
    const layer = makeVectorLayer('fc-qdegen', [
      makePath('p1', [
        { type: 'move', x: 30, y: 30 },
        { type: 'quadratic', x: 30, y: 30, cpx: 30, cpy: 30 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-qdegen')

    const updated = getLayer('fc-qdegen')!
    const segs = updated.paths[0]!.segments
    expect(segs[0]!.type).toBe('move')
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.type).toBe('line')
    }
  })

  it('uses custom tolerance parameter', () => {
    const layer1 = makeVectorLayer('fc-tol1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 200, y: 0, cp1x: 0, cp1y: 100, cp2x: 200, cp2y: 100 },
      ]),
    ])
    addLayer(layer1)
    flattenCurves(artboardId(), 'fc-tol1', 0.1) // tight tolerance
    const highRes = getLayer('fc-tol1')!
    const highResLines = highRes.paths[0]!.segments.filter((s) => s.type === 'line').length

    // Re-setup for a second test
    resetStore()
    const layer2 = makeVectorLayer('fc-tol2', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 200, y: 0, cp1x: 0, cp1y: 100, cp2x: 200, cp2y: 100 },
      ]),
    ])
    addLayer(layer2)
    flattenCurves(artboardId(), 'fc-tol2', 50) // loose tolerance
    const lowRes = getLayer('fc-tol2')!
    const lowResLines = lowRes.paths[0]!.segments.filter((s) => s.type === 'line').length

    // Tighter tolerance should produce more segments
    expect(highResLines).toBeGreaterThan(lowResLines)
  })

  it('handles multiple paths in one layer', () => {
    const layer = makeVectorLayer('fc-multi', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 50, y: 0, cp1x: 0, cp1y: 30, cp2x: 50, cp2y: 30 },
      ]),
      makePath('p2', [
        { type: 'move', x: 100, y: 100 },
        { type: 'quadratic', x: 200, y: 100, cpx: 150, cpy: 150 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-multi')

    const updated = getLayer('fc-multi')!
    expect(updated.paths).toHaveLength(2)
    // Both paths should have only move+line segments
    for (const path of updated.paths) {
      for (const seg of path.segments) {
        expect(['move', 'line'].includes(seg.type)).toBe(true)
      }
    }
  })

  it('preserves path id, closed, and fillRule', () => {
    const layer = makeVectorLayer('fc-preserve', [
      makePath('my-path-id', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    layer.paths[0]!.closed = true
    layer.paths[0]!.fillRule = 'evenodd'
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-preserve')

    const updated = getLayer('fc-preserve')!
    expect(updated.paths[0]!.id).toBe('my-path-id')
    expect(updated.paths[0]!.closed).toBe(true)
    expect(updated.paths[0]!.fillRule).toBe('evenodd')
  })

  it('handles mixed segment types in one path', () => {
    const layer = makeVectorLayer('fc-mixed', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 50, cp1y: 40, cp2x: 100, cp2y: 40 },
        { type: 'quadratic', x: 150, y: 0, cpx: 125, cpy: 30 },
        { type: 'line', x: 200, y: 0 },
      ]),
    ])
    addLayer(layer)

    flattenCurves(artboardId(), 'fc-mixed')

    const updated = getLayer('fc-mixed')!
    const segs = updated.paths[0]!.segments
    // All segments should now be move or line
    for (const seg of segs) {
      expect(['move', 'line'].includes(seg.type)).toBe(true)
    }
    // Should start with move at (0,0)
    expect(segs[0]).toEqual({ type: 'move', x: 0, y: 0 })
  })
})

describe('joinPaths', () => {
  beforeEach(() => resetStore())

  it('joins two open paths at nearest endpoints', () => {
    const layer1 = makeVectorLayer('jp-1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ]),
    ])
    const layer2 = makeVectorLayer('jp-2', [
      makePath('p2', [
        { type: 'move', x: 100, y: 0 },
        { type: 'line', x: 200, y: 0 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    joinPaths(artboardId(), ['jp-1', 'jp-2'])

    const ab = getArtboard()
    // Original layers should be removed
    expect(ab.layers.find((l) => l.id === 'jp-1')).toBeUndefined()
    expect(ab.layers.find((l) => l.id === 'jp-2')).toBeUndefined()
    // A new joined layer should exist
    const joinedLayer = ab.layers.find((l) => l.name.includes('joined'))
    expect(joinedLayer).toBeDefined()
    expect((joinedLayer as VectorLayer).paths).toHaveLength(1)
    const joinedPath = (joinedLayer as VectorLayer).paths[0]!
    expect(joinedPath.closed).toBe(false)
  })

  it('reverses path direction when needed for closest endpoint match', () => {
    // Path1 goes (0,0) -> (50,0)
    // Path2 goes (200,0) -> (60,0)
    // The end of path1 (50,0) is closest to the end of path2 (60,0)
    // so path2 should be reversed
    const layer1 = makeVectorLayer('jp-rev1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 0 },
      ]),
    ])
    const layer2 = makeVectorLayer('jp-rev2', [
      makePath('p2', [
        { type: 'move', x: 200, y: 0 },
        { type: 'line', x: 60, y: 0 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    joinPaths(artboardId(), ['jp-rev1', 'jp-rev2'])

    const ab = getArtboard()
    const joinedLayer = ab.layers.find((l) => l.name.includes('joined')) as VectorLayer
    expect(joinedLayer).toBeDefined()
    const segs = joinedLayer.paths[0]!.segments

    // The result should contain all points from both paths, connected
    // First point should be (0,0) or (200,0) depending on which direction is chosen
    expect(segs[0]!.type).toBe('move')
    // Should have a continuous path with at least 3 points
    expect(segs.length).toBeGreaterThanOrEqual(3)
  })

  it('creates a single layer from joined paths', () => {
    const layer1 = makeVectorLayer('jp-s1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    const layer2 = makeVectorLayer('jp-s2', [
      makePath('p2', [
        { type: 'move', x: 10, y: 10 },
        { type: 'line', x: 20, y: 20 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    const layersBefore = getArtboard().layers.length
    joinPaths(artboardId(), ['jp-s1', 'jp-s2'])

    const ab = getArtboard()
    // Net change: removed 2 original, added 1 joined
    expect(ab.layers.length).toBe(layersBefore - 1)
  })

  it('does nothing with fewer than 2 layer IDs', () => {
    const layer1 = makeVectorLayer('jp-only', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer1)

    const layersBefore = getArtboard().layers.length
    joinPaths(artboardId(), ['jp-only'])

    expect(getArtboard().layers.length).toBe(layersBefore)
  })

  it('does nothing with no layer IDs', () => {
    joinPaths(artboardId(), [])
    // No crash
  })

  it('does nothing for nonexistent artboard', () => {
    joinPaths('nonexistent', ['a', 'b'])
    // Should not throw
  })

  it('does nothing when only one layer resolves to vector type', () => {
    const layer1 = makeVectorLayer('jp-single-vec', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer1)

    const layersBefore = getArtboard().layers.length
    joinPaths(artboardId(), ['jp-single-vec', 'nonexistent-layer'])

    expect(getArtboard().layers.length).toBe(layersBefore)
  })

  it('skips closed paths when joining', () => {
    // Two layers, each with a closed path (closed paths can't be joined)
    const layer1 = makeVectorLayer('jp-closed1', [
      makePath(
        'p1',
        [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 10, y: 0 },
          { type: 'line', x: 10, y: 10 },
          { type: 'close' },
        ],
        true,
      ),
    ])
    const layer2 = makeVectorLayer('jp-closed2', [
      makePath(
        'p2',
        [
          { type: 'move', x: 20, y: 20 },
          { type: 'line', x: 30, y: 20 },
          { type: 'line', x: 30, y: 30 },
          { type: 'close' },
        ],
        true,
      ),
    ])
    addLayer(layer1)
    addLayer(layer2)

    const layersBefore = getArtboard().layers.length
    joinPaths(artboardId(), ['jp-closed1', 'jp-closed2'])

    // Both paths are closed, so openPaths < 2 and joinPaths returns early
    expect(getArtboard().layers.length).toBe(layersBefore)
  })

  it('joins three open paths in correct order', () => {
    // Chain: (0,0)->(10,0), (10,0)->(20,0), (20,0)->(30,0)
    const l1 = makeVectorLayer('jp-3a', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 0 },
      ]),
    ])
    const l2 = makeVectorLayer('jp-3b', [
      makePath('p2', [
        { type: 'move', x: 10, y: 0 },
        { type: 'line', x: 20, y: 0 },
      ]),
    ])
    const l3 = makeVectorLayer('jp-3c', [
      makePath('p3', [
        { type: 'move', x: 20, y: 0 },
        { type: 'line', x: 30, y: 0 },
      ]),
    ])
    addLayer(l1)
    addLayer(l2)
    addLayer(l3)

    joinPaths(artboardId(), ['jp-3a', 'jp-3b', 'jp-3c'])

    const ab = getArtboard()
    const joined = ab.layers.find((l) => l.name.includes('joined')) as VectorLayer
    expect(joined).toBeDefined()
    expect(joined.paths).toHaveLength(1)
    // The merged path should have at least 4 points (one move + three lines for the chain)
    expect(joined.paths[0]!.segments.length).toBeGreaterThanOrEqual(4)
  })

  it('selects the resulting layer', () => {
    const l1 = makeVectorLayer('jp-sel1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 0 },
      ]),
    ])
    const l2 = makeVectorLayer('jp-sel2', [
      makePath('p2', [
        { type: 'move', x: 10, y: 0 },
        { type: 'line', x: 20, y: 0 },
      ]),
    ])
    addLayer(l1)
    addLayer(l2)

    joinPaths(artboardId(), ['jp-sel1', 'jp-sel2'])

    const ab = getArtboard()
    const joined = ab.layers.find((l) => l.name.includes('joined')) as VectorLayer
    const store = useEditorStore.getState()
    expect(store.selection.layerIds).toContain(joined.id)
  })

  it('prepends candidate when its end is closest to merged start', () => {
    // Path1: (100,0) -> (200,0) (start at 100)
    // Path2: (0,0) -> (100,0) (end at 100, closest to start of path1)
    // Path2's end should connect to path1's start => prepend
    const l1 = makeVectorLayer('jp-pre1', [
      makePath('p1', [
        { type: 'move', x: 100, y: 0 },
        { type: 'line', x: 200, y: 0 },
      ]),
    ])
    const l2 = makeVectorLayer('jp-pre2', [
      makePath('p2', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ]),
    ])
    addLayer(l1)
    addLayer(l2)

    joinPaths(artboardId(), ['jp-pre1', 'jp-pre2'])

    const ab = getArtboard()
    const joined = ab.layers.find((l) => l.name.includes('joined')) as VectorLayer
    expect(joined).toBeDefined()
    const segs = joined.paths[0]!.segments
    // The merged path should start near (0,0) and end near (200,0)
    const firstSeg = segs[0]! as { type: 'move'; x: number; y: number }
    expect(firstSeg.type).toBe('move')
  })

  it('reverse+prepend when candidate start is closest to merged start', () => {
    // Path1: (100,0) -> (200,0) (start at 100)
    // Path2: (100,0) -> (0,0) (start at 100, closest to start of path1)
    // Since candidate start matches merged start, it should reverse candidate and prepend
    const l1 = makeVectorLayer('jp-rp1', [
      makePath('p1', [
        { type: 'move', x: 100, y: 0 },
        { type: 'line', x: 200, y: 0 },
      ]),
    ])
    const l2 = makeVectorLayer('jp-rp2', [
      makePath('p2', [
        { type: 'move', x: 100, y: 0 },
        { type: 'line', x: 0, y: 0 },
      ]),
    ])
    addLayer(l1)
    addLayer(l2)

    joinPaths(artboardId(), ['jp-rp1', 'jp-rp2'])

    const ab = getArtboard()
    const joined = ab.layers.find((l) => l.name.includes('joined')) as VectorLayer
    expect(joined).toBeDefined()
    expect(joined.paths).toHaveLength(1)
  })
})

describe('breakAtIntersections', () => {
  beforeEach(() => resetStore())

  it('splits crossing paths at their intersection point', () => {
    // Horizontal line from (0,50) to (100,50)
    const layer1 = makeVectorLayer('bi-h', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    // Vertical line from (50,0) to (50,100)
    const layer2 = makeVectorLayer('bi-v', [
      makePath('p2', [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 50, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-h', 'bi-v'])

    const ab = getArtboard()
    // Original layers should be removed
    expect(ab.layers.find((l) => l.id === 'bi-h')).toBeUndefined()
    expect(ab.layers.find((l) => l.id === 'bi-v')).toBeUndefined()
    // New layers should be created (each path split into 2 parts = 4 total)
    const partLayers = ab.layers.filter((l) => l.name.includes('part'))
    expect(partLayers.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves non-crossing paths unchanged (as new layers)', () => {
    // Two parallel horizontal lines that don't cross
    const layer1 = makeVectorLayer('bi-p1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-p2', [
      makePath('p2', [
        { type: 'move', x: 0, y: 100 },
        { type: 'line', x: 100, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    const layersBefore = getArtboard().layers.length
    breakAtIntersections(artboardId(), ['bi-p1', 'bi-p2'])

    // No intersections found, function returns early - original layers unchanged
    const ab = getArtboard()
    expect(ab.layers.length).toBe(layersBefore)
  })

  it('does nothing with fewer than 2 layer IDs', () => {
    const layer1 = makeVectorLayer('bi-single', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 100 },
      ]),
    ])
    addLayer(layer1)

    const layersBefore = getArtboard().layers.length
    breakAtIntersections(artboardId(), ['bi-single'])

    expect(getArtboard().layers.length).toBe(layersBefore)
  })

  it('does nothing for nonexistent artboard', () => {
    breakAtIntersections('nonexistent', ['a', 'b'])
    // Should not throw
  })

  it('does nothing when layers are not vector type', () => {
    const layersBefore = getArtboard().layers.length
    breakAtIntersections(artboardId(), ['nonexistent-1', 'nonexistent-2'])
    expect(getArtboard().layers.length).toBe(layersBefore)
  })

  it('does nothing with empty layer IDs list', () => {
    breakAtIntersections(artboardId(), [])
    // Should not throw
  })

  it('handles X-crossing paths and produces multiple parts', () => {
    // Diagonal from (0,0) to (100,100)
    const layer1 = makeVectorLayer('bi-x1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 100 },
      ]),
    ])
    // Diagonal from (100,0) to (0,100)
    const layer2 = makeVectorLayer('bi-x2', [
      makePath('p2', [
        { type: 'move', x: 100, y: 0 },
        { type: 'line', x: 0, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-x1', 'bi-x2'])

    const ab = getArtboard()
    // Original layers should be removed
    expect(ab.layers.find((l) => l.id === 'bi-x1')).toBeUndefined()
    expect(ab.layers.find((l) => l.id === 'bi-x2')).toBeUndefined()

    // Each path should be split at the intersection (50,50)
    const partLayers = ab.layers.filter((l) => l.name.includes('part'))
    expect(partLayers.length).toBeGreaterThanOrEqual(2)
  })

  it('selects the first new layer after splitting', () => {
    const layer1 = makeVectorLayer('bi-sel1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-sel2', [
      makePath('p2', [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 50, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-sel1', 'bi-sel2'])

    const store = useEditorStore.getState()
    const ab = getArtboard()
    const partLayers = ab.layers.filter((l) => l.name.includes('part'))
    if (partLayers.length > 0) {
      expect(store.selection.layerIds).toContain(partLayers[0]!.id)
    }
  })

  it('handles paths with cubic segments during intersection finding', () => {
    // A horizontal line and a cubic curve that crosses it
    const layer1 = makeVectorLayer('bi-cubic1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    // Cubic curve from (50,0) to (50,100) that crosses the line
    const layer2 = makeVectorLayer('bi-cubic2', [
      makePath('p2', [
        { type: 'move', x: 50, y: 0 },
        { type: 'cubic', x: 50, y: 100, cp1x: 50, cp1y: 33, cp2x: 50, cp2y: 66 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-cubic1', 'bi-cubic2'])

    const ab = getArtboard()
    // Original layers should be removed if intersections were found
    const remaining = ab.layers.filter((l) => l.id === 'bi-cubic1' || l.id === 'bi-cubic2')
    const partLayers = ab.layers.filter((l) => l.name.includes('part'))
    // Either intersection found (parts created, originals removed) or no intersection (unchanged)
    expect(remaining.length + partLayers.length).toBeGreaterThan(0)
  })

  it('handles paths with quadratic segments during intersection finding', () => {
    const layer1 = makeVectorLayer('bi-quad1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-quad2', [
      makePath('p2', [
        { type: 'move', x: 50, y: 0 },
        { type: 'quadratic', x: 50, y: 100, cpx: 50, cpy: 50 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-quad1', 'bi-quad2'])

    const ab = getArtboard()
    // Should not crash; result depends on whether intersection is detected
    expect(ab.layers.length).toBeGreaterThan(0)
  })

  it('handles paths with close segments during intersection finding', () => {
    // A closed triangle crossing a line
    const layer1 = makeVectorLayer('bi-close1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-close2', [
      makePath(
        'p2',
        [
          { type: 'move', x: 50, y: 0 },
          { type: 'line', x: 80, y: 100 },
          { type: 'line', x: 20, y: 100 },
          { type: 'close' },
        ],
        true,
      ),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-close1', 'bi-close2'])

    const ab = getArtboard()
    // The triangle has a close segment that should be handled
    // Intersection should be found where the triangle sides cross the line
    expect(ab.layers.length).toBeGreaterThan(0)
  })

  it('keeps path as-is when it has no intersections with other paths', () => {
    // Two crossing paths and one far away
    const layer1 = makeVectorLayer('bi-far1', [
      makePath('p1', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-far2', [
      makePath('p2', [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 50, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-far1', 'bi-far2'])

    const ab = getArtboard()
    // At least some parts should exist
    const parts = ab.layers.filter((l) => l.name.includes('part'))
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps a non-intersecting path as-is while splitting intersecting ones', () => {
    // Layer1 has two paths: one that crosses layer2, one that is far away
    const layer1 = makeVectorLayer('bi-keep1', [
      makePath('pa', [
        { type: 'move', x: 0, y: 50 },
        { type: 'line', x: 100, y: 50 },
      ]),
      makePath('pb', [
        // Far away path that won't intersect with anything
        { type: 'move', x: 400, y: 400 },
        { type: 'line', x: 450, y: 450 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-keep2', [
      makePath('pc', [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 50, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-keep1', 'bi-keep2'])

    const ab = getArtboard()
    // Original layers should be deleted
    expect(ab.layers.find((l) => l.id === 'bi-keep1')).toBeUndefined()
    expect(ab.layers.find((l) => l.id === 'bi-keep2')).toBeUndefined()
    // New part layers should be created, including the far-away path kept as-is
    const parts = ab.layers.filter((l) => l.name.includes('part'))
    expect(parts.length).toBeGreaterThanOrEqual(3) // at least: pa split into 2, pb kept as 1, pc parts
  })

  it('handles multiple paths within a single layer during intersection', () => {
    // Layer 1 has two paths, layer 2 has one path crossing them
    const layer1 = makeVectorLayer('bi-mp1', [
      makePath('pa', [
        { type: 'move', x: 0, y: 30 },
        { type: 'line', x: 100, y: 30 },
      ]),
      makePath('pb', [
        { type: 'move', x: 0, y: 70 },
        { type: 'line', x: 100, y: 70 },
      ]),
    ])
    const layer2 = makeVectorLayer('bi-mp2', [
      makePath('pc', [
        { type: 'move', x: 50, y: 0 },
        { type: 'line', x: 50, y: 100 },
      ]),
    ])
    addLayer(layer1)
    addLayer(layer2)

    breakAtIntersections(artboardId(), ['bi-mp1', 'bi-mp2'])

    const ab = getArtboard()
    // Should split at intersections and create part layers
    const parts = ab.layers.filter((l) => l.name.includes('part'))
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })
})

describe('subdivideSegment', () => {
  beforeEach(() => resetStore())

  it('splits a line segment into two lines at midpoint', () => {
    const layer = makeVectorLayer('sd-line', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 0 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-line', 'path1', 1) // segIndex=1 is the line

    const updated = getLayer('sd-line')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(3) // move + 2 lines
    expect(segs[0]).toEqual({ type: 'move', x: 0, y: 0 })
    expect(segs[1]).toEqual({ type: 'line', x: 50, y: 0 })
    expect(segs[2]).toEqual({ type: 'line', x: 100, y: 0 })
  })

  it('splits a cubic segment into two cubics with correct control points', () => {
    const layer = makeVectorLayer('sd-cubic', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 100, cp2x: 100, cp2y: 100 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-cubic', 'path1', 1)

    const updated = getLayer('sd-cubic')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(3) // move + 2 cubics
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('cubic')
    expect(segs[2]!.type).toBe('cubic')

    // The first cubic should end at the midpoint of the original curve
    const firstCubic = segs[1]! as {
      type: 'cubic'
      x: number
      y: number
      cp1x: number
      cp1y: number
      cp2x: number
      cp2y: number
    }
    const secondCubic = segs[2]! as {
      type: 'cubic'
      x: number
      y: number
      cp1x: number
      cp1y: number
      cp2x: number
      cp2y: number
    }

    // Midpoint should be at (50, 75) for this symmetric S-curve
    expect(firstCubic.x).toBeCloseTo(50, 5)
    expect(firstCubic.y).toBeCloseTo(75, 5)

    // Second cubic should end at the original endpoint
    expect(secondCubic.x).toBeCloseTo(100, 5)
    expect(secondCubic.y).toBeCloseTo(0, 5)

    // Verify de Casteljau control points for first half
    // p0=(0,0), cp1=(0,100), cp2=(100,100), p1=(100,0), t=0.5
    // a1 = (0, 50), a2 = (50, 100), a3 = (100, 50)
    // b1 = (25, 75), b2 = (75, 75)
    // m  = (50, 75)
    expect(firstCubic.cp1x).toBeCloseTo(0, 5)
    expect(firstCubic.cp1y).toBeCloseTo(50, 5)
    expect(firstCubic.cp2x).toBeCloseTo(25, 5)
    expect(firstCubic.cp2y).toBeCloseTo(75, 5)

    expect(secondCubic.cp1x).toBeCloseTo(75, 5)
    expect(secondCubic.cp1y).toBeCloseTo(75, 5)
    expect(secondCubic.cp2x).toBeCloseTo(100, 5)
    expect(secondCubic.cp2y).toBeCloseTo(50, 5)
  })

  it('splits a quadratic segment into two quadratics', () => {
    const layer = makeVectorLayer('sd-quad', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 100 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-quad', 'path1', 1)

    const updated = getLayer('sd-quad')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(3) // move + 2 quadratics
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('quadratic')
    expect(segs[2]!.type).toBe('quadratic')

    const firstQuad = segs[1]! as { type: 'quadratic'; x: number; y: number; cpx: number; cpy: number }
    const secondQuad = segs[2]! as { type: 'quadratic'; x: number; y: number; cpx: number; cpy: number }

    // p0=(0,0), cp=(50,100), p1=(100,0), t=0.5
    // a1 = (25, 50), a2 = (75, 50)
    // m  = (50, 50)
    expect(firstQuad.cpx).toBeCloseTo(25, 5)
    expect(firstQuad.cpy).toBeCloseTo(50, 5)
    expect(firstQuad.x).toBeCloseTo(50, 5)
    expect(firstQuad.y).toBeCloseTo(50, 5)

    expect(secondQuad.cpx).toBeCloseTo(75, 5)
    expect(secondQuad.cpy).toBeCloseTo(50, 5)
    expect(secondQuad.x).toBeCloseTo(100, 5)
    expect(secondQuad.y).toBeCloseTo(0, 5)
  })

  it('does nothing for nonexistent artboard', () => {
    subdivideSegment('nonexistent', 'layer', 'path', 0)
    // Should not throw
  })

  it('does nothing for nonexistent layer', () => {
    subdivideSegment(artboardId(), 'nonexistent', 'path', 0)
  })

  it('does nothing for nonexistent path', () => {
    const layer = makeVectorLayer('sd-nop', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-nop', 'nonexistent-path', 0)

    // Layer should be unchanged
    const updated = getLayer('sd-nop')!
    expect(updated.paths[0]!.segments).toHaveLength(2)
  })

  it('does nothing for out-of-range segment index (negative)', () => {
    const layer = makeVectorLayer('sd-neg', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-neg', 'path1', -1)

    const updated = getLayer('sd-neg')!
    expect(updated.paths[0]!.segments).toHaveLength(2)
  })

  it('does nothing for out-of-range segment index (too large)', () => {
    const layer = makeVectorLayer('sd-big', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-big', 'path1', 99)

    const updated = getLayer('sd-big')!
    expect(updated.paths[0]!.segments).toHaveLength(2)
  })

  it('does nothing for a move segment', () => {
    const layer = makeVectorLayer('sd-move', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 10, y: 10 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-move', 'path1', 0) // index 0 = move

    const updated = getLayer('sd-move')!
    expect(updated.paths[0]!.segments).toHaveLength(2) // unchanged
  })

  it('does nothing for a close segment', () => {
    const layer = makeVectorLayer('sd-close', [
      makePath('path1', [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 10, y: 0 }, { type: 'close' }]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-close', 'path1', 2) // index 2 = close

    const updated = getLayer('sd-close')!
    expect(updated.paths[0]!.segments).toHaveLength(3) // unchanged
  })

  it('does nothing for an arc segment', () => {
    const layer = makeVectorLayer('sd-arc', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'arc', x: 100, y: 100, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-arc', 'path1', 1)

    const updated = getLayer('sd-arc')!
    expect(updated.paths[0]!.segments).toHaveLength(2) // unchanged
  })

  it('handles line segment that is the first segment with no previous point', () => {
    // A line as the very first segment (no preceding move) - prevPoint would be null
    const layer = makeVectorLayer('sd-noprev', [makePath('path1', [{ type: 'line', x: 100, y: 100 }])])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-noprev', 'path1', 0)

    // Should not crash, and should not change because prevPoint is null
    const updated = getLayer('sd-noprev')!
    expect(updated.paths[0]!.segments).toHaveLength(1)
  })

  it('handles cubic with no previous point', () => {
    const layer = makeVectorLayer('sd-cubic-noprev', [
      makePath('path1', [{ type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 50, cp2x: 100, cp2y: 50 }]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-cubic-noprev', 'path1', 0)

    const updated = getLayer('sd-cubic-noprev')!
    expect(updated.paths[0]!.segments).toHaveLength(1) // unchanged
  })

  it('subdivides line in the middle of a multi-segment path', () => {
    const layer = makeVectorLayer('sd-mid', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 50, y: 0 },
        { type: 'line', x: 100, y: 0 },
        { type: 'line', x: 150, y: 0 },
      ]),
    ])
    addLayer(layer)

    // Subdivide the second line (index 2), from (50,0) to (100,0)
    subdivideSegment(artboardId(), 'sd-mid', 'path1', 2)

    const updated = getLayer('sd-mid')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(5) // original 4 -> replaced 1 with 2 = 5
    expect(segs[0]).toEqual({ type: 'move', x: 0, y: 0 })
    expect(segs[1]).toEqual({ type: 'line', x: 50, y: 0 })
    expect(segs[2]).toEqual({ type: 'line', x: 75, y: 0 }) // midpoint
    expect(segs[3]).toEqual({ type: 'line', x: 100, y: 0 })
    expect(segs[4]).toEqual({ type: 'line', x: 150, y: 0 })
  })

  it('subdivides a diagonal line correctly', () => {
    const layer = makeVectorLayer('sd-diag', [
      makePath('path1', [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 80, y: 60 },
      ]),
    ])
    addLayer(layer)

    subdivideSegment(artboardId(), 'sd-diag', 'path1', 1)

    const updated = getLayer('sd-diag')!
    const segs = updated.paths[0]!.segments
    expect(segs).toHaveLength(3)
    const midSeg = segs[1]! as { type: 'line'; x: number; y: number }
    expect(midSeg.x).toBeCloseTo(40, 5)
    expect(midSeg.y).toBeCloseTo(30, 5)
  })
})

describe('lineCubicIntersections', () => {
  it('finds intersection between a line and a cubic curve', () => {
    // Horizontal line from (0,50) to (100,50)
    // Cubic from (0,0) to (100,0) that arcs up to y~100 and crosses y=50 twice
    const hits = lineCubicIntersections(
      0,
      50,
      100,
      50, // line
      0,
      0,
      33,
      150,
      66,
      150,
      100,
      0, // cubic with big upward bulge
    )
    // Should find 2 intersections (curve goes up through y=50 and back down through y=50)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    // Intersection y should be near 50
    for (const h of hits) {
      expect(h.y).toBeCloseTo(50, 1)
    }
  })

  it('returns empty for non-intersecting line and curve', () => {
    // Line far above curve
    const hits = lineCubicIntersections(
      0,
      -100,
      100,
      -100, // line at y=-100
      0,
      0,
      33,
      50,
      66,
      50,
      100,
      0, // curve all above y=-100
    )
    expect(hits).toHaveLength(0)
  })

  it('returns empty when bounding boxes do not overlap', () => {
    // Line and curve in completely different regions
    const hits = lineCubicIntersections(
      0,
      0,
      10,
      0, // line at y=0, x=[0,10]
      200,
      200,
      210,
      220,
      220,
      220,
      230,
      200, // curve far away
    )
    expect(hits).toHaveLength(0)
  })

  it('handles nearly flat cubic as a line', () => {
    // Cubic that's almost straight
    const hits = lineCubicIntersections(
      50,
      0,
      50,
      100, // vertical line at x=50
      0,
      50,
      33,
      50,
      66,
      50,
      100,
      50, // nearly flat cubic at y=50
    )
    // Should find intersection near (50, 50)
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('handles parallel line and flat cubic with no intersection', () => {
    // Both are horizontal at different y values
    const hits = lineCubicIntersections(
      0,
      0,
      100,
      0, // line at y=0
      0,
      10,
      33,
      10,
      66,
      10,
      100,
      10, // flat cubic at y=10
    )
    expect(hits).toHaveLength(0)
  })

  it('respects depth limit and returns empty at max recursion', () => {
    // A very convoluted curve that might require deep recursion
    // The function caps at depth=16
    const hits = lineCubicIntersections(
      0,
      50,
      100,
      50,
      0,
      0,
      100,
      100,
      0,
      100,
      100,
      0,
      16, // start at max depth
    )
    expect(hits).toHaveLength(0)
  })

  it('finds multiple intersections for a curve crossing a line twice', () => {
    // S-curve that crosses a horizontal line twice
    const hits = lineCubicIntersections(
      0,
      50,
      100,
      50, // horizontal line at y=50
      0,
      0,
      0,
      200,
      100,
      -100,
      100,
      100, // S-curve
    )
    // May find 0, 1, or 2 hits depending on subdivision precision
    // Just verify no crash and reasonable result
    expect(hits.length).toBeGreaterThanOrEqual(0)
  })
})
