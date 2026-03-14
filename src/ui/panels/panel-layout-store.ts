import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { getAllPanelIds } from './panel-registry'

// ── Types ──

export interface TabGroup {
  id: string
  tabs: string[]
  activeTab: string
}

export interface PanelColumn {
  groups: TabGroup[]
  width: number
}

export interface FloatingPanel {
  tabId: string
  x: number
  y: number
  width: number
  height: number
}

export interface PanelLayoutState {
  leftColumn: PanelColumn | null
  rightColumn: PanelColumn
  floatingPanels: FloatingPanel[]
  /** Map of groupId -> collapsed boolean */
  collapsedGroups: Record<string, boolean>
  /** Map of groupId -> height in pixels (only for groups with explicit height) */
  groupHeights: Record<string, number>
}

// ── Constants ──

const STORAGE_KEY = 'crossdraw:panel-layout'
const MIN_COLUMN_WIDTH = 180
const MAX_COLUMN_WIDTH = 400
export const MIN_GROUP_HEIGHT = 80
const MIN_FLOAT_WIDTH = 200
const MIN_FLOAT_HEIGHT = 150

// ── Default layout ──

function makeDefaultLayout(): PanelLayoutState {
  return {
    leftColumn: null,
    rightColumn: {
      groups: [
        { id: uuid(), tabs: ['layers'], activeTab: 'layers' },
        { id: uuid(), tabs: ['properties'], activeTab: 'properties' },
      ],
      width: 260,
    },
    floatingPanels: [],
    collapsedGroups: {},
    groupHeights: {},
  }
}

// ── Persistence ──

function loadFromStorage(): PanelLayoutState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* empty */
  }
  return null
}

function saveToStorage(state: PanelLayoutState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* empty */
  }
}

// ── Validation ──

function validateGroup(group: TabGroup, validIds: string[]): TabGroup | null {
  const tabs = group.tabs.filter((t) => validIds.includes(t))
  if (tabs.length === 0) return null
  const activeTab = tabs.includes(group.activeTab) ? group.activeTab : tabs[0]!
  return { id: group.id || uuid(), tabs, activeTab }
}

function validateColumn(col: PanelColumn | null, validIds: string[]): PanelColumn | null {
  if (!col) return null
  const groups = col.groups.map((g) => validateGroup(g, validIds)).filter((g): g is TabGroup => g !== null)
  if (groups.length === 0) return null
  return {
    groups,
    width: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, col.width || 260)),
  }
}

function validateLayout(layout: PanelLayoutState): PanelLayoutState {
  const validIds = getAllPanelIds()
  const rightColumn = validateColumn(layout.rightColumn, validIds)
  const leftColumn = validateColumn(layout.leftColumn, validIds)
  const floatingPanels = (layout.floatingPanels ?? []).filter((p) => validIds.includes(p.tabId))
  const collapsedGroups = layout.collapsedGroups ?? {}
  const groupHeights = layout.groupHeights ?? {}
  // Ensure rightColumn always exists — fall back to defaults
  if (!rightColumn) {
    return { ...makeDefaultLayout(), leftColumn, floatingPanels, collapsedGroups, groupHeights }
  }
  return { leftColumn, rightColumn, floatingPanels, collapsedGroups, groupHeights }
}

// ── Store actions ──

interface PanelLayoutActions {
  // Tab focus
  focusTab: (tabId: string) => void

  // Tab movement
  moveTab: (tabId: string, targetColumn: 'left' | 'right', targetGroupIndex: number, insertIndex?: number) => void
  reorderTabs: (column: 'left' | 'right', groupIndex: number, newOrder: string[]) => void

  // Floating
  popOut: (tabId: string, x?: number, y?: number) => void
  dockPanel: (tabId: string, column: 'left' | 'right', groupIndex?: number) => void
  closeFloating: (tabId: string) => void
  updateFloatingPosition: (tabId: string, x: number, y: number) => void
  updateFloatingSize: (tabId: string, width: number, height: number) => void

  // Column
  resizeColumn: (column: 'left' | 'right', width: number) => void

  // Group
  addGroupSplit: (tabId: string, column: 'left' | 'right', insertAtIndex: number) => void
  removeGroup: (column: 'left' | 'right', groupIndex: number) => void

  // Collapse/expand
  toggleGroupCollapse: (groupId: string) => void
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void

  // Group height resize
  setGroupHeight: (groupId: string, height: number) => void
  resetGroupHeight: (groupId: string) => void

  // Reset
  resetLayout: () => void
}

type PanelLayoutStore = PanelLayoutState & PanelLayoutActions

// ── Helper: remove tab from all locations ──

function removeTabFromAll(state: PanelLayoutState, tabId: string): PanelLayoutState {
  const removeFromColumn = (col: PanelColumn | null): PanelColumn | null => {
    if (!col) return null
    const groups = col.groups
      .map((g) => {
        if (!g.tabs.includes(tabId)) return g
        const tabs = g.tabs.filter((t) => t !== tabId)
        const activeTab = g.activeTab === tabId ? tabs[0] ?? '' : g.activeTab
        return { ...g, tabs, activeTab }
      })
      .filter((g) => g.tabs.length > 0)
    if (groups.length === 0) return null
    return { ...col, groups }
  }

  return {
    leftColumn: removeFromColumn(state.leftColumn),
    rightColumn: removeFromColumn(state.rightColumn) ?? {
      groups: [],
      width: state.rightColumn.width,
    },
    floatingPanels: state.floatingPanels.filter((p) => p.tabId !== tabId),
    collapsedGroups: state.collapsedGroups ?? {},
    groupHeights: state.groupHeights ?? {},
  }
}

function persist(state: PanelLayoutState) {
  saveToStorage({
    leftColumn: state.leftColumn,
    rightColumn: state.rightColumn,
    floatingPanels: state.floatingPanels,
    collapsedGroups: state.collapsedGroups,
    groupHeights: state.groupHeights,
  })
}

// ── Create store ──

function getInitialState(): PanelLayoutState {
  const saved = loadFromStorage()
  if (saved) {
    return validateLayout(saved)
  }
  return makeDefaultLayout()
}

export const usePanelLayoutStore = create<PanelLayoutStore>((set, get) => ({
  ...getInitialState(),

  focusTab(tabId: string) {
    const state = get()

    // Check columns
    for (const side of ['leftColumn', 'rightColumn'] as const) {
      const col = state[side]
      if (!col) continue
      for (let i = 0; i < col.groups.length; i++) {
        const g = col.groups[i]!
        if (g.tabs.includes(tabId)) {
          const groups = [...col.groups]
          groups[i] = { ...g, activeTab: tabId }
          const next = { ...state, [side]: { ...col, groups } }
          persist(next)
          set(next)
          return
        }
      }
    }

    // Check floating — already visible
    if (state.floatingPanels.some((p) => p.tabId === tabId)) return

    // Not found — add to right column's last group
    const col = state.rightColumn
    if (col.groups.length === 0) {
      const next: PanelLayoutState = {
        ...state,
        rightColumn: {
          ...col,
          groups: [{ id: uuid(), tabs: [tabId], activeTab: tabId }],
        },
      }
      persist(next)
      set(next)
    } else {
      const groups = [...col.groups]
      const last = groups[groups.length - 1]!
      groups[groups.length - 1] = {
        ...last,
        tabs: [...last.tabs, tabId],
        activeTab: tabId,
      }
      const next: PanelLayoutState = {
        ...state,
        rightColumn: { ...col, groups },
      }
      persist(next)
      set(next)
    }
  },

  moveTab(tabId, targetColumn, targetGroupIndex, insertIndex) {
    let state = removeTabFromAll(get(), tabId)

    const side = targetColumn === 'left' ? 'leftColumn' : 'rightColumn'
    let col = state[side]

    if (!col) {
      col = { groups: [], width: targetColumn === 'left' ? 260 : 260 }
    }

    if (col.groups.length === 0 || targetGroupIndex >= col.groups.length) {
      // Create a new group
      const groups = [...col.groups, { id: uuid(), tabs: [tabId], activeTab: tabId }]
      const next = { ...state, [side]: { ...col, groups } }
      persist(next)
      set(next)
    } else {
      const gi = Math.min(targetGroupIndex, col.groups.length - 1)
      const groups = [...col.groups]
      const group = groups[gi]!
      const tabs = [...group.tabs]
      const idx = insertIndex != null ? Math.min(insertIndex, tabs.length) : tabs.length
      tabs.splice(idx, 0, tabId)
      groups[gi] = { ...group, tabs, activeTab: tabId }
      const next = { ...state, [side]: { ...col, groups } }
      persist(next)
      set(next)
    }
  },

  reorderTabs(column, groupIndex, newOrder) {
    const state = get()
    const side = column === 'left' ? 'leftColumn' : 'rightColumn'
    const col = state[side]
    if (!col || groupIndex >= col.groups.length) return
    const group = col.groups[groupIndex]!
    if (newOrder.length !== group.tabs.length || !newOrder.every((t) => group.tabs.includes(t))) return
    const groups = [...col.groups]
    groups[groupIndex] = { ...group, tabs: [...newOrder] }
    const next = { ...state, [side]: { ...col, groups } }
    persist(next)
    set(next)
  },

  popOut(tabId, x, y) {
    const state = get()
    if (state.floatingPanels.some((p) => p.tabId === tabId)) return
    const cleaned = removeTabFromAll(state, tabId)
    const next: PanelLayoutState = {
      ...cleaned,
      floatingPanels: [
        ...cleaned.floatingPanels,
        {
          tabId,
          x: x ?? 200,
          y: y ?? 200,
          width: 300,
          height: 400,
        },
      ],
    }
    persist(next)
    set(next)
  },

  dockPanel(tabId, column, groupIndex) {
    const { moveTab } = get()
    if (groupIndex != null) {
      moveTab(tabId, column, groupIndex)
    } else {
      // Add to last group
      const state = get()
      const side = column === 'left' ? 'leftColumn' : 'rightColumn'
      const col = state[side]
      const gi = col ? col.groups.length - 1 : 0
      moveTab(tabId, column, Math.max(0, gi))
    }
  },

  closeFloating(tabId) {
    const state = get()
    const next: PanelLayoutState = {
      ...state,
      floatingPanels: state.floatingPanels.filter((p) => p.tabId !== tabId),
    }
    persist(next)
    set(next)
  },

  updateFloatingPosition(tabId, x, y) {
    const state = get()
    const next: PanelLayoutState = {
      ...state,
      floatingPanels: state.floatingPanels.map((p) => (p.tabId === tabId ? { ...p, x, y } : p)),
    }
    persist(next)
    set(next)
  },

  updateFloatingSize(tabId, width, height) {
    const state = get()
    const next: PanelLayoutState = {
      ...state,
      floatingPanels: state.floatingPanels.map((p) =>
        p.tabId === tabId
          ? {
              ...p,
              width: Math.max(MIN_FLOAT_WIDTH, width),
              height: Math.max(MIN_FLOAT_HEIGHT, height),
            }
          : p,
      ),
    }
    persist(next)
    set(next)
  },

  resizeColumn(column, width) {
    const state = get()
    const side = column === 'left' ? 'leftColumn' : 'rightColumn'
    const col = state[side]
    if (!col) return
    const clamped = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width))
    const next = { ...state, [side]: { ...col, width: clamped } }
    persist(next)
    set(next)
  },

  addGroupSplit(tabId, column, insertAtIndex) {
    let state = removeTabFromAll(get(), tabId)
    const side = column === 'left' ? 'leftColumn' : 'rightColumn'
    let col = state[side]
    if (!col) {
      col = { groups: [], width: 260 }
    }
    const groups = [...col.groups]
    const newGroup: TabGroup = { id: uuid(), tabs: [tabId], activeTab: tabId }
    const idx = Math.min(Math.max(0, insertAtIndex), groups.length)
    groups.splice(idx, 0, newGroup)
    const next = { ...state, [side]: { ...col, groups } }
    persist(next)
    set(next)
  },

  removeGroup(column, groupIndex) {
    const state = get()
    const side = column === 'left' ? 'leftColumn' : 'rightColumn'
    const col = state[side]
    if (!col || groupIndex >= col.groups.length) return
    const groups = col.groups.filter((_, i) => i !== groupIndex)
    if (groups.length === 0) {
      const next = { ...state, [side]: null }
      persist(next)
      set(next)
    } else {
      const next = { ...state, [side]: { ...col, groups } }
      persist(next)
      set(next)
    }
  },

  toggleGroupCollapse(groupId: string) {
    const state = get()
    const collapsed = { ...state.collapsedGroups }
    collapsed[groupId] = !collapsed[groupId]
    const next = { ...state, collapsedGroups: collapsed }
    persist(next)
    set(next)
  },

  setGroupCollapsed(groupId: string, isCollapsed: boolean) {
    const state = get()
    const collapsed = { ...state.collapsedGroups }
    collapsed[groupId] = isCollapsed
    const next = { ...state, collapsedGroups: collapsed }
    persist(next)
    set(next)
  },

  setGroupHeight(groupId: string, height: number) {
    const state = get()
    const heights = { ...state.groupHeights }
    heights[groupId] = Math.max(MIN_GROUP_HEIGHT, height)
    const next = { ...state, groupHeights: heights }
    persist(next)
    set(next)
  },

  resetGroupHeight(groupId: string) {
    const state = get()
    const heights = { ...state.groupHeights }
    delete heights[groupId]
    const next = { ...state, groupHeights: heights }
    persist(next)
    set(next)
  },

  resetLayout() {
    const next = makeDefaultLayout()
    persist(next)
    set(next)
  },
}))
