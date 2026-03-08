import React from 'react'
import { usePanelLayoutStore } from './panel-layout-store'
import { PanelColumn } from './panel-column'
import { FloatingPanel } from './floating-panel'

interface PanelShellProps {
  children: React.ReactNode
}

/**
 * PanelShell wraps the main viewport area and renders
 * the dockable panel columns on left/right plus floating panels.
 */
export function PanelShell({ children }: PanelShellProps) {
  const leftColumn = usePanelLayoutStore((s) => s.leftColumn)
  const rightColumn = usePanelLayoutStore((s) => s.rightColumn)
  const floatingPanels = usePanelLayoutStore((s) => s.floatingPanels)

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
      {leftColumn && leftColumn.groups.length > 0 && <PanelColumn column={leftColumn} side="left" />}

      {/* Center viewport area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>

      {/* Right column */}
      {rightColumn && rightColumn.groups.length > 0 && <PanelColumn column={rightColumn} side="right" />}

      {/* Floating panels portal layer */}
      {floatingPanels.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 999 }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
            {floatingPanels.map((fp) => (
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
