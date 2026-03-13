/**
 * Share links for collaborative document access.
 *
 * Features:
 * - Create share links with view/comment/edit permissions
 * - Optional password protection and expiration
 * - Token-based validation
 *
 * @module collab/share
 */

import { v4 as uuid } from 'uuid'

// ── Types ──

export type SharePermission = 'view' | 'comment' | 'edit'

export interface ShareLink {
  token: string
  docId: string
  permission: SharePermission
  createdAt: number
  expiresAt?: number
  password?: string
  createdBy: string
  label?: string
}

// ── In-memory store (client-side management) ──

const shareLinks = new Map<string, ShareLink>()

/**
 * Create a share link for a document.
 */
export function createShareLink(
  docId: string,
  permission: SharePermission,
  options: {
    expiresAt?: number
    password?: string
    createdBy?: string
    label?: string
  } = {},
): ShareLink {
  const link: ShareLink = {
    token: uuid(),
    docId,
    permission,
    createdAt: Date.now(),
    expiresAt: options.expiresAt,
    password: options.password,
    createdBy: options.createdBy ?? 'anonymous',
    label: options.label,
  }
  shareLinks.set(link.token, link)
  return link
}

/**
 * Revoke a share link by token.
 * Returns true if the link was found and revoked.
 */
export function revokeShareLink(token: string): boolean {
  return shareLinks.delete(token)
}

/**
 * Validate a share token.
 * Returns the ShareLink if valid, or null if invalid/expired.
 */
export function validateShareToken(token: string, password?: string): ShareLink | null {
  const link = shareLinks.get(token)
  if (!link) return null

  // Check expiration
  if (link.expiresAt && Date.now() > link.expiresAt) {
    // Expired — remove it
    shareLinks.delete(token)
    return null
  }

  // Check password
  if (link.password && link.password !== password) {
    return null
  }

  return link
}

/**
 * List all share links for a document.
 */
export function listShareLinks(docId: string): ShareLink[] {
  const result: ShareLink[] = []
  for (const link of shareLinks.values()) {
    if (link.docId === docId) {
      result.push(link)
    }
  }
  return result.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * List all share links (across all documents).
 */
export function listAllShareLinks(): ShareLink[] {
  return Array.from(shareLinks.values()).sort((a, b) => a.createdAt - b.createdAt)
}

/** Get a share link by token. */
export function getShareLink(token: string): ShareLink | undefined {
  return shareLinks.get(token)
}

/** Clear all share links (for testing). */
export function clearShareLinks(): void {
  shareLinks.clear()
}

/**
 * Build a shareable URL from a token and base URL.
 */
export function buildShareUrl(baseUrl: string, token: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${base}/share/${token}`
}

/**
 * Update the permission level of an existing share link.
 * Returns the updated link or null if not found.
 */
export function updateSharePermission(token: string, permission: SharePermission): ShareLink | null {
  const link = shareLinks.get(token)
  if (!link) return null
  link.permission = permission
  return link
}
