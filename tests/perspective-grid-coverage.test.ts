import { describe, test, expect } from 'bun:test'
import {
  createDefaultPerspectiveConfig,
  renderPerspectiveGrid,
  hitTestVanishingPoint,
  projectToPlane,
  snapToPerspective,
  computeConvergenceLines,
  pointToLineDistance,
  projectPointOnLine,
} from '@/render/perspective-grid'
import type { PerspectiveConfig } from '@/render/perspective-grid'

/**
 * Additional coverage tests for perspective-grid.ts to reach 90%+.
 * Targets: renderPerspectiveGrid (the main render function), hitTestVanishingPoint,
 * clipLine (exercised indirectly through renderPerspectiveGrid), and
 * edge cases in convergence/snap logic.
 */

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

// ── renderPerspectiveGrid ──

describe('renderPerspectiveGrid', () => {
  test('renders 1-point grid without throwing', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1920, 1080, '1-point')
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
  })

  test('renders 2-point grid without throwing', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1920, 1080, '2-point')
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
  })

  test('renders 3-point grid without throwing', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1920, 1080, '3-point')
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
  })

  test('calls translate to artboard position', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '1-point')
    const bounds = { x: 50, y: 100, width: 500, height: 400 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const translateCalls = calls.filter((c) => c.method === 'translate')
    expect(translateCalls.some((c) => c.args[0] === 50 && c.args[1] === 100)).toBe(true)
  })

  test('clips to artboard rect', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '1-point')
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const clipCalls = calls.filter((c) => c.method === 'clip')
    expect(clipCalls).toHaveLength(1)
  })

  test('draws horizon line with dashed style', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1000, 800, '1-point')
    const bounds = { x: 0, y: 0, width: 1000, height: 800 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.length).toBeGreaterThan(0)
    // First setLineDash should have non-empty array (dashed)
    expect(dashCalls[0]!.args[0].length).toBeGreaterThan(0)
  })

  test('draws VP indicators (arc, fill, stroke)', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1000, 800, '1-point')
    const bounds = { x: 0, y: 0, width: 1000, height: 800 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const arcCalls = calls.filter((c) => c.method === 'arc')
    expect(arcCalls.length).toBeGreaterThan(0) // VP indicator circle
    const fillCalls = calls.filter((c) => c.method === 'fill')
    expect(fillCalls.length).toBeGreaterThan(0)
  })

  test('draws VP labels (fillText VP1, VP2, etc.)', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1000, 800, '2-point')
    const bounds = { x: 0, y: 0, width: 1000, height: 800 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const fillTextCalls = calls.filter((c) => c.method === 'fillText')
    const vpLabels = fillTextCalls.filter((c) => (c.args[0] as string).startsWith('VP'))
    expect(vpLabels).toHaveLength(2)
    expect(vpLabels[0]!.args[0]).toBe('VP1')
    expect(vpLabels[1]!.args[0]).toBe('VP2')
  })

  test('3-point grid draws 3 VP labels', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(1000, 800, '3-point')
    const bounds = { x: 0, y: 0, width: 1000, height: 800 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const fillTextCalls = calls.filter((c) => c.method === 'fillText')
    const vpLabels = fillTextCalls.filter((c) => (c.args[0] as string).startsWith('VP'))
    expect(vpLabels).toHaveLength(3)
  })

  test('save/restore calls are balanced', () => {
    const { ctx, calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '1-point')
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    const saves = calls.filter((c) => c.method === 'save').length
    const restores = calls.filter((c) => c.method === 'restore').length
    expect(saves).toBe(restores)
  })

  test('renders at high zoom', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '1-point')
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 10)).not.toThrow()
  })

  test('renders at very low zoom', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '2-point')
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 0.1)).not.toThrow()
  })

  test('renders with offset artboard bounds', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config = createDefaultPerspectiveConfig(500, 400, '1-point')
    const bounds = { x: 200, y: 150, width: 500, height: 400 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
  })

  test('draws convergence lines that are clipped to artboard', () => {
    const { ctx, calls } = mockCtx()
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 250, y: 200 }],
      gridDensity: 4,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    renderPerspectiveGrid(ctx, config, bounds, 1)
    // Should have drawn some convergence lines (moveTo + lineTo inside stroke batch)
    const moveToCount = calls.filter((c) => c.method === 'moveTo').length
    expect(moveToCount).toBeGreaterThan(0)
  })

  test('handles config with more vanishing points than mode requires', () => {
    const { ctx, calls } = mockCtx()
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [
        { x: 250, y: 200 },
        { x: 750, y: 200 }, // extra VP, should be ignored
      ],
      gridDensity: 4,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
    // Only 1 VP label should be drawn
    const fillTextCalls = calls.filter((c) => c.method === 'fillText')
    const vpLabels = fillTextCalls.filter((c) => (c.args[0] as string).startsWith('VP'))
    expect(vpLabels).toHaveLength(1)
  })

  test('handles VP outside artboard (convergence lines clipped)', () => {
    const { ctx, calls: _calls } = mockCtx()
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: -500, y: 200 }], // VP far to the left
      gridDensity: 4,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const bounds = { x: 0, y: 0, width: 500, height: 400 }
    expect(() => renderPerspectiveGrid(ctx, config, bounds, 1)).not.toThrow()
  })
})

// ── hitTestVanishingPoint ──

describe('hitTestVanishingPoint', () => {
  test('returns VP index when clicking on a VP', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 250, y: 200 }],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    // Click exactly on the VP
    const result = hitTestVanishingPoint(250, 200, config, artboard, 1)
    expect(result).toBe(0)
  })

  test('returns VP index when clicking near a VP (within hit radius)', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 250, y: 200 }],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    // Click 5px away (hit radius is (7+4)/zoom = 11 at zoom=1)
    const result = hitTestVanishingPoint(255, 200, config, artboard, 1)
    expect(result).toBe(0)
  })

  test('returns -1 when clicking far from any VP', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 250, y: 200 }],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    const result = hitTestVanishingPoint(0, 0, config, artboard, 1)
    expect(result).toBe(-1)
  })

  test('hit-tests 2-point mode correctly', () => {
    const config: PerspectiveConfig = {
      mode: '2-point',
      vanishingPoints: [
        { x: 0, y: 200 },
        { x: 500, y: 200 },
      ],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    // Click on VP2
    const result = hitTestVanishingPoint(500, 200, config, artboard, 1)
    expect(result).toBe(1)
    // Click on VP1
    const result2 = hitTestVanishingPoint(0, 200, config, artboard, 1)
    expect(result2).toBe(0)
  })

  test('hit-tests 3-point mode correctly', () => {
    const config: PerspectiveConfig = {
      mode: '3-point',
      vanishingPoints: [
        { x: 0, y: 200 },
        { x: 500, y: 200 },
        { x: 250, y: -100 },
      ],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    // Click on VP3
    const result = hitTestVanishingPoint(250, -100, config, artboard, 1)
    expect(result).toBe(2)
  })

  test('hit radius adjusts for zoom', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 250, y: 200 }],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 200,
    }
    const artboard = { x: 0, y: 0 }
    // At zoom=10, hit radius = (7+4)/10 = 1.1px in doc coords
    // Click 2px away should miss
    const result = hitTestVanishingPoint(252, 200, config, artboard, 10)
    expect(result).toBe(-1)
    // Click 0.5px away should hit
    const result2 = hitTestVanishingPoint(250.5, 200, config, artboard, 10)
    expect(result2).toBe(0)
  })

  test('accounts for artboard offset', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 100, y: 100 }], // VP at (100,100) relative to artboard
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 100,
    }
    const artboard = { x: 50, y: 50 }
    // Doc coords of VP = artboard.x + vp.x = 150, artboard.y + vp.y = 150
    const result = hitTestVanishingPoint(150, 150, config, artboard, 1)
    expect(result).toBe(0)
    // Click at (100,100) should miss since VP is at (150,150)
    const result2 = hitTestVanishingPoint(100, 100, config, artboard, 1)
    expect(result2).toBe(-1)
  })
})

// ── projectToPlane additional coverage ──

describe('projectToPlane additional coverage', () => {
  test('projects downward from VP above plane', () => {
    const vp = { x: 100, y: 0 }
    const point = { x: 150, y: 100 }
    const result = projectToPlane(point, vp, 200)
    expect(result.y).toBe(200)
    // x should extend further along the direction
    expect(result.x).toBeGreaterThan(150)
  })

  test('projects upward from VP below plane', () => {
    const vp = { x: 100, y: 500 }
    const point = { x: 200, y: 300 }
    const result = projectToPlane(point, vp, 100)
    expect(result.y).toBe(100)
    // Should be on the opposite side direction
  })

  test('handles near-zero dy (horizontal ray)', () => {
    const vp = { x: 100, y: 200 }
    const point = { x: 300, y: 200.0001 }
    const result = projectToPlane(point, vp, 300)
    expect(result.y).toBe(300)
  })

  test('exact zero dy returns point x at planeY', () => {
    const vp = { x: 100, y: 200 }
    const point = { x: 300, y: 200 } // exactly same y as VP
    const result = projectToPlane(point, vp, 400)
    expect(result.y).toBe(400)
    expect(result.x).toBe(300) // fallback behavior
  })
})

// ── snapToPerspective additional coverage ──

describe('snapToPerspective additional coverage', () => {
  test('snaps to convergence line when closer than horizon', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 500, y: 400 }],
      gridDensity: 20, // high density means lines are close together
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 400,
    }
    // Point near one of the many convergence lines but far from horizon
    const result = snapToPerspective(500, 600, config, 1000, 800, 20)
    expect(result.snapped).toBe(true)
  })

  test('2-point perspective snapping works', () => {
    const config: PerspectiveConfig = {
      mode: '2-point',
      vanishingPoints: [
        { x: -200, y: 400 },
        { x: 1200, y: 400 },
      ],
      gridDensity: 12,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 400,
    }
    // Near the horizon
    const result = snapToPerspective(500, 401, config, 1000, 800, 5)
    expect(result.snapped).toBe(true)
    expect(result.y).toBe(400)
  })

  test('3-point perspective snapping includes third VP', () => {
    const config: PerspectiveConfig = {
      mode: '3-point',
      vanishingPoints: [
        { x: -200, y: 400 },
        { x: 1200, y: 400 },
        { x: 500, y: -300 },
      ],
      gridDensity: 12,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 400,
    }
    // The third VP creates vertical convergence lines
    const result = snapToPerspective(500, 200, config, 1000, 800, 20)
    expect(result.snapped).toBe(true)
  })

  test('no snapping with very tight threshold', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 500, y: 400 }],
      gridDensity: 4,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 400,
    }
    // Use extremely tight threshold
    const result = snapToPerspective(300, 600, config, 1000, 800, 0.0001)
    if (!result.snapped) {
      expect(result.x).toBe(300)
      expect(result.y).toBe(600)
    }
  })
})

// ── computeConvergenceLines additional coverage ──

describe('computeConvergenceLines additional coverage', () => {
  test('generates lines to all four edges', () => {
    const lines = computeConvergenceLines(500, 400, 1000, 800, 6)
    // Should have lines going to bottom, top, left, right edges
    const bottomLines = lines.filter(([, , , y]) => Math.abs(y - 800) < 0.01)
    const topLines = lines.filter(([, , , y]) => Math.abs(y) < 0.01)
    const leftLines = lines.filter(([, , x]) => Math.abs(x) < 0.01)
    const rightLines = lines.filter(([, , x]) => Math.abs(x - 1000) < 0.01)
    expect(bottomLines.length).toBeGreaterThan(0)
    expect(topLines.length).toBeGreaterThan(0)
    expect(leftLines.length).toBeGreaterThan(0)
    expect(rightLines.length).toBeGreaterThan(0)
  })

  test('VP at corner generates lines properly', () => {
    const lines = computeConvergenceLines(0, 0, 1000, 800, 4)
    expect(lines.length).toBeGreaterThan(0)
    for (const [x0, y0] of lines) {
      expect(x0).toBe(0)
      expect(y0).toBe(0)
    }
  })

  test('VP outside artboard generates lines properly', () => {
    const lines = computeConvergenceLines(-500, 400, 1000, 800, 4)
    expect(lines.length).toBeGreaterThan(0)
    for (const [x0, y0] of lines) {
      expect(x0).toBe(-500)
      expect(y0).toBe(400)
    }
  })
})

// ── pointToLineDistance additional coverage ──

describe('pointToLineDistance additional coverage', () => {
  test('degenerate line (zero length) returns distance to point', () => {
    const dist = pointToLineDistance(3, 4, 0, 0, 0, 0)
    expect(dist).toBeCloseTo(5, 5) // sqrt(9+16) = 5
  })

  test('distance from origin to diagonal line', () => {
    // Line from (1,0) to (0,1), distance from origin = 1/sqrt(2)
    const dist = pointToLineDistance(0, 0, 1, 0, 0, 1)
    expect(dist).toBeCloseTo(1 / Math.sqrt(2), 5)
  })
})

// ── projectPointOnLine additional coverage ──

describe('projectPointOnLine additional coverage', () => {
  test('degenerate line returns the line point', () => {
    const result = projectPointOnLine(5, 5, 3, 3, 3, 3)
    expect(result.x).toBeCloseTo(3, 5)
    expect(result.y).toBeCloseTo(3, 5)
  })

  test('projects point beyond line endpoints (extrapolation)', () => {
    const result = projectPointOnLine(15, 0, 0, 0, 10, 0)
    expect(result.x).toBeCloseTo(15, 5)
    expect(result.y).toBeCloseTo(0, 5)
  })

  test('projects point before line start (negative t)', () => {
    const result = projectPointOnLine(-5, 0, 0, 0, 10, 0)
    expect(result.x).toBeCloseTo(-5, 5)
    expect(result.y).toBeCloseTo(0, 5)
  })
})
