import { useEditorStore } from '@/store/editor.store'
import { encodeDocument, decodeDocument } from '@/io/file-format'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'

/**
 * Returns true if running inside Electron (preload script loaded).
 */
export function isElectron(): boolean {
  return !!window.electronAPI
}

/**
 * Set up IPC event listeners between the Electron main process and the renderer.
 * Call once on app startup.
 */
export function setupElectronBridge() {
  const api = window.electronAPI
  if (!api) return

  const store = useEditorStore.getState

  // Menu → New
  api.onMenuNew(() => {
    store().newDocument()
  })

  // Menu → Undo / Redo
  api.onMenuUndo(() => store().undo())
  api.onMenuRedo(() => store().redo())

  // Menu → Zoom
  api.onMenuZoomIn(() => {
    const s = store()
    s.setZoom(s.viewport.zoom * 1.25)
  })
  api.onMenuZoomOut(() => {
    const s = store()
    s.setZoom(s.viewport.zoom / 1.25)
  })
  api.onMenuZoomFit(() => {
    store().setZoom(1)
    store().setPan(0, 0)
  })

  // Menu → Export
  api.onMenuExportSVG(() => {
    const doc = store().document
    const svg = exportArtboardToSVG(doc)
    downloadSVG(svg, `${doc.metadata.title}.svg`)
  })

  api.onMenuExportPNG(async () => {
    const doc = store().document
    const blob = await exportArtboardToBlob(doc, { format: 'png', scale: 2 })
    downloadBlob(blob, `${doc.metadata.title}.png`)
  })

  // File opened from main process (File > Open)
  api.onFileOpened((data: ArrayBuffer, filePath: string) => {
    try {
      const doc = decodeDocument(data)
      useEditorStore.setState({
        document: doc,
        history: [],
        historyIndex: -1,
        selection: { layerIds: [] },
        isDirty: false,
        filePath: filePath || null,
      })
    } catch (err) {
      console.error('Failed to open file:', err)
      alert(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  })

  // Save request from main process (Ctrl+S)
  api.onRequestSave(async (filePath: string) => {
    try {
      const doc = store().document
      const buffer = encodeDocument(doc)
      await api.fileSave(filePath, buffer)
      useEditorStore.setState({ isDirty: false, filePath: filePath || null })
    } catch (err) {
      console.error('Failed to save:', err)
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  })

  // Auto-save tick (every 60s)
  api.onAutosaveTick(async () => {
    if (!store().isDirty) return
    try {
      const doc = store().document
      const buffer = encodeDocument(doc)
      await api.autosaveWrite(buffer)
    } catch {
      // Silently fail autosave — non-critical
    }
  })

  // Check for recovery file on startup
  checkRecovery()
}

async function checkRecovery() {
  const api = window.electronAPI
  if (!api) return

  try {
    const result = await api.autosaveCheck()
    if (result.exists && result.data) {
      const recover = confirm('A recovery file was found from a previous session. Would you like to restore it?')
      if (recover) {
        const doc = decodeDocument(result.data)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: true,
        })
      }
      await api.autosaveClear()
    }
  } catch {
    // Ignore recovery errors
  }
}

/**
 * Open a file via Electron's native dialog.
 */
export async function electronOpen() {
  const api = window.electronAPI
  if (!api) return

  const result = await api.fileOpenDialog()
  if (!result) return

  try {
    const doc = decodeDocument(result.data)
    useEditorStore.setState({
      document: doc,
      history: [],
      historyIndex: -1,
      selection: { layerIds: [] },
      isDirty: false,
      filePath: result.filePath || null,
    })
  } catch (err) {
    alert(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

/**
 * Save via Electron's native dialog.
 */
export async function electronSaveAs() {
  const api = window.electronAPI
  if (!api) return

  const newPath = await api.fileSaveDialog()
  if (!newPath) return

  const doc = useEditorStore.getState().document
  const buffer = encodeDocument(doc)
  await api.fileSave(newPath, buffer)
  useEditorStore.setState({ isDirty: false, filePath: newPath })
}
