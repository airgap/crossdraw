/**
 * Client-side library API for Crossdraw shared team libraries.
 *
 * Communicates with the Crossdraw server's /api/libraries endpoints
 * to publish, list, fetch, update, and delete shared libraries.
 */

import { getCloudConfig, buildUrl, type CloudConfig } from '@/cloud/cloud-client'
import type { SymbolDefinition, TextStyle, ColorStyle, EffectStyle } from '@/types'
import type { VariableCollection } from '@/variables/variable-types'

// ── Types ───────────────────────────────────────────────────────

/** Summary entry returned by list endpoint. */
export interface LibraryEntry {
  id: string
  name: string
  version: number
  symbolCount: number
  styleCount: number
  updatedAt: string
}

/** Full library data with all symbols, styles, and variables. */
export interface LibraryData {
  id: string
  name: string
  version: number
  symbols: SymbolDefinition[]
  textStyles: TextStyle[]
  colorStyles: ColorStyle[]
  effectStyles: EffectStyle[]
  variables: VariableCollection[]
}

/** Payload sent when publishing or updating a library. */
export interface LibraryPublishPayload {
  name: string
  symbols: SymbolDefinition[]
  textStyles: TextStyle[]
  colorStyles: ColorStyle[]
  effectStyles: EffectStyle[]
  variables: VariableCollection[]
}

// ── Request helpers ─────────────────────────────────────────────

function buildHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  return headers
}

// ── API methods ─────────────────────────────────────────────────

/** List all available libraries (summary only). */
export async function listLibraries(config?: CloudConfig): Promise<LibraryEntry[]> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, '/api/libraries')
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to list libraries: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LibraryEntry[]
}

/** Get the full library data by ID. */
export async function getLibrary(id: string, config?: CloudConfig): Promise<LibraryData> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/libraries/${id}`)
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to get library: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LibraryData
}

/** Publish a new library from the given payload. */
export async function publishLibrary(
  data: LibraryPublishPayload,
  config?: CloudConfig,
): Promise<LibraryEntry> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, '/api/libraries')
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(`Failed to publish library: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LibraryEntry
}

/** Update an existing library (bumps its version). */
export async function updateLibrary(
  id: string,
  data: LibraryPublishPayload,
  config?: CloudConfig,
): Promise<LibraryEntry> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/libraries/${id}`)
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(`Failed to update library: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as LibraryEntry
}

/** Delete a library by ID. */
export async function deleteLibrary(id: string, config?: CloudConfig): Promise<void> {
  const { serverUrl, apiKey } = config ?? getCloudConfig()
  const url = buildUrl(serverUrl, `/api/libraries/${id}`)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) {
    throw new Error(`Failed to delete library: ${res.status} ${res.statusText}`)
  }
}
