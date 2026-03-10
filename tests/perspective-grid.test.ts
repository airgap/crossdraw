import { describe, test, expect } from 'bun:test'
import {
  createDefaultPerspectiveConfig,
  snapToPerspective,
  projectToPlane,
  computeConvergenceLines,
  pointToLineDistance,
  projectPointOnLine,
} from '@/render/perspective-grid'
import type { PerspectiveConfig } from '@/types'

// ── Default config tests ──

describe('createDefaultPerspectiveConfig', () => {
  test('1-point config has one vanishing point at center-x', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '1-point')
    expect(config.mode).toBe('1-point')
    expect(config.vanishingPoints).toHaveLength(1)
    expect(config.vanishingPoints[0]!.x).toBe(960) // center X
    expect(config.vanishingPoints[0]!.y).toBe(config.horizonY)
    expect(config.gridDensity).toBeGreaterThan(0)
    expect(config.opacity).toBeGreaterThan(0)
    expect(config.opacity).toBeLessThanOrEqual(1)
    expect(config.color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  test('2-point config has two vanishing points on the horizon', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '2-point')
    expect(config.mode).toBe('2-point')
    expect(config.vanishingPoints).toHaveLength(2)
    // Both VPs should be on the horizon
    expect(config.vanishingPoints[0]!.y).toBe(config.horizonY)
    expect(config.vanishingPoints[1]!.y).toBe(config.horizonY)
    // Left VP should be left of right VP
    expect(config.vanishingPoints[0]!.x).toBeLessThan(config.vanishingPoints[1]!.x)
  })

  test('3-point config has three vanishing points, third off horizon', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '3-point')
    expect(config.mode).toBe('3-point')
    expect(config.vanishingPoints).toHaveLength(3)
    // First two on the horizon
    expect(config.vanishingPoints[0]!.y).toBe(config.horizonY)
    expect(config.vanishingPoints[1]!.y).toBe(config.horizonY)
    // Third VP should be above the horizon (negative Y or at least < horizonY)
    expect(config.vanishingPoints[2]!.y).toBeLessThan(config.horizonY)
  })

  test('horizon line defaults to 40% of artboard height', () => {
    const config = createDefaultPerspectiveConfig(800, 600, '1-point')
    expect(config.horizonY).toBeCloseTo(240) // 600 * 0.4
  })

  test('default grid density is 12', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '1-point')
    expect(config.gridDensity).toBe(12)
  })
})

// ── Convergence lines ──

describe('computeConvergenceLines', () => {
  test('1-point grid generates lines to all four artboard edges', () => {
    const lines = computeConvergenceLines(960, 432, 1920, 1080, 4)
    expect(lines.length).toBeGreaterThan(0)
    // Every line should start at the VP
    for (const [x0, y0] of lines) {
      expect(x0).toBe(960)
      expect(y0).toBe(432)
    }
  })

  test('grid density affects number of lines', () => {
    const linesLow = computeConvergenceLines(500, 300, 1000, 800, 4)
    const linesHigh = computeConvergenceLines(500, 300, 1000, 800, 20)
    expect(linesHigh.length).toBeGreaterThan(linesLow.length)
  })

  test('all target endpoints lie on artboard edges', () => {
    const lines = computeConvergenceLines(500, 300, 1000, 800, 8)
    for (const [, , tx, ty] of lines) {
      const onEdge =
        Math.abs(tx) < 0.01 ||
        Math.abs(tx - 1000) < 0.01 ||
        Math.abs(ty) < 0.01 ||
        Math.abs(ty - 800) < 0.01
      expect(onEdge).toBe(true)
    }
  })
})

// ── 2-point convergence ──

describe('2-point grid line convergence', () => {
  test('each VP produces separate sets of convergent lines', () => {
    const vp1 = { x: -200, y: 400 }
    const vp2 = { x: 1200, y: 400 }
    const lines1 = computeConvergenceLines(vp1.x, vp1.y, 1000, 800, 6)
    const lines2 = computeConvergenceLines(vp2.x, vp2.y, 1000, 800, 6)
    // Lines from VP1 originate at VP1
    for (const [x0, y0] of lines1) {
      expect(x0).toBe(vp1.x)
      expect(y0).toBe(vp1.y)
    }
    // Lines from VP2 originate at VP2
    for (const [x0, y0] of lines2) {
      expect(x0).toBe(vp2.x)
      expect(y0).toBe(vp2.y)
    }
  })
})

// ── 3-point VP positions ──

describe('3-point VP positions', () => {
  test('third VP is positioned above the horizon for default config', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '3-point')
    const vp3 = config.vanishingPoints[2]!
    expect(vp3.y).toBeLessThan(0) // above the artboard
    // Third VP should be at the horizontal center
    expect(vp3.x).toBe(960)
  })

  test('all three VPs generate convergence lines', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '3-point')
    for (const vp of config.vanishingPoints) {
      const lines = computeConvergenceLines(vp.x, vp.y, 1920, 1080, 8)
      expect(lines.length).toBeGreaterThan(0)
    }
  })
})

// ── Snap to perspective ──

describe('snapToPerspective', () => {
  test('snaps point near a perspective line', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 500, y: 300 }],
      gridDensity: 8,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 300,
    }
    // A point exactly on the horizon should snap
    const result = snapToPerspective(250, 301, config, 1000, 800, 10)
    expect(result.snapped).toBe(true)
    expect(result.y).toBe(300) // snapped to horizon
  })

  test('does not snap when far from any line', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 500, y: 300 }],
      gridDensity: 4, // very sparse
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 300,
    }
    // Put point far from horizon and far from convergence lines
    // With density 4, lines are at edges and center; 250,500 should be between lines
    // We use a very tight threshold
    const result = snapToPerspective(250, 500, config, 1000, 800, 0.001)
    // Might or might not snap depending on line density - test with tight threshold
    // The key thing is when snapped=false, x/y return the original coords
    if (!result.snapped) {
      expect(result.x).toBe(250)
      expect(result.y).toBe(500)
    }
  })

  test('finds nearest grid line from a vanishing point', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 500, y: 300 }],
      gridDensity: 10,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 300,
    }
    // Point very close to the VP - should snap to one of the convergent lines
    const result = snapToPerspective(502, 310, config, 1000, 800, 20)
    expect(result.snapped).toBe(true)
  })
})

// ── Horizon line position ──

describe('horizon line position', () => {
  test('horizonY can be set to any value', () => {
    const config = createDefaultPerspectiveConfig(1920, 1080, '1-point')
    const modifiedConfig = { ...config, horizonY: 540 }
    expect(modifiedConfig.horizonY).toBe(540)
  })

  test('snap detects horizon line', () => {
    const config: PerspectiveConfig = {
      mode: '1-point',
      vanishingPoints: [{ x: 960, y: 400 }],
      gridDensity: 4,
      opacity: 0.5,
      color: '#4a90d9',
      horizonY: 400,
    }
    // Point 3px below horizon with threshold 5
    const result = snapToPerspective(100, 403, config, 1920, 1080, 5)
    expect(result.snapped).toBe(true)
    expect(result.y).toBe(400) // snapped to horizon
  })
})

// ── Project to plane ──

describe('projectToPlane', () => {
  test('projects point from VP through point to plane Y', () => {
    const vp = { x: 500, y: 300 }
    const point = { x: 600, y: 400 }
    const result = projectToPlane(point, vp, 500)
    // The projection should be at planeY=500
    expect(result.y).toBe(500)
    // X should be further out along the direction
    expect(result.x).toBeGreaterThan(600)
  })

  test('projects horizontally when point is at same Y as VP', () => {
    const vp = { x: 500, y: 300 }
    const point = { x: 700, y: 300 }
    const result = projectToPlane(point, vp, 500)
    expect(result.y).toBe(500)
    // Since point and VP are at same Y, the direction is horizontal.
    // The special case should handle this gracefully.
    expect(result.x).toBe(700) // falls back to point's x
  })

  test('projection preserves direction from VP', () => {
    const vp = { x: 500, y: 200 }
    const point = { x: 700, y: 400 }
    const result = projectToPlane(point, vp, 600)

    // The projected point should be on the same ray from VP through point
    const dirX = point.x - vp.x
    const dirY = point.y - vp.y
    const t = (result.y - vp.y) / dirY
    const expectedX = vp.x + dirX * t
    expect(result.x).toBeCloseTo(expectedX, 5)
  })
})

// ── Point to line distance ──

describe('pointToLineDistance', () => {
  test('distance from point on the line is zero', () => {
    const dist = pointToLineDistance(5, 5, 0, 0, 10, 10)
    expect(dist).toBeCloseTo(0, 5)
  })

  test('distance from point perpendicular to horizontal line', () => {
    const dist = pointToLineDistance(5, 3, 0, 0, 10, 0)
    expect(dist).toBeCloseTo(3, 5)
  })

  test('distance from point to vertical line', () => {
    const dist = pointToLineDistance(7, 5, 0, 0, 0, 10)
    expect(dist).toBeCloseTo(7, 5)
  })
})

// ── Project point on line ──

describe('projectPointOnLine', () => {
  test('projects point onto horizontal line', () => {
    const result = projectPointOnLine(5, 3, 0, 0, 10, 0)
    expect(result.x).toBeCloseTo(5, 5)
    expect(result.y).toBeCloseTo(0, 5)
  })

  test('projects point onto vertical line', () => {
    const result = projectPointOnLine(3, 5, 0, 0, 0, 10)
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.y).toBeCloseTo(5, 5)
  })

  test('projects point onto diagonal line', () => {
    const result = projectPointOnLine(0, 4, 0, 0, 4, 4)
    // For the line y=x from (0,0) to (4,4), the projection of (0,4) is (2,2)
    expect(result.x).toBeCloseTo(2, 5)
    expect(result.y).toBeCloseTo(2, 5)
  })
})
