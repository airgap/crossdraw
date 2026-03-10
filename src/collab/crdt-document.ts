import type { DesignDocument, Artboard, Layer } from '@/types'

// ── Collaboration Operation Types ──

export type CollabOperationType =
  | 'insert-layer'
  | 'delete-layer'
  | 'update-layer'
  | 'move-layer'
  | 'add-artboard'
  | 'delete-artboard'

export interface CollabOperation {
  id: string
  clientId: string
  timestamp: number
  type: CollabOperationType
  /** Path to the target element, e.g. ['artboards', '0', 'layers', '2'] */
  path: string[]
  /** Payload value for the operation (layer data, property updates, etc.) */
  value?: unknown
}

// ── Conflict Resolution ──

/**
 * Last-Writer-Wins comparison.
 * Returns true if `incoming` wins over `existing`.
 * Ties broken by lexicographic clientId comparison (higher clientId wins).
 */
function lwwWins(incoming: CollabOperation, existing: CollabOperation): boolean {
  if (incoming.timestamp > existing.timestamp) return true
  if (incoming.timestamp < existing.timestamp) return false
  // Tie-break: higher clientId wins
  return incoming.clientId > existing.clientId
}

// ── CRDT Document ──

export class CRDTDocument {
  private state: DesignDocument
  private pendingOps: Map<string, CollabOperation> = new Map()
  /** Track the latest operation per path key for LWW conflict resolution */
  private appliedOps: Map<string, CollabOperation> = new Map()

  constructor(initialState: DesignDocument) {
    this.state = structuredClone(initialState)
  }

  /** Apply a locally generated operation, queue it for broadcast. */
  applyLocal(operation: CollabOperation): void {
    this.applyOperation(operation)
    this.pendingOps.set(operation.id, operation)
  }

  /** Apply a remote operation with LWW conflict resolution. */
  applyRemote(operation: CollabOperation): boolean {
    const pathKey = this.getPathKey(operation)

    // Check for conflicts on the same path + property
    const existing = this.appliedOps.get(pathKey)
    if (existing && operation.type === 'update-layer' && existing.type === 'update-layer') {
      if (!lwwWins(operation, existing)) {
        // Remote op loses, don't apply
        return false
      }
    }

    this.applyOperation(operation)
    return true
  }

  /** Get all operations not yet acknowledged by the server. */
  getPendingOps(): CollabOperation[] {
    return Array.from(this.pendingOps.values())
  }

  /** Mark an operation as synced/acknowledged. */
  acknowledge(opId: string): void {
    this.pendingOps.delete(opId)
  }

  /** Get the current merged document state. */
  getState(): DesignDocument {
    return this.state
  }

  /** Replace the full document state (for initial sync). */
  setState(doc: DesignDocument): void {
    this.state = structuredClone(doc)
  }

  /** Get the number of pending operations. */
  get pendingCount(): number {
    return this.pendingOps.size
  }

  // ── Private ──

  /** Derive a unique key for conflict resolution scoping. */
  private getPathKey(op: CollabOperation): string {
    return `${op.type}:${op.path.join('/')}`
  }

  /** Apply an operation to the internal state. */
  private applyOperation(op: CollabOperation): void {
    const pathKey = this.getPathKey(op)
    this.appliedOps.set(pathKey, op)

    switch (op.type) {
      case 'insert-layer':
        this.applyInsertLayer(op)
        break
      case 'delete-layer':
        this.applyDeleteLayer(op)
        break
      case 'update-layer':
        this.applyUpdateLayer(op)
        break
      case 'move-layer':
        this.applyMoveLayer(op)
        break
      case 'add-artboard':
        this.applyAddArtboard(op)
        break
      case 'delete-artboard':
        this.applyDeleteArtboard(op)
        break
    }
  }

  private findArtboard(artboardId: string): Artboard | undefined {
    return this.state.artboards.find((a) => a.id === artboardId)
  }

  private findLayerInList(layers: Layer[], layerId: string): Layer | undefined {
    for (const layer of layers) {
      if (layer.id === layerId) return layer
      if (layer.type === 'group') {
        const found = this.findLayerInList(layer.children, layerId)
        if (found) return found
      }
    }
    return undefined
  }

  private applyInsertLayer(op: CollabOperation): void {
    // path: ['artboards', artboardId]
    // value: Layer
    const artboardId = op.path[1]
    if (!artboardId) return
    const artboard = this.findArtboard(artboardId)
    if (!artboard) return
    const layer = op.value as Layer
    if (!layer || typeof layer !== 'object') return
    // Prevent duplicate inserts
    if (this.findLayerInList(artboard.layers, layer.id)) return
    artboard.layers.push(layer)
  }

  private applyDeleteLayer(op: CollabOperation): void {
    // path: ['artboards', artboardId, 'layers', layerId]
    const artboardId = op.path[1]
    const layerId = op.path[3]
    if (!artboardId || !layerId) return
    const artboard = this.findArtboard(artboardId)
    if (!artboard) return
    this.removeLayerFromList(artboard.layers, layerId)
  }

  private removeLayerFromList(layers: Layer[], layerId: string): boolean {
    const idx = layers.findIndex((l) => l.id === layerId)
    if (idx !== -1) {
      layers.splice(idx, 1)
      return true
    }
    for (const layer of layers) {
      if (layer.type === 'group') {
        if (this.removeLayerFromList(layer.children, layerId)) return true
      }
    }
    return false
  }

  private applyUpdateLayer(op: CollabOperation): void {
    // path: ['artboards', artboardId, 'layers', layerId]
    // value: Partial<Layer>
    const artboardId = op.path[1]
    const layerId = op.path[3]
    if (!artboardId || !layerId) return
    const artboard = this.findArtboard(artboardId)
    if (!artboard) return
    const layer = this.findLayerInList(artboard.layers, layerId)
    if (!layer) return
    const updates = op.value as Record<string, unknown>
    if (!updates || typeof updates !== 'object') return
    Object.assign(layer, updates)
  }

  private applyMoveLayer(op: CollabOperation): void {
    // path: ['artboards', artboardId, 'layers', layerId]
    // value: { newIndex: number }
    const artboardId = op.path[1]
    const layerId = op.path[3]
    if (!artboardId || !layerId) return
    const artboard = this.findArtboard(artboardId)
    if (!artboard) return
    const moveData = op.value as { newIndex: number } | undefined
    if (!moveData || typeof moveData.newIndex !== 'number') return
    const idx = artboard.layers.findIndex((l) => l.id === layerId)
    if (idx === -1) return
    const [layer] = artboard.layers.splice(idx, 1)
    if (!layer) return
    const insertIdx = Math.min(moveData.newIndex, artboard.layers.length)
    artboard.layers.splice(insertIdx, 0, layer)
  }

  private applyAddArtboard(op: CollabOperation): void {
    // value: Artboard
    const artboard = op.value as Artboard
    if (!artboard || typeof artboard !== 'object') return
    // Prevent duplicate
    if (this.state.artboards.some((a) => a.id === artboard.id)) return
    this.state.artboards.push(artboard)
  }

  private applyDeleteArtboard(op: CollabOperation): void {
    // path: ['artboards', artboardId]
    const artboardId = op.path[1]
    if (!artboardId) return
    const idx = this.state.artboards.findIndex((a) => a.id === artboardId)
    if (idx !== -1) {
      this.state.artboards.splice(idx, 1)
    }
  }
}
