import { describe, test, expect } from 'bun:test'
import { calcMinimapViewport, MiniMap } from '@/ui/minimap'

describe('minimap', () => {
  // ── calcMinimapViewport ───────────────────────────────────────

  describe('calcMinimapViewport', () => {
    test('is a function', () => {
      expect(typeof calcMinimapViewport).toBe('function')
    })

    test('returns object with x, y, w, h', () => {
      const result = calcMinimapViewport(1000, 1000, 800, 600, 1, 0, 0, 150, 100)
      expect(result).toHaveProperty('x')
      expect(result).toHaveProperty('y')
      expect(result).toHaveProperty('w')
      expect(result).toHaveProperty('h')
    })

    test('viewport at origin with 1x zoom', () => {
      // artboard 1000x1000, viewport 500x500, zoom 1, pan (0,0), minimap 100x100
      const result = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 100, 100)
      // scale = min(100/1000, 100/1000) = 0.1
      // x = (-0/1) * 0.1 = 0, y = (-0/1) * 0.1 = 0
      // w = (500/1) * 0.1 = 50, h = (500/1) * 0.1 = 50
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.w).toBeCloseTo(50)
      expect(result.h).toBeCloseTo(50)
    })

    test('viewport with pan offset', () => {
      // artboard 1000x1000, viewport 500x500, zoom 1, pan (-200, -100), minimap 100x100
      const result = calcMinimapViewport(1000, 1000, 500, 500, 1, -200, -100, 100, 100)
      // scale = 0.1
      // x = (-(-200)/1) * 0.1 = 200 * 0.1 = 20
      // y = (-(-100)/1) * 0.1 = 100 * 0.1 = 10
      expect(result.x).toBeCloseTo(20)
      expect(result.y).toBeCloseTo(10)
      expect(result.w).toBeCloseTo(50)
      expect(result.h).toBeCloseTo(50)
    })

    test('viewport with zoom > 1', () => {
      // artboard 1000x1000, viewport 500x500, zoom 2, pan (0,0), minimap 100x100
      const result = calcMinimapViewport(1000, 1000, 500, 500, 2, 0, 0, 100, 100)
      // scale = 0.1
      // x = (-0/2) * 0.1 = 0
      // w = (500/2) * 0.1 = 25
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.w).toBeCloseTo(25)
      expect(result.h).toBeCloseTo(25)
    })

    test('viewport with zoom < 1', () => {
      // artboard 1000x1000, viewport 500x500, zoom 0.5, pan (0,0), minimap 100x100
      const result = calcMinimapViewport(1000, 1000, 500, 500, 0.5, 0, 0, 100, 100)
      // scale = 0.1
      // w = (500/0.5) * 0.1 = 100
      expect(result.w).toBeCloseTo(100)
      expect(result.h).toBeCloseTo(100)
    })

    test('non-square artboard uses min scale', () => {
      // artboard 2000x500, minimap 100x100
      // scale = min(100/2000, 100/500) = min(0.05, 0.2) = 0.05
      const result = calcMinimapViewport(2000, 500, 800, 600, 1, 0, 0, 100, 100)
      // w = 800 * 0.05 = 40
      expect(result.w).toBeCloseTo(40)
      // h = 600 * 0.05 = 30
      expect(result.h).toBeCloseTo(30)
    })

    test('non-square minimap', () => {
      // artboard 1000x1000, minimap 200x50
      // scale = min(200/1000, 50/1000) = min(0.2, 0.05) = 0.05
      const result = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 200, 50)
      expect(result.w).toBeCloseTo(25) // 500 * 0.05
      expect(result.h).toBeCloseTo(25) // 500 * 0.05
    })

    test('negative pan values', () => {
      const result = calcMinimapViewport(1000, 1000, 500, 500, 1, -500, -500, 100, 100)
      // scale = 0.1, x = 500 * 0.1 = 50, y = 500 * 0.1 = 50
      expect(result.x).toBeCloseTo(50)
      expect(result.y).toBeCloseTo(50)
    })

    test('positive pan values', () => {
      const result = calcMinimapViewport(1000, 1000, 500, 500, 1, 300, 200, 100, 100)
      // scale = 0.1, x = (-300/1) * 0.1 = -30
      expect(result.x).toBeCloseTo(-30)
      expect(result.y).toBeCloseTo(-20)
    })

    test('large zoom shrinks viewport indicator', () => {
      const zoom1 = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 100, 100)
      const zoom4 = calcMinimapViewport(1000, 1000, 500, 500, 4, 0, 0, 100, 100)
      expect(zoom4.w).toBeLessThan(zoom1.w)
      expect(zoom4.h).toBeLessThan(zoom1.h)
    })

    test('small zoom enlarges viewport indicator', () => {
      const zoom1 = calcMinimapViewport(1000, 1000, 500, 500, 1, 0, 0, 100, 100)
      const zoom025 = calcMinimapViewport(1000, 1000, 500, 500, 0.25, 0, 0, 100, 100)
      expect(zoom025.w).toBeGreaterThan(zoom1.w)
      expect(zoom025.h).toBeGreaterThan(zoom1.h)
    })
  })

  // ── MiniMap component ─────────────────────────────────────────

  describe('MiniMap component', () => {
    test('is exported as a function', () => {
      expect(typeof MiniMap).toBe('function')
    })
  })

  // ── Module exports ────────────────────────────────────────────

  describe('module exports', () => {
    test('exports calcMinimapViewport', async () => {
      const mod = await import('@/ui/minimap')
      expect(typeof mod.calcMinimapViewport).toBe('function')
    })

    test('exports MiniMap', async () => {
      const mod = await import('@/ui/minimap')
      expect(typeof mod.MiniMap).toBe('function')
    })
  })
})
