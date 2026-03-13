/**
 * Live cursor and user presence tracking for collaborative editing.
 *
 * Features:
 * - Broadcast local cursor/tool/viewport at a throttled rate (30fps)
 * - Track remote user presences
 * - Follow mode: lock viewport to another user
 *
 * @module collab/presence
 */

// ── Types ──

export interface PresenceData {
  userId: string
  name: string
  color: string
  cursorX: number
  cursorY: number
  activeTool: string
  viewportRect: { x: number; y: number; width: number; height: number }
}

export interface PresenceCallbacks {
  onBroadcast: (data: PresenceData) => void
}

// ── Constants ──

/** Minimum interval between presence broadcasts (ms) — ~30fps */
const BROADCAST_INTERVAL_MS = 33

// ── Remote presence store ──

const remotePresences = new Map<string, PresenceData>()

/** Get all currently tracked remote user presences. */
export function getRemotePresence(): PresenceData[] {
  return Array.from(remotePresences.values())
}

/** Update or add a remote user's presence data (called when receiving from sync). */
export function updateRemotePresence(data: PresenceData): void {
  remotePresences.set(data.userId, data)
}

/** Remove a remote user's presence (e.g. when they disconnect). */
export function removeRemotePresence(userId: string): void {
  remotePresences.delete(userId)
}

/** Clear all remote presences. */
export function clearRemotePresences(): void {
  remotePresences.clear()
}

/** Get presence for a specific remote user. */
export function getPresenceForUser(userId: string): PresenceData | undefined {
  return remotePresences.get(userId)
}

// ── Broadcasting ──

let lastBroadcastTime = 0
let pendingBroadcast: PresenceData | null = null
let broadcastTimer: ReturnType<typeof setTimeout> | null = null
let broadcastCallback: ((data: PresenceData) => void) | null = null

/** Register the callback used to actually send presence data over the wire. */
export function setBroadcastCallback(callback: ((data: PresenceData) => void) | null): void {
  broadcastCallback = callback
}

/**
 * Broadcast local presence data, throttled to ~30fps.
 * If called more frequently, the latest data is queued and sent after the throttle window.
 */
export function broadcastPresence(data: PresenceData): void {
  const now = Date.now()
  const elapsed = now - lastBroadcastTime

  if (elapsed >= BROADCAST_INTERVAL_MS) {
    doSend(data)
  } else {
    // Throttle: schedule the latest data to be sent after the remaining interval
    pendingBroadcast = data
    if (!broadcastTimer) {
      broadcastTimer = setTimeout(() => {
        broadcastTimer = null
        if (pendingBroadcast) {
          doSend(pendingBroadcast)
          pendingBroadcast = null
        }
      }, BROADCAST_INTERVAL_MS - elapsed)
    } else {
      // Timer already scheduled; just update the pending data
      pendingBroadcast = data
    }
  }
}

function doSend(data: PresenceData): void {
  lastBroadcastTime = Date.now()
  if (broadcastCallback) {
    broadcastCallback(data)
  }
}

/** Cancel any pending throttled broadcast. */
export function cancelPendingBroadcast(): void {
  pendingBroadcast = null
  if (broadcastTimer) {
    clearTimeout(broadcastTimer)
    broadcastTimer = null
  }
}

// ── Follow mode ──

let followedUserId: string | null = null

/** Start following another user's viewport (their pans/zooms will be mirrored). */
export function followUser(userId: string): void {
  followedUserId = userId
}

/** Stop following any user. */
export function unfollowUser(): void {
  followedUserId = null
}

/** Get the user ID currently being followed, or null. */
export function getFollowedUserId(): string | null {
  return followedUserId
}

/**
 * Get the viewport rect to use when following another user.
 * Returns the followed user's viewport rect if in follow mode and the user is present,
 * otherwise returns null.
 */
export function getFollowViewport(): { x: number; y: number; width: number; height: number } | null {
  if (!followedUserId) return null
  const presence = remotePresences.get(followedUserId)
  if (!presence) return null
  return { ...presence.viewportRect }
}

// ── Presence colors ──

const PRESENCE_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#e91e63',
  '#00bcd4',
  '#8bc34a',
]

/** Get a deterministic color for a user based on their ID. */
export function colorForUser(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]!
}
