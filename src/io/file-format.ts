import { pack, unpack } from 'msgpackr'
import type { DesignDocument } from '@/types'
import { collectRasterChunks, restoreRasterChunks } from '@/store/raster-data'
import { migrateData, canMigrate } from '@/io/migrations'

const MAGIC = 'DESIGN'
const FORMAT_VERSION = 3

/**
 * Encode a DesignDocument to a .crow binary buffer.
 *
 * Layout:
 *   [6 bytes] magic "DESIGN"
 *   [4 bytes] version (u32 LE)
 *   [1 byte]  flags
 *   [1 byte]  reserved
 *   [4 bytes] payload length (u32 LE)
 *   [N bytes] MessagePack payload
 *
 * Zstandard compression is deferred until we validate the round-trip
 * without it first (will add in a follow-up).
 */
export function encodeDocument(doc: DesignDocument): ArrayBuffer {
  const serializable = prepareForSerialization(doc)
  const payload = pack(serializable)

  const headerSize = 6 + 4 + 1 + 1 + 4 // magic + version + flags + reserved + payloadLen
  const buffer = new ArrayBuffer(headerSize + payload.byteLength)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // Magic
  for (let i = 0; i < MAGIC.length; i++) {
    bytes[i] = MAGIC.charCodeAt(i)
  }

  // Version (u32 LE)
  view.setUint32(6, FORMAT_VERSION, true)

  // Flags (u8) — 0 for now (no compression)
  view.setUint8(10, 0)

  // Reserved
  view.setUint8(11, 0)

  // Payload length (u32 LE)
  view.setUint32(12, payload.byteLength, true)

  // Payload
  bytes.set(payload, headerSize)

  return buffer
}

/**
 * Decode a .crow binary buffer back to a DesignDocument.
 */
export function decodeDocument(buffer: ArrayBuffer): DesignDocument {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // Verify magic
  const magic = String.fromCharCode(...bytes.slice(0, 6))
  if (magic !== MAGIC) {
    throw new Error(`Invalid .crow file: bad magic "${magic}"`)
  }

  // Version
  const version = view.getUint32(6, true)
  if (version > FORMAT_VERSION) {
    throw new Error(`Unsupported .crow version ${version} (max supported: ${FORMAT_VERSION})`)
  }

  // Flags
  // const flags = view.getUint8(10) — reserved for future use

  // Payload
  const payloadLength = view.getUint32(12, true)
  const headerSize = 16
  const payloadBytes = bytes.slice(headerSize, headerSize + payloadLength)
  let raw = unpack(payloadBytes) as Record<string, unknown>

  // Basic schema validation
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid .crow file: payload is not an object')
  }
  if (typeof raw.id !== 'string') {
    throw new Error('Invalid .crow file: missing required field "id" (string)')
  }
  if (!raw.metadata || typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
    throw new Error('Invalid .crow file: missing required field "metadata" (object)')
  }
  if (!Array.isArray(raw.artboards)) {
    throw new Error('Invalid .crow file: missing required field "artboards" (array)')
  }

  // Apply migrations if needed
  if (version < FORMAT_VERSION) {
    if (!canMigrate(version, FORMAT_VERSION)) {
      throw new Error(`Cannot migrate .crow file from version ${version} to ${FORMAT_VERSION}`)
    }
    raw = migrateData(raw, version, FORMAT_VERSION)
  }

  // Restore raster chunks into the data store
  if (raw.rasterChunks && typeof raw.rasterChunks === 'object') {
    restoreRasterChunks(raw.rasterChunks as Record<string, { width: number; height: number; data: Uint8Array }>)
    delete raw.rasterChunks
  }

  return raw as unknown as DesignDocument
}

/**
 * Prepare document for serialization. Includes raster chunk data
 * from the separate pixel store alongside the document metadata.
 */
function prepareForSerialization(doc: DesignDocument): unknown {
  // Collect raster pixel data from the external store
  const rasterChunks = collectRasterChunks(doc)

  const cleaned = JSON.parse(
    JSON.stringify(doc, (_key, value) => {
      if (typeof ImageData !== 'undefined' && value instanceof ImageData) {
        return { __type: 'ImageData', width: value.width, height: value.height }
      }
      return value
    }),
  )

  if (Object.keys(rasterChunks).length > 0) {
    cleaned.rasterChunks = rasterChunks
  }

  return cleaned
}
