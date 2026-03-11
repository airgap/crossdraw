import { describe, test, expect } from 'bun:test'
import { applyAutoLayout, computeLayerBounds, createDefaultGridConfig, resolveTrackSizes } from '@/layout/auto-layout'
import type {
  GroupLayer,
  VectorLayer,
  RasterLayer,
  TextLayer,
  Layer,
  AutoLayoutConfig,
  GridLayoutConfig,
  GridTrack,
} from '@/types'

// ── Helpers ──

function makeVectorChild(id: string, w: number, h: number, overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: null,
    stroke: null,
    shapeParams: { shapeType: 'rectangle', width: w, height: h },
    ...overrides,
  }
}

function makeRasterChild(id: string, w: number, h: number): RasterLayer {
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: `chunk-${id}`,
    width: w,
    height: h,
  }
}

function makeTextChild(id: string, text: string, fontSize: number): TextLayer {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text,
    fontFamily: 'sans-serif',
    fontSize,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
  }
}

function makeGroup(children: Layer[], config?: AutoLayoutConfig, overrides: Partial<GroupLayer> = {}): GroupLayer {
  return {
    id: 'group-1',
    name: 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children,
    autoLayout: config,
    ...overrides,
  }
}

function makeFlexConfig(
  direction: 'horizontal' | 'vertical',
  overrides: Partial<AutoLayoutConfig> = {},
): AutoLayoutConfig {
  return {
    direction,
    gap: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    alignItems: 'start',
    justifyContent: 'start',
    wrap: false,
    ...overrides,
  }
}

// ── Tests ──

describe('createDefaultGridConfig', () => {
  test('returns valid default grid config', () => {
    const config = createDefaultGridConfig()
    expect(config.columns.length).toBe(2)
    expect(config.rows.length).toBe(1)
    expect(config.columnGap).toBe(8)
    expect(config.rowGap).toBe(8)
    expect(config.alignItems).toBe('stretch')
    expect(config.justifyItems).toBe('stretch')
  })
})

describe('resolveTrackSizes', () => {
  test('resolves px tracks directly', () => {
    const tracks: GridTrack[] = [
      { size: 100, unit: 'px' },
      { size: 200, unit: 'px' },
    ]
    const sizes = resolveTrackSizes(tracks, 500, 0, new Map())
    expect(sizes[0]).toBe(100)
    expect(sizes[1]).toBe(200)
  })

  test('resolves fr tracks proportionally', () => {
    const tracks: GridTrack[] = [
      { size: 1, unit: 'fr' },
      { size: 2, unit: 'fr' },
    ]
    const sizes = resolveTrackSizes(tracks, 300, 0, new Map())
    expect(sizes[0]).toBeCloseTo(100, 5) // 1/3 of 300
    expect(sizes[1]).toBeCloseTo(200, 5) // 2/3 of 300
  })

  test('resolves auto tracks using content sizes', () => {
    const tracks: GridTrack[] = [
      { size: 0, unit: 'auto' },
      { size: 0, unit: 'auto' },
    ]
    const contentSizes = new Map<number, number>()
    contentSizes.set(0, 80)
    contentSizes.set(1, 120)
    const sizes = resolveTrackSizes(tracks, 500, 0, contentSizes)
    expect(sizes[0]).toBe(80)
    expect(sizes[1]).toBe(120)
  })

  test('fr tracks get remaining space after px and auto', () => {
    const tracks: GridTrack[] = [
      { size: 100, unit: 'px' },
      { size: 1, unit: 'fr' },
      { size: 0, unit: 'auto' },
    ]
    const contentSizes = new Map<number, number>()
    contentSizes.set(2, 50)
    // Available = 400, gap between 3 tracks = 2*10 = 20
    // used = 20 (gaps) + 100 (px) + 50 (auto) = 170
    // remaining = 400 - 170 = 230
    const sizes = resolveTrackSizes(tracks, 400, 10, contentSizes)
    expect(sizes[0]).toBe(100)
    expect(sizes[1]).toBeCloseTo(230, 5) // 1fr = all remaining
    expect(sizes[2]).toBe(50)
  })

  test('gaps reduce available space for fr tracks', () => {
    const tracks: GridTrack[] = [
      { size: 1, unit: 'fr' },
      { size: 1, unit: 'fr' },
    ]
    // Available = 200, gap = 20, totalGaps = 20
    // remaining for fr = 200 - 20 = 180
    const sizes = resolveTrackSizes(tracks, 200, 20, new Map())
    expect(sizes[0]).toBeCloseTo(90, 5)
    expect(sizes[1]).toBeCloseTo(90, 5)
  })

  test('auto tracks with no content default to 0', () => {
    const tracks: GridTrack[] = [{ size: 0, unit: 'auto' }]
    const sizes = resolveTrackSizes(tracks, 300, 0, new Map())
    expect(sizes[0]).toBe(0)
  })

  test('no remaining space for fr tracks when px fills everything', () => {
    const tracks: GridTrack[] = [
      { size: 300, unit: 'px' },
      { size: 1, unit: 'fr' },
    ]
    const sizes = resolveTrackSizes(tracks, 300, 0, new Map())
    expect(sizes[0]).toBe(300)
    expect(sizes[1]).toBe(0) // No remaining space
  })
})

describe('computeLayerBounds', () => {
  test('computes bounds for raster layer', () => {
    const raster = makeRasterChild('r1', 200, 150)
    const bounds = computeLayerBounds([raster])
    expect(bounds.get('r1')).toEqual({ width: 200, height: 150 })
  })

  test('computes bounds for text layer', () => {
    const text = makeTextChild('t1', 'Hello', 16)
    const bounds = computeLayerBounds([text])
    const b = bounds.get('t1')!
    // Width = 16 * 5 * 0.6 * 1 = 48
    expect(b.width).toBeCloseTo(48, 5)
    // Height = 1 * 16 * 1.4 * 1 = 22.4
    expect(b.height).toBeCloseTo(22.4, 5)
  })

  test('computes bounds for multi-line text', () => {
    const text = makeTextChild('t1', 'Hello\nWorld', 16)
    const bounds = computeLayerBounds([text])
    const b = bounds.get('t1')!
    // Width = max(5, 5) * 16 * 0.6 = 48
    expect(b.width).toBeCloseTo(48, 5)
    // Height = 2 lines * 16 * 1.4 = 44.8
    expect(b.height).toBeCloseTo(44.8, 5)
  })

  test('computes bounds for group layer recursively', () => {
    const child1 = makeVectorChild('c1', 100, 50)
    const child2 = makeVectorChild('c2', 80, 120)
    const group = makeGroup([child1, child2])
    const bounds = computeLayerBounds([group])
    const b = bounds.get('group-1')!
    expect(b.width).toBe(100) // max of 100, 80
    expect(b.height).toBe(120) // max of 50, 120
  })

  test('computes bounds for vector layer with paths (not shapeParams)', () => {
    const child: VectorLayer = {
      id: 'v1',
      name: 'v1',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 2, scaleY: 3, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'p1',
          closed: true,
          segments: [
            { type: 'move', x: 10, y: 20 },
            { type: 'line', x: 60, y: 20 },
            { type: 'line', x: 60, y: 80 },
            { type: 'line', x: 10, y: 80 },
            { type: 'close' },
          ],
        },
      ],
      fill: null,
      stroke: null,
    }
    const bounds = computeLayerBounds([child])
    const b = bounds.get('v1')!
    // width = (60-10) * 2 = 100
    expect(b.width).toBe(100)
    // height = (80-20) * 3 = 180
    expect(b.height).toBe(180)
  })

  test('computes bounds for vector layer with cubic control points', () => {
    const child: VectorLayer = {
      id: 'v1',
      name: 'v1',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'p1',
          closed: true,
          segments: [
            { type: 'move', x: 50, y: 50 },
            { type: 'cubic', x: 150, y: 50, cp1x: 0, cp1y: -50, cp2x: 200, cp2y: 150 },
          ],
        },
      ],
      fill: null,
      stroke: null,
    }
    const bounds = computeLayerBounds([child])
    const b = bounds.get('v1')!
    // minX = min(50, 0, 200, 150) = 0, maxX = 200
    expect(b.width).toBe(200)
    // minY = min(50, -50, 150, 50) = -50, maxY = 150
    expect(b.height).toBe(200)
  })

  test('computes bounds for vector layer with quadratic control points', () => {
    const child: VectorLayer = {
      id: 'v1',
      name: 'v1',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: 'p1',
          closed: true,
          segments: [
            { type: 'move', x: 50, y: 50 },
            { type: 'quadratic', x: 150, y: 50, cpx: -20, cpy: 200 },
          ],
        },
      ],
      fill: null,
      stroke: null,
    }
    const bounds = computeLayerBounds([child])
    const b = bounds.get('v1')!
    // cpx = -20, so minX = -20
    expect(b.width).toBe(170) // 150 - (-20)
    // cpy = 200, so maxY = 200
    expect(b.height).toBe(150) // 200 - 50
  })

  test('vector layer with no paths and no shapeParams gives 0x0', () => {
    const child: VectorLayer = {
      id: 'v1',
      name: 'v1',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const bounds = computeLayerBounds([child])
    expect(bounds.get('v1')).toEqual({ width: 0, height: 0 })
  })

  test('group with hidden children excludes them from bounds', () => {
    const visible = makeVectorChild('c1', 100, 50)
    const hidden = makeVectorChild('c2', 300, 300)
    hidden.visible = false
    const group = makeGroup([visible, hidden])
    const bounds = computeLayerBounds([group])
    const b = bounds.get('group-1')!
    expect(b.width).toBe(100) // Only visible child counted
    expect(b.height).toBe(50)
  })
})

describe('grid layout', () => {
  test('positions children in a 2-column grid', () => {
    const children = [
      makeVectorChild('c1', 50, 30),
      makeVectorChild('c2', 50, 30),
      makeVectorChild('c3', 50, 30),
      makeVectorChild('c4', 50, 30),
    ]
    const gridConfig: GridLayoutConfig = {
      columns: [
        { size: 1, unit: 'fr' },
        { size: 1, unit: 'fr' },
      ],
      rows: [
        { size: 1, unit: 'fr' },
        { size: 1, unit: 'fr' },
      ],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'start',
      justifyItems: 'start',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    // Children should be arranged in a 2x2 grid
    expect(children[0]!.transform.x).toBe(0)
    expect(children[0]!.transform.y).toBe(0)
    expect(children[1]!.transform.x).toBe(100)
    expect(children[1]!.transform.y).toBe(0)
    expect(children[2]!.transform.x).toBe(0)
    expect(children[2]!.transform.y).toBe(100)
    expect(children[3]!.transform.x).toBe(100)
    expect(children[3]!.transform.y).toBe(100)
  })

  test('grid with center alignment', () => {
    const children = [makeVectorChild('c1', 40, 20)]
    const gridConfig: GridLayoutConfig = {
      columns: [{ size: 1, unit: 'fr' }],
      rows: [{ size: 1, unit: 'fr' }],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'center',
      justifyItems: 'center',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    // Child should be centered in the cell
    expect(children[0]!.transform.x).toBeCloseTo(80, 5) // (200-40)/2
    expect(children[0]!.transform.y).toBeCloseTo(90, 5) // (200-20)/2
  })

  test('grid with end alignment', () => {
    const children = [makeVectorChild('c1', 40, 20)]
    const gridConfig: GridLayoutConfig = {
      columns: [{ size: 1, unit: 'fr' }],
      rows: [{ size: 1, unit: 'fr' }],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'end',
      justifyItems: 'end',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    expect(children[0]!.transform.x).toBeCloseTo(160, 5) // 200-40
    expect(children[0]!.transform.y).toBeCloseTo(180, 5) // 200-20
  })

  test('grid with stretch alignment', () => {
    const children = [makeVectorChild('c1', 40, 20)]
    children[0]!.layoutSizing = { horizontal: 'fill', vertical: 'fill' }
    const gridConfig: GridLayoutConfig = {
      columns: [{ size: 1, unit: 'fr' }],
      rows: [{ size: 1, unit: 'fr' }],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'stretch',
      justifyItems: 'stretch',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    // Child should be positioned at start
    expect(children[0]!.transform.x).toBe(0)
    expect(children[0]!.transform.y).toBe(0)
  })

  test('grid with padding', () => {
    const children = [makeVectorChild('c1', 50, 30)]
    const gridConfig: GridLayoutConfig = {
      columns: [{ size: 1, unit: 'fr' }],
      rows: [{ size: 1, unit: 'fr' }],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'start',
      justifyItems: 'start',
    }
    const config: AutoLayoutConfig = {
      direction: 'horizontal',
      gap: 0,
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 20,
      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    expect(children[0]!.transform.x).toBe(20) // paddingLeft
    expect(children[0]!.transform.y).toBe(10) // paddingTop
  })

  test('grid with explicit placement', () => {
    const c1 = makeVectorChild('c1', 40, 30)
    const c2 = makeVectorChild('c2', 40, 30)
    // Place c2 in column 0 row 0 (before auto-placed c1)
    c2.gridPlacement = { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }

    const gridConfig: GridLayoutConfig = {
      columns: [
        { size: 1, unit: 'fr' },
        { size: 1, unit: 'fr' },
      ],
      rows: [{ size: 1, unit: 'fr' }],
      columnGap: 0,
      rowGap: 0,
      alignItems: 'start',
      justifyItems: 'start',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup([c1, c2], config)
    const bounds = computeLayerBounds([c1, c2])

    applyAutoLayout(group, bounds, 200, 100)

    // c2 is explicitly placed at (0,0), c1 should auto-place at (1,0)
    expect(c2.transform.x).toBe(0)
    expect(c1.transform.x).toBe(100) // Second column
  })

  test('grid with implicit rows (more children than grid cells)', () => {
    const children = [makeVectorChild('c1', 40, 30), makeVectorChild('c2', 40, 30), makeVectorChild('c3', 40, 30)]
    const gridConfig: GridLayoutConfig = {
      columns: [
        { size: 1, unit: 'fr' },
        { size: 1, unit: 'fr' },
      ],
      rows: [{ size: 1, unit: 'fr' }], // Only 1 row defined
      columnGap: 0,
      rowGap: 0,
      alignItems: 'start',
      justifyItems: 'start',
    }
    const config: AutoLayoutConfig = {
      ...makeFlexConfig('horizontal'),
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 200)

    // Third child should be in second row
    expect(children[0]!.transform.y).toBe(0) // Row 0
    expect(children[1]!.transform.y).toBe(0) // Row 0
    expect(children[2]!.transform.y).toBeGreaterThan(0) // Row 1 (implicit)
  })

  test('grid with hug sizing returns correct dimensions', () => {
    const children = [makeVectorChild('c1', 50, 30), makeVectorChild('c2', 50, 30)]
    const gridConfig: GridLayoutConfig = {
      columns: [
        { size: 80, unit: 'px' },
        { size: 80, unit: 'px' },
      ],
      rows: [{ size: 50, unit: 'px' }],
      columnGap: 10,
      rowGap: 0,
      alignItems: 'start',
      justifyItems: 'start',
    }
    const config: AutoLayoutConfig = {
      direction: 'horizontal',
      gap: 0,
      paddingTop: 5,
      paddingRight: 5,
      paddingBottom: 5,
      paddingLeft: 5,
      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
      layoutMode: 'grid',
      gridConfig,
    }
    const group = makeGroup(children, config)
    group.layoutSizing = { horizontal: 'hug', vertical: 'hug' }
    const bounds = computeLayerBounds(children)

    const result = applyAutoLayout(group, bounds, 500, 500)
    // hugWidth = 5 + 80 + 10 + 80 + 5 = 180
    expect(result.groupWidth).toBe(180)
    // hugHeight = 5 + 50 + 5 = 60
    expect(result.groupHeight).toBe(60)
  })
})

describe('vertical layout fill sizing', () => {
  test('fill children share remaining vertical space', () => {
    const c1 = makeVectorChild('c1', 100, 50)
    const c2 = makeVectorChild('c2', 100, 10)
    c2.layoutSizing = { horizontal: 'fixed', vertical: 'fill' }
    const c3 = makeVectorChild('c3', 100, 10)
    c3.layoutSizing = { horizontal: 'fixed', vertical: 'fill' }

    const config = makeFlexConfig('vertical', { gap: 0 })
    const group = makeGroup([c1, c2, c3], config)
    const bounds = computeLayerBounds([c1, c2, c3])

    // Available = 300, fixed = 50, remaining = 250, 2 fill = 125 each
    applyAutoLayout(group, bounds, 200, 300)

    expect(c1.transform.y).toBe(0)
    expect(c2.transform.y).toBe(50)
    expect(c3.transform.y).toBe(175) // 50 + 125
  })
})

describe('vertical layout space-between', () => {
  test('distributes gaps evenly between children', () => {
    const children = [makeVectorChild('c1', 100, 30), makeVectorChild('c2', 100, 30), makeVectorChild('c3', 100, 30)]
    const config = makeFlexConfig('vertical', { justifyContent: 'space-between' })
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    // Available = 300, total child height = 90
    // gap = (300 - 90) / 2 = 105
    applyAutoLayout(group, bounds, 200, 300)

    expect(children[0]!.transform.y).toBe(0)
    expect(children[1]!.transform.y).toBeCloseTo(135, 5) // 0 + 30 + 105
    expect(children[2]!.transform.y).toBeCloseTo(270, 5) // 135 + 30 + 105
  })
})

describe('vertical layout end alignment on cross-axis', () => {
  test('aligns children to right edge', () => {
    const children = [makeVectorChild('c1', 60, 30), makeVectorChild('c2', 100, 30)]
    const config = makeFlexConfig('vertical', { alignItems: 'end' })
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    applyAutoLayout(group, bounds, 200, 300)

    // c1: x = 200 - 60 = 140
    expect(children[0]!.transform.x).toBe(140)
    // c2: x = 200 - 100 = 100
    expect(children[1]!.transform.x).toBe(100)
  })
})

describe('vertical layout stretch on cross-axis', () => {
  test('stretches children to full width', () => {
    const c1 = makeVectorChild('c1', 60, 30)
    c1.layoutSizing = { horizontal: 'fill', vertical: 'fixed' }
    const config = makeFlexConfig('vertical', { alignItems: 'stretch' })
    const group = makeGroup([c1], config)
    const bounds = computeLayerBounds([c1])

    applyAutoLayout(group, bounds, 200, 300)

    // Stretch should position at paddingLeft (0)
    expect(c1.transform.x).toBe(0)
  })
})

describe('horizontal layout stretch on cross-axis', () => {
  test('stretches children to full height', () => {
    const c1 = makeVectorChild('c1', 60, 30)
    c1.layoutSizing = { horizontal: 'fixed', vertical: 'fill' }
    const config = makeFlexConfig('horizontal', { alignItems: 'stretch' })
    const group = makeGroup([c1], config)
    const bounds = computeLayerBounds([c1])

    applyAutoLayout(group, bounds, 200, 300)

    expect(c1.transform.y).toBe(0)
  })
})

describe('empty visible children', () => {
  test('returns padding-only dimensions for empty group', () => {
    const config: AutoLayoutConfig = {
      direction: 'horizontal',
      gap: 10,
      paddingTop: 15,
      paddingRight: 20,
      paddingBottom: 15,
      paddingLeft: 20,
      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
    }
    const group = makeGroup([], config)
    const bounds = new Map<string, { width: number; height: number }>()

    const result = applyAutoLayout(group, bounds, 300, 200)
    expect(result.groupWidth).toBe(40) // paddingLeft + paddingRight
    expect(result.groupHeight).toBe(30) // paddingTop + paddingBottom
  })

  test('all children hidden returns padding-only dimensions', () => {
    const hidden = makeVectorChild('c1', 100, 50)
    hidden.visible = false
    const config = makeFlexConfig('horizontal', {
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 10,
    })
    const group = makeGroup([hidden], config)
    const bounds = computeLayerBounds([hidden])

    const result = applyAutoLayout(group, bounds, 300, 200)
    expect(result.groupWidth).toBe(20)
    expect(result.groupHeight).toBe(20)
  })
})

describe('horizontal layout justify end', () => {
  test('pushes children to right', () => {
    const children = [makeVectorChild('c1', 50, 50), makeVectorChild('c2', 50, 50)]
    const config = makeFlexConfig('horizontal', { justifyContent: 'end' })
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    // Total content = 100, available = 300
    applyAutoLayout(group, bounds, 300, 100)

    expect(children[0]!.transform.x).toBe(200) // 300 - 100
    expect(children[1]!.transform.x).toBe(250) // 200 + 50
  })
})

describe('vertical layout hug sizing', () => {
  test('returns hug dimensions for vertical layout', () => {
    const children = [makeVectorChild('c1', 80, 40), makeVectorChild('c2', 60, 50)]
    const config = makeFlexConfig('vertical', {
      gap: 10,
      paddingTop: 5,
      paddingRight: 5,
      paddingBottom: 5,
      paddingLeft: 5,
    })
    const group = makeGroup(children, config)
    group.layoutSizing = { horizontal: 'hug', vertical: 'hug' }
    const bounds = computeLayerBounds(children)

    const result = applyAutoLayout(group, bounds, 500, 500)

    // hugWidth = 5 + max(80, 60) + 5 = 90
    expect(result.groupWidth).toBe(90)
    // hugHeight = 5 + (40 + 50 + 10) + 5 = 110
    expect(result.groupHeight).toBe(110)
  })
})

describe('vertical layout center justify', () => {
  test('centers children vertically', () => {
    const children = [makeVectorChild('c1', 100, 30)]
    const config = makeFlexConfig('vertical', { justifyContent: 'center' })
    const group = makeGroup(children, config)
    const bounds = computeLayerBounds(children)

    // totalContentHeight = 30, available = 200
    // offset = (200 - 30) / 2 = 85
    applyAutoLayout(group, bounds, 200, 200)
    expect(children[0]!.transform.y).toBeCloseTo(85, 5)
  })
})
