import { useEffect } from 'react'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ExportModal } from '@/ui/export-modal'

export function App() {
  useEffect(() => {
    setupKeyboardShortcuts()
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--font-size-base)',
      }}
    >
      <MenuBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />
        <PanelShell>
          <Viewport />
        </PanelShell>
      </div>
      <StatusBar />
      <CanvasContextMenu />
      <ExportModal />
    </div>
  )
}
