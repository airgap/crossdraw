import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'

// ─── Window state persistence ────────────────────────────────

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const STATE_FILE = join(app.getPath('userData'), 'window-state.json')
const RECENT_FILE = join(app.getPath('userData'), 'recent-files.json')
const AUTOSAVE_DIR = join(app.getPath('userData'), 'autosave')

let mainWindow: BrowserWindow | null = null
let currentFilePath: string | null = null

async function loadWindowState(): Promise<WindowState> {
  try {
    const data = await readFile(STATE_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { width: 1400, height: 900, maximized: false }
  }
}

async function saveWindowState(win: BrowserWindow) {
  const bounds = win.getBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized(),
  }
  await writeFile(STATE_FILE, JSON.stringify(state))
}

// ─── Recent files ────────────────────────────────────────────

async function getRecentFiles(): Promise<string[]> {
  try {
    const data = await readFile(RECENT_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

async function addRecentFile(filePath: string) {
  const recent = await getRecentFiles()
  const filtered = recent.filter((f) => f !== filePath)
  filtered.unshift(filePath)
  const trimmed = filtered.slice(0, 10)
  await writeFile(RECENT_FILE, JSON.stringify(trimmed))
}

// ─── Auto-save ───────────────────────────────────────────────

let autosaveInterval: ReturnType<typeof setInterval> | null = null

function startAutosave() {
  if (autosaveInterval) return
  autosaveInterval = setInterval(async () => {
    if (mainWindow) {
      mainWindow.webContents.send('autosave-tick')
    }
  }, 60_000) // every 60 seconds
}

// ─── Create window ───────────────────────────────────────────

async function createWindow() {
  const state = await loadWindowState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  if (state.maximized) mainWindow.maximize()

  // Load the Vite dev server in dev, or the built files in production
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.show()

  mainWindow.on('close', async () => {
    if (mainWindow) await saveWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  buildMenu()
  startAutosave()
}

// ─── Menu bar ────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'quit' as const }],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: handleOpen },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: handleSave },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: handleSaveAs },
        { type: 'separator' },
        { label: 'Export SVG...', click: () => mainWindow?.webContents.send('menu:export-svg') },
        { label: 'Export PNG...', click: () => mainWindow?.webContents.send('menu:export-png') },
        { type: 'separator' },
        ...(isMac ? [] : [{ role: 'quit' as const }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow?.webContents.send('menu:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => mainWindow?.webContents.send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => mainWindow?.webContents.send('menu:zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow?.webContents.send('menu:zoom-out') },
        {
          label: 'Zoom to Fit',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('menu:zoom-fit'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Crossdraw',
          click: () =>
            dialog.showMessageBox({ message: 'Crossdraw v0.1.0', detail: 'A vector + raster design editor.' }),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── File operations (main process) ──────────────────────────

async function handleOpen() {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Crossdraw Files', extensions: ['crow'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return
  const filePath = result.filePaths[0]!
  const data = await readFile(filePath)
  currentFilePath = filePath
  await addRecentFile(filePath)
  mainWindow.webContents.send('file:opened', data.buffer, filePath)
  mainWindow.setTitle(`${basename(filePath)} — Crossdraw`)
}

async function handleSave() {
  if (!mainWindow) return
  if (currentFilePath) {
    mainWindow.webContents.send('file:request-save', currentFilePath)
  } else {
    await handleSaveAs()
  }
}

async function handleSaveAs() {
  if (!mainWindow) return
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Crossdraw Files', extensions: ['crow'] }],
    defaultPath: 'untitled.crow',
  })
  if (result.canceled || !result.filePath) return
  currentFilePath = result.filePath
  await addRecentFile(result.filePath)
  mainWindow.webContents.send('file:request-save', result.filePath)
  mainWindow.setTitle(`${basename(result.filePath)} — Crossdraw`)
}

// ─── IPC handlers ────────────────────────────────────────────

ipcMain.handle('file:save', async (_event, filePath: string, data: ArrayBuffer) => {
  await writeFile(filePath, Buffer.from(data))
  return true
})

ipcMain.handle('file:open-dialog', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'All Supported', extensions: ['crow', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Crossdraw Files', extensions: ['crow'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: 'SVG', extensions: ['svg'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]!
  const data = await readFile(filePath)
  currentFilePath = filePath
  await addRecentFile(filePath)
  mainWindow.setTitle(`${basename(filePath)} — Crossdraw`)
  return { filePath, data: data.buffer }
})

ipcMain.handle('file:save-dialog', async () => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'Crossdraw Files', extensions: ['crow'] }],
    defaultPath: 'untitled.crow',
  })
  if (result.canceled || !result.filePath) return null
  currentFilePath = result.filePath
  await addRecentFile(result.filePath)
  mainWindow.setTitle(`${basename(result.filePath)} — Crossdraw`)
  return result.filePath
})

ipcMain.handle('file:read', async (_event, filePath: string) => {
  const data = await readFile(filePath)
  return data.buffer
})

ipcMain.handle('recent-files:get', async () => {
  return getRecentFiles()
})

ipcMain.handle('autosave:write', async (_event, data: ArrayBuffer) => {
  if (!existsSync(AUTOSAVE_DIR)) await mkdir(AUTOSAVE_DIR, { recursive: true })
  const path = join(AUTOSAVE_DIR, 'recovery.crow')
  await writeFile(path, Buffer.from(data))
  return path
})

ipcMain.handle('autosave:check', async () => {
  const path = join(AUTOSAVE_DIR, 'recovery.crow')
  if (existsSync(path)) {
    const data = await readFile(path)
    return { exists: true, data: data.buffer, path }
  }
  return { exists: false }
})

ipcMain.handle('autosave:clear', async () => {
  const path = join(AUTOSAVE_DIR, 'recovery.crow')
  try {
    const { unlink } = await import('fs/promises')
    await unlink(path)
  } catch {
    /* ignore */
  }
})

// ─── App lifecycle ───────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (autosaveInterval) clearInterval(autosaveInterval)
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
