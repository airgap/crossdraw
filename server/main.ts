/**
 * Standalone web server for Crossdraw.
 *
 * Two modes:
 *   1. Standalone binary (bun build --compile) — serves from embedded dist/ assets
 *   2. Development (bun server/main.ts) — serves from filesystem dist/
 *
 * Usage:
 *   crossdraw-server              # serves on 0.0.0.0:3000
 *   crossdraw-server --port 8080  # custom port
 *   crossdraw-server --host 127.0.0.1 --port 9000
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join, extname, resolve } from 'path'
import { createHash } from 'crypto'
import { authenticateRequest } from './auth'

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2)
let port = 3000
let host = ''
let hostExplicit = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1]!, 10)
    i++
  } else if (args[i] === '--host' && args[i + 1]) {
    host = args[i + 1]!
    hostExplicit = true
    i++
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`Crossdraw Server v0.1.0

Usage:
  crossdraw-server [options]

Options:
  --port <number>   Port to listen on (default: 3000)
  --host <string>   Host to bind to (default: 127.0.0.1 without API key, 0.0.0.0 with)
  --help, -h        Show this help message
`)
    process.exit(0)
  }
}

// Default host: localhost when no API key is set (dev mode), 0.0.0.0 otherwise
if (!hostExplicit) {
  host = process.env['CROSSDRAW_API_KEY'] ? '0.0.0.0' : '127.0.0.1'
}

// ── File cache ──────────────────────────────────────────────────

interface CachedFile {
  data: Buffer
  mime: string
  size: number
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

const fileCache = new Map<string, CachedFile>()

// Try embedded assets first (compiled binary mode)
let embedded = false
try {
  const { embeddedFiles } = await import('./dist-embed')
  for (const [path, file] of embeddedFiles) {
    fileCache.set(path, file)
  }
  embedded = true
} catch {
  // Fall back to filesystem
  const DIST_DIR = resolve(import.meta.dir, '..', 'dist')

  function scanDir(dir: string, prefix: string = '') {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const urlPath = prefix + '/' + entry.name
      if (entry.isDirectory()) {
        scanDir(fullPath, urlPath)
      } else {
        const ext = extname(entry.name)
        const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
        const data = readFileSync(fullPath) as unknown as Buffer
        fileCache.set(urlPath, { data, mime, size: data.length })
      }
    }
  }

  scanDir(DIST_DIR)
}

// ── Cloud file storage ──────────────────────────────────────────

export interface CloudFileMetadata {
  id: string
  name: string
  size: number
  createdAt: string
  updatedAt: string
  checksum: string
  ownerId?: string
}

export interface FileIndex {
  files: CloudFileMetadata[]
}

const DATA_DIR = resolve(import.meta.dir, '..', 'data')
const FILES_DIR = join(DATA_DIR, 'files')
const SHARES_DIR = join(DATA_DIR, 'shares')
const INDEX_PATH = join(DATA_DIR, 'index.json')
const SHARES_INDEX_PATH = join(DATA_DIR, 'shares-index.json')
const API_KEY = process.env['CROSSDRAW_API_KEY'] ?? ''

const LIBRARIES_DIR = join(DATA_DIR, 'libraries')
const LIBRARIES_INDEX_PATH = join(DATA_DIR, 'libraries-index.json')
const PREFS_DIR = join(DATA_DIR, 'preferences')

// Ensure data directories exist on startup
mkdirSync(FILES_DIR, { recursive: true })
mkdirSync(SHARES_DIR, { recursive: true })
mkdirSync(LIBRARIES_DIR, { recursive: true })
mkdirSync(PREFS_DIR, { recursive: true })

export function loadIndex(): FileIndex {
  if (!existsSync(INDEX_PATH)) {
    return { files: [] }
  }
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8')
    return JSON.parse(raw) as FileIndex
  } catch {
    return { files: [] }
  }
}

export function saveIndex(index: FileIndex): void {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
}

export function addFileEntry(index: FileIndex, entry: CloudFileMetadata): FileIndex {
  return { files: [...index.files, entry] }
}

export function updateFileEntry(index: FileIndex, id: string, updates: Partial<CloudFileMetadata>): FileIndex {
  return {
    files: index.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
  }
}

export function removeFileEntry(index: FileIndex, id: string): FileIndex {
  return { files: index.files.filter((f) => f.id !== id) }
}

function generateId(): string {
  return crypto.randomUUID()
}

// ── Share link storage ───────────────────────────────────────────

export interface ShareMetadata {
  slug: string
  name: string
  passwordHash: string | null
  expiresAt: string | null
  viewCount: number
  createdAt: string
  /** 'view' (default) or 'edit' — edit shares create a collab room */
  permission?: 'view' | 'edit'
  /** Room ID for multiplayer collaboration (set when permission='edit') */
  roomId?: string
}

export interface ShareIndex {
  shares: ShareMetadata[]
}

export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let slug = ''
  for (const b of bytes) {
    slug += b.toString(36)
  }
  return slug.slice(0, 16)
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export function loadShareIndex(): ShareIndex {
  if (!existsSync(SHARES_INDEX_PATH)) {
    return { shares: [] }
  }
  try {
    const raw = readFileSync(SHARES_INDEX_PATH, 'utf-8')
    return JSON.parse(raw) as ShareIndex
  } catch {
    return { shares: [] }
  }
}

export function saveShareIndex(index: ShareIndex): void {
  writeFileSync(SHARES_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
}

export function isShareExpired(share: ShareMetadata): boolean {
  if (!share.expiresAt) return false
  return new Date(share.expiresAt).getTime() < Date.now()
}

// ── Library storage ─────────────────────────────────────────────

export interface LibraryMetadata {
  id: string
  name: string
  version: number
  symbolCount: number
  styleCount: number
  createdAt: string
  updatedAt: string
}

export interface LibraryIndex {
  libraries: LibraryMetadata[]
}

export function loadLibraryIndex(): LibraryIndex {
  if (!existsSync(LIBRARIES_INDEX_PATH)) {
    return { libraries: [] }
  }
  try {
    const raw = readFileSync(LIBRARIES_INDEX_PATH, 'utf-8')
    return JSON.parse(raw) as LibraryIndex
  } catch {
    return { libraries: [] }
  }
}

export function saveLibraryIndex(index: LibraryIndex): void {
  writeFileSync(LIBRARIES_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
}

function computeChecksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

// ── CORS origin allowlist ─────────────────────────────────────────
const ALLOWED_ORIGINS: string[] = process.env['CROSSDRAW_ALLOWED_ORIGINS']
  ? process.env['CROSSDRAW_ALLOWED_ORIGINS']
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : []

function getAllowedOrigin(req: Request): string {
  // Dev mode (no API key): allow everything
  if (!API_KEY) return '*'
  // If an explicit allowlist is configured, check the request Origin
  const origin = req.headers.get('Origin') ?? ''
  if (ALLOWED_ORIGINS.length > 0) {
    return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!
  }
  // API key set but no allowlist: deny cross-origin by default
  return ''
}

/** Legacy API key auth check — still used as fallback. */
function checkAuth(req: Request): boolean {
  if (!API_KEY) return true // No auth required in dev mode
  const header = req.headers.get('X-API-Key')
  if (header === API_KEY) return true
  // Also accept Bearer JWT tokens (validated elsewhere, but allow through if present)
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return true
  return false
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}

/** Add CORS headers to any response based on the incoming request. */
function withCors(res: Response, req: Request): Response {
  const origin = getAllowedOrigin(req)
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin)
  }
  return res
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  }
  const origin = getAllowedOrigin(req)
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

async function handleApiRequest(req: Request, pathname: string): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  // Auth check
  if (!checkAuth(req)) {
    return errorResponse('Unauthorized', 401)
  }

  // POST /api/files — upload a file
  if (pathname === '/api/files' && req.method === 'POST') {
    const contentType = req.headers.get('Content-Type') ?? ''
    let fileData: Uint8Array
    let fileName: string

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        return errorResponse('Missing "file" field in form data', 400)
      }
      fileData = new Uint8Array(await file.arrayBuffer())
      fileName = formData.get('name')?.toString() ?? file.name ?? 'Untitled.xd'
    } else {
      fileData = new Uint8Array(await req.arrayBuffer())
      fileName = req.headers.get('X-File-Name') ?? 'Untitled.xd'
    }

    const id = generateId()
    const now = new Date().toISOString()
    const checksum = computeChecksum(fileData)

    const entry: CloudFileMetadata = {
      id,
      name: fileName,
      size: fileData.length,
      createdAt: now,
      updatedAt: now,
      checksum,
    }

    // Write file to disk
    const filePath = join(FILES_DIR, id)
    writeFileSync(filePath, fileData)

    // Update index
    const index = loadIndex()
    const updated = addFileEntry(index, entry)
    saveIndex(updated)

    return jsonResponse(entry, 201)
  }

  // GET /api/files — list all files
  if (pathname === '/api/files' && req.method === 'GET') {
    const index = loadIndex()
    return jsonResponse(index.files)
  }

  // Routes with :id (UUIDs contain hyphens)
  const fileMatch = pathname.match(/^\/api\/files\/([a-z0-9-]+)$/)
  const metaMatch = pathname.match(/^\/api\/files\/([a-z0-9-]+)\/meta$/)

  // GET /api/files/:id/meta — file metadata only
  if (metaMatch && req.method === 'GET') {
    const id = metaMatch[1]!
    const index = loadIndex()
    const entry = index.files.find((f) => f.id === id)
    if (!entry) return errorResponse('File not found', 404)
    return jsonResponse(entry)
  }

  if (fileMatch) {
    const id = fileMatch[1]!
    const index = loadIndex()
    const entry = index.files.find((f) => f.id === id)

    // GET /api/files/:id — download file
    if (req.method === 'GET') {
      if (!entry) return errorResponse('File not found', 404)
      const filePath = join(FILES_DIR, id)
      if (!existsSync(filePath)) return errorResponse('File data missing', 404)
      const data = readFileSync(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(data.length),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.name.replace(/["\\r\\n]/g, '_'))}`,
        },
      })
    }

    // PUT /api/files/:id — update file
    if (req.method === 'PUT') {
      if (!entry) return errorResponse('File not found', 404)
      const fileData = new Uint8Array(await req.arrayBuffer())
      const now = new Date().toISOString()
      const checksum = computeChecksum(fileData)
      const newName = req.headers.get('X-File-Name') ?? entry.name

      const filePath = join(FILES_DIR, id)
      writeFileSync(filePath, fileData)

      const updatedIndex = updateFileEntry(index, id, {
        name: newName,
        size: fileData.length,
        updatedAt: now,
        checksum,
      })
      saveIndex(updatedIndex)

      const updatedEntry = updatedIndex.files.find((f) => f.id === id)!
      return jsonResponse(updatedEntry)
    }

    // DELETE /api/files/:id — delete file
    if (req.method === 'DELETE') {
      if (!entry) return errorResponse('File not found', 404)
      const filePath = join(FILES_DIR, id)
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
      const updatedIndex = removeFileEntry(index, id)
      saveIndex(updatedIndex)
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }
  }

  // ── Library endpoints ────────────────────────────────────────

  // POST /api/libraries — publish a new library
  if (pathname === '/api/libraries' && req.method === 'POST') {
    const body = (await req.json()) as {
      name?: string
      symbols?: unknown[]
      textStyles?: unknown[]
      colorStyles?: unknown[]
      effectStyles?: unknown[]
      variables?: unknown[]
    }
    if (!body.name || typeof body.name !== 'string') {
      return errorResponse('Missing library name', 400)
    }

    const id = generateId()
    const now = new Date().toISOString()
    const symbols = Array.isArray(body.symbols) ? body.symbols : []
    const textStyles = Array.isArray(body.textStyles) ? body.textStyles : []
    const colorStyles = Array.isArray(body.colorStyles) ? body.colorStyles : []
    const effectStyles = Array.isArray(body.effectStyles) ? body.effectStyles : []
    const variables = Array.isArray(body.variables) ? body.variables : []

    const libraryData = {
      id,
      name: body.name,
      version: 1,
      symbols,
      textStyles,
      colorStyles,
      effectStyles,
      variables,
    }

    // Write library data to disk
    const libPath = join(LIBRARIES_DIR, `${id}.json`)
    writeFileSync(libPath, JSON.stringify(libraryData, null, 2), 'utf-8')

    const meta: LibraryMetadata = {
      id,
      name: body.name,
      version: 1,
      symbolCount: symbols.length,
      styleCount: textStyles.length + colorStyles.length + effectStyles.length,
      createdAt: now,
      updatedAt: now,
    }

    const libIndex = loadLibraryIndex()
    libIndex.libraries.push(meta)
    saveLibraryIndex(libIndex)

    return jsonResponse(meta, 201)
  }

  // GET /api/libraries — list all libraries
  if (pathname === '/api/libraries' && req.method === 'GET') {
    const libIndex = loadLibraryIndex()
    return jsonResponse(libIndex.libraries)
  }

  // Routes with library :id
  const libMatch = pathname.match(/^\/api\/libraries\/([a-z0-9-]+)$/)
  if (libMatch) {
    const id = libMatch[1]!
    const libIndex = loadLibraryIndex()
    const meta = libIndex.libraries.find((l) => l.id === id)

    // GET /api/libraries/:id — get full library data
    if (req.method === 'GET') {
      if (!meta) return errorResponse('Library not found', 404)
      const libPath = join(LIBRARIES_DIR, `${id}.json`)
      if (!existsSync(libPath)) return errorResponse('Library data missing', 404)
      const raw = readFileSync(libPath, 'utf-8')
      return jsonResponse(JSON.parse(raw))
    }

    // PUT /api/libraries/:id — update a library (bumps version)
    if (req.method === 'PUT') {
      if (!meta) return errorResponse('Library not found', 404)
      const body = (await req.json()) as {
        name?: string
        symbols?: unknown[]
        textStyles?: unknown[]
        colorStyles?: unknown[]
        effectStyles?: unknown[]
        variables?: unknown[]
      }

      const now = new Date().toISOString()
      const newVersion = meta.version + 1
      const name = typeof body.name === 'string' ? body.name : meta.name
      const symbols = Array.isArray(body.symbols) ? body.symbols : []
      const textStyles = Array.isArray(body.textStyles) ? body.textStyles : []
      const colorStyles = Array.isArray(body.colorStyles) ? body.colorStyles : []
      const effectStyles = Array.isArray(body.effectStyles) ? body.effectStyles : []
      const variables = Array.isArray(body.variables) ? body.variables : []

      const libraryData = {
        id,
        name,
        version: newVersion,
        symbols,
        textStyles,
        colorStyles,
        effectStyles,
        variables,
      }

      const libPath = join(LIBRARIES_DIR, `${id}.json`)
      writeFileSync(libPath, JSON.stringify(libraryData, null, 2), 'utf-8')

      // Update index metadata
      meta.name = name
      meta.version = newVersion
      meta.symbolCount = symbols.length
      meta.styleCount = textStyles.length + colorStyles.length + effectStyles.length
      meta.updatedAt = now
      saveLibraryIndex(libIndex)

      return jsonResponse({
        id: meta.id,
        name: meta.name,
        version: meta.version,
        symbolCount: meta.symbolCount,
        styleCount: meta.styleCount,
        updatedAt: meta.updatedAt,
      })
    }

    // DELETE /api/libraries/:id — delete a library
    if (req.method === 'DELETE') {
      if (!meta) return errorResponse('Library not found', 404)
      const libPath = join(LIBRARIES_DIR, `${id}.json`)
      if (existsSync(libPath)) {
        unlinkSync(libPath)
      }
      libIndex.libraries = libIndex.libraries.filter((l) => l.id !== id)
      saveLibraryIndex(libIndex)
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }
  }

  // ── Share endpoints ──────────────────────────────────────────

  // POST /api/shares — create a share link
  if (pathname === '/api/shares' && req.method === 'POST') {
    const body = (await req.json()) as {
      documentData: string
      password?: string
      expiresAt?: string
      name?: string
      permission?: 'view' | 'edit'
    }

    if (!body.documentData) {
      return errorResponse('Missing documentData (base64)', 400)
    }

    // Validate expiresAt if provided
    if (body.expiresAt) {
      const expiry = new Date(body.expiresAt)
      if (isNaN(expiry.getTime())) {
        return errorResponse('Invalid expiresAt date', 400)
      }
      if (expiry.getTime() <= Date.now()) {
        return errorResponse('expiresAt must be in the future', 400)
      }
    }

    const slug = generateSlug()
    const now = new Date().toISOString()
    const permission = body.permission === 'edit' ? 'edit' : 'view'
    const roomId = permission === 'edit' ? `share-${slug}` : undefined

    const meta: ShareMetadata = {
      slug,
      name: body.name ?? 'Untitled',
      passwordHash: body.password ? await hashPassword(body.password) : null,
      expiresAt: body.expiresAt ?? null,
      viewCount: 0,
      createdAt: now,
      permission,
      roomId,
    }

    // Write document data to shares directory
    const shareFilePath = join(SHARES_DIR, slug)
    writeFileSync(shareFilePath, body.documentData, 'utf-8')

    // Update index
    const shareIndex = loadShareIndex()
    shareIndex.shares.push(meta)
    saveShareIndex(shareIndex)

    return jsonResponse({ slug, url: `/share/${slug}`, permission, roomId }, 201)
  }

  // GET /api/shares — list all shares
  if (pathname === '/api/shares' && req.method === 'GET') {
    const shareIndex = loadShareIndex()
    const entries = shareIndex.shares
      .filter((s) => !isShareExpired(s))
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        viewCount: s.viewCount,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        hasPassword: s.passwordHash !== null,
        permission: s.permission ?? 'view',
        roomId: s.roomId ?? null,
      }))
    return jsonResponse(entries)
  }

  // Routes with :slug
  const shareDataMatch = pathname.match(/^\/api\/shares\/([a-z0-9]+)\/data$/)
  const shareViewMatch = pathname.match(/^\/api\/shares\/([a-z0-9]+)\/view$/)
  const shareMatch = pathname.match(/^\/api\/shares\/([a-z0-9]+)$/)

  // GET /api/shares/:slug/data — return raw document data for edit shares
  if (shareDataMatch && req.method === 'GET') {
    const slug = shareDataMatch[1]!
    const shareIndex = loadShareIndex()
    const share = shareIndex.shares.find((s) => s.slug === slug)

    if (!share) return errorResponse('Share not found', 404)
    if (isShareExpired(share)) return errorResponse('Share has expired', 410)
    if ((share.permission ?? 'view') !== 'edit') {
      return errorResponse('This share does not allow editing', 403)
    }

    const shareFilePath = join(SHARES_DIR, slug)
    if (!existsSync(shareFilePath)) return errorResponse('Share data missing', 404)
    const documentBase64 = readFileSync(shareFilePath, 'utf-8')

    return jsonResponse(
      {
        documentData: documentBase64,
        name: share.name,
        roomId: share.roomId,
        permission: share.permission,
      },
      200,
    )
  }

  // GET /api/shares/:slug/view — returns HTML page with embedded prototype player
  if (shareViewMatch && req.method === 'GET') {
    const slug = shareViewMatch[1]!
    const shareIndex = loadShareIndex()
    const share = shareIndex.shares.find((s) => s.slug === slug)

    if (!share) return errorResponse('Share not found', 404)
    if (isShareExpired(share)) return errorResponse('Share has expired', 410)

    // Check password if protected
    if (share.passwordHash) {
      const viewUrl = new URL(req.url)
      const providedPassword = viewUrl.searchParams.get('password')
      if (!providedPassword) {
        return new Response(generatePasswordPage(slug, share.name), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      if (!(await verifyPassword(providedPassword, share.passwordHash))) {
        return new Response(generatePasswordPage(slug, share.name, true), {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
    }

    // Read document data
    const shareFilePath = join(SHARES_DIR, slug)
    if (!existsSync(shareFilePath)) return errorResponse('Share data missing', 404)
    const documentBase64 = readFileSync(shareFilePath, 'utf-8')

    // Increment view count
    share.viewCount++
    saveShareIndex(shareIndex)

    // Return HTML with inline viewer
    const html = generateShareViewerPage(share.name, documentBase64)
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (shareMatch) {
    const slug = shareMatch[1]!
    const shareIndex = loadShareIndex()
    const share = shareIndex.shares.find((s) => s.slug === slug)

    // GET /api/shares/:slug — share metadata
    if (req.method === 'GET') {
      if (!share) return errorResponse('Share not found', 404)
      return jsonResponse({
        slug: share.slug,
        name: share.name,
        createdAt: share.createdAt,
        hasPassword: share.passwordHash !== null,
        viewCount: share.viewCount,
        expiresAt: share.expiresAt,
        permission: share.permission ?? 'view',
        roomId: share.roomId ?? null,
      })
    }

    // DELETE /api/shares/:slug — delete share
    if (req.method === 'DELETE') {
      if (!share) return errorResponse('Share not found', 404)
      const shareFilePath = join(SHARES_DIR, slug)
      if (existsSync(shareFilePath)) {
        unlinkSync(shareFilePath)
      }
      shareIndex.shares = shareIndex.shares.filter((s) => s.slug !== slug)
      saveShareIndex(shareIndex)
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }
  }

  // ── Preferences (cloud sync) ────────────────────────────────

  if (pathname === '/api/preferences') {
    const authResult = await authenticateRequest(req)
    if (!authResult.authenticated || authResult.user.id === '__anonymous__') {
      return errorResponse('Authentication required', 401)
    }
    const userId = authResult.user.id
    const prefsPath = join(PREFS_DIR, `${userId}.json`)

    if (req.method === 'GET') {
      if (!existsSync(prefsPath)) return errorResponse('No preferences', 404)
      try {
        const raw = readFileSync(prefsPath, 'utf-8')
        return jsonResponse(JSON.parse(raw))
      } catch {
        return errorResponse('Failed to read preferences', 500)
      }
    }

    if (req.method === 'PUT') {
      try {
        const body = (await req.json()) as { updatedAt?: number; data?: Record<string, string> }
        if (typeof body.updatedAt !== 'number' || typeof body.data !== 'object' || body.data === null) {
          return errorResponse('Invalid preferences format', 400)
        }
        writeFileSync(prefsPath, JSON.stringify(body, null, 2), 'utf-8')
        return jsonResponse({ ok: true })
      } catch {
        return errorResponse('Failed to save preferences', 500)
      }
    }
  }

  return errorResponse('Not found', 404)
}

// ── Share viewer HTML generators ─────────────────────────────────

function generatePasswordPage(slug: string, name: string, wrongPassword = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} — Crossdraw Share</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
    .error { color: #ef4444; font-size: 13px; margin-bottom: 12px; }
    input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #333;
      border-radius: 6px;
      background: #111;
      color: #fff;
      font-size: 14px;
      margin-bottom: 16px;
      outline: none;
    }
    input[type="password"]:focus { border-color: #2563eb; }
    button {
      width: 100%;
      padding: 10px 14px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Password Protected</h1>
    <p class="subtitle">${escapeHtml(name)}</p>
    ${wrongPassword ? '<p class="error">Incorrect password. Please try again.</p>' : ''}
    <form method="GET" action="/api/shares/${slug}/view">
      <input type="password" name="password" placeholder="Enter password" autofocus required>
      <button type="submit">View Prototype</button>
    </form>
  </div>
</body>
</html>`
}

function generateShareViewerPage(name: string, documentBase64: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} — Crossdraw Prototype</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #1a1a1a;
      color: #e0e0e0;
      overflow: hidden;
      height: 100vh;
    }
    #loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 12px;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid #333;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #top-bar {
      height: 40px;
      background: #222;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
    }
    #top-bar .title { color: #888; font-size: 13px; }
    #top-bar .brand { color: #555; font-size: 12px; }
    #viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      cursor: default;
    }
    #artboard-container {
      box-shadow: 0 4px 40px rgba(0,0,0,0.5);
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }
    #artboard-canvas { display: block; }
    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    #bottom-bar {
      height: 32px;
      background: #222;
      border-top: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #555;
      cursor: pointer;
      transition: background 150ms;
    }
    .dot.active { background: #4a7dff; }
    #error-msg {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: #888;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span style="color: #888; font-size: 14px;">Loading prototype...</span>
  </div>
  <div id="app" style="display:none">
    <div id="top-bar">
      <span class="title" id="artboard-name">${escapeHtml(name)}</span>
      <span class="brand">Crossdraw</span>
    </div>
    <div id="viewport">
      <div id="artboard-container">
        <canvas id="artboard-canvas"></canvas>
      </div>
    </div>
    <div id="bottom-bar"></div>
  </div>
  <script>
  (function() {
    var docBase64 = ${JSON.stringify(documentBase64)};
    var docBytes = Uint8Array.from(atob(docBase64), function(c) { return c.charCodeAt(0); });

    // Minimal msgpack decoder for the embedded document
    ${MSGPACK_DECODER_JS}

    // Minimal .design file decoder
    function decodeDesignFile(buf) {
      var view = new DataView(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      var magic = '';
      for (var i = 0; i < 6; i++) magic += String.fromCharCode(buf[i]);
      if (magic !== 'DESIGN') throw new Error('Invalid file');
      var payloadLen = view.getUint32(12, true);
      var payload = buf.slice(16, 16 + payloadLen);
      return msgpackDecode(payload);
    }

    try {
      var doc = decodeDesignFile(docBytes);
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'flex';

      var artboards = doc.artboards || [];
      if (artboards.length === 0) {
        document.getElementById('app').style.display = 'none';
        var errDiv = document.createElement('div');
        errDiv.id = 'error-msg';
        errDiv.textContent = 'No artboards in this document.';
        document.body.appendChild(errDiv);
        return;
      }

      var currentIndex = 0;
      var canvas = document.getElementById('artboard-canvas');
      var ctx = canvas.getContext('2d');
      var container = document.getElementById('artboard-container');
      var viewport = document.getElementById('viewport');
      var nameEl = document.getElementById('artboard-name');
      var dotsBar = document.getElementById('bottom-bar');

      function getScale(ab) {
        var vr = viewport.getBoundingClientRect();
        var pad = 40;
        var sx = (vr.width - pad * 2) / ab.width;
        var sy = (vr.height - pad * 2) / ab.height;
        return Math.min(sx, sy, 1);
      }

      function renderLayer(ctx, layer) {
        if (!layer.visible) return;
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        var t = layer.transform;
        ctx.translate(t.x, t.y);
        ctx.scale(t.scaleX, t.scaleY);
        if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);

        if (layer.type === 'vector') {
          if (layer.fill && layer.fill.type === 'solid' && layer.fill.color) {
            ctx.fillStyle = layer.fill.color;
            ctx.globalAlpha = layer.opacity * layer.fill.opacity;
            (layer.paths || []).forEach(function(path) {
              var p = new Path2D();
              (path.segments || []).forEach(function(s) {
                if (s.type === 'move') p.moveTo(s.x, s.y);
                else if (s.type === 'line') p.lineTo(s.x, s.y);
                else if (s.type === 'cubic') p.bezierCurveTo(s.cp1x, s.cp1y, s.cp2x, s.cp2y, s.x, s.y);
                else if (s.type === 'quadratic') p.quadraticCurveTo(s.cpx, s.cpy, s.x, s.y);
                else if (s.type === 'close') p.closePath();
              });
              ctx.fill(p, path.fillRule || 'nonzero');
            });
          }
          if (layer.stroke) {
            ctx.strokeStyle = layer.stroke.color;
            ctx.lineWidth = layer.stroke.width;
            ctx.globalAlpha = layer.opacity * layer.stroke.opacity;
            ctx.lineCap = layer.stroke.linecap;
            ctx.lineJoin = layer.stroke.linejoin;
            (layer.paths || []).forEach(function(path) {
              var p = new Path2D();
              (path.segments || []).forEach(function(s) {
                if (s.type === 'move') p.moveTo(s.x, s.y);
                else if (s.type === 'line') p.lineTo(s.x, s.y);
                else if (s.type === 'cubic') p.bezierCurveTo(s.cp1x, s.cp1y, s.cp2x, s.cp2y, s.x, s.y);
                else if (s.type === 'quadratic') p.quadraticCurveTo(s.cpx, s.cpy, s.x, s.y);
                else if (s.type === 'close') p.closePath();
              });
              ctx.stroke(p);
            });
          }
        } else if (layer.type === 'text') {
          ctx.font = (layer.fontStyle === 'italic' ? 'italic ' : '') + layer.fontWeight + ' ' + layer.fontSize + 'px ' + layer.fontFamily;
          ctx.fillStyle = layer.color;
          ctx.textAlign = layer.textAlign;
          ctx.textBaseline = 'top';
          var lines = layer.text.split('\\n');
          var lineH = layer.fontSize * layer.lineHeight;
          for (var li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], 0, li * lineH);
          }
        } else if (layer.type === 'group') {
          (layer.children || []).forEach(function(child) { renderLayer(ctx, child); });
        }
        ctx.restore();
      }

      function renderArtboard(index) {
        var ab = artboards[index];
        var scale = getScale(ab);
        canvas.width = ab.width;
        canvas.height = ab.height;
        canvas.style.width = (ab.width * scale) + 'px';
        canvas.style.height = (ab.height * scale) + 'px';
        container.style.width = (ab.width * scale) + 'px';
        container.style.height = (ab.height * scale) + 'px';
        ctx.fillStyle = ab.backgroundColor;
        ctx.fillRect(0, 0, ab.width, ab.height);
        (ab.layers || []).forEach(function(layer) { renderLayer(ctx, layer); });
        nameEl.textContent = ab.name;
        var dots = dotsBar.querySelectorAll('.dot');
        dots.forEach(function(d, di) {
          d.classList.toggle('active', di === index);
        });
      }

      // Build dots
      artboards.forEach(function(ab, i) {
        var dot = document.createElement('div');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.title = ab.name;
        dot.addEventListener('click', function() {
          currentIndex = i;
          renderArtboard(i);
        });
        dotsBar.appendChild(dot);
      });

      // Handle clicks for interactions
      viewport.addEventListener('click', function(e) {
        var ab = artboards[currentIndex];
        var scale = getScale(ab);
        var cr = container.getBoundingClientRect();
        var clickX = (e.clientX - cr.left) / scale;
        var clickY = (e.clientY - cr.top) / scale;
        if (clickX < 0 || clickX > ab.width || clickY < 0 || clickY > ab.height) return;

        function findInteraction(layers) {
          for (var fi = layers.length - 1; fi >= 0; fi--) {
            var l = layers[fi];
            if (l.interactions && l.interactions.length > 0) {
              var lt = l.transform;
              var hit = clickX >= lt.x && clickY >= lt.y;
              if (hit) {
                var ix = l.interactions.find(function(x) { return x.trigger === 'click'; });
                if (ix && ix.action && ix.action.type === 'navigate') {
                  var targetId = ix.action.targetArtboardId;
                  var idx = artboards.findIndex(function(a) { return a.id === targetId; });
                  if (idx >= 0) {
                    currentIndex = idx;
                    renderArtboard(idx);
                    return true;
                  }
                }
                if (ix && ix.action && ix.action.type === 'url') {
                  try {
                    var parsed = new URL(ix.action.url, window.location.href);
                    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                      window.open(ix.action.url, '_blank');
                    }
                  } catch(e) {}
                  return true;
                }
              }
            }
            if (l.type === 'group' && l.children) {
              if (findInteraction(l.children)) return true;
            }
          }
          return false;
        }
        findInteraction(ab.layers || []);
      });

      renderArtboard(0);
      window.addEventListener('resize', function() { renderArtboard(currentIndex); });

    } catch(err) {
      document.getElementById('loading').style.display = 'none';
      var errDiv = document.createElement('div');
      errDiv.id = 'error-msg';
      errDiv.textContent = 'Failed to load prototype: ' + err.message;
      document.body.appendChild(errDiv);
    }
  })();
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Inline minimal msgpack decoder in JavaScript for the share viewer page.
// This avoids requiring the client to load any external dependencies.
const MSGPACK_DECODER_JS = `
function msgpackDecode(data) {
  var offset = 0;
  function u8() { return data[offset++]; }
  function u16() { return (u8() << 8) | u8(); }
  function u32() { return (u8() << 24 | u8() << 16 | u8() << 8 | u8()) >>> 0; }
  function i8() { var v = u8(); return v > 127 ? v - 256 : v; }
  function i16() { var v = u16(); return v > 32767 ? v - 65536 : v; }
  function i32() { var v = u32(); return v > 2147483647 ? v - 4294967296 : v; }
  function readFloat32() {
    var buf = new ArrayBuffer(4);
    var view = new DataView(buf);
    for (var i = 0; i < 4; i++) view.setUint8(i, u8());
    return view.getFloat32(0);
  }
  function readFloat64() {
    var buf = new ArrayBuffer(8);
    var view = new DataView(buf);
    for (var i = 0; i < 8; i++) view.setUint8(i, u8());
    return view.getFloat64(0);
  }
  function readStr(len) {
    var s = '';
    for (var i = 0; i < len; i++) {
      var c = u8();
      if (c < 128) { s += String.fromCharCode(c); }
      else if (c < 224) { s += String.fromCharCode(((c & 31) << 6) | (u8() & 63)); i++; }
      else if (c < 240) { s += String.fromCharCode(((c & 15) << 12) | ((u8() & 63) << 6) | (u8() & 63)); i += 2; }
      else { var cp = ((c & 7) << 18) | ((u8() & 63) << 12) | ((u8() & 63) << 6) | (u8() & 63); i += 3; if (cp > 0xFFFF) { cp -= 0x10000; s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); } else { s += String.fromCharCode(cp); } }
    }
    return s;
  }
  function readBin(len) {
    var arr = data.slice(offset, offset + len);
    offset += len;
    return arr;
  }
  function readArray(len) {
    var arr = [];
    for (var i = 0; i < len; i++) arr.push(decode());
    return arr;
  }
  function readMap(len) {
    var obj = {};
    for (var i = 0; i < len; i++) {
      var key = decode();
      obj[key] = decode();
    }
    return obj;
  }
  function decode() {
    var b = u8();
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 256;
    if ((b & 0xf0) === 0x80) return readMap(b & 0x0f);
    if ((b & 0xf0) === 0x90) return readArray(b & 0x0f);
    if ((b & 0xe0) === 0xa0) return readStr(b & 0x1f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return readBin(u8());
      case 0xc5: return readBin(u16());
      case 0xc6: return readBin(u32());
      case 0xca: return readFloat32();
      case 0xcb: return readFloat64();
      case 0xcc: return u8();
      case 0xcd: return u16();
      case 0xce: return u32();
      case 0xcf: { var hi = u32(), lo = u32(); return hi * 4294967296 + lo; }
      case 0xd0: return i8();
      case 0xd1: return i16();
      case 0xd2: return i32();
      case 0xd9: return readStr(u8());
      case 0xda: return readStr(u16());
      case 0xdb: return readStr(u32());
      case 0xdc: return readArray(u16());
      case 0xdd: return readArray(u32());
      case 0xde: return readMap(u16());
      case 0xdf: return readMap(u32());
      case 0xd4: u8(); u8(); return undefined;
      case 0xd5: u8(); u8(); u8(); return undefined;
      case 0xd6: offset += 5; return undefined;
      case 0xd7: offset += 9; return undefined;
      case 0xd8: offset += 17; return undefined;
      case 0xc7: { var extLen1 = u8(); offset += extLen1 + 1; return undefined; }
      case 0xc8: { var extLen2 = u16(); offset += extLen2 + 1; return undefined; }
      case 0xc9: { var extLen3 = u32(); offset += extLen3 + 1; return undefined; }
      default: return undefined;
    }
  }
  return decode();
}
`

// ── WebSocket collaboration ────────────────────────────────────

import { handleWSUpgrade, websocketHandlers, getWSStats, type WSData } from './ws'

// ── HTTP server ─────────────────────────────────────────────────

const server = Bun.serve<WSData>({
  port,
  hostname: host,
  async fetch(req, server) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // WebSocket upgrade for collaboration
    if (pathname === '/ws' || pathname === '/ws/') {
      const upgradeResult = await handleWSUpgrade(req, server)
      if (upgradeResult) return upgradeResult
      // null means upgrade succeeded
      return new Response(null, { status: 101 })
    }

    // API routes — wrap response with CORS headers
    if (pathname.startsWith('/api/')) {
      const res = await handleApiRequest(req, pathname)
      return withCors(res, req)
    }

    // Share preview shortcut: /share/:slug → redirect to /api/shares/:slug/view
    const sharePageMatch = pathname.match(/^\/share\/([a-z0-9]+)$/)
    if (sharePageMatch) {
      const shareSlug = sharePageMatch[1]!
      const query = url.search || ''
      return Response.redirect(`${url.origin}/api/shares/${shareSlug}/view${query}`, 302)
    }

    // Try exact match
    let file = fileCache.get(pathname)

    // Directory → index.html
    if (!file && (pathname === '/' || pathname.endsWith('/'))) {
      file = fileCache.get(pathname + 'index.html')
    }

    // SPA fallback for non-asset routes
    if (!file) {
      const ext = extname(pathname)
      if (!ext || !MIME_TYPES[ext]) {
        file = fileCache.get('/index.html')
      }
    }

    if (file) {
      const headers: Record<string, string> = {
        'Content-Type': file.mime,
        'Content-Length': String(file.size),
      }

      if (pathname.startsWith('/assets/')) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable'
      } else {
        headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      }

      return new Response(file.data, { headers })
    }

    return new Response('Not Found', { status: 404 })
  },
  websocket: websocketHandlers as any,
})

const totalKB = Math.round([...fileCache.values()].reduce((s, f) => s + f.size, 0) / 1024)

console.log(`
  Crossdraw Server v0.1.0 ${embedded ? '(standalone)' : '(filesystem)'}

  http://${host}:${port}
  ws://${host}:${port}/ws
  ${fileCache.size} files, ${totalKB}KB
  Cloud storage: ${DATA_DIR}
  API auth: ${API_KEY ? 'enabled' : 'disabled (dev mode)'}
  WebSocket: enabled
`)

if (!API_KEY) {
  console.warn(`
  ╔══════════════════════════════════════════════════════════════╗
  ║  WARNING: No CROSSDRAW_API_KEY set — API is unauthenticated ║
  ║  Set CROSSDRAW_API_KEY env var before exposing to a network  ║
  ╚══════════════════════════════════════════════════════════════╝
`)
}
