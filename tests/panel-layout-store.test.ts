import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test'

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

import { usePanelLayoutStore, MIN_GROUP_HEIGHT } from '@/ui/panels/panel-layout-store'

const getState = () => usePanelLayoutStore.getState()

describe('panel-layout-store', () => {
  let initialState: ReturnType<typeof getState>

  beforeEach(() => {
    // Reset to default layout before each test
    getState().resetLayout()
    initialState = { ...getState() }
    localStorage.clear()
  })

  afterEach(() => {
    usePanelLayoutStore.setState(initialState)
  })

  // ── Default state ──

  describe('default state', () => {
    test('has null leftColumn', () => {
      expect(getState().leftColumn).toBeNull()
    })

    test('has rightColumn with 2 groups', () => {
      const rc = getState().rightColumn
      expect(rc).not.toBeNull()
      expect(rc.groups.length).toBe(2)
    })

    test('rightColumn has layers and properties tabs', () => {
      const rc = getState().rightColumn
      expect(rc.groups[0]!.tabs).toEqual(['layers'])
      expect(rc.groups[0]!.activeTab).toBe('layers')
      expect(rc.groups[1]!.tabs).toEqual(['properties'])
      expect(rc.groups[1]!.activeTab).toBe('properties')
    })

    test('rightColumn width is 260', () => {
      expect(getState().rightColumn.width).toBe(260)
    })

    test('has empty floatingPanels', () => {
      expect(getState().floatingPanels).toEqual([])
    })

    test('has empty collapsedGroups', () => {
      expect(getState().collapsedGroups).toEqual({})
    })

    test('has empty groupHeights', () => {
      expect(getState().groupHeights).toEqual({})
    })
  })

  // ── focusTab ──

  describe('focusTab', () => {
    test('sets activeTab in right column group', () => {
      // Add a second tab to the first group
      getState().moveTab('color-palette', 'right', 0)
      expect(getState().rightColumn.groups[0]!.tabs).toContain('color-palette')
      expect(getState().rightColumn.groups[0]!.activeTab).toBe('color-palette')

      // Now focus 'layers' in that same group
      getState().focusTab('layers')
      expect(getState().rightColumn.groups[0]!.activeTab).toBe('layers')
    })

    test('sets activeTab in left column group', () => {
      // Move a tab to the left column
      getState().moveTab('history', 'left', 0)
      getState().moveTab('color-palette', 'left', 0)
      expect(getState().leftColumn!.groups[0]!.activeTab).toBe('color-palette')

      getState().focusTab('history')
      expect(getState().leftColumn!.groups[0]!.activeTab).toBe('history')
    })

    test('ignores already-visible floating panel', () => {
      getState().popOut('layers', 100, 100)
      const before = getState().floatingPanels.length
      getState().focusTab('layers')
      // Should not add duplicates
      expect(getState().floatingPanels.length).toBe(before)
    })

    test('adds unknown tab to rightColumn last group', () => {
      getState().focusTab('minimap')
      const rc = getState().rightColumn
      const lastGroup = rc.groups[rc.groups.length - 1]!
      expect(lastGroup.tabs).toContain('minimap')
      expect(lastGroup.activeTab).toBe('minimap')
    })

    test('creates new group if rightColumn groups are empty', () => {
      // Move all tabs out of right column to make it empty
      // removeGroup sets column to null when last group is removed, but rightColumn
      // always persists via removeTabFromAll fallback { groups: [], width: ... }
      // Instead, manually set an empty rightColumn state
      usePanelLayoutStore.setState({
        rightColumn: { groups: [], width: 260 },
      })
      expect(getState().rightColumn.groups.length).toBe(0)

      getState().focusTab('history')
      const newRc = getState().rightColumn
      expect(newRc.groups.length).toBeGreaterThan(0)
      expect(newRc.groups[0]!.tabs).toContain('history')
    })
  })

  // ── moveTab ──

  describe('moveTab', () => {
    test('moves tab to existing group at specific index', () => {
      getState().moveTab('layers', 'right', 1, 0)
      const group = getState().rightColumn.groups[1]!
      expect(group.tabs[0]).toBe('layers')
      expect(group.activeTab).toBe('layers')
    })

    test('moves tab to left column, creating it if needed', () => {
      expect(getState().leftColumn).toBeNull()
      getState().moveTab('layers', 'left', 0)
      expect(getState().leftColumn).not.toBeNull()
      expect(getState().leftColumn!.groups[0]!.tabs).toContain('layers')
    })

    test('creates new group when targetGroupIndex exceeds existing groups', () => {
      const before = getState().rightColumn.groups.length
      getState().moveTab('history', 'right', 100)
      expect(getState().rightColumn.groups.length).toBe(before + 1)
    })

    test('removes tab from previous location', () => {
      // layers is in right[0]
      getState().moveTab('layers', 'right', 1)
      // First group should be removed since it had only 'layers'
      // So now the right column should just have properties + layers
      const rc = getState().rightColumn
      const allTabs = rc.groups.flatMap((g) => g.tabs)
      // layers should appear exactly once
      expect(allTabs.filter((t) => t === 'layers').length).toBe(1)
    })

    test('inserts at specified index within group', () => {
      getState().moveTab('history', 'right', 0, 0)
      expect(getState().rightColumn.groups[0]!.tabs[0]).toBe('history')
    })

    test('appends to end when no insertIndex', () => {
      getState().moveTab('history', 'right', 0)
      const tabs = getState().rightColumn.groups[0]!.tabs
      expect(tabs[tabs.length - 1]).toBe('history')
    })
  })

  // ── reorderTabs ──

  describe('reorderTabs', () => {
    test('reorders tabs within a group', () => {
      // Put two tabs in the first group
      getState().moveTab('history', 'right', 0)
      const group = getState().rightColumn.groups[0]!
      expect(group.tabs).toContain('history')

      const originalTabs = [...group.tabs]
      const reversed = [...originalTabs].reverse()
      getState().reorderTabs('right', 0, reversed)
      expect(getState().rightColumn.groups[0]!.tabs).toEqual(reversed)
    })

    test('rejects reorder with wrong length', () => {
      const before = [...getState().rightColumn.groups[0]!.tabs]
      getState().reorderTabs('right', 0, ['layers', 'extra'])
      // Should not change
      expect(getState().rightColumn.groups[0]!.tabs).toEqual(before)
    })

    test('rejects reorder with different tab set', () => {
      const before = [...getState().rightColumn.groups[0]!.tabs]
      getState().reorderTabs('right', 0, ['nonexistent'])
      expect(getState().rightColumn.groups[0]!.tabs).toEqual(before)
    })

    test('rejects reorder for non-existent column', () => {
      // leftColumn is null
      getState().reorderTabs('left', 0, ['layers'])
      // No crash
    })

    test('rejects reorder for out-of-range group index', () => {
      const before = getState().rightColumn.groups.length
      getState().reorderTabs('right', 100, ['layers'])
      expect(getState().rightColumn.groups.length).toBe(before)
    })
  })

  // ── popOut ──

  describe('popOut', () => {
    test('creates a floating panel with default position', () => {
      getState().popOut('layers')
      expect(getState().floatingPanels.length).toBe(1)
      expect(getState().floatingPanels[0]!.tabId).toBe('layers')
      expect(getState().floatingPanels[0]!.x).toBe(200)
      expect(getState().floatingPanels[0]!.y).toBe(200)
      expect(getState().floatingPanels[0]!.width).toBe(300)
      expect(getState().floatingPanels[0]!.height).toBe(400)
    })

    test('creates a floating panel with custom position', () => {
      getState().popOut('layers', 50, 75)
      expect(getState().floatingPanels[0]!.x).toBe(50)
      expect(getState().floatingPanels[0]!.y).toBe(75)
    })

    test('removes tab from column when popped out', () => {
      getState().popOut('layers')
      const allTabs = getState().rightColumn.groups.flatMap((g) => g.tabs)
      expect(allTabs).not.toContain('layers')
    })

    test('does not duplicate if already floating', () => {
      getState().popOut('layers')
      getState().popOut('layers')
      expect(getState().floatingPanels.filter((p) => p.tabId === 'layers').length).toBe(1)
    })
  })

  // ── dockPanel ──

  describe('dockPanel', () => {
    test('docks panel to specific group index', () => {
      getState().popOut('layers')
      getState().dockPanel('layers', 'right', 0)
      expect(getState().floatingPanels.length).toBe(0)
      expect(getState().rightColumn.groups[0]!.tabs).toContain('layers')
    })

    test('docks to last group when no groupIndex specified', () => {
      getState().popOut('layers')
      getState().dockPanel('layers', 'right')
      const rc = getState().rightColumn
      const lastGroup = rc.groups[rc.groups.length - 1]!
      expect(lastGroup.tabs).toContain('layers')
    })

    test('docks to left column creating it if needed', () => {
      getState().popOut('layers')
      getState().dockPanel('layers', 'left')
      expect(getState().leftColumn).not.toBeNull()
      expect(getState().leftColumn!.groups.some((g) => g.tabs.includes('layers'))).toBe(true)
    })
  })

  // ── closeFloating ──

  describe('closeFloating', () => {
    test('removes floating panel', () => {
      getState().popOut('layers')
      expect(getState().floatingPanels.length).toBe(1)
      getState().closeFloating('layers')
      expect(getState().floatingPanels.length).toBe(0)
    })

    test('does nothing for non-floating tab', () => {
      const before = getState().floatingPanels.length
      getState().closeFloating('nonexistent')
      expect(getState().floatingPanels.length).toBe(before)
    })
  })

  // ── updateFloatingPosition ──

  describe('updateFloatingPosition', () => {
    test('updates x and y', () => {
      getState().popOut('layers', 100, 100)
      getState().updateFloatingPosition('layers', 300, 400)
      const fp = getState().floatingPanels.find((p) => p.tabId === 'layers')!
      expect(fp.x).toBe(300)
      expect(fp.y).toBe(400)
    })
  })

  // ── updateFloatingSize ──

  describe('updateFloatingSize', () => {
    test('updates width and height', () => {
      getState().popOut('layers')
      getState().updateFloatingSize('layers', 500, 600)
      const fp = getState().floatingPanels.find((p) => p.tabId === 'layers')!
      expect(fp.width).toBe(500)
      expect(fp.height).toBe(600)
    })

    test('enforces minimum width', () => {
      getState().popOut('layers')
      getState().updateFloatingSize('layers', 50, 600)
      const fp = getState().floatingPanels.find((p) => p.tabId === 'layers')!
      expect(fp.width).toBe(200) // MIN_FLOAT_WIDTH
    })

    test('enforces minimum height', () => {
      getState().popOut('layers')
      getState().updateFloatingSize('layers', 500, 50)
      const fp = getState().floatingPanels.find((p) => p.tabId === 'layers')!
      expect(fp.height).toBe(150) // MIN_FLOAT_HEIGHT
    })
  })

  // ── resizeColumn ──

  describe('resizeColumn', () => {
    test('resizes right column', () => {
      getState().resizeColumn('right', 300)
      expect(getState().rightColumn.width).toBe(300)
    })

    test('clamps to minimum width', () => {
      getState().resizeColumn('right', 50)
      expect(getState().rightColumn.width).toBe(180) // MIN_COLUMN_WIDTH
    })

    test('clamps to maximum width', () => {
      getState().resizeColumn('right', 999)
      expect(getState().rightColumn.width).toBe(400) // MAX_COLUMN_WIDTH
    })

    test('does nothing for null column', () => {
      expect(getState().leftColumn).toBeNull()
      getState().resizeColumn('left', 300)
      // No crash, no change
      expect(getState().leftColumn).toBeNull()
    })

    test('resizes left column when it exists', () => {
      getState().moveTab('history', 'left', 0)
      getState().resizeColumn('left', 250)
      expect(getState().leftColumn!.width).toBe(250)
    })
  })

  // ── addGroupSplit ──

  describe('addGroupSplit', () => {
    test('adds a new group at specified index', () => {
      const before = getState().rightColumn.groups.length
      getState().addGroupSplit('history', 'right', 1)
      expect(getState().rightColumn.groups.length).toBe(before + 1)
      expect(getState().rightColumn.groups[1]!.tabs).toContain('history')
    })

    test('creates column if needed for left split', () => {
      getState().addGroupSplit('history', 'left', 0)
      expect(getState().leftColumn).not.toBeNull()
      expect(getState().leftColumn!.groups[0]!.tabs).toContain('history')
    })

    test('clamps insert index to valid range', () => {
      getState().addGroupSplit('history', 'right', 100)
      const groups = getState().rightColumn.groups
      const lastGroup = groups[groups.length - 1]!
      expect(lastGroup.tabs).toContain('history')
    })

    test('removes tab from original location', () => {
      getState().addGroupSplit('layers', 'right', 2)
      const allTabs = getState().rightColumn.groups.flatMap((g) => g.tabs)
      expect(allTabs.filter((t) => t === 'layers').length).toBe(1)
    })
  })

  // ── removeGroup ──

  describe('removeGroup', () => {
    test('removes a group from right column', () => {
      const before = getState().rightColumn.groups.length
      getState().removeGroup('right', 0)
      expect(getState().rightColumn.groups.length).toBe(before - 1)
    })

    test('sets column to null when last group removed from left', () => {
      getState().moveTab('history', 'left', 0)
      expect(getState().leftColumn).not.toBeNull()
      getState().removeGroup('left', 0)
      expect(getState().leftColumn).toBeNull()
    })

    test('does nothing for non-existent column', () => {
      getState().removeGroup('left', 0)
      // No crash
    })

    test('does nothing for out-of-range group index', () => {
      const before = getState().rightColumn.groups.length
      getState().removeGroup('right', 100)
      expect(getState().rightColumn.groups.length).toBe(before)
    })
  })

  // ── toggleGroupCollapse ──

  describe('toggleGroupCollapse', () => {
    test('toggles collapse state', () => {
      const groupId = getState().rightColumn.groups[0]!.id
      expect(getState().collapsedGroups[groupId]).toBeFalsy()

      getState().toggleGroupCollapse(groupId)
      expect(getState().collapsedGroups[groupId]).toBe(true)

      getState().toggleGroupCollapse(groupId)
      expect(getState().collapsedGroups[groupId]).toBe(false)
    })
  })

  // ── setGroupCollapsed ──

  describe('setGroupCollapsed', () => {
    test('sets collapse to true', () => {
      const groupId = getState().rightColumn.groups[0]!.id
      getState().setGroupCollapsed(groupId, true)
      expect(getState().collapsedGroups[groupId]).toBe(true)
    })

    test('sets collapse to false', () => {
      const groupId = getState().rightColumn.groups[0]!.id
      getState().setGroupCollapsed(groupId, true)
      getState().setGroupCollapsed(groupId, false)
      expect(getState().collapsedGroups[groupId]).toBe(false)
    })
  })

  // ── setGroupHeight / resetGroupHeight ──

  describe('group height', () => {
    test('setGroupHeight stores height', () => {
      getState().setGroupHeight('test-group', 200)
      expect(getState().groupHeights['test-group']).toBe(200)
    })

    test('setGroupHeight enforces minimum', () => {
      getState().setGroupHeight('test-group', 10)
      expect(getState().groupHeights['test-group']).toBe(MIN_GROUP_HEIGHT)
    })

    test('resetGroupHeight removes the height entry', () => {
      getState().setGroupHeight('test-group', 200)
      expect(getState().groupHeights['test-group']).toBe(200)
      getState().resetGroupHeight('test-group')
      expect(getState().groupHeights['test-group']).toBeUndefined()
    })
  })

  // ── resetLayout ──

  describe('resetLayout', () => {
    test('resets to default layout', () => {
      // Modify state
      getState().popOut('layers')
      getState().setGroupHeight('something', 500)
      getState().toggleGroupCollapse('something')

      // Reset
      getState().resetLayout()

      const state = getState()
      expect(state.leftColumn).toBeNull()
      expect(state.rightColumn.groups.length).toBe(2)
      expect(state.floatingPanels).toEqual([])
      expect(state.collapsedGroups).toEqual({})
      expect(state.groupHeights).toEqual({})
    })
  })

  // ── Persistence ──

  describe('persistence', () => {
    test('persists state to localStorage on actions', () => {
      getState().resizeColumn('right', 300)
      const stored = localStorage.getItem('crossdraw:panel-layout')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.rightColumn.width).toBe(300)
    })

    test('persists floating panels', () => {
      getState().popOut('layers', 50, 75)
      const stored = localStorage.getItem('crossdraw:panel-layout')
      const parsed = JSON.parse(stored!)
      expect(parsed.floatingPanels.length).toBe(1)
      expect(parsed.floatingPanels[0].tabId).toBe('layers')
    })

    test('persists collapsed state', () => {
      const gid = getState().rightColumn.groups[0]!.id
      getState().toggleGroupCollapse(gid)
      const stored = localStorage.getItem('crossdraw:panel-layout')
      const parsed = JSON.parse(stored!)
      expect(parsed.collapsedGroups[gid]).toBe(true)
    })

    test('persists group heights', () => {
      getState().setGroupHeight('g1', 300)
      const stored = localStorage.getItem('crossdraw:panel-layout')
      const parsed = JSON.parse(stored!)
      expect(parsed.groupHeights['g1']).toBe(300)
    })
  })
})
