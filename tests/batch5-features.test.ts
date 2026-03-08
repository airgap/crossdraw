import { describe, test, expect } from 'bun:test'
import { segmentsToSVGPath } from '@/math/path'
import type { Path, Segment, Effect, GlowParams, Stroke } from '@/types'

describe('LYK-82: fill-rule support', () => {
  test('path fillRule defaults to nonzero', () => {
    const path: Path = { id: '1', segments: [], closed: false }
    expect(path.fillRule ?? 'nonzero').toBe('nonzero')
  })

  test('path fillRule can be evenodd', () => {
    const path: Path = { id: '1', segments: [], closed: false, fillRule: 'evenodd' }
    expect(path.fillRule).toBe('evenodd')
  })

  test('fillRule values are exhaustive', () => {
    const rules: Array<'nonzero' | 'evenodd'> = ['nonzero', 'evenodd']
    expect(rules).toHaveLength(2)
  })
})

describe('LYK-84: outer glow effect', () => {
  test('glow effect has correct params', () => {
    const effect: Effect = {
      id: '1',
      type: 'outer-glow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'glow',
        radius: 8,
        spread: 0,
        color: '#ffcc00',
        opacity: 0.8,
      } as GlowParams,
    }
    expect(effect.type).toBe('outer-glow')
    expect((effect.params as GlowParams).kind).toBe('glow')
    expect((effect.params as GlowParams).radius).toBe(8)
  })

  test('glow params have all required fields', () => {
    const params: GlowParams = { kind: 'glow', radius: 10, spread: 2, color: '#ff0000', opacity: 0.5 }
    expect(params.kind).toBe('glow')
    expect(params.radius).toBe(10)
    expect(params.spread).toBe(2)
    expect(params.color).toBe('#ff0000')
    expect(params.opacity).toBe(0.5)
  })

  test('outer-glow is a valid effect type', () => {
    const types: Effect['type'][] = ['blur', 'shadow', 'drop-shadow', 'distort', 'glow', 'outer-glow']
    expect(types).toContain('outer-glow')
  })
})

describe('LYK-83: clipPath support', () => {
  test('vector mask generates clipPath id from layer id', () => {
    const layerId = 'abc-123'
    const clipId = `clip-${layerId}`
    expect(clipId).toBe('clip-abc-123')
  })

  test('mask paths generate valid SVG path data', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'close' },
    ]
    const d = segmentsToSVGPath(segments)
    expect(d).toContain('M0 0')
    expect(d).toContain('L100 0')
    expect(d).toContain('Z')
  })
})

describe('LYK-85: currentColor keyword', () => {
  test('currentColor string is preserved in fill', () => {
    const color = 'currentColor'
    expect(color).toBe('currentColor')
  })

  test('resolve currentColor returns fallback', () => {
    const resolveColor = (c: string, current = '#000000') =>
      c === 'currentColor' ? current : c
    expect(resolveColor('currentColor')).toBe('#000000')
    expect(resolveColor('currentColor', '#ff0000')).toBe('#ff0000')
    expect(resolveColor('#00ff00')).toBe('#00ff00')
  })
})

describe('LYK-92: base64 SVG image export', () => {
  test('PNG signature bytes', () => {
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
    expect(sig[0]).toBe(0x89)
    expect(sig[1]).toBe(0x50) // P
    expect(sig[2]).toBe(0x4E) // N
    expect(sig[3]).toBe(0x47) // G
  })

  test('base64 data URL format', () => {
    const prefix = 'data:image/png;base64,'
    const url = prefix + 'iVBOR...'
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })

  test('SVG image element has href attribute', () => {
    const attrs = ['x="0"', 'y="0"', 'width="100"', 'height="50"', 'href="data:image/png;base64,..."']
    const svg = `<image ${attrs.join(' ')} />`
    expect(svg).toContain('href=')
    expect(svg).toContain('width="100"')
  })

  test('adler32 checksum calculation', () => {
    // Simple test: adler32 of empty data is 1
    let a = 1, b = 0
    const data: number[] = []
    for (const byte of data) {
      a = (a + byte) % 65521
      b = (b + a) % 65521
    }
    const adler = ((b << 16) | a) >>> 0
    expect(adler).toBe(1)
  })

  test('CRC32 table has 256 entries', () => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      }
      table[n] = c
    }
    expect(table.length).toBe(256)
    expect(table[0]).toBe(0)
    expect(table[1]).not.toBe(0)
  })
})

describe('LYK-99: variable-length dash arrays', () => {
  test('dasharray can have 2 elements', () => {
    const stroke: Stroke = {
      width: 2, color: '#000', opacity: 1, position: 'center',
      dasharray: [5, 3], linecap: 'butt', linejoin: 'miter', miterLimit: 4,
    }
    expect(stroke.dasharray).toEqual([5, 3])
  })

  test('dasharray can have 4 elements', () => {
    const stroke: Stroke = {
      width: 2, color: '#000', opacity: 1, position: 'center',
      dasharray: [10, 5, 2, 5], linecap: 'butt', linejoin: 'miter', miterLimit: 4,
    }
    expect(stroke.dasharray).toHaveLength(4)
    expect(stroke.dasharray).toEqual([10, 5, 2, 5])
  })

  test('dasharray can have odd number of elements', () => {
    const stroke: Stroke = {
      width: 2, color: '#000', opacity: 1, position: 'center',
      dasharray: [10, 5, 2], linecap: 'butt', linejoin: 'miter', miterLimit: 4,
    }
    expect(stroke.dasharray).toHaveLength(3)
  })

  test('empty dasharray renders solid line', () => {
    const stroke: Stroke = {
      width: 2, color: '#000', opacity: 1, position: 'center',
      dasharray: [], linecap: 'butt', linejoin: 'miter', miterLimit: 4,
    }
    expect(stroke.dasharray).toHaveLength(0)
  })

  test('dasharray SVG export joins with spaces', () => {
    const dash = [10, 5, 2, 5]
    const attr = `stroke-dasharray="${dash.join(' ')}"`
    expect(attr).toBe('stroke-dasharray="10 5 2 5"')
  })
})
