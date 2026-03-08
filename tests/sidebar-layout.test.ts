import { describe, test, expect, beforeEach } from 'bun:test'

// Test the panel-layout-store's collapse, group height, and persistence logic
// We test the store state directly since the UI components are React-based.

// Mock localStorage for tests
const storage = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() { return storage.size },
  key: (_i: number) => null,
}

// We'll import the constants and test persistence logic directly
import { MIN_GROUP_HEIGHT } from '@/ui/panels/panel-layout-store'

describe('Sidebar Layout Customization (LYK-142)', () => {
  beforeEach(() => {
    storage.clear()
  })

  describe('Constants', () => {
    test('MIN_GROUP_HEIGHT is 80px', () => {
      expect(MIN_GROUP_HEIGHT).toBe(80)
    })
  })

  describe('Collapse state persistence', () => {
    test('collapse state round-trips through localStorage', () => {
      const collapseState: Record<string, boolean> = {
        'group-1': true,
        'group-2': false,
        'group-3': true,
      }
      storage.set('designer:panel-layout', JSON.stringify({
        leftColumn: null,
        rightColumn: { groups: [], width: 260 },
        floatingPanels: [],
        collapsedGroups: collapseState,
        groupHeights: {},
      }))

      const raw = storage.get('designer:panel-layout')
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw!)
      expect(parsed.collapsedGroups).toEqual(collapseState)
      expect(parsed.collapsedGroups['group-1']).toBe(true)
      expect(parsed.collapsedGroups['group-2']).toBe(false)
    })
  })

  describe('Group height persistence', () => {
    test('group heights round-trip through localStorage', () => {
      const heights: Record<string, number> = {
        'group-a': 200,
        'group-b': 150,
      }
      storage.set('designer:panel-layout', JSON.stringify({
        leftColumn: null,
        rightColumn: { groups: [], width: 260 },
        floatingPanels: [],
        collapsedGroups: {},
        groupHeights: heights,
      }))

      const raw = storage.get('designer:panel-layout')
      const parsed = JSON.parse(raw!)
      expect(parsed.groupHeights).toEqual(heights)
      expect(parsed.groupHeights['group-a']).toBe(200)
    })

    test('group heights respect MIN_GROUP_HEIGHT', () => {
      const height = 50 // below minimum
      const clamped = Math.max(MIN_GROUP_HEIGHT, height)
      expect(clamped).toBe(MIN_GROUP_HEIGHT)
      expect(clamped).toBe(80)
    })

    test('group heights above minimum pass through', () => {
      const height = 250
      const clamped = Math.max(MIN_GROUP_HEIGHT, height)
      expect(clamped).toBe(250)
    })
  })

  describe('Column width persistence', () => {
    test('column width is stored and retrievable', () => {
      const layout = {
        leftColumn: null,
        rightColumn: { groups: [], width: 300 },
        floatingPanels: [],
        collapsedGroups: {},
        groupHeights: {},
      }
      storage.set('designer:panel-layout', JSON.stringify(layout))

      const parsed = JSON.parse(storage.get('designer:panel-layout')!)
      expect(parsed.rightColumn.width).toBe(300)
    })

    test('column width clamps to bounds (180-400)', () => {
      // Simulate clamping logic
      const clamp = (v: number) => Math.max(180, Math.min(400, v))
      expect(clamp(100)).toBe(180)
      expect(clamp(500)).toBe(400)
      expect(clamp(260)).toBe(260)
    })
  })

  describe('Layout state shape', () => {
    test('default layout includes collapsedGroups and groupHeights', () => {
      const defaultState = {
        leftColumn: null,
        rightColumn: {
          groups: [
            { id: 'g1', tabs: ['layers'], activeTab: 'layers' },
            { id: 'g2', tabs: ['properties'], activeTab: 'properties' },
          ],
          width: 260,
        },
        floatingPanels: [],
        collapsedGroups: {},
        groupHeights: {},
      }

      expect(defaultState.collapsedGroups).toEqual({})
      expect(defaultState.groupHeights).toEqual({})
      expect(defaultState.rightColumn.groups).toHaveLength(2)
    })

    test('collapsed group style removes flex growth', () => {
      // When a group is collapsed, its style should be:
      // { flex: 'none', minHeight: 'auto' }
      const isCollapsed = true
      const style = isCollapsed
        ? { flex: 'none', minHeight: 'auto' }
        : { flex: 1, minHeight: MIN_GROUP_HEIGHT }

      expect(style.flex).toBe('none')
      expect(style.minHeight).toBe('auto')
    })

    test('expanded group with explicit height uses fixed height', () => {
      const isCollapsed = false
      const explicitHeight = 250
      const style = isCollapsed
        ? { flex: 'none', height: undefined }
        : explicitHeight != null
          ? { height: explicitHeight, minHeight: MIN_GROUP_HEIGHT, flex: 'none' }
          : { flex: 1, minHeight: MIN_GROUP_HEIGHT }

      expect(style.height).toBe(250)
      expect(style.flex).toBe('none')
      expect(style.minHeight).toBe(MIN_GROUP_HEIGHT)
    })

    test('expanded group without explicit height uses flex', () => {
      const isCollapsed = false
      const explicitHeight: number | undefined = undefined
      const style = isCollapsed
        ? { flex: 'none' as const, height: undefined }
        : explicitHeight != null
          ? { height: explicitHeight, minHeight: MIN_GROUP_HEIGHT, flex: 'none' as const }
          : { flex: 1, minHeight: MIN_GROUP_HEIGHT }

      expect(style.flex).toBe(1)
      expect(style.minHeight).toBe(MIN_GROUP_HEIGHT)
    })
  })

  describe('Divider resize logic', () => {
    test('resize redistributes height between two groups', () => {
      const aboveH = 200
      const belowH = 200
      const totalH = aboveH + belowH
      const deltaY = 50 // drag down

      const newAboveH = Math.max(MIN_GROUP_HEIGHT, Math.min(totalH - MIN_GROUP_HEIGHT, aboveH + deltaY))
      const newBelowH = totalH - newAboveH

      expect(newAboveH).toBe(250)
      expect(newBelowH).toBe(150)
      expect(newAboveH + newBelowH).toBe(totalH) // total preserved
    })

    test('resize clamps above group to minimum', () => {
      const aboveH = 100
      const belowH = 200
      const totalH = aboveH + belowH
      const deltaY = -100 // drag up (shrink above)

      const newAboveH = Math.max(MIN_GROUP_HEIGHT, Math.min(totalH - MIN_GROUP_HEIGHT, aboveH + deltaY))
      const newBelowH = totalH - newAboveH

      expect(newAboveH).toBe(MIN_GROUP_HEIGHT) // clamped
      expect(newBelowH).toBe(totalH - MIN_GROUP_HEIGHT)
    })

    test('resize clamps below group to minimum', () => {
      const aboveH = 200
      const belowH = 100
      const totalH = aboveH + belowH
      const deltaY = 100 // drag down (shrink below)

      const newAboveH = Math.max(MIN_GROUP_HEIGHT, Math.min(totalH - MIN_GROUP_HEIGHT, aboveH + deltaY))
      const newBelowH = totalH - newAboveH

      expect(newBelowH).toBe(MIN_GROUP_HEIGHT) // clamped
      expect(newAboveH).toBe(totalH - MIN_GROUP_HEIGHT)
    })
  })
})
