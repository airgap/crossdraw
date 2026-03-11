import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  diffDocuments,
  diffSnapshots,
  mergeDocuments,
  mergeSnapshots,
  createSnapshot,
  listSnapshots,
  getSnapshot,
  deleteSnapshot,
  createBranch,
  listBranches,
  deleteBranch,
  type VersionSnapshot,
} from '@/versioning/version-store'
import type { DesignDocument, VectorLayer, GroupLayer, Artboard } from '@/types'

// ── Test helpers ──

function createTestDocument(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    id: 'test-doc-001',
    metadata: {
      title: 'Test Document',
      author: 'Test',
      created: '2026-03-09T00:00:00.000Z',
      modified: '2026-03-09T00:00:00.000Z',
      colorspace: 'srgb',
      width: 1920,
      height: 1080,
    },
    artboards: [
      {
        id: 'artboard-001',
        name: 'Main',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#ffffff',
        layers: [],
      },
    ],
    assets: { gradients: [], patterns: [], colors: [] },
    ...overrides,
  }
}

function createVectorLayer(id: string, name: string, extra: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id,
    name,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...extra,
  }
}

function makeSnapshot(doc: DesignDocument, name: string, branch = 'main', parentId?: string): VersionSnapshot {
  return {
    id: `snap-${name}`,
    name,
    description: '',
    timestamp: new Date().toISOString(),
    documentData: JSON.stringify(doc),
    parentId,
    branchName: branch,
  }
}

// ── Additional Coverage Tests ──

describe('diffDocuments - nested layers in groups', () => {
  test('detects added layers inside groups', () => {
    const docA = createTestDocument()
    const group: GroupLayer = {
      id: 'grp-1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [createVectorLayer('inner-1', 'Inner')],
    }
    docA.artboards[0]!.layers.push(group)

    const docB = JSON.parse(JSON.stringify(docA)) as DesignDocument
    const grpB = docB.artboards[0]!.layers[0] as GroupLayer
    grpB.children.push(createVectorLayer('inner-2', 'New Inner'))

    const diff = diffDocuments(docA, docB)
    expect(diff.addedLayers).toHaveLength(1)
    expect(diff.addedLayers[0]!.layer.id).toBe('inner-2')
  })

  test('detects modified layers inside groups', () => {
    const docA = createTestDocument()
    const group: GroupLayer = {
      id: 'grp-1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [createVectorLayer('inner-1', 'Inner', { opacity: 1 })],
    }
    docA.artboards[0]!.layers.push(group)

    const docB = JSON.parse(JSON.stringify(docA)) as DesignDocument
    const grpB = docB.artboards[0]!.layers[0] as GroupLayer
    ;(grpB.children[0] as VectorLayer).opacity = 0.5

    const diff = diffDocuments(docA, docB)
    // Both the group (its serialized children changed) and the inner layer are modified
    expect(diff.modifiedLayers).toHaveLength(2)
    expect(diff.modifiedLayers.some((m) => m.layerId === 'inner-1')).toBe(true)
    expect(diff.modifiedLayers.some((m) => m.layerId === 'grp-1')).toBe(true)
  })

  test('detects removed layers inside groups', () => {
    const docA = createTestDocument()
    const group: GroupLayer = {
      id: 'grp-1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [createVectorLayer('inner-1', 'Inner'), createVectorLayer('inner-2', 'Inner2')],
    }
    docA.artboards[0]!.layers.push(group)

    const docB = JSON.parse(JSON.stringify(docA)) as DesignDocument
    const grpB = docB.artboards[0]!.layers[0] as GroupLayer
    grpB.children = grpB.children.filter((c) => c.id !== 'inner-2')

    const diff = diffDocuments(docA, docB)
    expect(diff.removedLayers).toHaveLength(1)
    expect(diff.removedLayers[0]!.layer.id).toBe('inner-2')
  })
})

describe('diffDocuments - empty documents', () => {
  test('empty artboards produce empty diff', () => {
    const docA = createTestDocument()
    const docB = createTestDocument()
    const diff = diffDocuments(docA, docB)
    expect(diff.addedLayers).toHaveLength(0)
    expect(diff.removedLayers).toHaveLength(0)
    expect(diff.modifiedLayers).toHaveLength(0)
    expect(diff.addedArtboards).toHaveLength(0)
    expect(diff.removedArtboards).toHaveLength(0)
  })
})

describe('diffDocuments - multiple artboards', () => {
  test('detects changes across multiple artboards', () => {
    const docA = createTestDocument()
    docA.artboards.push({
      id: 'artboard-002',
      name: 'Second',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#ffffff',
      layers: [],
    })
    docA.artboards[0]!.layers.push(createVectorLayer('l1', 'AB1-Layer'))
    docA.artboards[1]!.layers.push(createVectorLayer('l2', 'AB2-Layer'))

    const docB = JSON.parse(JSON.stringify(docA)) as DesignDocument
    ;(docB.artboards[0]!.layers[0] as VectorLayer).opacity = 0.5
    docB.artboards[1]!.layers.push(createVectorLayer('l3', 'New in AB2'))

    const diff = diffDocuments(docA, docB)
    expect(diff.modifiedLayers).toHaveLength(1)
    expect(diff.addedLayers).toHaveLength(1)
    expect(diff.addedLayers[0]!.artboardId).toBe('artboard-002')
  })
})

describe('mergeDocuments - additional scenarios', () => {
  test('layer deleted in ours but modified in theirs creates conflict', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'Contested', { opacity: 1 }))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(theirs.artboards[0]!.layers[0] as VectorLayer).opacity = 0.5

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers = [] // deleted

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.layerId).toBe('l1')
  })

  test('layer deleted in theirs, unmodified in ours -> removed from merged', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'ToDelete'))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers = []

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards[0]!.layers).toHaveLength(0)
  })

  test('layer deleted in theirs, modified in ours -> kept in merged (our version)', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'Modified', { opacity: 1 }))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers = [] // deleted in theirs

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(ours.artboards[0]!.layers[0] as VectorLayer).opacity = 0.5 // modified in ours

    const result = mergeDocuments(base, theirs, ours)
    // Ours modified, theirs deleted -> keep ours
    expect(result.merged.artboards[0]!.layers).toHaveLength(1)
    expect(result.merged.artboards[0]!.layers[0]!.opacity).toBe(0.5)
  })

  test('new layer added in both (different ids) -> no conflict, both present', () => {
    const base = createTestDocument()

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers.push(createVectorLayer('theirs-l', 'Theirs New'))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers.push(createVectorLayer('ours-l', 'Ours New'))

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    const ids = result.merged.artboards[0]!.layers.map((l) => l.id)
    expect(ids).toContain('ours-l')
    expect(ids).toContain('theirs-l')
  })

  test('same layer added in both (same id, same content) -> no conflict', () => {
    const base = createTestDocument()
    const newLayer = createVectorLayer('shared-l', 'Shared')

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers.push(JSON.parse(JSON.stringify(newLayer)))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers.push(JSON.parse(JSON.stringify(newLayer)))

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    // Should have the layer
    const merged = result.merged.artboards[0]!.layers
    expect(merged.some((l) => l.id === 'shared-l')).toBe(true)
  })
})

describe('mergeSnapshots - additional coverage', () => {
  test('handles multiple conflicts', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(
      createVectorLayer('l1', 'A', { opacity: 1 }),
      createVectorLayer('l2', 'B', { opacity: 1 }),
    )

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(theirs.artboards[0]!.layers[0] as VectorLayer).opacity = 0.3
    ;(theirs.artboards[0]!.layers[1] as VectorLayer).opacity = 0.3

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(ours.artboards[0]!.layers[0] as VectorLayer).opacity = 0.7
    ;(ours.artboards[0]!.layers[1] as VectorLayer).opacity = 0.7

    const baseSnap = makeSnapshot(base, 'base')
    const theirsSnap = makeSnapshot(theirs, 'theirs')
    const oursSnap = makeSnapshot(ours, 'ours')

    const result = mergeSnapshots(baseSnap, theirsSnap, oursSnap)
    expect(result.conflicts).toHaveLength(2)
  })
})

describe('diffSnapshots - additional coverage', () => {
  test('empty snapshots produce empty diff', () => {
    const doc = createTestDocument()
    const s1 = makeSnapshot(doc, 'v1')
    const s2 = makeSnapshot(doc, 'v2')
    const diff = diffSnapshots(s1, s2)
    expect(diff.addedLayers).toHaveLength(0)
    expect(diff.removedLayers).toHaveLength(0)
  })

  test('detects artboard changes via snapshots', () => {
    const docA = createTestDocument()
    const docB = createTestDocument()
    docB.artboards.push({
      id: 'new-ab',
      name: 'New',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#fff',
      layers: [],
    })

    const s1 = makeSnapshot(docA, 'v1')
    const s2 = makeSnapshot(docB, 'v2')
    const diff = diffSnapshots(s1, s2)
    expect(diff.addedArtboards).toHaveLength(1)
  })
})

describe('mergeDocuments - artboard merging', () => {
  test('artboard added in theirs, already in ours -> not duplicated', () => {
    const base = createTestDocument()
    const newArtboard: Artboard = {
      id: 'shared-ab',
      name: 'Shared',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#fff',
      layers: [],
    }

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards.push(JSON.parse(JSON.stringify(newArtboard)))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards.push(JSON.parse(JSON.stringify(newArtboard)))

    const result = mergeDocuments(base, theirs, ours)
    // Should not duplicate
    expect(result.merged.artboards.filter((a) => a.id === 'shared-ab')).toHaveLength(1)
  })
})

describe('mergeDocuments - replaceLayerInList deep path', () => {
  test('theirs modifies a layer inside a group', () => {
    const innerLayer = createVectorLayer('inner-1', 'Inner', { opacity: 1 })
    const group: GroupLayer = {
      id: 'grp-1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [innerLayer],
    }

    const base = createTestDocument()
    base.artboards[0]!.layers.push(JSON.parse(JSON.stringify(group)))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    const theirsGroup = theirs.artboards[0]!.layers[0] as GroupLayer
    ;(theirsGroup.children[0] as VectorLayer).opacity = 0.2

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    const mergedGroup = result.merged.artboards[0]!.layers[0] as GroupLayer
    expect(mergedGroup.children[0]!.opacity).toBe(0.2)
  })
})

describe('mergeDocuments - removeLayerFromList deep path', () => {
  test('theirs deletes a layer inside a group, ours unmodified -> removed', () => {
    const innerLayer = createVectorLayer('inner-del', 'Inner Del')
    const group: GroupLayer = {
      id: 'grp-1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [innerLayer, createVectorLayer('inner-keep', 'Keep')],
    }

    const base = createTestDocument()
    base.artboards[0]!.layers.push(JSON.parse(JSON.stringify(group)))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    const theirsGroup = theirs.artboards[0]!.layers[0] as GroupLayer
    theirsGroup.children = theirsGroup.children.filter((c) => c.id !== 'inner-del')

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)
    const mergedGroup = result.merged.artboards[0]!.layers[0] as GroupLayer
    expect(mergedGroup.children.some((c) => c.id === 'inner-del')).toBe(false)
    expect(mergedGroup.children.some((c) => c.id === 'inner-keep')).toBe(true)
  })
})

// ── IndexedDB-backed snapshot/branch CRUD (lines 54-229, 431-453) ──

// Fake IndexedDB implementation for testing
function createFakeIndexedDB() {
  const databases = new Map<
    string,
    { stores: Map<string, Map<string, any>>; indexes: Map<string, Map<string, { keyPath: string }>> }
  >()

  function getOrCreateDB(name: string) {
    if (!databases.has(name)) {
      databases.set(name, { stores: new Map(), indexes: new Map() })
    }
    return databases.get(name)!
  }

  return {
    open(name: string, _version?: number) {
      const db = getOrCreateDB(name)
      const request: any = { result: null, error: null }

      const dbObj: any = {
        objectStoreNames: {
          contains: (n: string) => db.stores.has(n),
        },
        createObjectStore: (storeName: string, _opts: any) => {
          db.stores.set(storeName, new Map())
          db.indexes.set(storeName, new Map())
          return {
            createIndex: (indexName: string, keyPath: string, _opts: any) => {
              db.indexes.get(storeName)!.set(indexName, { keyPath })
            },
          }
        },
        transaction: (storeNames: string | string[], _mode?: string) => {
          void (Array.isArray(storeNames) ? storeNames : [storeNames])
          const tx: any = {
            oncomplete: null,
            onerror: null,
            error: null,
            objectStore: (name: string) => {
              const store = db.stores.get(name)!
              const indexDefs = db.indexes.get(name)!
              return {
                put: (item: any) => {
                  const keyPath = name === 'snapshots' ? 'id' : 'key'
                  store.set(item[keyPath], JSON.parse(JSON.stringify(item)))
                  return { onsuccess: null, onerror: null }
                },
                get: (key: string) => {
                  const req: any = { result: null, onsuccess: null, onerror: null }
                  setTimeout(() => {
                    req.result = store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : undefined
                    if (req.onsuccess) req.onsuccess()
                  }, 0)
                  return req
                },
                delete: (key: string) => {
                  store.delete(key)
                  return { onsuccess: null, onerror: null }
                },
                index: (indexName: string) => {
                  const indexDef = indexDefs.get(indexName)!
                  return {
                    getAll: (value: string) => {
                      const results: any[] = []
                      for (const [, item] of store) {
                        if (item[indexDef.keyPath] === value) {
                          results.push(JSON.parse(JSON.stringify(item)))
                        }
                      }
                      const req: any = { result: results, onsuccess: null, onerror: null }
                      setTimeout(() => {
                        if (req.onsuccess) req.onsuccess()
                      }, 0)
                      return req
                    },
                  }
                },
              }
            },
          }
          // Complete the transaction asynchronously
          setTimeout(() => {
            if (tx.oncomplete) tx.oncomplete()
          }, 0)
          return tx
        },
        close: () => {},
      }

      request.result = dbObj

      // Fire onupgradeneeded if stores don't exist yet, then onsuccess
      setTimeout(() => {
        if (!db.stores.has('snapshots')) {
          if (request.onupgradeneeded) request.onupgradeneeded()
        }
        if (request.onsuccess) request.onsuccess()
      }, 0)

      return request
    },
  }
}

describe('IndexedDB snapshot CRUD', () => {
  let origIndexedDB: any

  beforeAll(() => {
    origIndexedDB = (globalThis as any).indexedDB
    ;(globalThis as any).indexedDB = createFakeIndexedDB()
  })

  afterAll(() => {
    if (origIndexedDB !== undefined) {
      ;(globalThis as any).indexedDB = origIndexedDB
    } else {
      delete (globalThis as any).indexedDB
    }
  })

  test('createSnapshot creates a snapshot and returns it', async () => {
    const doc = createTestDocument()
    const snap = await createSnapshot(doc, 'v1', 'main', 'Initial snapshot')
    expect(snap.id).toBeTruthy()
    expect(snap.name).toBe('v1')
    expect(snap.branchName).toBe('main')
    expect(snap.description).toBe('Initial snapshot')
    expect(snap.timestamp).toBeTruthy()
    expect(snap.documentData).toBe(JSON.stringify(doc))
  })

  test('listSnapshots returns snapshots for a document', async () => {
    const doc = createTestDocument({ id: 'list-test-doc' })
    await createSnapshot(doc, 'snap-a', 'main')
    await createSnapshot(doc, 'snap-b', 'main')

    const list = await listSnapshots('list-test-doc')
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.some((s) => s.name === 'snap-a')).toBe(true)
    expect(list.some((s) => s.name === 'snap-b')).toBe(true)
  })

  test('listSnapshots sorts by timestamp', async () => {
    const doc = createTestDocument({ id: 'sort-test-doc' })
    await createSnapshot(doc, 'first', 'main')
    await createSnapshot(doc, 'second', 'main')

    const list = await listSnapshots('sort-test-doc')
    // All timestamps should be in non-decreasing order
    for (let i = 1; i < list.length; i++) {
      const prev = new Date(list[i - 1]!.timestamp).getTime()
      const curr = new Date(list[i]!.timestamp).getTime()
      expect(curr).toBeGreaterThanOrEqual(prev)
    }
  })

  test('getSnapshot returns a snapshot by id', async () => {
    const doc = createTestDocument({ id: 'get-test-doc' })
    const snap = await createSnapshot(doc, 'get-me', 'main')

    const retrieved = await getSnapshot(snap.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('get-me')
    expect(retrieved!.documentData).toBe(JSON.stringify(doc))
  })

  test('getSnapshot returns undefined for missing id', async () => {
    const result = await getSnapshot('nonexistent-snapshot-id')
    expect(result).toBeUndefined()
  })

  test('deleteSnapshot removes a snapshot', async () => {
    const doc = createTestDocument({ id: 'del-test-doc' })
    const snap = await createSnapshot(doc, 'to-delete', 'main')

    await deleteSnapshot(snap.id)
    const retrieved = await getSnapshot(snap.id)
    expect(retrieved).toBeUndefined()
  })

  test('createSnapshot with parentId sets parent reference', async () => {
    const doc = createTestDocument({ id: 'parent-test-doc' })
    const parent = await createSnapshot(doc, 'parent', 'main')
    const child = await createSnapshot(doc, 'child', 'main', '', parent.id)

    expect(child.parentId).toBe(parent.id)
  })

  test('createSnapshot updates branch head', async () => {
    const doc = createTestDocument({ id: 'branch-head-doc' })
    await createSnapshot(doc, 'snap1', 'main')
    const snap2 = await createSnapshot(doc, 'snap2', 'main')

    const branches = await listBranches('branch-head-doc')
    const mainBranch = branches.find((b) => b.name === 'main')
    expect(mainBranch).toBeDefined()
    expect(mainBranch!.headSnapshotId).toBe(snap2.id)
  })
})

describe('IndexedDB branch CRUD', () => {
  let origIndexedDB: any

  beforeAll(() => {
    origIndexedDB = (globalThis as any).indexedDB
    ;(globalThis as any).indexedDB = createFakeIndexedDB()
  })

  afterAll(() => {
    if (origIndexedDB !== undefined) {
      ;(globalThis as any).indexedDB = origIndexedDB
    } else {
      delete (globalThis as any).indexedDB
    }
  })

  test('createBranch creates a new branch', async () => {
    const branch = await createBranch('branch-doc-1', 'feature-x', 'snap-abc')
    expect(branch.name).toBe('feature-x')
    expect(branch.headSnapshotId).toBe('snap-abc')
    expect(branch.createdAt).toBeTruthy()
  })

  test('listBranches returns branches for a document', async () => {
    await createBranch('branch-doc-2', 'main', 'snap-1')
    await createBranch('branch-doc-2', 'develop', 'snap-2')

    const branches = await listBranches('branch-doc-2')
    expect(branches.length).toBeGreaterThanOrEqual(2)
    expect(branches.some((b) => b.name === 'main')).toBe(true)
    expect(branches.some((b) => b.name === 'develop')).toBe(true)
  })

  test('deleteBranch removes a branch', async () => {
    await createBranch('branch-doc-3', 'temp', 'snap-t')
    await deleteBranch('branch-doc-3', 'temp')

    const branches = await listBranches('branch-doc-3')
    expect(branches.some((b) => b.name === 'temp')).toBe(false)
  })

  test('listBranches returns empty for unknown docId', async () => {
    const branches = await listBranches('unknown-doc-id')
    expect(branches).toHaveLength(0)
  })
})

// ── Additional merge/diff edge cases (covering remaining lines) ──

describe('mergeDocuments - applyLayerToMerged fallback path', () => {
  test('theirs modifies a layer not found in merged -> adds to target artboard', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'Existing'))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    // Add a brand new layer in theirs that doesn't exist in ours
    theirs.artboards[0]!.layers.push(createVectorLayer('l-new-theirs', 'New In Theirs', { opacity: 0.5 }))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)
    // The new layer should be added
    const ids = result.merged.artboards[0]!.layers.map((l) => l.id)
    expect(ids).toContain('l-new-theirs')
  })
})

describe('mergeDocuments - both made same change', () => {
  test('both ours and theirs make identical change -> no conflict', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'Same', { opacity: 1 }))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(theirs.artboards[0]!.layers[0] as VectorLayer).opacity = 0.5

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(ours.artboards[0]!.layers[0] as VectorLayer).opacity = 0.5

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards[0]!.layers[0]!.opacity).toBe(0.5)
  })
})

describe('mergeDocuments - only ours changed', () => {
  test('only ours modifies layer, theirs unchanged -> ours kept', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('l1', 'OursOnly', { opacity: 1 }))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ;(ours.artboards[0]!.layers[0] as VectorLayer).opacity = 0.3

    const result = mergeDocuments(base, theirs, ours)
    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards[0]!.layers[0]!.opacity).toBe(0.3)
  })
})

describe('diffDocuments - artboard diff', () => {
  test('detects removed artboards', () => {
    const docA = createTestDocument()
    docA.artboards.push({
      id: 'extra-ab',
      name: 'Extra',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#fff',
      layers: [],
    })

    const docB = createTestDocument()

    const diff = diffDocuments(docA, docB)
    expect(diff.removedArtboards).toHaveLength(1)
    expect(diff.removedArtboards[0]!.id).toBe('extra-ab')
  })
})

describe('mergeDocuments - artboard added only in theirs', () => {
  test('artboard added in theirs but not ours -> included in merge', () => {
    const base = createTestDocument()

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards.push({
      id: 'theirs-new-ab',
      name: 'Theirs New AB',
      x: 2000,
      y: 0,
      width: 600,
      height: 400,
      backgroundColor: '#fff',
      layers: [],
    })

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)
    expect(result.merged.artboards.some((a) => a.id === 'theirs-new-ab')).toBe(true)
  })
})
