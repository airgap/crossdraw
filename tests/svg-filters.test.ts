import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { JSDOM } from 'jsdom'

// Save originals
const origDocument = (globalThis as any).document

// Set up minimal DOM for parsing SVG using DOMParser to preserve case-sensitive element names
let dom: any
let parser: any

beforeAll(() => {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  parser = new dom.window.DOMParser()
  // @ts-ignore
  globalThis.document = dom.window.document
})

afterAll(() => {
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  } else {
    delete (globalThis as any).document
  }
})

import { parseSVGFilter, parseSVGFilterDefs, resolveFilterReference, effectToSVGFilter } from '@/io/svg-filters'
import type { Effect, BlurParams, ShadowParams, GlowParams } from '@/types'

function createFilterElement(innerHTML: string): Element {
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg"><filter>${innerHTML}</filter></svg>`
  const parsed = parser.parseFromString(svgStr, 'image/svg+xml')
  return parsed.querySelector('filter')!
}

function createSVGWithFilters(filtersHTML: string): Element {
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${filtersHTML}</defs></svg>`
  const parsed = parser.parseFromString(svgStr, 'image/svg+xml')
  return parsed.querySelector('svg')!
}

describe('parseSVGFilter', () => {
  it('should parse a simple Gaussian blur filter', () => {
    const filterEl = createFilterElement('<feGaussianBlur in="SourceGraphic" stdDeviation="5" />')
    const effects = parseSVGFilter(filterEl)

    expect(effects.length).toBe(1)
    expect(effects[0]!.type).toBe('blur')
    expect(effects[0]!.enabled).toBe(true)
    expect((effects[0]!.params as BlurParams).radius).toBe(5)
    expect((effects[0]!.params as BlurParams).kind).toBe('blur')
  })

  it('should parse a blur with SourceAlpha input', () => {
    const filterEl = createFilterElement('<feGaussianBlur in="SourceAlpha" stdDeviation="3" />')
    const effects = parseSVGFilter(filterEl)

    expect(effects.length).toBe(1)
    expect(effects[0]!.type).toBe('blur')
    expect((effects[0]!.params as BlurParams).radius).toBe(3)
  })

  it('should parse feDropShadow', () => {
    const filterEl = createFilterElement(
      '<feDropShadow dx="4" dy="6" stdDeviation="3" flood-color="#ff0000" flood-opacity="0.5" />',
    )
    const effects = parseSVGFilter(filterEl)

    expect(effects.length).toBe(1)
    expect(effects[0]!.type).toBe('drop-shadow')
    const params = effects[0]!.params as ShadowParams
    expect(params.offsetX).toBe(4)
    expect(params.offsetY).toBe(6)
    expect(params.blurRadius).toBe(3)
    expect(params.color).toBe('#ff0000')
    expect(params.opacity).toBe(0.5)
  })

  it('should parse feDropShadow with default values', () => {
    const filterEl = createFilterElement('<feDropShadow />')
    const effects = parseSVGFilter(filterEl)

    expect(effects.length).toBe(1)
    const params = effects[0]!.params as ShadowParams
    expect(params.offsetX).toBe(0)
    expect(params.offsetY).toBe(0)
    expect(params.blurRadius).toBe(0)
    expect(params.color).toBe('#000000')
    expect(params.opacity).toBe(1)
  })

  it('should parse blur + merge as glow effect', () => {
    const filterEl = createFilterElement(
      '<feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />' +
        '<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>',
    )
    const effects = parseSVGFilter(filterEl)

    expect(effects.length).toBe(1)
    expect(effects[0]!.type).toBe('outer-glow')
    const params = effects[0]!.params as GlowParams
    expect(params.radius).toBe(8)
  })

  it('should parse feOffset + feGaussianBlur as shadow (no merge, no dropShadow)', () => {
    const filterEl = createFilterElement(
      '<feGaussianBlur in="SourceAlpha" stdDeviation="4" />' +
        '<feOffset dx="2" dy="3" />' +
        '<feFlood flood-color="#333333" flood-opacity="0.7" />',
    )
    const effects = parseSVGFilter(filterEl)

    // Should produce a shadow effect from offset+blur combo
    expect(effects.length).toBe(2) // blur effect + shadow effect
    const shadow = effects.find((e) => e.type === 'shadow')
    expect(shadow).toBeDefined()
    const params = shadow!.params as ShadowParams
    expect(params.offsetX).toBe(2)
    expect(params.offsetY).toBe(3)
    expect(params.color).toBe('#333333')
    expect(params.opacity).toBe(0.7)
  })

  it('should return empty array for empty filter', () => {
    const filterEl = createFilterElement('')
    const effects = parseSVGFilter(filterEl)
    expect(effects.length).toBe(0)
  })

  it('should handle both blur and drop shadow in same filter', () => {
    const filterEl = createFilterElement(
      '<feGaussianBlur in="SourceGraphic" stdDeviation="2" />' +
        '<feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.3" />',
    )
    const effects = parseSVGFilter(filterEl)
    expect(effects.length).toBe(2)
    expect(effects.some((e) => e.type === 'blur')).toBe(true)
    expect(effects.some((e) => e.type === 'drop-shadow')).toBe(true)
  })
})

describe('parseSVGFilterDefs', () => {
  it('should parse all filters with IDs', () => {
    const svg = createSVGWithFilters(
      '<filter id="blur1"><feGaussianBlur in="SourceGraphic" stdDeviation="5" /></filter>' +
        '<filter id="shadow1"><feDropShadow dx="2" dy="2" stdDeviation="3" /></filter>',
    )
    const map = parseSVGFilterDefs(svg)

    expect(map.size).toBe(2)
    expect(map.has('blur1')).toBe(true)
    expect(map.has('shadow1')).toBe(true)
  })

  it('should skip filters without IDs', () => {
    const svg = createSVGWithFilters(
      '<filter><feGaussianBlur in="SourceGraphic" stdDeviation="5" /></filter>' +
        '<filter id="valid"><feDropShadow dx="1" dy="1" /></filter>',
    )
    const map = parseSVGFilterDefs(svg)

    expect(map.size).toBe(1)
    expect(map.has('valid')).toBe(true)
  })

  it('should skip filters with no parseable effects', () => {
    const svg = createSVGWithFilters(
      '<filter id="empty"></filter>' +
        '<filter id="valid"><feGaussianBlur in="SourceGraphic" stdDeviation="5" /></filter>',
    )
    const map = parseSVGFilterDefs(svg)

    expect(map.size).toBe(1)
    expect(map.has('valid')).toBe(true)
    expect(map.has('empty')).toBe(false)
  })

  it('should return empty map for SVG without filters', () => {
    const svg = createSVGWithFilters('')
    const map = parseSVGFilterDefs(svg)
    expect(map.size).toBe(0)
  })
})

describe('resolveFilterReference', () => {
  it('should resolve url(#id) reference', () => {
    const filterMap = new Map<string, Effect[]>()
    const effects: Effect[] = [
      {
        id: 'test',
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: { kind: 'blur', radius: 5, quality: 'medium' } as BlurParams,
      },
    ]
    filterMap.set('myFilter', effects)

    const result = resolveFilterReference('url(#myFilter)', filterMap)
    expect(result).toBe(effects)
  })

  it('should return empty array for null filterAttr', () => {
    const filterMap = new Map<string, Effect[]>()
    expect(resolveFilterReference(null, filterMap)).toEqual([])
  })

  it('should return empty array for non-matching format', () => {
    const filterMap = new Map<string, Effect[]>()
    expect(resolveFilterReference('not-a-url', filterMap)).toEqual([])
  })

  it('should return empty array for unknown filter ID', () => {
    const filterMap = new Map<string, Effect[]>()
    expect(resolveFilterReference('url(#unknown)', filterMap)).toEqual([])
  })
})

describe('effectToSVGFilter', () => {
  it('should generate blur filter SVG', () => {
    const effect: Effect = {
      id: 'test-blur',
      type: 'blur',
      enabled: true,
      opacity: 1,
      params: { kind: 'blur', radius: 5, quality: 'medium' } as BlurParams,
    }

    const result = effectToSVGFilter(effect)
    expect(result).not.toBeNull()
    expect(result).toContain('feGaussianBlur')
    expect(result).toContain('stdDeviation="5"')
    expect(result).toContain('filter-test-blur')
  })

  it('should generate shadow filter SVG', () => {
    const effect: Effect = {
      id: 'test-shadow',
      type: 'shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'shadow',
        offsetX: 3,
        offsetY: 4,
        blurRadius: 5,
        spread: 0,
        color: '#ff0000',
        opacity: 0.8,
      } as ShadowParams,
    }

    const result = effectToSVGFilter(effect)
    expect(result).not.toBeNull()
    expect(result).toContain('feDropShadow')
    expect(result).toContain('dx="3"')
    expect(result).toContain('dy="4"')
    expect(result).toContain('stdDeviation="5"')
    expect(result).toContain('flood-color="#ff0000"')
    expect(result).toContain('flood-opacity="0.8"')
  })

  it('should generate glow filter SVG', () => {
    const effect: Effect = {
      id: 'test-glow',
      type: 'glow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'glow',
        radius: 10,
        spread: 0,
        color: '#00ff00',
        opacity: 0.6,
      } as GlowParams,
    }

    const result = effectToSVGFilter(effect)
    expect(result).not.toBeNull()
    expect(result).toContain('feGaussianBlur')
    expect(result).toContain('feFlood')
    expect(result).toContain('feMerge')
    expect(result).toContain('stdDeviation="10"')
    expect(result).toContain('flood-color="#00ff00"')
    expect(result).toContain('flood-opacity="0.6"')
  })

  it('should return null for disabled effect', () => {
    const effect: Effect = {
      id: 'disabled',
      type: 'blur',
      enabled: false,
      opacity: 1,
      params: { kind: 'blur', radius: 5, quality: 'medium' } as BlurParams,
    }

    expect(effectToSVGFilter(effect)).toBeNull()
  })

  it('should return null for unknown effect type', () => {
    const effect: Effect = {
      id: 'unknown',
      type: 'blur',
      enabled: true,
      opacity: 1,
      params: { kind: 'something-unknown' } as any,
    }

    expect(effectToSVGFilter(effect)).toBeNull()
  })
})
