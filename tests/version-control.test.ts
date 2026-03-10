import { describe, it, expect } from 'vitest'
import {
  diffDocuments,
  mergeDocuments,
  type VersionSnapshot,
  diffSnapshots,
  mergeSnapshots,
} from '@/versioning/version-store'
import type { DesignDocument, VectorLayer } from '@/types'

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
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
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

// ── Tests ──

describe('diffDocuments', () => {
  it('identifies added layers', () => {
    const docA = createTestDocument()
    const docB = createTestDocument()
    const layer = createVectorLayer('layer-new', 'New Layer')
    docB.artboards[0]!.layers.push(layer)

    const diff = diffDocuments(docA, docB)

    expect(diff.addedLayers).toHaveLength(1)
    expect(diff.addedLayers[0]!.layer.id).toBe('layer-new')
    expect(diff.addedLayers[0]!.layer.name).toBe('New Layer')
    expect(diff.removedLayers).toHaveLength(0)
    expect(diff.modifiedLayers).toHaveLength(0)
  })

  it('identifies removed layers', () => {
    const layer = createVectorLayer('layer-old', 'Old Layer')
    const docA = createTestDocument()
    docA.artboards[0]!.layers.push(layer)
    const docB = createTestDocument()

    const diff = diffDocuments(docA, docB)

    expect(diff.removedLayers).toHaveLength(1)
    expect(diff.removedLayers[0]!.layer.id).toBe('layer-old')
    expect(diff.addedLayers).toHaveLength(0)
    expect(diff.modifiedLayers).toHaveLength(0)
  })

  it('identifies modified layers', () => {
    const layerBefore = createVectorLayer('layer-1', 'My Layer', { opacity: 1 })
    const layerAfter = createVectorLayer('layer-1', 'My Layer', { opacity: 0.5 })

    const docA = createTestDocument()
    docA.artboards[0]!.layers.push(layerBefore)
    const docB = createTestDocument()
    docB.artboards[0]!.layers.push(layerAfter)

    const diff = diffDocuments(docA, docB)

    expect(diff.modifiedLayers).toHaveLength(1)
    expect(diff.modifiedLayers[0]!.layerId).toBe('layer-1')
    expect(diff.modifiedLayers[0]!.layerName).toBe('My Layer')
    expect((diff.modifiedLayers[0]!.before as VectorLayer).opacity).toBe(1)
    expect((diff.modifiedLayers[0]!.after as VectorLayer).opacity).toBe(0.5)
    expect(diff.addedLayers).toHaveLength(0)
    expect(diff.removedLayers).toHaveLength(0)
  })

  it('identifies added artboards', () => {
    const docA = createTestDocument()
    const docB = createTestDocument()
    docB.artboards.push({
      id: 'artboard-new',
      name: 'New Artboard',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#eeeeee',
      layers: [],
    })

    const diff = diffDocuments(docA, docB)

    expect(diff.addedArtboards).toHaveLength(1)
    expect(diff.addedArtboards[0]!.id).toBe('artboard-new')
    expect(diff.removedArtboards).toHaveLength(0)
  })

  it('identifies removed artboards', () => {
    const docA = createTestDocument()
    docA.artboards.push({
      id: 'artboard-extra',
      name: 'Extra Artboard',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#eeeeee',
      layers: [],
    })
    const docB = createTestDocument()

    const diff = diffDocuments(docA, docB)

    expect(diff.removedArtboards).toHaveLength(1)
    expect(diff.removedArtboards[0]!.id).toBe('artboard-extra')
    expect(diff.addedArtboards).toHaveLength(0)
  })

  it('reports no changes for identical documents', () => {
    const layer = createVectorLayer('layer-1', 'Unchanged')
    const docA = createTestDocument()
    docA.artboards[0]!.layers.push(layer)
    const docB = JSON.parse(JSON.stringify(docA)) as DesignDocument

    const diff = diffDocuments(docA, docB)

    expect(diff.addedLayers).toHaveLength(0)
    expect(diff.removedLayers).toHaveLength(0)
    expect(diff.modifiedLayers).toHaveLength(0)
    expect(diff.addedArtboards).toHaveLength(0)
    expect(diff.removedArtboards).toHaveLength(0)
  })

  it('handles multiple simultaneous changes', () => {
    const docA = createTestDocument()
    docA.artboards[0]!.layers.push(
      createVectorLayer('layer-1', 'Keep Same'),
      createVectorLayer('layer-2', 'Will Modify', { opacity: 1 }),
      createVectorLayer('layer-3', 'Will Remove'),
    )

    const docB = createTestDocument()
    docB.artboards[0]!.layers.push(
      createVectorLayer('layer-1', 'Keep Same'),
      createVectorLayer('layer-2', 'Will Modify', { opacity: 0.3 }),
      createVectorLayer('layer-4', 'Newly Added'),
    )

    const diff = diffDocuments(docA, docB)

    expect(diff.addedLayers).toHaveLength(1)
    expect(diff.addedLayers[0]!.layer.id).toBe('layer-4')
    expect(diff.removedLayers).toHaveLength(1)
    expect(diff.removedLayers[0]!.layer.id).toBe('layer-3')
    expect(diff.modifiedLayers).toHaveLength(1)
    expect(diff.modifiedLayers[0]!.layerId).toBe('layer-2')
  })
})

describe('diffSnapshots', () => {
  it('computes diff from serialized snapshot data', () => {
    const docA = createTestDocument()
    docA.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Original'))
    const docB = createTestDocument()
    docB.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Original'), createVectorLayer('layer-2', 'Added'))

    const snapA = makeSnapshot(docA, 'v1')
    const snapB = makeSnapshot(docB, 'v2')

    const diff = diffSnapshots(snapA, snapB)

    expect(diff.addedLayers).toHaveLength(1)
    expect(diff.addedLayers[0]!.layer.id).toBe('layer-2')
    expect(diff.removedLayers).toHaveLength(0)
    expect(diff.modifiedLayers).toHaveLength(0)
  })
})

describe('mergeDocuments', () => {
  it('merges non-conflicting changes from both sides', () => {
    // Base: one layer
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Base Layer'))

    // Theirs: added a new layer
    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers.push(createVectorLayer('layer-theirs', 'Their Layer'))

    // Ours: modified existing layer opacity
    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Base Layer', { opacity: 0.5 })

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    // Merged should have both changes: modified layer-1 + added layer-theirs
    const mergedLayers = result.merged.artboards[0]!.layers
    expect(mergedLayers).toHaveLength(2)

    const layer1 = mergedLayers.find((l) => l.id === 'layer-1')
    expect(layer1).toBeDefined()
    expect(layer1!.opacity).toBe(0.5) // Our modification preserved

    const layerTheirs = mergedLayers.find((l) => l.id === 'layer-theirs')
    expect(layerTheirs).toBeDefined()
    expect(layerTheirs!.name).toBe('Their Layer')
  })

  it('detects conflicts when both sides modify the same layer differently', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Shared Layer', { opacity: 1 }))

    // Theirs: change opacity to 0.3
    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Shared Layer', { opacity: 0.3 })

    // Ours: change opacity to 0.7
    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Shared Layer', { opacity: 0.7 })

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.layerId).toBe('layer-1')
    expect(result.conflicts[0]!.layerName).toBe('Shared Layer')
    expect((result.conflicts[0]!.oursValue as VectorLayer).opacity).toBe(0.7)
    expect((result.conflicts[0]!.theirsValue as VectorLayer).opacity).toBe(0.3)
  })

  it('does not conflict when both sides make the same modification', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Same Change', { opacity: 1 }))

    // Both change to same value
    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Same Change', { opacity: 0.5 })

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Same Change', { opacity: 0.5 })

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    const mergedLayer = result.merged.artboards[0]!.layers[0]!
    expect(mergedLayer.opacity).toBe(0.5)
  })

  it('handles layer added in theirs and not in ours', () => {
    const base = createTestDocument()

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers.push(createVectorLayer('layer-new', 'From Theirs'))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    const mergedLayers = result.merged.artboards[0]!.layers
    expect(mergedLayers).toHaveLength(1)
    expect(mergedLayers[0]!.id).toBe('layer-new')
  })

  it('handles layer deleted in theirs when unmodified in ours', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-del', 'Will Be Deleted'))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers = []

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards[0]!.layers).toHaveLength(0)
  })

  it('merges artboards added in theirs', () => {
    const base = createTestDocument()

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards.push({
      id: 'artboard-theirs',
      name: 'Their Artboard',
      x: 2000,
      y: 0,
      width: 800,
      height: 600,
      backgroundColor: '#f0f0f0',
      layers: [],
    })

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards).toHaveLength(2)
    expect(result.merged.artboards[1]!.id).toBe('artboard-theirs')
  })

  it('handles only-theirs modification without conflict', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Base', { opacity: 1 }))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Base', { opacity: 0.2 })

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument

    const result = mergeDocuments(base, theirs, ours)

    expect(result.conflicts).toHaveLength(0)
    const merged = result.merged.artboards[0]!.layers[0]!
    expect(merged.opacity).toBe(0.2)
  })
})

describe('mergeSnapshots', () => {
  it('works with serialized snapshot data', () => {
    const base = createTestDocument()
    base.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Layer'))

    const theirs = JSON.parse(JSON.stringify(base)) as DesignDocument
    theirs.artboards[0]!.layers.push(createVectorLayer('layer-2', 'Added in Theirs'))

    const ours = JSON.parse(JSON.stringify(base)) as DesignDocument
    ours.artboards[0]!.layers[0] = createVectorLayer('layer-1', 'Layer', { opacity: 0.5 })

    const baseSnap = makeSnapshot(base, 'base')
    const theirsSnap = makeSnapshot(theirs, 'theirs', 'feature', baseSnap.id)
    const oursSnap = makeSnapshot(ours, 'ours')

    const result = mergeSnapshots(baseSnap, theirsSnap, oursSnap)

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.artboards[0]!.layers).toHaveLength(2)
    expect(result.merged.artboards[0]!.layers[0]!.opacity).toBe(0.5)
  })
})

describe('VersionSnapshot structure', () => {
  it('snapshot roundtrips document data via JSON', () => {
    const doc = createTestDocument()
    doc.artboards[0]!.layers.push(createVectorLayer('layer-1', 'Test Layer', { opacity: 0.75 }))

    const snapshot = makeSnapshot(doc, 'test-snapshot')

    expect(snapshot.id).toBe('snap-test-snapshot')
    expect(snapshot.name).toBe('test-snapshot')
    expect(snapshot.branchName).toBe('main')

    const parsed = JSON.parse(snapshot.documentData) as DesignDocument
    expect(parsed.id).toBe('test-doc-001')
    expect(parsed.artboards[0]!.layers).toHaveLength(1)
    expect(parsed.artboards[0]!.layers[0]!.opacity).toBe(0.75)
  })

  it('snapshot preserves parent chain', () => {
    const doc = createTestDocument()

    const snap1 = makeSnapshot(doc, 'v1')
    const snap2 = makeSnapshot(doc, 'v2', 'main', snap1.id)

    expect(snap2.parentId).toBe('snap-v1')
  })
})
