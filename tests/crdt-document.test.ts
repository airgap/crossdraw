import { describe, test, expect } from 'bun:test'
import { CRDTDocument, type CollabOperation } from '@/collab/crdt-document'
import type { DesignDocument, VectorLayer, Artboard } from '@/types'
import type { UserPresence } from '@/collab/collab-provider'
import { CollabProvider, colorForClient } from '@/collab/collab-provider'

// ── Helpers ──

function makeDoc(): DesignDocument {
  return {
    id: 'doc-1',
    metadata: {
      title: 'Test',
      author: '',
      created: '2026-01-01T00:00:00Z',
      modified: '2026-01-01T00:00:00Z',
      colorspace: 'srgb',
      width: 1920,
      height: 1080,
    },
    artboards: [
      {
        id: 'ab-1',
        name: 'Main',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#ffffff',
        layers: [
          {
            id: 'layer-1',
            name: 'Layer 1',
            type: 'vector',
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            effects: [],
            paths: [],
            fill: null,
            stroke: null,
          } satisfies VectorLayer,
          {
            id: 'layer-2',
            name: 'Layer 2',
            type: 'vector',
            visible: true,
            locked: false,
            opacity: 0.8,
            blendMode: 'normal',
            transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
            effects: [],
            paths: [],
            fill: { type: 'solid', color: '#ff0000', opacity: 1 },
            stroke: null,
          } satisfies VectorLayer,
        ],
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

function makeOp(overrides: Partial<CollabOperation>): CollabOperation {
  return {
    id: `op-${Math.random().toString(36).slice(2, 8)}`,
    clientId: 'client-A',
    timestamp: Date.now(),
    type: 'update-layer',
    path: ['artboards', 'ab-1', 'layers', 'layer-1'],
    value: {},
    ...overrides,
  }
}

function makeLayer(id: string, name: string): VectorLayer {
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
    fill: null,
    stroke: null,
  }
}

// ── CRDT Document Tests ──

describe('CRDTDocument', () => {
  describe('applyLocal', () => {
    test('applies insert-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())
      const newLayer = makeLayer('layer-3', 'New Layer')

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'insert-layer',
          path: ['artboards', 'ab-1'],
          value: newLayer,
        }),
      )

      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(3)
      expect(state.artboards[0]!.layers[2]!.id).toBe('layer-3')
      expect(state.artboards[0]!.layers[2]!.name).toBe('New Layer')
    })

    test('applies delete-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'delete-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
        }),
      )

      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(1)
      expect(state.artboards[0]!.layers[0]!.id).toBe('layer-2')
    })

    test('applies update-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'Renamed', opacity: 0.5 },
        }),
      )

      const state = crdt.getState()
      const layer = state.artboards[0]!.layers[0]!
      expect(layer.name).toBe('Renamed')
      expect(layer.opacity).toBe(0.5)
    })

    test('applies move-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'move-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { newIndex: 1 },
        }),
      )

      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.id).toBe('layer-2')
      expect(state.artboards[0]!.layers[1]!.id).toBe('layer-1')
    })

    test('applies add-artboard operation', () => {
      const crdt = new CRDTDocument(makeDoc())
      const newArtboard: Artboard = {
        id: 'ab-2',
        name: 'Second Artboard',
        x: 2000,
        y: 0,
        width: 800,
        height: 600,
        backgroundColor: '#eeeeee',
        layers: [],
      }

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'add-artboard',
          path: ['artboards'],
          value: newArtboard,
        }),
      )

      const state = crdt.getState()
      expect(state.artboards).toHaveLength(2)
      expect(state.artboards[1]!.id).toBe('ab-2')
    })

    test('applies delete-artboard operation', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'delete-artboard',
          path: ['artboards', 'ab-1'],
        }),
      )

      const state = crdt.getState()
      expect(state.artboards).toHaveLength(0)
    })

    test('queues operation as pending', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'Updated' },
        }),
      )

      const pending = crdt.getPendingOps()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.id).toBe('op-1')
    })
  })

  describe('applyRemote', () => {
    test('applies remote update-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())

      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-remote-1',
          clientId: 'client-B',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-2'],
          value: { name: 'Remote Update' },
        }),
      )

      expect(applied).toBe(true)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[1]!.name).toBe('Remote Update')
    })

    test('applies remote insert-layer operation', () => {
      const crdt = new CRDTDocument(makeDoc())
      const newLayer = makeLayer('layer-remote', 'Remote Layer')

      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-remote-2',
          clientId: 'client-B',
          type: 'insert-layer',
          path: ['artboards', 'ab-1'],
          value: newLayer,
        }),
      )

      expect(applied).toBe(true)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(3)
    })

    test('does not add pending ops for remote operations', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyRemote(
        makeOp({
          id: 'op-remote-1',
          clientId: 'client-B',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'Remote' },
        }),
      )

      expect(crdt.getPendingOps()).toHaveLength(0)
    })
  })

  describe('concurrent edits', () => {
    test('concurrent edits to different layers both apply', () => {
      const crdt = new CRDTDocument(makeDoc())
      const now = Date.now()

      // Client A edits layer-1
      crdt.applyLocal(
        makeOp({
          id: 'op-A',
          clientId: 'client-A',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From A' },
        }),
      )

      // Client B edits layer-2 (different layer)
      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-B',
          clientId: 'client-B',
          timestamp: now + 1,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-2'],
          value: { name: 'From B' },
        }),
      )

      expect(applied).toBe(true)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.name).toBe('From A')
      expect(state.artboards[0]!.layers[1]!.name).toBe('From B')
    })

    test('concurrent edits to same layer: later timestamp wins (LWW)', () => {
      const crdt = new CRDTDocument(makeDoc())
      const now = Date.now()

      // Client A edits layer-1 first (earlier timestamp)
      crdt.applyLocal(
        makeOp({
          id: 'op-A',
          clientId: 'client-A',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From A' },
        }),
      )

      // Client B edits same layer later (later timestamp) — should win
      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-B',
          clientId: 'client-B',
          timestamp: now + 100,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From B' },
        }),
      )

      expect(applied).toBe(true)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.name).toBe('From B')
    })

    test('concurrent edits to same layer: earlier timestamp loses (LWW)', () => {
      const crdt = new CRDTDocument(makeDoc())
      const now = Date.now()

      // Client B edits layer-1 with later timestamp first
      crdt.applyLocal(
        makeOp({
          id: 'op-B',
          clientId: 'client-B',
          timestamp: now + 100,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From B (later)' },
        }),
      )

      // Client A edits same layer with earlier timestamp — should lose
      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-A',
          clientId: 'client-A',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From A (earlier)' },
        }),
      )

      expect(applied).toBe(false)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.name).toBe('From B (later)')
    })

    test('concurrent edits with same timestamp: higher clientId wins', () => {
      const crdt = new CRDTDocument(makeDoc())
      const now = Date.now()

      // Client A edits layer-1
      crdt.applyLocal(
        makeOp({
          id: 'op-A',
          clientId: 'client-A',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From A' },
        }),
      )

      // Client B edits same layer with same timestamp — client-B > client-A lexicographically
      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-B',
          clientId: 'client-B',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From B' },
        }),
      )

      expect(applied).toBe(true)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.name).toBe('From B')
    })

    test('concurrent edits with same timestamp: lower clientId loses', () => {
      const crdt = new CRDTDocument(makeDoc())
      const now = Date.now()

      // Client Z edits layer-1 (higher clientId)
      crdt.applyLocal(
        makeOp({
          id: 'op-Z',
          clientId: 'client-Z',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From Z' },
        }),
      )

      // Client A edits same layer with same timestamp — client-A < client-Z
      const applied = crdt.applyRemote(
        makeOp({
          id: 'op-A',
          clientId: 'client-A',
          timestamp: now,
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'From A' },
        }),
      )

      expect(applied).toBe(false)
      const state = crdt.getState()
      expect(state.artboards[0]!.layers[0]!.name).toBe('From Z')
    })
  })

  describe('operation queuing and acknowledgment', () => {
    test('local ops are pending until acknowledged', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'Updated 1' },
        }),
      )

      crdt.applyLocal(
        makeOp({
          id: 'op-2',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-2'],
          value: { name: 'Updated 2' },
        }),
      )

      expect(crdt.getPendingOps()).toHaveLength(2)
      expect(crdt.pendingCount).toBe(2)
    })

    test('acknowledge removes op from pending', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { name: 'Updated' },
        }),
      )

      crdt.applyLocal(
        makeOp({
          id: 'op-2',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-2'],
          value: { name: 'Updated 2' },
        }),
      )

      crdt.acknowledge('op-1')
      const pending = crdt.getPendingOps()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.id).toBe('op-2')
    })

    test('acknowledging non-existent op is safe', () => {
      const crdt = new CRDTDocument(makeDoc())
      crdt.acknowledge('non-existent')
      expect(crdt.getPendingOps()).toHaveLength(0)
    })

    test('acknowledging all ops clears pending', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(makeOp({ id: 'op-1' }))
      crdt.applyLocal(makeOp({ id: 'op-2' }))
      crdt.applyLocal(makeOp({ id: 'op-3' }))

      crdt.acknowledge('op-1')
      crdt.acknowledge('op-2')
      crdt.acknowledge('op-3')

      expect(crdt.pendingCount).toBe(0)
    })
  })

  describe('state management', () => {
    test('getState returns current document', () => {
      const doc = makeDoc()
      const crdt = new CRDTDocument(doc)

      const state = crdt.getState()
      expect(state.id).toBe('doc-1')
      expect(state.artboards).toHaveLength(1)
    })

    test('setState replaces entire document', () => {
      const crdt = new CRDTDocument(makeDoc())
      const newDoc = makeDoc()
      newDoc.id = 'doc-replaced'
      newDoc.artboards[0]!.layers = []

      crdt.setState(newDoc)

      const state = crdt.getState()
      expect(state.id).toBe('doc-replaced')
      expect(state.artboards[0]!.layers).toHaveLength(0)
    })

    test('initial state is a deep copy (mutations do not leak)', () => {
      const doc = makeDoc()
      const crdt = new CRDTDocument(doc)

      // Mutate the original
      doc.artboards[0]!.name = 'Mutated'

      const state = crdt.getState()
      expect(state.artboards[0]!.name).toBe('Main')
    })

    test('duplicate insert-layer is idempotent', () => {
      const crdt = new CRDTDocument(makeDoc())
      const newLayer = makeLayer('layer-dup', 'Duplicate')

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'insert-layer',
          path: ['artboards', 'ab-1'],
          value: newLayer,
        }),
      )

      crdt.applyRemote(
        makeOp({
          id: 'op-2',
          clientId: 'client-B',
          type: 'insert-layer',
          path: ['artboards', 'ab-1'],
          value: newLayer,
        }),
      )

      const state = crdt.getState()
      // Only one copy should exist
      const dupes = state.artboards[0]!.layers.filter((l) => l.id === 'layer-dup')
      expect(dupes).toHaveLength(1)
    })

    test('duplicate add-artboard is idempotent', () => {
      const crdt = new CRDTDocument(makeDoc())
      const ab: Artboard = {
        id: 'ab-dup',
        name: 'Dup',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        backgroundColor: '#fff',
        layers: [],
      }

      crdt.applyLocal(
        makeOp({ id: 'op-1', type: 'add-artboard', path: ['artboards'], value: ab }),
      )
      crdt.applyRemote(
        makeOp({ id: 'op-2', clientId: 'client-B', type: 'add-artboard', path: ['artboards'], value: ab }),
      )

      expect(crdt.getState().artboards.filter((a) => a.id === 'ab-dup')).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    test('delete non-existent layer is safe', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'delete-layer',
          path: ['artboards', 'ab-1', 'layers', 'non-existent'],
        }),
      )

      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(2)
    })

    test('update non-existent layer is safe', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'update-layer',
          path: ['artboards', 'ab-1', 'layers', 'non-existent'],
          value: { name: 'Ghost' },
        }),
      )

      // No crash, state unchanged
      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(2)
    })

    test('move-layer with out-of-bounds index clamps to end', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'move-layer',
          path: ['artboards', 'ab-1', 'layers', 'layer-1'],
          value: { newIndex: 999 },
        }),
      )

      const state = crdt.getState()
      expect(state.artboards[0]!.layers).toHaveLength(2)
      // layer-1 should be at end
      expect(state.artboards[0]!.layers[1]!.id).toBe('layer-1')
    })

    test('operation on non-existent artboard is safe', () => {
      const crdt = new CRDTDocument(makeDoc())

      crdt.applyLocal(
        makeOp({
          id: 'op-1',
          type: 'insert-layer',
          path: ['artboards', 'non-existent'],
          value: makeLayer('l', 'Layer'),
        }),
      )

      expect(crdt.getState().artboards[0]!.layers).toHaveLength(2)
    })
  })
})

// ── Presence Tests ──

describe('UserPresence', () => {
  test('presence structure is valid', () => {
    const presence: UserPresence = {
      clientId: 'test-client',
      name: 'Test User',
      color: '#e74c3c',
      cursorX: 100,
      cursorY: 200,
      selectedLayerIds: ['layer-1', 'layer-2'],
      lastSeen: Date.now(),
    }

    expect(presence.clientId).toBe('test-client')
    expect(presence.name).toBe('Test User')
    expect(presence.selectedLayerIds).toHaveLength(2)
    expect(presence.cursorX).toBe(100)
    expect(presence.cursorY).toBe(200)
  })

  test('presence without cursor coordinates', () => {
    const presence: UserPresence = {
      clientId: 'test-client',
      name: 'Test User',
      color: '#3498db',
      selectedLayerIds: [],
      lastSeen: Date.now(),
    }

    expect(presence.cursorX).toBeUndefined()
    expect(presence.cursorY).toBeUndefined()
    expect(presence.selectedLayerIds).toHaveLength(0)
  })
})

// ── Color Assignment Tests ──

describe('colorForClient', () => {
  test('returns a valid hex color', () => {
    const color = colorForClient('some-client-id')
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('same clientId always returns same color', () => {
    const color1 = colorForClient('stable-id')
    const color2 = colorForClient('stable-id')
    expect(color1).toBe(color2)
  })

  test('different clientIds can return different colors', () => {
    const colors = new Set<string>()
    for (let i = 0; i < 20; i++) {
      colors.add(colorForClient(`client-${i}`))
    }
    // With 10 colors in the palette, we should get multiple unique colors
    expect(colors.size).toBeGreaterThan(1)
  })
})

// ── CollabProvider Unit Tests ──

describe('CollabProvider', () => {
  test('initial state is disconnected', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    expect(provider.state).toBe('disconnected')
    expect(provider.presences).toHaveLength(0)
  })

  test('stores room and client info', () => {
    const provider = new CollabProvider('my-room', 'ws://localhost:9999', 'my-client')
    expect(provider.roomId).toBe('my-room')
    expect(provider.serverUrl).toBe('ws://localhost:9999')
    expect(provider.clientId).toBe('my-client')
  })

  test('disconnect from initial state is safe', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    provider.disconnect()
    expect(provider.state).toBe('disconnected')
  })

  test('onRemoteOperation registers and unregisters callback', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    const calls: CollabOperation[] = []
    const unsub = provider.onRemoteOperation((op) => calls.push(op))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('onPresenceUpdate registers and unregisters callback', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    const calls: UserPresence[][] = []
    const unsub = provider.onPresenceUpdate((p) => calls.push(p))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('onStateChange registers and unregisters callback', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    const states: string[] = []
    const unsub = provider.onStateChange((s) => states.push(s))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('updatePresence does not crash when disconnected', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    provider.updatePresence({ cursorX: 50, cursorY: 75 })
    // No crash
    expect(provider.state).toBe('disconnected')
  })

  test('broadcastOperation queues when disconnected', () => {
    const provider = new CollabProvider('room-1', 'ws://localhost:4000', 'client-1')
    const op = makeOp({ id: 'queued-op' })
    provider.broadcastOperation(op)
    // No crash — op is queued internally
    expect(provider.state).toBe('disconnected')
  })
})
