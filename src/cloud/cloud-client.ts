/**
 * Client-side cloud storage API for Crossdraw.
 *
 * Communicates with the Crossdraw server's /api/files endpoints
 * to upload, download, list, update, and delete design files.
 */

const STORAGE_KEY = 'crossdraw:cloud-config'

// ── Types ───────────────────────────────────────────────────────

export interface CloudConfig {
  serverUrl: string
  apiKey: string
}

export interface CloudFileEntry {
  id: string
  name: string
  size: number
  createdAt: string
  updatedAt: string
}

// ── Config persistence ──────────────────────────────────────────

const defaultConfig: CloudConfig = {
  serverUrl: '',
  apiKey: '',
}

export function getCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultConfig }
    const parsed = JSON.parse(raw) as Partial<CloudConfig>
    return {
      serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : defaultConfig.serverUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : defaultConfig.apiKey,
    }
  } catch {
    return { ...defaultConfig }
  }
}

export function setCloudConfig(config: CloudConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

// ── Request helpers ─────────────────────────────────────────────

export function buildUrl(serverUrl: string, path: string): string {
  const base = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl
  return `${base}${path}`
}

function buildHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  return headers
}

// ── API methods ─────────────────────────────────────────────────

export async function listCloudFiles(config?: CloudConfig): Promise<CloudFileEntry[]> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, '/api/files')
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to list files: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CloudFileEntry[]
}

export async function uploadFile(name: string, data: ArrayBuffer, config?: CloudConfig): Promise<CloudFileEntry> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, '/api/files')
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey, {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': name,
    }),
    body: data,
  })
  if (!res.ok) {
    throw new Error(`Failed to upload file: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CloudFileEntry
}

export async function downloadFile(id: string, config?: CloudConfig): Promise<ArrayBuffer> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/files/${id}`)
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`)
  }
  return res.arrayBuffer()
}

export async function updateFile(id: string, data: ArrayBuffer, config?: CloudConfig): Promise<CloudFileEntry> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/files/${id}`)
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(apiKey, {
      'Content-Type': 'application/octet-stream',
    }),
    body: data,
  })
  if (!res.ok) {
    throw new Error(`Failed to update file: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CloudFileEntry
}

export async function deleteFile(id: string, config?: CloudConfig): Promise<void> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/files/${id}`)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to delete file: ${res.status} ${res.statusText}`)
  }
}
