import { describe, test, expect } from 'bun:test'
import type { FillLayer, CloneLayer, Layer, Gradient } from '@/types'

describe('FillLayer', () => {
  test('solid fill layer has correct structure', () => {
    const layer: FillLayer = {
      id: 'fill-1',
      name: 'Solid Color Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'solid',
      color: '#ff0000',
    }
    expect(layer.type).toBe('fill')
    expect(layer.fillType).toBe('solid')
    expect(layer.color).toBe('#ff0000')
    expect(layer.gradient).toBeUndefined()
    expect(layer.patternImageId).toBeUndefined()
  })

  test('gradient fill layer has correct structure', () => {
    const gradient: Gradient = {
      id: 'grad-1',
      name: 'Test Gradient',
      type: 'linear',
      angle: 90,
      x: 0,
      y: 0,
      stops: [
        { offset: 0, color: '#000000', opacity: 1 },
        { offset: 1, color: '#ffffff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer: FillLayer = {
      id: 'fill-2',
      name: 'Gradient Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'gradient',
      gradient,
    }
    expect(layer.type).toBe('fill')
    expect(layer.fillType).toBe('gradient')
    expect(layer.gradient).toBeDefined()
    expect(layer.gradient!.type).toBe('linear')
    expect(layer.gradient!.stops).toHaveLength(2)
  })

  test('pattern fill layer has correct structure', () => {
    const layer: FillLayer = {
      id: 'fill-3',
      name: 'Pattern Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'pattern',
      patternScale: 2,
      patternImageId: 'img-chunk-1',
    }
    expect(layer.type).toBe('fill')
    expect(layer.fillType).toBe('pattern')
    expect(layer.patternScale).toBe(2)
    expect(layer.patternImageId).toBe('img-chunk-1')
  })

  test('fill layer is part of Layer union', () => {
    const layer: Layer = {
      id: 'fill-4',
      name: 'Test Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 0.5,
      blendMode: 'multiply',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'solid',
      color: '#00ff00',
    }
    expect(layer.type).toBe('fill')
    expect(layer.opacity).toBe(0.5)
    expect(layer.blendMode).toBe('multiply')
  })

  test('fill layer supports all blend modes', () => {
    const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'soft-light'] as const
    for (const mode of blendModes) {
      const layer: FillLayer = {
        id: `fill-blend-${mode}`,
        name: `Fill ${mode}`,
        type: 'fill',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: mode,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        fillType: 'solid',
        color: '#000000',
      }
      expect(layer.blendMode).toBe(mode)
    }
  })

  test('fill layer defaults for solid type', () => {
    const layer: FillLayer = {
      id: 'fill-default',
      name: 'Default Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'solid',
      color: '#ffffff',
    }
    expect(layer.color).toBe('#ffffff')
    expect(layer.visible).toBe(true)
    expect(layer.locked).toBe(false)
  })
})

describe('CloneLayer', () => {
  test('clone layer has correct structure', () => {
    const layer: CloneLayer = {
      id: 'clone-1',
      name: 'Clone of Rectangle',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 120, y: 120, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: 'vec-1',
      offsetX: 20,
      offsetY: 20,
    }
    expect(layer.type).toBe('clone')
    expect(layer.sourceLayerId).toBe('vec-1')
    expect(layer.offsetX).toBe(20)
    expect(layer.offsetY).toBe(20)
  })

  test('clone layer is part of Layer union', () => {
    const layer: Layer = {
      id: 'clone-2',
      name: 'Clone Test',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 0.8,
      blendMode: 'screen',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: 'source-1',
      offsetX: 10,
      offsetY: 15,
    }
    expect(layer.type).toBe('clone')
    expect(layer.opacity).toBe(0.8)
    expect(layer.blendMode).toBe('screen')
  })

  test('clone layer with zero offset', () => {
    const layer: CloneLayer = {
      id: 'clone-3',
      name: 'Clone at Same Position',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: 'vec-2',
      offsetX: 0,
      offsetY: 0,
    }
    expect(layer.offsetX).toBe(0)
    expect(layer.offsetY).toBe(0)
  })

  test('clone layer with negative offset', () => {
    const layer: CloneLayer = {
      id: 'clone-4',
      name: 'Clone Before Source',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 80, y: 80, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: 'vec-3',
      offsetX: -20,
      offsetY: -20,
    }
    expect(layer.offsetX).toBe(-20)
    expect(layer.offsetY).toBe(-20)
    expect(layer.transform.x).toBe(80)
    expect(layer.transform.y).toBe(80)
  })

  test('clone layer preserves source reference', () => {
    const sourceId = 'original-layer-abc123'
    const layer: CloneLayer = {
      id: 'clone-5',
      name: 'Clone',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: sourceId,
      offsetX: 50,
      offsetY: 50,
    }
    expect(layer.sourceLayerId).toBe(sourceId)
  })
})

describe('Layer type discrimination', () => {
  test('can discriminate fill layer from union', () => {
    const layers: Layer[] = [
      {
        id: 'v1',
        name: 'Vector',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        paths: [],
        fill: null,
        stroke: null,
      },
      {
        id: 'f1',
        name: 'Fill',
        type: 'fill',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        fillType: 'solid',
        color: '#ff0000',
      },
      {
        id: 'c1',
        name: 'Clone',
        type: 'clone',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
        sourceLayerId: 'v1',
        offsetX: 20,
        offsetY: 20,
      },
    ]

    const fills = layers.filter((l): l is FillLayer => l.type === 'fill')
    expect(fills).toHaveLength(1)
    expect(fills[0]!.fillType).toBe('solid')
    expect(fills[0]!.color).toBe('#ff0000')

    const clones = layers.filter((l): l is CloneLayer => l.type === 'clone')
    expect(clones).toHaveLength(1)
    expect(clones[0]!.sourceLayerId).toBe('v1')
    expect(clones[0]!.offsetX).toBe(20)
  })

  test('type narrowing works for fill layers', () => {
    const layer: Layer = {
      id: 'fill-narrow',
      name: 'Narrowed Fill',
      type: 'fill',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      fillType: 'gradient',
      gradient: {
        id: 'g1',
        name: 'G',
        type: 'radial',
        x: 0.5,
        y: 0.5,
        radius: 1,
        stops: [
          { offset: 0, color: '#ff0000', opacity: 1 },
          { offset: 1, color: '#0000ff', opacity: 1 },
        ],
        dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      },
    }

    if (layer.type === 'fill') {
      // TypeScript should narrow to FillLayer here
      expect(layer.fillType).toBe('gradient')
      expect(layer.gradient).toBeDefined()
      expect(layer.gradient!.type).toBe('radial')
    }
  })

  test('type narrowing works for clone layers', () => {
    const layer: Layer = {
      id: 'clone-narrow',
      name: 'Narrowed Clone',
      type: 'clone',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      sourceLayerId: 'src-1',
      offsetX: 10,
      offsetY: 10,
    }

    if (layer.type === 'clone') {
      // TypeScript should narrow to CloneLayer here
      expect(layer.sourceLayerId).toBe('src-1')
      expect(layer.offsetX).toBe(10)
      expect(layer.offsetY).toBe(10)
    }
  })
})
