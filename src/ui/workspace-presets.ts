import { v4 as uuid } from 'uuid'
import {
  usePanelLayoutStore,
  type PanelLayoutState,
  type PanelColumn,
  type TabGroup,
} from '@/ui/panels/panel-layout-store'

// ── Types ──

export interface WorkspacePreset {
  id: string
  name: string
  /** If true, cannot be deleted or overwritten */
  builtIn: boolean
  layout: PanelLayoutState
}

// ── Constants ──

const STORAGE_KEY = 'crossdraw:workspace-presets'

// ── Built-in preset layouts ──

function makeGroup(tabs: string[], activeTab?: string): TabGroup {
  return { id: uuid(), tabs, activeTab: activeTab ?? tabs[0]! }
}

function makeColumn(groups: TabGroup[], width = 260): PanelColumn {
  return { groups, width }
}

function makeLayout(rightGroups: TabGroup[], leftGroups?: TabGroup[]): PanelLayoutState {
  return {
    leftColumn: leftGroups ? makeColumn(leftGroups) : null,
    rightColumn: makeColumn(rightGroups),
    floatingPanels: [],
    collapsedGroups: {},
    groupHeights: {},
  }
}

const BUILT_IN_PRESETS: WorkspacePreset[] = [
  {
    id: 'default',
    name: 'Default',
    builtIn: true,
    layout: makeLayout([makeGroup(['layers']), makeGroup(['properties']), makeGroup(['color-palette'])]),
  },
  {
    id: 'illustration',
    name: 'Illustration',
    builtIn: true,
    layout: makeLayout([
      makeGroup(['layers']),
      makeGroup(['properties']),
      makeGroup(['color-palette', 'color-harmony'], 'color-palette'),
      makeGroup(['symbols', 'align'], 'symbols'),
    ]),
  },
  {
    id: 'photo-editing',
    name: 'Photo Editing',
    builtIn: true,
    layout: makeLayout([
      makeGroup(['layers']),
      makeGroup(['properties']),
      makeGroup(['history']),
      makeGroup(['color-palette']),
    ]),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    builtIn: true,
    layout: makeLayout([makeGroup(['layers'])]),
  },
]

// ── Persistence ──

function loadCustomPresets(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspacePreset[]
      return parsed.map((p) => ({ ...p, builtIn: false }))
    }
  } catch {
    /* empty */
  }
  return []
}

function saveCustomPresets(presets: WorkspacePreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.filter((p) => !p.builtIn)))
  } catch {
    /* empty */
  }
}

// ── Public API ──

/**
 * Returns all workspace presets (built-in first, then custom).
 */
export function getWorkspacePresets(): WorkspacePreset[] {
  return [...BUILT_IN_PRESETS, ...loadCustomPresets()]
}

/**
 * Captures the current panel layout and saves it as a custom workspace preset.
 * If a custom preset with the same name exists, it is overwritten.
 */
export function saveWorkspacePreset(name: string): WorkspacePreset {
  const state = usePanelLayoutStore.getState()

  // Snapshot the layout state (only the data, not actions)
  const layout: PanelLayoutState = {
    leftColumn: state.leftColumn ? structuredClone(state.leftColumn) : null,
    rightColumn: structuredClone(state.rightColumn),
    floatingPanels: structuredClone(state.floatingPanels),
    collapsedGroups: { ...state.collapsedGroups },
    groupHeights: { ...state.groupHeights },
  }

  const customs = loadCustomPresets()
  const existingIndex = customs.findIndex((p) => p.name === name)

  const preset: WorkspacePreset = {
    id: existingIndex >= 0 ? customs[existingIndex]!.id : uuid(),
    name,
    builtIn: false,
    layout,
  }

  if (existingIndex >= 0) {
    customs[existingIndex] = preset
  } else {
    customs.push(preset)
  }

  saveCustomPresets(customs)
  return preset
}

/**
 * Applies a workspace preset by writing its layout into the panel layout store.
 * Group IDs are regenerated so that collapse/height state doesn't bleed across presets.
 */
export function loadWorkspacePreset(id: string): boolean {
  const all = getWorkspacePresets()
  const preset = all.find((p) => p.id === id)
  if (!preset) return false

  // Deep-clone the layout and regenerate group IDs
  const layout = structuredClone(preset.layout)

  const regenerateIds = (col: PanelColumn | null): PanelColumn | null => {
    if (!col) return null
    return {
      ...col,
      groups: col.groups.map((g) => ({ ...g, id: uuid() })),
    }
  }

  const newLayout: PanelLayoutState = {
    leftColumn: regenerateIds(layout.leftColumn),
    rightColumn: regenerateIds(layout.rightColumn) ?? { groups: [], width: 260 },
    floatingPanels: layout.floatingPanels ?? [],
    collapsedGroups: {},
    groupHeights: {},
  }

  // Write to store — use resetLayout approach: set state + persist
  const store = usePanelLayoutStore
  store.setState(newLayout)
  // Persist via localStorage
  try {
    localStorage.setItem('crossdraw:panel-layout', JSON.stringify(newLayout))
  } catch {
    /* empty */
  }

  return true
}

/**
 * Deletes a custom workspace preset. Built-in presets cannot be deleted.
 */
export function deleteWorkspacePreset(id: string): boolean {
  const customs = loadCustomPresets()
  const index = customs.findIndex((p) => p.id === id)
  if (index < 0) return false

  customs.splice(index, 1)
  saveCustomPresets(customs)
  return true
}

/**
 * Resets the panel layout to the default workspace preset.
 */
export function resetWorkspace(): void {
  loadWorkspacePreset('default')
}
