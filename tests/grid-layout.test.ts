import { describe, test, expect } from 'bun:test'
import { applyAutoLayout, resolveTrackSizes, createDefaultGridConfig } from '../src/layout/auto-layout'
import type { GroupLayer, VectorLayer, Layer, GridLayoutConfig } from '../src/types/document'

function makeVectorChild(id: string, name: string, w: number, h: number): VectorLayer {
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
    paths: [],
    fill: null,
    stroke: null,
    shapeParams: { shapeType: 'rectangle', width: w, height: h },
  }
}

function makeGridGroup(children: Layer[], gridConfig: GridLayoutConfig, padding = 0): GroupLayer {
  return {
    id: 'grid-group',
    name: 'Grid Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children,
    autoLayout: {
      direction: 'horizontal',
      gap: 0,
      paddingTop: padding,
      paddingRight: padding,
      paddingBottom: padding,
      paddingLeft: padding,
      alignItems: 'start',
      justifyContent: 'start',
      wrap: false,
      layoutMode: 'grid',
      gridConfig,
    },
  }
}

function makeBoundsMap(children: Layer[]): Map<string, { width: number; height: number }> {
  const map = new Map<string, { width: number; height: number }>()
  for (const child of children) {
    if (child.type === 'vector' && child.shapeParams) {
      map.set(child.id, { width: child.shapeParams.width, height: child.shapeParams.height })
    }
  }
  return map
}

describe('CSS Grid Layout Engine', () => {
  describe('resolveTrackSizes', () => {
    test('equal fr columns distribute space evenly', () => {
      const tracks = [
        { size: 1, unit: 'fr' as const },
        { size: 1, unit: 'fr' as const },
        { size: 1, unit: 'fr' as const },
      ]
      const sizes = resolveTrackSizes(tracks, 300, 0, new Map())
      expect(sizes[0]).toBe(100)
      expect(sizes[1]).toBe(100)
      expect(sizes[2]).toBe(100)
    })

    test('unequal fr columns distribute space proportionally', () => {
      const tracks = [
        { size: 1, unit: 'fr' as const },
        { size: 2, unit: 'fr' as const },
      ]
      const sizes = resolveTrackSizes(tracks, 300, 0, new Map())
      expect(sizes[0]).toBe(100)
      expect(sizes[1]).toBe(200)
    })

    test('mixed px and fr tracks', () => {
      const tracks = [
        { size: 100, unit: 'px' as const },
        { size: 1, unit: 'fr' as const },
        { size: 1, unit: 'fr' as const },
      ]
      const sizes = resolveTrackSizes(tracks, 400, 0, new Map())
      expect(sizes[0]).toBe(100) // fixed px
      expect(sizes[1]).toBe(150) // (400 - 100) / 2
      expect(sizes[2]).toBe(150)
    })

    test('auto tracks use content size', () => {
      const tracks = [
        { size: 0, unit: 'auto' as const },
        { size: 1, unit: 'fr' as const },
      ]
      const contentSizes = new Map<number, number>()
      contentSizes.set(0, 80)
      const sizes = resolveTrackSizes(tracks, 400, 0, contentSizes)
      expect(sizes[0]).toBe(80)
      expect(sizes[1]).toBe(320) // 400 - 80
    })

    test('gap is subtracted from available space for fr tracks', () => {
      const tracks = [
        { size: 1, unit: 'fr' as const },
        { size: 1, unit: 'fr' as const },
      ]
      const sizes = resolveTrackSizes(tracks, 200, 20, new Map())
      // Available after gaps: 200 - 20 = 180, split evenly = 90
      expect(sizes[0]).toBe(90)
      expect(sizes[1]).toBe(90)
    })
  })

  describe('auto-placement', () => {
    test('children auto-placed in order, row by row', () => {
      const children = [
        makeVectorChild('a', 'A', 40, 40),
        makeVectorChild('b', 'B', 40, 40),
        makeVectorChild('c', 'C', 40, 40),
        makeVectorChild('d', 'D', 40, 40),
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
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // 2x2 grid, 200x200, each cell is 100x100
      // A at (0,0), B at (100,0), C at (0,100), D at (100,100)
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)
      expect(children[1]!.transform.x).toBe(100)
      expect(children[1]!.transform.y).toBe(0)
      expect(children[2]!.transform.x).toBe(0)
      expect(children[2]!.transform.y).toBe(100)
      expect(children[3]!.transform.x).toBe(100)
      expect(children[3]!.transform.y).toBe(100)
    })

    test('auto-placement wraps to implicit rows when grid is full', () => {
      const children = [
        makeVectorChild('a', 'A', 40, 40),
        makeVectorChild('b', 'B', 40, 40),
        makeVectorChild('c', 'C', 40, 40),
      ]
      const gridConfig: GridLayoutConfig = {
        columns: [
          { size: 1, unit: 'fr' },
          { size: 1, unit: 'fr' },
        ],
        rows: [{ size: 50, unit: 'px' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'start',
        justifyItems: 'start',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // Row 0: A at col 0, B at col 1
      // Row 1 (implicit auto row): C at col 0
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)
      expect(children[1]!.transform.x).toBe(100)
      expect(children[1]!.transform.y).toBe(0)
      expect(children[2]!.transform.x).toBe(0)
      expect(children[2]!.transform.y).toBe(50) // after the 50px first row
    })
  })

  describe('explicit grid placement', () => {
    test('children placed at specified grid positions', () => {
      const children = [makeVectorChild('a', 'A', 40, 40), makeVectorChild('b', 'B', 40, 40)]
      // Place B at (0,0) and A at (1,1) - reversed from source order
      children[0]!.gridPlacement = { column: 1, row: 1, columnSpan: 1, rowSpan: 1 }
      children[1]!.gridPlacement = { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }

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
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // A placed at col 1, row 1 => (100, 100)
      expect(children[0]!.transform.x).toBe(100)
      expect(children[0]!.transform.y).toBe(100)
      // B placed at col 0, row 0 => (0, 0)
      expect(children[1]!.transform.x).toBe(0)
      expect(children[1]!.transform.y).toBe(0)
    })

    test('auto-placed children skip occupied cells', () => {
      const children = [
        makeVectorChild('a', 'A', 40, 40),
        makeVectorChild('b', 'B', 40, 40),
        makeVectorChild('c', 'C', 40, 40),
      ]
      // Place A explicitly at (0,0)
      children[0]!.gridPlacement = { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }

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
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // A at (0,0) - explicit
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)
      // B auto-placed: skips (0,0) -> goes to (1,0) => x=100, y=0
      expect(children[1]!.transform.x).toBe(100)
      expect(children[1]!.transform.y).toBe(0)
      // C auto-placed: next cell (0,1) => x=0, y=100
      expect(children[2]!.transform.x).toBe(0)
      expect(children[2]!.transform.y).toBe(100)
    })
  })

  describe('column/row spanning', () => {
    test('child spanning 2 columns gets double width cell', () => {
      const children = [makeVectorChild('a', 'A', 40, 40), makeVectorChild('b', 'B', 40, 40)]
      // A spans 2 columns
      children[0]!.gridPlacement = { column: 0, row: 0, columnSpan: 2, rowSpan: 1 }

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
        justifyItems: 'stretch',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // A at (0,0) spanning 2 columns = full 200px width
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)

      // B auto-placed: row 0 is full (both cols taken by A), goes to row 1
      expect(children[1]!.transform.y).toBe(100)
    })

    test('child spanning 2 rows gets double height cell', () => {
      const children = [
        makeVectorChild('a', 'A', 40, 40),
        makeVectorChild('b', 'B', 40, 40),
        makeVectorChild('c', 'C', 40, 40),
      ]
      // A spans 2 rows in column 0
      children[0]!.gridPlacement = { column: 0, row: 0, columnSpan: 1, rowSpan: 2 }

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
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // A at (0,0) spanning 2 rows
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)

      // B auto-placed: (0,0) occupied, (0,1) occupied by span -> (1,0)
      expect(children[1]!.transform.x).toBe(100)
      expect(children[1]!.transform.y).toBe(0)

      // C auto-placed: next free cell (1,1)
      expect(children[2]!.transform.x).toBe(100)
      expect(children[2]!.transform.y).toBe(100)
    })

    test('spanning includes inter-track gaps in cell size', () => {
      const children = [makeVectorChild('a', 'A', 40, 40)]
      children[0]!.gridPlacement = { column: 0, row: 0, columnSpan: 2, rowSpan: 1 }

      const gridConfig: GridLayoutConfig = {
        columns: [
          { size: 1, unit: 'fr' },
          { size: 1, unit: 'fr' },
        ],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 20,
        rowGap: 0,
        alignItems: 'start',
        justifyItems: 'stretch',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 100)

      // Available for columns: 200 - 20 gap = 180, each fr = 90
      // Spanning 2 columns + gap between them = 90 + 20 + 90 = 200
      // With stretch, child should be positioned at x=0
      expect(children[0]!.transform.x).toBe(0)
    })
  })

  describe('gap between tracks', () => {
    test('column gap offsets subsequent columns', () => {
      const children = [makeVectorChild('a', 'A', 40, 40), makeVectorChild('b', 'B', 40, 40)]
      const gridConfig: GridLayoutConfig = {
        columns: [
          { size: 1, unit: 'fr' },
          { size: 1, unit: 'fr' },
        ],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 20,
        rowGap: 0,
        alignItems: 'start',
        justifyItems: 'start',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 220, 100)

      // Available: 220, gap 20. Each col = (220-20)/2 = 100
      // Col 0 starts at 0, col 1 starts at 100 + 20 = 120
      expect(children[0]!.transform.x).toBe(0)
      expect(children[1]!.transform.x).toBe(120)
    })

    test('row gap offsets subsequent rows', () => {
      const children = [makeVectorChild('a', 'A', 40, 40), makeVectorChild('b', 'B', 40, 40)]
      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [
          { size: 1, unit: 'fr' },
          { size: 1, unit: 'fr' },
        ],
        columnGap: 0,
        rowGap: 10,
        alignItems: 'start',
        justifyItems: 'start',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 100, 210)

      // Available height: 210, gap 10. Each row = (210-10)/2 = 100
      // Row 0 at y=0, row 1 at y=100+10=110
      expect(children[0]!.transform.y).toBe(0)
      expect(children[1]!.transform.y).toBe(110)
    })
  })

  describe('align/justify items within cells', () => {
    test('alignItems center vertically centers child in cell', () => {
      const children = [makeVectorChild('a', 'A', 40, 20)]
      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'center',
        justifyItems: 'start',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 100, 100)

      // Cell is 100x100, child is 40x20
      // Vertically centered: (100 - 20) / 2 = 40
      expect(children[0]!.transform.y).toBe(40)
      expect(children[0]!.transform.x).toBe(0) // start
    })

    test('justifyItems center horizontally centers child in cell', () => {
      const children = [makeVectorChild('a', 'A', 40, 20)]
      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'start',
        justifyItems: 'center',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 100, 100)

      // Cell is 100x100, child is 40x20
      // Horizontally centered: (100 - 40) / 2 = 30
      expect(children[0]!.transform.x).toBe(30)
      expect(children[0]!.transform.y).toBe(0) // start
    })

    test('alignItems end aligns child to bottom of cell', () => {
      const children = [makeVectorChild('a', 'A', 40, 20)]
      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'end',
        justifyItems: 'end',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 100, 100)

      // Cell is 100x100, child is 40x20
      // End: x = 100-40 = 60, y = 100-20 = 80
      expect(children[0]!.transform.x).toBe(60)
      expect(children[0]!.transform.y).toBe(80)
    })

    test('stretch fills child to cell dimensions', () => {
      const children = [makeVectorChild('a', 'A', 40, 20)]
      children[0]!.layoutSizing = { horizontal: 'fill', vertical: 'fill' }

      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'stretch',
        justifyItems: 'stretch',
      }
      const group = makeGridGroup(children, gridConfig)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // Stretched to fill 200x200 cell
      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)
      // scaleX should reflect stretched size: 200/40 = 5
      expect(children[0]!.transform.scaleX).toBe(5)
      expect(children[0]!.transform.scaleY).toBe(10) // 200/20 = 10
    })
  })

  describe('padding', () => {
    test('padding offsets all grid content', () => {
      const children = [makeVectorChild('a', 'A', 40, 40)]
      const gridConfig: GridLayoutConfig = {
        columns: [{ size: 1, unit: 'fr' }],
        rows: [{ size: 1, unit: 'fr' }],
        columnGap: 0,
        rowGap: 0,
        alignItems: 'start',
        justifyItems: 'start',
      }
      const group = makeGridGroup(children, gridConfig, 10)
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 200, 200)

      // With 10px padding, content starts at (10, 10)
      expect(children[0]!.transform.x).toBe(10)
      expect(children[0]!.transform.y).toBe(10)
    })
  })

  describe('createDefaultGridConfig', () => {
    test('returns a valid default grid config', () => {
      const config = createDefaultGridConfig()
      expect(config.columns.length).toBe(2)
      expect(config.rows.length).toBe(1)
      expect(config.columnGap).toBe(8)
      expect(config.rowGap).toBe(8)
      expect(config.alignItems).toBe('stretch')
      expect(config.justifyItems).toBe('stretch')
      expect(config.columns[0]!.unit).toBe('fr')
      expect(config.columns[0]!.size).toBe(1)
    })
  })

  describe('backwards compatibility', () => {
    test('layout without layoutMode defaults to flex behavior', () => {
      const children = [makeVectorChild('a', 'A', 50, 50), makeVectorChild('b', 'B', 50, 50)]
      const group: GroupLayer = {
        id: 'g1',
        name: 'Group',
        type: 'group',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        children,
        autoLayout: {
          direction: 'horizontal',
          gap: 10,
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          alignItems: 'start',
          justifyContent: 'start',
          wrap: false,
          // no layoutMode set - should default to flex
        },
      }
      const bounds = makeBoundsMap(children)

      applyAutoLayout(group, bounds, 300, 100)

      // Flex horizontal: A at x=0, B at x=50+10=60
      expect(children[0]!.transform.x).toBe(0)
      expect(children[1]!.transform.x).toBe(60)
    })
  })
})
