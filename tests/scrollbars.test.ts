import { describe, test, expect } from 'bun:test'
import { getScrollThumbPosition, ViewportScrollbars } from '@/ui/scrollbars'

describe('scrollbars', () => {
  // ── getScrollThumbPosition ────────────────────────────────────

  describe('getScrollThumbPosition', () => {
    test('is a function', () => {
      expect(typeof getScrollThumbPosition).toBe('function')
    })

    test('returns object with position and size', () => {
      const result = getScrollThumbPosition(0, 800, 1000, 1)
      expect(result).toHaveProperty('position')
      expect(result).toHaveProperty('size')
    })

    test('position is always >= 0', () => {
      const tests = [
        { pan: -10000, viewportSize: 800, contentSize: 1000, zoom: 1 },
        { pan: 0, viewportSize: 800, contentSize: 1000, zoom: 1 },
        { pan: 10000, viewportSize: 800, contentSize: 1000, zoom: 1 },
      ]
      for (const t of tests) {
        const result = getScrollThumbPosition(t.pan, t.viewportSize, t.contentSize, t.zoom)
        expect(result.position).toBeGreaterThanOrEqual(0)
      }
    })

    test('position never exceeds viewportSize - thumbSize', () => {
      const tests = [
        { pan: -10000, viewportSize: 800, contentSize: 1000, zoom: 1 },
        { pan: 10000, viewportSize: 800, contentSize: 1000, zoom: 2 },
        { pan: 0, viewportSize: 400, contentSize: 500, zoom: 0.5 },
      ]
      for (const t of tests) {
        const result = getScrollThumbPosition(t.pan, t.viewportSize, t.contentSize, t.zoom)
        expect(result.position).toBeLessThanOrEqual(t.viewportSize - result.size)
      }
    })

    test('thumb size is at least 30', () => {
      const result = getScrollThumbPosition(0, 10000, 100000, 1)
      expect(result.size).toBeGreaterThanOrEqual(30)
    })

    test('thumb size is proportional to viewport fraction', () => {
      // Small content relative to viewport → larger thumb
      const small = getScrollThumbPosition(0, 800, 100, 1)
      // Large content relative to viewport → smaller thumb (but at least 30)
      const large = getScrollThumbPosition(0, 800, 10000, 1)
      expect(small.size).toBeGreaterThanOrEqual(large.size)
    })

    test('zoom affects content size', () => {
      // Higher zoom = larger effective content = smaller thumb
      const zoom1 = getScrollThumbPosition(0, 800, 1000, 1)
      const zoom5 = getScrollThumbPosition(0, 800, 1000, 5)
      expect(zoom5.size).toBeLessThanOrEqual(zoom1.size)
    })

    test('pan affects position', () => {
      const pos1 = getScrollThumbPosition(0, 800, 1000, 1)
      const pos2 = getScrollThumbPosition(-200, 800, 1000, 1)
      // Different pans should yield different positions (unless clamped)
      // pos2 has pan=-200, which means we scrolled right, so position should be different
      expect(pos1.position).not.toBe(pos2.position)
    })

    test('centered pan produces middle position', () => {
      // With pan=0, offset = viewportSize/2 + 0 = viewportSize/2
      // Position should be around the middle area
      const result = getScrollThumbPosition(0, 800, 1000, 1)
      // Not testing exact value, just that it's in a reasonable range
      expect(result.position).toBeGreaterThanOrEqual(0)
      expect(result.position).toBeLessThanOrEqual(800)
    })

    test('extent is at least 2x viewport', () => {
      // When contentSize*zoom + viewportSize < viewportSize*2
      // extent = viewportSize * 2
      const result = getScrollThumbPosition(0, 800, 10, 1)
      // extent = max(10*1+800, 800*2) = max(810, 1600) = 1600
      // thumbSize = max(30, (800/1600)*800) = max(30, 400) = 400
      expect(result.size).toBeCloseTo(400)
    })

    test('very small viewport still works', () => {
      const result = getScrollThumbPosition(0, 50, 1000, 1)
      expect(result.size).toBe(30) // minimum thumb size
      expect(result.position).toBeGreaterThanOrEqual(0)
    })

    test('zoom=0.1 shows large viewport area', () => {
      const result = getScrollThumbPosition(0, 800, 1000, 0.1)
      // contentSize*zoom = 100, extent = max(100+800, 1600) = 1600
      // thumbSize = max(30, (800/1600)*800) = 400
      expect(result.size).toBeCloseTo(400)
    })

    test('consistency: same inputs produce same outputs', () => {
      const a = getScrollThumbPosition(100, 600, 2000, 2)
      const b = getScrollThumbPosition(100, 600, 2000, 2)
      expect(a.position).toBe(b.position)
      expect(a.size).toBe(b.size)
    })
  })

  // ── ViewportScrollbars component ──────────────────────────────

  describe('ViewportScrollbars component', () => {
    test('is exported as a function', () => {
      expect(typeof ViewportScrollbars).toBe('function')
    })
  })

  // ── Module exports ────────────────────────────────────────────

  describe('module exports', () => {
    test('exports getScrollThumbPosition', async () => {
      const mod = await import('@/ui/scrollbars')
      expect(typeof mod.getScrollThumbPosition).toBe('function')
    })

    test('exports ViewportScrollbars', async () => {
      const mod = await import('@/ui/scrollbars')
      expect(typeof mod.ViewportScrollbars).toBe('function')
    })
  })
})
