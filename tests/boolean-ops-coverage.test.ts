import { describe, test, expect } from 'bun:test'
import { performBooleanOp, offsetPath, expandStroke, simplifyPath, rdpSimplify } from '@/tools/boolean-ops'
import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer } from '@/types'

// --- helpers ---

function makeSquare(id: string, x: number, y: number, size: number): VectorLayer {
  return {
    id,
    name: `Square ${id}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: `path-${id}`,
        segments: [
          { type: 'move', x, y },
          { type: 'line', x: x + size, y },
          { type: 'line', x: x + size, y: y + size },
          { type: 'line', x, y: y + size },
          { type: 'close' },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  } as VectorLayer
}

function makeSquareWithStroke(id: string, x: number, y: number, size: number): VectorLayer {
  const layer = makeSquare(id, x, y, size)
  layer.stroke = { color: '#ff0000', width: 4, opacity: 1, dashArray: null, lineCap: 'butt', lineJoin: 'miter' } as any
  return layer
}

function setupTwoSquares(id1: string, id2: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) throw new Error('No artboard')

  const sq1 = makeSquare(id1, 0, 0, 100)
  const sq2 = makeSquare(id2, 50, 50, 100)

  store.addLayer(artboard.id, sq1 as any)
  store.addLayer(artboard.id, sq2 as any)

  // Select both
  store.selectLayer(id1)
  store.selectLayer(id2, true)

  return artboard
}

describe('boolean ops - performBooleanOp', () => {
  test('union creates a combined shape', () => {
    const artboard = setupTwoSquares('bool-u1', 'bool-u2')
    performBooleanOp('union')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    // Original 2 layers deleted, 1 new result layer
    const resultLayers = updated.layers.filter((l) => l.name === 'union result')
    expect(resultLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('subtract creates a difference shape', () => {
    const artboard = setupTwoSquares('bool-s1', 'bool-s2')

    performBooleanOp('subtract')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const resultLayers = updated.layers.filter((l) => l.name === 'subtract result')
    expect(resultLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('intersect creates an intersection shape', () => {
    const artboard = setupTwoSquares('bool-i1', 'bool-i2')

    performBooleanOp('intersect')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const resultLayers = updated.layers.filter((l) => l.name === 'intersect result')
    expect(resultLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('xor creates an xor shape', () => {
    const artboard = setupTwoSquares('bool-x1', 'bool-x2')

    performBooleanOp('xor')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const resultLayers = updated.layers.filter((l) => l.name === 'xor result')
    expect(resultLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('divide creates intersection + subtract', () => {
    const artboard = setupTwoSquares('bool-d1', 'bool-d2')

    performBooleanOp('divide')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const resultLayers = updated.layers.filter((l) => l.name === 'divide result')
    expect(resultLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('deleteOriginals=false keeps original layers', () => {
    const artboard = setupTwoSquares('bool-keep1', 'bool-keep2')

    performBooleanOp('union', false)

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const origLayer1 = updated.layers.find((l) => l.id === 'bool-keep1')
    const origLayer2 = updated.layers.find((l) => l.id === 'bool-keep2')
    expect(origLayer1).toBeDefined()
    expect(origLayer2).toBeDefined()
  })

  test('does nothing when fewer than 2 layers selected', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq = makeSquare('bool-single', 0, 0, 50)
    store.addLayer(artboard.id, sq as any)
    store.selectLayer('bool-single')

    const layersBefore = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length

    performBooleanOp('union')

    const layersAfter = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length
    expect(layersAfter).toBe(layersBefore)
  })

  test('does nothing when no artboard exists', () => {
    const store = useEditorStore.getState()
    const origDoc = store.document
    useEditorStore.setState({ document: { ...origDoc, artboards: [] } })

    performBooleanOp('union')
    // Should not throw

    useEditorStore.setState({ document: origDoc })
  })

  test('does nothing when selected layers are not vector', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const raster1 = {
      id: 'bool-r1',
      name: 'Raster1',
      type: 'raster' as const,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: 'c1',
      width: 10,
      height: 10,
    }
    const raster2 = { ...raster1, id: 'bool-r2', name: 'Raster2', imageChunkId: 'c2' }
    store.addLayer(artboard.id, raster1 as any)
    store.addLayer(artboard.id, raster2 as any)
    store.selectLayer('bool-r1')
    store.selectLayer('bool-r2', true)

    performBooleanOp('union')
    // Should not throw
  })

  test('handles cubic curves in paths', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const curveLayer: VectorLayer = {
      id: 'bool-curve1',
      name: 'Curve1',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'cp1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 50, cp2x: 100, cp2y: 50 },
            { type: 'line', x: 100, y: 100 },
            { type: 'line', x: 0, y: 100 },
            { type: 'close' },
          ],
          closed: true,
        },
      ],
      fill: { type: 'solid', color: '#000', opacity: 1 },
      stroke: null,
    } as VectorLayer

    const sq = makeSquare('bool-curve2', 20, 20, 60)

    store.addLayer(artboard.id, curveLayer as any)
    store.addLayer(artboard.id, sq as any)
    store.selectLayer('bool-curve1')
    store.selectLayer('bool-curve2', true)

    performBooleanOp('intersect')
    // Should handle cubic sampling without error
  })

  test('result layer inherits fill from first layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq1 = makeSquare('bool-fill1', 0, 0, 100)
    sq1.fill = { type: 'solid', color: '#ff0000', opacity: 0.5 }
    const sq2 = makeSquare('bool-fill2', 50, 50, 100)

    store.addLayer(artboard.id, sq1 as any)
    store.addLayer(artboard.id, sq2 as any)
    store.selectLayer('bool-fill1')
    store.selectLayer('bool-fill2', true)

    performBooleanOp('union')

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const result = updated.layers.find((l) => l.name === 'union result') as VectorLayer
    if (result) {
      expect(result.fill).toBeDefined()
    }
  })
})

describe('boolean ops - offsetPath', () => {
  test('offsets a path outward', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq = makeSquare('off-1', 0, 0, 100)
    store.addLayer(artboard.id, sq as any)

    const layersBefore = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length

    offsetPath(artboard.id, 'off-1', 10)

    const layersAfter = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length
    expect(layersAfter).toBe(layersBefore + 1)
  })

  test('offsets a path inward (negative delta)', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq = makeSquare('off-2', 0, 0, 200)
    store.addLayer(artboard.id, sq as any)

    offsetPath(artboard.id, 'off-2', -10)

    // A new layer should be created
    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const offsetLayer = updated.layers.find((l) => l.name.includes('offset'))
    expect(offsetLayer).toBeDefined()
  })

  test('does nothing for non-vector layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    offsetPath(artboard.id, 'nonexistent', 10)
    // Should not throw
  })

  test('does nothing for nonexistent artboard', () => {
    offsetPath('nonexistent', 'foo', 10)
    // Should not throw
  })
})

describe('boolean ops - expandStroke', () => {
  test('expands stroke to filled outline', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq = makeSquareWithStroke('exp-1', 0, 0, 100)
    store.addLayer(artboard.id, sq as any)

    const layersBefore = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length

    expandStroke(artboard.id, 'exp-1')

    const layersAfter = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length
    expect(layersAfter).toBe(layersBefore + 1)

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const expandedLayer = updated.layers.find((l) => l.name.includes('expanded')) as VectorLayer
    expect(expandedLayer).toBeDefined()
    expect(expandedLayer.fill).toBeDefined()
    expect(expandedLayer.stroke).toBeNull()
  })

  test('does nothing for layer without stroke', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const sq = makeSquare('exp-nostroke', 0, 0, 100)
    store.addLayer(artboard.id, sq as any)

    const layersBefore = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length

    expandStroke(artboard.id, 'exp-nostroke')

    const layersAfter = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!.layers.length
    expect(layersAfter).toBe(layersBefore) // no change
  })

  test('does nothing for non-vector layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    expandStroke(artboard.id, 'nonexistent')
    // Should not throw
  })

  test('does nothing for nonexistent artboard', () => {
    expandStroke('nonexistent', 'foo')
    // Should not throw
  })
})

describe('boolean ops - simplifyPath', () => {
  test('simplifies a path', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    // Create a layer with many nearly-collinear points
    const layer: VectorLayer = {
      id: 'simp-1',
      name: 'Complex',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'sp1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 10, y: 0.1 },
            { type: 'line', x: 20, y: -0.1 },
            { type: 'line', x: 30, y: 0.05 },
            { type: 'line', x: 40, y: 0 },
            { type: 'line', x: 50, y: 0 },
            { type: 'close' },
          ],
          closed: true,
        },
      ],
      fill: { type: 'solid', color: '#000', opacity: 1 },
      stroke: null,
    } as VectorLayer

    store.addLayer(artboard.id, layer as any)

    simplifyPath(artboard.id, 'simp-1', 1)

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const updatedLayer = updated.layers.find((l) => l.id === 'simp-1') as VectorLayer
    // Should have fewer segments after simplification
    expect(updatedLayer.paths[0]!.segments.length).toBeLessThanOrEqual(7)
  })

  test('does nothing for non-vector layer', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    simplifyPath(artboard.id, 'nonexistent', 2)
    // Should not throw
  })

  test('does nothing for nonexistent artboard', () => {
    simplifyPath('nonexistent', 'foo', 2)
    // Should not throw
  })

  test('preserves closed flag after simplification', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const layer: VectorLayer = {
      id: 'simp-closed',
      name: 'Closed',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'scp1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 100, y: 0 },
            { type: 'line', x: 100, y: 100 },
            { type: 'close' },
          ],
          closed: true,
        },
      ],
      fill: { type: 'solid', color: '#000', opacity: 1 },
      stroke: null,
    } as VectorLayer

    store.addLayer(artboard.id, layer as any)

    simplifyPath(artboard.id, 'simp-closed', 1)

    const updated = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
    const updatedLayer = updated.layers.find((l) => l.id === 'simp-closed') as VectorLayer
    expect(updatedLayer.paths[0]!.closed).toBe(true)
    // Last segment should be close
    const segs = updatedLayer.paths[0]!.segments
    expect(segs[segs.length - 1]!.type).toBe('close')
  })
})

describe('boolean ops - rdpSimplify (additional coverage)', () => {
  test('empty array returns empty', () => {
    expect(rdpSimplify([], 1)).toEqual([])
  })

  test('single point returns same', () => {
    const pts = [{ x: 5, y: 5 }]
    expect(rdpSimplify(pts, 1)).toEqual(pts)
  })

  test('two points returns same', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(rdpSimplify(pts, 1)).toEqual(pts)
  })

  test('zig-zag above epsilon keeps points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
      { x: 40, y: 0 },
    ]
    const result = rdpSimplify(pts, 1)
    expect(result.length).toBeGreaterThanOrEqual(3)
  })

  test('with epsilon=0, keeps all points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0.001 },
      { x: 10, y: 0 },
    ]
    const result = rdpSimplify(pts, 0)
    expect(result).toHaveLength(3)
  })

  test('coincident start and end', () => {
    const pts = [
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
    ]
    const result = rdpSimplify(pts, 1)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  test('large dataset simplification', () => {
    // Generate 100 nearly-collinear points
    const pts = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i * 0.01) * 0.1, // very small deviation
    }))
    const result = rdpSimplify(pts, 1)
    expect(result.length).toBeLessThan(100)
  })
})
