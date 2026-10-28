// SPDX-License-Identifier: LicenseRef-Proprietary
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pack, unpack } from 'msgpackr'

let keys: CryptoKeyPair
let publicKey: JsonWebKey
let jwks: ReturnType<typeof Bun.serve>
let processServer: ReturnType<typeof Bun.spawn>
let origin: string
let tokenA: string
let tokenB: string
let temporary: string
const user = '42'
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
async function jwt(sub: string, extra: Record<string, unknown> = {}) {
  const header = base64(Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture-key' })))
  const claims = base64(
    Buffer.from(
      JSON.stringify({
        sub,
        iss: 'https://lyku.org',
        aud: 'crossdraw',
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...extra,
      }),
    ),
  )
  const message = `${header}.${claims}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(message))
  return `${message}.${base64(new Uint8Array(signature))}`
}
function crow() {
  const raw = {
    id: 'native-fixture',
    metadata: { title: 'Test' },
    artboards: [{ id: 'board-a', layers: [{ id: 'layer-a', type: 'text', text: 'before', opaque: { keep: 'yes' } }] }],
    rasterChunks: { chunk: { width: 1, height: 1, data: Uint8Array.from([1, 2, 3, 255]), unknown: 'preserve' } },
    unknown: { bytes: Uint8Array.from([9, 8, 7]) },
  }
  const payload = pack(raw)
  const bytes = Buffer.alloc(16 + payload.length)
  bytes.write('DESIGN')
  bytes.writeUInt32LE(3, 6)
  bytes.writeUInt32LE(payload.length, 12)
  bytes.set(payload, 16)
  return bytes
}
function auth(token = tokenA) {
  return { Authorization: `Bearer ${token}` }
}
async function upload(key = 'create-fixture-0001') {
  const response = await fetch(`${origin}/api/files`, {
    method: 'POST',
    headers: {
      ...auth(),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': 'Native.crow',
      'Idempotency-Key': key,
    },
    body: crow(),
  })
  expect(response.status).toBe(201)
  return (await response.json()) as any
}
async function startServer() {
  const port = Number(new URL(origin).port)
  processServer = Bun.spawn({
    cmd: ['parabun', 'server/main.ts', '--host', '127.0.0.1', '--port', String(port)],
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin',
      CROSSDRAW_API_KEY: 'fixture-legacy-key',
      CROSSDRAW_JWKS_URL: `http://127.0.0.1:${jwks.port}`,
      CROSSDRAW_DATA_DIR: temporary,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  void new Response(processServer.stdout as ReadableStream).text()
  void new Response(processServer.stderr as ReadableStream).text()
  let ready = false
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${origin}/health`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await Bun.sleep(20)
  }
  if (!ready) throw new Error('Owned fixture server did not become ready')
}
beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'crossdraw-native-'))
  keys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.from([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey)
  jwks = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ keys: [{ ...publicKey, kid: 'fixture-key', alg: 'RS256' }] }),
  })
  const reserve = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('reserved') })
  const port = reserve.port!
  reserve.stop(true)
  origin = `http://127.0.0.1:${port}`
  await startServer()
  tokenA = await jwt('42')
  tokenB = await jwt('43')
})
afterAll(async () => {
  processServer?.kill()
  if (processServer) await processServer.exited
  jwks?.stop(true)
  if (temporary) rmSync(temporary, { recursive: true, force: true })
})
test('actual HTTP server rejects forged/missing JWT claims and account mismatches', async () => {
  for (const token of [
    'forged',
    await jwt(user, { exp: undefined }),
    await jwt(user, { iss: undefined }),
    await jwt(user, { aud: undefined }),
    await jwt(user, { aud: 'other-app' }),
    await jwt(user, { exp: Math.floor(Date.now() / 1000) - 1 }),
  ]) {
    expect((await fetch(`${origin}/api/files`, { headers: auth(token) })).status).toBe(401)
  }
  const session = await fetch(`${origin}/api/session`, { headers: auth() })
  expect(session.status).toBe(200)
  expect(await session.json()).toEqual({ userId: '42' })
  expect((await fetch(`${origin}/api/files`)).status).toBe(401)
})
test('file ownership, conditional updates and create receipts hold through actual REST', async () => {
  const metadata = await upload()
  expect(metadata.ownerId).toBe('42')
  const duplicate = await fetch(`${origin}/api/files`, {
    method: 'POST',
    headers: { ...auth(), 'X-File-Name': 'Native.crow', 'Idempotency-Key': 'create-fixture-0001' },
    body: crow(),
  })
  expect(duplicate.status).toBe(200)
  expect(((await duplicate.json()) as any).id).toBe(metadata.id)
  const privateList = await fetch(`${origin}/api/files`, { headers: auth(tokenB) })
  expect(await privateList.json()).toEqual([])
  for (const method of ['GET', 'PUT', 'DELETE'])
    expect(
      (
        await fetch(`${origin}/api/files/${metadata.id}`, {
          method,
          headers: auth(tokenB),
          ...(method === 'PUT' ? { body: crow() } : {}),
        })
      ).status,
    ).toBe(403)
  const first = await fetch(`${origin}/api/files/${metadata.id}`, {
    method: 'PUT',
    headers: { ...auth(), 'If-Match': '"1"' },
    body: crow(),
  })
  expect(first.status).toBe(200)
  const stale = await fetch(`${origin}/api/files/${metadata.id}`, {
    method: 'PUT',
    headers: { ...auth(), 'If-Match': '"1"' },
    body: crow(),
  })
  expect(stale.status).toBe(409)
  expect((await fetch(`${origin}/api/libraries`, { headers: auth() })).status).toBe(403)
})
function socket(id: string, token: string, client: string) {
  return new WebSocket(
    `${origin.replace('http:', 'ws:')}/ws?room=${id}&client=${client}&token=${encodeURIComponent(token)}`,
  )
}
function next(ws: WebSocket, filter: (value: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', message)
      reject(new Error('Fixture websocket event timed out'))
    }, 3000)
    function message(event: MessageEvent) {
      const value = JSON.parse(String(event.data))
      if (filter(value)) {
        clearTimeout(timeout)
        ws.removeEventListener('message', message)
        resolve(value)
      }
    }
    ws.addEventListener('message', message)
  })
}
test('authorized rooms persist exact op acknowledgements and unknown/raster bytes; unrelated account cannot join', async () => {
  const metadata = await upload('create-fixture-room-01')
  const denied = socket(metadata.id, tokenB, 'client-denied')
  await new Promise<void>((resolve) => {
    denied.onerror = () => resolve()
    denied.onclose = () => resolve()
  })
  expect(denied.readyState).not.toBe(WebSocket.OPEN)
  const a = socket(metadata.id, tokenA, 'client-native-a')
  const initial = await next(a, (v) => v.type === 'sync')
  expect(initial.payload.metadata.revision).toBe(1)
  const b = socket(metadata.id, tokenA, 'client-native-b')
  await next(b, (v) => v.type === 'sync')
  const op = {
    id: 'operation-native-001',
    clientId: 'client-native-a',
    timestamp: 1,
    type: 'update-layer',
    path: ['artboards', 'board-a', 'layers', 'layer-a'],
    value: { text: 'after' },
  }
  const observed = next(b, (v) => v.type === 'op')
  const acknowledged = next(a, (v) => v.type === 'ack')
  a.send(JSON.stringify({ type: 'op', payload: op, baseRevision: 1 }))
  expect((await observed).payload).toEqual(op)
  expect((await acknowledged).payload).toEqual({ opId: op.id, revision: 2, durable: true })
  const replay = next(a, (v) => v.type === 'ack')
  a.send(JSON.stringify({ type: 'op', payload: op, baseRevision: 1 }))
  expect((await replay).payload.revision).toBe(2)
  const downloaded = Buffer.from(
    await (await fetch(`${origin}/api/files/${metadata.id}`, { headers: auth() })).arrayBuffer(),
  )
  const root = unpack(downloaded.subarray(16))
  expect(root.artboards[0].layers[0].text).toBe('after')
  expect(root.artboards[0].layers[0].opaque.keep).toBe('yes')
  expect(Array.from(root.rasterChunks.chunk.data)).toEqual([1, 2, 3, 255])
  expect(Array.from(root.unknown.bytes)).toEqual([9, 8, 7])
  const conflict = next(a, (v) => v.type === 'error')
  a.send(
    JSON.stringify({
      type: 'op',
      payload: { ...op, id: 'operation-native-002', value: { text: 'stale' } },
      baseRevision: 1,
    }),
  )
  expect((await conflict).payload.status).toBe(409)
  a.close()
  b.close()
  const reopened = socket(metadata.id, tokenA, 'client-native-c')
  const restored = await next(reopened, (v) => v.type === 'sync')
  expect(restored.payload.receipts[0].id).toBe(op.id)
  expect(restored.payload.metadata.revision).toBe(2)
  reopened.close()
})

test('durable document and exact receipt survive owned server process restart', async () => {
  const metadata = await upload('create-fixture-restart-01')
  const ws = socket(metadata.id, tokenA, 'client-restart-a')
  await next(ws, (v) => v.type === 'sync')
  const op = {
    id: 'operation-restart-001',
    clientId: 'client-restart-a',
    timestamp: 2,
    type: 'update-layer',
    path: ['artboards', 'board-a', 'layers', 'layer-a'],
    value: { text: 'durable' },
  }
  const receipt = next(ws, (v) => v.type === 'ack')
  ws.send(JSON.stringify({ type: 'op', payload: op, baseRevision: 1 }))
  await receipt
  ws.close()
  processServer.kill()
  await processServer.exited
  await startServer()
  const reopened = socket(metadata.id, tokenA, 'client-restart-a')
  const sync = await next(reopened, (v) => v.type === 'sync')
  expect(sync.payload.metadata.revision).toBe(2)
  expect(sync.payload.receipts[0].id).toBe(op.id)
  const ack = next(reopened, (v) => v.type === 'ack')
  reopened.send(JSON.stringify({ type: 'op', payload: op, baseRevision: 1 }))
  expect((await ack).payload.revision).toBe(2)
  reopened.close()
  const bytes = Buffer.from(
    await (await fetch(`${origin}/api/files/${metadata.id}`, { headers: auth() })).arrayBuffer(),
  )
  expect(unpack(bytes.subarray(16)).artboards[0].layers[0].text).toBe('durable')
})
