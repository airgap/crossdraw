import { describe, test, expect } from 'bun:test'
import { PANEL_DEFINITIONS, getPanelDefinition, getAllPanelIds } from '@/ui/panels/panel-registry'

describe('panel-registry', () => {
  // ── PANEL_DEFINITIONS ─────────────────────────────────────────

  describe('PANEL_DEFINITIONS', () => {
    test('is an array', () => {
      expect(Array.isArray(PANEL_DEFINITIONS)).toBe(true)
    })

    test('has at least 20 panels', () => {
      expect(PANEL_DEFINITIONS.length).toBeGreaterThanOrEqual(20)
    })

    test('every definition has required fields', () => {
      for (const panel of PANEL_DEFINITIONS) {
        expect(typeof panel.id).toBe('string')
        expect(panel.id.length).toBeGreaterThan(0)
        expect(typeof panel.label).toBe('string')
        expect(panel.label.length).toBeGreaterThan(0)
        expect(typeof panel.icon).toBe('string')
        expect(panel.icon.length).toBeGreaterThan(0)
        expect(panel.component).toBeDefined()
      }
    })

    test('all panel ids are unique', () => {
      const ids = PANEL_DEFINITIONS.map((p) => p.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    test('all panel labels are unique', () => {
      const labels = PANEL_DEFINITIONS.map((p) => p.label)
      const unique = new Set(labels)
      expect(unique.size).toBe(labels.length)
    })

    test('includes essential panels', () => {
      const ids = PANEL_DEFINITIONS.map((p) => p.id)
      expect(ids).toContain('layers')
      expect(ids).toContain('properties')
      expect(ids).toContain('color-palette')
      expect(ids).toContain('history')
    })
  })

  // ── getPanelDefinition ────────────────────────────────────────

  describe('getPanelDefinition', () => {
    test('finds layers panel', () => {
      const panel = getPanelDefinition('layers')
      expect(panel).toBeDefined()
      expect(panel!.id).toBe('layers')
      expect(panel!.label).toBe('Layers')
    })

    test('finds properties panel', () => {
      const panel = getPanelDefinition('properties')
      expect(panel).toBeDefined()
      expect(panel!.label).toBe('Properties')
    })

    test('finds color-palette panel', () => {
      const panel = getPanelDefinition('color-palette')
      expect(panel).toBeDefined()
    })

    test('finds history panel', () => {
      const panel = getPanelDefinition('history')
      expect(panel).toBeDefined()
    })

    test('finds minimap panel', () => {
      const panel = getPanelDefinition('minimap')
      expect(panel).toBeDefined()
    })

    test('finds device-preview panel', () => {
      const panel = getPanelDefinition('device-preview')
      expect(panel).toBeDefined()
    })

    test('finds align panel', () => {
      const panel = getPanelDefinition('align')
      expect(panel).toBeDefined()
    })

    test('finds symbols panel', () => {
      const panel = getPanelDefinition('symbols')
      expect(panel).toBeDefined()
    })

    test('finds preferences panel', () => {
      const panel = getPanelDefinition('preferences')
      expect(panel).toBeDefined()
    })

    test('finds artboards panel', () => {
      const panel = getPanelDefinition('artboards')
      expect(panel).toBeDefined()
    })

    test('finds guides panel', () => {
      const panel = getPanelDefinition('guides')
      expect(panel).toBeDefined()
    })

    test('finds export (batch export) panel', () => {
      const panel = getPanelDefinition('export')
      expect(panel).toBeDefined()
    })

    test('finds color-harmony panel', () => {
      const panel = getPanelDefinition('color-harmony')
      expect(panel).toBeDefined()
    })

    test('finds find-replace panel', () => {
      const panel = getPanelDefinition('find-replace')
      expect(panel).toBeDefined()
    })

    test('finds global-colors panel', () => {
      const panel = getPanelDefinition('global-colors')
      expect(panel).toBeDefined()
    })

    test('finds accessibility panel', () => {
      const panel = getPanelDefinition('accessibility')
      expect(panel).toBeDefined()
    })

    test('finds inspect panel', () => {
      const panel = getPanelDefinition('inspect')
      expect(panel).toBeDefined()
    })

    test('finds code panel', () => {
      const panel = getPanelDefinition('code')
      expect(panel).toBeDefined()
    })

    test('finds lint panel', () => {
      const panel = getPanelDefinition('lint')
      expect(panel).toBeDefined()
    })

    test('finds comments panel', () => {
      const panel = getPanelDefinition('comments')
      expect(panel).toBeDefined()
    })

    test('finds animation panel', () => {
      const panel = getPanelDefinition('animation')
      expect(panel).toBeDefined()
    })

    test('finds interactions panel', () => {
      const panel = getPanelDefinition('interactions')
      expect(panel).toBeDefined()
    })

    test('finds collaboration panel', () => {
      const panel = getPanelDefinition('collaboration')
      expect(panel).toBeDefined()
    })

    test('finds ai-assistant panel', () => {
      const panel = getPanelDefinition('ai-assistant')
      expect(panel).toBeDefined()
    })

    test('finds versions panel', () => {
      const panel = getPanelDefinition('versions')
      expect(panel).toBeDefined()
    })

    test('finds variables panel', () => {
      const panel = getPanelDefinition('variables')
      expect(panel).toBeDefined()
    })

    test('finds styles panel', () => {
      const panel = getPanelDefinition('styles')
      expect(panel).toBeDefined()
    })

    test('finds dev-mode panel', () => {
      const panel = getPanelDefinition('dev-mode')
      expect(panel).toBeDefined()
    })

    test('finds cloud-files panel', () => {
      const panel = getPanelDefinition('cloud-files')
      expect(panel).toBeDefined()
    })

    test('finds libraries panel', () => {
      const panel = getPanelDefinition('libraries')
      expect(panel).toBeDefined()
    })

    test('finds pngtuber panel', () => {
      const panel = getPanelDefinition('pngtuber')
      expect(panel).toBeDefined()
    })

    test('finds pngtuber-preview panel', () => {
      const panel = getPanelDefinition('pngtuber-preview')
      expect(panel).toBeDefined()
    })

    test('returns undefined for non-existent panel', () => {
      expect(getPanelDefinition('no-such-panel')).toBeUndefined()
    })

    test('returns undefined for empty string', () => {
      expect(getPanelDefinition('')).toBeUndefined()
    })

    test('every panel component is a function or lazy component', () => {
      for (const panel of PANEL_DEFINITIONS) {
        const def = getPanelDefinition(panel.id)
        expect(def).toBeDefined()
        // React.lazy returns an object with $$typeof; React.FC is a function
        // Both should be truthy
        expect(def!.component).toBeTruthy()
      }
    })

    test('each panel component is a valid lazy loader (has $$typeof or is function)', () => {
      for (const panel of PANEL_DEFINITIONS) {
        const def = getPanelDefinition(panel.id)!
        const comp = def.component as any
        // React.lazy components have $$typeof property
        // Regular function components are typeof 'function'
        const isLazy = comp && comp.$$typeof !== undefined
        const isFunction = typeof comp === 'function'
        expect(isLazy || isFunction).toBe(true)
      }
    })
  })

  // ── getAllPanelIds ─────────────────────────────────────────────

  describe('getAllPanelIds', () => {
    test('returns an array of strings', () => {
      const ids = getAllPanelIds()
      expect(Array.isArray(ids)).toBe(true)
      for (const id of ids) {
        expect(typeof id).toBe('string')
      }
    })

    test('returns same count as PANEL_DEFINITIONS', () => {
      expect(getAllPanelIds().length).toBe(PANEL_DEFINITIONS.length)
    })

    test('matches PANEL_DEFINITIONS ids', () => {
      const ids = getAllPanelIds()
      const defIds = PANEL_DEFINITIONS.map((p) => p.id)
      expect(ids).toEqual(defIds)
    })

    test('contains layers', () => {
      expect(getAllPanelIds()).toContain('layers')
    })

    test('contains properties', () => {
      expect(getAllPanelIds()).toContain('properties')
    })

    test('every id can be found via getPanelDefinition', () => {
      for (const id of getAllPanelIds()) {
        expect(getPanelDefinition(id)).toBeDefined()
      }
    })
  })
})
