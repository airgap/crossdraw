import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ToolOptionsBar } from '@/ui/tool-options-bar'
import { DownloadPage } from '@/ui/download-page'
import { SplashScreen } from '@/ui/splash-screen'
import { LoginPage } from '@/ui/login-page'
import { isAuthenticated } from '@/auth/auth'
import { NewDocumentModal } from '@/ui/new-document-modal'
import { restoreLastDocument, setupSessionPersist } from '@/io/session-persist'
import { handleCallback as handleAuthCallback } from '@/auth/auth'
import { useEditorStore } from '@/store/editor.store'
import { usePanelLayoutStore } from '@/ui/panels/panel-layout-store'
import { ShareDialog } from '@/ui/share-dialog'
import { ToastContainer } from '@/ui/toast'
import { Onboarding } from '@/ui/onboarding'
import { CanvasTabBar } from '@/ui/canvas-tab-bar'
import { newDocumentFromClipboard } from '@/tools/import-image'

// Lazy-loaded heavy components (export/print pull in raster-export, pdf, gif, tiff encoders)
const ExportModal = lazy(() => import('@/ui/export-modal').then((m) => ({ default: m.ExportModal })))
const PrintDialog = lazy(() => import('@/ui/print-dialog').then((m) => ({ default: m.PrintDialog })))
const PrototypePlayer = lazy(() => import('@/prototype/prototype-player').then((m) => ({ default: m.PrototypePlayer })))

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

type BootState = 'loading' | 'login' | 'splash' | 'editor'

export function App() {
  const hash = useHashRoute()
  const [boot, setBoot] = useState<BootState>(hash === '#/download' ? 'editor' : 'loading')
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)

  // All hooks must be called unconditionally (before any early returns)
  const showPrototypePlayer = useEditorStore((s) => s.showPrototypePlayer)
  const prototypeStartArtboardId = useEditorStore((s) => s.prototypeStartArtboardId)
  const closePrototypePlayer = useEditorStore((s) => s.closePrototypePlayer)
  const editorDocument = useEditorStore((s) => s.document)

  // On mount: try to restore last document, then show login/splash/editor
  useEffect(() => {
    if (hash === '#/download') return
    let cancelled = false
    restoreLastDocument().then((restored) => {
      if (cancelled) return
      if (restored) {
        setBoot('editor')
      } else if (isAuthenticated()) {
        setBoot('splash')
      } else {
        setBoot('login')
      }
    })
    return () => {
      cancelled = true
    }
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

  // Transition from login to splash when user authenticates
  useEffect(() => {
    if (boot !== 'login') return
    const handler = () => {
      if (isAuthenticated()) setBoot('splash')
    }
    window.addEventListener('crossdraw:auth-changed', handler)
    return () => window.removeEventListener('crossdraw:auth-changed', handler)
  }, [boot])

  // Listen for menu bar "New Document" event
  useEffect(() => {
    const onNewDoc = () => setShowNewDoc(true)
    window.addEventListener('crossdraw:new-document', onNewDoc)
    return () => window.removeEventListener('crossdraw:new-document', onNewDoc)
  }, [])

  // Listen for menu bar "Preferences" event — focus the preferences panel tab
  useEffect(() => {
    const onShowPrefs = () => usePanelLayoutStore.getState().focusTab('preferences')
    window.addEventListener('crossdraw:show-preferences', onShowPrefs)
    return () => window.removeEventListener('crossdraw:show-preferences', onShowPrefs)
  }, [])

  // Listen for menu bar "Share Prototype" event
  useEffect(() => {
    const onSharePrototype = () => setShowShareDialog(true)
    window.addEventListener('crossdraw:share-prototype', onSharePrototype)
    return () => window.removeEventListener('crossdraw:share-prototype', onSharePrototype)
  }, [])

  // Global: Ctrl+Shift+Alt+N → new document from clipboard image
  const newDocFromClipboard = useCallback(async () => {
    const created = await newDocumentFromClipboard()
    if (created) setBoot('editor')
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newDocFromClipboard()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newDocFromClipboard])

  // Update document title to reflect unsaved state
  useEffect(() => {
    if (boot !== 'editor') return
    // Set initial title
    const { document: doc, isDirty } = useEditorStore.getState()
    const name = doc.metadata.title || 'Untitled'
    window.document.title = isDirty ? `● ${name} — Crossdraw` : `${name} — Crossdraw`
    // Subscribe to changes
    return useEditorStore.subscribe((state) => {
      const n = state.document.metadata.title || 'Untitled'
      window.document.title = state.isDirty ? `● ${n} — Crossdraw` : `${n} — Crossdraw`
    })
  }, [boot])

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code && window.location.pathname === '/auth/callback') {
      handleAuthCallback(code)
        .then(() => {
          // Clear the URL params and go to editor
          window.history.replaceState({}, '', '/')
          setBoot('editor')
        })
        .catch((err) => {
          console.error('OAuth callback failed:', err)
          window.history.replaceState({}, '', '/')
        })
    }
  }, [])

  // Handle share link URLs: /share/<slug>
  useEffect(() => {
    const path = window.location.pathname
    const shareMatch = path.match(/^\/share\/(.+)$/)
    if (!shareMatch) return
    const slug = shareMatch[1]

    // Fetch share data from server and load document
    const serverUrl = window.location.origin
    fetch(`${serverUrl}/api/shares/${slug}/data`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Share not found: ${res.status}`)
        const arrayBuffer = await res.arrayBuffer()
        const { decodeDocument } = await import('@/io/file-format')
        const doc = decodeDocument(arrayBuffer)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
        })
        setBoot('editor')

        // Check permission from response headers or fetch share info
        try {
          const infoRes = await fetch(`${serverUrl}/api/shares/${slug}`)
          if (infoRes.ok) {
            const info = (await infoRes.json()) as { permission?: string; roomId?: string }
            if (info.permission === 'view') {
              useEditorStore.getState().setReadOnlyMode(true)
            } else if (info.permission === 'edit' && info.roomId) {
              const wsUrl = serverUrl.replace(/^http/, 'ws')
              useEditorStore.getState().startCollabSession(info.roomId, wsUrl)
            }
          }
        } catch {
          /* share info not available */
        }
      })
      .catch((err) => {
        console.error('Failed to load shared document:', err)
        window.history.replaceState({}, '', '/')
      })
  }, [])

  // Handle collab invite URLs: ?collab=<roomId>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const collabRoom = params.get('collab')
    const collabServer = params.get('server')
    if (collabRoom && boot === 'editor') {
      const wsUrl = collabServer || window.location.origin.replace(/^http/, 'ws')
      useEditorStore.getState().startCollabSession(collabRoom, wsUrl)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [boot])

  useEffect(() => {
    if (boot === 'editor' && hash !== '#/download') setupKeyboardShortcuts()
  }, [boot, hash])

  const handleCreate = (settings: {
    title: string
    width: number
    height: number
    colorspace: 'srgb' | 'p3' | 'adobe-rgb'
    backgroundColor: string
    dpi: number
  }) => {
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
      {/* Skip navigation link for keyboard/screen reader users */}
      <a
        href="#canvas"
        className="sr-only focus:not-sr-only"
        onClick={(e) => {
          e.preventDefault()
          const canvas = document.querySelector<HTMLCanvasElement>('#canvas')
          if (canvas) canvas.focus()
        }}
      >
        Skip to canvas
      </a>
      <MenuBar />
      <ToolOptionsBar />
      <CanvasTabBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />
        <PanelShell>
          <Viewport />
        </PanelShell>
      </div>
      <StatusBar />
      <CanvasContextMenu />
      <Suspense fallback={null}>
        <ExportModal />
        <PrintDialog />
      </Suspense>
      {showShareDialog && <ShareDialog onClose={() => setShowShareDialog(false)} />}
      {showNewDoc && <NewDocumentModal onClose={() => setShowNewDoc(false)} onCreate={handleCreate} />}
      {showPrototypePlayer && prototypeStartArtboardId && (
        <Suspense fallback={null}>
          <PrototypePlayer
            document={editorDocument}
            startArtboardId={prototypeStartArtboardId}
            onClose={closePrototypePlayer}
          />
        </Suspense>
      )}
      <Onboarding />
      <ToastContainer />
      {boot === 'login' && <LoginPage onSkip={() => setBoot('editor')} />}
    </div>
  )
}
