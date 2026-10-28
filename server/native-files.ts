// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  constants,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pack, unpack } from 'msgpackr'
import type { AuthenticatedUser } from './auth'

const MAX_FILE = 32 * 1024 * 1024
const MAX_RECORD = 96 * 1024 * 1024
const MAX_OPS = 10000
const directory = resolve(process.env['CROSSDRAW_DATA_DIR'] ?? join(import.meta.dir, '..', 'data'), 'native-files')
export interface Metadata {
  id: string
  name: string
  size: number
  createdAt: string
  updatedAt: string
  checksum: string
  ownerId: string
  revision: number
  access: 'view' | 'edit'
}
export interface Operation {
  id: string
  clientId: string
  timestamp: number
  type: string
  path: string[]
  value?: unknown
  chunkId?: string
  data?: number[]
  width?: number
  height?: number
  unset?: string[]
}
interface Receipt {
  actor: string
  fingerprint: string
  revision: number
  id: string
}
interface RecordFile {
  metadata: Metadata
  crow: string
  createKey: string
  createFingerprint: string
  receipts: Receipt[]
  deleted: boolean
}
export class FileError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id)
const filePath = (id: string) => {
  if (!validId(id)) throw new FileError(400, 'Invalid file identity')
  return join(directory, `${id}.json`)
}
function ensureDirectory() {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())
    throw new FileError(500, 'Storage directory is unsafe')
}
function load(id: string): RecordFile {
  ensureDirectory()
  let fd: number | undefined
  try {
    fd = openSync(filePath(id), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const data = readFileSync(fd)
    if (data.length > MAX_RECORD) throw new FileError(413, 'Document record is too large')
    return JSON.parse(data.toString()) as RecordFile
  } catch (error) {
    if (error instanceof FileError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new FileError(404, 'File not found')
    throw new FileError(500, 'Could not read document storage')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
function persist(record: RecordFile) {
  ensureDirectory()
  const data = JSON.stringify(record)
  if (Buffer.byteLength(data) > MAX_RECORD) throw new FileError(413, 'Document history is full')
  const path = filePath(record.metadata.id)
  const temporary = `${path}.${randomUUID()}.tmp`
  let fd: number | undefined
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    writeFileSync(fd, data)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temporary, path)
    const dir = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY)
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}
function access(record: RecordFile, user: AuthenticatedUser, write = false) {
  if (record.deleted) throw new FileError(404, 'File not found')
  if (record.metadata.ownerId !== user.id) throw new FileError(403, 'File access denied')
  return 'edit' as const
}
function metadata(record: RecordFile, user: AuthenticatedUser): Metadata {
  return { ...record.metadata, access: access(record, user) }
}
function decode(bytes: Uint8Array): any {
  if (bytes.length < 16 || bytes.length > MAX_FILE || Buffer.from(bytes.subarray(0, 6)).toString() !== 'DESIGN')
    throw new FileError(400, 'Invalid crow file')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(6, true) !== 3 || view.getUint8(10) !== 0 || view.getUint32(12, true) !== bytes.length - 16)
    throw new FileError(400, 'Unsupported crow format')
  let root: any
  try {
    root = unpack(bytes.subarray(16))
  } catch {
    throw new FileError(400, 'Invalid crow payload')
  }
  if (
    !root ||
    typeof root !== 'object' ||
    Array.isArray(root) ||
    typeof root.id !== 'string' ||
    !root.metadata ||
    !Array.isArray(root.artboards)
  )
    throw new FileError(400, 'Invalid crow document')
  return root
}
function encode(root: any): Uint8Array {
  const payload = pack(root)
  const bytes = Buffer.alloc(16 + payload.length)
  bytes.write('DESIGN')
  bytes.writeUInt32LE(3, 6)
  bytes.writeUInt32LE(payload.length, 12)
  bytes.set(payload, 16)
  if (bytes.length > MAX_FILE) throw new FileError(413, 'Crow file exceeds 32 MiB')
  return bytes
}
function body(record: RecordFile) {
  return Buffer.from(record.crow, 'base64')
}
function replace(record: RecordFile, bytes: Uint8Array) {
  decode(bytes)
  record.crow = Buffer.from(bytes).toString('base64')
  record.metadata.size = bytes.length
  record.metadata.checksum = hash(bytes).slice(0, 16)
  record.metadata.updatedAt = new Date().toISOString()
  record.metadata.revision++
}
function name(req: Request, fallback: string) {
  const value = new URL(req.url).searchParams.get('name') ?? req.headers.get('X-File-Name') ?? fallback
  if (!value.trim() || value.length > 512 || /[\x00-\x1f\x7f]/.test(value))
    throw new FileError(400, 'Invalid file name')
  return value
}
function key(req: Request) {
  const value = req.headers.get('Idempotency-Key')
  if (!value || !/^[a-zA-Z0-9-]{16,128}$/.test(value)) throw new FileError(400, 'Idempotency-Key is required')
  return value
}
function expected(req: Request, record: RecordFile) {
  if (req.headers.get('If-Match') !== `"${record.metadata.revision}"`)
    throw new FileError(409, 'Document revision changed')
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function nativeFiles(req: Request, user: AuthenticatedUser): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  try {
    if (path === '/api/session' && req.method === 'GET') return json({ userId: user.id })
    if (path === '/api/native-capabilities' && req.method === 'GET')
      return json({
        version: 1,
        authenticated: true,
        ownership: true,
        conditionalUpdates: true,
        durableOps: true,
        exactAcknowledgements: true,
        idempotentCreates: true,
      })
    if (path === '/api/files' && req.method === 'GET') {
      ensureDirectory()
      const files: Metadata[] = []
      for (const name of readdirSync(directory)) {
        if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue
        const record = load(name.slice(0, -5))
        if (!record.deleted && record.metadata.ownerId === user.id) files.push(metadata(record, user))
      }
      return json(files)
    }
    if (path === '/api/files' && req.method === 'POST') {
      const requestKey = key(req)
      const digest = hash(`${user.id}\0${requestKey}`)
      const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      const bytes = new Uint8Array(await req.arrayBuffer())
      decode(bytes)
      const fileName = name(req, 'Untitled.crow')
      let old: RecordFile | undefined
      try {
        old = load(id)
      } catch (error) {
        if (!(error instanceof FileError) || error.status !== 404) throw error
      }
      if (old) {
        if (
          old.metadata.ownerId !== user.id ||
          old.createKey !== requestKey ||
          old.createFingerprint !== hash(`${fileName}\0${hash(bytes)}`)
        )
          throw new FileError(409, 'Upload key already identifies another file')
        return json(metadata(old, user), 200)
      }
      const now = new Date().toISOString()
      const record: RecordFile = {
        metadata: {
          id,
          name: fileName,
          size: bytes.length,
          createdAt: now,
          updatedAt: now,
          checksum: hash(bytes).slice(0, 16),
          ownerId: user.id,
          revision: 1,
          access: 'edit',
        },
        crow: Buffer.from(bytes).toString('base64'),
        createKey: requestKey,
        createFingerprint: hash(`${fileName}\0${hash(bytes)}`),
        receipts: [],
        deleted: false,
      }
      persist(record)
      return json(metadata(record, user), 201)
    }
    const match = path.match(/^\/api\/files\/([a-f0-9-]{36})(?:\/(meta))?$/)
    if (!match) return null
    const id = match[1]!
    let record = load(id)
    const role = access(record, user)
    if (match[2] === 'meta' && req.method === 'GET') return json(metadata(record, user))
    if (match[2]) return json({ error: 'Method not allowed' }, 405)
    if (req.method === 'GET') {
      const bytes = body(record)
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bytes.length),
          ETag: `"${record.metadata.revision}"`,
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.metadata.name)}`,
        },
      })
    }
    if (req.method === 'PUT') {
      if (role !== 'edit') throw new FileError(403, 'Document is read-only')
      const bytes = new Uint8Array(await req.arrayBuffer())
      decode(bytes)
      record = load(id)
      access(record, user, true)
      expected(req, record)
      replace(record, bytes)
      record.metadata.name = name(req, record.metadata.name)
      persist(record)
      return json(metadata(record, user))
    }
    if (req.method === 'DELETE') {
      if (record.metadata.ownerId !== user.id) throw new FileError(403, 'Only the owner can delete a file')
      expected(req, record)
      record.deleted = true
      record.metadata.revision++
      persist(record)
      return new Response(null, { status: 204 })
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (error) {
    if (error instanceof FileError) return json({ error: error.message }, error.status)
    console.error('Native document storage failed', error)
    return json({ error: 'Document storage failed' }, 500)
  }
}

export function roomFile(id: string, user: AuthenticatedUser) {
  const record = load(id)
  return {
    metadata: metadata(record, user),
    ops: [],
    receipts: record.receipts.map((r) => ({
      id: r.id,
      actor: r.actor,
      fingerprint: r.fingerprint,
      revision: r.revision,
    })),
    crow: record.crow,
  }
}
function object(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function safeFields(value: unknown) {
  if (!object(value) || Object.keys(value).some((k) => ['__proto__', 'prototype', 'constructor'].includes(k)))
    throw new FileError(400, 'Invalid operation fields')
  return value
}
function layer(layers: any[], id: string): any {
  for (const item of layers) {
    if (item.id === id) return item
    if (item.type === 'group' && Array.isArray(item.children)) {
      const found = layer(item.children, id)
      if (found) return found
    }
  }
  return undefined
}
function remove(layers: any[], id: string): boolean {
  const index = layers.findIndex((l) => l.id === id)
  if (index >= 0) {
    layers.splice(index, 1)
    return true
  }
  return layers.some((l) => l.type === 'group' && Array.isArray(l.children) && remove(l.children, id))
}
export function applyOperation(root: any, op: Operation) {
  const board = root.artboards.find((b: any) => b.id === op.path[1])
  switch (op.type) {
    case 'update-document': {
      let target = root
      for (const key of op.path) {
        if (
          ['__proto__', 'constructor', 'prototype', 'artboards', 'rasterChunks'].includes(key) ||
          !object(target[key])
        )
          throw new FileError(400, 'Invalid document property path')
        target = target[key]
      }
      const fields = safeFields(op.value)
      if (op.path.length === 0 && Object.keys(fields).some((k) => ['id', 'artboards', 'rasterChunks'].includes(k)))
        throw new FileError(400, 'Invalid document update')
      Object.assign(target, fields)
      if (op.unset) {
        for (const key of op.unset) {
          if (['id', '__proto__', 'constructor', 'prototype', 'artboards', 'rasterChunks'].includes(key))
            throw new FileError(400, 'Invalid removed field')
          delete target[key]
        }
      }
      break
    }
    case 'add-artboard': {
      const value = safeFields(op.value)
      if (typeof value.id !== 'string' || !Array.isArray(value.layers)) throw new FileError(400, 'Invalid artboard')
      if (!root.artboards.some((b: any) => b.id === value.id)) root.artboards.push(value)
      break
    }
    case 'delete-artboard': {
      const i = root.artboards.findIndex((b: any) => b.id === op.path[1])
      if (i >= 0) root.artboards.splice(i, 1)
      break
    }
    case 'raster-update': {
      if (
        typeof op.chunkId !== 'string' ||
        !Array.isArray(op.data) ||
        op.data.length > 16 * 1024 * 1024 ||
        op.data.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
      )
        throw new FileError(400, 'Invalid raster update')
      if (['__proto__', 'constructor', 'prototype'].includes(op.chunkId))
        throw new FileError(400, 'Invalid raster identity')
      root.rasterChunks ??= {}
      const old = root.rasterChunks[op.chunkId] ?? {}
      const width = op.width ?? old.width
      const height = op.height ?? old.height
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        width * height * 4 !== op.data.length
      )
        throw new FileError(400, 'Invalid raster dimensions')
      root.rasterChunks[op.chunkId] = { ...old, width, height, data: Uint8Array.from(op.data) }
      break
    }
    default:
      if (!board || !Array.isArray(board.layers)) throw new FileError(409, 'Artboard is unavailable')
      switch (op.type) {
        case 'update-artboard': {
          const fields = safeFields(op.value)
          if ('id' in fields || 'layers' in fields) throw new FileError(400, 'Invalid artboard update')
          Object.assign(board, fields)
          break
        }
        case 'insert-layer': {
          const value = safeFields(op.value)
          if (typeof value.id !== 'string') throw new FileError(400, 'Invalid layer')
          if (!layer(board.layers, value.id)) board.layers.push(value)
          break
        }
        case 'delete-layer':
          remove(board.layers, op.path[3]!)
          break
        case 'update-layer': {
          const found = layer(board.layers, op.path[3]!)
          if (!found) throw new FileError(409, 'Layer is unavailable')
          let target = found
          for (const key of op.path.slice(4)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key) || !object(target[key]))
              throw new FileError(400, 'Invalid layer property path')
            target = target[key]
          }
          const fields = safeFields(op.value)
          if (op.path.length === 4 && 'id' in fields) throw new FileError(400, 'Layer identity is immutable')
          Object.assign(target, fields)
          if (op.unset) {
            if (
              !Array.isArray(op.unset) ||
              op.unset.some((k) => typeof k !== 'string' || ['id', '__proto__', 'constructor', 'prototype'].includes(k))
            )
              throw new FileError(400, 'Invalid removed field')
            for (const key of op.unset) delete target[key]
          }
          break
        }
        case 'move-layer': {
          const value = safeFields(op.value)
          if (!Number.isInteger(value.newIndex) || value.newIndex < 0)
            throw new FileError(400, 'Invalid layer position')
          const i = board.layers.findIndex((l: any) => l.id === op.path[3])
          if (i < 0) throw new FileError(409, 'Layer is unavailable')
          const [found] = board.layers.splice(i, 1)
          board.layers.splice(Math.min(value.newIndex, board.layers.length), 0, found)
          break
        }
        default:
          throw new FileError(400, 'Unsupported collaboration operation')
      }
  }
}
export function commitOperation(id: string, user: AuthenticatedUser, op: Operation, baseRevision: number) {
  const record = load(id)
  access(record, user, true)
  if (
    !op ||
    typeof op.id !== 'string' ||
    !/^[a-zA-Z0-9-]{8,128}$/.test(op.id) ||
    typeof op.clientId !== 'string' ||
    op.clientId.length > 128 ||
    !Number.isSafeInteger(op.timestamp) ||
    op.timestamp < 0 ||
    !Array.isArray(op.path) ||
    op.path.length > 16 ||
    op.path.some((p) => typeof p !== 'string' || p.length > 256)
  )
    throw new FileError(400, 'Invalid collaboration operation')
  const fingerprint = hash(JSON.stringify(op))
  const receipt = record.receipts.find((r) => r.id === op.id)
  if (receipt) {
    if (receipt.actor !== user.id || receipt.fingerprint !== fingerprint)
      throw new FileError(409, 'Operation identity was reused')
    return { revision: receipt.revision, duplicate: true }
  }
  if (baseRevision !== record.metadata.revision) throw new FileError(409, 'Document revision changed')
  if (record.receipts.length >= MAX_OPS) throw new FileError(507, 'Document operation history is full')
  const root = decode(body(record))
  applyOperation(root, op)
  replace(record, encode(root))
  record.receipts.push({ actor: user.id, fingerprint, revision: record.metadata.revision, id: op.id })
  persist(record)
  return { revision: record.metadata.revision, duplicate: false }
}
