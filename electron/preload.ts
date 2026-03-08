import { contextBridge, ipcRenderer } from 'electron'

/**
 * Expose a safe, typed API to the renderer process via contextBridge.
 * The renderer accesses this via `window.electronAPI`.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  fileSave: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('file:save', filePath, data),

  fileOpenDialog: (): Promise<{ filePath: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('file:open-dialog'),

  fileSaveDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('file:save-dialog'),

  fileRead: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('file:read', filePath),

  // Recent files
  getRecentFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('recent-files:get'),

  // Auto-save
  autosaveWrite: (data: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('autosave:write', data),

  autosaveCheck: (): Promise<{ exists: boolean; data?: ArrayBuffer; path?: string }> =>
    ipcRenderer.invoke('autosave:check'),

  autosaveClear: (): Promise<void> =>
    ipcRenderer.invoke('autosave:clear'),

  // Menu events (main → renderer)
  onMenuNew: (callback: () => void) => {
    ipcRenderer.on('menu:new', callback)
    return () => ipcRenderer.removeListener('menu:new', callback)
  },
  onMenuUndo: (callback: () => void) => {
    ipcRenderer.on('menu:undo', callback)
    return () => ipcRenderer.removeListener('menu:undo', callback)
  },
  onMenuRedo: (callback: () => void) => {
    ipcRenderer.on('menu:redo', callback)
    return () => ipcRenderer.removeListener('menu:redo', callback)
  },
  onMenuZoomIn: (callback: () => void) => {
    ipcRenderer.on('menu:zoom-in', callback)
    return () => ipcRenderer.removeListener('menu:zoom-in', callback)
  },
  onMenuZoomOut: (callback: () => void) => {
    ipcRenderer.on('menu:zoom-out', callback)
    return () => ipcRenderer.removeListener('menu:zoom-out', callback)
  },
  onMenuZoomFit: (callback: () => void) => {
    ipcRenderer.on('menu:zoom-fit', callback)
    return () => ipcRenderer.removeListener('menu:zoom-fit', callback)
  },
  onMenuExportSVG: (callback: () => void) => {
    ipcRenderer.on('menu:export-svg', callback)
    return () => ipcRenderer.removeListener('menu:export-svg', callback)
  },
  onMenuExportPNG: (callback: () => void) => {
    ipcRenderer.on('menu:export-png', callback)
    return () => ipcRenderer.removeListener('menu:export-png', callback)
  },

  // File opened from main process
  onFileOpened: (callback: (data: ArrayBuffer, filePath: string) => void) => {
    ipcRenderer.on('file:opened', (_e, data, filePath) => callback(data, filePath))
    return () => ipcRenderer.removeAllListeners('file:opened')
  },

  // Save request from main (Ctrl+S → main → renderer encodes → main writes)
  onRequestSave: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file:request-save', (_e, filePath) => callback(filePath))
    return () => ipcRenderer.removeAllListeners('file:request-save')
  },

  // Auto-save tick
  onAutosaveTick: (callback: () => void) => {
    ipcRenderer.on('autosave-tick', callback)
    return () => ipcRenderer.removeListener('autosave-tick', callback)
  },

  // Platform info
  platform: process.platform,
})
