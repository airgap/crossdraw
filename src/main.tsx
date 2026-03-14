import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from '@/ui/error-boundary'
import { setupElectronBridge } from '@/io/electron-bridge'
import { useEditorStore } from '@/store/editor.store'

// Initialize Electron IPC if running inside Electron
setupElectronBridge()

// Start cloud preference syncing (auto-activates when logged in)
import '@/cloud/preference-sync'

// Warn before unloading if document has unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (useEditorStore.getState().isDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

// ── Native-feel touch behavior ──────────────────────────────────
// Prevent browser context menu on long-press (app has its own)
document.addEventListener(
  'contextmenu',
  (e) => {
    const target = e.target as HTMLElement
    // Allow context menu on text inputs for copy/paste
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    e.preventDefault()
  },
  { passive: false },
)

// Prevent double-tap-to-zoom on the entire app
let lastTouchEnd = 0
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now()
    if (now - lastTouchEnd < 300) {
      e.preventDefault()
    }
    lastTouchEnd = now
  },
  { passive: false },
)

// Prevent pinch-zoom on non-canvas elements (browser chrome zoom)
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) {
      const target = e.target as HTMLElement
      if (target.tagName !== 'CANVAS') {
        e.preventDefault()
      }
    }
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
