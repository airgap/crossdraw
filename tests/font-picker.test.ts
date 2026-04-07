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
import { CATEGORIES } from '@/fonts/catalog'

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

  // ── Google Fonts catalog ──────────────────────────────────────

  describe('getBuiltinFonts (Google Fonts catalog)', () => {
    test('returns an array', () => {
      const fonts = getBuiltinFonts()
      expect(Array.isArray(fonts)).toBe(true)
    })

    test('has at least 1000 fonts', () => {
      expect(getBuiltinFonts().length).toBeGreaterThanOrEqual(1000)
    })

    test('every font has required fields', () => {
      for (const font of getBuiltinFonts()) {
        expect(typeof font.f).toBe('string')
        expect(font.f.length).toBeGreaterThan(0)
        // Variable fonts may have empty w[] but must have axes
        if (!font.a || font.a.length === 0) {
          expect(font.w.length).toBeGreaterThan(0)
        }
        expect([0, 1, 2, 3, 4]).toContain(font.c)
      }
    })

    test('includes popular fonts', () => {
      const fonts = getBuiltinFonts()
      const families = fonts.map((f) => f.f)
      expect(families).toContain('Roboto')
      expect(families).toContain('Open Sans')
      expect(families).toContain('Inter')
      expect(families).toContain('Montserrat')
      expect(families).toContain('Playfair Display')
    })

    test('Montserrat is a variable font', () => {
      const mont = getBuiltinFonts().find((f) => f.f === 'Montserrat')
      expect(mont).toBeDefined()
      expect(mont!.a).toBeDefined()
      const wghtAxis = mont!.a!.find(([tag]) => tag === 'wght')
      expect(wghtAxis).toBeDefined()
      expect(wghtAxis![1]).toBeLessThanOrEqual(100)
      expect(wghtAxis![2]).toBeGreaterThanOrEqual(900)
    })

    test('font weights are sorted ascending (static fonts)', () => {
      for (const font of getBuiltinFonts()) {
        if (font.w.length > 1) {
          for (let i = 1; i < font.w.length; i++) {
            expect(font.w[i]).toBeGreaterThan(font.w[i - 1]!)
          }
        }
      }
    })

    test('has fonts in all 5 categories', () => {
      const cats = new Set(getBuiltinFonts().map((f) => f.c))
      expect(cats.size).toBe(5)
      for (let i = 0; i < CATEGORIES.length; i++) {
        expect(cats.has(i)).toBe(true)
      }
    })

    test('sorted by popularity', () => {
      const fonts = getBuiltinFonts()
      // First font should be most popular (p=0)
      expect(fonts[0]!.p).toBe(0)
      // Popularity should be in ascending order
      for (let i = 1; i < Math.min(fonts.length, 50); i++) {
        expect(fonts[i]!.p).toBeGreaterThanOrEqual(fonts[i - 1]!.p)
      }
    })

    test('variable fonts have valid axes', () => {
      const variable = getBuiltinFonts().filter((f) => f.a && f.a.length > 0)
      expect(variable.length).toBeGreaterThan(100) // should be hundreds
      for (const font of variable) {
        for (const [tag, min, max] of font.a!) {
          expect(typeof tag).toBe('string')
          expect(tag.length).toBe(4) // OpenType axis tags are 4 chars
          expect(min).toBeLessThan(max)
        }
      }
    })
  })

  // ── enumerateSystemFonts (compat) ─────────────────────────────

  describe('enumerateSystemFonts', () => {
    test('returns the catalog (compat shim)', async () => {
      const fonts = await enumerateSystemFonts()
      expect(fonts).toEqual(getBuiltinFonts())
    })
  })

  // ── FontPicker component ──────────────────────────────────────

  describe('FontPicker', () => {
    test('is exported as a function', () => {
      expect(typeof FontPicker).toBe('function')
    })
  })
})
