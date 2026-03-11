import { describe, test, expect, afterAll } from 'bun:test'
import { renderVariableStroke, matchWidthPreset, WIDTH_PRESETS, WIDTH_PRESET_LABELS } from '@/render/variable-stroke'
import type { Path, Stroke, Segment } from '@/types'

// ── Polyfill Path2D for Bun test env ──

const origPath2D = globalThis.Path2D

afterAll(() => {
  if (origPath2D !== undefined) {
    globalThis.Path2D = origPath2D
  } else {
    delete (globalThis as any).Path2D
  }
})

if (typeof globalThis.Path2D === 'undefined') {
  ;(globalThis as any).Path2D = class Path2D {
    constructor() {}
  }
}

// ── Canvas context mock ──

function mockCtx(w = 100, h = 100) {
  const calls: { method: string; args: any[] }[] = []
  const record =
    (name: string) =>
    (...args: any[]) =>
      calls.push({ method: name, args })
  return {
    ctx: {
      canvas: { width: w, height: h },
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      bezierCurveTo: record('bezierCurveTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      closePath: record('closePath'),
      fill: record('fill'),
      stroke: record('stroke'),
      arc: record('arc'),
      rect: record('rect'),
      save: record('save'),
      restore: record('restore'),
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      strokeRect: record('strokeRect'),
      drawImage: record('drawImage'),
      setTransform: record('setTransform'),
      resetTransform: record('resetTransform'),
      scale: record('scale'),
      translate: record('translate'),
      rotate: record('rotate'),
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: record('putImageData'),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createConicGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => ({}),
      measureText: () => ({ width: 50, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
      fillText: record('fillText'),
      strokeText: record('strokeText'),
      setLineDash: record('setLineDash'),
      getLineDash: () => [],
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      font: '12px sans-serif',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      shadowBlur: 0,
      shadowColor: 'transparent',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D,
    calls,
  }
}

function makePath(segments: Segment[]): Path {
  return { id: 'path1', segments, closed: false }
}

function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    width: 4,
    color: '#ff0000',
    opacity: 1,
    position: 'center',
    linecap: 'round',
    linejoin: 'round',
    miterLimit: 10,
    ...overrides,
  }
}

const dummyPath2D = new Path2D()

// ── WIDTH_PRESETS ──

describe('WIDTH_PRESETS', () => {
  test('contains expected preset keys', () => {
    expect(WIDTH_PRESETS).toHaveProperty('uniform')
    expect(WIDTH_PRESETS).toHaveProperty('taper')
    expect(WIDTH_PRESETS).toHaveProperty('taperStart')
    expect(WIDTH_PRESETS).toHaveProperty('taperEnd')
    expect(WIDTH_PRESETS).toHaveProperty('bulge')
    expect(WIDTH_PRESETS).toHaveProperty('pressure')
  })

  test('all presets have at least 2 entries', () => {
    for (const [, entries] of Object.entries(WIDTH_PRESETS)) {
      expect(entries.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('all preset entries have position in [0, 1]', () => {
    for (const [, entries] of Object.entries(WIDTH_PRESETS)) {
      for (const [pos] of entries) {
        expect(pos).toBeGreaterThanOrEqual(0)
        expect(pos).toBeLessThanOrEqual(1)
      }
    }
  })

  test('preset entries are sorted by position', () => {
    for (const [, entries] of Object.entries(WIDTH_PRESETS)) {
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]![0]).toBeGreaterThanOrEqual(entries[i - 1]![0])
      }
    }
  })
})

// ── WIDTH_PRESET_LABELS ──

describe('WIDTH_PRESET_LABELS', () => {
  test('has a label for every preset', () => {
    for (const key of Object.keys(WIDTH_PRESETS)) {
      expect(WIDTH_PRESET_LABELS).toHaveProperty(key)
      expect(typeof WIDTH_PRESET_LABELS[key]).toBe('string')
    }
  })
})

// ── matchWidthPreset ──

describe('matchWidthPreset', () => {
  test('returns null for undefined profile', () => {
    expect(matchWidthPreset(undefined)).toBeNull()
  })

  test('returns null for empty profile', () => {
    expect(matchWidthPreset([])).toBeNull()
  })

  test('matches uniform preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.uniform)).toBe('uniform')
  })

  test('matches taper preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.taper)).toBe('taper')
  })

  test('matches taperStart preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.taperStart)).toBe('taperStart')
  })

  test('matches taperEnd preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.taperEnd)).toBe('taperEnd')
  })

  test('matches bulge preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.bulge)).toBe('bulge')
  })

  test('matches pressure preset', () => {
    expect(matchWidthPreset(WIDTH_PRESETS.pressure)).toBe('pressure')
  })

  test('returns null for custom profile not matching any preset', () => {
    const custom: [number, number][] = [
      [0, 0.5],
      [0.5, 2],
      [1, 0.5],
    ]
    expect(matchWidthPreset(custom)).toBeNull()
  })

  test('returns null for profile with wrong length', () => {
    const partial: [number, number][] = [[0, 1]]
    expect(matchWidthPreset(partial)).toBeNull()
  })
})

// ── renderVariableStroke ──

describe('renderVariableStroke', () => {
  test('falls back to normal stroke when no widthProfile', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: undefined })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    const strokeCalls = calls.filter((c) => c.method === 'stroke')
    expect(strokeCalls.length).toBe(1)
    // Should not call fill (variable stroke does fill instead)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(0)
  })

  test('falls back to normal stroke when widthProfile is empty', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: [] })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'stroke').length).toBe(1)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(0)
  })

  test('renders variable stroke with taper profile', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taper, width: 10 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    // Variable stroke uses fill, not stroke
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
    expect(calls.filter((c) => c.method === 'beginPath').length).toBe(1)
    expect(calls.filter((c) => c.method === 'closePath').length).toBe(1)
    // Should have moveTo and lineTo calls for offset curves
    expect(calls.filter((c) => c.method === 'moveTo').length).toBe(1)
    expect(calls.filter((c) => c.method === 'lineTo').length).toBeGreaterThan(0)
  })

  test('renders variable stroke with uniform profile', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 50 },
      { type: 'line', x: 100, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.uniform, width: 6 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('handles path with only a move segment (< 2 points flattened)', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([{ type: 'move', x: 50, y: 50 }])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taper, width: 5 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    // Falls back to normal stroke since < 2 points
    expect(calls.filter((c) => c.method === 'stroke').length).toBe(1)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(0)
  })

  test('handles zero-length path (move to same point)', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 50, y: 50 },
      { type: 'line', x: 50, y: 50 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taper, width: 5 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    // totalLength=0, falls back to normal stroke
    expect(calls.filter((c) => c.method === 'stroke').length).toBe(1)
  })

  test('handles cubic bezier paths', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: -50 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.bulge, width: 8 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
    // Cubic path is flattened into many line-to calls
    expect(calls.filter((c) => c.method === 'lineTo').length).toBeGreaterThan(10)
  })

  test('handles quadratic bezier paths', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 60 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taperEnd, width: 6 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('handles closed paths', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'close' },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.pressure, width: 4 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('handles arc segments', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 50 },
      { type: 'arc', x: 100, y: 50, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taper, width: 4 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('handles degenerate arc (same start and end point)', () => {
    const { ctx, calls: _calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 50, y: 50 },
      { type: 'arc', x: 50, y: 50, rx: 0, ry: 0, rotation: 0, largeArc: false, sweep: true },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taper, width: 4 })
    // Should not throw
    expect(() => renderVariableStroke(ctx, path, stroke, dummyPath2D)).not.toThrow()
  })

  test('handles arc with large radii needing scaling', () => {
    const { ctx, calls: _calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 100, y: 100, rx: 10, ry: 10, rotation: 45, largeArc: true, sweep: false },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.uniform, width: 4 })
    expect(() => renderVariableStroke(ctx, path, stroke, dummyPath2D)).not.toThrow()
  })

  test('handles close segment where current position differs from start', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 10, y: 10 },
      { type: 'line', x: 90, y: 10 },
      { type: 'line', x: 90, y: 90 },
      { type: 'close' },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.taperStart, width: 5 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('handles close segment where current position already at start', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 10, y: 10 },
      { type: 'line', x: 90, y: 10 },
      { type: 'line', x: 10, y: 10 },
      { type: 'close' },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.uniform, width: 5 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('single-point width profile returns constant width', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: [[0.5, 2]], width: 5 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
  })

  test('complex multi-segment path', () => {
    const { ctx, calls } = mockCtx()
    const path = makePath([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'cubic', x: 100, y: 50, cp1x: 75, cp1y: 0, cp2x: 100, cp2y: 25 },
      { type: 'quadratic', x: 150, y: 50, cpx: 125, cpy: 100 },
      { type: 'line', x: 200, y: 0 },
    ])
    const stroke = makeStroke({ widthProfile: WIDTH_PRESETS.pressure, width: 8 })
    renderVariableStroke(ctx, path, stroke, dummyPath2D)
    expect(calls.filter((c) => c.method === 'fill').length).toBe(1)
    expect(calls.filter((c) => c.method === 'lineTo').length).toBeGreaterThan(20)
  })
})
