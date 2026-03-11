import { describe, test, expect, afterAll } from 'bun:test'
import { renderMeshGradient, createDefaultMeshData } from '@/render/mesh-gradient'
import type { MeshGradientData } from '@/types'

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
  const calls: { method: string; args: any[] }[] = []
  return {
    ctx: {
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
      drawImage: (...args: any[]) => calls.push({ method: 'drawImage', args }),
      setTransform: () => {},
      resetTransform: () => {},
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createConicGradient: () => ({ addColorStop: () => {} }),
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
    } as unknown as CanvasRenderingContext2D,
    calls,
  }
}

// ── createDefaultMeshData ──

describe('createDefaultMeshData', () => {
  test('returns a 2x2 mesh', () => {
    const data = createDefaultMeshData()
    expect(data.rows).toBe(2)
    expect(data.cols).toBe(2)
  })

  test('has exactly rows*cols points', () => {
    const data = createDefaultMeshData()
    expect(data.points).toHaveLength(data.rows * data.cols)
  })

  test('points cover corners of unit square', () => {
    const data = createDefaultMeshData()
    // Top-left
    expect(data.points[0]!.x).toBe(0)
    expect(data.points[0]!.y).toBe(0)
    // Top-right
    expect(data.points[1]!.x).toBe(1)
    expect(data.points[1]!.y).toBe(0)
    // Bottom-left
    expect(data.points[2]!.x).toBe(0)
    expect(data.points[2]!.y).toBe(1)
    // Bottom-right
    expect(data.points[3]!.x).toBe(1)
    expect(data.points[3]!.y).toBe(1)
  })

  test('all points have valid colors and opacity', () => {
    const data = createDefaultMeshData()
    for (const p of data.points) {
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(p.opacity).toBeGreaterThanOrEqual(0)
      expect(p.opacity).toBeLessThanOrEqual(1)
    }
  })

  test('points have distinct colors', () => {
    const data = createDefaultMeshData()
    const colors = new Set(data.points.map((p) => p.color))
    expect(colors.size).toBe(4)
  })
})

// ── renderMeshGradient ──

describe('renderMeshGradient', () => {
  test('does not throw for a valid 2x2 mesh', () => {
    const { ctx } = mockCtx()
    const mesh = createDefaultMeshData()
    const bounds = { x: 10, y: 20, width: 200, height: 150 }
    expect(() => renderMeshGradient(ctx, mesh, bounds)).not.toThrow()
  })

  test('calls drawImage to composite the result', () => {
    const { ctx, calls } = mockCtx()
    const mesh = createDefaultMeshData()
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    renderMeshGradient(ctx, mesh, bounds)
    const drawCalls = calls.filter((c) => c.method === 'drawImage')
    expect(drawCalls).toHaveLength(1)
    // Check bounds are passed correctly
    expect(drawCalls[0]!.args[1]).toBe(0) // bounds.x
    expect(drawCalls[0]!.args[2]).toBe(0) // bounds.y
    expect(drawCalls[0]!.args[3]).toBe(100) // bounds.width
    expect(drawCalls[0]!.args[4]).toBe(100) // bounds.height
  })

  test('early returns for rows < 2', () => {
    const { ctx, calls } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 1,
      cols: 2,
      points: [
        { x: 0, y: 0, color: '#ff0000', opacity: 1 },
        { x: 1, y: 0, color: '#0000ff', opacity: 1 },
      ],
    }
    renderMeshGradient(ctx, mesh, { x: 0, y: 0, width: 100, height: 100 })
    expect(calls.filter((c) => c.method === 'drawImage')).toHaveLength(0)
  })

  test('early returns for cols < 2', () => {
    const { ctx, calls } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 2,
      cols: 1,
      points: [
        { x: 0, y: 0, color: '#ff0000', opacity: 1 },
        { x: 0, y: 1, color: '#0000ff', opacity: 1 },
      ],
    }
    renderMeshGradient(ctx, mesh, { x: 0, y: 0, width: 100, height: 100 })
    expect(calls.filter((c) => c.method === 'drawImage')).toHaveLength(0)
  })

  test('early returns when points.length < rows*cols', () => {
    const { ctx, calls } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 2,
      cols: 2,
      points: [{ x: 0, y: 0, color: '#ff0000', opacity: 1 }], // only 1 point, need 4
    }
    renderMeshGradient(ctx, mesh, { x: 0, y: 0, width: 100, height: 100 })
    expect(calls.filter((c) => c.method === 'drawImage')).toHaveLength(0)
  })

  test('renders 3x3 mesh correctly', () => {
    const { ctx, calls } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 3,
      cols: 3,
      points: [
        { x: 0, y: 0, color: '#ff0000', opacity: 1 },
        { x: 0.5, y: 0, color: '#00ff00', opacity: 1 },
        { x: 1, y: 0, color: '#0000ff', opacity: 1 },
        { x: 0, y: 0.5, color: '#ffff00', opacity: 0.8 },
        { x: 0.5, y: 0.5, color: '#ff00ff', opacity: 0.8 },
        { x: 1, y: 0.5, color: '#00ffff', opacity: 0.8 },
        { x: 0, y: 1, color: '#880000', opacity: 1 },
        { x: 0.5, y: 1, color: '#008800', opacity: 1 },
        { x: 1, y: 1, color: '#000088', opacity: 1 },
      ],
    }
    const bounds = { x: 5, y: 10, width: 300, height: 200 }
    renderMeshGradient(ctx, mesh, bounds)
    const drawCalls = calls.filter((c) => c.method === 'drawImage')
    expect(drawCalls).toHaveLength(1)
    expect(drawCalls[0]!.args[1]).toBe(5)
    expect(drawCalls[0]!.args[2]).toBe(10)
    expect(drawCalls[0]!.args[3]).toBe(300)
    expect(drawCalls[0]!.args[4]).toBe(200)
  })

  test('renders mesh with partial opacity', () => {
    const { ctx } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 2,
      cols: 2,
      points: [
        { x: 0, y: 0, color: '#ff0000', opacity: 0.5 },
        { x: 1, y: 0, color: '#0000ff', opacity: 0.5 },
        { x: 0, y: 1, color: '#00ff00', opacity: 0.5 },
        { x: 1, y: 1, color: '#ffff00', opacity: 0.5 },
      ],
    }
    expect(() => renderMeshGradient(ctx, mesh, { x: 0, y: 0, width: 100, height: 100 })).not.toThrow()
  })

  test('renders mesh with different bounds offsets', () => {
    const { ctx, calls } = mockCtx()
    const mesh = createDefaultMeshData()
    const bounds = { x: 50, y: 75, width: 400, height: 300 }
    renderMeshGradient(ctx, mesh, bounds)
    const drawCalls = calls.filter((c) => c.method === 'drawImage')
    expect(drawCalls).toHaveLength(1)
    expect(drawCalls[0]!.args[1]).toBe(50)
    expect(drawCalls[0]!.args[2]).toBe(75)
  })

  test('handles colors with leading hash', () => {
    const { ctx } = mockCtx()
    const mesh: MeshGradientData = {
      rows: 2,
      cols: 2,
      points: [
        { x: 0, y: 0, color: '#000000', opacity: 1 },
        { x: 1, y: 0, color: '#ffffff', opacity: 1 },
        { x: 0, y: 1, color: '#808080', opacity: 1 },
        { x: 1, y: 1, color: '#c0c0c0', opacity: 1 },
      ],
    }
    expect(() => renderMeshGradient(ctx, mesh, { x: 0, y: 0, width: 100, height: 100 })).not.toThrow()
  })
})
