import React, { useMemo, useEffect } from 'react'
import { usePanelLayoutStore, type PanelColumn as PanelColumnType } from './panel-layout-store'
import { usePanelDragStore } from './panel-drag'
import { PanelColumn } from './panel-column'
import { FloatingPanel } from './floating-panel'

interface PanelShellProps {
  children: React.ReactNode
  modeConfig?: { panels: string[] }
}

/** Filter a panel column's groups to only include allowed tabs. */
function filterColumn(column: PanelColumnType, allowedPanels: string[]): PanelColumnType {
  const groups = column.groups
    .map((g) => {
      const tabs = g.tabs.filter((t) => allowedPanels.includes(t))
      if (tabs.length === 0) return null
      return { ...g, tabs, activeTab: tabs.includes(g.activeTab) ? g.activeTab : tabs[0]! }
    })
    .filter(Boolean) as PanelColumnType['groups']
  return { ...column, groups }
}

/**
 * PanelShell wraps the main viewport area and renders
 * the dockable panel columns on left/right plus floating panels.
 *
 * It also centralizes drop resolution — when a drag ends,
 * it reads the dropTarget and applies the layout change.
 */
export function PanelShell({ children, modeConfig }: PanelShellProps) {
  const leftColumn = usePanelLayoutStore((s) => s.leftColumn)
  const rightColumn = usePanelLayoutStore((s) => s.rightColumn)
  const floatingPanels = usePanelLayoutStore((s) => s.floatingPanels)
  const dragTabId = usePanelDragStore((s) => s.tabId)

  const filteredLeft = useMemo(
    () => (modeConfig && leftColumn ? filterColumn(leftColumn, modeConfig.panels) : leftColumn),
    [leftColumn, modeConfig],
  )
  const filteredRight = useMemo(
    () => (modeConfig && rightColumn ? filterColumn(rightColumn, modeConfig.panels) : rightColumn),
    [rightColumn, modeConfig],
  )
  const filteredFloating = useMemo(
    () => (modeConfig ? floatingPanels.filter((fp) => modeConfig.panels.includes(fp.tabId)) : floatingPanels),
    [floatingPanels, modeConfig],
  )

  // Centralized drop handler — resolves the drop target and applies the layout change
  useEffect(() => {
    if (!dragTabId) return

    const handleGlobalPointerUp = () => {
      const result = usePanelDragStore.getState().endDrag()
      if (!result || !result.dropTarget) return

      const { tabId, dropTarget } = result
      const layout = usePanelLayoutStore.getState()

      switch (dropTarget.type) {
        case 'tab-bar':
          layout.moveTab(tabId, dropTarget.column, dropTarget.groupIndex, dropTarget.insertIndex)
          break
        case 'split':
          layout.addGroupSplit(tabId, dropTarget.column, dropTarget.groupIndex)
          break
        case 'column':
          layout.addGroupSplit(tabId, dropTarget.column, dropTarget.groupIndex)
          break
      }
    }

    window.addEventListener('pointerup', handleGlobalPointerUp)
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp)
  }, [dragTabId])

  const showLeft = filteredLeft && filteredLeft.groups.length > 0
  const showRight = filteredRight && filteredRight.groups.length > 0

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left edge drop zone — shown when dragging and no left column */}
      {dragTabId && !showLeft && <EdgeDropZone side="left" />}

      {/* Left column */}
      {showLeft && <PanelColumn column={filteredLeft!} side="left" />}

      {/* Center viewport area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>

      {/* Right column */}
      {showRight && <PanelColumn column={filteredRight!} side="right" />}

      {/* Right edge drop zone — shown when dragging and no right column */}
      {dragTabId && !showRight && <EdgeDropZone side="right" />}

      {/* Floating panels portal layer */}
      {filteredFloating.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 999 }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
            {filteredFloating.map((fp) => (
              <div key={fp.tabId} style={{ pointerEvents: 'auto' }}>
                <FloatingPanel panel={fp} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Drop zone that appears at the edge when dragging a tab toward an empty column side */
function EdgeDropZone({ side }: { side: 'left' | 'right' }) {
  const dropTarget = usePanelDragStore((s) => s.dropTarget)
  const isTarget = dropTarget?.type === 'column' && dropTarget.column === side

  return (
    <div
      onPointerEnter={() => {
        usePanelDragStore.getState().setDropTarget({ type: 'column', column: side, groupIndex: 0 })
      }}
      onPointerLeave={() => {
        const dt = usePanelDragStore.getState().dropTarget
        if (dt?.type === 'column' && dt.column === side) {
          usePanelDragStore.getState().setDropTarget(null)
        }
      }}
      style={{
        width: isTarget ? 200 : 40,
        height: '100%',
        background: isTarget ? 'rgba(var(--accent-rgb, 59,130,246), 0.1)' : 'transparent',
        borderLeft:
          side === 'right'
            ? `2px ${isTarget ? 'solid' : 'dashed'} ${isTarget ? 'var(--accent)' : 'var(--border-subtle)'}`
            : undefined,
        borderRight:
          side === 'left'
            ? `2px ${isTarget ? 'solid' : 'dashed'} ${isTarget ? 'var(--accent)' : 'var(--border-subtle)'}`
            : undefined,
        transition: 'width 0.15s ease, background 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isTarget && (
        <span style={{ color: 'var(--accent)', fontSize: 11, writingMode: 'vertical-lr', opacity: 0.7 }}>
          Drop here
        </span>
      )}
    </div>
  )
}
