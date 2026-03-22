/**
 * Translates Immer patches into CollabOperations for CRDT broadcast.
 *
 * Immer patches look like:
 *   { op: 'replace', path: ['artboards', 0, 'layers', 2, 'opacity'], value: 0.5 }
 *
 * We convert array indices to stable IDs and map to CollabOperation types:
 *   insert-layer, delete-layer, update-layer, move-layer, add-artboard, delete-artboard
 */

import type { Patch } from 'immer'
import type { DesignDocument, Layer } from '@/types'
import type { CollabOperation, CollabOperationType } from '@/collab/crdt-document'

export function patchesToCollabOps(patches: Patch[], clientId: string, doc: DesignDocument): CollabOperation[] {
  const ops: CollabOperation[] = []
  const now = Date.now()

  for (const patch of patches) {
    const { op, path, value } = patch
    if (path.length === 0) continue

    // Top-level path[0] should be 'artboards' for most operations
    if (path[0] === 'artboards') {
      const artboardIndex = path[1] as number
      const artboard = doc.artboards[artboardIndex]

      // Artboard-level operations
      if (path.length === 2) {
        if (op === 'add') {
          ops.push(makeOp(clientId, now, 'add-artboard', [], value))
        } else if (op === 'remove') {
          if (artboard) {
            ops.push(makeOp(clientId, now, 'delete-artboard', ['artboards', artboard.id]))
          }
        }
        continue
      }

      if (!artboard) continue
      const artboardId = artboard.id

      // Layer operations: path = ['artboards', N, 'layers', M, ...]
      if (path[2] === 'layers') {
        const layerIndex = path[3] as number
        const layer = artboard.layers[layerIndex] as Layer | undefined

        if (path.length === 4) {
          // Direct layer add/remove
          if (op === 'add') {
            ops.push(makeOp(clientId, now, 'insert-layer', ['artboards', artboardId], value))
          } else if (op === 'remove' && layer) {
            ops.push(makeOp(clientId, now, 'delete-layer', ['artboards', artboardId, 'layers', layer.id]))
          }
        } else if (path.length > 4 && layer) {
          // Layer property update: path = ['artboards', N, 'layers', M, 'prop', ...]
          const prop = path[4] as string
          const partialUpdate: Record<string, unknown> = { [prop]: value }
          ops.push(makeOp(clientId, now, 'update-layer', ['artboards', artboardId, 'layers', layer.id], partialUpdate))
        }
        continue
      }

      // Other artboard property changes (backgroundColor, width, etc.)
      if (path.length >= 3 && op === 'replace') {
        // Treat as artboard-level update — broadcast as a generic update
        ops.push(
          makeOp(clientId, now, 'update-layer', ['artboards', artboardId], {
            [path[2] as string]: value,
          }),
        )
      }
    }

    // Document metadata, assets, comments, etc. — broadcast as generic updates
    // These are less common and don't have dedicated CRDT op types,
    // so we use update-layer with a root path marker
    if (path[0] === 'metadata' || path[0] === 'comments' || path[0] === 'assets') {
      ops.push(makeOp(clientId, now, 'update-layer', [path[0] as string], { [path.slice(1).join('.')]: value }))
    }
  }

  return ops
}

function makeOp(
  clientId: string,
  timestamp: number,
  type: CollabOperationType,
  path: string[],
  value?: unknown,
): CollabOperation {
  return {
    id: crypto.randomUUID(),
    clientId,
    timestamp,
    type,
    path,
    value,
  }
}
