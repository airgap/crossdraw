import { describe, test, expect } from 'bun:test'
import { encodeDocument, decodeDocument } from '@/io/file-format'
import type { DesignDocument } from '@/types'

function createMinimalDoc(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    id: 'test-doc',
    metadata: {
      title: 'Test',
      author: '',
      created: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      colorspace: 'srgb',
      width: 100,
      height: 100,
    },
    artboards: [
      {
        id: 'ab-1',
        name: 'Main',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        backgroundColor: '#ffffff',
        layers: [],
      },
    ],
    assets: { gradients: [], patterns: [], colors: [] },
    ...overrides,
  }
}

// ── Tests for uncovered lines ──

describe('file-format-coverage: schema validation (lines 84-95)', () => {
  test('rejects payload that is not an object (null)', () => {
    // Create a valid header but with null payload
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const bytes = new Uint8Array(encoded)

    // Tamper with the payload to be msgpack null
    // We need to create a buffer with valid header but invalid payload
    // msgpack null is 0xc0
    const headerSize = 16
    const tamperedLen = 1
    const tampered = new ArrayBuffer(headerSize + tamperedLen)
    const tBytes = new Uint8Array(tampered)
    const tView = new DataView(tampered)

    // Copy magic
    tBytes.set(bytes.slice(0, 6), 0)
    // Version
    tView.setUint32(6, 2, true)
    // Flags
    tView.setUint8(10, 0)
    // Reserved
    tView.setUint8(11, 0)
    // Payload length
    tView.setUint32(12, tamperedLen, true)
    // null payload
    tBytes[16] = 0xc0

    expect(() => decodeDocument(tampered)).toThrow('payload is not an object')
  })

  test('rejects payload missing id field', () => {
    // We can test this by creating a valid encoded doc and tampering
    // Or by encoding a minimal object directly
    // Let's build a crafted buffer
    const { pack } = require('msgpackr')

    const payload = pack({ metadata: { title: 'X' }, artboards: [] })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    // Magic
    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "id"')
  })

  test('rejects payload missing metadata field', () => {
    const { pack } = require('msgpackr')

    const payload = pack({ id: 'test', artboards: [] })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "metadata"')
  })

  test('rejects payload missing artboards field', () => {
    const { pack } = require('msgpackr')

    const payload = pack({ id: 'test', metadata: { title: 'X' } })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "artboards"')
  })

  test('rejects payload where metadata is an array', () => {
    const { pack } = require('msgpackr')

    const payload = pack({ id: 'test', metadata: [1, 2, 3], artboards: [] })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "metadata"')
  })

  test('rejects payload where artboards is not an array', () => {
    const { pack } = require('msgpackr')

    const payload = pack({ id: 'test', metadata: { title: 'X' }, artboards: 'not-array' })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "artboards"')
  })

  test('rejects payload where id is not a string', () => {
    const { pack } = require('msgpackr')

    const payload = pack({ id: 123, metadata: { title: 'X' }, artboards: [] })
    const headerSize = 16
    const buffer = new ArrayBuffer(headerSize + payload.byteLength)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)

    const magic = 'DESIGN'
    for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i)
    view.setUint32(6, 2, true)
    view.setUint8(10, 0)
    view.setUint8(11, 0)
    view.setUint32(12, payload.byteLength, true)
    bytes.set(payload, headerSize)

    expect(() => decodeDocument(buffer)).toThrow('missing required field "id"')
  })
})

describe('file-format-coverage: version migration (lines 98-103)', () => {
  test('migrates version 1 to version 2 on decode', () => {
    // Create a valid v2 document, encode it, then tamper the version to 1
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)

    // Tamper version to 1
    const view = new DataView(encoded)
    view.setUint32(6, 1, true)

    // Should successfully decode (migration from v1 to v2 is registered)
    const decoded = decodeDocument(encoded)
    expect(decoded.id).toBe('test-doc')
  })

  test('rejects version that cannot be migrated', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)

    // Set version to 0 (no migration from 0)
    const view = new DataView(encoded)
    view.setUint32(6, 0, true)

    expect(() => decodeDocument(encoded)).toThrow('Cannot migrate')
  })
})

describe('file-format-coverage: prepareForSerialization (line 125)', () => {
  test('round-trip preserves all document fields', () => {
    const doc = createMinimalDoc({
      artboards: [
        {
          id: 'ab-1',
          name: 'Main',
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          backgroundColor: '#f0f0f0',
          layers: [
            {
              id: 'l1',
              name: 'Rect',
              type: 'vector',
              visible: true,
              locked: false,
              opacity: 0.9,
              blendMode: 'multiply',
              transform: { x: 10, y: 20, scaleX: 1.5, scaleY: 1.5, rotation: 30 },
              effects: [],
              paths: [
                {
                  id: 'p1',
                  segments: [
                    { type: 'move', x: 0, y: 0 },
                    { type: 'line', x: 100, y: 0 },
                    { type: 'line', x: 100, y: 100 },
                    { type: 'close' },
                  ],
                  closed: true,
                },
              ],
              fill: { type: 'solid', color: '#ff0000', opacity: 0.8 },
              stroke: {
                width: 2,
                color: '#000000',
                opacity: 1,
                position: 'center',
                linecap: 'round',
                linejoin: 'bevel',
                miterLimit: 4,
                dasharray: [5, 3],
              },
            },
          ],
        },
      ],
    })

    const encoded = encodeDocument(doc)
    const decoded = decodeDocument(encoded)

    expect(decoded.id).toBe(doc.id)
    expect(decoded.metadata).toEqual(doc.metadata)
    const layer = decoded.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.opacity).toBe(0.9)
      expect(layer.blendMode).toBe('multiply')
      expect(layer.transform).toEqual(doc.artboards[0]!.layers[0]!.transform)
      expect(layer.stroke?.dasharray).toEqual([5, 3])
    }
  })

  test('empty document round-trips', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const decoded = decodeDocument(encoded)
    expect(decoded.artboards[0]!.layers).toHaveLength(0)
  })

  test('document with gradients and colors round-trips', () => {
    const doc = createMinimalDoc({
      assets: {
        gradients: [
          {
            id: 'g1',
            name: 'Grad',
            type: 'linear',
            angle: 45,
            x: 0,
            y: 0,
            stops: [
              { offset: 0, color: '#ff0000', opacity: 1 },
              { offset: 1, color: '#0000ff', opacity: 1 },
            ],
            dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
          },
        ],
        patterns: [],
        colors: [{ id: 'c1', name: 'Red', value: '#ff0000' }],
      },
    })

    const encoded = encodeDocument(doc)
    const decoded = decodeDocument(encoded)
    expect(decoded.assets.gradients).toHaveLength(1)
    expect(decoded.assets.colors).toHaveLength(1)
  })
})

describe('file-format-coverage: header constants', () => {
  test('encoded header starts with DESIGN magic', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const bytes = new Uint8Array(encoded)
    const magic = String.fromCharCode(...bytes.slice(0, 6))
    expect(magic).toBe('DESIGN')
  })

  test('version is 3', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const view = new DataView(encoded)
    expect(view.getUint32(6, true)).toBe(3)
  })

  test('flags byte is 0', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const view = new DataView(encoded)
    expect(view.getUint8(10)).toBe(0)
  })

  test('payload length is correct', () => {
    const doc = createMinimalDoc()
    const encoded = encodeDocument(doc)
    const view = new DataView(encoded)
    const payloadLen = view.getUint32(12, true)
    expect(encoded.byteLength).toBe(16 + payloadLen)
  })
})
