import { v4 as uuid } from 'uuid'
import type { DesignDocument, Artboard, Layer, GroupLayer } from '@/types'

// ── Interfaces ──

export interface VersionSnapshot {
  id: string
  name: string
  description: string
  timestamp: string // ISO 8601
  documentData: string // JSON-serialized DesignDocument
  parentId?: string
  branchName: string
}

export interface VersionBranch {
  name: string
  headSnapshotId: string
  createdAt: string
}

export interface LayerDiff {
  layerId: string
  layerName: string
  artboardId: string
  before: Layer
  after: Layer
}

export interface VersionDiff {
  addedLayers: { layer: Layer; artboardId: string }[]
  removedLayers: { layer: Layer; artboardId: string }[]
  modifiedLayers: LayerDiff[]
  addedArtboards: Artboard[]
  removedArtboards: Artboard[]
}

export interface MergeConflict {
  layerId: string
  layerName: string
  artboardId: string
  oursValue: Layer
  theirsValue: Layer
  resolution?: 'ours' | 'theirs'
}

// ── IndexedDB wrapper ──

const DB_NAME = 'crossdraw-versions'
const DB_VERSION = 1
const SNAPSHOTS_STORE = 'snapshots'
const BRANCHES_STORE = 'branches'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const store = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' })
        store.createIndex('docId', 'docId', { unique: false })
        store.createIndex('branchName', 'branchName', { unique: false })
      }
      if (!db.objectStoreNames.contains(BRANCHES_STORE)) {
        const store = db.createObjectStore(BRANCHES_STORE, { keyPath: 'key' })
        store.createIndex('docId', 'docId', { unique: false })
      }
    }
  })
}

interface StoredSnapshot extends VersionSnapshot {
  docId: string
}

interface StoredBranch extends VersionBranch {
  key: string // `${docId}:${name}`
  docId: string
}

// ── Snapshot CRUD ──

export async function createSnapshot(
  doc: DesignDocument,
  name: string,
  branchName: string,
  description = '',
  parentId?: string,
): Promise<VersionSnapshot> {
  const snapshot: VersionSnapshot = {
    id: uuid(),
    name,
    description,
    timestamp: new Date().toISOString(),
    documentData: JSON.stringify(doc),
    parentId,
    branchName,
  }

  const db = await openDB()
  const tx = db.transaction([SNAPSHOTS_STORE, BRANCHES_STORE], 'readwrite')

  const stored: StoredSnapshot = { ...snapshot, docId: doc.id }
  tx.objectStore(SNAPSHOTS_STORE).put(stored)

  // Update branch head
  const branchKey = `${doc.id}:${branchName}`
  const branch: StoredBranch = {
    key: branchKey,
    docId: doc.id,
    name: branchName,
    headSnapshotId: snapshot.id,
    createdAt: new Date().toISOString(),
  }
  // Only update createdAt if this is a new branch
  const existingReq = tx.objectStore(BRANCHES_STORE).get(branchKey)
  existingReq.onsuccess = () => {
    const existing = existingReq.result as StoredBranch | undefined
    if (existing) {
      branch.createdAt = existing.createdAt
    }
    tx.objectStore(BRANCHES_STORE).put(branch)
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
  return snapshot
}

export async function listSnapshots(docId: string): Promise<VersionSnapshot[]> {
  const db = await openDB()
  const tx = db.transaction(SNAPSHOTS_STORE, 'readonly')
  const index = tx.objectStore(SNAPSHOTS_STORE).index('docId')
  const request = index.getAll(docId)

  const results = await new Promise<StoredSnapshot[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredSnapshot[])
    request.onerror = () => reject(request.error)
  })

  db.close()
  return results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export async function getSnapshot(id: string): Promise<VersionSnapshot | undefined> {
  const db = await openDB()
  const tx = db.transaction(SNAPSHOTS_STORE, 'readonly')
  const request = tx.objectStore(SNAPSHOTS_STORE).get(id)

  const result = await new Promise<StoredSnapshot | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredSnapshot | undefined)
    request.onerror = () => reject(request.error)
  })

  db.close()
  return result
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite')
  tx.objectStore(SNAPSHOTS_STORE).delete(id)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
}

// ── Branch CRUD ──

export async function createBranch(docId: string, name: string, fromSnapshotId: string): Promise<VersionBranch> {
  const branch: VersionBranch = {
    name,
    headSnapshotId: fromSnapshotId,
    createdAt: new Date().toISOString(),
  }

  const db = await openDB()
  const tx = db.transaction(BRANCHES_STORE, 'readwrite')
  const stored: StoredBranch = {
    key: `${docId}:${name}`,
    docId,
    ...branch,
  }
  tx.objectStore(BRANCHES_STORE).put(stored)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
  return branch
}

export async function listBranches(docId: string): Promise<VersionBranch[]> {
  const db = await openDB()
  const tx = db.transaction(BRANCHES_STORE, 'readonly')
  const index = tx.objectStore(BRANCHES_STORE).index('docId')
  const request = index.getAll(docId)

  const results = await new Promise<StoredBranch[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredBranch[])
    request.onerror = () => reject(request.error)
  })

  db.close()
  return results
}

export async function deleteBranch(docId: string, name: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(BRANCHES_STORE, 'readwrite')
  tx.objectStore(BRANCHES_STORE).delete(`${docId}:${name}`)

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  db.close()
}

// ── Diff ──

/** Collect all layers from a document's artboards, mapped by layer ID to { layer, artboardId }. */
function collectAllLayers(doc: DesignDocument): Map<string, { layer: Layer; artboardId: string }> {
  const map = new Map<string, { layer: Layer; artboardId: string }>()

  function walkLayers(layers: Layer[], artboardId: string) {
    for (const layer of layers) {
      map.set(layer.id, { layer, artboardId })
      if (layer.type === 'group') {
        walkLayers((layer as GroupLayer).children, artboardId)
      }
    }
  }

  for (const artboard of doc.artboards) {
    walkLayers(artboard.layers, artboard.id)
  }

  return map
}

/** Deep equality check for layers (serialized comparison). */
function layersEqual(a: Layer, b: Layer): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function diffSnapshots(snapshotA: VersionSnapshot, snapshotB: VersionSnapshot): VersionDiff {
  const docA = JSON.parse(snapshotA.documentData) as DesignDocument
  const docB = JSON.parse(snapshotB.documentData) as DesignDocument

  return diffDocuments(docA, docB)
}

export function diffDocuments(docA: DesignDocument, docB: DesignDocument): VersionDiff {
  const layersA = collectAllLayers(docA)
  const layersB = collectAllLayers(docB)

  const artboardsA = new Map(docA.artboards.map((a) => [a.id, a]))
  const artboardsB = new Map(docB.artboards.map((a) => [a.id, a]))

  // Added/removed artboards
  const addedArtboards: Artboard[] = []
  const removedArtboards: Artboard[] = []

  for (const [id, artboard] of artboardsB) {
    if (!artboardsA.has(id)) {
      addedArtboards.push(artboard)
    }
  }
  for (const [id, artboard] of artboardsA) {
    if (!artboardsB.has(id)) {
      removedArtboards.push(artboard)
    }
  }

  // Added/removed/modified layers
  const addedLayers: { layer: Layer; artboardId: string }[] = []
  const removedLayers: { layer: Layer; artboardId: string }[] = []
  const modifiedLayers: LayerDiff[] = []

  for (const [id, entryB] of layersB) {
    const entryA = layersA.get(id)
    if (!entryA) {
      addedLayers.push({ layer: entryB.layer, artboardId: entryB.artboardId })
    } else if (!layersEqual(entryA.layer, entryB.layer)) {
      modifiedLayers.push({
        layerId: id,
        layerName: entryB.layer.name,
        artboardId: entryB.artboardId,
        before: entryA.layer,
        after: entryB.layer,
      })
    }
  }

  for (const [id, entryA] of layersA) {
    if (!layersB.has(id)) {
      removedLayers.push({ layer: entryA.layer, artboardId: entryA.artboardId })
    }
  }

  return { addedLayers, removedLayers, modifiedLayers, addedArtboards, removedArtboards }
}

// ── Three-way merge ──

export function mergeSnapshots(
  base: VersionSnapshot,
  theirs: VersionSnapshot,
  ours: VersionSnapshot,
): { merged: DesignDocument; conflicts: MergeConflict[] } {
  const baseDoc = JSON.parse(base.documentData) as DesignDocument
  const theirsDoc = JSON.parse(theirs.documentData) as DesignDocument
  const oursDoc = JSON.parse(ours.documentData) as DesignDocument

  return mergeDocuments(baseDoc, theirsDoc, oursDoc)
}

export function mergeDocuments(
  baseDoc: DesignDocument,
  theirsDoc: DesignDocument,
  oursDoc: DesignDocument,
): { merged: DesignDocument; conflicts: MergeConflict[] } {
  const baseLayers = collectAllLayers(baseDoc)
  const theirsLayers = collectAllLayers(theirsDoc)
  const oursLayers = collectAllLayers(oursDoc)

  const conflicts: MergeConflict[] = []

  // Start from our document as the base for the merge result
  const merged = JSON.parse(JSON.stringify(oursDoc)) as DesignDocument

  // Identify layers that changed in theirs relative to base
  for (const [id, theirsEntry] of theirsLayers) {
    const baseEntry = baseLayers.get(id)
    const oursEntry = oursLayers.get(id)

    if (!baseEntry) {
      // Added in theirs — add to merged if not already present in ours
      if (!oursEntry) {
        // Find the target artboard in merged
        const targetArtboard = merged.artboards.find((a) => a.id === theirsEntry.artboardId)
        if (targetArtboard) {
          targetArtboard.layers.push(JSON.parse(JSON.stringify(theirsEntry.layer)) as Layer)
        }
      }
      continue
    }

    if (!oursEntry) {
      // Layer was deleted in ours but modified in theirs — conflict
      if (!layersEqual(baseEntry.layer, theirsEntry.layer)) {
        conflicts.push({
          layerId: id,
          layerName: theirsEntry.layer.name,
          artboardId: theirsEntry.artboardId,
          oursValue: baseEntry.layer, // was deleted in ours
          theirsValue: theirsEntry.layer,
        })
      }
      continue
    }

    const theirsChanged = !layersEqual(baseEntry.layer, theirsEntry.layer)
    const oursChanged = !layersEqual(baseEntry.layer, oursEntry.layer)

    if (theirsChanged && oursChanged) {
      // Both modified — check if they're the same modification
      if (!layersEqual(theirsEntry.layer, oursEntry.layer)) {
        conflicts.push({
          layerId: id,
          layerName: oursEntry.layer.name,
          artboardId: oursEntry.artboardId,
          oursValue: oursEntry.layer,
          theirsValue: theirsEntry.layer,
        })
      }
      // If both made same change, no conflict, ours already has it
    } else if (theirsChanged && !oursChanged) {
      // Only theirs changed — apply their change to merged
      applyLayerToMerged(merged, id, theirsEntry.layer, theirsEntry.artboardId)
    }
    // If only ours changed, merged already has our version
  }

  // Handle artboards added in theirs
  const baseArtboardIds = new Set(baseDoc.artboards.map((a) => a.id))
  const oursArtboardIds = new Set(oursDoc.artboards.map((a) => a.id))

  for (const artboard of theirsDoc.artboards) {
    if (!baseArtboardIds.has(artboard.id) && !oursArtboardIds.has(artboard.id)) {
      merged.artboards.push(JSON.parse(JSON.stringify(artboard)) as Artboard)
    }
  }

  // Handle layers deleted in theirs but not in ours
  for (const [id, baseEntry] of baseLayers) {
    const theirsEntry = theirsLayers.get(id)
    const oursEntry = oursLayers.get(id)

    if (!theirsEntry && oursEntry) {
      // Deleted in theirs — if ours didn't modify, delete from merged
      if (layersEqual(baseEntry.layer, oursEntry.layer)) {
        removeLayerFromMerged(merged, id)
      }
      // If ours modified, keep ours (no conflict — they deleted, we modified)
    }
  }

  return { merged, conflicts }
}

/** Replace a specific layer in the merged document. */
function applyLayerToMerged(doc: DesignDocument, layerId: string, newLayer: Layer, artboardId: string): void {
  for (const artboard of doc.artboards) {
    if (replaceLayerInList(artboard.layers, layerId, newLayer)) {
      return
    }
  }
  // If layer not found in current artboards, try adding to the specified artboard
  const targetArtboard = doc.artboards.find((a) => a.id === artboardId)
  if (targetArtboard) {
    targetArtboard.layers.push(JSON.parse(JSON.stringify(newLayer)) as Layer)
  }
}

function replaceLayerInList(layers: Layer[], layerId: string, newLayer: Layer): boolean {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]!.id === layerId) {
      layers[i] = JSON.parse(JSON.stringify(newLayer)) as Layer
      return true
    }
    const layer = layers[i]!
    if (layer.type === 'group') {
      if (replaceLayerInList((layer as GroupLayer).children, layerId, newLayer)) {
        return true
      }
    }
  }
  return false
}

/** Remove a layer from the merged document. */
function removeLayerFromMerged(doc: DesignDocument, layerId: string): void {
  for (const artboard of doc.artboards) {
    if (removeLayerFromList(artboard.layers, layerId)) {
      return
    }
  }
}

function removeLayerFromList(layers: Layer[], layerId: string): boolean {
  const idx = layers.findIndex((l) => l.id === layerId)
  if (idx >= 0) {
    layers.splice(idx, 1)
    return true
  }
  for (const layer of layers) {
    if (layer.type === 'group') {
      if (removeLayerFromList((layer as GroupLayer).children, layerId)) {
        return true
      }
    }
  }
  return false
}
