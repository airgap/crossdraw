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

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2)
let port = 3000
let host = '0.0.0.0'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1]!, 10)
    i++
  } else if (args[i] === '--host' && args[i + 1]) {
    host = args[i + 1]!
    i++
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`Crossdraw Server v0.1.0

Usage:
  crossdraw-server [options]

Options:
  --port <number>   Port to listen on (default: 3000)
  --host <string>   Host to bind to (default: 0.0.0.0)
  --help, -h        Show this help message
`)
    process.exit(0)
  }
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
}

export interface FileIndex {
  files: CloudFileMetadata[]
}

const DATA_DIR = resolve(import.meta.dir, '..', 'data')
const FILES_DIR = join(DATA_DIR, 'files')
const INDEX_PATH = join(DATA_DIR, 'index.json')
const API_KEY = process.env['CROSSDRAW_API_KEY'] ?? ''

// Ensure data directories exist on startup
mkdirSync(FILES_DIR, { recursive: true })

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
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

function computeChecksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

function checkAuth(req: Request): boolean {
  if (!API_KEY) return true // No auth required in dev mode
  const header = req.headers.get('X-API-Key')
  return header === API_KEY
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  }
}

async function handleApiRequest(req: Request, pathname: string): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
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
      fileName = formData.get('name')?.toString() ?? file.name ?? 'Untitled.design'
    } else {
      fileData = new Uint8Array(await req.arrayBuffer())
      fileName = req.headers.get('X-File-Name') ?? 'Untitled.design'
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

  // Routes with :id
  const fileMatch = pathname.match(/^\/api\/files\/([a-z0-9]+)$/)
  const metaMatch = pathname.match(/^\/api\/files\/([a-z0-9]+)\/meta$/)

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
          'Content-Disposition': `attachment; filename="${entry.name}"`,
          'Access-Control-Allow-Origin': '*',
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
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
  }

  return errorResponse('Not found', 404)
}

// ── HTTP server ─────────────────────────────────────────────────

const server = Bun.serve({
  port,
  hostname: host,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // API routes
    if (pathname.startsWith('/api/')) {
      return handleApiRequest(req, pathname)
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
})

const totalKB = Math.round([...fileCache.values()].reduce((s, f) => s + f.size, 0) / 1024)

console.log(`
  Crossdraw Server v0.1.0 ${embedded ? '(standalone)' : '(filesystem)'}

  http://${host}:${port}
  ${fileCache.size} files, ${totalKB}KB
  Cloud storage: ${DATA_DIR}
  API auth: ${API_KEY ? 'enabled' : 'disabled (dev mode)'}
`)
