import { describe, test, expect } from 'bun:test'
import { applyConstraints, applyArtboardResize, DEFAULT_CONSTRAINTS, type Constraints } from '@/tools/constraints'
import type { Layer, Artboard, VectorLayer, RasterLayer } from '@/types'

// ── Helpers ──

function makeVectorLayer(
  id: string,
  x: number,
  y: number,
  opts: { shapeW?: number; shapeH?: number } = {},
): VectorLayer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: null,
    stroke: null,
    shapeParams: opts.shapeW ? { shapeType: 'rectangle', width: opts.shapeW, height: opts.shapeH ?? 100 } : undefined,
  }
}

function makeRasterLayer(id: string, x: number, y: number, w: number, h: number): RasterLayer {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: 'chunk-1',
    width: w,
    height: h,
  }
}

function makeArtboard(layers: Layer[], width = 400, height = 300): Artboard {
  return {
    id: 'artboard-1',
    name: 'Test Artboard',
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor: '#ffffff',
    layers,
  }
}

// ── Tests ──

describe('DEFAULT_CONSTRAINTS', () => {
  test('defaults to left/top', () => {
    expect(DEFAULT_CONSTRAINTS.horizontal).toBe('left')
    expect(DEFAULT_CONSTRAINTS.vertical).toBe('top')
  })
})

describe('applyConstraints horizontal', () => {
  test('left: x stays the same', () => {
    const layer = makeVectorLayer('l1', 50, 20, { shapeW: 80, shapeH: 40 })
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'top' }, 400, 300, 600, 300)
    expect(result.x).toBe(50)
    expect(result.scaleX).toBe(1)
  })

  test('right: maintains distance from right edge', () => {
    const layer = makeVectorLayer('l1', 300, 20, { shapeW: 80, shapeH: 40 })
    // Old: layer is at x=300, right edge of artboard at 400 => distance from right = 400 - 300 = 100
    const result = applyConstraints(layer, { horizontal: 'right', vertical: 'top' }, 400, 300, 600, 300)
    // New: x = 600 - (400 - 300) = 500
    expect(result.x).toBe(500)
  })

  test('left-right: stretches to fill', () => {
    const layer = makeVectorLayer('l1', 20, 0, { shapeW: 80, shapeH: 40 })
    // Old artboard width 400, layer at x=20, layerW=80, scaleX=1
    // rightDist = 400 - (20 + 80*1) = 300
    // newW = 600 - 20 - 300 = 280
    // scaleX = 1 * (280 / (80*1)) = 3.5
    const result = applyConstraints(layer, { horizontal: 'left-right', vertical: 'top' }, 400, 300, 600, 300)
    expect(result.x).toBe(20) // Left stays
    expect(result.scaleX).toBeCloseTo(3.5, 5)
  })

  test('center: maintains proportional center position', () => {
    const layer = makeVectorLayer('l1', 160, 0, { shapeW: 80, shapeH: 40 })
    // cx = 160 + (80*1)/2 = 200
    // cxRatio = 200/400 = 0.5
    // new x = 0.5 * 600 - (80*1)/2 = 300 - 40 = 260
    const result = applyConstraints(layer, { horizontal: 'center', vertical: 'top' }, 400, 300, 600, 300)
    expect(result.x).toBeCloseTo(260, 5)
  })

  test('scale: scales position and size proportionally', () => {
    const layer = makeVectorLayer('l1', 100, 0, { shapeW: 80, shapeH: 40 })
    // xRatio = 100/400 = 0.25
    // new x = 0.25 * 600 = 150
    // scaleX = 1 * (600/400) = 1.5
    const result = applyConstraints(layer, { horizontal: 'scale', vertical: 'top' }, 400, 300, 600, 300)
    expect(result.x).toBeCloseTo(150, 5)
    expect(result.scaleX).toBeCloseTo(1.5, 5)
  })
})

describe('applyConstraints vertical', () => {
  test('top: y stays the same', () => {
    const layer = makeVectorLayer('l1', 0, 50, { shapeW: 80, shapeH: 40 })
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'top' }, 400, 300, 400, 500)
    expect(result.y).toBe(50)
  })

  test('bottom: maintains distance from bottom edge', () => {
    const layer = makeVectorLayer('l1', 0, 200, { shapeW: 80, shapeH: 40 })
    // distance from bottom = 300 - 200 = 100
    // new y = 500 - 100 = 400
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'bottom' }, 400, 300, 400, 500)
    expect(result.y).toBe(400)
  })

  test('top-bottom: stretches height', () => {
    const layer = makeVectorLayer('l1', 0, 30, { shapeW: 80, shapeH: 40 })
    // bottomDist = 300 - (30 + 40*1) = 230
    // newH = 500 - 30 - 230 = 240
    // scaleY = 1 * (240 / 40) = 6
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'top-bottom' }, 400, 300, 400, 500)
    expect(result.y).toBe(30)
    expect(result.scaleY).toBeCloseTo(6, 5)
  })

  test('center: maintains proportional center position vertically', () => {
    const layer = makeVectorLayer('l1', 0, 130, { shapeW: 80, shapeH: 40 })
    // cy = 130 + (40*1)/2 = 150
    // cyRatio = 150/300 = 0.5
    // new y = 0.5 * 500 - (40*1)/2 = 250 - 20 = 230
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'center' }, 400, 300, 400, 500)
    expect(result.y).toBeCloseTo(230, 5)
  })

  test('scale: scales position and size vertically', () => {
    const layer = makeVectorLayer('l1', 0, 60, { shapeW: 80, shapeH: 40 })
    // yRatio = 60/300 = 0.2
    // new y = 0.2 * 500 = 100
    // scaleY = 1 * (500/300) = 1.6667
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'scale' }, 400, 300, 400, 500)
    expect(result.y).toBeCloseTo(100, 5)
    expect(result.scaleY).toBeCloseTo(500 / 300, 4)
  })
})

describe('applyConstraints with raster layer', () => {
  test('raster layer uses width/height for sizing', () => {
    const layer = makeRasterLayer('r1', 50, 50, 200, 100)
    const result = applyConstraints(layer, { horizontal: 'left-right', vertical: 'top-bottom' }, 400, 300, 600, 500)
    // rightDist = 400 - (50 + 200*1) = 150
    // newW = 600 - 50 - 150 = 400
    // scaleX = 1 * (400 / 200) = 2
    expect(result.scaleX).toBeCloseTo(2, 5)
    // bottomDist = 300 - (50 + 100*1) = 150
    // newH = 500 - 50 - 150 = 300
    // scaleY = 1 * (300 / 100) = 3
    expect(result.scaleY).toBeCloseTo(3, 5)
  })
})

describe('applyConstraints with no shapeParams (fallback width/height 100)', () => {
  test('vector layer without shapeParams uses default 100x100', () => {
    const layer = makeVectorLayer('l1', 50, 50)
    // No shapeParams => getLayerWidth returns 100
    const result = applyConstraints(layer, { horizontal: 'scale', vertical: 'scale' }, 400, 300, 800, 600)
    expect(result.x).toBeCloseTo(100, 5) // 50/400 * 800
    expect(result.scaleX).toBeCloseTo(2, 5)
  })
})

describe('applyArtboardResize', () => {
  test('applies constraints to all layers', () => {
    const l1 = makeVectorLayer('l1', 0, 0, { shapeW: 50, shapeH: 50 })
    const l2 = makeVectorLayer('l2', 350, 250, { shapeW: 50, shapeH: 50 })
    const artboard = makeArtboard([l1, l2], 400, 300)

    const constraintsMap = new Map<string, Constraints>()
    constraintsMap.set('l1', { horizontal: 'left', vertical: 'top' })
    constraintsMap.set('l2', { horizontal: 'right', vertical: 'bottom' })

    const updates = applyArtboardResize(artboard, 600, 500, constraintsMap)
    expect(updates.length).toBe(2)

    const u1 = updates.find((u) => u.layerId === 'l1')!
    expect(u1.transform.x).toBe(0)
    expect(u1.transform.y).toBe(0)

    const u2 = updates.find((u) => u.layerId === 'l2')!
    // right: x = 600 - (400 - 350) = 550
    expect(u2.transform.x).toBe(550)
    // bottom: y = 500 - (300 - 250) = 450
    expect(u2.transform.y).toBe(450)
  })

  test('skips layers without constraints', () => {
    const l1 = makeVectorLayer('l1', 0, 0, { shapeW: 50, shapeH: 50 })
    const l2 = makeVectorLayer('l2', 100, 100, { shapeW: 50, shapeH: 50 })
    const artboard = makeArtboard([l1, l2], 400, 300)

    const constraintsMap = new Map<string, Constraints>()
    constraintsMap.set('l1', { horizontal: 'left', vertical: 'top' })
    // l2 has no constraints

    const updates = applyArtboardResize(artboard, 600, 500, constraintsMap)
    expect(updates.length).toBe(1)
    expect(updates[0]!.layerId).toBe('l1')
  })

  test('empty artboard returns empty updates', () => {
    const artboard = makeArtboard([], 400, 300)
    const updates = applyArtboardResize(artboard, 600, 500, new Map())
    expect(updates.length).toBe(0)
  })
})

describe('combined horizontal and vertical constraints', () => {
  test('right + bottom: moves to new right-bottom', () => {
    const layer = makeVectorLayer('l1', 350, 250, { shapeW: 50, shapeH: 50 })
    const result = applyConstraints(layer, { horizontal: 'right', vertical: 'bottom' }, 400, 300, 600, 500)
    expect(result.x).toBe(550) // 600 - (400 - 350)
    expect(result.y).toBe(450) // 500 - (300 - 250)
  })

  test('scale + scale: proportional resize', () => {
    const layer = makeVectorLayer('l1', 100, 75, { shapeW: 50, shapeH: 50 })
    const result = applyConstraints(layer, { horizontal: 'scale', vertical: 'scale' }, 400, 300, 800, 600)
    // x = 100/400 * 800 = 200
    expect(result.x).toBeCloseTo(200, 5)
    // y = 75/300 * 600 = 150
    expect(result.y).toBeCloseTo(150, 5)
    expect(result.scaleX).toBeCloseTo(2, 5)
    expect(result.scaleY).toBeCloseTo(2, 5)
  })
})
