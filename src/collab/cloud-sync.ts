/**
 * Cloud storage sync for collaborative documents.
 *
 * Features:
 * - Upload/download documents to cloud storage
 * - Track sync status (synced/syncing/conflict/offline)
 * - Conflict resolution strategies (local/remote/merge)
 *
 * @module collab/cloud-sync
 */

// ── Types ──

export type CloudSyncStatus = 'synced' | 'syncing' | 'conflict' | 'offline'

export interface CloudSyncState {
  status: CloudSyncStatus
  lastSync: number
  /** Remote document version hash, for conflict detection */
  remoteHash: string
  /** Local document version hash */
  localHash: string
  /** Document ID in cloud storage */
  cloudDocId: string | null
}

export type ConflictStrategy = 'local' | 'remote' | 'merge'

export interface CloudSyncAdapter {
  upload(docId: string, data: Uint8Array): Promise<{ hash: string }>
  download(docId: string): Promise<{ data: Uint8Array; hash: string }>
  getRemoteHash(docId: string): Promise<string>
}

// ── State ──

let syncState: CloudSyncState = {
  status: 'offline',
  lastSync: 0,
  remoteHash: '',
  localHash: '',
  cloudDocId: null,
}

let adapter: CloudSyncAdapter | null = null
let stateChangeCallbacks: Array<(state: CloudSyncState) => void> = []

/** Get the current sync state. */
export function getSyncState(): CloudSyncState {
  return { ...syncState }
}

/** Set the cloud sync adapter (the transport layer). */
export function setCloudSyncAdapter(a: CloudSyncAdapter | null): void {
  adapter = a
}

/** Register a callback for sync state changes. Returns an unsubscribe function. */
export function onSyncStateChange(callback: (state: CloudSyncState) => void): () => void {
  stateChangeCallbacks.push(callback)
  return () => {
    const idx = stateChangeCallbacks.indexOf(callback)
    if (idx !== -1) stateChangeCallbacks.splice(idx, 1)
  }
}

// ── Hash utility ──

/**
 * Simple hash function for Uint8Array data.
 * Uses DJB2 algorithm — fast, deterministic, good enough for change detection.
 */
export function computeHash(data: Uint8Array): string {
  let hash = 5381
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash + data[i]!) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ── Sync operations ──

function updateState(partial: Partial<CloudSyncState>): void {
  syncState = { ...syncState, ...partial }
  for (const cb of stateChangeCallbacks) {
    cb({ ...syncState })
  }
}

/**
 * Upload the local document to cloud storage.
 * Returns the remote hash on success.
 */
export async function uploadDocument(cloudDocId: string, data: Uint8Array): Promise<string> {
  if (!adapter) throw new Error('No cloud sync adapter configured')

  updateState({ status: 'syncing', cloudDocId })

  try {
    const result = await adapter.upload(cloudDocId, data)
    const localHash = computeHash(data)
    updateState({
      status: 'synced',
      lastSync: Date.now(),
      remoteHash: result.hash,
      localHash,
    })
    return result.hash
  } catch (err) {
    updateState({ status: 'offline' })
    throw err
  }
}

/**
 * Download a document from cloud storage.
 * Returns the document data.
 */
export async function downloadDocument(cloudDocId: string): Promise<Uint8Array> {
  if (!adapter) throw new Error('No cloud sync adapter configured')

  updateState({ status: 'syncing', cloudDocId })

  try {
    const result = await adapter.download(cloudDocId)
    const localHash = computeHash(result.data)
    updateState({
      status: 'synced',
      lastSync: Date.now(),
      remoteHash: result.hash,
      localHash,
      cloudDocId,
    })
    return result.data
  } catch (err) {
    updateState({ status: 'offline' })
    throw err
  }
}

/**
 * Sync the local document with cloud storage.
 * Detects conflicts by comparing hashes.
 *
 * Returns:
 * - 'synced' if no changes needed
 * - 'uploaded' if local was pushed
 * - 'conflict' if both sides changed
 */
export async function syncDocument(
  cloudDocId: string,
  localData: Uint8Array,
): Promise<'synced' | 'uploaded' | 'conflict'> {
  if (!adapter) throw new Error('No cloud sync adapter configured')

  updateState({ status: 'syncing', cloudDocId })

  try {
    const localHash = computeHash(localData)
    const remoteHash = await adapter.getRemoteHash(cloudDocId)

    // If local matches remote, we're in sync
    if (localHash === remoteHash) {
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash,
        localHash,
      })
      return 'synced'
    }

    // If remote hasn't changed since last sync, upload local
    if (remoteHash === syncState.remoteHash) {
      const result = await adapter.upload(cloudDocId, localData)
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash: result.hash,
        localHash,
      })
      return 'uploaded'
    }

    // If local hasn't changed since last sync, download remote
    if (localHash === syncState.localHash) {
      const result = await adapter.download(cloudDocId)
      const newLocalHash = computeHash(result.data)
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash: result.hash,
        localHash: newLocalHash,
      })
      return 'synced'
    }

    // Both sides changed — conflict
    updateState({
      status: 'conflict',
      remoteHash,
      localHash,
    })
    return 'conflict'
  } catch (err) {
    updateState({ status: 'offline' })
    throw err
  }
}

/**
 * Resolve a conflict using the specified strategy.
 */
export async function resolveConflict(
  cloudDocId: string,
  strategy: ConflictStrategy,
  localData: Uint8Array,
  mergedData?: Uint8Array,
): Promise<Uint8Array> {
  if (!adapter) throw new Error('No cloud sync adapter configured')

  switch (strategy) {
    case 'local': {
      // Push local version to remote
      const result = await adapter.upload(cloudDocId, localData)
      const localHash = computeHash(localData)
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash: result.hash,
        localHash,
      })
      return localData
    }

    case 'remote': {
      // Pull remote version
      const result = await adapter.download(cloudDocId)
      const localHash = computeHash(result.data)
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash: result.hash,
        localHash,
      })
      return result.data
    }

    case 'merge': {
      // Use the provided merged data
      if (!mergedData) {
        throw new Error('mergedData is required for merge strategy')
      }
      const result = await adapter.upload(cloudDocId, mergedData)
      const localHash = computeHash(mergedData)
      updateState({
        status: 'synced',
        lastSync: Date.now(),
        remoteHash: result.hash,
        localHash,
      })
      return mergedData
    }
  }
}

/** Reset sync state (for testing). */
export function resetSyncState(): void {
  syncState = {
    status: 'offline',
    lastSync: 0,
    remoteHash: '',
    localHash: '',
    cloudDocId: null,
  }
  adapter = null
  stateChangeCallbacks = []
}
