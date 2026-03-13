/**
 * CRDT Document wrapper for conflict-free collaborative sync.
 *
 * Uses a last-writer-wins (LWW) register per document path for conflict resolution.
 * Operations are timestamped and client IDs break ties deterministically.
 *
 * @module collab/crdt-doc
 */

import { v4 as uuid } from 'uuid'

// ── Types ──

export interface CRDTOperation {
  id: string
  clientId: string
  timestamp: number
  type: 'insert' | 'update' | 'delete'
  /** Path in the document tree, e.g. ['artboards', '0', 'layers', '2', 'opacity'] */
  path: string[]
  /** Payload value for insert/update operations */
  value?: unknown
}

export interface CRDTDocument {
  clientId: string
  version: number
  operations: CRDTOperation[]
}

// ── Factory ──

/** Create a new CRDT document for the given client. */
export function createCRDTDoc(clientId: string): CRDTDocument {
  return {
    clientId,
    version: 0,
    operations: [],
  }
}

// ── Operation factory ──

/** Create a new CRDT operation (does not apply it). */
export function createOperation(
  clientId: string,
  type: CRDTOperation['type'],
  path: string[],
  value?: unknown,
): CRDTOperation {
  return {
    id: uuid(),
    clientId,
    timestamp: Date.now(),
    type,
    path,
    value,
  }
}

// ── Local operations ──

/**
 * Apply a local operation to a CRDT document.
 * Returns a new document (immutable update).
 */
export function applyLocalOperation(doc: CRDTDocument, op: CRDTOperation): CRDTDocument {
  return {
    ...doc,
    version: doc.version + 1,
    operations: [...doc.operations, op],
  }
}

// ── Remote merge ──

/**
 * Last-writer-wins comparison for two operations targeting the same path.
 * Returns true if `incoming` wins over `existing`.
 * Ties are broken by lexicographic clientId comparison (higher clientId wins).
 */
function lwwWins(incoming: CRDTOperation, existing: CRDTOperation): boolean {
  if (incoming.timestamp > existing.timestamp) return true
  if (incoming.timestamp < existing.timestamp) return false
  return incoming.clientId > existing.clientId
}

/**
 * Merge a batch of remote operations into the local CRDT document.
 * Uses last-writer-wins per path to resolve conflicts.
 * Returns a new document with accepted remote operations merged in.
 */
export function mergeRemoteOperations(doc: CRDTDocument, remoteOps: CRDTOperation[]): CRDTDocument {
  // Index existing operations by path key for LWW checks
  const latestByPath = new Map<string, CRDTOperation>()
  for (const op of doc.operations) {
    const key = pathKey(op)
    const existing = latestByPath.get(key)
    if (!existing || lwwWins(op, existing)) {
      latestByPath.set(key, op)
    }
  }

  const accepted: CRDTOperation[] = []

  for (const remoteOp of remoteOps) {
    // Skip operations we already have
    if (doc.operations.some((o) => o.id === remoteOp.id)) continue

    const key = pathKey(remoteOp)
    const existing = latestByPath.get(key)

    if (!existing || lwwWins(remoteOp, existing)) {
      latestByPath.set(key, remoteOp)
      accepted.push(remoteOp)
    }
    // If existing wins, discard the remote op
  }

  if (accepted.length === 0) return doc

  return {
    ...doc,
    version: doc.version + accepted.length,
    operations: [...doc.operations, ...accepted],
  }
}

// ── State reconstruction ──

/**
 * Reconstruct the document state by replaying all operations.
 * Returns a plain object tree built from insert/update/delete ops.
 */
export function getDocumentState(doc: CRDTDocument): Record<string, unknown> {
  // Build effective operations: keep only the latest per path
  const effective = new Map<string, CRDTOperation>()
  for (const op of doc.operations) {
    const key = pathKey(op)
    const existing = effective.get(key)
    if (!existing || lwwWins(op, existing)) {
      effective.set(key, op)
    }
  }

  // Sort by timestamp then clientId for deterministic replay
  const sorted = Array.from(effective.values()).sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0
  })

  const state: Record<string, unknown> = {}

  for (const op of sorted) {
    switch (op.type) {
      case 'insert':
      case 'update':
        setNestedValue(state, op.path, op.value)
        break
      case 'delete':
        deleteNestedValue(state, op.path)
        break
    }
  }

  return state
}

// ── Utilities ──

/** Get a summary of operations by type */
export function getOperationCounts(doc: CRDTDocument): { insert: number; update: number; delete: number } {
  const counts = { insert: 0, update: 0, delete: 0 }
  for (const op of doc.operations) {
    counts[op.type]++
  }
  return counts
}

/** Get all unique client IDs that have contributed operations */
export function getContributors(doc: CRDTDocument): string[] {
  const ids = new Set<string>()
  for (const op of doc.operations) {
    ids.add(op.clientId)
  }
  return Array.from(ids)
}

// ── Private helpers ──

function pathKey(op: CRDTOperation): string {
  return `${op.type === 'delete' ? 'delete' : 'set'}:${op.path.join('/')}`
}

function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return

  let current: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }

  current[path[path.length - 1]!] = value
}

function deleteNestedValue(obj: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return

  let current: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    if (current[key] == null || typeof current[key] !== 'object') return
    current = current[key] as Record<string, unknown>
  }

  delete current[path[path.length - 1]!]
}
