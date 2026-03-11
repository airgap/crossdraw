import { describe, test, expect, afterAll } from 'bun:test'
import { createCanvasGradient, renderBoxGradient, interpolateStops, parseHexColor, hexToRgba } from '@/render/gradient'
import type { Gradient } from '@/types'

// ── Polyfill OffscreenCanvas for Bun test env ──

const origOffscreenCanvas = globalThis.OffscreenCanvas

afterAll(() => {
  if (origOffscreenCanvas !== undefined) {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  } else {
    delete (globalThis as any).OffscreenCanvas
  }
})

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext(_type: string) {
      const w = this.width
      const h = this.height
      return {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        }),
        putImageData: () => {},
        drawImage: () => {},
        getImageData: (_x: number, _y: number, iw: number, ih: number) => ({
          data: new Uint8ClampedArray(iw * ih * 4),
          width: iw,
          height: ih,
          colorSpace: 'srgb',
        }),
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        scale: () => {},
        translate: () => {},
        rotate: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        measureText: () => ({ width: 50 }),
        fillText: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        canvas: { width: w, height: h },
      }
    }
  }
}

// ── Canvas context mock ──

function mockCtx(w = 100, h = 100) {
  const addColorStop = () => {}
  return {
    canvas: { width: w, height: h },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    rect: () => {},
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop }),
    createRadialGradient: () => ({ addColorStop }),
    createConicGradient: () => ({ addColorStop }),
    createPattern: () => ({}),
    measureText: () => ({ width: 50, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
    fillText: () => {},
    strokeText: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D
}

function makeGradient(overrides: Partial<Gradient> = {}): Gradient {
  return {
    id: 'g1',
    name: 'Test',
    type: 'linear',
    angle: 0,
    x: 0.5,
    y: 0.5,
    radius: 0.5,
    stops: [
      { offset: 0, color: '#000000', opacity: 1 },
      { offset: 1, color: '#ffffff', opacity: 1 },
    ],
    dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    ...overrides,
  }
}

// ── createCanvasGradient ──

describe('createCanvasGradient', () => {
  test('linear gradient returns a CanvasGradient-like object', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'linear', angle: 45 })
    const result = createCanvasGradient(ctx, grad, 200, 100)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('addColorStop')
  })

  test('linear gradient with no angle defaults to 0', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'linear', angle: undefined })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).not.toBeNull()
  })

  test('radial gradient returns a CanvasGradient-like object', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'radial', radius: 0.8 })
    const result = createCanvasGradient(ctx, grad, 200, 200)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('addColorStop')
  })

  test('radial gradient with no radius defaults to 0.5', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'radial', radius: undefined })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).not.toBeNull()
  })

  test('conical gradient returns a CanvasGradient-like object', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'conical', angle: 90 })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('addColorStop')
  })

  test('conical gradient with no angle defaults to 0', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'conical', angle: undefined })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).not.toBeNull()
  })

  test('box gradient returns null (handled separately)', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'box' })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).toBeNull()
  })

  test('mesh gradient returns null (handled separately)', () => {
    const ctx = mockCtx()
    const grad = makeGradient({ type: 'mesh' })
    const result = createCanvasGradient(ctx, grad, 100, 100)
    expect(result).toBeNull()
  })

  test('addColorStop is called with clamped offsets', () => {
    const addedStops: [number, string][] = []
    const ctx = {
      ...mockCtx(),
      createLinearGradient: () => ({
        addColorStop: (offset: number, color: string) => addedStops.push([offset, color]),
      }),
    } as unknown as CanvasRenderingContext2D
    const grad = makeGradient({
      type: 'linear',
      stops: [
        { offset: -0.5, color: '#ff0000', opacity: 1 },
        { offset: 1.5, color: '#0000ff', opacity: 0.5 },
      ],
    })
    createCanvasGradient(ctx, grad, 100, 100)
    expect(addedStops[0]![0]).toBe(0) // clamped from -0.5 to 0
    expect(addedStops[1]![0]).toBe(1) // clamped from 1.5 to 1
  })

  test('linear gradient uses correct center and angle', () => {
    let args: number[] = []
    const ctx = {
      ...mockCtx(),
      createLinearGradient: (...a: number[]) => {
        args = a
        return { addColorStop: () => {} }
      },
    } as unknown as CanvasRenderingContext2D
    const grad = makeGradient({ type: 'linear', angle: 0, x: 0.5, y: 0.5 })
    createCanvasGradient(ctx, grad, 200, 100)
    // angle=0 means cos(0)=1, sin(0)=0; cx=100, cy=50; len=200
    // start: (100 - 100, 50 - 0) = (0, 50), end: (100 + 100, 50 + 0) = (200, 50)
    expect(args[0]).toBeCloseTo(0)
    expect(args[1]).toBeCloseTo(50)
    expect(args[2]).toBeCloseTo(200)
    expect(args[3]).toBeCloseTo(50)
  })

  test('radial gradient uses correct center and radius', () => {
    let args: number[] = []
    const ctx = {
      ...mockCtx(),
      createRadialGradient: (...a: number[]) => {
        args = a
        return { addColorStop: () => {} }
      },
    } as unknown as CanvasRenderingContext2D
    const grad = makeGradient({ type: 'radial', x: 0.5, y: 0.5, radius: 0.5 })
    createCanvasGradient(ctx, grad, 200, 100)
    // cx=100, cy=50, r=0.5*200=100
    expect(args[0]).toBe(100)
    expect(args[1]).toBe(50)
    expect(args[2]).toBe(0)
    expect(args[3]).toBe(100)
    expect(args[4]).toBe(50)
    expect(args[5]).toBe(100)
  })

  test('conical gradient uses correct start angle and center', () => {
    let args: number[] = []
    const ctx = {
      ...mockCtx(),
      createConicGradient: (...a: number[]) => {
        args = a
        return { addColorStop: () => {} }
      },
    } as unknown as CanvasRenderingContext2D
    const grad = makeGradient({ type: 'conical', angle: 90, x: 0.5, y: 0.5 })
    createCanvasGradient(ctx, grad, 100, 100)
    // startAngle = (90 * PI) / 180 = PI/2
    expect(args[0]).toBeCloseTo(Math.PI / 2)
    expect(args[1]).toBe(50)
    expect(args[2]).toBe(50)
  })
})

// ── interpolateStops (additional coverage) ──

describe('interpolateStops additional coverage', () => {
  test('empty stops returns black with full alpha', () => {
    const [r, g, b, a] = interpolateStops([], 0.5)
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
    expect(a).toBe(255)
  })

  test('single stop returns its color at any t', () => {
    const stops = [{ offset: 0.5, r: 100, g: 150, b: 200, a: 128 }]
    const [r, g, b, a] = interpolateStops(stops, 0.9)
    expect(r).toBe(100)
    expect(g).toBe(150)
    expect(b).toBe(200)
    expect(a).toBe(128)
  })

  test('t before first stop returns first stop color', () => {
    const stops = [
      { offset: 0.2, r: 50, g: 60, b: 70, a: 255 },
      { offset: 0.8, r: 200, g: 210, b: 220, a: 255 },
    ]
    const [r, g, b] = interpolateStops(stops, 0.1)
    expect(r).toBe(50)
    expect(g).toBe(60)
    expect(b).toBe(70)
  })

  test('t after last stop returns last stop color', () => {
    const stops = [
      { offset: 0.2, r: 50, g: 60, b: 70, a: 255 },
      { offset: 0.8, r: 200, g: 210, b: 220, a: 255 },
    ]
    const [r, g, b] = interpolateStops(stops, 0.95)
    expect(r).toBe(200)
    expect(g).toBe(210)
    expect(b).toBe(220)
  })

  test('interpolates between three stops correctly', () => {
    const stops = [
      { offset: 0, r: 0, g: 0, b: 0, a: 255 },
      { offset: 0.5, r: 128, g: 128, b: 128, a: 255 },
      { offset: 1, r: 255, g: 255, b: 255, a: 255 },
    ]
    // At t=0.75, should be between stops[1] and stops[2]
    const [r, g, b] = interpolateStops(stops, 0.75)
    // f = (0.75 - 0.5) / (1 - 0.5) = 0.5
    expect(r).toBe(Math.round(128 + (255 - 128) * 0.5)) // 192
    expect(g).toBe(192)
    expect(b).toBe(192)
  })

  test('interpolates alpha channel', () => {
    const stops = [
      { offset: 0, r: 0, g: 0, b: 0, a: 0 },
      { offset: 1, r: 0, g: 0, b: 0, a: 255 },
    ]
    const [, , , a] = interpolateStops(stops, 0.5)
    expect(a).toBe(128)
  })

  test('handles stops with same offset (range=0)', () => {
    const stops = [
      { offset: 0.5, r: 100, g: 100, b: 100, a: 255 },
      { offset: 0.5, r: 200, g: 200, b: 200, a: 255 },
    ]
    const [r] = interpolateStops(stops, 0.5)
    // t <= low.offset returns low color (first matching stop)
    expect(r).toBe(100)
  })

  test('handles stops with same offset and t above (range=0, f=0)', () => {
    const stops = [
      { offset: 0.3, r: 50, g: 50, b: 50, a: 255 },
      { offset: 0.5, r: 100, g: 100, b: 100, a: 255 },
      { offset: 0.5, r: 200, g: 200, b: 200, a: 255 },
    ]
    // t=0.5 finds the pair at index 1-2 (both offset 0.5)
    // t <= low.offset (0.5 <= 0.5) returns low color
    const [r] = interpolateStops(stops, 0.5)
    expect(r).toBe(100)
  })
})

// ── parseHexColor additional coverage ──

describe('parseHexColor additional coverage', () => {
  test('white', () => {
    const { r, g, b } = parseHexColor('#ffffff')
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })

  test('partial invalid hex returns 0 for invalid components', () => {
    const { r, g, b } = parseHexColor('#zzzzzz')
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  test('short string returns 0 for missing components', () => {
    const { r, g, b } = parseHexColor('#ff')
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })
})

// ── hexToRgba additional coverage ──

describe('hexToRgba additional coverage', () => {
  test('zero opacity', () => {
    expect(hexToRgba('#ff0000', 0)).toBe('rgba(255,0,0,0)')
  })

  test('arbitrary color and opacity', () => {
    expect(hexToRgba('#80c0ff', 0.75)).toBe('rgba(128,192,255,0.75)')
  })
})

// ── renderBoxGradient ──

describe('renderBoxGradient', () => {
  test('returns an OffscreenCanvas of correct size', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
    })
    const result = renderBoxGradient(ctx, grad, 50, 50)
    expect(result).toBeInstanceOf(OffscreenCanvas)
    expect(result.width).toBe(50)
    expect(result.height).toBe(50)
  })

  test('renders without throwing for 1x1 size', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: '#000000', opacity: 1 },
        { offset: 1, color: '#ffffff', opacity: 1 },
      ],
    })
    const result = renderBoxGradient(ctx, grad, 1, 1)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
  })

  test('renders with multiple stops', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 0.5, color: '#00ff00', opacity: 0.5 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
    })
    const result = renderBoxGradient(ctx, grad, 20, 20)
    expect(result.width).toBe(20)
    expect(result.height).toBe(20)
  })

  test('renders with zero radius (maxDist=0)', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0, // maxDist will be 0
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
    })
    // Should not throw
    const result = renderBoxGradient(ctx, grad, 10, 10)
    expect(result.width).toBe(10)
  })

  test('renders with single stop', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [{ offset: 0.5, color: '#888888', opacity: 1 }],
    })
    const result = renderBoxGradient(ctx, grad, 10, 10)
    expect(result.width).toBe(10)
  })

  test('renders with no stops (empty)', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [],
    })
    const result = renderBoxGradient(ctx, grad, 10, 10)
    expect(result.width).toBe(10)
  })

  test('handles non-center position', () => {
    const ctx = mockCtx()
    const grad = makeGradient({
      type: 'box',
      x: 0,
      y: 0,
      radius: 1,
      stops: [
        { offset: 0, color: '#ffffff', opacity: 1 },
        { offset: 1, color: '#000000', opacity: 1 },
      ],
    })
    const result = renderBoxGradient(ctx, grad, 20, 20)
    expect(result.width).toBe(20)
  })
})
