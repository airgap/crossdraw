/**
 * WebSocket collaboration server for real-time multiplayer editing.
 *
 * Handles:
 * - Room creation/joining via URL params (?room=<id>&client=<id>&token=<jwt>)
 * - Broadcasting CRDT operations to all clients in a room
 * - Relaying presence updates (cursors, selections, tools)
 * - JWT authentication on connect
 *
 * Designed to integrate with Bun.serve's websocket option.
 *
 * @module server/ws
 */

import { authenticateWebSocket, type AuthenticatedUser } from './auth'

// ── Types ──

interface CollabMessage {
  type: 'op' | 'presence' | 'ack' | 'sync' | 'join' | 'leave'
  payload: unknown
}

interface RoomClient {
  clientId: string
  user: AuthenticatedUser
  ws: ServerWebSocket<WSData>
  lastSeen: number
}

interface Room {
  id: string
  clients: Map<string, RoomClient>
  createdAt: number
}

export interface WSData {
  roomId: string
  clientId: string
  user: AuthenticatedUser
}

type ServerWebSocket<T> = {
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  data: T
  readyState: number
}

// ── Room management ──

const rooms = new Map<string, Room>()

/** Interval for cleaning up stale rooms (every 5 minutes). */
const ROOM_CLEANUP_INTERVAL = 300_000
/** Rooms with no clients are removed after this duration. */
const ROOM_TTL = 600_000 // 10 minutes

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId)
  if (!room) {
    room = {
      id: roomId,
      clients: new Map(),
      createdAt: Date.now(),
    }
    rooms.set(roomId, room)
  }
  return room
}

function removeClientFromRoom(roomId: string, clientId: string): void {
  const room = rooms.get(roomId)
  if (!room) return

  const client = room.clients.get(clientId)
  room.clients.delete(clientId)

  // Notify remaining clients that this user left
  if (client) {
    broadcastToRoom(room, clientId, {
      type: 'leave',
      payload: {
        clientId,
        userId: client.user.id,
        name: client.user.name,
      },
    })
  }

  // Clean up empty rooms after a delay
  if (room.clients.size === 0) {
    setTimeout(() => {
      const r = rooms.get(roomId)
      if (r && r.clients.size === 0) {
        rooms.delete(roomId)
      }
    }, ROOM_TTL)
  }
}

function broadcastToRoom(room: Room, senderClientId: string, message: CollabMessage): void {
  const data = JSON.stringify(message)
  for (const [id, client] of room.clients) {
    if (id === senderClientId) continue
    try {
      if (client.ws.readyState === 1) {
        client.ws.send(data)
      }
    } catch {
      // Client disconnected — will be cleaned up on close
    }
  }
}

// ── Periodic cleanup ──

setInterval(() => {
  const now = Date.now()
  for (const [id, room] of rooms) {
    if (room.clients.size === 0 && now - room.createdAt > ROOM_TTL) {
      rooms.delete(id)
    }
  }
}, ROOM_CLEANUP_INTERVAL)

// ── WebSocket upgrade handler ──

/**
 * Handle WebSocket upgrade requests.
 * Call this from Bun.serve's fetch handler when the request is a WS upgrade.
 */
export async function handleWSUpgrade(
  req: Request,
  server: { upgrade: (req: Request, opts: { data: WSData }) => boolean },
): Promise<Response | null> {
  const url = new URL(req.url)
  const roomId = url.searchParams.get('room')
  const clientId = url.searchParams.get('client')

  if (!roomId || !clientId) {
    return new Response('Missing room or client parameter', { status: 400 })
  }

  // Authenticate
  const authResult = await authenticateWebSocket(url)
  if (!authResult.authenticated) {
    return new Response(`Unauthorized: ${authResult.error}`, { status: 401 })
  }

  // Upgrade to WebSocket
  const upgraded = server.upgrade(req, {
    data: {
      roomId,
      clientId,
      user: authResult.user,
    },
  })

  if (!upgraded) {
    return new Response('WebSocket upgrade failed', { status: 500 })
  }

  // Return null to indicate the upgrade was handled
  return null
}

// ── WebSocket event handlers (for Bun.serve websocket option) ──

export const websocketHandlers = {
  open(ws: ServerWebSocket<WSData>) {
    const { roomId, clientId, user } = ws.data
    const room = getOrCreateRoom(roomId)

    // Register client
    room.clients.set(clientId, {
      clientId,
      user,
      ws,
      lastSeen: Date.now(),
    })

    // Notify others that this user joined
    broadcastToRoom(room, clientId, {
      type: 'join',
      payload: {
        clientId,
        userId: user.id,
        name: user.name,
      },
    })

    // Send current presence list to the new client
    const presences = Array.from(room.clients.values())
      .filter((c) => c.clientId !== clientId)
      .map((c) => ({
        clientId: c.clientId,
        userId: c.user.id,
        name: c.user.name,
      }))

    try {
      ws.send(
        JSON.stringify({
          type: 'sync',
          payload: { clients: presences },
        }),
      )
    } catch {
      // Ignore send errors on open
    }
  },

  message(ws: ServerWebSocket<WSData>, message: string | ArrayBuffer) {
    const { roomId, clientId } = ws.data
    const room = rooms.get(roomId)
    if (!room) return

    // Update last seen
    const client = room.clients.get(clientId)
    if (client) client.lastSeen = Date.now()

    try {
      const msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as CollabMessage

      switch (msg.type) {
        case 'op':
          // Broadcast CRDT operations to all other clients
          broadcastToRoom(room, clientId, msg)
          // Send ack back to sender
          try {
            ws.send(JSON.stringify({ type: 'ack', payload: { type: 'op' } }))
          } catch {
            /* ignore */
          }
          break

        case 'presence':
          // Relay presence to all others
          broadcastToRoom(room, clientId, msg)
          break

        case 'sync':
          // Sync request: broadcast to all others (they'll respond with their state)
          broadcastToRoom(room, clientId, msg)
          break

        default:
          // Forward unknown message types
          broadcastToRoom(room, clientId, msg)
          break
      }
    } catch {
      // Ignore malformed messages
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    const { roomId, clientId } = ws.data
    removeClientFromRoom(roomId, clientId)
  },
}

// ── Stats ──

export function getWSStats(): { rooms: number; clients: number } {
  let clients = 0
  for (const room of rooms.values()) {
    clients += room.clients.size
  }
  return { rooms: rooms.size, clients }
}
