/**
 * Automatic version snapshots with delta compression.
 *
 * Features:
 * - Create named snapshots of document state
 * - List/restore snapshots
 * - Auto-save at configurable intervals
 * - Delta compression for space-efficient storage
 *
 * @module collab/version-history
 */

import { v4 as uuid } from 'uuid'

// ── Types ──

export interface VersionSnapshot {
  id: string
  name: string
  timestamp: number
  /** Full serialized document state */
  data: Uint8Array
  /** Optional thumbnail URL for UI display */
  thumbnailUrl?: string
  /** Parent snapshot ID (for delta chain) */
  parentId?: string
}

// ── In-memory snapshot store ──

const snapshots: VersionSnapshot[] = []

/** Create a new snapshot from a document data blob. */
export function createSnapshot(data: Uint8Array, name?: string): VersionSnapshot {
  const snapshot: VersionSnapshot = {
    id: uuid(),
    name: name ?? `Snapshot ${snapshots.length + 1}`,
    timestamp: Date.now(),
    data: new Uint8Array(data),
    parentId: snapshots.length > 0 ? snapshots[snapshots.length - 1]!.id : undefined,
  }
  snapshots.push(snapshot)
  return snapshot
}

/** List all snapshots, ordered by timestamp ascending. */
export function listSnapshots(): VersionSnapshot[] {
  return [...snapshots].sort((a, b) => a.timestamp - b.timestamp)
}

/** Get a snapshot by ID. */
export function getSnapshotById(id: string): VersionSnapshot | undefined {
  return snapshots.find((s) => s.id === id)
}

/**
 * Restore a snapshot by ID.
 * Returns the snapshot's data if found, or null.
 */
export function restoreSnapshot(id: string): Uint8Array | null {
  const snapshot = snapshots.find((s) => s.id === id)
  if (!snapshot) return null
  return new Uint8Array(snapshot.data)
}

/** Delete a snapshot by ID. Returns true if found and deleted. */
export function deleteSnapshot(id: string): boolean {
  const idx = snapshots.findIndex((s) => s.id === id)
  if (idx === -1) return false
  snapshots.splice(idx, 1)
  return true
}

/** Clear all snapshots (for testing). */
export function clearSnapshots(): void {
  snapshots.length = 0
}

// ── Auto-save ──

let autoSaveTimer: ReturnType<typeof setInterval> | null = null
let autoSaveCallback: (() => Uint8Array) | null = null

/**
 * Start auto-saving snapshots at the given interval.
 * The callback should return the current document data as Uint8Array.
 */
export function autoSave(getDocData: () => Uint8Array, intervalMs: number): void {
  stopAutoSave()
  autoSaveCallback = getDocData
  autoSaveTimer = setInterval(() => {
    if (autoSaveCallback) {
      const data = autoSaveCallback()
      createSnapshot(data, `Auto-save`)
    }
  }, intervalMs)
}

/** Stop the auto-save timer. */
export function stopAutoSave(): void {
  if (autoSaveTimer !== null) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
  autoSaveCallback = null
}

/** Check if auto-save is currently running. */
export function isAutoSaveRunning(): boolean {
  return autoSaveTimer !== null
}

// ── Delta compression ──

/**
 * Compute a delta between two Uint8Arrays.
 * Uses a simple XOR-based scheme: stores only the differences.
 * The delta format is:
 *   - 4 bytes: base length (uint32 LE)
 *   - 4 bytes: curr length (uint32 LE)
 *   - Then for each changed region: [offset (4 bytes), length (4 bytes), ...data]
 *   - Sentinel: offset = 0xFFFFFFFF
 */
export function computeDelta(prev: Uint8Array, curr: Uint8Array): Uint8Array {
  const regions: Array<{ offset: number; data: Uint8Array }> = []
  const maxLen = Math.max(prev.length, curr.length)

  let i = 0
  while (i < maxLen) {
    // Skip matching bytes
    while (i < maxLen && i < prev.length && i < curr.length && prev[i] === curr[i]) {
      i++
    }
    if (i >= maxLen) break

    // Found a difference — collect the changed region
    const start = i
    while (i < maxLen && (i >= prev.length || i >= curr.length || prev[i] !== curr[i])) {
      i++
    }
    // Region from start to i contains differences
    const data = curr.slice(start, Math.min(i, curr.length))
    regions.push({ offset: start, data })
  }

  // Calculate total size: 8 (header) + regions * (8 + data.length) + 4 (sentinel)
  let totalSize = 8 + 4 // header + sentinel
  for (const r of regions) {
    totalSize += 8 + r.data.length
  }

  const result = new Uint8Array(totalSize)
  const view = new DataView(result.buffer)
  let pos = 0

  // Header
  view.setUint32(pos, prev.length, true)
  pos += 4
  view.setUint32(pos, curr.length, true)
  pos += 4

  // Regions
  for (const r of regions) {
    view.setUint32(pos, r.offset, true)
    pos += 4
    view.setUint32(pos, r.data.length, true)
    pos += 4
    result.set(r.data, pos)
    pos += r.data.length
  }

  // Sentinel
  view.setUint32(pos, 0xffffffff, true)

  return result
}

/**
 * Apply a delta to a base Uint8Array to reconstruct the target.
 */
export function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  const view = new DataView(delta.buffer, delta.byteOffset, delta.byteLength)
  let pos = 0

  // Skip base length (used only for format validation)
  pos += 4
  const currLen = view.getUint32(pos, true)
  pos += 4

  // Start with a copy of base, extended or truncated to currLen
  const result = new Uint8Array(currLen)
  result.set(base.subarray(0, Math.min(base.length, currLen)))

  // Apply each changed region
  while (pos < delta.length) {
    const offset = view.getUint32(pos, true)
    pos += 4
    if (offset === 0xffffffff) break // sentinel

    const length = view.getUint32(pos, true)
    pos += 4

    const data = delta.subarray(pos, pos + length)
    result.set(data, offset)
    pos += length
  }

  return result
}
