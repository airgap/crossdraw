// SPDX-License-Identifier: LicenseRef-Proprietary
// Clock and filesystem hooks stay in this isolated process, not the parent test runner.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pack } from 'msgpackr'
import { mock } from 'bun:test'

const actualFs = { ...fs }
const actualNow = Date.now
const actualStringify = JSON.stringify
const directory = fs.mkdtempSync(join(tmpdir(), 'crossdraw-expiry-boundary-'))
process.env['CROSSDRAW_DATA_DIR'] = directory
const { nativeFiles, roomFile } = await import('../native-files')
const { websocketHandlers } = await import('../ws')
let clock = actualNow()
Date.now = () => clock
let expireOnRead: { remaining: number; after: number } | undefined
let expireOnFsync: number | undefined
let expireOnFrame: { type: string; after: number } | undefined
mock.module('node:fs', () => ({
  ...actualFs,
  readFileSync: (...args: any[]) => {
    const result = (actualFs.readFileSync as (...args: any[]) => unknown)(...args)
    if (expireOnRead && --expireOnRead.remaining === 0) {
      clock = expireOnRead.after
      expireOnRead = undefined
    }
    return result
  },
  fsyncSync: (fd: number) => {
    actualFs.fsyncSync(fd)
    if (expireOnFsync !== undefined) {
      clock = expireOnFsync
      expireOnFsync = undefined
    }
  },
}))
JSON.stringify = ((value: any, ...args: any[]) => {
  const result = (actualStringify as (...args: any[]) => string)(value, ...args)
  if (expireOnFrame && value?.type === expireOnFrame.type) {
    clock = expireOnFrame.after
    expireOnFrame = undefined
  }
  return result
}) as typeof JSON.stringify

interface Peer {
  frames: any[]
  closed: number[]
  data: { roomId: string; clientId: string; user: { id: string; expiresAt: number } }
  readyState: number
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number): void
}
const peers: Peer[] = []
function peer(roomId: string, clientId: string, expiresAt: number): Peer {
  const frames: any[] = []
  const closed: number[] = []
  const socket: Peer = {
    frames,
    closed,
    data: { roomId, clientId, user: { id: '42', expiresAt } },
    readyState: 1,
    send(data: string | ArrayBuffer | Uint8Array) {
      frames.push(JSON.parse(String(data)))
    },
    close(code = 1000) {
      closed.push(code)
      socket.readyState = 3
    },
  }
  peers.push(socket)
  return socket
}
async function drawing(key: string) {
  const payload = pack({
    id: key,
    metadata: { title: 'Private boundary fixture' },
    artboards: [{ id: 'board', layers: [{ id: 'layer', type: 'text', text: 'before' }] }],
  })
  const crow = Buffer.alloc(16 + payload.length)
  crow.write('DESIGN')
  crow.writeUInt32LE(3, 6)
  crow.writeUInt32LE(payload.length, 12)
  crow.set(payload, 16)
  const response = await nativeFiles(
    new Request('http://fixture.invalid/api/files', {
      method: 'POST',
      headers: { 'Idempotency-Key': key, 'X-File-Name': 'Boundary.crow' },
      body: crow,
    }),
    { id: '42', expiresAt: clock + 60000 },
  )
  assert.equal(response?.status, 201)
  return ((await response!.json()) as { id: string }).id
}
function operation(id: string, clientId: string) {
  return JSON.stringify({
    type: 'op',
    baseRevision: 1,
    payload: {
      id,
      clientId,
      timestamp: 1,
      type: 'update-layer',
      path: ['artboards', 'board', 'layers', 'layer'],
      value: { text: 'private edit' },
    },
  })
}
function withheld(socket: Peer, type: string) {
  assert(!socket.frames.some((frame) => frame.type === type), `expired recipient received ${type}`)
  assert(socket.closed.includes(4001), 'expired recipient was not closed')
}
try {
  let room = await drawing('queued-upgrade-expiry')
  let deadline = clock + 50
  let socket = peer(room, 'queued-upgrade-client', deadline)
  clock = deadline + 1
  websocketHandlers.open(socket)
  withheld(socket, 'sync')

  room = await drawing('initial-read-expiry')
  deadline = clock + 50
  socket = peer(room, 'initial-read-client', deadline)
  expireOnRead = { remaining: 1, after: deadline + 1 }
  websocketHandlers.open(socket)
  assert.equal(expireOnRead, undefined)
  withheld(socket, 'sync')

  room = await drawing('initial-encoding-expiry')
  deadline = clock + 50
  socket = peer(room, 'initial-encoding-client', deadline)
  expireOnFrame = { type: 'sync', after: deadline + 1 }
  websocketHandlers.open(socket)
  assert.equal(expireOnFrame, undefined)
  withheld(socket, 'sync')

  room = await drawing('quiet-read-expiry')
  deadline = clock + 50
  const sender = peer(room, 'quiet-live-client', clock + 60000)
  const quiet = peer(room, 'quiet-short-client', deadline)
  websocketHandlers.open(sender)
  websocketHandlers.open(quiet)
  sender.frames.length = 0
  quiet.frames.length = 0
  // Sender room read, commit record read, then the quiet recipient's outgoing access read.
  expireOnRead = { remaining: 3, after: deadline + 1 }
  websocketHandlers.message(sender, operation('quiet-read-operation', sender.data.clientId))
  assert.equal(expireOnRead, undefined)
  withheld(quiet, 'op')
  assert(sender.frames.some((frame) => frame.type === 'ack' && frame.payload.durable))

  room = await drawing('requested-sync-expiry')
  deadline = clock + 50
  socket = peer(room, 'requested-sync-client', deadline)
  websocketHandlers.open(socket)
  socket.frames.length = 0
  expireOnRead = { remaining: 2, after: deadline + 1 }
  websocketHandlers.message(socket, JSON.stringify({ type: 'sync' }))
  assert.equal(expireOnRead, undefined)
  withheld(socket, 'sync')

  room = await drawing('ack-fsync-expiry')
  deadline = clock + 50
  socket = peer(room, 'ack-fsync-client', deadline)
  websocketHandlers.open(socket)
  socket.frames.length = 0
  expireOnFsync = deadline + 1
  websocketHandlers.message(socket, operation('ack-fsync-operation', socket.data.clientId))
  assert.equal(expireOnFsync, undefined)
  withheld(socket, 'ack')
  const stored = roomFile(room, { id: '42', expiresAt: clock + 60000 })
  assert.equal(stored.metadata.revision, 2)
  assert.equal(stored.receipts.length, 1, 'committed outcome remains recoverable by exact duplicate replay')

  room = await drawing('ack-encoding-expiry')
  deadline = clock + 50
  socket = peer(room, 'ack-encoding-client', deadline)
  websocketHandlers.open(socket)
  socket.frames.length = 0
  expireOnFrame = { type: 'ack', after: deadline + 1 }
  websocketHandlers.message(socket, operation('ack-encoding-operation', socket.data.clientId))
  assert.equal(expireOnFrame, undefined)
  withheld(socket, 'ack')
  room = await drawing('error-encoding-expiry')
  deadline = clock + 50
  socket = peer(room, 'error-encoding-client', deadline)
  websocketHandlers.open(socket)
  socket.frames.length = 0
  expireOnFrame = { type: 'error', after: deadline + 1 }
  websocketHandlers.message(socket, JSON.stringify({ type: 'unsupported' }))
  assert.equal(expireOnFrame, undefined)
  withheld(socket, 'error')
} finally {
  expireOnRead = undefined
  expireOnFsync = undefined
  expireOnFrame = undefined
  mock.module('node:fs', () => actualFs)
  JSON.stringify = actualStringify
  Date.now = actualNow
  for (const socket of peers) websocketHandlers.close(socket)
  actualFs.rmSync(directory, { recursive: true, force: true })
}
console.log('expiry boundaries withheld initial, broadcast, sync, ACK and error frames')
process.exit(0)
