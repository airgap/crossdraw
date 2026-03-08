/**
 * Build script: bundles dist/ contents into a TypeScript module
 * that gets compiled into the standalone server binary.
 *
 * Run: bun server/bundle-dist.ts
 * Produces: server/dist-embed.ts
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, extname } from 'path'

const DIST_DIR = join(import.meta.dir, '..', 'dist')
const OUT_FILE = join(import.meta.dir, 'dist-embed.ts')

interface FileEntry {
  path: string
  mime: string
  b64: string
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

function collectFiles(dir: string, prefix: string = ''): FileEntry[] {
  const entries: FileEntry[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    const urlPath = prefix + '/' + entry.name
    if (entry.isDirectory()) {
      entries.push(...collectFiles(fullPath, urlPath))
    } else {
      const ext = extname(entry.name)
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
      const data = readFileSync(fullPath)
      entries.push({
        path: urlPath,
        mime,
        b64: data.toString('base64'),
        size: data.length,
      })
    }
  }
  return entries
}

const files = collectFiles(DIST_DIR)
const totalSize = files.reduce((s, f) => s + f.size, 0)

let code = `// AUTO-GENERATED — do not edit. Run: bun server/bundle-dist.ts\n`
code += `// ${files.length} files, ${Math.round(totalSize / 1024)}KB total\n\n`
code += `export interface EmbeddedFile { data: Buffer; mime: string; size: number }\n\n`
code += `const _d = (b64: string): Buffer => Buffer.from(b64, 'base64')\n\n`
code += `const _files: Array<[string, string, string]> = [\n`

for (const f of files) {
  code += `  [${JSON.stringify(f.path)}, ${JSON.stringify(f.mime)}, ${JSON.stringify(f.b64)}],\n`
}

code += `]\n\n`
code += `export const embeddedFiles: Map<string, EmbeddedFile> = new Map(\n`
code += `  _files.map(([path, mime, b64]) => {\n`
code += `    const data = _d(b64)\n`
code += `    return [path, { data, mime, size: data.length }]\n`
code += `  }),\n`
code += `)\n`

writeFileSync(OUT_FILE, code)
console.log(`Bundled ${files.length} files (${Math.round(totalSize / 1024)}KB) → ${OUT_FILE}`)
