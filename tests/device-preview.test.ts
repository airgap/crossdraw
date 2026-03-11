import { describe, test, expect } from 'bun:test'
import {
  DEVICE_PRESETS,
  getPresetsByCategory,
  getPresetById,
  computeResponsiveLayout,
  calcPreviewScale,
  DevicePreview,
} from '@/ui/device-preview'

describe('device-preview', () => {
  // ── DEVICE_PRESETS constant ───────────────────────────────────

  describe('DEVICE_PRESETS', () => {
    test('is an array', () => {
      expect(Array.isArray(DEVICE_PRESETS)).toBe(true)
    })

    test('has at least 10 presets', () => {
      expect(DEVICE_PRESETS.length).toBeGreaterThanOrEqual(10)
    })

    test('every preset has required fields', () => {
      for (const p of DEVICE_PRESETS) {
        expect(typeof p.id).toBe('string')
        expect(p.id.length).toBeGreaterThan(0)
        expect(typeof p.name).toBe('string')
        expect(p.name.length).toBeGreaterThan(0)
        expect(typeof p.width).toBe('number')
        expect(p.width).toBeGreaterThan(0)
        expect(typeof p.height).toBe('number')
        expect(p.height).toBeGreaterThan(0)
        expect(['phone', 'tablet', 'desktop']).toContain(p.category)
      }
    })

    test('all preset ids are unique', () => {
      const ids = DEVICE_PRESETS.map((p) => p.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    test('contains phone presets', () => {
      const phones = DEVICE_PRESETS.filter((p) => p.category === 'phone')
      expect(phones.length).toBeGreaterThan(0)
    })

    test('contains tablet presets', () => {
      const tablets = DEVICE_PRESETS.filter((p) => p.category === 'tablet')
      expect(tablets.length).toBeGreaterThan(0)
    })

    test('contains desktop presets', () => {
      const desktops = DEVICE_PRESETS.filter((p) => p.category === 'desktop')
      expect(desktops.length).toBeGreaterThan(0)
    })

    test('phone presets have dpr', () => {
      const phones = DEVICE_PRESETS.filter((p) => p.category === 'phone')
      for (const p of phones) {
        expect(p.dpr).toBeDefined()
        expect(p.dpr!).toBeGreaterThan(0)
      }
    })

    test('includes iPhone 15', () => {
      const iphone15 = DEVICE_PRESETS.find((p) => p.id === 'iphone-15')
      expect(iphone15).toBeDefined()
      expect(iphone15!.width).toBe(393)
      expect(iphone15!.height).toBe(852)
    })

    test('includes Desktop 1080p', () => {
      const desktop1080 = DEVICE_PRESETS.find((p) => p.id === 'desktop-1080p')
      expect(desktop1080).toBeDefined()
      expect(desktop1080!.width).toBe(1920)
      expect(desktop1080!.height).toBe(1080)
    })
  })

  // ── getPresetsByCategory ──────────────────────────────────────

  describe('getPresetsByCategory', () => {
    test('returns only phone presets', () => {
      const phones = getPresetsByCategory('phone')
      expect(phones.length).toBeGreaterThan(0)
      for (const p of phones) {
        expect(p.category).toBe('phone')
      }
    })

    test('returns only tablet presets', () => {
      const tablets = getPresetsByCategory('tablet')
      expect(tablets.length).toBeGreaterThan(0)
      for (const p of tablets) {
        expect(p.category).toBe('tablet')
      }
    })

    test('returns only desktop presets', () => {
      const desktops = getPresetsByCategory('desktop')
      expect(desktops.length).toBeGreaterThan(0)
      for (const p of desktops) {
        expect(p.category).toBe('desktop')
      }
    })

    test('returned arrays are separate from the original', () => {
      const phones1 = getPresetsByCategory('phone')
      const phones2 = getPresetsByCategory('phone')
      expect(phones1).not.toBe(phones2)
      expect(phones1).toEqual(phones2)
    })
  })

  // ── getPresetById ─────────────────────────────────────────────

  describe('getPresetById', () => {
    test('finds existing preset by id', () => {
      const p = getPresetById('iphone-15')
      expect(p).toBeDefined()
      expect(p!.name).toBe('iPhone 15')
    })

    test('returns undefined for non-existent id', () => {
      expect(getPresetById('no-such-device')).toBeUndefined()
    })

    test('returns undefined for empty string', () => {
      expect(getPresetById('')).toBeUndefined()
    })

    test('finds all defined presets', () => {
      for (const preset of DEVICE_PRESETS) {
        const found = getPresetById(preset.id)
        expect(found).toBeDefined()
        expect(found!.id).toBe(preset.id)
      }
    })
  })

  // ── calcPreviewScale ──────────────────────────────────────────

  describe('calcPreviewScale', () => {
    test('returns 1 when device fits in container', () => {
      const scale = calcPreviewScale(100, 100, 500, 500)
      expect(scale).toBe(1)
    })

    test('scales down for wide device', () => {
      const scale = calcPreviewScale(2000, 100, 500, 500, 0)
      expect(scale).toBeCloseTo(0.25)
    })

    test('scales down for tall device', () => {
      const scale = calcPreviewScale(100, 2000, 500, 500, 0)
      expect(scale).toBeCloseTo(0.25)
    })

    test('respects padding parameter', () => {
      // container=200x200, padding=50, available=100x100, device=200x200
      const scale = calcPreviewScale(200, 200, 200, 200, 50)
      expect(scale).toBeCloseTo(0.5)
    })

    test('default padding is 20', () => {
      // container=200x200, default padding=20, available=160x160, device=320x320
      const scale = calcPreviewScale(320, 320, 200, 200)
      expect(scale).toBeCloseTo(0.5)
    })

    test('never exceeds 1', () => {
      const scale = calcPreviewScale(10, 10, 1000, 1000, 0)
      expect(scale).toBe(1)
    })

    test('uses minimum of width and height ratios', () => {
      // Device 400x200 in container 200x200 (no padding)
      // width ratio = 200/400 = 0.5, height ratio = 200/200 = 1
      const scale = calcPreviewScale(400, 200, 200, 200, 0)
      expect(scale).toBeCloseTo(0.5)
    })

    test('zero padding means full container usage', () => {
      const scale = calcPreviewScale(1000, 500, 500, 500, 0)
      // width ratio = 500/1000 = 0.5, height ratio = 500/500 = 1
      expect(scale).toBeCloseTo(0.5)
    })
  })

  // ── computeResponsiveLayout ───────────────────────────────────

  describe('computeResponsiveLayout', () => {
    const makeArtboard = (layers: any[] = []) => ({
      id: 'a1',
      name: 'Test',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      backgroundColor: '#ffffff',
      layers,
    })

    test('returns empty array for artboard with no layers', () => {
      const artboard = makeArtboard()
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result).toEqual([])
    })

    test('returns entry per layer', () => {
      const artboard = makeArtboard([
        {
          id: 'l1',
          name: 'Layer 1',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          type: 'vector',
          paths: [],
          fill: null,
          stroke: null,
        },
        {
          id: 'l2',
          name: 'Layer 2',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          type: 'vector',
          paths: [],
          fill: null,
          stroke: null,
        },
      ])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result.length).toBe(2)
      expect(result[0]!.layerId).toBe('l1')
      expect(result[1]!.layerId).toBe('l2')
    })

    test('each result has x, y, scaleX, scaleY', () => {
      const artboard = makeArtboard([
        {
          id: 'l1',
          name: 'Layer',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          type: 'vector',
          paths: [],
          fill: null,
          stroke: null,
        },
      ])
      const result = computeResponsiveLayout(artboard, 375, 667)
      expect(result[0]).toHaveProperty('x')
      expect(result[0]).toHaveProperty('y')
      expect(result[0]).toHaveProperty('scaleX')
      expect(result[0]).toHaveProperty('scaleY')
      expect(result[0]).toHaveProperty('layerId')
    })

    test('uses default constraints if none specified', () => {
      const artboard = makeArtboard([
        {
          id: 'l1',
          name: 'Layer',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          type: 'vector',
          paths: [],
          fill: null,
          stroke: null,
          // no constraints field
        },
      ])
      // Should not throw even without constraints
      expect(() => computeResponsiveLayout(artboard, 375, 667)).not.toThrow()
    })
  })

  // ── DevicePreview component ───────────────────────────────────

  describe('DevicePreview', () => {
    test('is exported as a function', () => {
      expect(typeof DevicePreview).toBe('function')
    })
  })
})
