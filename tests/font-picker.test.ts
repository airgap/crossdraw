import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

// ── Save/restore globals ────────────────────────────────────────

const origWindow = globalThis.window

beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
    }
  }
})

afterAll(() => {
  if (origWindow === undefined) {
    delete (globalThis as any).window
  } else {
    globalThis.window = origWindow
  }
})

// ── Import after stubs ──────────────────────────────────────────

import { getWeightName, getBuiltinFonts, enumerateSystemFonts, FontPicker } from '@/ui/font-picker'

// ── Tests ───────────────────────────────────────────────────────

describe('font-picker', () => {
  // ── getWeightName ─────────────────────────────────────────────

  describe('getWeightName', () => {
    test('returns "Thin" for 100', () => {
      expect(getWeightName(100)).toBe('Thin')
    })

    test('returns "ExtraLight" for 200', () => {
      expect(getWeightName(200)).toBe('ExtraLight')
    })

    test('returns "Light" for 300', () => {
      expect(getWeightName(300)).toBe('Light')
    })

    test('returns "Regular" for 400', () => {
      expect(getWeightName(400)).toBe('Regular')
    })

    test('returns "Medium" for 500', () => {
      expect(getWeightName(500)).toBe('Medium')
    })

    test('returns "SemiBold" for 600', () => {
      expect(getWeightName(600)).toBe('SemiBold')
    })

    test('returns "Bold" for 700', () => {
      expect(getWeightName(700)).toBe('Bold')
    })

    test('returns "ExtraBold" for 800', () => {
      expect(getWeightName(800)).toBe('ExtraBold')
    })

    test('returns "Black" for 900', () => {
      expect(getWeightName(900)).toBe('Black')
    })

    test('returns stringified number for unknown weight', () => {
      expect(getWeightName(150)).toBe('150')
      expect(getWeightName(0)).toBe('0')
      expect(getWeightName(999)).toBe('999')
      expect(getWeightName(450)).toBe('450')
    })
  })

  // ── getBuiltinFonts ──────────────────────────────────────────

  describe('getBuiltinFonts', () => {
    test('returns an array', () => {
      const fonts = getBuiltinFonts()
      expect(Array.isArray(fonts)).toBe(true)
    })

    test('has at least 10 built-in fonts', () => {
      expect(getBuiltinFonts().length).toBeGreaterThanOrEqual(10)
    })

    test('every font has required fields', () => {
      for (const font of getBuiltinFonts()) {
        expect(typeof font.family).toBe('string')
        expect(font.family.length).toBeGreaterThan(0)
        expect(Array.isArray(font.weights)).toBe(true)
        expect(font.weights.length).toBeGreaterThan(0)
        expect(['serif', 'sans-serif', 'monospace', 'display', 'handwriting']).toContain(font.category)
      }
    })

    test('includes common fonts', () => {
      const fonts = getBuiltinFonts()
      const families = fonts.map((f) => f.family)
      expect(families).toContain('Arial')
      expect(families).toContain('Times New Roman')
      expect(families).toContain('Courier New')
    })

    test('Arial has weights 400 and 700', () => {
      const arial = getBuiltinFonts().find((f) => f.family === 'Arial')
      expect(arial).toBeDefined()
      expect(arial!.weights).toContain(400)
      expect(arial!.weights).toContain(700)
    })

    test('Montserrat has 9 weights (100-900)', () => {
      const montserrat = getBuiltinFonts().find((f) => f.family === 'Montserrat')
      expect(montserrat).toBeDefined()
      expect(montserrat!.weights.length).toBe(9)
      expect(montserrat!.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    })

    test('font weights are sorted ascending', () => {
      for (const font of getBuiltinFonts()) {
        for (let i = 1; i < font.weights.length; i++) {
          expect(font.weights[i]).toBeGreaterThan(font.weights[i - 1]!)
        }
      }
    })

    test('all weights are multiples of 100', () => {
      for (const font of getBuiltinFonts()) {
        for (const w of font.weights) {
          expect(w % 100).toBe(0)
        }
      }
    })

    test('has fonts in multiple categories', () => {
      const categories = new Set(getBuiltinFonts().map((f) => f.category))
      expect(categories.size).toBeGreaterThanOrEqual(4)
      expect(categories.has('serif')).toBe(true)
      expect(categories.has('sans-serif')).toBe(true)
      expect(categories.has('monospace')).toBe(true)
    })

    test('Impact has only weight 400', () => {
      const impact = getBuiltinFonts().find((f) => f.family === 'Impact')
      expect(impact).toBeDefined()
      expect(impact!.weights).toEqual([400])
      expect(impact!.category).toBe('display')
    })

    test('Comic Sans MS is handwriting category', () => {
      const comic = getBuiltinFonts().find((f) => f.family === 'Comic Sans MS')
      expect(comic).toBeDefined()
      expect(comic!.category).toBe('handwriting')
    })
  })

  // ── enumerateSystemFonts ──────────────────────────────────────

  describe('enumerateSystemFonts', () => {
    test('returns built-in fonts when queryLocalFonts is not available', async () => {
      // Our stub window doesn't have queryLocalFonts
      const fonts = await enumerateSystemFonts()
      expect(fonts).toEqual(getBuiltinFonts())
    })

    test('returns built-in fonts when queryLocalFonts throws', async () => {
      ;(window as any).queryLocalFonts = async () => {
        throw new Error('Permission denied')
      }
      const fonts = await enumerateSystemFonts()
      expect(fonts).toEqual(getBuiltinFonts())
      delete (window as any).queryLocalFonts
    })

    test('parses system fonts when queryLocalFonts is available', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'TestFont', style: 'Regular' },
        { family: 'TestFont', style: 'Bold' },
        { family: 'TestFont', style: 'Light' },
        { family: 'AnotherFont', style: 'Regular' },
      ]
      const fonts = await enumerateSystemFonts()
      expect(fonts.length).toBe(2)

      const testFont = fonts.find((f) => f.family === 'TestFont')
      expect(testFont).toBeDefined()
      expect(testFont!.weights).toContain(400) // Regular
      expect(testFont!.weights).toContain(700) // Bold
      expect(testFont!.weights).toContain(300) // Light

      const anotherFont = fonts.find((f) => f.family === 'AnotherFont')
      expect(anotherFont).toBeDefined()
      expect(anotherFont!.weights).toContain(400)

      delete (window as any).queryLocalFonts
    })

    test('parses weight from style strings correctly', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'F', style: 'Thin' },
        { family: 'F', style: 'ExtraLight' },
        { family: 'F', style: 'UltraLight' },
        { family: 'F', style: 'Light' },
        { family: 'F', style: 'Medium' },
        { family: 'F', style: 'SemiBold' },
        { family: 'F', style: 'DemiBold' },
        { family: 'F', style: 'Bold' },
        { family: 'F', style: 'ExtraBold' },
        { family: 'F', style: 'UltraBold' },
        { family: 'F', style: 'Black' },
        { family: 'F', style: 'Heavy' },
      ]
      const fonts = await enumerateSystemFonts()
      const f = fonts.find((ff) => ff.family === 'F')
      expect(f).toBeDefined()
      expect(f!.weights).toContain(100) // Thin
      expect(f!.weights).toContain(200) // ExtraLight / UltraLight
      expect(f!.weights).toContain(300) // Light
      expect(f!.weights).toContain(500) // Medium
      expect(f!.weights).toContain(600) // SemiBold / DemiBold
      expect(f!.weights).toContain(700) // Bold
      expect(f!.weights).toContain(800) // ExtraBold / UltraBold
      expect(f!.weights).toContain(900) // Black / Heavy

      delete (window as any).queryLocalFonts
    })

    test('weights are sorted ascending', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'F', style: 'Black' },
        { family: 'F', style: 'Thin' },
        { family: 'F', style: 'Bold' },
        { family: 'F', style: 'Regular' },
      ]
      const fonts = await enumerateSystemFonts()
      const f = fonts[0]!
      for (let i = 1; i < f.weights.length; i++) {
        expect(f.weights[i]).toBeGreaterThan(f.weights[i - 1]!)
      }

      delete (window as any).queryLocalFonts
    })

    test('system fonts default to sans-serif category', async () => {
      ;(window as any).queryLocalFonts = async () => [{ family: 'CustomFont', style: 'Regular' }]
      const fonts = await enumerateSystemFonts()
      expect(fonts[0]!.category).toBe('sans-serif')

      delete (window as any).queryLocalFonts
    })

    test('deduplicates weights from same family', async () => {
      ;(window as any).queryLocalFonts = async () => [
        { family: 'F', style: 'Regular' },
        { family: 'F', style: 'Regular' },
        { family: 'F', style: 'Regular' },
      ]
      const fonts = await enumerateSystemFonts()
      const f = fonts[0]!
      expect(f.weights.length).toBe(1)
      expect(f.weights[0]).toBe(400)

      delete (window as any).queryLocalFonts
    })
  })

  // ── FontPicker component ──────────────────────────────────────

  describe('FontPicker', () => {
    test('is exported as a function', () => {
      expect(typeof FontPicker).toBe('function')
    })
  })
})
