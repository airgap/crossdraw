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

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, extname, resolve } from 'path'

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

// ── HTTP server ─────────────────────────────────────────────────

const server = Bun.serve({
  port,
  hostname: host,
  fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

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
`)
