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
import { commitOperation, roomFile, FileError, type Operation } from './native-files'

// ── Types ──

interface CollabMessage {
  type: 'op' | 'presence' | 'ack' | 'sync' | 'join' | 'leave'
  baseRevision?: number
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

function unexpired(ws: ServerWebSocket<WSData>): boolean {
  if (!ws.data.user.expiresAt || ws.data.user.expiresAt <= Date.now()) {
    ws.close(4001, 'Token expired')
    return false
  }
  return true
}

function sendBeforeExpiry(ws: ServerWebSocket<WSData>, data: string): void {
  // File reads and frame encoding may cross the token deadline after an earlier check.
  if (unexpired(ws) && ws.readyState === 1) ws.send(data)
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
      if (!unexpired(client.ws)) continue
      try {
        roomFile(room.id, client.user)
      } catch {
        client.ws.close(4003, 'Room access revoked')
        continue
      }
      if (client.ws.readyState === 1) {
        sendBeforeExpiry(client.ws, data)
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
  if (url.searchParams.get('protocol') !== '1')
    return new Response('Crossdraw native protocol 1 is required', { status: 426 })
  const roomId = url.searchParams.get('room')
  const clientId = url.searchParams.get('client')

  if (!roomId || !clientId || !/^[a-zA-Z0-9-]{8,128}$/.test(clientId)) {
    return new Response('Missing room or client parameter', { status: 400 })
  }

  // Authenticate
  const authResult = await authenticateWebSocket(url)
  if (!authResult.authenticated) {
    return new Response(`Unauthorized: ${authResult.error}`, { status: 401 })
  }

  try {
    if (!authResult.user.expiresAt) return new Response('JWT account required', { status: 401 })
    roomFile(roomId, authResult.user)
  } catch (error) {
    return new Response(error instanceof FileError ? error.message : 'Room access failed', {
      status: error instanceof FileError ? error.status : 500,
    })
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
    if (!unexpired(ws)) return
    try {
      roomFile(roomId, user)
    } catch {
      ws.close(4003, 'Room access denied')
      return
    }
    if (!unexpired(ws)) return
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
      sendBeforeExpiry(
        ws,
        JSON.stringify({
          type: 'sync',
          payload: { clients: presences, ...roomFile(roomId, user), protocol: 1 },
        }),
      )
    } catch {
      // Ignore send errors on open
    }
  },

  message(ws: ServerWebSocket<WSData>, message: string | ArrayBuffer) {
    const { roomId, clientId, user } = ws.data
    if (!unexpired(ws)) return
    try {
      roomFile(roomId, user)
    } catch {
      ws.close(4003, 'Room access revoked')
      return
    }
    const room = rooms.get(roomId)
    if (!room) return

    // Update last seen
    const client = room.clients.get(clientId)
    if (client) client.lastSeen = Date.now()

    try {
      if ((typeof message === 'string' ? Buffer.byteLength(message) : message.byteLength) > 32 * 1024 * 1024)
        throw new FileError(413, 'Collaboration operation exceeds 32 MiB')
      const msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as CollabMessage

      switch (msg.type) {
        case 'op': {
          const operation = msg.payload as Operation
          if (operation?.clientId !== clientId) throw new FileError(400, 'Operation client does not match')
          const receipt = commitOperation(roomId, user, operation, msg.baseRevision!)
          // Persistence precedes both publication and the exact acknowledgement.
          if (!receipt.duplicate) broadcastToRoom(room, clientId, { ...msg, baseRevision: receipt.revision - 1 })
          sendBeforeExpiry(
            ws,
            JSON.stringify({
              type: 'ack',
              payload: {
                opId: operation.id,
                revision: receipt.revision,
                fingerprint: receipt.fingerprint,
                durable: true,
              },
            }),
          )
          break
        }

        case 'presence':
          // Relay presence to all others
          broadcastToRoom(room, clientId, msg)
          break

        case 'sync':
          sendBeforeExpiry(ws, JSON.stringify({ type: 'sync', payload: { ...roomFile(roomId, user), protocol: 1 } }))
          break

        default:
          throw new FileError(400, 'Unsupported collaboration message')
          break
      }
    } catch (error) {
      sendBeforeExpiry(
        ws,
        JSON.stringify({
          type: 'error',
          payload: {
            status: error instanceof FileError ? error.status : 400,
            message: error instanceof FileError ? error.message : 'Invalid collaboration message',
          },
        }),
      )
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
