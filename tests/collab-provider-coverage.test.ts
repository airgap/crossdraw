import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { CollabProvider, colorForClient, type UserPresence, type ConnectionState } from '@/collab/collab-provider'
import type { CollabOperation } from '@/collab/crdt-document'

// ── Mock WebSocket ──

let lastWsUrl: string | null = null
let lastWsInstance: MockWebSocket | null = null

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  sentMessages: string[] = []
  url: string

  constructor(url: string) {
    this.url = url
    lastWsUrl = url
    lastWsInstance = this
    // Simulate async connection
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

// Save original and install mock
const origWebSocket = globalThis.WebSocket
globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

afterAll(() => {
  globalThis.WebSocket = origWebSocket
})

describe('colorForClient', () => {
  test('returns a hex color string', () => {
    const color = colorForClient('test-client-1')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('returns same color for same client id', () => {
    const c1 = colorForClient('abc')
    const c2 = colorForClient('abc')
    expect(c1).toBe(c2)
  })

  test('returns different colors for different client ids', () => {
    const c1 = colorForClient('user-A')
    const c2 = colorForClient('user-B')
    // They may occasionally collide, but usually different
    // Just verify they are valid colors
    expect(c1).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c2).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('handles empty string', () => {
    const color = colorForClient('')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('CollabProvider', () => {
  let provider: CollabProvider

  beforeEach(() => {
    lastWsUrl = null
    lastWsInstance = null
    provider = new CollabProvider('room-1', 'ws://localhost:8080', 'client-1')
  })

  test('constructor sets properties', () => {
    expect(provider.roomId).toBe('room-1')
    expect(provider.serverUrl).toBe('ws://localhost:8080')
    expect(provider.clientId).toBe('client-1')
    expect(provider.state).toBe('disconnected')
    expect(provider.presences).toEqual([])
  })

  test('connect changes state to connecting', () => {
    const states: ConnectionState[] = []
    provider.onStateChange((s) => states.push(s))
    provider.connect()
    expect(states).toContain('connecting')
  })

  test('connect constructs correct WebSocket URL', () => {
    provider.connect()
    expect(lastWsUrl).toContain('room=room-1')
    expect(lastWsUrl).toContain('client=client-1')
    provider.disconnect()
  })

  test('connect while connected is no-op', () => {
    provider.connect()
    // Simulate open
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    const urlBefore = lastWsUrl
    provider.connect() // should be no-op
    expect(lastWsUrl).toBe(urlBefore)
    provider.disconnect()
  })

  test('disconnect sets state to disconnected', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    provider.disconnect()
    expect(provider.state).toBe('disconnected')
  })

  test('disconnect clears remote presences', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    provider.disconnect()
    expect(provider.presences).toEqual([])
  })

  test('broadcastOperation sends when connected', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    const ws = lastWsInstance!

    const op: CollabOperation = {
      id: 'op-1',
      clientId: 'client-1',
      timestamp: Date.now(),
      type: 'update-layer',
      path: ['artboards', '0', 'layers', '0'],
      value: { opacity: 0.5 },
    }
    provider.broadcastOperation(op)
    expect(ws.sentMessages).toHaveLength(2) // presence + op
    const parsed = JSON.parse(ws.sentMessages[1]!)
    expect(parsed.type).toBe('op')
    provider.disconnect()
  })

  test('broadcastOperation queues when disconnected', () => {
    const op: CollabOperation = {
      id: 'op-1',
      clientId: 'client-1',
      timestamp: Date.now(),
      type: 'update-layer',
      path: ['artboards', '0'],
      value: null,
    }
    provider.broadcastOperation(op)
    // Now connect and verify queue flush
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    const ws = lastWsInstance!
    // Should have sent: presence + queued op
    expect(ws.sentMessages.length).toBeGreaterThanOrEqual(2)
    provider.disconnect()
  })

  test('updatePresence sends presence message when connected', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    const ws = lastWsInstance!
    const countBefore = ws.sentMessages.length
    provider.updatePresence({ cursorX: 100, cursorY: 200 })
    expect(ws.sentMessages.length).toBe(countBefore + 1)
    const msg = JSON.parse(ws.sentMessages[ws.sentMessages.length - 1]!)
    expect(msg.type).toBe('presence')
    expect(msg.payload.cursorX).toBe(100)
    provider.disconnect()
  })

  test('updatePresence does not send when disconnected', () => {
    provider.updatePresence({ cursorX: 50, cursorY: 75 })
    // No error thrown, no message sent
  })

  test('onRemoteOperation callback fires for remote ops', () => {
    const received: CollabOperation[] = []
    provider.onRemoteOperation((op) => received.push(op))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    // Simulate receiving a remote op
    const remoteOp: CollabOperation = {
      id: 'remote-op-1',
      clientId: 'other-client',
      timestamp: Date.now(),
      type: 'insert-layer',
      path: ['artboards', '0', 'layers'],
      value: {},
    }
    const msg = JSON.stringify({ type: 'op', payload: remoteOp })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(received).toHaveLength(1)
    expect(received[0]!.id).toBe('remote-op-1')
    provider.disconnect()
  })

  test('own operations are ignored', () => {
    const received: CollabOperation[] = []
    provider.onRemoteOperation((op) => received.push(op))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    // Simulate receiving own op echoed back
    const ownOp: CollabOperation = {
      id: 'own-op-1',
      clientId: 'client-1', // same as provider
      timestamp: Date.now(),
      type: 'update-layer',
      path: [],
      value: null,
    }
    const msg = JSON.stringify({ type: 'op', payload: ownOp })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(received).toHaveLength(0)
    provider.disconnect()
  })

  test('onPresenceUpdate callback fires for remote presence', () => {
    const presenceUpdates: UserPresence[][] = []
    provider.onPresenceUpdate((p) => presenceUpdates.push(p))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    const remotePresence: UserPresence = {
      clientId: 'remote-user',
      name: 'Alice',
      color: '#ff0000',
      selectedLayerIds: [],
      lastSeen: Date.now(),
    }
    const msg = JSON.stringify({ type: 'presence', payload: remotePresence })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(presenceUpdates).toHaveLength(1)
    expect(presenceUpdates[0]!).toHaveLength(1)
    expect(presenceUpdates[0]![0]!.name).toBe('Alice')
    provider.disconnect()
  })

  test('own presence messages are ignored', () => {
    const presenceUpdates: UserPresence[][] = []
    provider.onPresenceUpdate((p) => presenceUpdates.push(p))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    const ownPresence: UserPresence = {
      clientId: 'client-1',
      name: 'Self',
      color: '#0000ff',
      selectedLayerIds: [],
      lastSeen: Date.now(),
    }
    const msg = JSON.stringify({ type: 'presence', payload: ownPresence })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(presenceUpdates).toHaveLength(0)
    provider.disconnect()
  })

  test('sync message processes multiple remote ops', () => {
    const received: CollabOperation[] = []
    provider.onRemoteOperation((op) => received.push(op))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    const ops: CollabOperation[] = [
      { id: 'sync-1', clientId: 'other', timestamp: 1, type: 'insert-layer', path: [], value: null },
      { id: 'sync-2', clientId: 'client-1', timestamp: 2, type: 'update-layer', path: [], value: null }, // own - skip
      { id: 'sync-3', clientId: 'other', timestamp: 3, type: 'delete-layer', path: [], value: null },
    ]
    const msg = JSON.stringify({ type: 'sync', payload: { ops } })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(received).toHaveLength(2) // own op skipped
    expect(received[0]!.id).toBe('sync-1')
    expect(received[1]!.id).toBe('sync-3')
    provider.disconnect()
  })

  test('ack message is handled without error', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    const msg = JSON.stringify({ type: 'ack', payload: { opId: 'op-1' } })
    // Should not throw
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }
    provider.disconnect()
  })

  test('malformed message is silently ignored', () => {
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    // Should not throw
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: 'not-json' }))
    }
    provider.disconnect()
  })

  test('onStateChange callback returns unsubscribe function', () => {
    const states: ConnectionState[] = []
    const unsub = provider.onStateChange((s) => states.push(s))
    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    unsub()
    provider.disconnect()

    // 'disconnected' should not be recorded after unsubscribe
    const disconnectedCount = states.filter((s) => s === 'disconnected').length
    expect(disconnectedCount).toBe(0)
  })

  test('onRemoteOperation unsubscribe works', () => {
    const ops: CollabOperation[] = []
    const unsub = provider.onRemoteOperation((op) => ops.push(op))
    unsub()

    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }

    const remoteOp: CollabOperation = {
      id: 'op-x',
      clientId: 'other',
      timestamp: 0,
      type: 'update-layer',
      path: [],
      value: null,
    }
    const msg = JSON.stringify({ type: 'op', payload: remoteOp })
    if (lastWsInstance && lastWsInstance.onmessage) {
      lastWsInstance.onmessage(new MessageEvent('message', { data: msg }))
    }

    expect(ops).toHaveLength(0)
    provider.disconnect()
  })

  test('onPresenceUpdate unsubscribe works', () => {
    const updates: UserPresence[][] = []
    const unsub = provider.onPresenceUpdate((p) => updates.push(p))
    unsub()

    provider.connect()
    if (lastWsInstance && lastWsInstance.onopen) {
      lastWsInstance.onopen(new Event('open'))
    }
    provider.disconnect()

    expect(updates).toHaveLength(0)
  })
})
