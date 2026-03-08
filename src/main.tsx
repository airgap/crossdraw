import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from '@/ui/error-boundary'
import { setupElectronBridge } from '@/io/electron-bridge'
import { useEditorStore } from '@/store/editor.store'

// Initialize Electron IPC if running inside Electron
setupElectronBridge()

// Warn before unloading if document has unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (useEditorStore.getState().isDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
