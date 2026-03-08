import { v4 as uuid } from 'uuid'
import type { DesignDocument, Artboard, VectorLayer } from '@/types'

/**
 * Magic bytes for .afdesign format: 00 FF 4B 41
 */
const AFDESIGN_MAGIC = new Uint8Array([0x00, 0xFF, 0x4B, 0x41])

/**
 * Zstandard frame magic number
 */
const ZSTD_MAGIC = new Uint8Array([0x28, 0xB5, 0x2F, 0xFD])

/**
 * Known reversed-string tag names used in afdesign format.
 */
export const AFDESIGN_TAGS: Record<string, string> = {
  'ephS': 'Shape',
  'edoN': 'Node',
  'nsrP': 'Person',
  'tcjO': 'Object',
  'txeT': 'Text',
  'puorG': 'Group',
  'egamI': 'Image',
  'evrC': 'Curve',
  'tniP': 'Point',
  'bmyS': 'Symbol',
  'rlyL': 'Layer',
  'ICCL': 'ICC',
  'PCCI': 'ICC Profile',
  '1pOxE': 'Export',
  'cSxE': 'Export Config',
}

/**
 * Reverse a string (afdesign uses reversed tag names).
 */
export function reverseString(s: string): string {
  return s.split('').reverse().join('')
}

/**
 * Check if a buffer starts with afdesign magic bytes.
 */
export function isAfdesignFile(data: Uint8Array): boolean {
  if (data.length < 4) return false
  return data[0] === AFDESIGN_MAGIC[0] &&
         data[1] === AFDESIGN_MAGIC[1] &&
         data[2] === AFDESIGN_MAGIC[2] &&
         data[3] === AFDESIGN_MAGIC[3]
}

/**
 * Find all Zstandard compressed blocks in the file.
 */
export function findZstdBlocks(data: Uint8Array): number[] {
  const offsets: number[] = []
  for (let i = 0; i < data.length - 3; i++) {
    if (data[i] === ZSTD_MAGIC[0] &&
        data[i + 1] === ZSTD_MAGIC[1] &&
        data[i + 2] === ZSTD_MAGIC[2] &&
        data[i + 3] === ZSTD_MAGIC[3]) {
      offsets.push(i)
    }
  }
  return offsets
}

/**
 * Find reversed-string tags in decompressed data.
 */
export function findTags(data: Uint8Array): Array<{ offset: number; tag: string; decoded: string }> {
  const results: Array<{ offset: number; tag: string; decoded: string }> = []
  const text = new TextDecoder('ascii', { fatal: false }).decode(data)

  for (const [reversed, readable] of Object.entries(AFDESIGN_TAGS)) {
    let pos = 0
    while ((pos = text.indexOf(reversed, pos)) !== -1) {
      results.push({ offset: pos, tag: reversed, decoded: readable })
      pos += reversed.length
    }
  }

  return results.sort((a, b) => a.offset - b.offset)
}

/**
 * Extract basic metadata from an afdesign file header.
 */
export function parseAfdesignHeader(data: Uint8Array): {
  magic: boolean
  version: number
  zstdBlockCount: number
} {
  const magic = isAfdesignFile(data)
  // Version is typically at offset 4-7 (uint32 LE)
  let version = 0
  if (data.length >= 8) {
    version = data[4]! | (data[5]! << 8) | (data[6]! << 16) | (data[7]! << 24)
  }
  const zstdBlockCount = findZstdBlocks(data).length

  return { magic, version, zstdBlockCount }
}

/**
 * Import an afdesign file.
 * Note: Full parsing requires Zstandard decompression which needs a WASM/native module.
 * This provides the framework and parses what's possible from the raw binary.
 */
export async function importAfdesign(data: Uint8Array): Promise<DesignDocument> {
  if (!isAfdesignFile(data)) {
    throw new Error('Not a valid .afdesign file (magic bytes mismatch)')
  }

  const header = parseAfdesignHeader(data)

  // Scan for readable ASCII strings to extract metadata
  const strings = extractASCIIStrings(data, 4)

  // Try to find dimensions from common patterns
  let width = 1920
  let height = 1080
  let title = 'Affinity Import'

  // Look for filename-like strings
  for (const s of strings) {
    if (s.endsWith('.afdesign')) {
      title = s.replace('.afdesign', '')
      break
    }
  }

  const artboard: Artboard = {
    id: uuid(),
    name: title,
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor: '#ffffff',
    layers: [],
  }

  // Create a placeholder layer indicating this is a partially parsed import
  const placeholder: VectorLayer = {
    id: uuid(),
    name: `Affinity Import (${header.zstdBlockCount} compressed blocks)`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#cccccc', opacity: 1 },
    stroke: null,
  }
  artboard.layers.push(placeholder)

  return {
    id: uuid(),
    metadata: {
      title,
      author: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      colorspace: 'srgb',
      width,
      height,
    },
    artboards: [artboard],
    assets: { gradients: [], patterns: [], colors: [] },
  }
}

/**
 * Extract printable ASCII strings of minimum length from binary data.
 */
export function extractASCIIStrings(data: Uint8Array, minLength: number = 4): string[] {
  const strings: string[] = []
  let current = ''

  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!
    if (byte >= 0x20 && byte <= 0x7E) {
      current += String.fromCharCode(byte)
    } else {
      if (current.length >= minLength) {
        strings.push(current)
      }
      current = ''
    }
  }
  if (current.length >= minLength) {
    strings.push(current)
  }

  return strings
}

/**
 * Import from a File object.
 */
export async function importAfdesignFile(file: File): Promise<DesignDocument> {
  const buffer = await file.arrayBuffer()
  return importAfdesign(new Uint8Array(buffer))
}
