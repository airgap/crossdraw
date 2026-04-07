import { describe, it, expect, afterAll } from 'bun:test'
import { isElectron, electronOpen, electronSaveAs, setupElectronBridge } from '@/io/electron-bridge'
import { useEditorStore } from '@/store/editor.store'

// Save originals
const origWindow = globalThis.window
const origAlert = (globalThis as any).alert
const origConfirm = (globalThis as any).confirm

afterAll(() => {
  globalThis.window = origWindow
  if (origAlert !== undefined) {
    ;(globalThis as any).alert = origAlert
  } else {
    delete (globalThis as any).alert
  }
  if (origConfirm !== undefined) {
    ;(globalThis as any).confirm = origConfirm
  } else {
    delete (globalThis as any).confirm
  }
})

// Suppress alert/confirm in tests
;(globalThis as any).alert = () => {}
;(globalThis as any).confirm = () => false

// NOTE: We intentionally do NOT use mock.module('@/store/editor.store') because
// bun's mock.module is process-global and permanently replaces the module for
// all test files, which breaks any test that uses the real store.

describe('isElectron', () => {
  it('should return false when window.electronAPI is not set', () => {
    const saved = globalThis.window
    globalThis.window = {} as any
    expect(isElectron()).toBe(false)
    globalThis.window = saved
  })

  it('should return true when window.electronAPI is set', () => {
    const saved = globalThis.window
    globalThis.window = { electronAPI: {} } as any
    expect(isElectron()).toBe(true)
    globalThis.window = saved
  })
})

describe('electronOpen', () => {
  it('should do nothing when electronAPI is not available', async () => {
    const saved = globalThis.window
    globalThis.window = {} as any
    // Should not throw
    await expect(electronOpen()).resolves.toBeUndefined()
    globalThis.window = saved
  })

  it('should do nothing when fileOpenDialog returns null', async () => {
    const saved = globalThis.window
    ;(globalThis as any).window = {
      electronAPI: {
        fileOpenDialog: async () => null,
      },
    }
    await expect(electronOpen()).resolves.toBeUndefined()
    globalThis.window = saved
  })

  it('should open .crow file and set document', async () => {
    const saved = globalThis.window

    // Create a minimal valid .crow file data using the encode function
    const { encodeDocument } = require('@/io/file-format')
    const testDoc = {
      id: 'open-test-doc',
      metadata: {
        title: 'Opened',
        author: '',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
        colorspace: 'srgb',
        width: 100,
        height: 100,
      },
      artboards: [
        {
          id: 'ab1',
          name: 'Main',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const encoded = encodeDocument(testDoc)

    ;(globalThis as any).window = {
      electronAPI: {
        fileOpenDialog: async () => ({
          filePath: '/test/file.crow',
          data: encoded,
        }),
      },
    }

    await electronOpen()
    const state = useEditorStore.getState()
    expect(state.document.id).toBe('open-test-doc')
    expect(state.isDirty).toBe(false)

    globalThis.window = saved
  })

  it('should handle non-xd file via openFileAsDocument', async () => {
    const saved = globalThis.window

    // PNG file (minimal valid PNG is complex, but openFileAsDocument will try to process it)
    ;(globalThis as any).window = {
      electronAPI: {
        fileOpenDialog: async () => ({
          filePath: '/test/image.png',
          data: new ArrayBuffer(8),
        }),
      },
    }

    // This may throw due to invalid PNG data, but it should be caught internally
    try {
      await electronOpen()
    } catch {
      // Expected for invalid file data
    }

    globalThis.window = saved
  })

  it('should alert on open failure', async () => {
    const saved = globalThis.window
    let alertMessage = ''
    ;(globalThis as any).alert = (msg: string) => {
      alertMessage = msg
    }
    ;(globalThis as any).window = {
      electronAPI: {
        fileOpenDialog: async () => ({
          filePath: '/test/file.crow',
          data: new ArrayBuffer(4), // Invalid data
        }),
      },
    }

    await electronOpen()
    expect(alertMessage).toContain('Failed to open file')
    ;(globalThis as any).alert = () => {}
    globalThis.window = saved
  })
})

describe('electronSaveAs', () => {
  it('should do nothing when electronAPI is not available', async () => {
    const saved = globalThis.window
    globalThis.window = {} as any
    await expect(electronSaveAs()).resolves.toBeUndefined()
    globalThis.window = saved
  })

  it('should do nothing when fileSaveDialog returns null', async () => {
    const saved = globalThis.window
    ;(globalThis as any).window = {
      electronAPI: {
        fileSaveDialog: async () => null,
      },
    }
    await expect(electronSaveAs()).resolves.toBeUndefined()
    globalThis.window = saved
  })

  it('should save document and update state', async () => {
    const saved = globalThis.window
    let savedPath = ''
    let savedBuffer: ArrayBuffer | null = null

    ;(globalThis as any).window = {
      electronAPI: {
        fileSaveDialog: async () => '/test/saved.crow',
        fileSave: async (path: string, buffer: ArrayBuffer) => {
          savedPath = path
          savedBuffer = buffer
        },
      },
    }

    // Ensure we have a document to save
    useEditorStore.getState().newDocument({ title: 'SaveTest', width: 100, height: 100 })
    useEditorStore.setState({ isDirty: true })

    await electronSaveAs()
    expect(savedPath).toBe('/test/saved.crow')
    expect(savedBuffer).not.toBeNull()

    const state = useEditorStore.getState()
    expect(state.isDirty).toBe(false)
    expect(state.filePath).toBe('/test/saved.crow')

    globalThis.window = saved
  })
})

describe('setupElectronBridge', () => {
  it('should do nothing when electronAPI is not available', () => {
    const saved = globalThis.window
    globalThis.window = {} as any
    // Should not throw
    setupElectronBridge()
    globalThis.window = saved
  })

  it('should register menu handlers', () => {
    const saved = globalThis.window
    const handlers: Record<string, Function> = {}

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: (fn: Function) => {
          handlers['new'] = fn
        },
        onMenuUndo: (fn: Function) => {
          handlers['undo'] = fn
        },
        onMenuRedo: (fn: Function) => {
          handlers['redo'] = fn
        },
        onMenuZoomIn: (fn: Function) => {
          handlers['zoomIn'] = fn
        },
        onMenuZoomOut: (fn: Function) => {
          handlers['zoomOut'] = fn
        },
        onMenuZoomFit: (fn: Function) => {
          handlers['zoomFit'] = fn
        },
        onMenuExportSVG: (fn: Function) => {
          handlers['exportSVG'] = fn
        },
        onMenuExportPNG: (fn: Function) => {
          handlers['exportPNG'] = fn
        },
        onFileOpened: (fn: Function) => {
          handlers['fileOpened'] = fn
        },
        onRequestSave: (fn: Function) => {
          handlers['requestSave'] = fn
        },
        onAutosaveTick: (fn: Function) => {
          handlers['autosaveTick'] = fn
        },
        autosaveCheck: async () => ({ exists: false }),
      },
    }

    setupElectronBridge()

    // Verify all handlers were registered
    expect(handlers['new']).toBeDefined()
    expect(handlers['undo']).toBeDefined()
    expect(handlers['redo']).toBeDefined()
    expect(handlers['zoomIn']).toBeDefined()
    expect(handlers['zoomOut']).toBeDefined()
    expect(handlers['zoomFit']).toBeDefined()
    expect(handlers['exportSVG']).toBeDefined()
    expect(handlers['exportPNG']).toBeDefined()
    expect(handlers['fileOpened']).toBeDefined()
    expect(handlers['requestSave']).toBeDefined()
    expect(handlers['autosaveTick']).toBeDefined()

    globalThis.window = saved
  })

  it('should handle onMenuNew by creating new document', () => {
    const saved = globalThis.window
    let newHandler: Function | null = null

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: (fn: Function) => {
          newHandler = fn
        },
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: false }),
      },
    }

    setupElectronBridge()
    expect(newHandler).not.toBeNull()

    const docIdBefore = useEditorStore.getState().document.id
    newHandler!()
    const docIdAfter = useEditorStore.getState().document.id
    // New document should have a different id
    expect(docIdAfter).not.toBe(docIdBefore)

    globalThis.window = saved
  })

  it('should handle zoom in/out/fit', () => {
    const saved = globalThis.window
    const handlers: Record<string, Function> = {}

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: (fn: Function) => {
          handlers['zoomIn'] = fn
        },
        onMenuZoomOut: (fn: Function) => {
          handlers['zoomOut'] = fn
        },
        onMenuZoomFit: (fn: Function) => {
          handlers['zoomFit'] = fn
        },
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: false }),
      },
    }

    useEditorStore.getState().setZoom(1)
    setupElectronBridge()

    handlers['zoomIn']!()
    expect(useEditorStore.getState().viewport.zoom).toBeCloseTo(1.25, 2)

    handlers['zoomOut']!()
    expect(useEditorStore.getState().viewport.zoom).toBeCloseTo(1, 2)

    handlers['zoomFit']!()
    expect(useEditorStore.getState().viewport.zoom).toBe(1)

    globalThis.window = saved
  })

  it('should handle onRequestSave', async () => {
    const saved = globalThis.window
    let saveHandler: Function | null = null
    let savedPath = ''
    let savedData: ArrayBuffer | null = null

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: (fn: Function) => {
          saveHandler = fn
        },
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: false }),
        fileSave: async (path: string, data: ArrayBuffer) => {
          savedPath = path
          savedData = data
        },
      },
    }

    useEditorStore.getState().newDocument({ title: 'SaveTest', width: 100, height: 100 })
    useEditorStore.setState({ isDirty: true })

    setupElectronBridge()
    expect(saveHandler).not.toBeNull()

    await saveHandler!('/test/saved.crow')
    expect(savedPath).toBe('/test/saved.crow')
    expect(savedData).not.toBeNull()
    expect(useEditorStore.getState().isDirty).toBe(false)

    globalThis.window = saved
  })

  it('should handle autosaveTick when dirty', async () => {
    const saved = globalThis.window
    let autosaveHandler: Function | null = null
    let autosaveData: ArrayBuffer | null = null

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: (fn: Function) => {
          autosaveHandler = fn
        },
        autosaveCheck: async () => ({ exists: false }),
        autosaveWrite: async (data: ArrayBuffer) => {
          autosaveData = data
        },
      },
    }

    useEditorStore.getState().newDocument({ title: 'AutoSave', width: 100, height: 100 })
    useEditorStore.setState({ isDirty: true })

    setupElectronBridge()
    expect(autosaveHandler).not.toBeNull()

    await autosaveHandler!()
    expect(autosaveData).not.toBeNull()

    globalThis.window = saved
  })

  it('should skip autosaveTick when not dirty', async () => {
    const saved = globalThis.window
    let autosaveHandler: Function | null = null
    let autosaveWriteCalled = false

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: (fn: Function) => {
          autosaveHandler = fn
        },
        autosaveCheck: async () => ({ exists: false }),
        autosaveWrite: async () => {
          autosaveWriteCalled = true
        },
      },
    }

    useEditorStore.setState({ isDirty: false })

    setupElectronBridge()
    await autosaveHandler!()
    expect(autosaveWriteCalled).toBe(false)

    globalThis.window = saved
  })

  it('should handle onFileOpened with .crow file', async () => {
    const saved = globalThis.window
    let fileOpenedHandler: Function | null = null

    const { encodeDocument } = require('@/io/file-format')
    const testDoc = {
      id: 'opened-doc',
      metadata: {
        title: 'Opened',
        author: '',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
        colorspace: 'srgb',
        width: 100,
        height: 100,
      },
      artboards: [
        {
          id: 'ab1',
          name: 'Main',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const encoded = encodeDocument(testDoc)

    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: (fn: Function) => {
          fileOpenedHandler = fn
        },
        onRequestSave: () => {},
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: false }),
      },
    }

    setupElectronBridge()
    expect(fileOpenedHandler).not.toBeNull()

    await fileOpenedHandler!(encoded, '/path/to/file.crow')
    expect(useEditorStore.getState().document.id).toBe('opened-doc')
    expect(useEditorStore.getState().isDirty).toBe(false)

    globalThis.window = saved
  })

  it('should handle recovery check with existing recovery file', async () => {
    const saved = globalThis.window
    let autosaveClearCalled = false

    const { encodeDocument } = require('@/io/file-format')
    const recoveryDoc = {
      id: 'recovery-doc',
      metadata: {
        title: 'Recovered',
        author: '',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
        colorspace: 'srgb',
        width: 100,
        height: 100,
      },
      artboards: [
        {
          id: 'ab1',
          name: 'Main',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          backgroundColor: '#ffffff',
          layers: [],
        },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const encoded = encodeDocument(recoveryDoc)

    // Set confirm to return true to accept recovery
    ;(globalThis as any).confirm = () => true
    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: true, data: encoded }),
        autosaveClear: async () => {
          autosaveClearCalled = true
        },
      },
    }

    setupElectronBridge()

    // Wait for the async checkRecovery to complete
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(useEditorStore.getState().document.id).toBe('recovery-doc')
    expect(autosaveClearCalled).toBe(true)
    ;(globalThis as any).confirm = () => false
    globalThis.window = saved
  })

  it('should handle recovery check declined', async () => {
    const saved = globalThis.window
    let autosaveClearCalled = false

    ;(globalThis as any).confirm = () => false
    ;(globalThis as any).window = {
      electronAPI: {
        onMenuNew: () => {},
        onMenuUndo: () => {},
        onMenuRedo: () => {},
        onMenuZoomIn: () => {},
        onMenuZoomOut: () => {},
        onMenuZoomFit: () => {},
        onMenuExportSVG: () => {},
        onMenuExportPNG: () => {},
        onFileOpened: () => {},
        onRequestSave: () => {},
        onAutosaveTick: () => {},
        autosaveCheck: async () => ({ exists: true, data: new ArrayBuffer(100) }),
        autosaveClear: async () => {
          autosaveClearCalled = true
        },
      },
    }

    setupElectronBridge()

    await new Promise((resolve) => setTimeout(resolve, 50))

    // Document should not have changed (declined recovery)
    expect(autosaveClearCalled).toBe(true)

    globalThis.window = saved
  })
})
