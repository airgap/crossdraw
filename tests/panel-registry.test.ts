import { describe, test, expect, beforeAll } from 'bun:test'
import { PANEL_DEFINITIONS, getPanelDefinition, getAllPanelIds, setAIEnabled } from '@/ui/panels/panel-registry'

beforeAll(() => {
  setAIEnabled(true)
})

describe('panel-registry', () => {
  describe('PANEL_DEFINITIONS', () => {
    test('is a non-empty array', () => {
      expect(Array.isArray(PANEL_DEFINITIONS)).toBe(true)
      expect(PANEL_DEFINITIONS.length).toBeGreaterThan(0)
    })

    test('each definition has required fields', () => {
      for (const def of PANEL_DEFINITIONS) {
        expect(typeof def.id).toBe('string')
        expect(def.id.length).toBeGreaterThan(0)
        expect(typeof def.label).toBe('string')
        expect(def.label.length).toBeGreaterThan(0)
        expect(typeof def.icon).toBe('string')
        expect(def.component).toBeDefined()
      }
    })

    test('all IDs are unique', () => {
      const ids = PANEL_DEFINITIONS.map((d) => d.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    test('includes standard panels', () => {
      const ids = PANEL_DEFINITIONS.map((d) => d.id)
      expect(ids).toContain('layers')
      expect(ids).toContain('properties')
      expect(ids).toContain('color-palette')
      expect(ids).toContain('history')
      expect(ids).toContain('minimap')
      expect(ids).toContain('symbols')
      expect(ids).toContain('preferences')
      expect(ids).toContain('guides')
      expect(ids).toContain('export')
      expect(ids).toContain('pngtuber')
      expect(ids).toContain('pngtuber-preview')
    })
  })

  describe('getPanelDefinition', () => {
    test('returns definition for known ID', () => {
      const def = getPanelDefinition('layers')
      expect(def).toBeDefined()
      expect(def!.id).toBe('layers')
      expect(def!.label).toBe('Layers')
    })

    test('returns undefined for unknown ID', () => {
      expect(getPanelDefinition('nonexistent')).toBeUndefined()
    })

    test('returns correct definition for each known panel', () => {
      for (const def of PANEL_DEFINITIONS) {
        const found = getPanelDefinition(def.id)
        expect(found).toBeDefined()
        expect(found!.id).toBe(def.id)
        expect(found!.label).toBe(def.label)
      }
    })

    test('returns properties panel with correct label', () => {
      const def = getPanelDefinition('properties')
      expect(def!.label).toBe('Properties')
    })

    test('returns color-palette panel', () => {
      const def = getPanelDefinition('color-palette')
      expect(def!.label).toBe('Color Palette')
    })

    test('returns align panel', () => {
      const def = getPanelDefinition('align')
      expect(def!.label).toBe('Align & Distribute')
    })
  })

  describe('getAllPanelIds', () => {
    test('returns array of strings', () => {
      const ids = getAllPanelIds()
      expect(Array.isArray(ids)).toBe(true)
      expect(ids.every((id) => typeof id === 'string')).toBe(true)
    })

    test('returns same count as PANEL_DEFINITIONS', () => {
      expect(getAllPanelIds().length).toBe(PANEL_DEFINITIONS.length)
    })

    test('matches PANEL_DEFINITIONS IDs', () => {
      const ids = getAllPanelIds()
      const defIds = PANEL_DEFINITIONS.map((d) => d.id)
      expect(ids).toEqual(defIds)
    })

    test('includes layers and properties', () => {
      const ids = getAllPanelIds()
      expect(ids).toContain('layers')
      expect(ids).toContain('properties')
    })
  })
})
