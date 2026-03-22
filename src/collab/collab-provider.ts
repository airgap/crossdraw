import type { CollabOperation } from './crdt-document'

// ── User Presence ──

export interface UserPresence {
  clientId: string
  name: string
  color: string
  cursorX?: number
  cursorY?: number
  selectedLayerIds: string[]
  lastSeen: number
  /** Remote user's viewport bounds (document coordinates) */
  viewportBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
}

// ── Message Protocol ──

export type CollabMessageType = 'op' | 'presence' | 'ack' | 'sync'

export interface CollabMessage {
  type: CollabMessageType
  payload: CollabOperation | UserPresence | { opId: string } | { ops: CollabOperation[] }
}

// ── Connection State ──

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// ── Presence Colors ──

const PRESENCE_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e67e22', // dark orange
  '#e91e63', // pink
  '#00bcd4', // cyan
  '#8bc34a', // light green
]

/** Pick a deterministic color from the palette based on clientId hash. */
export function colorForClient(clientId: string): string {
  let hash = 0
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]!
}

// ── CollabProvider ──

export class CollabProvider {
  readonly roomId: string
  readonly serverUrl: string
  readonly clientId: string
  private authToken: string

  private ws: WebSocket | null = null
  private _state: ConnectionState = 'disconnected'
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /** Operations queued while disconnected. */
  private opQueue: CollabOperation[] = []

  /** Local presence state. */
  private localPresence: UserPresence

  // ── Callbacks ──
  private onRemoteOpCallbacks: Array<(op: CollabOperation) => void> = []
  private onPresenceCallbacks: Array<(presences: UserPresence[]) => void> = []
  private onStateChangeCallbacks: Array<(state: ConnectionState) => void> = []
  private onRasterUpdateCallbacks: Array<(chunkId: string, data: ArrayBuffer) => void> = []

  /** Remote presences indexed by clientId. */
  private remotePresences: Map<string, UserPresence> = new Map()

  constructor(roomId: string, serverUrl: string, clientId: string, authToken = '', userName?: string) {
    this.roomId = roomId
    this.serverUrl = serverUrl
    this.clientId = clientId
    this.authToken = authToken
    this.localPresence = {
      clientId,
      name: userName ?? `User-${clientId.slice(0, 6)}`,
      color: colorForClient(clientId),
      selectedLayerIds: [],
      lastSeen: Date.now(),
    }
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state
  }

  /** All remote user presences (excludes self). */
  get presences(): UserPresence[] {
    return Array.from(this.remotePresences.values())
  }

  // ── Connection ──

  connect(): void {
    if (this._state === 'connected' || this._state === 'connecting') return
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

    let url = `${this.serverUrl}?room=${encodeURIComponent(this.roomId)}&client=${encodeURIComponent(this.clientId)}`
    if (this.authToken) {
      url += `&token=${encodeURIComponent(this.authToken)}`
    }

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setState('connected')
      // Send local presence
      this.sendMessage({ type: 'presence', payload: this.localPresence })
      // Flush queued ops
      this.flushQueue()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as CollabMessage
        this.handleMessage(msg)
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      if (this._state !== 'disconnected') {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    }
  }

  disconnect(): void {
    this.setState('disconnected')
    this.reconnectAttempts = 0
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
    this.remotePresences.clear()
    this.notifyPresence()
  }

  // ── Broadcasting ──

  broadcastOperation(op: CollabOperation): void {
    if (this._state === 'connected' && this.ws) {
      this.sendMessage({ type: 'op', payload: op })
    } else {
      this.opQueue.push(op)
    }
  }

  /** Broadcast a raster chunk update to all collaborators. */
  broadcastRasterUpdate(chunkId: string, data: ArrayBuffer): void {
    if (this._state === 'connected' && this.ws) {
      this.sendMessage({
        type: 'op',
        payload: {
          id: crypto.randomUUID(),
          clientId: this.clientId,
          timestamp: Date.now(),
          type: 'raster-update' as CollabOperation['type'],
          path: [],
          chunkId,
          data: Array.from(new Uint8Array(data)),
        } as CollabOperation & { chunkId: string; data: number[] },
      })
    }
  }

  updatePresence(partial: Partial<UserPresence>): void {
    this.localPresence = { ...this.localPresence, ...partial, lastSeen: Date.now() }
    if (this._state === 'connected' && this.ws) {
      this.sendMessage({ type: 'presence', payload: this.localPresence })
    }
  }

  // ── Event Registration ──

  onRemoteOperation(callback: (op: CollabOperation) => void): () => void {
    this.onRemoteOpCallbacks.push(callback)
    return () => {
      const idx = this.onRemoteOpCallbacks.indexOf(callback)
      if (idx !== -1) this.onRemoteOpCallbacks.splice(idx, 1)
    }
  }

  onPresenceUpdate(callback: (presences: UserPresence[]) => void): () => void {
    this.onPresenceCallbacks.push(callback)
    return () => {
      const idx = this.onPresenceCallbacks.indexOf(callback)
      if (idx !== -1) this.onPresenceCallbacks.splice(idx, 1)
    }
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.onStateChangeCallbacks.push(callback)
    return () => {
      const idx = this.onStateChangeCallbacks.indexOf(callback)
      if (idx !== -1) this.onStateChangeCallbacks.splice(idx, 1)
    }
  }

  onRasterUpdate(callback: (chunkId: string, data: ArrayBuffer) => void): () => void {
    this.onRasterUpdateCallbacks.push(callback)
    return () => {
      const idx = this.onRasterUpdateCallbacks.indexOf(callback)
      if (idx !== -1) this.onRasterUpdateCallbacks.splice(idx, 1)
    }
  }

  // ── Private ──

  private setState(state: ConnectionState): void {
    this._state = state
    for (const cb of this.onStateChangeCallbacks) {
      cb(state)
    }
  }

  private sendMessage(msg: CollabMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private handleMessage(msg: CollabMessage): void {
    switch (msg.type) {
      case 'op': {
        const op = msg.payload as CollabOperation & { chunkId?: string; data?: number[] }
        // Ignore own operations echoed back
        if (op.clientId === this.clientId) return
        // Handle raster updates separately
        if (op.type === ('raster-update' as string) && op.chunkId && op.data) {
          for (const cb of this.onRasterUpdateCallbacks) {
            cb(op.chunkId, new Uint8Array(op.data).buffer)
          }
          break
        }
        for (const cb of this.onRemoteOpCallbacks) {
          cb(op)
        }
        break
      }
      case 'presence': {
        const presence = msg.payload as UserPresence
        if (presence.clientId === this.clientId) return
        this.remotePresences.set(presence.clientId, presence)
        this.notifyPresence()
        break
      }
      case 'ack': {
        // Acknowledgments can be used by the CRDT document
        break
      }
      case 'sync': {
        const syncData = msg.payload as { ops: CollabOperation[] }
        if (Array.isArray(syncData.ops)) {
          for (const op of syncData.ops) {
            if (op.clientId === this.clientId) continue
            for (const cb of this.onRemoteOpCallbacks) {
              cb(op)
            }
          }
        }
        break
      }
    }
  }

  private flushQueue(): void {
    const ops = this.opQueue.splice(0)
    for (const op of ops) {
      this.sendMessage({ type: 'op', payload: op })
    }
  }

  private scheduleReconnect(): void {
    if (this._state === 'disconnected') return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('disconnected')
      return
    }
    this.setState('reconnecting')
    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private notifyPresence(): void {
    const presences = this.presences
    for (const cb of this.onPresenceCallbacks) {
      cb(presences)
    }
  }
}
