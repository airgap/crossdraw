import { describe, test, expect } from 'bun:test'
import { applyAutoLayout, computeLayerBounds, createDefaultAutoLayout } from '../src/layout/auto-layout'
import type { GroupLayer, VectorLayer, Layer, AutoLayoutConfig } from '../src/types/document'

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

function makeGroup(children: Layer[], config?: AutoLayoutConfig): GroupLayer {
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
  }
}

describe('Auto Layout Engine', () => {
  describe('createDefaultAutoLayout', () => {
    test('returns valid default config', () => {
      const config = createDefaultAutoLayout()
      expect(config.direction).toBe('horizontal')
      expect(config.gap).toBe(8)
      expect(config.paddingTop).toBe(8)
      expect(config.paddingRight).toBe(8)
      expect(config.paddingBottom).toBe(8)
      expect(config.paddingLeft).toBe(8)
      expect(config.alignItems).toBe('start')
      expect(config.justifyContent).toBe('start')
      expect(config.wrap).toBe(false)
    })
  })

  describe('computeLayerBounds', () => {
    test('computes bounds for vector layer with shapeParams', () => {
      const child = makeVectorChild('c1', 'Rect', 100, 50)
      const bounds = computeLayerBounds([child])
      expect(bounds.get('c1')).toEqual({ width: 100, height: 50 })
    })

    test('computes bounds for multiple children', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 50),
        makeVectorChild('c2', 'B', 200, 80),
      ]
      const bounds = computeLayerBounds(children)
      expect(bounds.get('c1')).toEqual({ width: 100, height: 50 })
      expect(bounds.get('c2')).toEqual({ width: 200, height: 80 })
    })
  })

  describe('horizontal layout', () => {
    test('positions children left-to-right with gap', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 50),
        makeVectorChild('c2', 'B', 80, 50),
        makeVectorChild('c3', 'C', 60, 50),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      applyAutoLayout(group, bounds, 500, 100)

      expect(children[0]!.transform.x).toBe(0)
      expect(children[0]!.transform.y).toBe(0)

      expect(children[1]!.transform.x).toBe(110) // 100 + 10 gap
      expect(children[1]!.transform.y).toBe(0)

      expect(children[2]!.transform.x).toBe(200) // 110 + 80 + 10 gap
      expect(children[2]!.transform.y).toBe(0)
    })

    test('applies padding', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 50),
        makeVectorChild('c2', 'B', 80, 50),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 20,
        paddingRight: 20,
        paddingBottom: 20,
        paddingLeft: 30,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      applyAutoLayout(group, bounds, 500, 200)

      expect(children[0]!.transform.x).toBe(30)
      expect(children[0]!.transform.y).toBe(20)

      expect(children[1]!.transform.x).toBe(140) // 30 + 100 + 10
      expect(children[1]!.transform.y).toBe(20)
    })

    test('centers children on cross-axis', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 30),
        makeVectorChild('c2', 'B', 80, 50),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 10,
        paddingRight: 10,
        paddingBottom: 10,
        paddingLeft: 10,
        alignItems: 'center',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // Available height = 200 - 10 - 10 = 180
      applyAutoLayout(group, bounds, 500, 200)

      // c1: y = 10 + (180 - 30) / 2 = 10 + 75 = 85
      expect(children[0]!.transform.y).toBe(85)
      // c2: y = 10 + (180 - 50) / 2 = 10 + 65 = 75
      expect(children[1]!.transform.y).toBe(75)
    })

    test('aligns children to end on cross-axis', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 30),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 0,
        paddingTop: 10,
        paddingRight: 10,
        paddingBottom: 10,
        paddingLeft: 10,
        alignItems: 'end',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // Available height = 100 - 10 - 10 = 80
      applyAutoLayout(group, bounds, 200, 100)

      // c1: y = 10 + 80 - 30 = 60
      expect(children[0]!.transform.y).toBe(60)
    })

    test('justify center distributes children', () => {
      const children = [
        makeVectorChild('c1', 'A', 50, 50),
        makeVectorChild('c2', 'B', 50, 50),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'center',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // totalContentWidth = 50 + 50 + 10 = 110
      // center offset = (300 - 110) / 2 = 95
      applyAutoLayout(group, bounds, 300, 100)

      expect(children[0]!.transform.x).toBe(95)
      expect(children[1]!.transform.x).toBe(155) // 95 + 50 + 10
    })

    test('justify space-between distributes gaps evenly', () => {
      const children = [
        makeVectorChild('c1', 'A', 50, 50),
        makeVectorChild('c2', 'B', 50, 50),
        makeVectorChild('c3', 'C', 50, 50),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'space-between',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // 3 children of 50 each = 150, available = 300
      // spaceBetweenGap = (300 - 150) / 2 = 75
      applyAutoLayout(group, bounds, 300, 100)

      expect(children[0]!.transform.x).toBe(0)
      expect(children[1]!.transform.x).toBe(125) // 0 + 50 + 75
      expect(children[2]!.transform.x).toBe(250) // 125 + 50 + 75
    })
  })

  describe('vertical layout', () => {
    test('positions children top-to-bottom with gap', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 40),
        makeVectorChild('c2', 'B', 100, 60),
        makeVectorChild('c3', 'C', 100, 30),
      ]
      const config: AutoLayoutConfig = {
        direction: 'vertical',
        gap: 8,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      applyAutoLayout(group, bounds, 200, 500)

      expect(children[0]!.transform.y).toBe(0)
      expect(children[0]!.transform.x).toBe(0)

      expect(children[1]!.transform.y).toBe(48) // 40 + 8
      expect(children[1]!.transform.x).toBe(0)

      expect(children[2]!.transform.y).toBe(116) // 48 + 60 + 8
      expect(children[2]!.transform.x).toBe(0)
    })

    test('centers children on cross-axis (x)', () => {
      const children = [
        makeVectorChild('c1', 'A', 60, 40),
        makeVectorChild('c2', 'B', 100, 40),
      ]
      const config: AutoLayoutConfig = {
        direction: 'vertical',
        gap: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'center',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // Available width = 200
      applyAutoLayout(group, bounds, 200, 300)

      // c1: x = (200 - 60) / 2 = 70
      expect(children[0]!.transform.x).toBe(70)
      // c2: x = (200 - 100) / 2 = 50
      expect(children[1]!.transform.x).toBe(50)
    })

    test('justify end pushes children to bottom', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 30),
        makeVectorChild('c2', 'B', 100, 30),
      ]
      const config: AutoLayoutConfig = {
        direction: 'vertical',
        gap: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'end',
        wrap: false,
      }
      const group = makeGroup(children, config)
      const bounds = computeLayerBounds(children)

      // totalContentHeight = 30 + 30 + 10 = 70
      // end offset = 200 - 70 = 130
      applyAutoLayout(group, bounds, 200, 200)

      expect(children[0]!.transform.y).toBe(130)
      expect(children[1]!.transform.y).toBe(170) // 130 + 30 + 10
    })
  })

  describe('no-op without config', () => {
    test('returns original dimensions when no autoLayout config', () => {
      const children = [makeVectorChild('c1', 'A', 100, 50)]
      const group = makeGroup(children) // no autoLayout
      const bounds = computeLayerBounds(children)

      const result = applyAutoLayout(group, bounds, 500, 300)
      expect(result.groupWidth).toBe(500)
      expect(result.groupHeight).toBe(300)
    })
  })

  describe('hidden children', () => {
    test('skips hidden children', () => {
      const c1 = makeVectorChild('c1', 'A', 100, 50)
      const c2 = makeVectorChild('c2', 'B', 80, 50)
      c2.visible = false
      const c3 = makeVectorChild('c3', 'C', 60, 50)

      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup([c1, c2, c3], config)
      const bounds = computeLayerBounds([c1, c2, c3])

      applyAutoLayout(group, bounds, 500, 100)

      // c1 at 0, c3 at 110 (c2 is hidden and skipped)
      expect(c1.transform.x).toBe(0)
      expect(c3.transform.x).toBe(110)
      // c2 should not have been repositioned (original position)
      expect(c2.transform.x).toBe(0)
    })
  })

  describe('fill sizing', () => {
    test('fill children share remaining space equally', () => {
      const c1 = makeVectorChild('c1', 'Fixed', 50, 50)
      const c2 = makeVectorChild('c2', 'Fill1', 10, 50)
      c2.layoutSizing = { horizontal: 'fill', vertical: 'fixed' }
      const c3 = makeVectorChild('c3', 'Fill2', 10, 50)
      c3.layoutSizing = { horizontal: 'fill', vertical: 'fixed' }

      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup([c1, c2, c3], config)
      const bounds = computeLayerBounds([c1, c2, c3])

      // Available = 300, fixed = 50, remaining = 250, 2 fill children = 125 each
      applyAutoLayout(group, bounds, 300, 100)

      expect(c1.transform.x).toBe(0)
      expect(c2.transform.x).toBe(50)
      expect(c3.transform.x).toBe(175) // 50 + 125
    })
  })

  describe('hug sizing result', () => {
    test('returns hug dimensions when group has hug sizing', () => {
      const children = [
        makeVectorChild('c1', 'A', 100, 50),
        makeVectorChild('c2', 'B', 80, 70),
      ]
      const config: AutoLayoutConfig = {
        direction: 'horizontal',
        gap: 10,
        paddingTop: 5,
        paddingRight: 5,
        paddingBottom: 5,
        paddingLeft: 5,
        alignItems: 'start',
        justifyContent: 'start',
        wrap: false,
      }
      const group = makeGroup(children, config)
      group.layoutSizing = { horizontal: 'hug', vertical: 'hug' }
      const bounds = computeLayerBounds(children)

      const result = applyAutoLayout(group, bounds, 500, 300)

      // hugWidth = 5 + (100 + 80 + 10) + 5 = 200
      expect(result.groupWidth).toBe(200)
      // hugHeight = 5 + max(50, 70) + 5 = 80
      expect(result.groupHeight).toBe(80)
    })
  })
})
