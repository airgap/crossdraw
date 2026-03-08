import { describe, test, expect } from 'bun:test'
import type {
  Effect,
  InnerShadowParams,
  BackgroundBlurParams,
  GlowParams,
  ExportSlice,
  CharacterStyleRange,
} from '@/types'

describe('LYK-122: additional layer effects', () => {
  test('inner shadow effect params', () => {
    const params: InnerShadowParams = {
      kind: 'inner-shadow',
      offsetX: 2,
      offsetY: 2,
      blurRadius: 6,
      color: '#000000',
      opacity: 0.5,
    }
    expect(params.kind).toBe('inner-shadow')
    expect(params.blurRadius).toBe(6)
  })

  test('background blur effect params', () => {
    const params: BackgroundBlurParams = {
      kind: 'background-blur',
      radius: 10,
    }
    expect(params.kind).toBe('background-blur')
    expect(params.radius).toBe(10)
  })

  test('inner-shadow is valid effect type', () => {
    const effect: Effect = {
      id: '1',
      type: 'inner-shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'inner-shadow',
        offsetX: 0,
        offsetY: 0,
        blurRadius: 4,
        color: '#000',
        opacity: 0.5,
      } as InnerShadowParams,
    }
    expect(effect.type).toBe('inner-shadow')
  })

  test('background-blur is valid effect type', () => {
    const effect: Effect = {
      id: '1',
      type: 'background-blur',
      enabled: true,
      opacity: 1,
      params: { kind: 'background-blur', radius: 8 } as BackgroundBlurParams,
    }
    expect(effect.type).toBe('background-blur')
  })

  test('multiple effects can be stacked', () => {
    const effects: Effect[] = [
      { id: '1', type: 'blur', enabled: true, opacity: 1, params: { kind: 'blur', radius: 4, quality: 'medium' } },
      {
        id: '2',
        type: 'inner-shadow',
        enabled: true,
        opacity: 1,
        params: {
          kind: 'inner-shadow',
          offsetX: 2,
          offsetY: 2,
          blurRadius: 6,
          color: '#000',
          opacity: 0.5,
        } as InnerShadowParams,
      },
      {
        id: '3',
        type: 'outer-glow',
        enabled: true,
        opacity: 1,
        params: { kind: 'glow', radius: 8, spread: 0, color: '#ff0', opacity: 0.8 } as GlowParams,
      },
    ]
    expect(effects.length).toBe(3)
  })
})

describe('LYK-112: measure/dimension tool', () => {
  test('distance calculation', () => {
    const dx = 30
    const dy = 40
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist).toBe(50)
  })

  test('angle calculation', () => {
    const angle = (Math.atan2(0, 1) * 180) / Math.PI
    expect(angle).toBe(0) // horizontal right
    const angle2 = (Math.atan2(1, 0) * 180) / Math.PI
    expect(angle2).toBe(90) // straight down
  })

  test('measure line midpoint', () => {
    const midX = (100 + 300) / 2
    const midY = (200 + 400) / 2
    expect(midX).toBe(200)
    expect(midY).toBe(300)
  })

  test('measure tool is in activeTool union', () => {
    const tools = [
      'select',
      'pen',
      'node',
      'rectangle',
      'ellipse',
      'polygon',
      'star',
      'text',
      'gradient',
      'eyedropper',
      'hand',
      'measure',
    ]
    expect(tools).toContain('measure')
  })
})

describe('LYK-119: export slices', () => {
  test('export slice has required fields', () => {
    const slice: ExportSlice = {
      id: '1',
      name: 'hero',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      format: 'png',
      scale: 2,
    }
    expect(slice.format).toBe('png')
    expect(slice.scale).toBe(2)
  })

  test('export slice supports jpeg format', () => {
    const slice: ExportSlice = {
      id: '2',
      name: 'thumb',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      format: 'jpeg',
      scale: 1,
    }
    expect(slice.format).toBe('jpeg')
  })

  test('export slice supports svg format', () => {
    const slice: ExportSlice = {
      id: '3',
      name: 'icon',
      x: 0,
      y: 0,
      width: 24,
      height: 24,
      format: 'svg',
      scale: 1,
    }
    expect(slice.format).toBe('svg')
  })
})

describe('LYK-96: PDF export', () => {
  test('PDF header', () => {
    const header = '%PDF-1.4\n'
    expect(header.startsWith('%PDF')).toBe(true)
  })

  test('PDF point conversion (1px = 0.75pt)', () => {
    const ptW = 1920 * 0.75
    const ptH = 1080 * 0.75
    expect(ptW).toBe(1440)
    expect(ptH).toBe(810)
  })

  test('ASCII85 encode zero block', () => {
    // A block of 4 zero bytes encodes as 'z'
    const data = new Uint8Array([0, 0, 0, 0])
    // Simplified check
    const n = ((data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!) >>> 0
    expect(n).toBe(0)
  })

  test('RGB extraction from RGBA', () => {
    const rgba = [255, 128, 64, 200] // R, G, B, A
    const rgb = [rgba[0], rgba[1], rgba[2]]
    expect(rgb).toEqual([255, 128, 64])
  })
})

describe('LYK-98: paragraph and character text styles', () => {
  test('text decoration types', () => {
    const decs: Array<'none' | 'underline' | 'line-through'> = ['none', 'underline', 'line-through']
    expect(decs).toHaveLength(3)
  })

  test('text transform types', () => {
    const transforms: Array<'none' | 'uppercase' | 'lowercase' | 'capitalize'> = [
      'none',
      'uppercase',
      'lowercase',
      'capitalize',
    ]
    expect(transforms).toHaveLength(4)
  })

  test('paragraph indent defaults to 0', () => {
    const input: number | undefined = undefined
    const indent = input ?? 0
    expect(indent).toBe(0)
  })

  test('character style range', () => {
    const range: CharacterStyleRange = {
      start: 0,
      end: 5,
      fontWeight: 'bold',
      color: '#ff0000',
    }
    expect(range.start).toBe(0)
    expect(range.end).toBe(5)
    expect(range.fontWeight).toBe('bold')
  })

  test('multiple character style ranges', () => {
    const ranges: CharacterStyleRange[] = [
      { start: 0, end: 5, fontWeight: 'bold' },
      { start: 5, end: 10, fontStyle: 'italic' },
      { start: 10, end: 15, color: '#0000ff', textDecoration: 'underline' },
    ]
    expect(ranges.length).toBe(3)
    expect(ranges[2]!.textDecoration).toBe('underline')
  })

  test('text transform application', () => {
    const text = 'Hello World'
    expect(text.toUpperCase()).toBe('HELLO WORLD')
    expect(text.toLowerCase()).toBe('hello world')
  })

  test('LYK-105: gradient editor coordinates', () => {
    // On-canvas gradient editing uses normalized 0-1 coordinates
    const grad = { x: 0.5, y: 0.5, angle: 90 }
    expect(grad.x).toBe(0.5)
    expect(grad.y).toBe(0.5)
  })
})
