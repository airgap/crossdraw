/**
 * Client-side share API for Crossdraw prototype preview URLs.
 *
 * Communicates with the Crossdraw server's /api/shares endpoints
 * to create, list, and delete shareable prototype preview links.
 */

import { getCloudConfig, buildUrl } from '@/cloud/cloud-client'
import type { CloudConfig } from '@/cloud/cloud-client'

// ── Types ───────────────────────────────────────────────────────

export interface ShareEntry {
  slug: string
  name: string
  viewCount: number
  createdAt: string
  expiresAt: string | null
  hasPassword: boolean
}

export interface CreateShareResult {
  slug: string
  url: string
}

export interface CreateShareOptions {
  password?: string
  expiresAt?: string
}

// ── Request helpers ─────────────────────────────────────────────

function buildHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  return headers
}

// ── API methods ─────────────────────────────────────────────────

/**
 * Create a share link for the given document data.
 * Encodes the document binary as base64 and uploads it.
 */
export async function createShare(
  documentData: ArrayBuffer,
  options: CreateShareOptions = {},
  config?: CloudConfig,
): Promise<CreateShareResult> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(documentData)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const documentBase64 = btoa(binary)

  const body: Record<string, string> = {
    documentData: documentBase64,
  }
  if (options.password) {
    body['password'] = options.password
  }
  if (options.expiresAt) {
    body['expiresAt'] = options.expiresAt
  }

  // Extract document name from the binary header if possible
  // The document name comes from the store, so we pass it separately
  const url = buildUrl(serverUrl, '/api/shares')
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `Failed to create share: ${res.status}`)
  }

  return (await res.json()) as CreateShareResult
}

/**
 * Create a share link with an explicit document name.
 */
export async function createShareWithName(
  documentData: ArrayBuffer,
  name: string,
  options: CreateShareOptions = {},
  config?: CloudConfig,
): Promise<CreateShareResult> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()

  const bytes = new Uint8Array(documentData)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const documentBase64 = btoa(binary)

  const body: Record<string, string> = {
    documentData: documentBase64,
    name,
  }
  if (options.password) {
    body['password'] = options.password
  }
  if (options.expiresAt) {
    body['expiresAt'] = options.expiresAt
  }

  const url = buildUrl(serverUrl, '/api/shares')
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error ?? `Failed to create share: ${res.status}`)
  }

  return (await res.json()) as CreateShareResult
}

/**
 * Delete a share by slug.
 */
export async function deleteShare(slug: string, config?: CloudConfig): Promise<void> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/shares/${slug}`)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to delete share: ${res.status} ${res.statusText}`)
  }
}

/**
 * List all active (non-expired) shares.
 */
export async function listShares(config?: CloudConfig): Promise<ShareEntry[]> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, '/api/shares')
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to list shares: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ShareEntry[]
}

/**
 * Build the full shareable URL for a given slug and server URL.
 */
export function getShareUrl(slug: string, serverUrl?: string): string {
  const base = serverUrl ?? getCloudConfig().serverUrl
  return buildUrl(base, `/share/${slug}`)
}
