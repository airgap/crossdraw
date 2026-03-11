import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getShapeDefaults,
  setShapeDefaults,
  getPenDefaults,
  setPenDefaults,
  getLineDefaults,
  setLineDefaults,
  getTextDefaults,
  setTextDefaults,
  getFillDefaults,
  setFillDefaults,
  getGradientDefaults,
  setGradientDefaults,
  getZoomMode,
  setZoomMode,
} from '@/ui/tool-options-state'

describe('tool-options-state', () => {
  // Reset defaults between tests
  beforeEach(() => {
    setShapeDefaults({ cornerRadius: 0, polygonSides: 6, starPoints: 5, starInnerRatio: 0.4 })
    setPenDefaults({ strokeWidth: 2, strokeColor: '#000000' })
    setLineDefaults({ strokeWidth: 2, strokeColor: '#000000' })
    setTextDefaults({ fontFamily: 'sans-serif', fontSize: 16 })
    setFillDefaults({ fillColor: '#4a7dff' })
    setGradientDefaults({ gradientType: 'linear' })
    setZoomMode('in')
  })

  // ── Shape defaults ──

  describe('shape defaults', () => {
    test('returns default values', () => {
      const defaults = getShapeDefaults()
      expect(defaults.cornerRadius).toBe(0)
      expect(defaults.polygonSides).toBe(6)
      expect(defaults.starPoints).toBe(5)
      expect(defaults.starInnerRatio).toBe(0.4)
    })

    test('returns a copy', () => {
      const d1 = getShapeDefaults()
      const d2 = getShapeDefaults()
      expect(d1).not.toBe(d2)
      expect(d1).toEqual(d2)
    })

    test('setShapeDefaults updates partial values', () => {
      setShapeDefaults({ cornerRadius: 10 })
      expect(getShapeDefaults().cornerRadius).toBe(10)
      // Other values remain unchanged
      expect(getShapeDefaults().polygonSides).toBe(6)
    })

    test('setShapeDefaults updates multiple values', () => {
      setShapeDefaults({ cornerRadius: 5, polygonSides: 8, starPoints: 7, starInnerRatio: 0.3 })
      const d = getShapeDefaults()
      expect(d.cornerRadius).toBe(5)
      expect(d.polygonSides).toBe(8)
      expect(d.starPoints).toBe(7)
      expect(d.starInnerRatio).toBe(0.3)
    })
  })

  // ── Pen defaults ──

  describe('pen defaults', () => {
    test('returns default values', () => {
      const defaults = getPenDefaults()
      expect(defaults.strokeWidth).toBe(2)
      expect(defaults.strokeColor).toBe('#000000')
    })

    test('returns a copy', () => {
      const d1 = getPenDefaults()
      const d2 = getPenDefaults()
      expect(d1).not.toBe(d2)
    })

    test('setPenDefaults updates values', () => {
      setPenDefaults({ strokeWidth: 5, strokeColor: '#ff0000' })
      expect(getPenDefaults().strokeWidth).toBe(5)
      expect(getPenDefaults().strokeColor).toBe('#ff0000')
    })

    test('setPenDefaults partial update', () => {
      setPenDefaults({ strokeColor: '#00ff00' })
      expect(getPenDefaults().strokeColor).toBe('#00ff00')
      expect(getPenDefaults().strokeWidth).toBe(2)
    })
  })

  // ── Line defaults ──

  describe('line defaults', () => {
    test('returns default values', () => {
      const defaults = getLineDefaults()
      expect(defaults.strokeWidth).toBe(2)
      expect(defaults.strokeColor).toBe('#000000')
    })

    test('returns a copy', () => {
      expect(getLineDefaults()).not.toBe(getLineDefaults())
    })

    test('setLineDefaults updates values', () => {
      setLineDefaults({ strokeWidth: 3, strokeColor: '#0000ff' })
      expect(getLineDefaults().strokeWidth).toBe(3)
      expect(getLineDefaults().strokeColor).toBe('#0000ff')
    })

    test('setLineDefaults partial update', () => {
      setLineDefaults({ strokeWidth: 10 })
      expect(getLineDefaults().strokeWidth).toBe(10)
      expect(getLineDefaults().strokeColor).toBe('#000000')
    })
  })

  // ── Text defaults ──

  describe('text defaults', () => {
    test('returns default values', () => {
      const defaults = getTextDefaults()
      expect(defaults.fontFamily).toBe('sans-serif')
      expect(defaults.fontSize).toBe(16)
    })

    test('returns a copy', () => {
      expect(getTextDefaults()).not.toBe(getTextDefaults())
    })

    test('setTextDefaults updates values', () => {
      setTextDefaults({ fontFamily: 'monospace', fontSize: 24 })
      expect(getTextDefaults().fontFamily).toBe('monospace')
      expect(getTextDefaults().fontSize).toBe(24)
    })

    test('setTextDefaults partial update', () => {
      setTextDefaults({ fontSize: 32 })
      expect(getTextDefaults().fontSize).toBe(32)
      expect(getTextDefaults().fontFamily).toBe('sans-serif')
    })
  })

  // ── Fill defaults ──

  describe('fill defaults', () => {
    test('returns default values', () => {
      expect(getFillDefaults().fillColor).toBe('#4a7dff')
    })

    test('returns a copy', () => {
      expect(getFillDefaults()).not.toBe(getFillDefaults())
    })

    test('setFillDefaults updates values', () => {
      setFillDefaults({ fillColor: '#ff0000' })
      expect(getFillDefaults().fillColor).toBe('#ff0000')
    })
  })

  // ── Gradient defaults ──

  describe('gradient defaults', () => {
    test('returns default values', () => {
      expect(getGradientDefaults().gradientType).toBe('linear')
    })

    test('returns a copy', () => {
      expect(getGradientDefaults()).not.toBe(getGradientDefaults())
    })

    test('setGradientDefaults updates to radial', () => {
      setGradientDefaults({ gradientType: 'radial' })
      expect(getGradientDefaults().gradientType).toBe('radial')
    })

    test('setGradientDefaults updates to linear', () => {
      setGradientDefaults({ gradientType: 'radial' })
      setGradientDefaults({ gradientType: 'linear' })
      expect(getGradientDefaults().gradientType).toBe('linear')
    })
  })

  // ── Zoom mode ──

  describe('zoom mode', () => {
    test('defaults to in', () => {
      expect(getZoomMode()).toBe('in')
    })

    test('can set to out', () => {
      setZoomMode('out')
      expect(getZoomMode()).toBe('out')
    })

    test('can set back to in', () => {
      setZoomMode('out')
      setZoomMode('in')
      expect(getZoomMode()).toBe('in')
    })
  })
})
