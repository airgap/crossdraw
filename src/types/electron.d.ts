/** Type declarations for the Electron preload API exposed via contextBridge. */
interface ElectronAPI {
  fileSave: (filePath: string, data: ArrayBuffer) => Promise<boolean>
  fileOpenDialog: () => Promise<{ filePath: string; data: ArrayBuffer } | null>
  fileSaveDialog: () => Promise<string | null>
  fileRead: (filePath: string) => Promise<ArrayBuffer>
  getRecentFiles: () => Promise<string[]>
  autosaveWrite: (data: ArrayBuffer) => Promise<string>
  autosaveCheck: () => Promise<{ exists: boolean; data?: ArrayBuffer; path?: string }>
  autosaveClear: () => Promise<void>
  onMenuNew: (callback: () => void) => () => void
  onMenuUndo: (callback: () => void) => () => void
  onMenuRedo: (callback: () => void) => () => void
  onMenuZoomIn: (callback: () => void) => () => void
  onMenuZoomOut: (callback: () => void) => () => void
  onMenuZoomFit: (callback: () => void) => () => void
  onMenuExportSVG: (callback: () => void) => () => void
  onMenuExportPNG: (callback: () => void) => () => void
  onFileOpened: (callback: (data: ArrayBuffer, filePath: string) => void) => () => void
  onRequestSave: (callback: (filePath: string) => void) => () => void
  onAutosaveTick: (callback: () => void) => () => void
  platform: string
}

interface Window {
  electronAPI?: ElectronAPI
}
