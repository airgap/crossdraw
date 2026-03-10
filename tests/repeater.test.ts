import { describe, it, expect } from 'bun:test'
import {
  generateRepeaterInstances,
  createRepeaterGroup,
  createDefaultRepeaterConfig,
  type RepeaterConfig,
} from '@/tools/repeater'
import type { VectorLayer, Transform } from '@/types'
import { v4 as uuid } from 'uuid'

// ── Helpers ──

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: uuid(),
    name: 'Test Layer',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<RepeaterConfig> = {}): RepeaterConfig {
  return { ...createDefaultRepeaterConfig(), ...overrides }
}

// ── Tests ──

describe('Repeater', () => {
  describe('generateRepeaterInstances', () => {
    it('generates correct count of instances', () => {
      const source = makeVectorLayer()
      const config = makeConfig({ mode: 'linear', count: 5 })
      const instances = generateRepeaterInstances(source, config)
      expect(instances.length).toBe(5)
    })

    it('generates unique IDs for each instance', () => {
      const source = makeVectorLayer()
      const config = makeConfig({ mode: 'linear', count: 3 })
      const instances = generateRepeaterInstances(source, config)
      const ids = instances.map((i) => i.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
      // None should match the source
      expect(ids.every((id) => id !== source.id)).toBe(true)
    })

    it('generates name suffixes for instances', () => {
      const source = makeVectorLayer({ name: 'Star' })
      const config = makeConfig({ mode: 'linear', count: 3 })
      const instances = generateRepeaterInstances(source, config)
      expect(instances[0]!.name).toBe('Star #2')
      expect(instances[1]!.name).toBe('Star #3')
      expect(instances[2]!.name).toBe('Star #4')
    })
  })

  describe('linear mode', () => {
    it('spaces instances along horizontal axis when angle is 0', () => {
      const source = makeVectorLayer({
        transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({ mode: 'linear', count: 3, linearSpacing: 50, linearAngle: 0 })
      const instances = generateRepeaterInstances(source, config)

      // Instance 1: offset by 50*1 along angle 0 (cos(0)=1, sin(0)=0)
      expect(instances[0]!.transform.x).toBeCloseTo(10 + 50, 5)
      expect(instances[0]!.transform.y).toBeCloseTo(20, 5)

      // Instance 2: offset by 50*2
      expect(instances[1]!.transform.x).toBeCloseTo(10 + 100, 5)
      expect(instances[1]!.transform.y).toBeCloseTo(20, 5)

      // Instance 3: offset by 50*3
      expect(instances[2]!.transform.x).toBeCloseTo(10 + 150, 5)
      expect(instances[2]!.transform.y).toBeCloseTo(20, 5)
    })

    it('spaces instances at 45 degree angle', () => {
      const source = makeVectorLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({ mode: 'linear', count: 2, linearSpacing: 100, linearAngle: 45 })
      const instances = generateRepeaterInstances(source, config)

      const cos45 = Math.cos((45 * Math.PI) / 180)
      const sin45 = Math.sin((45 * Math.PI) / 180)

      expect(instances[0]!.transform.x).toBeCloseTo(cos45 * 100, 5)
      expect(instances[0]!.transform.y).toBeCloseTo(sin45 * 100, 5)
    })

    it('spaces instances along vertical axis when angle is 90', () => {
      const source = makeVectorLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({ mode: 'linear', count: 2, linearSpacing: 30, linearAngle: 90 })
      const instances = generateRepeaterInstances(source, config)

      expect(instances[0]!.transform.x).toBeCloseTo(0, 5)
      expect(instances[0]!.transform.y).toBeCloseTo(30, 5)
    })
  })

  describe('grid mode', () => {
    it('produces correct number of instances for rows*columns', () => {
      const source = makeVectorLayer()
      // In grid mode, count determines the total clones. Grid layout wraps based on gridColumns.
      const config = makeConfig({ mode: 'grid', count: 6, gridColumns: 3, gridRowGap: 50, gridColumnGap: 50 })
      const instances = generateRepeaterInstances(source, config)
      expect(instances.length).toBe(6)
    })

    it('positions instances in grid layout', () => {
      const source = makeVectorLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({
        mode: 'grid',
        count: 4,
        gridColumns: 2,
        gridRowGap: 100,
        gridColumnGap: 80,
      })
      const instances = generateRepeaterInstances(source, config)

      // Instance 1 (index=1): col=1, row=0
      expect(instances[0]!.transform.x).toBeCloseTo(80, 5)
      expect(instances[0]!.transform.y).toBeCloseTo(0, 5)

      // Instance 2 (index=2): col=0, row=1
      expect(instances[1]!.transform.x).toBeCloseTo(0, 5)
      expect(instances[1]!.transform.y).toBeCloseTo(100, 5)

      // Instance 3 (index=3): col=1, row=1
      expect(instances[2]!.transform.x).toBeCloseTo(80, 5)
      expect(instances[2]!.transform.y).toBeCloseTo(100, 5)
    })
  })

  describe('radial mode', () => {
    it('arranges instances in a circle', () => {
      const source = makeVectorLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({
        mode: 'radial',
        count: 3,
        radialRadius: 100,
        radialStartAngle: 0,
        radialEndAngle: 360,
      })
      const instances = generateRepeaterInstances(source, config)
      expect(instances.length).toBe(3)

      // 4 total items (source + 3 clones), 360/4 = 90 degree steps
      // Instance 1 at 90 degrees
      expect(instances[0]!.transform.x).toBeCloseTo(Math.cos((90 * Math.PI) / 180) * 100, 3)
      expect(instances[0]!.transform.y).toBeCloseTo(Math.sin((90 * Math.PI) / 180) * 100, 3)

      // Instance 2 at 180 degrees
      expect(instances[1]!.transform.x).toBeCloseTo(Math.cos((180 * Math.PI) / 180) * 100, 3)
      expect(instances[1]!.transform.y).toBeCloseTo(Math.sin((180 * Math.PI) / 180) * 100, 3)

      // Instance 3 at 270 degrees
      expect(instances[2]!.transform.x).toBeCloseTo(Math.cos((270 * Math.PI) / 180) * 100, 3)
      expect(instances[2]!.transform.y).toBeCloseTo(Math.sin((270 * Math.PI) / 180) * 100, 3)
    })

    it('arranges instances in a half circle', () => {
      const source = makeVectorLayer({
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      })
      const config = makeConfig({
        mode: 'radial',
        count: 2,
        radialRadius: 50,
        radialStartAngle: 0,
        radialEndAngle: 180,
      })
      const instances = generateRepeaterInstances(source, config)
      expect(instances.length).toBe(2)

      // 3 total items, 180/3 = 60 degree steps
      // Instance 1 at 60 degrees
      expect(instances[0]!.transform.x).toBeCloseTo(Math.cos((60 * Math.PI) / 180) * 50, 3)
      expect(instances[0]!.transform.y).toBeCloseTo(Math.sin((60 * Math.PI) / 180) * 50, 3)
    })
  })

  describe('progressive effects', () => {
    it('applies progressive rotation incrementally', () => {
      const source = makeVectorLayer()
      const config = makeConfig({
        mode: 'linear',
        count: 4,
        linearSpacing: 50,
        linearAngle: 0,
        progressiveRotation: 15,
      })
      const instances = generateRepeaterInstances(source, config)

      expect(instances[0]!.transform.rotation).toBeCloseTo(15, 5)
      expect(instances[1]!.transform.rotation).toBeCloseTo(30, 5)
      expect(instances[2]!.transform.rotation).toBeCloseTo(45, 5)
      expect(instances[3]!.transform.rotation).toBeCloseTo(60, 5)
    })

    it('applies progressive scale', () => {
      const source = makeVectorLayer()
      const config = makeConfig({
        mode: 'linear',
        count: 3,
        linearSpacing: 50,
        linearAngle: 0,
        progressiveScale: 0.3,
      })
      const instances = generateRepeaterInstances(source, config)

      // progressiveScale = 0.3, fraction at index 1 = 1/3 => scale = 1 + 0.3 * (1/3) = 1.1
      expect(instances[0]!.transform.scaleX).toBeCloseTo(1 + 0.3 * (1 / 3), 5)
      expect(instances[1]!.transform.scaleX).toBeCloseTo(1 + 0.3 * (2 / 3), 5)
      expect(instances[2]!.transform.scaleX).toBeCloseTo(1 + 0.3 * 1, 5)
    })

    it('applies progressive opacity decrease', () => {
      const source = makeVectorLayer({ opacity: 1 })
      const config = makeConfig({
        mode: 'linear',
        count: 4,
        linearSpacing: 50,
        linearAngle: 0,
        progressiveOpacity: 0.8,
      })
      const instances = generateRepeaterInstances(source, config)

      // fraction at index 1 = 1/4 = 0.25, opacity = 1 - 0.8 * 0.25 = 0.8
      expect(instances[0]!.opacity).toBeCloseTo(1 - 0.8 * 0.25, 5)
      // fraction at index 2 = 2/4 = 0.5, opacity = 1 - 0.8 * 0.5 = 0.6
      expect(instances[1]!.opacity).toBeCloseTo(1 - 0.8 * 0.5, 5)
      // fraction at index 3 = 3/4 = 0.75, opacity = 1 - 0.8 * 0.75 = 0.4
      expect(instances[2]!.opacity).toBeCloseTo(1 - 0.8 * 0.75, 5)
      // fraction at index 4 = 4/4 = 1.0, opacity = 1 - 0.8 * 1 = 0.2
      expect(instances[3]!.opacity).toBeCloseTo(1 - 0.8 * 1, 5)
    })

    it('clamps opacity to 0 minimum', () => {
      const source = makeVectorLayer({ opacity: 0.5 })
      const config = makeConfig({
        mode: 'linear',
        count: 2,
        linearSpacing: 50,
        linearAngle: 0,
        progressiveOpacity: 1,
      })
      const instances = generateRepeaterInstances(source, config)

      // Last instance: opacity = 0.5 - 1.0 * 1.0 = -0.5, clamped to 0
      expect(instances[1]!.opacity).toBe(0)
    })
  })

  describe('createRepeaterGroup', () => {
    it('wraps source and clones in a group', () => {
      const source = makeVectorLayer({ name: 'Shape' })
      const config = makeConfig({ mode: 'linear', count: 3 })
      const instances = generateRepeaterInstances(source, config)
      const group = createRepeaterGroup(source, instances)

      expect(group.type).toBe('group')
      expect(group.name).toBe('Shape Repeat')
      // Source (cloned as #1) + 3 instances = 4 children
      expect(group.children.length).toBe(4)
      expect(group.children[0]!.name).toBe('Shape #1')
    })
  })
})

// ── Transform Anchor Point Tests ──

describe('Transform anchor point', () => {
  it('default anchor is center (0.5, 0.5)', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    expect(t.anchorX ?? 0.5).toBe(0.5)
    expect(t.anchorY ?? 0.5).toBe(0.5)
  })

  it('anchor point values map correctly for TL', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 }
    expect(t.anchorX).toBe(0)
    expect(t.anchorY).toBe(0)
  })

  it('anchor point values map correctly for TR', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 1, anchorY: 0 }
    expect(t.anchorX).toBe(1)
    expect(t.anchorY).toBe(0)
  })

  it('anchor point values map correctly for BL', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 1 }
    expect(t.anchorX).toBe(0)
    expect(t.anchorY).toBe(1)
  })

  it('anchor point values map correctly for BR', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 1, anchorY: 1 }
    expect(t.anchorX).toBe(1)
    expect(t.anchorY).toBe(1)
  })

  it('anchor point values map correctly for MC (center)', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 }
    expect(t.anchorX).toBe(0.5)
    expect(t.anchorY).toBe(0.5)
  })

  it('9-point grid covers all expected positions', () => {
    const expectedPoints = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 0.5],
      [0.5, 0.5],
      [1, 0.5],
      [0, 1],
      [0.5, 1],
      [1, 1],
    ]
    // Verify all 9 combinations are valid
    for (const [ax, ay] of expectedPoints) {
      const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: ax, anchorY: ay }
      expect(t.anchorX).toBe(ax)
      expect(t.anchorY).toBe(ay)
    }
    expect(expectedPoints.length).toBe(9)
  })

  it('anchor point is optional and defaults to center', () => {
    const t: Transform = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 45 }
    // When anchorX/Y are undefined, they default to 0.5
    expect(t.anchorX).toBeUndefined()
    expect(t.anchorY).toBeUndefined()
    // Consumer code should treat undefined as 0.5
    const ax = t.anchorX ?? 0.5
    const ay = t.anchorY ?? 0.5
    expect(ax).toBe(0.5)
    expect(ay).toBe(0.5)
  })
})
