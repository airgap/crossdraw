import { describe, test, expect, afterAll } from 'bun:test'
import type { DesignDocument, Artboard, VectorLayer, RasterLayer, TextLayer, Transform, Segment, Path } from '@/types'

// Mock Path2D and OffscreenCanvas for bun:test (no DOM)
// These must be set before SpatialIndex is imported since hit-test.ts uses them at call time.
class MockPath2D {
  private _commands: string[] = []
  constructor(svgPath?: string) {
    if (svgPath) this._commands.push(`init:${svgPath}`)
  }
  moveTo(x: number, y: number) {
    this._commands.push(`moveTo(${x},${y})`)
  }
  lineTo(x: number, y: number) {
    this._commands.push(`lineTo(${x},${y})`)
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this._commands.push(`bezierCurveTo(${cp1x},${cp1y},${cp2x},${cp2y},${x},${y})`)
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this._commands.push(`quadraticCurveTo(${cpx},${cpy},${x},${y})`)
  }
  closePath() {
    this._commands.push('closePath')
  }
  addPath(path: MockPath2D) {
    this._commands.push(`addPath(${(path as any)._commands.join(';')})`)
  }
}

class MockCanvasCtx {
  lineWidth = 1
  globalAlpha = 1
  globalCompositeOperation = 'source-over'
  fillStyle = '#000'
  strokeStyle = '#000'
  isPointInPath(_path: any, _x: number, _y: number) {
    return true
  }
  isPointInStroke(_path: any, _x: number, _y: number) {
    return true
  }
  getImageData() {
    return { data: new Uint8ClampedArray(0), width: 0, height: 0 }
  }
  putImageData() {}
  drawImage() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  closePath() {}
  fill() {}
  stroke() {}
  save() {}
  restore() {}
  setTransform() {}
  scale() {}
  translate() {}
  rotate() {}
  clearRect() {}
  fillRect() {}
  arc() {}
  rect() {}
  clip() {}
}

class MockOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(_type: string) {
    return new MockCanvasCtx()
  }
}

const origPath2D = globalThis.Path2D
const origOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  if (origPath2D !== undefined) {
    globalThis.Path2D = origPath2D
  } else {
    delete (globalThis as any).Path2D
  }
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})
;(globalThis as any).Path2D = MockPath2D
;(globalThis as any).OffscreenCanvas = MockOffscreenCanvas

import { SpatialIndex } from '@/math/hit-test'

// ---- Helpers ----

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }
}

const baseLayerDefaults = {
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal' as const,
  effects: [],
}

function makePath(segments: Segment[], closed = false): Path {
  return { id: 'p1', segments, closed }
}

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: 'v1',
    name: 'Vector',
    type: 'vector',
    ...baseLayerDefaults,
    transform: makeTransform(),
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  }
}

function makeRasterLayer(overrides: Partial<RasterLayer> = {}): RasterLayer {
  return {
    id: 'r1',
    name: 'Raster',
    type: 'raster',
    ...baseLayerDefaults,
    transform: makeTransform(),
    imageChunkId: 'img1',
    width: 100,
    height: 100,
    ...overrides,
  }
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 't1',
    name: 'Text',
    type: 'text',
    ...baseLayerDefaults,
    transform: makeTransform(),
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

function makeArtboard(overrides: Partial<Artboard> = {}): Artboard {
  return {
    id: 'ab1',
    name: 'Artboard',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    layers: [],
    ...overrides,
  }
}

function makeDoc(artboards: Artboard[]): DesignDocument {
  return {
    id: 'doc1',
    metadata: {
      title: 'Test',
      author: 'Test',
      created: '2024-01-01',
      modified: '2024-01-01',
      colorspace: 'srgb',
      width: 800,
      height: 600,
    },
    artboards,
    assets: { gradients: [], patterns: [], colors: [] },
  }
}

// ---- SpatialIndex Tests ----

describe('SpatialIndex', () => {
  describe('rebuild', () => {
    test('creates an index from a document with layers', () => {
      const raster = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 10, y: 10 }),
        width: 50,
        height: 50,
      })
      const artboard = makeArtboard({ layers: [raster] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Should find the raster layer at its position
      const hits = index.hitTest(35, 35, doc)
      expect(hits.length).toBe(1)
      expect(hits[0]!.layer.id).toBe('r1')
    })

    test('skips invisible layers', () => {
      const hidden = makeRasterLayer({ id: 'hidden', visible: false })
      const artboard = makeArtboard({ layers: [hidden] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(50, 50, doc)
      expect(hits.length).toBe(0)
    })

    test('handles empty document', () => {
      const doc = makeDoc([])
      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(0, 0, doc)
      expect(hits.length).toBe(0)
    })

    test('handles artboard with no layers', () => {
      const artboard = makeArtboard({ layers: [] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(0, 0, doc)
      expect(hits.length).toBe(0)
    })

    test('rebuilding clears previous data', () => {
      const raster = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 10, y: 10 }),
        width: 50,
        height: 50,
      })
      const artboard = makeArtboard({ layers: [raster] })
      const doc1 = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc1)

      // Rebuild with empty doc
      const doc2 = makeDoc([makeArtboard({ layers: [] })])
      index.rebuild(doc2)

      const hits = index.hitTest(35, 35, doc2)
      expect(hits.length).toBe(0)
    })

    test('skips layers with empty bbox (vector with no paths)', () => {
      const emptyVector = makeVectorLayer({ id: 'empty', paths: [] })
      const artboard = makeArtboard({ layers: [emptyVector] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(0, 0, doc)
      expect(hits.length).toBe(0)
    })
  })

  describe('hitTest', () => {
    test('returns empty array when no candidates found', () => {
      const raster = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 100, y: 100 }),
        width: 50,
        height: 50,
      })
      const artboard = makeArtboard({ layers: [raster] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Test far from the layer
      const hits = index.hitTest(0, 0, doc)
      expect(hits.length).toBe(0)
    })

    test('returns raster layers that pass AABB test', () => {
      const raster = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 100,
        height: 100,
      })
      const artboard = makeArtboard({ layers: [raster] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(50, 50, doc)
      expect(hits.length).toBe(1)
      expect(hits[0]!.layer.id).toBe('r1')
      expect(hits[0]!.artboard.id).toBe('ab1')
    })

    test('returns layers sorted topmost first (highest index)', () => {
      const bottom = makeRasterLayer({
        id: 'bottom',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 200,
        height: 200,
      })
      const top = makeRasterLayer({
        id: 'top',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 200,
        height: 200,
      })
      const artboard = makeArtboard({ layers: [bottom, top] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      const hits = index.hitTest(50, 50, doc)
      expect(hits.length).toBe(2)
      expect(hits[0]!.layer.id).toBe('top') // higher index = topmost
      expect(hits[1]!.layer.id).toBe('bottom')
    })

    test('skips layers that became invisible after rebuild', () => {
      const layer = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 100,
        height: 100,
      })
      const artboard = makeArtboard({ layers: [layer] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Now make the layer invisible in the doc (without rebuilding)
      layer.visible = false
      const hits = index.hitTest(50, 50, doc)
      expect(hits.length).toBe(0)
    })

    test('handles multiple artboards', () => {
      const layer1 = makeRasterLayer({
        id: 'l1',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 100,
        height: 100,
      })
      const layer2 = makeRasterLayer({
        id: 'l2',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 100,
        height: 100,
      })
      const ab1 = makeArtboard({ id: 'ab1', x: 0, y: 0, layers: [layer1] })
      const ab2 = makeArtboard({ id: 'ab2', x: 500, y: 0, layers: [layer2] })
      const doc = makeDoc([ab1, ab2])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Hit on first artboard
      const hits1 = index.hitTest(50, 50, doc)
      expect(hits1.length).toBe(1)
      expect(hits1[0]!.layer.id).toBe('l1')

      // Hit on second artboard
      const hits2 = index.hitTest(550, 50, doc)
      expect(hits2.length).toBe(1)
      expect(hits2[0]!.layer.id).toBe('l2')
    })

    test('handles artboard removed from doc after rebuild', () => {
      const layer = makeRasterLayer({
        id: 'r1',
        transform: makeTransform({ x: 0, y: 0 }),
        width: 100,
        height: 100,
      })
      const artboard = makeArtboard({ id: 'ab1', layers: [layer] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Remove the artboard from doc
      const emptyDoc = makeDoc([])
      const hits = index.hitTest(50, 50, emptyDoc)
      // Candidates exist in the tree but artboard won't be found
      expect(hits.length).toBe(0)
    })

    test('text layer fails precise test (type !== vector and !== raster)', () => {
      const textLayer = makeTextLayer({
        id: 't1',
        text: 'Hello World',
        fontSize: 20,
        transform: makeTransform({ x: 10, y: 10 }),
      })
      const artboard = makeArtboard({ layers: [textLayer] })
      const doc = makeDoc([artboard])

      const index = new SpatialIndex()
      index.rebuild(doc)

      // Text layer bbox should exist but preciseHitTest returns false for non-vector/non-raster
      const hits = index.hitTest(15, 15, doc)
      // Text layers return false from preciseHitTest (type !== 'vector' and type !== 'raster')
      expect(hits.length).toBe(0)
    })
  })
})

describe('SpatialIndex with vector layers and precise hit test', () => {
  test('vector layer with fill is hit tested precisely', () => {
    // Create a filled rect vector layer that covers 0,0 to 100,100
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const layer = makeVectorLayer({
      id: 'filled-rect',
      paths: [makePath(segments, true)],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    })
    const artboard = makeArtboard({ layers: [layer] })
    const doc = makeDoc([artboard])

    const index = new SpatialIndex()
    index.rebuild(doc)

    // Hit inside the rect
    const hits = index.hitTest(50, 50, doc)
    expect(hits.length).toBe(1)
    expect(hits[0]!.layer.id).toBe('filled-rect')
  })

  test('vector layer with stroke only is hit tested via isPointInStroke', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const layer = makeVectorLayer({
      id: 'stroked-rect',
      paths: [makePath(segments, true)],
      fill: null,
      stroke: {
        width: 10,
        color: '#000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const artboard = makeArtboard({ layers: [layer] })
    const doc = makeDoc([artboard])

    const index = new SpatialIndex()
    index.rebuild(doc)

    // Hit on the stroke edge (our mock isPointInStroke returns true)
    const hitsOnStroke = index.hitTest(50, 0, doc)
    expect(hitsOnStroke.length).toBe(1)
    expect(hitsOnStroke[0]!.layer.id).toBe('stroked-rect')
  })

  test('vector layer with no fill and no stroke returns false', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'close' },
    ]
    const layer = makeVectorLayer({
      id: 'no-fill-no-stroke',
      paths: [makePath(segments, true)],
      fill: null,
      stroke: null,
    })
    const artboard = makeArtboard({ layers: [layer] })
    const doc = makeDoc([artboard])

    const index = new SpatialIndex()
    index.rebuild(doc)

    // No fill, no stroke => precise hit test returns false
    const hits = index.hitTest(50, 50, doc)
    expect(hits.length).toBe(0)
  })

  test('vector layer with empty paths returns false', () => {
    const layer = makeVectorLayer({
      id: 'empty-paths',
      paths: [],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    })
    const artboard = makeArtboard({ layers: [layer] })
    const doc = makeDoc([artboard])

    const index = new SpatialIndex()
    index.rebuild(doc)

    // Empty paths => empty bbox => not indexed => no hit
    const hits = index.hitTest(0, 0, doc)
    expect(hits.length).toBe(0)
  })

  test('vector layer hit test accounts for artboard and layer transform offsets', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'line', x: 50, y: 50 },
      { type: 'line', x: 0, y: 50 },
      { type: 'close' },
    ]
    const layer = makeVectorLayer({
      id: 'offset-rect',
      paths: [makePath(segments, true)],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      transform: makeTransform({ x: 100, y: 100 }),
    })
    const artboard = makeArtboard({ x: 50, y: 50, layers: [layer] })
    const doc = makeDoc([artboard])

    const index = new SpatialIndex()
    index.rebuild(doc)

    // The layer covers doc coords: (150,150) to (200,200)
    // Hit in the center
    const hits = index.hitTest(175, 175, doc)
    expect(hits.length).toBe(1)

    // Miss outside
    const misses = index.hitTest(100, 100, doc)
    expect(misses.length).toBe(0)
  })
})
