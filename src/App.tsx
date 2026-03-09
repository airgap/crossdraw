import { useEffect, useState } from 'react'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ExportModal } from '@/ui/export-modal'
import { BrushSettingsBar } from '@/ui/brush-settings-bar'
import { DownloadPage } from '@/ui/download-page'
import { SplashScreen } from '@/ui/splash-screen'
import { NewDocumentModal } from '@/ui/new-document-modal'
import { restoreLastDocument, setupSessionPersist } from '@/io/session-persist'
import { useEditorStore } from '@/store/editor.store'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

type BootState = 'loading' | 'splash' | 'editor'

export function App() {
  const hash = useHashRoute()
  const [boot, setBoot] = useState<BootState>(hash === '#/download' ? 'editor' : 'loading')
  const [showNewDoc, setShowNewDoc] = useState(false)

  // On mount: try to restore last document, then show splash or editor
  useEffect(() => {
    if (hash === '#/download') return
    let cancelled = false
    restoreLastDocument().then((restored) => {
      if (cancelled) return
      setBoot(restored ? 'editor' : 'splash')
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Start auto-persisting once we're in the editor
  useEffect(() => {
    if (boot === 'editor') setupSessionPersist()
  }, [boot])

  // Transition from splash to editor when a document gets loaded (e.g. via Open/drop)
  useEffect(() => {
    if (boot !== 'splash') return
    return useEditorStore.subscribe((state, prev) => {
      if (state.document !== prev.document) setBoot('editor')
    })
  }, [boot])

  // Listen for menu bar "New Document" event
  useEffect(() => {
    const onNewDoc = () => setShowNewDoc(true)
    window.addEventListener('crossdraw:new-document', onNewDoc)
    return () => window.removeEventListener('crossdraw:new-document', onNewDoc)
  }, [])

  useEffect(() => {
    if (boot === 'editor' && hash !== '#/download') setupKeyboardShortcuts()
  }, [boot, hash])

  const handleCreate = (settings: { title: string; width: number; height: number; colorspace: 'srgb' | 'p3' | 'adobe-rgb'; backgroundColor: string; dpi: number }) => {
    useEditorStore.getState().newDocument(settings)
    setShowNewDoc(false)
    setBoot('editor')
  }

  if (hash === '#/download') return <DownloadPage />

  if (boot === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--bg-base)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
        }}
      />
    )
  }

  if (boot === 'splash') {
    return <SplashScreen onReady={() => setBoot('editor')} />
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--font-size-base)',
      }}
    >
      <MenuBar />
      <BrushSettingsBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />
        <PanelShell>
          <Viewport />
        </PanelShell>
      </div>
      <StatusBar />
      <CanvasContextMenu />
      <ExportModal />
      {showNewDoc && (
        <NewDocumentModal
          onClose={() => setShowNewDoc(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
