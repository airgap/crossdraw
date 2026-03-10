import React, { useMemo } from 'react'
import { usePanelLayoutStore, type PanelColumn as PanelColumnType } from './panel-layout-store'
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
 */
export function PanelShell({ children, modeConfig }: PanelShellProps) {
  const leftColumn = usePanelLayoutStore((s) => s.leftColumn)
  const rightColumn = usePanelLayoutStore((s) => s.rightColumn)
  const floatingPanels = usePanelLayoutStore((s) => s.floatingPanels)

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

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Left column */}
      {filteredLeft && filteredLeft.groups.length > 0 && <PanelColumn column={filteredLeft} side="left" />}

      {/* Center viewport area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>

      {/* Right column */}
      {filteredRight && filteredRight.groups.length > 0 && <PanelColumn column={filteredRight} side="right" />}

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
