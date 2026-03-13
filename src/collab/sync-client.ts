/**
 * WebSocket sync client for real-time collaborative editing.
 *
 * Features:
 * - Automatic reconnect with exponential backoff
 * - Offline operation queue that flushes on reconnect
 * - Typed message protocol for operations, presence, ack, and sync
 *
 * @module collab/sync-client
 */

import type { CRDTOperation } from './crdt-doc'

// ── Message protocol ──

export type SyncMessageType = 'operations' | 'presence' | 'ack' | 'sync-request' | 'sync-response'

export interface SyncMessage {
  type: SyncMessageType
  roomId: string
  clientId: string
  payload: unknown
}

// ── Connection state ──

export type SyncConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// ── Events ──

export interface SyncClientEvents {
  onRemoteOperations?: (ops: CRDTOperation[]) => void
  onConnectionStateChange?: (state: SyncConnectionState) => void
  onError?: (error: Error) => void
}

// ── SyncClient ──

export class SyncClient {
  private ws: WebSocket | null = null
  private _state: SyncConnectionState = 'disconnected'
  private _serverUrl = ''
  private _roomId = ''
  private _authToken = ''
  private _clientId: string

  /** Queued operations accumulated while offline */
  private offlineQueue: CRDTOperation[] = []

  /** Reconnect state */
  private reconnectAttempts = 0
  private maxReconnectAttempts = 12
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /** Callbacks for remote operations */
  private remoteOpCallbacks: Array<(ops: CRDTOperation[]) => void> = []

  /** Callbacks for connection state changes */
  private stateChangeCallbacks: Array<(state: SyncConnectionState) => void> = []

  /** Callbacks for errors */
  private errorCallbacks: Array<(error: Error) => void> = []

  constructor(clientId: string) {
    this._clientId = clientId
  }

  /** Current connection state */
  get state(): SyncConnectionState {
    return this._state
  }

  /** Client identifier */
  get clientId(): string {
    return this._clientId
  }

  /** Number of operations queued for send */
  get queueLength(): number {
    return this.offlineQueue.length
  }

  // ── Connection lifecycle ──

  /** Connect to a collaboration room */
  connect(serverUrl: string, roomId: string, authToken: string): void {
    if (this._state === 'connected' || this._state === 'connecting') return

    this._serverUrl = serverUrl
    this._roomId = roomId
    this._authToken = authToken

    this.doConnect()
  }

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    this.setState('disconnected')
    this.reconnectAttempts = 0
    this.clearReconnectTimer()

    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
  }

  // ── Sending ──

  /** Send operations to the room. Queues if offline. */
  sendOperations(ops: CRDTOperation[]): void {
    if (ops.length === 0) return

    if (this._state === 'connected' && this.ws) {
      this.sendMessage({
        type: 'operations',
        roomId: this._roomId,
        clientId: this._clientId,
        payload: ops,
      })
    } else {
      this.offlineQueue.push(...ops)
    }
  }

  // ── Event registration ──

  /** Register a callback for remote operations. Returns an unsubscribe function. */
  onRemoteOperations(callback: (ops: CRDTOperation[]) => void): () => void {
    this.remoteOpCallbacks.push(callback)
    return () => {
      const idx = this.remoteOpCallbacks.indexOf(callback)
      if (idx !== -1) this.remoteOpCallbacks.splice(idx, 1)
    }
  }

  /** Register a callback for connection state changes. Returns an unsubscribe function. */
  onStateChange(callback: (state: SyncConnectionState) => void): () => void {
    this.stateChangeCallbacks.push(callback)
    return () => {
      const idx = this.stateChangeCallbacks.indexOf(callback)
      if (idx !== -1) this.stateChangeCallbacks.splice(idx, 1)
    }
  }

  /** Register a callback for errors. Returns an unsubscribe function. */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.push(callback)
    return () => {
      const idx = this.errorCallbacks.indexOf(callback)
      if (idx !== -1) this.errorCallbacks.splice(idx, 1)
    }
  }

  // ── Private ──

  private doConnect(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

    const url = `${this._serverUrl}?room=${encodeURIComponent(this._roomId)}&client=${encodeURIComponent(this._clientId)}&token=${encodeURIComponent(this._authToken)}`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setState('connected')
      this.flushOfflineQueue()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as SyncMessage
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
      this.notifyError(new Error('WebSocket connection error'))
    }
  }

  private handleMessage(msg: SyncMessage): void {
    switch (msg.type) {
      case 'operations': {
        const ops = msg.payload as CRDTOperation[]
        if (!Array.isArray(ops)) return
        // Filter out own operations that may be echoed back
        const remote = ops.filter((op) => op.clientId !== this._clientId)
        if (remote.length > 0) {
          for (const cb of this.remoteOpCallbacks) {
            cb(remote)
          }
        }
        break
      }
      case 'sync-response': {
        const ops = msg.payload as CRDTOperation[]
        if (!Array.isArray(ops)) return
        for (const cb of this.remoteOpCallbacks) {
          cb(ops)
        }
        break
      }
      case 'ack':
        // Server acknowledged our operations
        break
    }
  }

  private flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return
    const queued = this.offlineQueue.splice(0)
    this.sendMessage({
      type: 'operations',
      roomId: this._roomId,
      clientId: this._clientId,
      payload: queued,
    })
  }

  private sendMessage(msg: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private setState(state: SyncConnectionState): void {
    this._state = state
    for (const cb of this.stateChangeCallbacks) {
      cb(state)
    }
  }

  private notifyError(error: Error): void {
    for (const cb of this.errorCallbacks) {
      cb(error)
    }
  }

  private scheduleReconnect(): void {
    if (this._state === 'disconnected') return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('disconnected')
      this.notifyError(new Error('Max reconnect attempts reached'))
      return
    }

    this.setState('reconnecting')
    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
