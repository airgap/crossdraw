/**
 * Cloud preference syncing for logged-in users.
 *
 * localStorage is the source of truth. Cloud acts as replication.
 * - On login: fetch server prefs, merge into localStorage (server wins for conflicts)
 * - On local changes: debounced push to server (client wins)
 * - Offline: silently ignored, localStorage continues to work
 *
 * @module cloud/preference-sync
 */

import { getCloudConfig, buildUrl } from '@/cloud/cloud-client'
import { isAuthenticated, ensureValidToken } from '@/auth/auth'

// ── Keys to sync ───────────────────────────────────────────────

const SYNCED_KEYS = [
  'crossdraw:theme',
  'crossdraw:custom-themes',
  'crossdraw:shortcuts',
  'crossdraw:default-unit',
  'crossdraw:auto-save',
  'crossdraw:pixel-grid-threshold',
  'crossdraw:render-quality',
  'crossdraw:gpu-accel',
  'crossdraw:toolbar-order',
  'crossdraw:workspace-presets',
  'crossdraw:palette',
  'crossdraw:recent-colors',
  'crossdraw:text-styles',
  'crossdraw:touch-mode',
  'crossdraw:ai-enabled',
]

// Events that should trigger UI refresh after applying remote prefs
const REFRESH_EVENTS: Record<string, string[]> = {
  'crossdraw:theme': ['crossdraw:theme-changed'],
  'crossdraw:custom-themes': ['crossdraw:themes-changed'],
  'crossdraw:toolbar-order': ['crossdraw:toolbar-changed'],
}

// ── Types ──────────────────────────────────────────────────────

interface PreferenceBlob {
  updatedAt: number
  data: Record<string, string>
}

// ── Helpers ────────────────────────────────────────────────────

export function collectPreferences(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of SYNCED_KEYS) {
    const val = localStorage.getItem(key)
    if (val !== null) result[key] = val
  }
  return result
}

export function applyPreferences(data: Record<string, string>): void {
  const eventsToFire = new Set<string>()
  for (const [key, value] of Object.entries(data)) {
    if (!SYNCED_KEYS.includes(key)) continue
    const current = localStorage.getItem(key)
    if (current !== value) {
      localStorage.setItem(key, value)
      const events = REFRESH_EVENTS[key]
      if (events) events.forEach((e) => eventsToFire.add(e))
    }
  }
  for (const event of eventsToFire) {
    window.dispatchEvent(new Event(event))
  }
}

export function computeHash(data: Record<string, string>): string {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  let hash = 0
  const str = JSON.stringify(entries)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const { apiKey } = getCloudConfig()
  if (apiKey) headers['X-API-Key'] = apiKey
  const token = await ensureValidToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ── API calls ──────────────────────────────────────────────────

export async function fetchServerPreferences(): Promise<PreferenceBlob | null> {
  try {
    const { serverUrl } = getCloudConfig()
    if (!serverUrl) return null
    const url = buildUrl(serverUrl, '/api/preferences')
    const res = await fetch(url, { method: 'GET', headers: await buildAuthHeaders() })
    if (res.status === 404) return null
    if (!res.ok) return null
    return (await res.json()) as PreferenceBlob
  } catch {
    return null
  }
}

export async function pushPreferences(blob: PreferenceBlob): Promise<boolean> {
  try {
    const { serverUrl } = getCloudConfig()
    if (!serverUrl) return false
    const url = buildUrl(serverUrl, '/api/preferences')
    const res = await fetch(url, {
      method: 'PUT',
      headers: await buildAuthHeaders(),
      body: JSON.stringify(blob),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Sync lifecycle ─────────────────────────────────────────────

let lastPushedHash = ''
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null
let initialSyncDone = false

const DEBOUNCE_MS = 2000
const POLL_MS = 5000

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    pushTimer = null
    const data = collectPreferences()
    const hash = computeHash(data)
    if (hash === lastPushedHash) return
    const ok = await pushPreferences({ updatedAt: Date.now(), data })
    if (ok) lastPushedHash = hash
  }, DEBOUNCE_MS)
}

function onStorageEvent(e: StorageEvent) {
  if (e.key && SYNCED_KEYS.includes(e.key)) {
    schedulePush()
  }
}

async function initialSync() {
  const remote = await fetchServerPreferences()
  if (remote && remote.data) {
    // Server wins on first load: merge remote into local
    applyPreferences(remote.data)
  }
  // Push current (merged) state to server
  const data = collectPreferences()
  const hash = computeHash(data)
  lastPushedHash = hash
  await pushPreferences({ updatedAt: Date.now(), data })
  initialSyncDone = true
}

export function startSync() {
  if (!isAuthenticated()) return
  stopSync()
  initialSyncDone = false
  lastPushedHash = ''

  initialSync()

  // Poll for local changes
  pollInterval = setInterval(() => {
    if (!initialSyncDone) return
    const data = collectPreferences()
    const hash = computeHash(data)
    if (hash !== lastPushedHash) {
      schedulePush()
    }
  }, POLL_MS)

  // Cross-tab changes
  window.addEventListener('storage', onStorageEvent)
}

export function stopSync() {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  window.removeEventListener('storage', onStorageEvent)
  initialSyncDone = false
}

// ── Auto-init ──────────────────────────────────────────────────

function onAuthChanged() {
  if (isAuthenticated()) {
    startSync()
  } else {
    stopSync()
  }
}

window.addEventListener('crossdraw:auth-changed', onAuthChanged)

// Start sync if already logged in when the module loads
if (isAuthenticated()) {
  startSync()
}
