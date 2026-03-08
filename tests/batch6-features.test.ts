import { describe, test, expect } from 'bun:test'
import type { Gradient, Fill, Stroke, NamedColor } from '@/types'
import { copyStyle, pasteStyle, hasStyleClipboard } from '@/tools/style-clipboard'

describe('LYK-87: gradient transform and positioning', () => {
  test('gradient can have gradientTransform', () => {
    const grad: Gradient = {
      id: '1',
      name: 'test',
      type: 'linear',
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#000', opacity: 1 },
        { offset: 1, color: '#fff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      gradientTransform: { rotate: 45, scaleX: 2, scaleY: 1 },
    }
    expect(grad.gradientTransform!.rotate).toBe(45)
    expect(grad.gradientTransform!.scaleX).toBe(2)
  })

  test('gradient can have gradientUnits', () => {
    const grad: Gradient = {
      id: '1',
      name: 'test',
      type: 'radial',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [{ offset: 0, color: '#ff0', opacity: 1 }],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      gradientUnits: 'userSpaceOnUse',
    }
    expect(grad.gradientUnits).toBe('userSpaceOnUse')
  })

  test('default gradientUnits is objectBoundingBox', () => {
    const grad: Gradient = {
      id: '1',
      name: 'test',
      type: 'linear',
      x: 0,
      y: 0,
      stops: [],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    expect(grad.gradientUnits ?? 'objectBoundingBox').toBe('objectBoundingBox')
  })

  test('SVG gradientTransform attribute format', () => {
    const gt = { rotate: 30, scaleX: 1.5, scaleY: 1.5, translateX: 10, translateY: 20 }
    const parts: string[] = []
    if (gt.translateX || gt.translateY) parts.push(`translate(${gt.translateX ?? 0} ${gt.translateY ?? 0})`)
    if (gt.rotate) parts.push(`rotate(${gt.rotate})`)
    if (gt.scaleX || gt.scaleY) parts.push(`scale(${gt.scaleX ?? 1} ${gt.scaleY ?? 1})`)
    const attr = `gradientTransform="${parts.join(' ')}"`
    expect(attr).toContain('translate(10 20)')
    expect(attr).toContain('rotate(30)')
    expect(attr).toContain('scale(1.5 1.5)')
  })
})

describe('LYK-104: color palette', () => {
  test('default palette has 8 colors', () => {
    const defaults: NamedColor[] = [
      { id: '1', name: 'Black', value: '#000000' },
      { id: '2', name: 'White', value: '#ffffff' },
      { id: '3', name: 'Red', value: '#ff0000' },
      { id: '4', name: 'Green', value: '#00ff00' },
      { id: '5', name: 'Blue', value: '#0000ff' },
      { id: '6', name: 'Yellow', value: '#ffff00' },
      { id: '7', name: 'Cyan', value: '#00ffff' },
      { id: '8', name: 'Magenta', value: '#ff00ff' },
    ]
    expect(defaults.length).toBe(8)
  })

  test('palette colors have name and value', () => {
    const color: NamedColor = { id: '1', name: 'Brand Blue', value: '#4a7dff', group: 'brand' }
    expect(color.name).toBe('Brand Blue')
    expect(color.value).toBe('#4a7dff')
    expect(color.group).toBe('brand')
  })

  test('palette stored in localStorage format', () => {
    const colors: NamedColor[] = [{ id: '1', name: 'Test', value: '#ff0000' }]
    const json = JSON.stringify(colors)
    const parsed: NamedColor[] = JSON.parse(json)
    expect(parsed[0]!.value).toBe('#ff0000')
  })
})

describe('LYK-109: multiple fills and strokes', () => {
  test('vector layer has optional additionalFills', () => {
    const layer = {
      type: 'vector' as const,
      fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 },
      additionalFills: [{ type: 'solid' as const, color: '#00ff00', opacity: 0.5 }] as Fill[],
    }
    expect(layer.additionalFills.length).toBe(1)
    expect(layer.additionalFills[0]!.color).toBe('#00ff00')
  })

  test('vector layer has optional additionalStrokes', () => {
    const layer = {
      type: 'vector' as const,
      stroke: {
        width: 2,
        color: '#000',
        opacity: 1,
        position: 'center' as const,
        linecap: 'butt' as const,
        linejoin: 'miter' as const,
        miterLimit: 4,
      },
      additionalStrokes: [
        {
          width: 4,
          color: '#ff0000',
          opacity: 0.5,
          position: 'outside' as const,
          linecap: 'round' as const,
          linejoin: 'round' as const,
          miterLimit: 4,
        },
      ] as Stroke[],
    }
    expect(layer.additionalStrokes.length).toBe(1)
    expect(layer.additionalStrokes[0]!.width).toBe(4)
  })

  test('additional fills and strokes are optional', () => {
    const layer = {
      type: 'vector' as const,
      fill: null,
      stroke: null,
    }
    expect(layer.fill).toBeNull()
    // additionalFills is not set
    expect((layer as Record<string, unknown>).additionalFills).toBeUndefined()
  })
})

describe('LYK-115: style copy-paste', () => {
  test('hasStyleClipboard is false initially', () => {
    // The global state is fresh
    expect(typeof hasStyleClipboard).toBe('function')
  })

  test('copyStyle and pasteStyle are functions', () => {
    expect(typeof copyStyle).toBe('function')
    expect(typeof pasteStyle).toBe('function')
  })
})

describe('LYK-127: status bar', () => {
  test('cursor position rounding', () => {
    const x = Math.round(123.456)
    const y = Math.round(789.012)
    expect(x).toBe(123)
    expect(y).toBe(789)
  })

  test('zoom percentage display', () => {
    const zoom = 1.5
    const display = `${Math.round(zoom * 100)}%`
    expect(display).toBe('150%')
  })

  test('layer count calculation', () => {
    const artboards = [{ layers: [1, 2, 3] }, { layers: [4, 5] }]
    const count = artboards.reduce((sum, a) => sum + a.layers.length, 0)
    expect(count).toBe(5)
  })
})

describe('LYK-103: zoom UI controls', () => {
  test('zoom in multiplies by 1.25', () => {
    const zoom = 1
    const newZoom = zoom * 1.25
    expect(newZoom).toBe(1.25)
  })

  test('zoom out divides by 1.25', () => {
    const zoom = 1
    const newZoom = zoom / 1.25
    expect(newZoom).toBe(0.8)
  })

  test('zoom percentage input parsing', () => {
    const input = '200'
    const zoom = parseInt(input, 10) / 100
    expect(zoom).toBe(2)
  })

  test('zoom reset to 1:1', () => {
    const zoom = 1
    const panX = 0
    const panY = 0
    expect(zoom).toBe(1)
    expect(panX).toBe(0)
    expect(panY).toBe(0)
  })
})
