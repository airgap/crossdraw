import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origLocalStorage = globalThis.localStorage

afterAll(() => {
  if (origLocalStorage !== undefined) {
    globalThis.localStorage = origLocalStorage
  } else {
    delete (globalThis as any).localStorage
  }
})

// Polyfill localStorage for bun:test
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

import {
  getWorkspacePresets,
  saveWorkspacePreset,
  loadWorkspacePreset,
  deleteWorkspacePreset,
  resetWorkspace,
} from '@/ui/workspace-presets'
import { usePanelLayoutStore } from '@/ui/panels/panel-layout-store'

describe('workspace-presets', () => {
  beforeEach(() => {
    localStorage.clear()
    usePanelLayoutStore.getState().resetLayout()
  })

  // ── getWorkspacePresets ──

  describe('getWorkspacePresets', () => {
    test('returns built-in presets', () => {
      const presets = getWorkspacePresets()
      expect(presets.length).toBeGreaterThanOrEqual(4)
    })

    test('built-in presets have expected names', () => {
      const presets = getWorkspacePresets()
      const names = presets.map((p) => p.name)
      expect(names).toContain('Default')
      expect(names).toContain('Illustration')
      expect(names).toContain('Photo Editing')
      expect(names).toContain('Minimal')
    })

    test('built-in presets are marked as builtIn', () => {
      const presets = getWorkspacePresets()
      const builtIns = presets.filter((p) => p.builtIn)
      expect(builtIns.length).toBeGreaterThanOrEqual(4)
    })

    test('built-in presets have valid ids', () => {
      const presets = getWorkspacePresets()
      const builtInIds = presets.filter((p) => p.builtIn).map((p) => p.id)
      expect(builtInIds).toContain('default')
      expect(builtInIds).toContain('illustration')
      expect(builtInIds).toContain('photo-editing')
      expect(builtInIds).toContain('minimal')
    })

    test('includes custom presets from storage', () => {
      saveWorkspacePreset('My Custom')
      const presets = getWorkspacePresets()
      const custom = presets.find((p) => p.name === 'My Custom')
      expect(custom).toBeDefined()
      expect(custom!.builtIn).toBe(false)
    })
  })

  // ── saveWorkspacePreset ──

  describe('saveWorkspacePreset', () => {
    test('captures current layout state', () => {
      const preset = saveWorkspacePreset('Test Preset')
      expect(preset.name).toBe('Test Preset')
      expect(preset.builtIn).toBe(false)
      expect(preset.id).toBeDefined()
      expect(preset.layout).toBeDefined()
      expect(preset.layout.rightColumn).toBeDefined()
    })

    test('saves to localStorage', () => {
      saveWorkspacePreset('Saved One')
      const stored = localStorage.getItem('crossdraw:workspace-presets')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.length).toBe(1)
      expect(parsed[0].name).toBe('Saved One')
    })

    test('overwrites existing preset with same name', () => {
      saveWorkspacePreset('Duplicate')
      const firstId = getWorkspacePresets().find((p) => p.name === 'Duplicate')!.id

      // Modify layout
      usePanelLayoutStore.getState().resizeColumn('right', 300)
      saveWorkspacePreset('Duplicate')

      const presets = getWorkspacePresets()
      const matches = presets.filter((p) => p.name === 'Duplicate')
      expect(matches.length).toBe(1)
      // Should keep the same ID
      expect(matches[0]!.id).toBe(firstId)
    })

    test('creates new preset with unique ID for different names', () => {
      const p1 = saveWorkspacePreset('First')
      const p2 = saveWorkspacePreset('Second')
      expect(p1.id).not.toBe(p2.id)
    })

    test('snapshot includes floating panels', () => {
      usePanelLayoutStore.getState().popOut('history', 50, 75)
      const preset = saveWorkspacePreset('With Float')
      expect(preset.layout.floatingPanels.length).toBeGreaterThan(0)
    })
  })

  // ── loadWorkspacePreset ──

  describe('loadWorkspacePreset', () => {
    test('loads built-in preset by id', () => {
      const result = loadWorkspacePreset('minimal')
      expect(result).toBe(true)
    })

    test('updates store state after loading', () => {
      loadWorkspacePreset('minimal')
      const state = usePanelLayoutStore.getState()
      // Minimal has just one group with 'layers'
      const allTabs = state.rightColumn.groups.flatMap((g) => g.tabs)
      expect(allTabs).toContain('layers')
    })

    test('returns false for non-existent preset', () => {
      const result = loadWorkspacePreset('nonexistent-id')
      expect(result).toBe(false)
    })

    test('regenerates group IDs', () => {
      loadWorkspacePreset('default')
      const firstGroupId = usePanelLayoutStore.getState().rightColumn.groups[0]!.id

      loadWorkspacePreset('default')
      const secondGroupId = usePanelLayoutStore.getState().rightColumn.groups[0]!.id

      // IDs should be different each time (regenerated UUIDs)
      expect(firstGroupId).not.toBe(secondGroupId)
    })

    test('clears collapsed groups and heights on load', () => {
      const gid = usePanelLayoutStore.getState().rightColumn.groups[0]!.id
      usePanelLayoutStore.getState().toggleGroupCollapse(gid)
      usePanelLayoutStore.getState().setGroupHeight(gid, 300)

      loadWorkspacePreset('default')
      expect(usePanelLayoutStore.getState().collapsedGroups).toEqual({})
      expect(usePanelLayoutStore.getState().groupHeights).toEqual({})
    })

    test('loads custom preset', () => {
      usePanelLayoutStore.getState().resizeColumn('right', 350)
      const saved = saveWorkspacePreset('Custom Layout')

      // Reset to default
      usePanelLayoutStore.getState().resetLayout()

      const result = loadWorkspacePreset(saved.id)
      expect(result).toBe(true)
    })

    test('persists to localStorage after loading', () => {
      loadWorkspacePreset('minimal')
      const stored = localStorage.getItem('crossdraw:panel-layout')
      expect(stored).not.toBeNull()
    })
  })

  // ── deleteWorkspacePreset ──

  describe('deleteWorkspacePreset', () => {
    test('deletes custom preset', () => {
      const preset = saveWorkspacePreset('To Delete')
      const result = deleteWorkspacePreset(preset.id)
      expect(result).toBe(true)

      const presets = getWorkspacePresets()
      expect(presets.find((p) => p.id === preset.id)).toBeUndefined()
    })

    test('returns false for non-existent preset', () => {
      const result = deleteWorkspacePreset('nonexistent')
      expect(result).toBe(false)
    })

    test('cannot delete built-in presets via this function', () => {
      // Built-in presets are not in the customs list, so delete won't find them
      const result = deleteWorkspacePreset('default')
      expect(result).toBe(false)
    })

    test('saves updated list after deletion', () => {
      saveWorkspacePreset('Keep')
      const toDelete = saveWorkspacePreset('Remove')
      deleteWorkspacePreset(toDelete.id)

      const stored = JSON.parse(localStorage.getItem('crossdraw:workspace-presets')!)
      expect(stored.length).toBe(1)
      expect(stored[0].name).toBe('Keep')
    })
  })

  // ── resetWorkspace ──

  describe('resetWorkspace', () => {
    test('loads default preset', () => {
      // Modify layout
      usePanelLayoutStore.getState().popOut('layers')
      usePanelLayoutStore.getState().resizeColumn('right', 350)

      resetWorkspace()

      const state = usePanelLayoutStore.getState()
      // Should have default-like layout (right column with layers and properties)
      const allTabs = state.rightColumn.groups.flatMap((g) => g.tabs)
      expect(allTabs).toContain('layers')
      expect(allTabs).toContain('properties')
      expect(allTabs).toContain('color-palette')
    })
  })
})
