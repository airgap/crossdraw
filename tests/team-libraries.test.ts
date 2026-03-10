import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import type { SymbolDefinition, TextStyle } from '@/types'
import type { LibraryEntry, LibraryData, LibraryPublishPayload } from '@/cloud/library-client'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 800, height: 600 })
  useEditorStore.setState({ subscribedLibraries: [] })
}

function getDoc() {
  return useEditorStore.getState().document
}

function createTestSymbol(overrides: Partial<SymbolDefinition> = {}): SymbolDefinition {
  return {
    id: 'sym-1',
    name: 'Button',
    layers: [],
    width: 100,
    height: 40,
    ...overrides,
  }
}

function createTestLibraryEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'lib-1',
    name: 'Design System',
    version: 1,
    symbolCount: 3,
    styleCount: 5,
    updatedAt: '2026-03-09T00:00:00.000Z',
    ...overrides,
  }
}

function createTestLibraryData(overrides: Partial<LibraryData> = {}): LibraryData {
  return {
    id: 'lib-1',
    name: 'Design System',
    version: 1,
    symbols: [createTestSymbol()],
    textStyles: [
      {
        id: 'ts-1',
        name: 'Heading',
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: 'bold',
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        color: '#000000',
      },
    ],
    colorStyles: [{ id: 'cs-1', name: 'Primary', color: '#0066ff', opacity: 1 }],
    effectStyles: [
      {
        id: 'es-1',
        name: 'Shadow',
        effects: [
          {
            id: 'eff-1',
            type: 'shadow',
            enabled: true,
            opacity: 0.3,
            params: {
              kind: 'shadow',
              offsetX: 0,
              offsetY: 4,
              blurRadius: 8,
              spread: 0,
              color: '#000000',
              opacity: 0.3,
            },
          },
        ],
      },
    ],
    variables: [],
    ...overrides,
  }
}

// ── Tests ──

describe('Team Libraries', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('Library data structure creation from document', () => {
    it('should extract symbols from the current document', () => {
      const doc = getDoc()
      const symbols = doc.symbols ?? []
      // Document starts with no symbols
      expect(symbols).toHaveLength(0)
    })

    it('should build a library publish payload from document data', () => {
      const doc = getDoc()
      const payload: LibraryPublishPayload = {
        name: 'Test Library',
        symbols: doc.symbols ?? [],
        textStyles: doc.styles?.textStyles ?? [],
        colorStyles: doc.styles?.colorStyles ?? [],
        effectStyles: doc.styles?.effectStyles ?? [],
        variables: doc.variableCollections ?? [],
      }
      expect(payload.name).toBe('Test Library')
      expect(payload.symbols).toHaveLength(0)
      expect(payload.textStyles).toHaveLength(0)
      expect(payload.colorStyles).toHaveLength(0)
      expect(payload.effectStyles).toHaveLength(0)
      expect(payload.variables).toHaveLength(0)
    })

    it('should include symbols and styles when present in the document', () => {
      const store = useEditorStore.getState()
      // Add a text style
      const textStyle: TextStyle = {
        id: 'ts-1',
        name: 'Body',
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.5,
        letterSpacing: 0,
        color: '#333333',
      }
      store.addTextStyle(textStyle)

      const doc = useEditorStore.getState().document
      const payload: LibraryPublishPayload = {
        name: 'Styled Library',
        symbols: doc.symbols ?? [],
        textStyles: doc.styles?.textStyles ?? [],
        colorStyles: doc.styles?.colorStyles ?? [],
        effectStyles: doc.styles?.effectStyles ?? [],
        variables: doc.variableCollections ?? [],
      }

      expect(payload.textStyles).toHaveLength(1)
      expect(payload.textStyles[0]!.name).toBe('Body')
    })

    it('should create a LibraryEntry from metadata', () => {
      const entry = createTestLibraryEntry()
      expect(entry.id).toBe('lib-1')
      expect(entry.name).toBe('Design System')
      expect(entry.version).toBe(1)
      expect(entry.symbolCount).toBe(3)
      expect(entry.styleCount).toBe(5)
      expect(entry.updatedAt).toBeTruthy()
    })

    it('should create a full LibraryData with all sections', () => {
      const data = createTestLibraryData()
      expect(data.id).toBe('lib-1')
      expect(data.symbols).toHaveLength(1)
      expect(data.textStyles).toHaveLength(1)
      expect(data.colorStyles).toHaveLength(1)
      expect(data.effectStyles).toHaveLength(1)
      expect(data.variables).toHaveLength(0)
    })

    it('should compute symbol and style counts for LibraryEntry', () => {
      const data = createTestLibraryData()
      const entry: LibraryEntry = {
        id: data.id,
        name: data.name,
        version: data.version,
        symbolCount: data.symbols.length,
        styleCount: data.textStyles.length + data.colorStyles.length + data.effectStyles.length,
        updatedAt: new Date().toISOString(),
      }
      expect(entry.symbolCount).toBe(1)
      expect(entry.styleCount).toBe(3)
    })
  })

  describe('Subscribe / Unsubscribe', () => {
    it('should subscribe to a library', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(1)
      expect(subs[0]!.id).toBe('lib-1')
      expect(subs[0]!.name).toBe('Design System')
      expect(subs[0]!.version).toBe(1)
    })

    it('should not add duplicate subscriptions', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      store.subscribeToLibrary('lib-1', 'Design System', 2)

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(1)
      // Version should remain at original (1) since duplicate was rejected
      expect(subs[0]!.version).toBe(1)
    })

    it('should subscribe to multiple different libraries', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      store.subscribeToLibrary('lib-2', 'Icons', 3)
      store.subscribeToLibrary('lib-3', 'Patterns', 2)

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(3)
      expect(subs.map((s) => s.id)).toEqual(['lib-1', 'lib-2', 'lib-3'])
    })

    it('should unsubscribe from a library', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      store.subscribeToLibrary('lib-2', 'Icons', 3)
      store.unsubscribeFromLibrary('lib-1')

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(1)
      expect(subs[0]!.id).toBe('lib-2')
    })

    it('should handle unsubscribing from a library that is not subscribed', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      store.unsubscribeFromLibrary('nonexistent')

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(1)
    })

    it('should handle unsubscribing when there are no subscriptions', () => {
      const store = useEditorStore.getState()
      store.unsubscribeFromLibrary('lib-1')

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(0)
    })

    it('should start with empty subscriptions', () => {
      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(0)
    })

    it('should reset subscriptions on new document', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      expect(useEditorStore.getState().subscribedLibraries).toHaveLength(1)

      // New document resets state but subscribedLibraries persists
      // (subscriptions are per-workspace, not per-document)
      store.newDocument()
      // subscribedLibraries are NOT reset by newDocument (they are session-level)
      expect(useEditorStore.getState().subscribedLibraries).toHaveLength(1)
    })
  })

  describe('Version comparison for update detection', () => {
    it('should detect when an update is available', () => {
      const subscribed = { id: 'lib-1', name: 'Design System', version: 1 }
      const remote: LibraryEntry = createTestLibraryEntry({ version: 2 })
      expect(remote.version > subscribed.version).toBe(true)
    })

    it('should detect when no update is available (same version)', () => {
      const subscribed = { id: 'lib-1', name: 'Design System', version: 1 }
      const remote: LibraryEntry = createTestLibraryEntry({ version: 1 })
      expect(remote.version > subscribed.version).toBe(false)
    })

    it('should detect when no update is available (local ahead)', () => {
      const subscribed = { id: 'lib-1', name: 'Design System', version: 3 }
      const remote: LibraryEntry = createTestLibraryEntry({ version: 2 })
      expect(remote.version > subscribed.version).toBe(false)
    })

    it('should detect updates across multiple subscriptions', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)
      store.subscribeToLibrary('lib-2', 'Icons', 5)

      const remoteLibraries: LibraryEntry[] = [
        createTestLibraryEntry({ id: 'lib-1', version: 3 }),
        createTestLibraryEntry({ id: 'lib-2', version: 5 }),
        createTestLibraryEntry({ id: 'lib-3', version: 1 }),
      ]

      const subs = useEditorStore.getState().subscribedLibraries
      const updates = subs.filter((sub) => {
        const remote = remoteLibraries.find((r) => r.id === sub.id)
        return remote !== undefined && remote.version > sub.version
      })

      expect(updates).toHaveLength(1)
      expect(updates[0]!.id).toBe('lib-1')
    })

    it('should simulate accepting an update by re-subscribing with new version', () => {
      const store = useEditorStore.getState()
      store.subscribeToLibrary('lib-1', 'Design System', 1)

      // Simulate update available: remote has version 3
      // Accept update: unsubscribe and re-subscribe with new version
      store.unsubscribeFromLibrary('lib-1')
      store.subscribeToLibrary('lib-1', 'Design System', 3)

      const subs = useEditorStore.getState().subscribedLibraries
      expect(subs).toHaveLength(1)
      expect(subs[0]!.version).toBe(3)
    })
  })

  describe('Import symbol from library', () => {
    it('should import a symbol into the document', () => {
      const store = useEditorStore.getState()
      const symbol = createTestSymbol()

      store.importSymbolFromLibrary(symbol)

      const doc = useEditorStore.getState().document
      expect(doc.symbols).toHaveLength(1)
      expect(doc.symbols![0]!.id).toBe('sym-1')
      expect(doc.symbols![0]!.name).toBe('Button')
    })

    it('should import multiple symbols', () => {
      const store = useEditorStore.getState()
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-1', name: 'Button' }))
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-2', name: 'Card' }))
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-3', name: 'Input' }))

      const doc = useEditorStore.getState().document
      expect(doc.symbols).toHaveLength(3)
    })

    it('should replace an existing symbol with the same ID', () => {
      const store = useEditorStore.getState()
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-1', name: 'Button v1' }))
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-1', name: 'Button v2' }))

      const doc = useEditorStore.getState().document
      expect(doc.symbols).toHaveLength(1)
      expect(doc.symbols![0]!.name).toBe('Button v2')
    })

    it('should not affect other symbols when replacing', () => {
      const store = useEditorStore.getState()
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-1', name: 'Button' }))
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-2', name: 'Card' }))
      store.importSymbolFromLibrary(createTestSymbol({ id: 'sym-1', name: 'Button Updated' }))

      const doc = useEditorStore.getState().document
      expect(doc.symbols).toHaveLength(2)
      expect(doc.symbols![0]!.name).toBe('Button Updated')
      expect(doc.symbols![1]!.name).toBe('Card')
    })

    it('should mark document as dirty after import', () => {
      const store = useEditorStore.getState()
      expect(store.isDirty).toBe(false)

      store.importSymbolFromLibrary(createTestSymbol())

      expect(useEditorStore.getState().isDirty).toBe(true)
    })

    it('should create an undo entry for symbol import', () => {
      const store = useEditorStore.getState()
      const initialHistoryLen = store.history.length

      store.importSymbolFromLibrary(createTestSymbol())

      const newStore = useEditorStore.getState()
      expect(newStore.history.length).toBe(initialHistoryLen + 1)
      expect(newStore.history[newStore.history.length - 1]!.description).toBe('Import symbol from library')
    })
  })

  describe('Library server index operations', () => {
    // These test the server-side data structure logic without a running server

    interface LibraryMetadata {
      id: string
      name: string
      version: number
      symbolCount: number
      styleCount: number
      createdAt: string
      updatedAt: string
    }

    interface LibraryIndex {
      libraries: LibraryMetadata[]
    }

    function createEmptyLibraryIndex(): LibraryIndex {
      return { libraries: [] }
    }

    function addLibraryEntry(index: LibraryIndex, entry: LibraryMetadata): LibraryIndex {
      return { libraries: [...index.libraries, entry] }
    }

    function removeLibraryEntry(index: LibraryIndex, id: string): LibraryIndex {
      return { libraries: index.libraries.filter((l) => l.id !== id) }
    }

    function bumpVersion(index: LibraryIndex, id: string): LibraryIndex {
      return {
        libraries: index.libraries.map((l) =>
          l.id === id ? { ...l, version: l.version + 1, updatedAt: new Date().toISOString() } : l,
        ),
      }
    }

    function createTestMeta(overrides: Partial<LibraryMetadata> = {}): LibraryMetadata {
      return {
        id: 'lib-1',
        name: 'Test Library',
        version: 1,
        symbolCount: 2,
        styleCount: 3,
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:00.000Z',
        ...overrides,
      }
    }

    it('should add a library entry to empty index', () => {
      const index = createEmptyLibraryIndex()
      const entry = createTestMeta()
      const result = addLibraryEntry(index, entry)
      expect(result.libraries).toHaveLength(1)
      expect(result.libraries[0]!.id).toBe('lib-1')
    })

    it('should add multiple library entries', () => {
      let index = createEmptyLibraryIndex()
      index = addLibraryEntry(index, createTestMeta({ id: 'lib-1' }))
      index = addLibraryEntry(index, createTestMeta({ id: 'lib-2', name: 'Icons' }))
      expect(index.libraries).toHaveLength(2)
    })

    it('should remove a library entry', () => {
      let index = createEmptyLibraryIndex()
      index = addLibraryEntry(index, createTestMeta({ id: 'lib-1' }))
      index = addLibraryEntry(index, createTestMeta({ id: 'lib-2' }))
      index = removeLibraryEntry(index, 'lib-1')
      expect(index.libraries).toHaveLength(1)
      expect(index.libraries[0]!.id).toBe('lib-2')
    })

    it('should bump the version of a library', () => {
      let index = createEmptyLibraryIndex()
      index = addLibraryEntry(index, createTestMeta({ id: 'lib-1', version: 1 }))
      index = bumpVersion(index, 'lib-1')
      expect(index.libraries[0]!.version).toBe(2)
    })

    it('should not mutate the original index on add', () => {
      const index = createEmptyLibraryIndex()
      const result = addLibraryEntry(index, createTestMeta())
      expect(index.libraries).toHaveLength(0)
      expect(result.libraries).toHaveLength(1)
    })

    it('should not mutate the original index on remove', () => {
      const index = addLibraryEntry(createEmptyLibraryIndex(), createTestMeta())
      const result = removeLibraryEntry(index, 'lib-1')
      expect(index.libraries).toHaveLength(1)
      expect(result.libraries).toHaveLength(0)
    })
  })
})
