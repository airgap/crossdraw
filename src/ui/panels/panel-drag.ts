/**
 * Shared drag state for cross-component panel tab drag-and-drop.
 *
 * All tab bars and drop zones subscribe to this store to show
 * visual indicators when a tab is being dragged.
 *
 * Drop resolution is centralized in `commitDrop()` which is called
 * once on pointerup by the shell — individual drop zones only set
 * the dropTarget, they don't handle the drop themselves.
 */

import { create } from 'zustand'

export interface DropTarget {
  type: 'tab-bar' | 'split' | 'column'
  column: 'left' | 'right'
  groupIndex: number
  insertIndex?: number // for tab-bar drops
}

interface PanelDragState {
  /** Tab currently being dragged, or null */
  tabId: string | null
  /** Where the tab originated */
  sourceColumn: 'left' | 'right' | 'floating' | null
  sourceGroupIndex: number
  /** Current mouse position */
  mouseX: number
  mouseY: number
  /** Current drop target */
  dropTarget: DropTarget | null

  startDrag: (
    tabId: string,
    sourceColumn: 'left' | 'right' | 'floating',
    sourceGroupIndex: number,
    x: number,
    y: number,
  ) => void
  updatePosition: (x: number, y: number) => void
  setDropTarget: (target: DropTarget | null) => void
  /** Returns the drag info and clears state. Called once on pointerup. */
  endDrag: () => {
    tabId: string
    sourceColumn: string | null
    sourceGroupIndex: number
    dropTarget: DropTarget | null
  } | null
  cancelDrag: () => void
}

const EMPTY = { tabId: null, sourceColumn: null, sourceGroupIndex: 0, mouseX: 0, mouseY: 0, dropTarget: null } as const

export const usePanelDragStore = create<PanelDragState>((set, get) => ({
  ...EMPTY,

  startDrag(tabId, sourceColumn, sourceGroupIndex, x, y) {
    set({ tabId, sourceColumn, sourceGroupIndex, mouseX: x, mouseY: y, dropTarget: null })
  },

  updatePosition(x, y) {
    set({ mouseX: x, mouseY: y })
  },

  setDropTarget(target) {
    set({ dropTarget: target })
  },

  endDrag() {
    const { tabId, sourceColumn, sourceGroupIndex, dropTarget } = get()
    set({ ...EMPTY })
    if (!tabId) return null
    return { tabId, sourceColumn, sourceGroupIndex, dropTarget }
  },

  cancelDrag() {
    set({ ...EMPTY })
  },
}))
