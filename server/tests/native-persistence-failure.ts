// SPDX-License-Identifier: LicenseRef-Proprietary
// Isolated process: fault-inject fsync without changing another test's filesystem module.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pack } from 'msgpackr'
import { mock } from 'bun:test'

const actualFs = { ...fs }
const directory = fs.mkdtempSync(join(tmpdir(), 'crossdraw-persist-fault-'))
process.env['CROSSDRAW_DATA_DIR'] = directory
const { nativeFiles } = await import('../native-files')
const { websocketHandlers } = await import('../ws')
const user = { id: '42', expiresAt: Date.now() + 60000 }
const payload = pack({
  id: 'persist-fault',
  metadata: { title: 'Fault' },
  artboards: [{ id: 'b', layers: [{ id: 'l', type: 'text', text: 'before' }] }],
})
const crow = Buffer.alloc(16 + payload.length)
crow.write('DESIGN')
crow.writeUInt32LE(3, 6)
crow.writeUInt32LE(payload.length, 12)
crow.set(payload, 16)
let a: ReturnType<typeof peer> | undefined
let b: ReturnType<typeof peer> | undefined
function peer(id: string, clientId: string) {
  const frames: any[] = []
  return {
    frames,
    data: { roomId: id, clientId, user },
    readyState: 1,
    send(value: string | ArrayBuffer | Uint8Array) {
      frames.push(JSON.parse(String(value)))
    },
    close() {},
  }
}
try {
  const response = await nativeFiles(
    new Request('http://fixture.invalid/api/files', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'persist-fault-create', 'X-File-Name': 'Fault.crow' },
      body: crow,
    }),
    user,
  )
  assert.equal(response?.status, 201, response?.status === 201 ? undefined : await response?.text())
  const metadata = (await response!.json()) as { id: string }
  a = peer(metadata.id, 'fault-a')
  b = peer(metadata.id, 'fault-b')
  websocketHandlers.open(a)
  websocketHandlers.open(b)
  a.frames.length = 0
  b.frames.length = 0
  mock.module('node:fs', () => ({
    ...actualFs,
    fsyncSync: () => {
      throw new Error('injected fsync failure')
    },
  }))
  websocketHandlers.message(
    a,
    JSON.stringify({
      type: 'op',
      baseRevision: 1,
      payload: {
        id: 'persist-fault-op',
        clientId: 'fault-a',
        timestamp: 1,
        type: 'update-layer',
        path: ['artboards', 'b', 'layers', 'l'],
        value: { text: 'must not acknowledge' },
      },
    }),
  )
  assert(a.frames.some((frame) => frame.type === 'error'))
  assert(!a.frames.some((frame) => frame.type === 'ack'))
  assert(!b.frames.some((frame) => frame.type === 'op'))
  const stored = JSON.parse(actualFs.readFileSync(join(directory, 'native-files', `${metadata.id}.json`), 'utf8'))
  assert.equal(stored.metadata.revision, 1)
  assert.equal(stored.receipts.length, 0)
} finally {
  mock.module('node:fs', () => actualFs)
  if (a) websocketHandlers.close(a)
  if (b) websocketHandlers.close(b)
  actualFs.rmSync(directory, { recursive: true, force: true })
}
console.log('persistence failure withheld ACK and broadcast')
process.exit(0)
