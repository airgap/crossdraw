import { useEffect, useState } from 'react'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ExportModal } from '@/ui/export-modal'
import { DownloadPage } from '@/ui/download-page'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

export function App() {
  const hash = useHashRoute()

  useEffect(() => {
    if (hash !== '#/download') setupKeyboardShortcuts()
  }, [hash])

  if (hash === '#/download') return <DownloadPage />

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
