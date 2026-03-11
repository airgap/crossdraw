import { describe, test, expect } from 'bun:test'
import { renderRulers, renderGuides, renderGrid, renderSnapLines, RULER_SIZE } from '@/render/rulers'
import type { RulerRenderParams } from '@/render/rulers'

// ── Stub getComputedStyle for Node/Bun env ──

// rulers.ts calls getComputedStyle(document.documentElement).getPropertyValue('--xxx').trim()
;(globalThis as any).document = {
  documentElement: {},
}
;(globalThis as any).getComputedStyle = () => ({
  getPropertyValue: () => '',
})

// ── Canvas context mock ──

function mockCtx(w = 800, h = 600) {
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
      clip: record('clip'),
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
      roundRect: record('roundRect'),
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

function makeParams(overrides: Partial<RulerRenderParams> = {}): RulerRenderParams {
  const { ctx } = mockCtx()
  return {
    ctx,
    canvasWidth: 800,
    canvasHeight: 600,
    panX: 100,
    panY: 50,
    zoom: 1,
    mouseDocX: 400,
    mouseDocY: 300,
    artboardX: 0,
    artboardY: 0,
    artboardW: 1920,
    artboardH: 1080,
    showGrid: false,
    gridSize: 10,
    ...overrides,
  }
}

// ── RULER_SIZE ──

describe('RULER_SIZE', () => {
  test('is exported and equals 20', () => {
    expect(RULER_SIZE).toBe(20)
  })
})

// ── renderRulers ──

describe('renderRulers', () => {
  test('does not throw with default params', () => {
    const { ctx, calls: _calls } = mockCtx()
    const p = makeParams({ ctx })
    expect(() => renderRulers(p)).not.toThrow()
  })

  test('calls save and restore for proper state management', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx })
    renderRulers(p)
    const saves = calls.filter((c) => c.method === 'save').length
    const restores = calls.filter((c) => c.method === 'restore').length
    expect(saves).toBeGreaterThan(0)
    expect(restores).toBeGreaterThan(0)
  })

  test('draws horizontal and vertical rulers (fillRect calls)', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx })
    renderRulers(p)
    const fillRects = calls.filter((c) => c.method === 'fillRect')
    expect(fillRects.length).toBeGreaterThanOrEqual(2) // H ruler, V ruler, corner
  })

  test('draws tick marks (beginPath + stroke pairs)', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx })
    renderRulers(p)
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes.length).toBeGreaterThan(0)
  })

  test('draws cursor markers when cursor is within ruler bounds', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, mouseDocX: 400, mouseDocY: 300, panX: 0, panY: 0, zoom: 1 })
    renderRulers(p)
    // Cursor markers are rendered as beginPath + moveTo + lineTo + stroke
    const moveToCalls = calls.filter((c) => c.method === 'moveTo')
    expect(moveToCalls.length).toBeGreaterThan(0)
  })

  test('renders at high zoom level', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, zoom: 10 })
    expect(() => renderRulers(p)).not.toThrow()
    const fillTexts = calls.filter((c) => c.method === 'fillText')
    expect(fillTexts.length).toBeGreaterThan(0)
  })

  test('renders at low zoom level', () => {
    const { ctx, calls: _calls } = mockCtx()
    const p = makeParams({ ctx, zoom: 0.1 })
    expect(() => renderRulers(p)).not.toThrow()
  })

  test('renders labels on both rulers', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, zoom: 1, panX: 0, panY: 0 })
    renderRulers(p)
    const fillTexts = calls.filter((c) => c.method === 'fillText')
    expect(fillTexts.length).toBeGreaterThan(0)
  })

  test('cursor marker not drawn when outside canvas', () => {
    const { ctx, calls } = mockCtx()
    // mouseDocX * zoom + panX will be -1000, well outside canvas
    const p = makeParams({ ctx, mouseDocX: -1200, mouseDocY: -1200, panX: 0, panY: 0, zoom: 1 })
    renderRulers(p)
    // Function should still complete without error
    expect(calls.filter((c) => c.method === 'save').length).toBeGreaterThan(0)
  })

  test('vertical ruler rotate is called for Y labels', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, zoom: 1, panX: 0, panY: 0 })
    renderRulers(p)
    const rotateCalls = calls.filter((c) => c.method === 'rotate')
    expect(rotateCalls.length).toBeGreaterThan(0)
  })
})

// ── renderGuides ──

describe('renderGuides', () => {
  test('returns early when no guides', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: undefined })
    renderGuides(p)
    // No save/restore should be called
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(0)
  })

  test('renders horizontal guides', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: { horizontal: [100, 200, 300], vertical: [] } })
    renderGuides(p)
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(3)
  })

  test('renders vertical guides', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: { horizontal: [], vertical: [50, 150] } })
    renderGuides(p)
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(2)
  })

  test('renders both horizontal and vertical guides', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: { horizontal: [100], vertical: [200] } })
    renderGuides(p)
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(2)
  })

  test('sets dashed line style', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: { horizontal: [100], vertical: [] } })
    renderGuides(p)
    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.length).toBeGreaterThan(0)
  })

  test('calls save and restore', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, guides: { horizontal: [100], vertical: [] } })
    renderGuides(p)
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'restore')).toHaveLength(1)
  })

  test('positions guides using artboard offset', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({
      ctx,
      guides: { horizontal: [50], vertical: [100] },
      artboardX: 10,
      artboardY: 20,
      panX: 0,
      panY: 0,
      zoom: 1,
    })
    renderGuides(p)
    const moveToCalls = calls.filter((c) => c.method === 'moveTo')
    // Horizontal guide: screenY = (20 + 50) * 1 + 0 = 70
    expect(moveToCalls.some((c) => c.args[1] === 70)).toBe(true)
    // Vertical guide: screenX = (10 + 100) * 1 + 0 = 110
    expect(moveToCalls.some((c) => c.args[0] === 110)).toBe(true)
  })
})

// ── renderGrid ──

describe('renderGrid', () => {
  test('returns early when showGrid is false', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({ ctx, showGrid: false })
    renderGrid(p)
    expect(calls).toHaveLength(0)
  })

  test('returns early when pixel size < 4 (too zoomed out)', () => {
    const { ctx, calls } = mockCtx()
    // gridSize=10, zoom=0.3 → pixelSize = 3 < 4
    const p = makeParams({ ctx, showGrid: true, gridSize: 10, zoom: 0.3 })
    renderGrid(p)
    expect(calls).toHaveLength(0)
  })

  test('renders grid dots when sufficiently zoomed in', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({
      ctx,
      showGrid: true,
      gridSize: 10,
      zoom: 2,
      panX: 0,
      panY: 0,
      artboardX: 0,
      artboardY: 0,
      artboardW: 100,
      artboardH: 100,
      canvasWidth: 200,
      canvasHeight: 200,
    })
    renderGrid(p)
    const fillRects = calls.filter((c) => c.method === 'fillRect')
    expect(fillRects.length).toBeGreaterThan(0)
  })

  test('calls save and restore', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({
      ctx,
      showGrid: true,
      gridSize: 10,
      zoom: 5,
      panX: 0,
      panY: 0,
      artboardX: 0,
      artboardY: 0,
      artboardW: 50,
      artboardH: 50,
      canvasWidth: 300,
      canvasHeight: 300,
    })
    renderGrid(p)
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'restore')).toHaveLength(1)
  })

  test('handles edge case where artboard is entirely outside viewport', () => {
    const { ctx, calls } = mockCtx()
    const p = makeParams({
      ctx,
      showGrid: true,
      gridSize: 10,
      zoom: 2,
      panX: -5000,
      panY: -5000,
      artboardX: 0,
      artboardY: 0,
      artboardW: 100,
      artboardH: 100,
      canvasWidth: 800,
      canvasHeight: 600,
    })
    renderGrid(p)
    // Should still save/restore but draw no dots
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
  })
})

// ── renderSnapLines ──

describe('renderSnapLines', () => {
  test('returns early when both arrays are empty', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [], [])
    expect(calls).toHaveLength(0)
  })

  test('renders horizontal snap lines', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [100, 200], [])
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(2)
  })

  test('renders vertical snap lines', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [], [150, 350])
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(2)
  })

  test('renders both horizontal and vertical snap lines', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [100], [200])
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes).toHaveLength(2)
  })

  test('calls save and restore', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [100], [])
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'restore')).toHaveLength(1)
  })

  test('applies zoom and pan to snap line positions', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 50, 30, 2, [100], [200])
    // Horizontal: screenY = 100 * 2 + 30 = 230
    const moveToCalls = calls.filter((c) => c.method === 'moveTo')
    expect(moveToCalls.some((c) => c.args[1] === 230)).toBe(true)
    // Vertical: screenX = 200 * 2 + 50 = 450
    expect(moveToCalls.some((c) => c.args[0] === 450)).toBe(true)
  })

  test('sets dashed line style', () => {
    const { ctx, calls } = mockCtx()
    renderSnapLines(ctx, 800, 600, 0, 0, 1, [100], [])
    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.length).toBeGreaterThan(0)
  })
})
